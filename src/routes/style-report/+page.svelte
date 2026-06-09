<script lang="ts">
  import { createSupabaseBrowserClient } from '$lib/supabase';
  import { page } from '$app/stores';
  import StyleReportView from '$lib/StyleReportView.svelte';

  let { data } = $props();
  const supabase = createSupabaseBrowserClient();
  const accountId = data.accountId;

  const STYLES = [
    'Classic / Timeless', 'Minimalist', 'Streetwear', 'Old Money / Quiet Luxury', 'Smart Casual',
    'Formal / Tailored', 'Black-tie / Tuxedo', 'Business', 'Athleisure / Sporty', 'Y2K',
    'Vintage / Retro', 'Bohemian', 'Grunge', 'Preppy', 'Nerdy / Geek-chic', 'Edgy / Punk',
    'Techwear', 'Normcore', 'Avant-garde', 'Cottagecore', 'Coastal / Resort', 'Western',
    'Gorpcore / Outdoor', 'Romantic / Date-night', 'Festival',
  ];
  const DEFAULT_OCCASIONS = ['College / School', 'Work', 'Business', 'Casual everyday', 'Outdoors', 'Nightlife', 'Events / Formal', 'Gym / Active'];

  // ── Stages: intro -> questionnaire steps -> generating -> done (free beta) ──
  type Stage = 'intro' | 'form' | 'generating' | 'done';
  let stage = $state<Stage>('intro');
  let step  = $state(0);                 // form step 0..5
  const TOTAL = 6;

  // Answers
  let gender   = $state<string | null>(null);
  let occasionList = $state<string[]>([...DEFAULT_OCCASIONS]);
  let occasions = $state<string[]>([]);
  let newOccasion = $state('');
  let goal     = $state('');
  let height   = $state<number>(170);
  let vibe     = $state<string | null>(null);
  let styles   = $state<string[]>([]);

  // Photos
  let closeB64 = $state<string | null>(null); let closeType = $state('');
  let fullB64  = $state<string | null>(null); let fullType  = $state('');
  let photoErr = $state('');

  let err = $state('');
  let report   = $state<any>(null);

  const toggle = (l: string[], v: string) => l.includes(v) ? l.filter(x => x !== v) : [...l, v];
  const cmToFtIn = (cm: number) => { const i = Math.round(cm / 2.54); return `${Math.floor(i/12)}'${i%12}"`; };

  function addOccasion() {
    const v = newOccasion.trim();
    if (!v) return;
    if (!occasionList.includes(v)) occasionList = [...occasionList, v];
    if (!occasions.includes(v)) occasions = [...occasions, v];
    newOccasion = '';
  }

  function readFile(e: Event, which: 'close' | 'full') {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) { photoErr = 'Only JPG and PNG images are supported.'; input.value = ''; return; }
    photoErr = '';
    const r = new FileReader();
    r.onload = () => {
      const b64 = (r.result as string).split(',')[1];
      if (which === 'close') { closeB64 = b64; closeType = file.type; } else { fullB64 = b64; fullType = file.type; }
    };
    r.readAsDataURL(file);
  }

  const canNext = $derived(
    step === 0 ? !!gender :
    step === 1 ? occasions.length > 0 :
    step === 2 ? true :
    step === 3 ? !!vibe :
    step === 4 ? styles.length > 0 :
    step === 5 ? (!!closeB64 && !!fullB64) :
    true
  );

  async function uploadPhoto(b64: string, type: string, label: string): Promise<string> {
    const ext = (type.split('/')[1] ?? 'jpg').replace('jpeg', 'jpg');
    const path = `style-reports/${accountId}/${Date.now()}-${label}.${ext}`;
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const { error: upErr } = await supabase.storage.from('profile_images').upload(path, bytes, { contentType: type, upsert: true });
    if (upErr) throw upErr;
    const { data: signed } = await supabase.storage.from('profile_images').createSignedUrl(path, 1800);
    if (!signed?.signedUrl) throw new Error('signed url failed');
    return signed.signedUrl;
  }

  // Loading messages
  const LOADING = ['Reading your photos…', 'Analysing your skin tone…', 'Mapping your face shape…', 'Crafting your colours…', 'Coming up with style suggestions…', 'Finishing your report…'];
  let loadingMsg = $state(LOADING[0]);
  let loadingTimer: ReturnType<typeof setInterval> | null = null;

  async function createReport() {
    stage = 'generating'; err = '';
    let i = 0; loadingMsg = LOADING[0];
    loadingTimer = setInterval(() => { i = (i + 1) % LOADING.length; loadingMsg = LOADING[i]; }, 2500);
    try {
      const closeUrl = await uploadPhoto(closeB64!, closeType, 'closeup');
      const fullUrl  = await uploadPhoto(fullB64!, fullType, 'fullbody');

      const { data: row, error: insErr } = await supabase.from('style_report').insert({
        account_id: accountId,
        gender, height_cm: height, vibe, occasions, goal: goal.trim() || null,
        selected_styles: styles, close_up_url: closeUrl, full_body_url: fullUrl,
        status: 'generating',
      }).select('id').single();
      if (insErr || !row) throw new Error(insErr?.message ?? 'Could not start report');

      const { data: res, error: fnErr } = await supabase.functions.invoke('style_report_creator', { body: { style_report_id: row.id } });
      if (fnErr) throw fnErr;
      if (!res?.success) throw new Error(res?.error || 'Generation failed');

      const { data: full } = await supabase.from('style_report').select('*').eq('id', row.id).single();
      report = full;
      stage = 'done';
    } catch (e: any) {
      err = e?.message ?? 'Something went wrong creating your report. Please try again.';
      stage = 'form';
    } finally {
      if (loadingTimer) clearInterval(loadingTimer);
    }
  }

