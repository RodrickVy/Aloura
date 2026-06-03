<script lang="ts">
  import { createSupabaseBrowserClient } from '$lib/supabase';
  import { track } from '$lib/analytics';

  interface Props { accountId?: string | null; }
  let { accountId = null }: Props = $props();

  const supabase = createSupabaseBrowserClient();
  let showDialog = $state(false);

  function open() {
    showDialog = true;
    track(supabase, accountId, 'fit_check_hits');
  }
</script>

<button class="fitcheck-btn" onclick={open} title="Fit Check">
  <i class="fas fa-camera"></i>
  <span class="fitcheck-label">Fit Check</span>
</button>

{#if showDialog}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="fitcheck-backdrop" onclick={() => showDialog = false}>
    <div class="fitcheck-dialog" onclick={(e) => e.stopPropagation()}>
      <div class="fitcheck-icon"><i class="fas fa-camera"></i></div>
      <h3 class="fitcheck-title">Fit Check</h3>
      <p class="fitcheck-sub">Upload any outfit photo and we'll break it down piece by piece — coming soon.</p>
      <button class="fitcheck-close btn btn--primary" onclick={() => showDialog = false}>Got it</button>
    </div>
  </div>
{/if}

<style>
  .fitcheck-btn {
    display: flex; flex-direction: column; align-items: center; gap: 3px;
    background: none; border: none; cursor: pointer; padding: 6px 10px;
    border-radius: var(--radius-md); color: var(--clr-taupe);
    transition: background var(--dur-fast), color var(--dur-fast);
    font-family: var(--font-body); flex-shrink: 0;
  }
  .fitcheck-btn:hover { background: var(--clr-beige); color: var(--clr-charcoal); }
  .fitcheck-btn i { font-size: 18px; }
  .fitcheck-label { font-size: 9px; font-weight: 500; letter-spacing: 0.04em; white-space: nowrap; }

  .fitcheck-backdrop {
    position: fixed; inset: 0; z-index: 600;
    background: rgba(0,0,0,0.4); backdrop-filter: blur(6px);
    display: flex; align-items: center; justify-content: center;
    padding: 20px; animation: fadeIn 0.18s ease;
  }
  .fitcheck-dialog {
    background: #fff; border-radius: 20px; padding: 36px 28px;
    width: 100%; max-width: 360px; text-align: center;
    animation: slideUp 0.22s ease; box-shadow: 0 24px 80px rgba(0,0,0,0.18);
  }
  .fitcheck-icon {
    width: 56px; height: 56px; border-radius: 50%;
    background: var(--clr-beige); display: flex; align-items: center; justify-content: center;
    font-size: 22px; color: var(--clr-terracotta); margin: 0 auto var(--space-5);
  }
  .fitcheck-title { font-family: var(--font-display); font-size: 22px; font-weight: 500; margin-bottom: var(--space-3); color: var(--clr-charcoal); }
  .fitcheck-sub { font-size: 14px; font-weight: 300; color: var(--clr-taupe); line-height: 1.7; margin-bottom: var(--space-6); }
  .fitcheck-close { width: 100%; }

  @keyframes slideUp { from { opacity: 0; transform: translateY(16px) scale(0.98); } to { opacity: 1; transform: none; } }
</style>
