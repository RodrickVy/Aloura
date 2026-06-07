<script lang="ts">
  import { createSupabaseBrowserClient } from '$lib/supabase';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import BrandChips from '$lib/BrandChips.svelte';
  import AuthModal from '$lib/AuthModal.svelte';
  import ShareButton from '$lib/ShareButton.svelte';
  import TrackButton from '$lib/TrackButton.svelte';
  import { track } from '$lib/analytics';
  import type { MoodBoard, Piece } from '$lib/types';

  let { data } = $props();
  const supabase = createSupabaseBrowserClient();

  const board: MoodBoard = data.board;
  const isLoggedIn = data.isLoggedIn;

  const displayPieces = board.pieces ?? [];
  const totalPrice = displayPieces.reduce((s: number, p: any) => s + (p.price ?? 0), 0);

  // Social preview image: board image → first piece image → site default (all absolute)
  const ogImage = $derived(
    board.image_url
      || displayPieces.find((p: any) => p.image_url)?.image_url
      || `${$page.url.origin}/assets/man_on_chair.jpg`
  );

  let authOpen     = $state(false);
  let authPrompt   = $state('');
  let authReturnTo = $state('');

  async function onBrandSelect(brand: { id: string; name: string }) {
    const target = `/outfit/compare/${board.slug}?stores=${brand.name.toLowerCase()}`;
    // Comparing creates a board - gate logged-out visitors, return them here after auth
    if (!isLoggedIn) {
      authReturnTo = target;
      authPrompt = 'Sign up to compare this outfit across stores.';
      authOpen = true;
      return;
    }
    goto(target);
  }
</script>

<svelte:head>
  <title>{board.title} - Aloura Outfit</title>
  <meta name="description" content={board.description ?? `A curated outfit for ${board.occasion} from Aloura.`} />
  <link rel="canonical" href="{$page.url.origin}/outfit/{board.slug}" />

  <meta property="og:type"        content="website" />
  <meta property="og:site_name"   content="Aloura" />
  <meta property="og:title"       content="{board.title} - Aloura" />
  <meta property="og:description" content={board.description ?? `A curated outfit for ${board.occasion} from Aloura.`} />
  <meta property="og:url"         content="{$page.url.origin}/outfit/{board.slug}" />
  <meta property="og:image"       content={ogImage} />
  <meta property="og:image:width"  content="1200" />
  <meta property="og:image:height" content="1200" />

  <meta name="twitter:card"        content="summary_large_image" />
  <meta name="twitter:title"       content="{board.title} - Aloura" />
  <meta name="twitter:description" content={board.description ?? ''} />
  <meta name="twitter:image"       content={ogImage} />
</svelte:head>