</script>

<svelte:head>
  <title>Create your Style Report - Aloura</title>
  <link rel="canonical" href="{$page.url.origin}/style-report" />
</svelte:head>

<div class="srp">
  <div class="srp__card">

    {#if stage === 'intro'}
      <span class="srp__beta">Beta · still in review</span>
      <h1 class="srp__title">Discover exactly what suits <em>you.</em></h1>
      <p class="srp__lead">A full, detailed analysis of the styles, colours and details that work best for you - and it plugs straight into every outfit and recommendation you get on Aloura.</p>
      <ul class="srp__bullets">
        <li><i class="fas fa-palette"></i> Your colour intelligence - best colours + ones to avoid</li>
        <li><i class="fas fa-glasses"></i> Eyewear frames matched to your face shape</li>
        <li><i class="fas fa-gem"></i> Accessories - metals, chains & earrings that suit you</li>
        <li><i class="fas fa-shirt"></i> The styles that fit you best + your signature style</li>
        <li><i class="fas fa-wand-magic-sparkles"></i> Woven into all your future boards & outfit picks</li>
      </ul>
      <p class="srp__pitch">Not just AI. Aloura's style engine is built on extensive styling best-practices and real data - it picks colours and styles based on who you actually are.</p>
      <button class="srp__cta" onclick={() => stage = 'form'}>Start my report <i class="fas fa-arrow-right"></i></button>
      <p class="srp__price-hint"><b>Free</b> while in beta · we'd love your feedback</p>
    {/if}

    {#if stage === 'form'}
      <div class="srp__progress">{#each Array(TOTAL) as _, i}<div class="srp__dot" class:on={i <= step}></div>{/each}</div>
      {#if err}<p class="srp__err">{err}</p>{/if}

      {#if step === 0}
        <h2 class="srp__q">Who are we styling?</h2>
        <div class="srp__chips">
          {#each ['Men\'s', 'Women\'s', 'Other'] as g}
            <button class="chip" class:on={gender === g} onclick={() => gender = g}>{g}</button>
          {/each}
        </div>
      {:else if step === 1}
        <h2 class="srp__q">What do you mostly dress for?</h2>
        <p class="srp__sub">Pick all that apply - add your own too.</p>
        <div class="srp__chips">
          {#each occasionList as o}<button class="chip" class:on={occasions.includes(o)} onclick={() => occasions = toggle(occasions, o)}>{o}</button>{/each}
        </div>
        <div class="srp__add">
          <input class="srp__input" placeholder="Add another…" bind:value={newOccasion} onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOccasion(); } }} />
          <button class="srp__add-btn" onclick={addOccasion}>Add</button>
        </div>
        <label class="srp__label" for="goal">When you get dressed, what's the goal? (optional)</label>
        <textarea id="goal" class="srp__textarea" rows="2" bind:value={goal} placeholder="e.g. look put-together but effortless, feel confident…"></textarea>
      {:else if step === 2}
        <h2 class="srp__q">How tall are you?</h2>
        <p class="srp__big">{height} cm · {cmToFtIn(height)}</p>
        <input class="srp__range" type="range" min="140" max="210" bind:value={height} />
      {:else if step === 3}
        <h2 class="srp__q">How do you like to come across?</h2>
        <div class="srp__chips">
          {#each ['Bold', 'Neutral', 'Calm'] as v}<button class="chip" class:on={vibe === v} onclick={() => vibe = v}>{v}</button>{/each}
        </div>
      {:else if step === 4}
        <h2 class="srp__q">Which styles resonate with you?</h2>
        <p class="srp__sub">Pick whatever speaks to you - no wrong answers.</p>
        <div class="srp__chips srp__chips--wrap">
          {#each STYLES as s}<button class="chip" class:on={styles.includes(s)} onclick={() => styles = toggle(styles, s)}>{s}</button>{/each}
        </div>
      {:else if step === 5}
        <h2 class="srp__q">Two quick photos</h2>
        <p class="srp__sub">A clear close-up of your face and one full-body shot. JPG or PNG.</p>
        {#if photoErr}<p class="srp__err">{photoErr}</p>{/if}
        <div class="srp__uploads">
          <label class="srp__upload" class:filled={closeB64}>
            {#if closeB64}<img src={`data:${closeType};base64,${closeB64}`} alt="close up" />{:else}<i class="fas fa-camera"></i><span>Close-up</span>{/if}
            <input type="file" accept="image/jpeg,image/png" style="display:none" onchange={(e) => readFile(e, 'close')} />
          </label>
          <label class="srp__upload" class:filled={fullB64}>
            {#if fullB64}<img src={`data:${fullType};base64,${fullB64}`} alt="full body" />{:else}<i class="fas fa-user"></i><span>Full body</span>{/if}
            <input type="file" accept="image/jpeg,image/png" style="display:none" onchange={(e) => readFile(e, 'full')} />
          </label>
        </div>
      {/if}

      <div class="srp__nav">
        {#if step > 0}<button class="srp__back" onclick={() => step -= 1}>Back</button>{/if}
        {#if step < TOTAL - 1}
          <button class="srp__next" onclick={() => step += 1} disabled={!canNext}>Next</button>
        {:else}
          <button class="srp__next" onclick={createReport} disabled={!canNext}>Create my style for me</button>
        {/if}
      </div>
    {/if}

    {#if stage === 'generating'}
      <div class="srp__loading">
        <div class="srp__spinner"></div>
        <p class="srp__loading-msg">{loadingMsg}</p>
        <p class="srp__loading-sub">This usually takes under a minute - hang tight.</p>
      </div>
    {/if}

    {#if stage === 'done' && report}
      <div class="srp__done-head">
        <span class="srp__beta">Beta · still in review</span>
        <h2 class="srp__title">Your Style Report</h2>
        <p class="srp__lead">Saved to your profile and now powering your recommendations. This feature is in beta and still being refined - your feedback shapes it.</p>
      </div>
      <StyleReportView {report} />
      <div class="srp__done-actions">
        <a href="/feedback" class="srp__cta">Give us feedback</a>
        <a href="/account" class="srp__cta srp__cta--ghost">View on my profile</a>
      </div>
    {/if}

  </div>
</div>

<style>
  .srp { min-height: 100vh; padding: calc(var(--nav-h) + var(--space-8)) var(--page-px) var(--space-16); display: flex; justify-content: center; }
  .srp__card { width: 100%; max-width: 600px; background: var(--clr-cream); border: 1px solid var(--clr-border); border-radius: 22px; padding: 36px 30px; align-self: flex-start; }

  .eyebrow { font-size: 11px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--clr-terracotta); margin-bottom: 6px; }
  .srp__title { font-family: var(--font-display); font-size: clamp(24px, 4vw, 32px); font-weight: 500; color: var(--clr-charcoal); line-height: 1.2; margin-bottom: 8px; }
  .srp__title em { font-style: italic; color: var(--clr-terracotta); }
  .srp__lead { font-size: 15px; font-weight: 300; color: var(--clr-taupe); line-height: 1.6; margin-bottom: 18px; }
  .srp__bullets { display: flex; flex-direction: column; gap: 10px; margin-bottom: 18px; }
  .srp__bullets li { font-size: 14px; color: var(--clr-charcoal); display: flex; align-items: center; gap: 10px; }
  .srp__bullets i { color: var(--clr-terracotta); width: 18px; text-align: center; }
  .srp__pitch { font-size: 13px; font-weight: 300; font-style: italic; color: var(--clr-brown); background: var(--clr-beige); border-radius: 12px; padding: 12px 14px; line-height: 1.55; margin-bottom: 20px; }
  .srp__price-hint { font-size: 13px; color: var(--clr-taupe); text-align: center; margin-top: 12px; }
  .srp__price-hint b { color: var(--clr-charcoal); }

  .srp__cta { width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 50px; border: none; border-radius: 12px; background: var(--clr-charcoal); color: #fff; font-family: var(--font-body); font-size: 15px; font-weight: 500; cursor: pointer; transition: background 0.2s; text-decoration: none; }
  .srp__cta:hover:not(:disabled) { background: var(--clr-brown); }
  .srp__cta:disabled { opacity: 0.6; cursor: wait; }
  .srp__cta--ghost { background: transparent; color: var(--clr-brown); border: 1.5px solid var(--clr-brown); }
  .srp__cta--ghost:hover { background: var(--clr-beige); }

  .srp__progress { display: flex; gap: 6px; margin-bottom: 22px; }
  .srp__dot { height: 4px; flex: 1; border-radius: 999px; background: var(--clr-light-taupe); transition: background 0.2s; }
  .srp__dot.on { background: var(--clr-terracotta); }

  .srp__q { font-family: var(--font-display); font-size: 22px; font-weight: 500; color: var(--clr-charcoal); margin-bottom: 6px; }
  .srp__sub { font-size: 13px; font-weight: 300; color: var(--clr-taupe); margin-bottom: 16px; }
  .srp__big { font-family: var(--font-display); font-size: 24px; color: var(--clr-brown); margin: 12px 0; }
  .srp__range { width: 100%; accent-color: var(--clr-charcoal); }

  .srp__chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
  .chip { background: #fff; border: 1.5px solid var(--clr-border); border-radius: 999px; padding: 9px 16px; font-size: 13px; font-weight: 500; color: var(--clr-charcoal); cursor: pointer; font-family: var(--font-body); transition: all 0.13s; }
  .chip:hover { border-color: var(--clr-light-taupe); }
  .chip.on { background: var(--clr-charcoal); border-color: var(--clr-charcoal); color: #fff; }

  .srp__add { display: flex; gap: 8px; margin-bottom: 18px; }
  .srp__input { flex: 1; height: 42px; padding: 0 14px; border: 1.5px solid var(--clr-border); border-radius: 10px; font-family: var(--font-body); font-size: 14px; background: #fff; outline: none; }
  .srp__input:focus { border-color: var(--clr-terracotta); }
  .srp__add-btn { padding: 0 16px; border: 1.5px solid var(--clr-border); border-radius: 10px; background: #fff; cursor: pointer; font-family: var(--font-body); font-size: 13px; font-weight: 500; }
  .srp__label { font-size: 13px; font-weight: 600; color: var(--clr-charcoal); display: block; margin-bottom: 8px; }
  .srp__textarea { width: 100%; border: 1.5px solid var(--clr-border); border-radius: 12px; padding: 12px 14px; font-family: var(--font-body); font-size: 14px; background: #fff; outline: none; resize: vertical; }
  .srp__textarea:focus { border-color: var(--clr-terracotta); }

  .srp__uploads { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 8px; }
  .srp__upload { aspect-ratio: 3/4; border: 1.5px dashed var(--clr-light-taupe); border-radius: 14px; background: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; cursor: pointer; color: var(--clr-taupe); overflow: hidden; transition: border-color 0.15s; }
  .srp__upload:hover { border-color: var(--clr-brown); }
  .srp__upload.filled { border-style: solid; border-color: var(--clr-terracotta); }
  .srp__upload i { font-size: 26px; }
  .srp__upload span { font-size: 13px; font-weight: 500; }
  .srp__upload img { width: 100%; height: 100%; object-fit: cover; }

  .srp__nav { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 24px; }
  .srp__back { background: none; border: none; cursor: pointer; font-family: var(--font-body); font-size: 14px; color: var(--clr-taupe); }
  .srp__next { margin-left: auto; background: var(--clr-charcoal); color: #fff; border: none; border-radius: 10px; padding: 12px 24px; font-family: var(--font-body); font-size: 14px; font-weight: 500; cursor: pointer; transition: background 0.2s; }
  .srp__next:hover:not(:disabled) { background: var(--clr-brown); }
  .srp__next:disabled { opacity: 0.45; cursor: not-allowed; }

  .srp__loading { text-align: center; padding: 40px 0; }
  .srp__spinner { width: 44px; height: 44px; border-radius: 50%; border: 3px solid var(--clr-light-taupe); border-top-color: var(--clr-terracotta); animation: spin 0.9s linear infinite; margin: 0 auto 20px; }
  .srp__loading-msg { font-family: var(--font-display); font-size: 18px; color: var(--clr-charcoal); margin-bottom: 6px; }
  .srp__loading-sub { font-size: 13px; color: var(--clr-taupe); }
  @keyframes spin { to { transform: rotate(360deg); } }

  .srp__done-head { text-align: center; margin-bottom: var(--space-6); }
  .srp__beta { display: inline-block; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--clr-terracotta); background: rgba(196,144,106,0.14); border-radius: 999px; padding: 5px 12px; margin-bottom: 12px; }
  .srp__done-actions { display: flex; gap: 12px; margin-top: var(--space-6); flex-wrap: wrap; }
  .srp__done-actions .srp__cta { flex: 1; min-width: 180px; }

  .srp__err { font-size: 13px; color: #a33020; margin-bottom: 12px; }
</style>
