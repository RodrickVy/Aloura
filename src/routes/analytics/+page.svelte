<script lang="ts">
  import { createSupabaseBrowserClient } from '$lib/supabase';

  let { data } = $props();
  const { totals, totalUsers, feedback } = data;

  const supabase = createSupabaseBrowserClient();

  const metrics = [
    { key: 'sign_ups',       label: 'Sign ups',        icon: 'fas fa-user-plus',     color: '#6366f1' },
    { key: 'onboarded',      label: 'Onboarded',       icon: 'fas fa-clipboard-check', color: '#8b5cf6' },
    { key: 'searches',       label: 'Searches',        icon: 'fas fa-search',        color: '#0ea5e9' },
    { key: 'comparisons',    label: 'Comparisons',     icon: 'fas fa-columns',       color: '#06b6d4' },
    { key: 'shares',         label: 'Shares',          icon: 'fas fa-arrow-up-from-bracket', color: '#f59e0b' },
    { key: 'product_tracks', label: 'Price tracks',    icon: 'fas fa-bell',          color: '#ec4899' },
    { key: 'fit_checks',     label: 'Fit checks',      icon: 'fas fa-camera',        color: '#c4906a' },
    { key: 'buy_clicks',     label: 'Buy clicks',      icon: 'fas fa-shopping-bag',  color: '#22c55e' },
    { key: 'trends',         label: 'Trend views',     icon: 'fas fa-fire',          color: '#ef4444' },
  ];

  const formatDate = (s: string) =>
    new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  // ── Trend orchestrator runner (admin only) ──
  const TREND_CATEGORIES = [
    { key: 'streetwear',  label: 'Streetwear' },
    { key: 'formal',      label: 'Formal' },
    { key: 'casual',      label: 'Casual' },
    { key: 'athleisure',  label: 'Athleisure' },
    { key: 'old-money',   label: 'Old Money' },
    { key: 'date-night',  label: 'Date Night' },
  ];

  let runStatus = $state<Record<string, 'idle' | 'running' | 'done' | 'error'>>({});
  let runMsg    = $state<Record<string, string>>({});
  let runningAll = $state(false);

  async function runCategory(key: string): Promise<boolean> {
    if (!data.accountId) { runMsg[key] = 'No admin account found.'; runStatus[key] = 'error'; return false; }
    runStatus[key] = 'running'; runMsg[key] = '';
    try {
      const { data: res, error } = await supabase.functions.invoke('trend_orchestrator', {
        body: { account_id: data.accountId, category: key },
      });
      if (error) throw error;
      if (!res?.success) throw new Error(res?.error || 'Failed');
      runStatus[key] = 'done';
      const boards = res.boards ?? [];
      runMsg[key] = boards.length
        ? boards.map((b: any) => `${b.title} (${b.pieces})`).join(' · ')
        : 'Done';
      return true;
    } catch (e: any) {
      runStatus[key] = 'error';
      runMsg[key] = e?.message ?? 'Something went wrong';
      return false;
    }
  }

  async function runAll() {
    runningAll = true;
    for (const c of TREND_CATEGORIES) await runCategory(c.key);
    runningAll = false;
  }
</script>

