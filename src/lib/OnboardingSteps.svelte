<script lang="ts">
  import { createSupabaseBrowserClient } from '$lib/supabase';
  import { track } from '$lib/analytics';

  interface Props {
    accountId: string;
    onDone: () => void;
  }
  let { accountId, onDone }: Props = $props();

  const supabase = createSupabaseBrowserClient();

  // Selections
  let budget = $state<string | null>(null);
  let vibes  = $state<string[]>([]);
  let colors = $state<string[]>([]);

  // Fit / sizing
  let height     = $state<number | null>(null);  // cm
  let topSize    = $state<string | null>(null);
  let bottomSize = $state<string | null>(null);
  let shoeSize   = $state<string | null>(null);
  let outerwear  = $state<string | null>(null);
  let fitTops    = $state<string | null>(null);
  let fitBottoms = $state<string | null>(null);
  let proportions = $state<string[]>([]);
  let showAdvanced = $state(false);

  let step    = $state(0);          // 0 budget, 1 vibe, 2 colours, 3 fit
  let saving  = $state(false);
  const TOTAL = 4;

  const BUDGETS = [
    { value: 'budget-friendly',   label: 'Budget-friendly',     desc: 'Great style, gentle on the wallet' },
    { value: 'balanced',          label: 'Balanced',            desc: 'A mix of value and quality' },
    { value: 'premium-occasion',  label: 'Premium on occasion', desc: 'Happy to splurge on standout pieces' },
  ];

  const VIBES = [
    'Minimalist', 'Elevated basics', 'Streetwear', 'Quiet luxury', 'Vintage',
    'Sporty', 'Casual chic', 'Bold', 'Classic', 'Trend-forward', 'Still exploring',
  ];

  const COLORS = [
    { hex: '#2C2C2C', name: 'Black' },   { hex: '#FFFFFF', name: 'White' },
    { hex: '#9E8C7E', name: 'Taupe' },   { hex: '#6B4F3A', name: 'Brown' },
    { hex: '#C4906A', name: 'Terracotta' }, { hex: '#D9C9A8', name: 'Beige' },
    { hex: '#1E3A5F', name: 'Navy' },    { hex: '#3F6F52', name: 'Green' },
    { hex: '#7B1E3B', name: 'Burgundy' },{ hex: '#E8B4B8', name: 'Pink' },
    { hex: '#5A4FCF', name: 'Purple' },  { hex: '#E4A11B', name: 'Mustard' },
    { hex: '#C0392B', name: 'Red' },     { hex: '#87CEEB', name: 'Sky' },
    { hex: '#808080', name: 'Grey' },
  ];

  const TOP_SIZES    = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
  const BOTTOM_SIZES = ['26', '28', '30', '32', '34', '36', '38'];
  const SHOE_SIZES   = ['6', '7', '8', '9', '10', '11', '12', '13'];
  const OUTERWEAR    = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
  const FIT_TOPS     = ['Oversized', 'Relaxed', 'Regular', 'Slim'];
  const FIT_BOTTOMS  = ['Loose', 'Straight', 'Tailored', 'Skinny'];
  const PROPORTIONS  = ['Broad shoulders', 'Shorter torso', 'Longer legs', 'Curvier fit', 'Athletic build', 'Petite', 'Tall'];

  function toggle(list: string[], v: string): string[] {
    return list.includes(v) ? list.filter(x => x !== v) : [...list, v];
  }

  function cmToFtIn(cm: number): string {
    const inches = Math.round(cm / 2.54);
    return `${Math.floor(inches / 12)}'${inches % 12}"`;
  }

  // Colour-from-photo suggestions
  let colorUploadLoading = $state(false);
  let colorUploadError   = $state('');
  let recommended = $state<{ hex: string; name: string }[]>([]);

  async function onColorPhoto(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      colorUploadError = 'Only JPG and PNG images are supported. Please choose a different file.';
      input.value = '';
      return;
    }
    colorUploadLoading = true; colorUploadError = '';
    try {
      // read → upload → signed URL → edge function
      const b64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res((r.result as string).split(',')[1]);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      const ext  = (file.type.split('/')[1] ?? 'jpg').replace('jpeg', 'jpg');
      const path = `onboarding/${accountId}/${Date.now()}.${ext}`;
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const { error: upErr } = await supabase.storage.from('profile_images')
        .upload(path, bytes, { contentType: file.type, upsert: true });
      if (upErr) throw upErr;
      const { data: signed } = await supabase.storage.from('profile_images').createSignedUrl(path, 600);
      if (!signed?.signedUrl) throw new Error('signed url failed');

      const { data, error } = await supabase.functions.invoke('color_intelligence', { body: { image_url: signed.signedUrl } });
      if (error) throw error;
      recommended = data?.colors ?? [];
      if (!recommended.length) colorUploadError = "We couldn't read that image. It may be an unsupported file type - please try a different photo.";
    } catch {
      colorUploadError = "We couldn't read that image. It may be an unsupported file type - please try a different photo.";
    } finally {
      colorUploadLoading = false;
    }
  }

  // Next is enabled once the current step has a valid answer (fit is optional)
  const canNext = $derived(
    step === 0 ? !!budget :
    step === 1 ? vibes.length > 0 :
    step === 2 ? colors.length > 0 :
    true
  );

  async function markOnboarded() {
    await supabase.from('accounts').update({ onboarded: true }).eq('id', accountId);
    track(supabase, accountId, 'onboarded');
  }

  async function saveProfile() {
    const preferences = [
      height     ? `height: ${height}cm` : '',
      topSize    ? `top size: ${topSize}` : '',
      bottomSize ? `bottom size: ${bottomSize}` : '',
      shoeSize   ? `shoe size: ${shoeSize}` : '',
      outerwear  ? `outerwear: ${outerwear}` : '',
      fitTops    ? `fit tops: ${fitTops.toLowerCase()}` : '',
      fitBottoms ? `fit bottoms: ${fitBottoms.toLowerCase()}` : '',
      ...proportions.map(p => `proportion: ${p.toLowerCase()}`),
    ].filter(Boolean);

    await supabase.from('profile').upsert({
      account_id:        accountId,
      budget_preference: budget,
      vibe:              vibes.length ? vibes : null,
      favourite_colors:  colors.length ? colors : null,
      preferences:       preferences.length ? preferences : null,
      updated_at:        new Date().toISOString(),
    }, { onConflict: 'account_id' });
  }

  async function skipAll() {
    saving = true;
    await markOnboarded();
    onDone();
  }

  async function next() {
    if (step < TOTAL - 1) { step += 1; return; }
    saving = true;
    try { await saveProfile(); await markOnboarded(); }
    finally { onDone(); }
  }
