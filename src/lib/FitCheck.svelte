<script lang="ts">
  import { createSupabaseBrowserClient } from '$lib/supabase';
  import { track } from '$lib/analytics';

  interface Props { accountId?: string | null; }
  let { accountId = null }: Props = $props();

  const supabase = createSupabaseBrowserClient();

  type Stage = 'intro' | 'requesting' | 'preview' | 'denied';
  let open    = $state(false);
  let stage   = $state<Stage>('intro');
  let videoEl = $state<HTMLVideoElement | null>(null);
  let stream: MediaStream | null = null;

  function openFlow() {
    stage = 'intro';
    open = true;
    track(supabase, accountId, 'fit_checks');
  }

  function stopStream() {
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  }

  function close() {
    stopStream();
    open = false;
    stage = 'intro';
  }

  async function checkMyFit() {
    stage = 'requesting';
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }, audio: false,
      });
      stage = 'preview';
      // attach after the video element renders
      requestAnimationFrame(() => {
        if (videoEl && stream) { videoEl.srcObject = stream; videoEl.play().catch(() => {}); }
      });
    } catch {
      stage = 'denied';
    }
  }

  function onKey(e: KeyboardEvent) { if (e.key === 'Escape') close(); }

  // Move the overlay to <body> so it escapes any ancestor with
  // backdrop-filter/transform (which would otherwise trap position:fixed).
  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return { destroy() { node.remove(); } };
  }
</script>

<svelte:window onkeydown={onKey} />

<button class="fitcheck-btn" onclick={openFlow} title="Fit Check">
  <i class="fas fa-camera"></i>
  <span class="fitcheck-label">Fit Check</span>
</button>