<div class="outfit-page">

  <!-- STICKY BRAND STRIP -->
  <div class="brand-strip">
    <div class="brand-strip__inner">
      <span class="brand-strip__label">Compare this at another store</span>
      <BrandChips onselect={onBrandSelect} />
    </div>
  </div>

  <div class="container">

    <!-- HERO -->
    <div class="outfit-hero">
      {#if board.image_url}
        <img src={board.image_url} alt={board.title} class="outfit-hero__img" />
      {/if}
      <div class="outfit-hero__info">
        <div class="outfit-title-row">
          <h1 class="outfit-title">{board.title}</h1>
          <div class="outfit-actions">
            <TrackButton variant="icon" productName={board.title} onTrack={() => track(supabase, null, 'product_tracks')} />
            <ShareButton variant="icon" title={board.title} text="Check out this outfit on Aloura" onShare={() => track(supabase, null, 'shares')} />
          </div>
        </div>
        <div class="outfit-meta">
          <div class="outfit-meta__item">
            <span class="outfit-meta__label">Est. total</span>
            <span class="outfit-meta__value">${totalPrice.toFixed(0)}</span>
          </div>
          <div class="outfit-meta__item">
            <span class="outfit-meta__label">Pieces</span>
            <span class="outfit-meta__value">{displayPieces.length}</span>
          </div>
        </div>
        {#if board.colors?.length}
          <div class="outfit-colors">
            {#each board.colors as hex}
              <div class="outfit-color-dot" style="background:{hex}" title={hex}></div>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    <!-- PIECES LIST -->
    <section class="pieces-section">
      <div class="pieces-list">
        {#each displayPieces as piece, i}
          <a
            class="piece-row"
            href={piece.slug ? `/outfit/product/${piece.slug}` : (piece.url ?? '#')}
            target={piece.slug ? '_self' : '_blank'}
            rel={piece.slug ? '' : 'noopener sponsored'}
            onclick={() => track(supabase, null, 'buy_clicks')}
          >
            <!-- Image -->
            <div class="piece-row__img-wrap">
              {#if piece.image_url}
                <img src={piece.image_url} alt={piece.name ?? ''} class="piece-row__img" loading="lazy" />
              {:else}
                <div class="piece-row__img piece-row__img--ph"><i class="fas fa-tshirt"></i></div>
              {/if}
            </div>

            <!-- Info -->
            <div class="piece-row__info">
              <div class="piece-row__brand">
                {piece.store ?? 'Online'}
              </div>
              <div class="piece-row__name">{piece.name ?? 'Item'}</div>
              {#if piece.description}
                <div class="piece-row__desc">{piece.description}</div>
              {/if}
            </div>

            <!-- Price + caret -->
            <div class="piece-row__right">
              {#if piece.price}
                <span class="piece-row__price">${piece.price.toFixed(0)}</span>
              {/if}
              <i class="fas fa-chevron-right piece-row__caret"></i>
            </div>
          </a>
        {/each}
      </div>
    </section>


  </div>
</div>

<AuthModal bind:open={authOpen} mode="signup" prompt={authPrompt} returnTo={authReturnTo} />

<style>
  .outfit-page { padding-top: var(--nav-h); padding-bottom: var(--space-20); }

  /* ── Brand strip ── */
  .brand-strip {
    position: sticky; top: var(--nav-h); z-index: 100;
    background: rgba(253,251,248,0.96); backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--clr-border);
    padding: 10px var(--page-px) 8px;
  }
  .brand-strip__inner { max-width: var(--max-w); margin: 0 auto; }
  .brand-strip__label { display: block; font-size: var(--text-xs); color: var(--clr-text-muted); margin-bottom: 8px; }
  .clear-btn {
    background: none; border: none; cursor: pointer;
    font-size: var(--text-xs); color: var(--clr-terracotta);
    font-family: var(--font-body); padding: 0; margin-left: 4px;
    display: flex; align-items: center; gap: 4px;
  }
  .strip-spinner {
    width: 12px; height: 12px; border-radius: 50%;
    border: 2px solid var(--clr-light-taupe); border-top-color: var(--clr-terracotta);
    animation: spin 0.8s linear infinite; flex-shrink: 0;
  }

  /* ── Hero ── */
  .outfit-hero { display: flex; flex-direction: column; gap: var(--space-8); padding-top: var(--space-10); margin-bottom: var(--space-12); }
  .outfit-hero__img { width: 100%; max-width: 360px; border-radius: var(--radius-xl); box-shadow: var(--shadow-lg); object-fit: cover; aspect-ratio: 3/4; }
  .outfit-title-row { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-3); margin-bottom: var(--space-5); }
  .outfit-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
  .outfit-title { font-family: var(--font-display); font-size: clamp(20px, 3vw, 28px); font-weight: 500; line-height: 1.2; letter-spacing: -0.3px; color: var(--clr-charcoal); }

  .outfit-meta { display: flex; gap: var(--space-5); margin-top: var(--space-4); }
  .outfit-meta__item { display: flex; flex-direction: column; gap: 2px; }
  .outfit-meta__label { font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.08em; color: var(--clr-text-muted); font-weight: 500; }
  .outfit-meta__value { font-family: var(--font-display); font-size: var(--text-2xl); font-weight: 500; }
  .outfit-colors { display: flex; gap: var(--space-2); margin-top: var(--space-4); flex-wrap: wrap; }
  .outfit-color-dot { width: 28px; height: 28px; border-radius: 50%; border: 2px solid var(--clr-off-white); box-shadow: var(--shadow-sm); }

  /* ── Pieces list ── */
  .pieces-section { margin-bottom: var(--space-16); }
  .section-title { font-family: var(--font-display); font-size: var(--text-2xl); font-weight: 500; margin-bottom: var(--space-6); }
  .compare-error { font-size: var(--text-sm); color: #a33020; margin-bottom: var(--space-4); display: flex; align-items: center; gap: var(--space-2); }

  .pieces-list { display: flex; flex-direction: column; border: 1px solid var(--clr-border); border-radius: var(--radius-xl); overflow: hidden; }

  .piece-row {
    display: flex; align-items: center; gap: var(--space-4);
    padding: var(--space-4); text-decoration: none; color: inherit;
    border-bottom: 1px solid var(--clr-border);
    transition: background var(--dur-fast);
  }
  .piece-row:last-child { border-bottom: none; }
  .piece-row:hover { background: var(--clr-cream); }

  .piece-row__img-wrap { flex-shrink: 0; }
  .piece-row__img {
    width: 64px; height: 64px; border-radius: var(--radius-md);
    object-fit: cover; display: block;
  }
  .piece-row__img--ph {
    background: var(--clr-light-taupe); display: flex; align-items: center;
    justify-content: center; color: var(--clr-taupe); font-size: 20px;
  }
  .piece-row__skeleton { background: var(--clr-light-taupe); animation: shimmer 1.2s ease infinite; }

  .piece-row__info { flex: 1; min-width: 0; }
  .piece-row__brand {
    font-size: var(--text-xs); font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.08em; color: var(--clr-taupe); margin-bottom: 3px;
    display: flex; align-items: center; gap: 6px;
  }
  .piece-row__name { font-size: var(--text-sm); font-weight: 500; color: var(--clr-charcoal); line-height: 1.4; margin-bottom: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .piece-row__desc { font-size: var(--text-xs); font-weight: 300; color: var(--clr-text-muted); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-top: 2px; }

  .piece-row__right { display: flex; align-items: center; gap: var(--space-3); flex-shrink: 0; }
  .piece-row__price { font-family: var(--font-display); font-size: var(--text-lg); font-weight: 500; color: var(--clr-charcoal); }
  .piece-row__caret { font-size: 11px; color: var(--clr-light-taupe); }

  .compared-badge {
    background: rgba(196,144,106,0.12); color: var(--clr-terracotta);
    border-radius: 999px; padding: 2px 8px; font-size: 9px;
    font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;
  }

  /* ── CTA ── */
  .outfit-cta { background: var(--clr-beige); border-radius: var(--radius-xl); padding: var(--space-12); text-align: center; }

  @media (min-width: 640px) { .outfit-hero { flex-direction: row; align-items: flex-start; } }
</style>
