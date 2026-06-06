<script lang="ts">
  import { createSupabaseBrowserClient } from '$lib/supabase';
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import type { StyleReport } from '$lib/types';

  let { data } = $props();
  const supabase = createSupabaseBrowserClient();

  let report = $state<StyleReport>(data.report);
  let profileImages = $state(data.profileImages);
  let scrolled = $state(false);
  let unsubscribe: (() => void) | null = null;

  const AI_FIELDS = ['title','description','skin_tone','undertone','best_colors','accent_colors','neutral_staples','use_sparingly','metals','chains','recommended_shapes'];
  function completeness(r: StyleReport) {
    const filled = AI_FIELDS.filter(f => { const v = (r as any)[f]; return v !== null && v !== undefined && (Array.isArray(v) ? v.length > 0 : String(v).trim().length > 0); }).length;
    return Math.round((filled / AI_FIELDS.length) * 100);
  }
  let pct = $derived(completeness(report));
  let ready = $derived(pct >= 60);

  let pipelineStatus = $state('');

  async function invoke(fn: string, body: Record<string, unknown>) {
    console.log(`[pipeline] calling ${fn}…`);
    const { data, error } = await supabase.functions.invoke(fn, { body });
    if (error) console.warn(`[pipeline] ${fn} error:`, error.message);
    else console.log(`[pipeline] ${fn} ✓`);
    return { data, error };
  }

  async function runPipeline(reportId: string) {
    try {
      // 1. Face analysis
      pipelineStatus = 'Analysing your features…';
      const { data: faceData } = await invoke('face_analyser', { reportId });

      // 2. Skin tone (uses face position from step 1)
      const perImage = faceData?.per_image ?? [];
      const firstOk  = perImage.find((r: any) => r.ok && r.data?.face_position);
      if (firstOk) {
        const fp = firstOk.data.face_position;
        pipelineStatus = 'Detecting your skin tone…';
        await invoke('skin_tone_analyzer', {
          style_report_id: reportId,
          x: fp.x, y: fp.y, width: fp.width, height: fp.height,
        });
      }

      // 3. Colour intelligence
      pipelineStatus = 'Building your colour palette…';
      await invoke('color_intelligence', { reportId });

      // 4. Jewellery
      pipelineStatus = 'Finding your best accessories…';
      await invoke('jewelry_recommendations', { reportId });

      // 5. Eyewear
      pipelineStatus = 'Matching your eyewear…';
      await invoke('eyewear_recommendations', { reportId });

      pipelineStatus = '';
      console.log('[pipeline] complete ✓');
      // If the user was mid-search before signing up, send them back to it
      const rt = typeof localStorage !== 'undefined' ? localStorage.getItem('aloura_return_to') : null;
      if (rt) { localStorage.removeItem('aloura_return_to'); goto(rt); }
      else goto('/discover');
    } catch (e) {
      console.error('[pipeline] fatal:', e);
      pipelineStatus = '';
    }
  }

  onMount(() => {
    if (typeof localStorage !== 'undefined') localStorage.setItem('aloura_report_id', data.report.id);

    const onScroll = () => { scrolled = window.scrollY > 10; };
    window.addEventListener('scroll', onScroll, { passive: true });

    // Realtime subscription - updates report as each edge function writes fields
    const channel = supabase.channel(`report:${data.report.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'style_reports', filter: `id=eq.${data.report.id}` },
        (payload) => { report = { ...report, ...payload.new }; }
      ).subscribe();
    unsubscribe = () => supabase.removeChannel(channel);

    // Only trigger pipeline if report is still empty (not already generated)
    if (completeness(report) < 10) {
      runPipeline(data.report.id);
    }

    return () => {
      window.removeEventListener('scroll', onScroll);
      unsubscribe?.();
    };
  });

  const join = (arr: string[] | null) => (arr ?? []).filter(Boolean).join(', ') || '-';
  const val  = (v: string | null) => (v && v.trim()) ? v : '-';
</script>

<svelte:head>
  <title>{report.title ?? 'Your Style Report'} - Aloura</title>
  <meta name="robots" content="noindex" />
</svelte:head>

{#if !ready}
  <div class="loading-wrap">
    <div class="spinner"></div>
    <p class="loading-label">{pipelineStatus || 'Analysing your style…'}</p>
    {#if pct > 0}
      <div class="progress-bar"><div class="progress-bar__fill" style="width:{pct}%"></div></div>
      <p class="loading-pct">{pct}% complete</p>
    {/if}
  </div>
{:else}
  <div class="report" id="report-body">

    <!-- HERO -->
    <section class="report-hero">
      <div class="container">
        <div class="report-hero__inner">
          <div class="report-hero__images">
            {#each profileImages as img}
              <img src={img.public_url} alt="Profile" class="report-hero__img" />
            {/each}
          </div>
          <div class="report-hero__text">
            <p class="eyebrow">Your Style Report</p>
            <h1 class="heading-xl" style="margin-top:var(--space-3);margin-bottom:var(--space-4)">{val(report.title)}</h1>
            <p class="lead">{val(report.description)}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- QUICK SNAPSHOT -->
    <section class="section">
      <div class="container">
        <p class="eyebrow" style="margin-bottom:var(--space-5)">Quick snapshot</p>
        <div class="snapshot-grid">
          {#each [
            { label:'Skin Tone',   value: val(report.skin_tone) },
            { label:'Undertone',   value: val(report.undertone) },
            { label:'Color Family',value: val(report.color_family) },
            { label:'Face Shape',  value: val(report.face_shape) },
            { label:'Hair',        value: val(report.hair_color) },
          ] as snap}
            <div class="snapshot-card">
              <div class="snapshot-label">{snap.label}</div>
              <div class="snapshot-value">{snap.value}</div>
            </div>
          {/each}
        </div>
      </div>
    </section>

    <!-- COLOR INTELLIGENCE -->
    <section class="section" style="background:var(--clr-cream)">
      <div class="container">
        <p class="eyebrow" style="margin-bottom:var(--space-5)">Color intelligence</p>
        <h2 class="heading-lg" style="margin-bottom:var(--space-10)">Your <em class="text-italic">palette.</em></h2>
        <div class="color-groups">
          {#each [
            { label:'Best colors',    colors: report.best_colors,    desc: report.best_colors_description,    accent:'var(--clr-terracotta)' },
            { label:'Accent colors',  colors: report.accent_colors,  desc: report.accent_colors_description,  accent:'var(--clr-brown)' },
            { label:'Neutral staples',colors: report.neutral_staples,desc: report.neutral_staples_description,accent:'var(--clr-taupe)' },
            { label:'Use sparingly',  colors: report.use_sparingly,  desc: report.use_sparingly_description,  accent:'#C4503C' },
          ] as group}
            <div class="color-group">
              <h3 class="color-group__label">{group.label}</h3>
              <div class="color-swatches">
                {#each (group.colors ?? []) as hex}
                  <div class="swatch" style="background:{hex}" title={hex}></div>
                {/each}
              </div>
              {#if group.desc}<p class="color-group__desc">{group.desc}</p>{/if}
            </div>
          {/each}
        </div>
      </div>
    </section>

    <!-- ACCESSORIES -->
    <section class="section">
      <div class="container">
        <p class="eyebrow" style="margin-bottom:var(--space-5)">Accessories</p>
        <h2 class="heading-lg" style="margin-bottom:var(--space-10)">What works <em class="text-italic">for you.</em></h2>
        <div class="acc-grid">
          {#each [
            { icon:'fas fa-ring',    title:'Metals',          value: val(report.metals) },
            { icon:'fas fa-link',    title:'Chains',          value: val(report.chains) },
            { icon:'fas fa-glasses', title:'Eyewear shapes',  value: val(report.recommended_shapes) },
          ] as acc}
            <div class="acc-card card">
              <div class="card__body">
                <i class={acc.icon} style="color:var(--clr-terracotta);font-size:20px;margin-bottom:var(--space-4)"></i>
                <div class="acc-card__title">{acc.title}</div>
                <div class="acc-card__value">{acc.value}</div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    </section>

    <!-- DISCOVER CTA -->
    <section class="section" style="background:var(--clr-beige);text-align:center">
      <div class="container">
        <h2 class="heading-lg" style="margin-bottom:var(--space-5)">See your <em class="text-italic">outfit boards.</em></h2>
        <p class="lead" style="margin:0 auto var(--space-8);max-width:480px">Generate outfit boards tailored to your colors, goals, and style profile.</p>
        <a href="/discover" class="btn btn--primary btn--lg">Go to Discover <i class="fas fa-arrow-right"></i></a>
      </div>
    </section>

  </div>
{/if}

<style>
  .loading-wrap { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--space-5); padding-top: var(--nav-h); }
  .loading-label { font-size: var(--text-sm); font-weight: 300; color: var(--clr-text-muted); text-align: center; }
  .loading-pct   { font-size: var(--text-xs); color: var(--clr-text-faint); margin-top: 4px; }
  .progress-bar { width: 240px; height: 3px; background: var(--clr-light-taupe); border-radius: var(--radius-full); overflow: hidden; }
  .progress-bar__fill { height: 100%; background: var(--clr-terracotta); transition: width 0.5s var(--ease); }

  .report { padding-top: var(--nav-h); animation: fadeIn 0.5s var(--ease); }
  .report-hero { padding-block: var(--space-16); background: var(--clr-beige); }
  .report-hero__inner { display: flex; flex-direction: column; gap: var(--space-8); }
  .report-hero__images { display: flex; gap: var(--space-3); }
  .report-hero__img { width: 80px; height: 80px; border-radius: 50%; object-fit: cover; border: 3px solid var(--clr-off-white); box-shadow: var(--shadow-md); }

  .snapshot-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: var(--space-4); }
  .snapshot-card { background: var(--clr-cream); border: 1px solid var(--clr-border); border-radius: var(--radius-lg); padding: var(--space-5); }
  .snapshot-label { font-size: var(--text-xs); font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: var(--clr-text-muted); margin-bottom: var(--space-2); }
  .snapshot-value { font-family: var(--font-display); font-size: var(--text-lg); font-weight: 500; }

  .color-groups { display: flex; flex-direction: column; gap: var(--space-10); }
  .color-group__label { font-family: var(--font-display); font-size: var(--text-xl); font-weight: 500; margin-bottom: var(--space-4); }
  .color-swatches { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-bottom: var(--space-3); }
  .swatch { width: 40px; height: 40px; border-radius: var(--radius-md); box-shadow: var(--shadow-sm); border: 1px solid rgba(0,0,0,0.06); }
  .color-group__desc { font-size: var(--text-sm); font-weight: 300; line-height: 1.75; color: var(--clr-text-muted); max-width: 600px; }

  .acc-grid { display: grid; gap: var(--space-4); }
  .acc-card__title { font-size: var(--text-xs); font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: var(--clr-text-muted); margin-bottom: var(--space-2); }
  .acc-card__value { font-family: var(--font-display); font-size: var(--text-lg); font-weight: 500; }

  @media (min-width: 640px) {
    .report-hero__inner { flex-direction: row; align-items: center; }
    .snapshot-grid { grid-template-columns: repeat(5,1fr); }
    .acc-grid { grid-template-columns: repeat(3,1fr); }
    .color-groups { display: grid; grid-template-columns: repeat(2,1fr); }
  }
</style>
