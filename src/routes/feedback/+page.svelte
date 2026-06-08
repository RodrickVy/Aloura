<script lang="ts">
  import { createSupabaseBrowserClient } from '$lib/supabase';
  import { page } from '$app/stores';

  const supabase = createSupabaseBrowserClient();

  let mostUseful       = $state('');
  let frustrations     = $state('');
  let feltPersonalized = $state('');
  let personalizedWhy  = $state('');
  let wantedFeature    = $state('');

  let submitting = $state(false);
  let submitted  = $state(false);
  let error      = $state('');

  async function submit() {
    if (!mostUseful && !frustrations && !feltPersonalized && !wantedFeature) {
      error = 'Please answer at least one question.';
      return;
    }
    submitting = true; error = '';
    try {
      // Anonymous - no account required.
      const { error: e } = await supabase.from('feedback').insert({
        account_id:        null,
        most_useful:       mostUseful.trim()      || null,
        frustrations:      frustrations.trim()    || null,
        felt_personalized: feltPersonalized       || null,
        personalized_why:  personalizedWhy.trim() || null,
        wanted_feature:    wantedFeature.trim()   || null,
        source:            'feedback_page',
      });
      if (e) throw e;
      submitted = true;
    } catch {
      error = 'Could not submit. Please try again.';
    } finally {
      submitting = false;
    }
  }
</script>

<svelte:head>
  <title>Share feedback - Aloura</title>
  <meta name="description" content="Tell us what you think of Aloura - takes 2 minutes, no sign-up needed." />
  <link rel="canonical" href="{$page.url.origin}/feedback" />
  <meta property="og:type"        content="website" />
  <meta property="og:site_name"   content="Aloura" />
  <meta property="og:title"       content="Share your feedback on Aloura" />
  <meta property="og:description" content="2 minutes, no sign-up. Help us build something you'd actually use." />
  <meta property="og:image"       content="{$page.url.origin}/assets/man_on_chair.jpg" />
  <meta name="twitter:card"  content="summary_large_image" />
  <meta name="twitter:image" content="{$page.url.origin}/assets/man_on_chair.jpg" />
</svelte:head>

<div class="fb-page">
  <div class="fb-card">
    {#if submitted}
      <div class="fb-thanks">
        <i class="fas fa-heart"></i>
        <h1>Thank you!</h1>
        <p>Your feedback genuinely helps us build a better Aloura.</p>
        <a href="/discover" class="btn btn--primary">Explore Aloura</a>
      </div>
    {:else}
      <p class="eyebrow">We'd love your honest take</p>
      <h1 class="fb-title">Share feedback</h1>
      <p class="fb-sub">Takes about 2 minutes, and you don't need an account. Even one answer helps.</p>

      {#if error}<p class="fb-error"><i class="fas fa-exclamation-circle"></i> {error}</p>{/if}

      <div class="fq">
        <label class="fq__label" for="q1">What part of the experience felt most useful?</label>
        <textarea id="q1" class="fq__input" bind:value={mostUseful} rows={2} placeholder="e.g. the price comparison, the outfit boards…"></textarea>
      </div>

      <div class="fq">
        <label class="fq__label" for="q2">What frustrated or confused you?</label>
        <textarea id="q2" class="fq__input" bind:value={frustrations} rows={2} placeholder="Be honest - this is the most useful answer you can give us."></textarea>
      </div>

      <div class="fq">
        <span class="fq__label">Did the recommendations feel personalized to you?</span>
        <div class="fq__options">
          {#each ['Yes', 'Somewhat', 'No'] as opt}
            <button type="button" class="fq__opt" class:active={feltPersonalized === opt} onclick={() => feltPersonalized = opt}>{opt}</button>
          {/each}
        </div>
        {#if feltPersonalized}
          <textarea class="fq__input" bind:value={personalizedWhy} rows={2} placeholder="Why? What felt generic or spot-on?" style="margin-top:10px"></textarea>
        {/if}
      </div>

      <div class="fq">
        <label class="fq__label" for="q4">What one feature would make Aloura significantly more valuable for you?</label>
        <textarea id="q4" class="fq__input" bind:value={wantedFeature} rows={2} placeholder="e.g. virtual try-on, wardrobe builder, AI chat stylist…"></textarea>
      </div>

      <button class="btn btn--primary btn--full" onclick={submit} disabled={submitting}>
        {#if submitting}<span class="fb-spin"></span> Submitting…{:else}Submit feedback{/if}
      </button>
      <p class="fb-foot">Anonymous · no sign-up required</p>
    {/if}
  </div>
</div>

<style>
  .fb-page { min-height: 100vh; padding: calc(var(--nav-h) + var(--space-8)) var(--page-px) var(--space-16); display: flex; justify-content: center; }
  .fb-card { width: 100%; max-width: 560px; background: var(--clr-cream); border: 1px solid var(--clr-border); border-radius: 20px; padding: 36px 30px; align-self: flex-start; }

  .eyebrow { font-size: 11px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--clr-terracotta); margin-bottom: 6px; }
  .fb-title { font-family: var(--font-display); font-size: 28px; font-weight: 500; color: var(--clr-charcoal); margin-bottom: 6px; }
  .fb-sub { font-size: 14px; font-weight: 300; color: var(--clr-taupe); line-height: 1.6; margin-bottom: 26px; }
  .fb-error { font-size: 13px; color: #a33020; margin-bottom: 14px; display: flex; align-items: center; gap: 6px; }

  .fq { display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px; }
  .fq__label { font-size: 13px; font-weight: 600; color: var(--clr-charcoal); line-height: 1.5; }
  .fq__input {
    font-family: var(--font-body); font-size: 14px; font-weight: 300; color: var(--clr-charcoal);
    background: #fff; border: 1.5px solid var(--clr-border); border-radius: 12px;
    padding: 12px 14px; outline: none; resize: vertical; width: 100%; transition: border-color 0.15s;
  }
  .fq__input:focus { border-color: var(--clr-terracotta); }
  .fq__options { display: flex; gap: 8px; flex-wrap: wrap; }
  .fq__opt {
    background: #fff; border: 1.5px solid var(--clr-border); border-radius: 999px;
    padding: 8px 18px; font-size: 13px; font-weight: 500; color: var(--clr-charcoal);
    cursor: pointer; font-family: var(--font-body); transition: all 0.15s;
  }
  .fq__opt:hover { border-color: var(--clr-light-taupe); }
  .fq__opt.active { background: var(--clr-charcoal); border-color: var(--clr-charcoal); color: #fff; }

  .fb-foot { text-align: center; font-size: 12px; color: var(--clr-taupe); margin-top: 14px; }
  .fb-spin { width: 15px; height: 15px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; animation: spin 0.8s linear infinite; display: inline-block; vertical-align: -2px; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .fb-thanks { text-align: center; padding: 20px 0; }
  .fb-thanks i { font-size: 36px; color: var(--clr-terracotta); margin-bottom: 14px; }
  .fb-thanks h1 { font-family: var(--font-display); font-size: 26px; font-weight: 500; color: var(--clr-charcoal); margin-bottom: 8px; }
  .fb-thanks p { font-size: 14px; color: var(--clr-taupe); margin-bottom: 22px; }
</style>