<svelte:head>
  <title>Analytics - Aloura</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="page">

  <!-- HEADER -->
  <div class="page-header">
    <div>
      <p class="eyebrow">Internal</p>
      <h1 class="heading-xl" style="margin-top:var(--space-2)">Analytics</h1>
    </div>
    <div class="header-meta">
      <div class="meta-chip"><i class="fas fa-users"></i> {totalUsers} active users</div>
      <div class="meta-chip"><i class="fas fa-comment-dots"></i> {feedback.length} feedback submissions</div>
    </div>
  </div>

  <!-- TREND ORCHESTRATOR RUNNER -->
  <section class="section-block">
    <h2 class="section-heading">Trend generator <span class="section-sub">runs the orchestrator + builds boards</span></h2>
    <div class="runner">
      <div class="runner__bar">
        <button class="runner__all" onclick={runAll} disabled={runningAll}>
          {#if runningAll}<span class="runner__spin"></span> Running all…{:else}<i class="fas fa-bolt"></i> Generate all categories{/if}
        </button>
      </div>
      <div class="runner__grid">
        {#each TREND_CATEGORIES as c}
          <div class="runner__card" class:running={runStatus[c.key] === 'running'} class:done={runStatus[c.key] === 'done'} class:error={runStatus[c.key] === 'error'}>
            <div class="runner__card-head">
              <span class="runner__cat">{c.label}</span>
              <button class="runner__btn" onclick={() => runCategory(c.key)} disabled={runStatus[c.key] === 'running' || runningAll}>
                {#if runStatus[c.key] === 'running'}<span class="runner__spin"></span>
                {:else if runStatus[c.key] === 'done'}<i class="fas fa-check"></i> Re-run
                {:else}Generate{/if}
              </button>
            </div>
            {#if runMsg[c.key]}
              <p class="runner__msg">{runMsg[c.key]}</p>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  </section>

  <!-- METRICS GRID -->
  <section class="section-block">
    <h2 class="section-heading">Usage metrics <span class="section-sub">all-time totals</span></h2>
    <div class="metrics-grid">
      {#each metrics as m}
        {@const value = (totals as any)[m.key] ?? 0}
        <div class="metric-card">
          <div class="metric-card__icon" style="background:{m.color}18;color:{m.color}">
            <i class={m.icon}></i>
          </div>
          <div class="metric-card__value">{value.toLocaleString()}</div>
          <div class="metric-card__label">{m.label}</div>
          {#if totalUsers > 0}
            <div class="metric-card__avg">
              {(value / totalUsers).toFixed(1)} avg / user
            </div>
          {/if}
        </div>
      {/each}
    </div>
  </section>

  <!-- ENGAGEMENT RATIOS -->
  <section class="section-block">
    <h2 class="section-heading">Engagement ratios</h2>
    <div class="ratios-grid">
      {#each [
        {
          label: 'Sign up → Onboard rate',
          desc:  'How often a new sign up completes onboarding',
          num:   totals.onboarded,
          den:   totals.sign_ups,
        },
        {
          label: 'Search → Compare rate',
          desc:  'How often a search leads to a store comparison',
          num:   totals.comparisons,
          den:   totals.searches,
        },
        {
          label: 'Compare → Buy rate',
          desc:  'How often a comparison leads to a buy click',
          num:   totals.buy_clicks,
          den:   totals.comparisons,
        },
        {
          label: 'Search → Buy rate',
          desc:  'How often a search ends in a buy click',
          num:   totals.buy_clicks,
          den:   totals.searches,
        },
      ] as r}
        {@const pct = r.den > 0 ? Math.round((r.num / r.den) * 100) : 0}
        <div class="ratio-card">
          <div class="ratio-card__label">{r.label}</div>
          <div class="ratio-card__pct">{pct}%</div>
          <div class="ratio-bar"><div class="ratio-bar__fill" style="width:{Math.min(pct,100)}%"></div></div>
          <div class="ratio-card__desc">{r.desc}</div>
          <div class="ratio-card__nums">{r.num} / {r.den}</div>
        </div>
      {/each}
    </div>
  </section>

  <!-- FEEDBACK -->
  <section class="section-block">
    <h2 class="section-heading">
      Feedback submissions
      <span class="section-sub">{feedback.length} total</span>
    </h2>

    {#if feedback.length === 0}
      <div class="empty">
        <i class="fas fa-comment-dots"></i>
        <p>No feedback submitted yet.</p>
      </div>
    {:else}
      <div class="feedback-list">
        {#each feedback as fb}
          <div class="fb-card">
            <div class="fb-card__meta">
              <span class="fb-card__date">{formatDate(fb.created_at)}</span>
              {#if fb.felt_personalized}
                <span class="fb-card__badge" class:badge--yes={fb.felt_personalized === 'Yes'} class:badge--somewhat={fb.felt_personalized === 'Somewhat'} class:badge--no={fb.felt_personalized === 'No'}>
                  {fb.felt_personalized}
                </span>
              {/if}
            </div>

            <div class="fb-card__qas">
              {#if fb.most_useful}
                <div class="qa">
                  <div class="qa__q">What felt most useful?</div>
                  <div class="qa__a">"{fb.most_useful}"</div>
                </div>
              {/if}
              {#if fb.frustrations}
                <div class="qa">
                  <div class="qa__q">Frustrations / confusion</div>
                  <div class="qa__a">"{fb.frustrations}"</div>
                </div>
              {/if}
              {#if fb.felt_personalized}
                <div class="qa">
                  <div class="qa__q">Felt personalized</div>
                  <div class="qa__a">{fb.felt_personalized}{fb.personalized_why ? ` - "${fb.personalized_why}"` : ''}</div>
                </div>
              {/if}
              {#if fb.wanted_feature}
                <div class="qa">
                  <div class="qa__q">Most wanted feature</div>
                  <div class="qa__a">"{fb.wanted_feature}"</div>
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </section>

</div>

<style>
  .page { padding: calc(var(--nav-h) + var(--space-8)) var(--page-px) var(--space-16); max-width: 1100px; margin: 0 auto; }

  /* Header */
  .page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-6); margin-bottom: var(--space-10); flex-wrap: wrap; }
  .header-meta { display: flex; gap: var(--space-3); flex-wrap: wrap; align-items: flex-start; padding-top: var(--space-2); }
  .meta-chip { display: flex; align-items: center; gap: 6px; background: var(--clr-cream); border: 1px solid var(--clr-border); border-radius: 999px; padding: 6px 14px; font-size: 12px; font-weight: 500; color: var(--clr-taupe); }
  .meta-chip i { color: var(--clr-terracotta); }

  /* Sections */
  .section-block { margin-bottom: var(--space-12); }
  .section-heading { font-family: var(--font-display); font-size: var(--text-xl); font-weight: 500; color: var(--clr-charcoal); margin-bottom: var(--space-6); display: flex; align-items: center; gap: var(--space-3); }
  .section-sub { font-family: var(--font-body); font-size: var(--text-sm); font-weight: 300; color: var(--clr-taupe); }

  /* Metrics grid */
  .metrics-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-4); }
  .metric-card { background: #fff; border: 1px solid var(--clr-border); border-radius: var(--radius-xl); padding: var(--space-5); }
  .metric-card__icon { width: 40px; height: 40px; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center; font-size: 16px; margin-bottom: var(--space-3); }
  .metric-card__value { font-family: var(--font-display); font-size: clamp(28px, 4vw, 40px); font-weight: 600; color: var(--clr-charcoal); line-height: 1; margin-bottom: 4px; }
  .metric-card__label { font-size: 12px; font-weight: 500; color: var(--clr-taupe); margin-bottom: 4px; }
  .metric-card__avg { font-size: 11px; color: var(--clr-text-faint); }

  /* Ratios */
  .ratios-grid { display: grid; gap: var(--space-4); }
  .ratio-card { background: #fff; border: 1px solid var(--clr-border); border-radius: var(--radius-xl); padding: var(--space-5); }
  .ratio-card__label { font-size: 13px; font-weight: 600; color: var(--clr-charcoal); margin-bottom: var(--space-2); }
  .ratio-card__pct { font-family: var(--font-display); font-size: 32px; font-weight: 600; color: var(--clr-terracotta); margin-bottom: var(--space-2); }
  .ratio-bar { height: 4px; background: var(--clr-light-taupe); border-radius: 999px; overflow: hidden; margin-bottom: var(--space-3); }
  .ratio-bar__fill { height: 100%; background: var(--clr-terracotta); border-radius: 999px; transition: width 0.6s ease; }
  .ratio-card__desc { font-size: 12px; color: var(--clr-taupe); font-weight: 300; margin-bottom: 4px; }
  .ratio-card__nums { font-size: 11px; color: var(--clr-text-faint); }

  /* Feedback */
  .feedback-list { display: flex; flex-direction: column; gap: var(--space-4); }
  .fb-card { background: #fff; border: 1px solid var(--clr-border); border-radius: var(--radius-xl); padding: var(--space-5); }
  .fb-card__meta { display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-4); }
  .fb-card__date { font-size: 11px; color: var(--clr-taupe); }
  .fb-card__badge { font-size: 11px; font-weight: 600; border-radius: 999px; padding: 3px 10px; }
  .badge--yes      { background: #dcfce7; color: #16a34a; }
  .badge--somewhat { background: #fef9c3; color: #a16207; }
  .badge--no       { background: #fee2e2; color: #dc2626; }
  .fb-card__qas { display: flex; flex-direction: column; gap: var(--space-3); }
  .qa { border-left: 2px solid var(--clr-light-taupe); padding-left: var(--space-4); }
  .qa__q { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--clr-taupe); margin-bottom: 4px; }
  .qa__a { font-size: 14px; color: var(--clr-charcoal); font-weight: 300; line-height: 1.6; }

  .empty { text-align: center; padding: var(--space-16); color: var(--clr-taupe); display: flex; flex-direction: column; align-items: center; gap: var(--space-4); }
  .empty i { font-size: 32px; }
  .empty p { font-size: var(--text-sm); font-weight: 300; }

  @media (min-width: 640px) {
    .metrics-grid { grid-template-columns: repeat(3, 1fr); }
    .ratios-grid  { grid-template-columns: repeat(2, 1fr); }
  }
  @media (min-width: 1024px) {
    .metrics-grid { grid-template-columns: repeat(5, 1fr); }
  }
  /* Trend runner */
  .runner { background: var(--clr-cream); border: 1px solid var(--clr-border); border-radius: 16px; padding: var(--space-5); }
  .runner__bar { margin-bottom: var(--space-4); }
  .runner__all {
    display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 18px;
    border-radius: 999px; border: none; cursor: pointer; background: var(--clr-charcoal); color: #fff;
    font-family: var(--font-body); font-size: 13px; font-weight: 600; transition: background 0.15s;
  }
  .runner__all:hover:not(:disabled) { background: var(--clr-brown); }
  .runner__all:disabled { opacity: 0.6; cursor: wait; }
  .runner__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: var(--space-3); }
  .runner__card { background: #fff; border: 1.5px solid var(--clr-border); border-radius: 12px; padding: 12px 14px; transition: border-color 0.15s; }
  .runner__card.running { border-color: #f59e0b; }
  .runner__card.done    { border-color: #22c55e; }
  .runner__card.error   { border-color: #ef4444; }
  .runner__card-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .runner__cat { font-size: 13px; font-weight: 600; color: var(--clr-charcoal); }
  .runner__btn {
    display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px;
    border-radius: 999px; border: 1.5px solid var(--clr-border); background: var(--clr-beige);
    cursor: pointer; font-family: var(--font-body); font-size: 12px; font-weight: 500; color: var(--clr-charcoal);
    transition: background 0.15s, border-color 0.15s;
  }
  .runner__btn:hover:not(:disabled) { border-color: var(--clr-light-taupe); }
  .runner__btn:disabled { opacity: 0.6; cursor: wait; }
  .runner__msg { font-size: 11px; color: var(--clr-taupe); margin-top: 8px; line-height: 1.4; }
  .runner__card.error .runner__msg { color: #dc2626; }
  .runner__spin { width: 14px; height: 14px; border-radius: 50%; border: 2px solid rgba(0,0,0,0.15); border-top-color: var(--clr-charcoal); animation: spin 0.8s linear infinite; display: inline-block; }
  .runner__all .runner__spin { border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
