<script lang="ts">
  import { createSupabaseBrowserClient } from '$lib/supabase';

  interface Props { accountId?: string | null; }
  let { accountId = null }: Props = $props();

  const supabase = createSupabaseBrowserClient();

  let mostUseful        = $state('');
  let frustrations      = $state('');
  let feltPersonalized  = $state('');
  let personalizedWhy   = $state('');
  let wantedFeature     = $state('');

  let submitting = $state(false);
  let submitted  = $state(false);
  let error      = $state('');
  let open       = $state(false);

  async function submit() {
    if (!mostUseful && !frustrations && !feltPersonalized && !wantedFeature) {
      error = 'Please answer at least one question.';
      return;
    }
    submitting = true; error = '';
    try {
      const { error: e } = await supabase.from('feedback').insert({
        account_id:       accountId,
        most_useful:      mostUseful.trim()       || null,
        frustrations:     frustrations.trim()     || null,
        felt_personalized: feltPersonalized       || null,
        personalized_why: personalizedWhy.trim()  || null,
        wanted_feature:   wantedFeature.trim()    || null,
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

<div class="feedback-wrap">
  <button class="feedback-toggle" onclick={() => open = !open}>
    <i class="fas fa-comment-dots"></i>
    Share feedback
    <i class="fas fa-chevron-{open ? 'down' : 'up'}" style="font-size:10px;opacity:0.6"></i>
  </button>

  {#if open}
    <div class="feedback-form">
      {#if submitted}
        <div class="feedback-thanks">
          <i class="fas fa-heart" style="color:var(--clr-terracotta);font-size:24px"></i>
          <p class="feedback-thanks__title">Thank you!</p>
          <p class="feedback-thanks__sub">Your feedback helps us build a better Aloura.</p>
        </div>
      {:else}
        <h3 class="feedback-title">Quick feedback</h3>
        <p class="feedback-sub">Takes 2 minutes. Helps us build what actually matters.</p>

        {#if error}
          <p class="feedback-error"><i class="fas fa-exclamation-circle"></i> {error}</p>
        {/if}

        <!-- Q1 -->
        <div class="fq">
          <label class="fq__label">What part of the experience felt most useful?</label>
          <textarea class="fq__input" bind:value={mostUseful} rows={2}
            placeholder="e.g. the color analysis, the outfit boards…"></textarea>
        </div>

        <!-- Q2 -->
        <div class="fq">
          <label class="fq__label">What frustrated or confused you?</label>
          <textarea class="fq__input" bind:value={frustrations} rows={2}
            placeholder="Be honest — this is the most useful answer you can give us."></textarea>
        </div>

        <!-- Q3 -->
        <div class="fq">
          <label class="fq__label">Did the recommendations feel personalized to you?</label>
          <div class="fq__options">
            {#each ['Yes', 'Somewhat', 'No'] as opt}
              <button
                type="button"
                class="fq__opt"
                class:active={feltPersonalized === opt}
                onclick={() => feltPersonalized = opt}
              >{opt}</button>
            {/each}
          </div>
          {#if feltPersonalized}
            <textarea class="fq__input" bind:value={personalizedWhy} rows={2}
              placeholder="Why? What felt generic or spot-on?" style="margin-top:8px"></textarea>
          {/if}
        </div>

        <!-- Q4 -->
        <div class="fq">
          <label class="fq__label">What one feature would make Aloura significantly more valuable for you?</label>
          <textarea class="fq__input" bind:value={wantedFeature} rows={2}
            placeholder="e.g. virtual try-on, wardrobe builder, AI chat stylist…"></textarea>
        </div>

        <button class="feedback-submit btn btn--primary btn--full" onclick={submit} disabled={submitting}>
          {#if submitting}<span class="feedback-spin"></span>{/if}
          Submit feedback
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .feedback-wrap { width: 100%; }

  .feedback-toggle {
    display: flex; align-items: center; gap: 8px; width: 100%;
    background: none; border: none; cursor: pointer; padding: 12px 0;
    font-family: var(--font-body); font-size: 13px; font-weight: 500;
    color: rgba(253,251,248,0.65); transition: color 0.15s;
    border-top: 1px solid rgba(255,255,255,0.08);
  }
  .feedback-toggle:hover { color: rgba(253,251,248,0.9); }

  .feedback-form {
    background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
    border-radius: 16px; padding: 24px; margin-top: 8px;
    animation: fadeIn 0.2s ease;
  }

  .feedback-title { font-family: var(--font-display); font-size: 18px; font-weight: 500; color: #fff; margin-bottom: 4px; }
  .feedback-sub   { font-size: 12px; color: rgba(253,251,248,0.5); margin-bottom: 20px; }
  .feedback-error { font-size: 12px; color: #fca5a5; margin-bottom: 12px; display: flex; align-items: center; gap: 6px; }

  .fq { display: flex; flex-direction: column; gap: 8px; margin-bottom: 18px; }
  .fq__label { font-size: 12px; font-weight: 600; color: rgba(253,251,248,0.8); line-height: 1.5; }
  .fq__input {
    font-family: var(--font-body); font-size: 13px; font-weight: 300;
    color: var(--clr-charcoal); background: rgba(253,251,248,0.92);
    border: 1.5px solid rgba(255,255,255,0.2); border-radius: 10px;
    padding: 10px 13px; outline: none; resize: vertical; width: 100%;
    transition: border-color 0.2s;
  }
  .fq__input:focus { border-color: var(--clr-terracotta); }
  .fq__options { display: flex; gap: 8px; flex-wrap: wrap; }
  .fq__opt {
    background: rgba(255,255,255,0.08); border: 1.5px solid rgba(255,255,255,0.15);
    border-radius: 999px; padding: 6px 16px; font-size: 12px; font-weight: 500;
    color: rgba(253,251,248,0.7); cursor: pointer; font-family: var(--font-body);
    transition: all 0.15s;
  }
  .fq__opt:hover { background: rgba(255,255,255,0.15); }
  .fq__opt.active { background: var(--clr-terracotta); border-color: var(--clr-terracotta); color: #fff; }

  .feedback-submit { margin-top: 4px; }
  .feedback-spin { width: 16px; height: 16px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; animation: spin 0.8s linear infinite; flex-shrink: 0; }

  .feedback-thanks { display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center; padding: 24px 0; }
  .feedback-thanks__title { font-family: var(--font-display); font-size: 20px; font-weight: 500; color: #fff; }
  .feedback-thanks__sub   { font-size: 13px; color: rgba(253,251,248,0.55); }
</style>