{#if open}
  <div class="fc-screen" use:portal>

    {#if stage === 'intro'}
      <!-- ── EXPLAINER ── -->
      <div class="fc-intro">
        <p class="fc-eyebrow">Style Fit Check</p>
        <h2 class="fc-title">Instant style feedback on<br>what you're wearing <em>right now.</em></h2>
        <p class="fc-sub">
          Show us your current fit and get tailored, on-the-spot styling tips -
          what's working, what to tweak, and how to level it up. This isn't generic
          AI guesswork: it's grounded in real colour theory and styling principles,
          personalised to you.
        </p>

        <ul class="fc-steps">
          <li><span class="fc-step-num">1</span> <div><strong>Allow camera access</strong><br><span>So we can see your outfit - nothing is saved without your say-so.</span></div></li>
          <li><span class="fc-step-num">2</span> <div><strong>Prop your phone up &amp; step back</strong><br><span>Stand far enough that your whole outfit, head to shoes, is in frame.</span></div></li>
          <li><span class="fc-step-num">3</span> <div><strong>Get your fit check</strong><br><span>Real, tailored style tips and recommendations in seconds.</span></div></li>
        </ul>

        <button class="fc-cta" onclick={checkMyFit}>Check my fit</button>
        <button class="fc-cancel" onclick={close}>Cancel</button>
      </div>

    {:else if stage === 'requesting'}
      <div class="fc-center">
        <div class="spinner"></div>
        <p class="fc-center-text">Requesting camera access…</p>
      </div>

    {:else if stage === 'denied'}
      <div class="fc-center">
        <div class="fc-icon fc-icon--warn"><i class="fas fa-video-slash"></i></div>
        <h3 class="fc-center-title">Camera access needed</h3>
        <p class="fc-center-text">We need your camera to check your fit. Enable camera access for this site in your browser settings, then try again.</p>
        <button class="fc-cta" onclick={checkMyFit} style="margin-top:20px">Try again</button>
        <button class="fc-cancel" onclick={close}>Close</button>
      </div>

    {:else if stage === 'preview'}
      <!-- ── LIVE PREVIEW + COMING SOON ── -->
      <div class="fc-preview">
        <!-- svelte-ignore a11y_media_has_caption -->
        <video class="fc-video" bind:this={videoEl} autoplay playsinline muted></video>
        <div class="fc-preview__overlay">
          <div class="fc-soon">
            <div class="fc-icon fc-icon--soon"><i class="fas fa-wand-magic-sparkles"></i></div>
            <h3 class="fc-soon__title">Fit Check is almost ready</h3>
            <p class="fc-soon__text">We're putting the final touches on your personal styling engine. It'll be live very soon - thanks for your patience!</p>
            <button class="fc-cta fc-cta--light" onclick={close}>Got it</button>
          </div>
        </div>
      </div>
    {/if}

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

  /* Full-screen takeover */
  .fc-screen {
    position: fixed; inset: 0; z-index: 100000;
    width: 100vw; height: 100vh; height: 100dvh;
    background: var(--clr-off-white);
    display: flex; align-items: center; justify-content: center;
    animation: fadeIn 0.2s ease; overflow-y: auto;
  }

  /* Intro */
  .fc-intro {
    max-width: 460px; width: 100%; padding: 40px 24px;
    display: flex; flex-direction: column; align-items: center; text-align: center;
  }
  .fc-eyebrow { font-size: 11px; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase; color: var(--clr-terracotta); margin-bottom: 16px; }
  .fc-title { font-family: var(--font-display); font-size: clamp(26px, 6vw, 38px); font-weight: 500; line-height: 1.12; letter-spacing: -1px; color: var(--clr-charcoal); margin-bottom: 16px; }
  .fc-title em { font-style: italic; color: var(--clr-terracotta); }
  .fc-sub { font-size: 14px; font-weight: 300; line-height: 1.7; color: var(--clr-taupe); margin-bottom: 28px; }

  .fc-steps { display: flex; flex-direction: column; gap: 14px; width: 100%; text-align: left; margin-bottom: 32px; }
  .fc-steps li { display: flex; gap: 12px; align-items: flex-start; }
  .fc-step-num { flex-shrink: 0; width: 26px; height: 26px; border-radius: 50%; background: var(--clr-charcoal); color: #fff; font-size: 12px; font-weight: 600; display: flex; align-items: center; justify-content: center; }
  .fc-steps strong { font-size: 14px; font-weight: 600; color: var(--clr-charcoal); }
  .fc-steps span { font-size: 12.5px; font-weight: 300; color: var(--clr-taupe); line-height: 1.5; }

  .fc-cta {
    width: 100%; max-width: 320px; background: var(--clr-charcoal); color: #fff;
    border: none; cursor: pointer; font-family: var(--font-body); font-size: 15px;
    font-weight: 500; padding: 16px; border-radius: var(--radius-lg);
    transition: background 0.2s, transform 0.1s;
  }
  .fc-cta:hover { background: var(--clr-brown); }
  .fc-cta:active { transform: scale(0.98); }
  .fc-cta--light { background: #fff; color: var(--clr-charcoal); }
  .fc-cta--light:hover { background: var(--clr-beige); }

  .fc-cancel {
    margin-top: 14px; background: none; border: none; cursor: pointer;
    font-family: var(--font-body); font-size: 13px; color: var(--clr-taupe);
    text-decoration: underline; text-underline-offset: 3px;
  }
  .fc-cancel:hover { color: var(--clr-charcoal); }

  /* Centered states (requesting / denied) */
  .fc-center { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 12px; padding: 40px 24px; max-width: 380px; }
  .fc-center-title { font-family: var(--font-display); font-size: 22px; font-weight: 500; color: var(--clr-charcoal); }
  .fc-center-text { font-size: 14px; font-weight: 300; color: var(--clr-taupe); line-height: 1.6; }
  .fc-icon { width: 60px; height: 60px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 24px; margin-bottom: 4px; }
  .fc-icon--warn { background: #fdf0ee; color: #a33020; }
  .fc-icon--soon { background: rgba(196,144,106,0.18); color: var(--clr-terracotta); }

  /* Preview */
  .fc-preview { position: fixed; inset: 0; background: #000; }
  .fc-video { width: 100%; height: 100%; object-fit: cover; }
  .fc-preview__overlay {
    position: absolute; inset: 0;
    background: linear-gradient(to bottom, rgba(0,0,0,0.2), rgba(0,0,0,0.65));
    display: flex; align-items: flex-end; justify-content: center; padding: 32px 24px 48px;
  }
  .fc-soon { max-width: 380px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 12px; }
  .fc-soon__title { font-family: var(--font-display); font-size: 24px; font-weight: 500; color: #fff; }
  .fc-soon__text { font-size: 14px; font-weight: 300; color: rgba(255,255,255,0.85); line-height: 1.6; margin-bottom: 8px; }
</style>