</script>

<div class="ob">
  <div class="ob__head">
    <span class="ob__eyebrow">Customize your experience</span>
    <button class="ob__skip" onclick={skipAll} disabled={saving}>Skip</button>
  </div>

  <div class="ob__progress">
    {#each Array(TOTAL) as _, i}
      <div class="ob__dot" class:done={i < step} class:active={i === step}></div>
    {/each}
  </div>

  {#if step === 0}
    <h2 class="ob__q">What's your ideal shopping budget?</h2>
    <p class="ob__sub">We'll match pieces to your style <em>and</em> your wallet.</p>
    <div class="ob__cards">
      {#each BUDGETS as b}
        <button class="ob-card" class:selected={budget === b.value} onclick={() => budget = b.value}>
          <span class="ob-card__label">{b.label}</span>
          <span class="ob-card__desc">{b.desc}</span>
        </button>
      {/each}
    </div>

  {:else if step === 1}
    <h2 class="ob__q">What's your style vibe?</h2>
    <p class="ob__sub">Pick anything that feels like you, you're not locked in.</p>
    <div class="ob__chips">
      {#each VIBES as v}
        <button class="ob-chip" class:selected={vibes.includes(v)} onclick={() => vibes = toggle(vibes, v)}>{v}</button>
      {/each}
    </div>

  {:else if step === 2}
    <h2 class="ob__q">Which colours feel most like you?</h2>
    <p class="ob__sub">Tap the tones you gravitate toward, or let us suggest some for you.</p>

    <!-- Upload-for-suggestions -->
    <label class="ob-upload">
      {#if colorUploadLoading}
        <span class="ob__spin ob__spin--dark"></span> Analysing your photo…
      {:else}
        <i class="fas fa-camera"></i> Upload a photo, get colours that suit you
      {/if}
      <input type="file" accept="image/jpeg,image/png" style="display:none" onchange={onColorPhoto} disabled={colorUploadLoading} />
    </label>
    {#if colorUploadError}<p class="ob-upload__err">{colorUploadError}</p>{/if}

    {#if recommended.length}
      <p class="ob-rec__label"><i class="fas fa-wand-magic-sparkles"></i> Recommended for you</p>
      <div class="ob__swatches">
        {#each recommended as c}
          <button class="ob-swatch" class:selected={colors.includes(c.hex)} style="--sw:{c.hex}" title={c.name} aria-label={c.name} onclick={() => colors = toggle(colors, c.hex)}>
            {#if colors.includes(c.hex)}<i class="fas fa-check"></i>{/if}
          </button>
        {/each}
      </div>
      <div class="ob-divider"></div>
    {/if}

    <div class="ob__swatches">
      {#each COLORS as c}
        <button class="ob-swatch" class:selected={colors.includes(c.hex)} style="--sw:{c.hex}" title={c.name} aria-label={c.name} onclick={() => colors = toggle(colors, c.hex)}>
          {#if colors.includes(c.hex)}<i class="fas fa-check"></i>{/if}
        </button>
      {/each}
    </div>

  {:else}
    <!-- ── SIZING / FIT (optional, premium teaser) ── -->
    <div class="ob-soon-badge"><i class="fas fa-clock"></i> Coming soon</div>
    <h2 class="ob__q">Smarter fit recommendations</h2>
    <p class="ob__sub">Help us learn your sizing so we can recommend clothes more likely to fit. Totally optional, takes under a minute.</p>

    <div class="ob-fit">
      <!-- Height -->
      <div class="ob-fit__block">
        <label class="ob-fit__label" for="ob-height">Height <span>{height ? `${height} cm · ${cmToFtIn(height)}` : ''}</span></label>
        <input id="ob-height" class="ob-range" type="range" min="140" max="210" bind:value={height} />
        <p class="ob-fit__hint">Your height helps us understand proportions.</p>
      </div>

      <!-- Sizes -->
      <div class="ob-fit__block">
        <span class="ob-fit__label">Usual sizes</span>
        <p class="ob-fit__hint" style="margin-top:-2px;margin-bottom:8px">Sizing changes between brands, this just helps us start learning.</p>

        <span class="ob-mini">Tops</span>
        <div class="ob__chips ob__chips--sm">{#each TOP_SIZES as s}<button class="ob-chip ob-chip--sm" class:selected={topSize === s} onclick={() => topSize = topSize === s ? null : s}>{s}</button>{/each}</div>

        <span class="ob-mini">Bottoms / waist</span>
        <div class="ob__chips ob__chips--sm">{#each BOTTOM_SIZES as s}<button class="ob-chip ob-chip--sm" class:selected={bottomSize === s} onclick={() => bottomSize = bottomSize === s ? null : s}>{s}</button>{/each}</div>

        <span class="ob-mini">Shoes</span>
        <div class="ob__chips ob__chips--sm">{#each SHOE_SIZES as s}<button class="ob-chip ob-chip--sm" class:selected={shoeSize === s} onclick={() => shoeSize = shoeSize === s ? null : s}>{s}</button>{/each}</div>

        <span class="ob-mini">Outerwear</span>
        <div class="ob__chips ob__chips--sm">{#each OUTERWEAR as s}<button class="ob-chip ob-chip--sm" class:selected={outerwear === s} onclick={() => outerwear = outerwear === s ? null : s}>{s}</button>{/each}</div>
      </div>

      <!-- Fit preference -->
      <div class="ob-fit__block">
        <span class="ob-fit__label">How do you like clothes to fit?</span>
        <span class="ob-mini">Tops & jackets</span>
        <div class="ob__chips ob__chips--sm">{#each FIT_TOPS as f}<button class="ob-chip ob-chip--sm" class:selected={fitTops === f} onclick={() => fitTops = fitTops === f ? null : f}>{f}</button>{/each}</div>
        <span class="ob-mini">Bottoms</span>
        <div class="ob__chips ob__chips--sm">{#each FIT_BOTTOMS as f}<button class="ob-chip ob-chip--sm" class:selected={fitBottoms === f} onclick={() => fitBottoms = fitBottoms === f ? null : f}>{f}</button>{/each}</div>
      </div>

      <!-- Advanced (hidden) -->
      <button class="ob-advanced-toggle" onclick={() => showAdvanced = !showAdvanced}>
        <i class="fas fa-chevron-{showAdvanced ? 'up' : 'down'}"></i> Improve recommendations (optional)
      </button>
      {#if showAdvanced}
        <div class="ob__chips ob__chips--sm">{#each PROPORTIONS as p}<button class="ob-chip ob-chip--sm" class:selected={proportions.includes(p)} onclick={() => proportions = toggle(proportions, p)}>{p}</button>{/each}</div>
      {/if}

      <!-- Future preview -->
      <div class="ob-future">
        <span class="ob-future__tag">Coming soon</span>
        <ul>
          <li><i class="fas fa-check"></i> "Will this fit me?" confidence score</li>
          <li><i class="fas fa-check"></i> Smarter size recommendations by brand</li>
          <li><i class="fas fa-check"></i> Outfit fit previews from your profile</li>
          <li><i class="fas fa-check"></i> Fewer returns, less wasted money</li>
        </ul>
      </div>
    </div>
  {/if}

  <button class="ob__next" onclick={next} disabled={!canNext || saving}>
    {#if saving}<span class="ob__spin"></span>
    {:else}{step < TOTAL - 1 ? 'Next' : 'Finish'}{/if}
  </button>
  {#if step === TOTAL - 1}
    <button class="ob__skip-now" onclick={skipAll} disabled={saving}>Skip for now</button>
  {/if}
</div>

<style>
  .ob { display: flex; flex-direction: column; }
  .ob__head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
  .ob__eyebrow { font-size: 11px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--clr-terracotta); }
  .ob__skip { background: none; border: none; cursor: pointer; font-family: var(--font-body); font-size: 12px; color: var(--clr-taupe); text-decoration: underline; text-underline-offset: 2px; }
  .ob__skip:hover { color: var(--clr-charcoal); }

  .ob__progress { display: flex; gap: 6px; margin-bottom: 18px; }
  .ob__dot { height: 4px; flex: 1; border-radius: 999px; background: var(--clr-light-taupe); transition: background 0.25s; }
  .ob__dot.done   { background: var(--clr-brown); }
  .ob__dot.active { background: var(--clr-terracotta); }

  .ob__q { font-family: var(--font-display); font-size: 22px; font-weight: 500; color: var(--clr-charcoal); line-height: 1.2; margin-bottom: 6px; }
  .ob__sub { font-size: 13px; font-weight: 300; color: var(--clr-taupe); line-height: 1.6; margin-bottom: 20px; }
  .ob__sub em { font-style: italic; color: var(--clr-brown); }

  .ob__cards { display: flex; flex-direction: column; gap: 10px; margin-bottom: 22px; }
  .ob-card { display: flex; flex-direction: column; gap: 3px; text-align: left; background: #faf7f2; border: 1.5px solid var(--clr-border); border-radius: 12px; padding: 14px 16px; cursor: pointer; transition: all 0.15s; font-family: var(--font-body); }
  .ob-card:hover { border-color: var(--clr-light-taupe); }
  .ob-card.selected { border-color: var(--clr-charcoal); background: #fff; box-shadow: var(--shadow-sm); }
  .ob-card__label { font-size: 14px; font-weight: 600; color: var(--clr-charcoal); }
  .ob-card__desc { font-size: 12px; font-weight: 300; color: var(--clr-taupe); }

  .ob__chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 22px; }
  .ob__chips--sm { gap: 6px; margin-bottom: 14px; }
  .ob-chip { background: #faf7f2; border: 1.5px solid var(--clr-border); border-radius: 999px; padding: 9px 16px; font-size: 13px; font-weight: 500; color: var(--clr-charcoal); cursor: pointer; transition: all 0.15s; font-family: var(--font-body); }
  .ob-chip--sm { padding: 6px 12px; font-size: 12px; }
  .ob-chip:hover { border-color: var(--clr-light-taupe); }
  .ob-chip.selected { background: var(--clr-charcoal); border-color: var(--clr-charcoal); color: #fff; }

  /* Colour upload */
  .ob-upload { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; background: var(--clr-beige); border: 1.5px dashed var(--clr-light-taupe); border-radius: 12px; padding: 13px; font-size: 13px; font-weight: 500; color: var(--clr-brown); cursor: pointer; margin-bottom: 14px; transition: border-color 0.15s; }
  .ob-upload:hover { border-color: var(--clr-brown); }
  .ob-upload__err { font-size: 12px; color: #a33020; margin: -6px 0 12px; }
  .ob-rec__label { font-size: 12px; font-weight: 600; color: var(--clr-terracotta); margin-bottom: 10px; display: flex; align-items: center; gap: 6px; }
  .ob-divider { height: 1px; background: var(--clr-border); margin: 18px 0; }

  .ob__swatches { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 22px; }
  .ob-swatch { aspect-ratio: 1; border-radius: 50%; background: var(--sw); border: 2px solid #fff; box-shadow: 0 0 0 1.5px var(--clr-border); cursor: pointer; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 12px; transition: transform 0.12s, box-shadow 0.15s; }
  .ob-swatch:hover { transform: scale(1.08); }
  .ob-swatch.selected { box-shadow: 0 0 0 2.5px var(--clr-charcoal); }
  .ob-swatch i { text-shadow: 0 0 3px rgba(0,0,0,0.5); }

  /* Sizing */
  .ob-soon-badge { display: inline-flex; align-items: center; gap: 6px; align-self: flex-start; background: rgba(196,144,106,0.14); color: var(--clr-terracotta); font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 999px; margin-bottom: 10px; }
  .ob-fit { display: flex; flex-direction: column; gap: 18px; margin-bottom: 22px; }
  .ob-fit__block { display: flex; flex-direction: column; }
  .ob-fit__label { font-size: 13px; font-weight: 600; color: var(--clr-charcoal); margin-bottom: 8px; display: flex; justify-content: space-between; }
  .ob-fit__label span { font-weight: 400; color: var(--clr-taupe); }
  .ob-fit__hint { font-size: 11px; font-weight: 300; color: var(--clr-taupe); }
  .ob-mini { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--clr-taupe); margin-bottom: 6px; display: block; }
  .ob-range { width: 100%; accent-color: var(--clr-charcoal); }

  .ob-advanced-toggle { background: none; border: none; cursor: pointer; font-family: var(--font-body); font-size: 13px; font-weight: 500; color: var(--clr-brown); display: flex; align-items: center; gap: 8px; padding: 4px 0; }

  .ob-future { background: var(--clr-cream); border: 1px solid var(--clr-border); border-radius: 12px; padding: 16px; position: relative; opacity: 0.85; }
  .ob-future__tag { position: absolute; top: 12px; right: 12px; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--clr-taupe); background: var(--clr-beige); padding: 3px 8px; border-radius: 999px; }
  .ob-future ul { display: flex; flex-direction: column; gap: 8px; }
  .ob-future li { font-size: 12.5px; color: var(--clr-taupe); display: flex; align-items: center; gap: 8px; }
  .ob-future li i { color: #16a34a; font-size: 11px; }

  .ob__next { width: 100%; background: var(--clr-charcoal); color: #fff; border: none; cursor: pointer; font-family: var(--font-body); font-size: 14px; font-weight: 500; padding: 14px; border-radius: 10px; transition: background 0.2s; display: flex; align-items: center; justify-content: center; }
  .ob__next:hover:not(:disabled) { background: var(--clr-brown); }
  .ob__next:disabled { opacity: 0.5; cursor: not-allowed; }
  .ob__skip-now { width: 100%; margin-top: 10px; background: none; border: none; cursor: pointer; font-family: var(--font-body); font-size: 13px; color: var(--clr-taupe); text-decoration: underline; text-underline-offset: 3px; }
  .ob__skip-now:hover { color: var(--clr-charcoal); }
  .ob__spin { width: 18px; height: 18px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; animation: spin 0.8s linear infinite; }
  .ob__spin--dark { border: 2px solid var(--clr-light-taupe); border-top-color: var(--clr-brown); }
</style>
