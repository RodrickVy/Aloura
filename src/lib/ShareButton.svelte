<script lang="ts">
  interface Props {
    /** Path or full URL to share. Defaults to current page. */
    url?:    string;
    title?:  string;
    text?:   string;
    /** 'icon' = round icon button, 'pill' = icon + label */
    variant?: 'icon' | 'pill';
    label?:  string;
    /** Fired when the user initiates a share (for analytics). */
    onShare?: () => void;
  }

  let {
    url     = '',
    title   = 'Aloura',
    text    = 'Check this out on Aloura',
    variant = 'pill',
    label   = 'Share',
    onShare,
  }: Props = $props();

  let copied = $state(false);

  function resolveUrl(): string {
    if (!url) return typeof window !== 'undefined' ? window.location.href : '';
    if (url.startsWith('http')) return url;
    return typeof window !== 'undefined' ? `${window.location.origin}${url}` : url;
  }

  async function share() {
    onShare?.();
    const shareUrl = resolveUrl();

    // Native share sheet (mobile + some desktops)
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title, text, url: shareUrl });
        return;
      } catch {
        // user cancelled or unsupported - fall through to copy
      }
    }

    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(shareUrl);
      copied = true;
      setTimeout(() => copied = false, 1800);
    } catch {
      // last resort - do nothing visible
    }
  }
</script>

<button
  class="share-btn share-btn--{variant}"
  class:copied
  onclick={share}
  aria-label="Share"
  title="Share"
>
  {#if copied}
    <i class="fas fa-check"></i>
    {#if variant === 'pill'}<span>Copied!</span>{/if}
  {:else}
    <i class="fas fa-arrow-up-from-bracket"></i>
    {#if variant === 'pill'}<span>{label}</span>{/if}
  {/if}
</button>

<style>
  .share-btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 7px;
    font-family: var(--font-body); font-weight: 500; cursor: pointer;
    border: 1.5px solid var(--clr-border); background: #fff; color: var(--clr-charcoal);
    transition: background 0.15s, border-color 0.15s, color 0.15s, transform 0.1s;
  }
  .share-btn:hover { background: var(--clr-beige); border-color: var(--clr-light-taupe); }
  .share-btn:active { transform: scale(0.96); }
  .share-btn.copied { background: #dcfce7; border-color: #86efac; color: #16a34a; }

  .share-btn--pill { height: 36px; padding: 0 16px; border-radius: 999px; font-size: 13px; }
  .share-btn--icon { width: 36px; height: 36px; border-radius: 50%; font-size: 13px; }
</style>
