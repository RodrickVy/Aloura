<script lang="ts">
  import { createSupabaseBrowserClient } from '$lib/supabase';
  import BrandChips from '$lib/BrandChips.svelte';
  import ShareButton from '$lib/ShareButton.svelte';
  import TrackButton from '$lib/TrackButton.svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { track } from '$lib/analytics';
  import type { Piece } from '$lib/types';

  let { data } = $props();
  const supabase = createSupabaseBrowserClient();

  const originalPiece: Piece = data.piece;
  const board = data.board;

  const ogImage = $derived(originalPiece.image_url || `${$page.url.origin}/assets/man_on_chair.jpg`);

  let selectedBrand = $state<string | null>(null);
  let searching = $state(false);
  let searchError = $state('');

  async function onBrandSelect(brand: { id: string; name: string }) {
    if (selectedBrand === brand.id) { selectedBrand = null; searchError = ''; return; }

    selectedBrand = brand.id;
    searching = true;
    searchError = '';

    try {
      const { data: result, error } = await supabase.functions.invoke('outfit_store_comparer', {
        body: {
          account_id: 'anonymous',
          mood_board_id: originalPiece.mood_board_id,
          store: brand.name,
          products: [{ name: originalPiece.name, keywords: originalPiece.keywords ?? [], colors: originalPiece.colors ?? [], url: originalPiece.url ?? undefined, store: originalPiece.store ?? undefined, original_price: originalPiece.price ?? null }],
        },
      });
      if (error) throw error;

      const found = result.products?.[0];
      if (!found?.slug) throw new Error('No slug returned');

      // Navigate to compare page
      track(supabase, null, 'comparisons');
      goto(`/outfit/product/compare/${originalPiece.slug}--vs--${found.slug}`);
    } catch {
      searchError = `No match found at ${brand.name}. Try another store.`;
      selectedBrand = null;
    } finally {
      searching = false;
    }
  }
</script>

<svelte:head>
  <title>{originalPiece.name} - {originalPiece.store ?? 'Aloura'}</title>
  <meta name="description" content="Shop {originalPiece.name} from {originalPiece.store ?? 'top stores'}. Compare prices across stores on Aloura." />
  <link rel="canonical" href="{$page.url.origin}/outfit/product/{originalPiece.slug}" />

  <meta property="og:type"        content="product" />
  <meta property="og:site_name"   content="Aloura" />
  <meta property="og:title"       content="{originalPiece.name} - {originalPiece.store ?? 'Aloura'}" />
  <meta property="og:description" content="Shop {originalPiece.name} from {originalPiece.store ?? 'top stores'}. Compare prices across stores on Aloura." />
  <meta property="og:url"         content="{$page.url.origin}/outfit/product/{originalPiece.slug}" />
  <meta property="og:image"       content={ogImage} />

  <meta name="twitter:card"  content="summary_large_image" />
  <meta name="twitter:title" content={originalPiece.name} />
  <meta name="twitter:image" content={ogImage} />
  <script type="application/ld+json">
    {JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Product",
      "name": originalPiece.name,
      "image": originalPiece.image_url,
      "offers": {
        "@type": "Offer",
        "price": originalPiece.price,
        "priceCurrency": "USD",
        "url": originalPiece.url,
        "seller": { "@type": "Organization", "name": originalPiece.store ?? "Online" }
      }
    })}
  </script>
</svelte:head>

