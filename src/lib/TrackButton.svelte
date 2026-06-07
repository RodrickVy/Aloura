<script lang="ts">
  interface Props {
    /** Name of the product being tracked (shown in the popup). */
    productName?: string;
    /** 'pill' = icon + label, 'icon' = round icon button. */
    variant?: 'pill' | 'icon';
    label?: string;
    /** Fired when the user confirms tracking (for analytics). */
    onTrack?: () => void;
  }
  let { productName = 'this product', variant = 'pill', label = 'Track', onTrack }: Props = $props();

  let open = $state(false);

  // Step state
  let dropAmount = $state(5);                       // minimum price drop ($) worth a notification
  let method     = $state<'email' | 'sms' | null>(null);
  let phone      = $state('');
  let done       = $state(false);                   // "coming soon" confirmation view

  const DROP_MIN = 2;
  const DROP_MAX = 20;

  function openModal() { open = true; done = false; method = null; phone = ''; dropAmount = 5; }
  function close() { open = false; }
  function onKey(e: KeyboardEvent) { if (e.key === 'Escape') close(); }

  const canTrack = $derived(!!method && (method !== 'sms' || phone.trim().length >= 7));

  function track() {
    onTrack?.();
    // Feature not built yet - show the friendly "coming soon" confirmation.
    done = true;
  }

  // Move the overlay to <body> so it escapes ancestors with backdrop-filter/transform.
  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return { destroy() { node.remove(); } };
  }
</script>

<svelte:window onkeydown={onKey} />

<button
  class="track-btn track-btn--{variant}"
  onclick={openModal}
  aria-label="Track price"
  title="Track price"