<div class="product-page">

  <!-- STICKY BRAND STRIP -->
  <div class="brand-strip">
    <div class="brand-strip__inner">
      <span class="brand-strip__label">
        {#if searching}
          <span class="strip-spinner"></span> Finding at store - opening comparison…
        {:else}
          Compare this at another store
        {/if}
      </span>
      <BrandChips selected={selectedBrand} onselect={onBrandSelect} />
    </div>
  </div>

  <div class="container">

    <!-- BREADCRUMB -->
    <nav class="breadcrumb">
      <a href="/">Aloura</a>
      <i class="fas fa-chevron-right"></i>
      {#if board}
        <a href="/outfit/{board.slug}">{board.title}</a>
        <i class="fas fa-chevron-right"></i>
      {/if}
      <span>{originalPiece.name}</span>
    </nav>

    <!-- PRODUCT CARD -->
    <div class="product">
      <!-- Image -->
      <div class="product__img-wrap">
        {#if searching}
          <div class="product__img product__skeleton"></div>
        {:else if originalPiece.image_url}
          <img src={originalPiece.image_url} alt={originalPiece.name ?? ''} class="product__img" />
        {:else}
          <div class="product__img product__img--ph"><i class="fas fa-tshirt"></i></div>
        {/if}
      </div>

      <!-- Details -->
      <div class="product__details">
        <div class="product__store-row">
          <div class="product__store">{originalPiece.store ?? 'Online'}</div>
          <div class="product__actions">
            <TrackButton variant="icon" productName={originalPiece.name ?? 'this product'} onTrack={() => track(supabase, null, 'product_tracks')} />
            <ShareButton variant="icon" title={originalPiece.name ?? 'Product'} text="Check out this piece on Aloura" onShare={() => track(supabase, null, 'shares')} />
          </div>
        </div>
        <h1 class="product__name">{originalPiece.name ?? originalPiece.name}</h1>

        {#if originalPiece.price}
          <div class="product__price">${originalPiece.price.toFixed(2)}</div>
        {/if}

        {#if originalPiece.description}
          <p class="product__style">{originalPiece.description}</p>
        {/if}

        {#if originalPiece.colors?.length}
          <div class="product__colors">
            {#each originalPiece.colors as hex}
              <div class="color-dot" style="background:{hex}" title={hex}></div>
            {/each}
          </div>
        {/if}

        {#if searchError}
          <p class="search-error"><i class="fas fa-exclamation-circle"></i> {searchError}</p>
        {/if}

        <div class="product__actions">
          {#if originalPiece.url && originalPiece.url !== '#'}
            <a href={originalPiece.url} target="_blank" rel="noopener sponsored" class="btn btn--primary btn--lg" onclick={() => track(supabase, null, 'buy_clicks')}>
              <i class="fas fa-shopping-bag"></i>
              Shop now
            </a>
          {/if}
          {#if board}
            <a href="/outfit/{board.slug}" class="btn btn--ghost btn--lg">
              <i class="fas fa-arrow-left"></i> Back to outfit
            </a>
          {/if}
        </div>

        {#if originalPiece.keywords?.length}
          <div class="product__keywords">
            {#each originalPiece.keywords as kw}
              <span class="kw-chip">{kw}</span>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    <!-- SEE FULL OUTFIT -->
    {#if board}
      <section class="outfit-ref">
        <p class="eyebrow" style="margin-bottom:var(--space-4)">Part of this outfit</p>
        <a href="/outfit/{board.slug}" class="outfit-ref__card">
          {#if board.image_url}
            <img src={board.image_url} alt={board.title} class="outfit-ref__img" />
          {/if}
          <div class="outfit-ref__info">
            <div class="outfit-ref__title">{board.title}</div>
            {#if board.occasion}<div class="outfit-ref__occ">{board.occasion}</div>{/if}
          </div>
          <i class="fas fa-chevron-right" style="color:var(--clr-light-taupe);margin-left:auto"></i>
        </a>
      </section>
    {/if}

  </div>
</div>

<style>
  .product-page { padding-top: var(--nav-h); padding-bottom: var(--space-20); }

  /* ── Brand strip ── */
  .brand-strip {
    position: sticky; top: var(--nav-h); z-index: 100;
    background: rgba(253,251,248,0.96); backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--clr-border); padding: 10px var(--page-px) 8px;
  }
  .brand-strip__inner { max-width: var(--max-w); margin: 0 auto; }
  .brand-strip__label {
    display: flex; align-items: center; gap: 8px;
    font-size: var(--text-xs); color: var(--clr-text-muted); margin-bottom: 8px;
  }
  .brand-strip__label strong { color: var(--clr-charcoal); font-weight: 600; }

  .strip-spinner { width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--clr-light-taupe); border-top-color: var(--clr-terracotta); animation: spin 0.8s linear infinite; flex-shrink: 0; }

  /* ── Breadcrumb ── */
  .breadcrumb {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    padding-top: var(--space-6); padding-bottom: var(--space-8);
    font-size: var(--text-xs); color: var(--clr-text-muted);
  }
  .breadcrumb a { color: var(--clr-taupe); transition: color var(--dur-fast); }
  .breadcrumb a:hover { color: var(--clr-charcoal); }
  .breadcrumb i { font-size: 9px; }
  .breadcrumb span { color: var(--clr-charcoal); font-weight: 500; }

  /* ── Product layout ── */
  .product { display: flex; flex-direction: column; gap: var(--space-8); margin-bottom: var(--space-16); }

  .product__img-wrap { position: relative; flex-shrink: 0; }
  .product__img {
    width: 100%; max-width: 480px; aspect-ratio: 1;
    object-fit: cover; border-radius: var(--radius-xl);
    display: block; background: var(--clr-light-taupe);
  }
  .product__img--ph { display: flex; align-items: center; justify-content: center; color: var(--clr-taupe); font-size: 48px; }
  .product__skeleton { animation: shimmer 1.2s ease infinite; }
  .compared-tag {
    position: absolute; top: 12px; left: 12px;
    background: var(--clr-terracotta); color: white;
    border-radius: 999px; padding: 4px 12px; font-size: 11px; font-weight: 600;
  }

  .product__store-row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); margin-bottom: var(--space-3); }
  .product__actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
  .product__store { font-size: var(--text-xs); font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--clr-taupe); }
  .product__name { font-family: var(--font-display); font-size: clamp(22px, 4vw, 36px); font-weight: 500; line-height: 1.2; margin-bottom: var(--space-4); color: var(--clr-charcoal); }
  .product__price { font-family: var(--font-display); font-size: var(--text-3xl); font-weight: 600; color: var(--clr-charcoal); margin-bottom: var(--space-4); }
  .product__style { font-size: var(--text-sm); font-weight: 300; color: var(--clr-text-muted); line-height: 1.7; margin-bottom: var(--space-5); }
  .product__colors { display: flex; gap: var(--space-2); margin-bottom: var(--space-6); flex-wrap: wrap; }
  .color-dot { width: 28px; height: 28px; border-radius: 50%; border: 2px solid var(--clr-off-white); box-shadow: var(--shadow-sm); }
  .product__actions { display: flex; flex-wrap: wrap; gap: var(--space-3); margin-bottom: var(--space-6); }
  .product__keywords { display: flex; flex-wrap: wrap; gap: var(--space-2); }
  .kw-chip { background: var(--clr-beige); border-radius: 999px; padding: 4px 12px; font-size: var(--text-xs); color: var(--clr-taupe); }
  .search-error { font-size: var(--text-sm); color: #a33020; margin-bottom: var(--space-4); display: flex; align-items: center; gap: var(--space-2); }

  /* ── Outfit ref ── */
  .outfit-ref { margin-bottom: var(--space-12); }
  .outfit-ref__card {
    display: flex; align-items: center; gap: var(--space-4);
    background: var(--clr-cream); border: 1px solid var(--clr-border);
    border-radius: var(--radius-xl); padding: var(--space-4);
    text-decoration: none; color: inherit; transition: box-shadow var(--dur-base);
  }
  .outfit-ref__card:hover { box-shadow: var(--shadow-md); }
  .outfit-ref__img { width: 64px; height: 64px; border-radius: var(--radius-lg); object-fit: cover; flex-shrink: 0; }
  .outfit-ref__title { font-size: var(--text-sm); font-weight: 600; color: var(--clr-charcoal); margin-bottom: 2px; }
  .outfit-ref__occ { font-size: var(--text-xs); color: var(--clr-taupe); }


  @media (min-width: 640px) {
    .product { flex-direction: row; align-items: flex-start; }
    .product__img-wrap { width: 50%; }
    .product__details { flex: 1; }
  }
</style>