>
  <i class="fas fa-bell"></i>
  {#if variant === 'pill'}<span>{label}</span>{/if}
</button>

{#if open}
  <div class="tk-overlay" use:portal onclick={close} role="presentation">
    <div class="tk-modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
      <button class="tk-close" onclick={close} aria-label="Close"><i class="fas fa-times"></i></button>

      {#if done}
        <!-- ── COMING SOON CONFIRMATION ── -->
        <div class="tk-done">
          <div class="tk-done__icon"><i class="fas fa-bell"></i></div>
          <h2 class="tk-title">Price tracking is on the way</h2>
          <p class="tk-sub">
            Sorry, this feature is still being developed. You'll be the first to know
            the moment it's ready - and we'll start watching prices for you right away.
          </p>
          <button class="tk-submit" onclick={close}>Got it</button>
        </div>
      {:else}
        <!-- ── SETUP ── -->
        <div class="tk-head">
          <span class="tk-eyebrow"><i class="fas fa-bell"></i> Price alert</span>
        </div>
        <h2 class="tk-title">Track the price of {productName}</h2>
        <p class="tk-sub">Get a notification when the price drops by enough to matter.</p>

        <!-- Minimum drop -->
        <div class="tk-block">
          <div class="tk-label">
            Notify me when it drops by at least
            <span class="tk-amount">${dropAmount}</span>
          </div>
          <input class="tk-range" type="range" min={DROP_MIN} max={DROP_MAX} step="1" bind:value={dropAmount} />
          <div class="tk-range-scale"><span>${DROP_MIN}</span><span>${DROP_MAX}</span></div>
          <p class="tk-hint">If you pick ${dropAmount} and it falls by more, you'll still get notified.</p>
        </div>

        <!-- Notification method -->
        <div class="tk-block">
          <div class="tk-label">How should we reach you?</div>
          <div class="tk-methods">
            <button class="tk-method" class:selected={method === 'email'} onclick={() => method = 'email'}>
              <i class="fas fa-envelope"></i> Email
            </button>
            <button class="tk-method" class:selected={method === 'sms'} onclick={() => method = 'sms'}>
              <i class="fas fa-comment-sms"></i> SMS
            </button>
          </div>
          {#if method === 'sms'}
            <input class="tk-input" type="tel" placeholder="Your phone number" bind:value={phone} />
          {/if}
        </div>

        <button class="tk-submit" onclick={track} disabled={!canTrack}>Track price</button>
      {/if}
    </div>
  </div>
{/if}

<style>
  /* Trigger button - matches ShareButton sizing */
  .track-btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 7px;
    font-family: var(--font-body); font-weight: 500; cursor: pointer;
    border: 1.5px solid var(--clr-border); background: #fff; color: var(--clr-charcoal);
    transition: background 0.15s, border-color 0.15s, color 0.15s, transform 0.1s;
  }
  .track-btn:hover { background: var(--clr-beige); border-color: var(--clr-light-taupe); }
  .track-btn:active { transform: scale(0.96); }
  .track-btn--pill { height: 36px; padding: 0 16px; border-radius: 999px; font-size: 13px; }
  .track-btn--icon { width: 36px; height: 36px; border-radius: 50%; font-size: 13px; }

  /* Overlay + modal */
  .tk-overlay {
    position: fixed; inset: 0; z-index: 100000;
    background: rgba(40, 33, 28, 0.5); backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center; padding: 20px;
    animation: tkFade 0.18s ease;
  }
  .tk-modal {
    position: relative; width: 100%; max-width: 420px;
    background: var(--clr-off-white, #fdfbf8); border-radius: 20px;
    padding: 28px 26px 26px; box-shadow: 0 24px 60px rgba(0,0,0,0.28);
    animation: tkUp 0.22s cubic-bezier(0.2,0.8,0.2,1);
    max-height: 90vh; overflow-y: auto;
  }
  .tk-close {
    position: absolute; top: 14px; right: 14px; width: 30px; height: 30px;
    border: none; background: none; cursor: pointer; color: var(--clr-taupe);
    font-size: 16px; border-radius: 50%; transition: background 0.15s;
  }
  .tk-close:hover { background: var(--clr-beige); color: var(--clr-charcoal); }

  .tk-head { margin-bottom: 10px; }
  .tk-eyebrow { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--clr-terracotta); }
  .tk-title { font-family: var(--font-display); font-size: 21px; font-weight: 500; color: var(--clr-charcoal); line-height: 1.25; margin-bottom: 6px; }
  .tk-sub { font-size: 13px; font-weight: 300; color: var(--clr-taupe); line-height: 1.6; margin-bottom: 22px; }

  .tk-block { margin-bottom: 22px; }
  .tk-label { font-size: 13px; font-weight: 600; color: var(--clr-charcoal); margin-bottom: 12px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .tk-amount { font-family: var(--font-display); font-size: 18px; font-weight: 600; color: var(--clr-brown); }

  .tk-range { width: 100%; accent-color: var(--clr-charcoal); }
  .tk-range-scale { display: flex; justify-content: space-between; font-size: 11px; color: var(--clr-taupe); margin-top: 2px; }
  .tk-hint { font-size: 11px; font-weight: 300; color: var(--clr-taupe); margin-top: 8px; line-height: 1.5; }

  .tk-methods { display: flex; gap: 10px; }
  .tk-method {
    flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px;
    height: 44px; border-radius: 12px; border: 1.5px solid var(--clr-border);
    background: #faf7f2; cursor: pointer; font-family: var(--font-body);
    font-size: 13px; font-weight: 500; color: var(--clr-charcoal); transition: all 0.15s;
  }
  .tk-method:hover { border-color: var(--clr-light-taupe); }
  .tk-method.selected { background: var(--clr-charcoal); border-color: var(--clr-charcoal); color: #fff; }

  .tk-input {
    width: 100%; margin-top: 10px; height: 44px; padding: 0 14px;
    border: 1.5px solid var(--clr-border); border-radius: 12px;
    font-family: var(--font-body); font-size: 14px; color: var(--clr-charcoal);
    background: #fff; outline: none; transition: border-color 0.15s;
  }
  .tk-input:focus { border-color: var(--clr-terracotta); }

  .tk-submit {
    width: 100%; height: 48px; border: none; border-radius: 12px; cursor: pointer;
    background: var(--clr-charcoal); color: #fff; font-family: var(--font-body);
    font-size: 14px; font-weight: 500; transition: background 0.2s;
  }
  .tk-submit:hover:not(:disabled) { background: var(--clr-brown); }
  .tk-submit:disabled { opacity: 0.45; cursor: not-allowed; }

  /* Done view */
  .tk-done { text-align: center; padding: 8px 0 4px; }
  .tk-done__icon {
    width: 60px; height: 60px; margin: 0 auto 18px; border-radius: 50%;
    background: rgba(196,144,106,0.15); color: var(--clr-terracotta);
    display: flex; align-items: center; justify-content: center; font-size: 24px;
  }
  .tk-done .tk-title { margin-bottom: 10px; }
  .tk-done .tk-sub { margin-bottom: 24px; }

  @keyframes tkFade { from { opacity: 0; } to { opacity: 1; } }
  @keyframes tkUp { from { opacity: 0; transform: translateY(16px) scale(0.98); } to { opacity: 1; transform: none; } }
</style>
