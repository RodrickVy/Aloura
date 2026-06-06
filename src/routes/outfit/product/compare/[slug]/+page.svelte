<script lang="ts">
  import { createSupabaseBrowserClient } from '$lib/supabase';
  import BrandChips from '$lib/BrandChips.svelte';
  import ShareButton from '$lib/ShareButton.svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import type { Piece } from '$lib/types';

  let { data } = $props();
  const supabase = createSupabaseBrowserClient();

  // Pieces array - grows as user adds comparisons
  let columns = $state<(Piece & { searching?: boolean; same_store?: boolean; price_verdict?: string; price_delta?: number | null })[]>(data.pieces);
  let addingBrand = $state<string | null>(null);   // chip currently loading
  let addError   = $state('');

  // Base piece (first column) - used as source for all comparisons
  const basePiece = data.pieces[0];
  const ogImage = $derived(basePiece.image_url || `${$page.url.origin}/assets/man_on_chair.jpg`);

  async function onBrandSelect(brand: { id: string; name: string }) {
    // Already showing this brand? Deselect (remove that column)
    const existingIdx = columns.findIndex(
      c => c.store?.toLowerCase() === brand.name.toLowerCase() && c !== basePiece
    );
    if (existingIdx !== -1) {
      columns = columns.filter((_, i) => i !== existingIdx);
      updateUrl(columns);
      return;
    }

    addingBrand = brand.id;
    addError = '';

    // Add a loading placeholder column
    const placeholder = { ...basePiece, id: 'loading-' + brand.id, store: brand.name, searching: true };
    columns = [...columns, placeholder];

    try {
      const { data: result, error } = await supabase.functions.invoke('outfit_store_comparer', {
        body: {
          account_id: 'anonymous',
          mood_board_id: basePiece.mood_board_id,
          store: brand.name,
          products: [{ name: basePiece.name, keywords: basePiece.keywords ?? [], colors: basePiece.colors ?? [], url: basePiece.url ?? undefined, store: basePiece.store ?? undefined, original_price: basePiece.price ?? null }],
        },
      });

      if (error) throw error;

      const found = result.products?.[0];
      if (!found) throw new Error('Not found');

      // Replace placeholder with real result
      columns = columns.map(c =>
        c.id === placeholder.id
          ? { ...basePiece, ...found, id: found.id ?? placeholder.id, slug: found.slug, searching: false }
          : c
      );
      updateUrl(columns);
    } catch {
      addError = `No match found at ${brand.name}.`;
      columns = columns.filter(c => c.id !== placeholder.id);
    } finally {
      addingBrand = null;
    }
  }

  function updateUrl(cols: typeof columns) {
    const slugParts = cols.map(c => c.slug).filter(Boolean);
    if (slugParts.length > 0) {
      goto(`/outfit/product/compare/${slugParts.join('--vs--')}`, { replaceState: true, noScroll: true });
    }
  }

  // Is a given brand already in the columns?
  function activeChip(brandName: string) {
    return columns.some(c => c.store?.toLowerCase() === brandName.toLowerCase()) ? 'active' : null;
  }

  const formatPrice = (p: number | null) => p ? `$${p.toFixed(2)}` : '-';
</script>

<svelte:head>
  <title>Compare: {basePiece.name} - Aloura</title>
  <meta name="description" content="Compare {basePiece.name} across stores - prices and availability on Aloura." />
  <link rel="canonical" href="{$page.url.origin}{$page.url.pathname}" />

  <meta property="og:type"        content="website" />
  <meta property="og:site_name"   content="Aloura" />
  <meta property="og:title"       content="Compare: {basePiece.name}" />
  <meta property="og:description" content="Compare {basePiece.name} across stores - prices and availability on Aloura." />
  <meta property="og:url"         content="{$page.url.origin}{$page.url.pathname}{$page.url.search}" />
  <meta property="og:image"       content={ogImage} />

  <meta name="twitter:card"  content="summary_large_image" />
  <meta name="twitter:title" content="Compare: {basePiece.name}" />
  <meta name="twitter:image" content={ogImage} />
</svelte:head>

<div class="compare-page">

  <!-- STICKY BRAND STRIP -->
  <div class="brand-strip">
    <div class="brand-strip__inner">
      <span class="brand-strip__label">
        {#if addingBrand}
          <span class="strip-spinner"></span> Searching…
        {:else}
          <i class="fas fa-plus-circle" style="color:var(--clr-terracotta)"></i>
          Add another store to compare
        {/if}
      </span>
      <!-- Custom chip rendering so we can show active state per store -->
      <div class="chips-strip">
        {#each [{id:'amazon',name:'Amazon',logo:'/assets/logos/amazon.png'},{id:'asos',name:'ASOS',logo:'/assets/logos/asos.png'},{id:'zara',name:'Zara',logo:'/assets/logos/zara.png'},{id:'hm',name:'H&M',logo:'/assets/logos/hm.png'},{id:'uniqlo',name:'Uniqlo',logo:'/assets/logos/uniqlo.png'},{id:'aritzia',name:'Aritzia',logo:'/assets/logos/aritzia.png'},{id:'nike',name:'Nike',logo:'/assets/logos/nike.png'},{id:'adidas',name:'Adidas',logo:'/assets/logos/adidas.png'},{id:'lululemon',name:'Lululemon',logo:'/assets/logos/lululemon.png'},{id:'shein',name:'SHEIN',logo:'/assets/logos/shein.png'},{id:'abercrombie',name:'Abercrombie',logo:'/assets/logos/abercrombie.png'},{id:'nordstrom',name:'Nordstrom',logo:'/assets/logos/nordstrom.png'},{id:'levis',name:"Levi's",logo:'/assets/logos/levis.png'},{id:'gap',name:'Gap',logo:'/assets/logos/gap.png'}] as brand}
          <button
            class="chip"
            class:active={!!activeChip(brand.name)}
            disabled={addingBrand === brand.id}
            onclick={() => onBrandSelect(brand)}
            title={brand.name}
          >
            <img src={brand.logo} alt={brand.name} class="chip__logo" />
            <span class="chip__name">{brand.name}</span>
            {#if activeChip(brand.name) && brand.name.toLowerCase() !== basePiece.store?.toLowerCase()}
              <span class="chip__remove">×</span>
            {/if}
          </button>
        {/each}
      </div>
    </div>
  </div>

  <div class="container">

    <!-- BREADCRUMB -->
    <nav class="breadcrumb">
      <a href="/">Aloura</a>
      <i class="fas fa-chevron-right"></i>
      {#if data.board}
        <a href="/outfit/{data.board.slug}">{data.board.title}</a>
        <i class="fas fa-chevron-right"></i>
      {/if}
      <a href="/outfit/product/{basePiece.slug}">{basePiece.name}</a>
      <i class="fas fa-chevron-right"></i>
      <span>Compare</span>
    </nav>

    <div class="page-title-row">
      <h1 class="page-title">
        Comparing <em class="text-italic">{basePiece.name}</em>
      </h1>
      <ShareButton variant="pill" label="Share comparison" title="Comparing {basePiece.name}" text="Compare this product across stores on Aloura" />
    </div>
    <p class="page-sub">Select a store above to add it to the comparison.</p>

    {#if addError}
      <p class="add-error"><i class="fas fa-exclamation-circle"></i> {addError}</p>
    {/if}

    <!-- COMPARISON COLUMNS -->
    <div class="compare-grid" style="--cols:{columns.length}">
      {#each columns as col, i}
        <div class="col" class:col--base={i === 0} class:col--loading={col.searching}>

          <!-- Remove button (not for base) -->
          {#if i > 0 && !col.searching}
            <button class="col__remove" onclick={() => { columns = columns.filter((_,ci) => ci !== i); updateUrl(columns); }}>
              <i class="fas fa-times"></i>
            </button>
          {/if}

          <!-- Store header -->
          <div class="col__header">
            <span class="col__store">{col.store ?? 'Original'}</span>
            {#if i === 0}<span class="col__base-tag">Original</span>
            {:else if col.same_store === false && !col.searching}<span class="col__closest-tag">closest match</span>{/if}
          </div>

          <!-- Image -->
          <div class="col__img-wrap">
            {#if col.searching}
              <div class="col__img col__skeleton"></div>
            {:else if col.image_url}
              <img src={col.image_url} alt={col.name ?? ''} class="col__img" loading="lazy" />
            {:else}
              <div class="col__img col__img--ph"><i class="fas fa-tshirt"></i></div>
            {/if}
          </div>

          {#if !col.searching}
            <!-- Name -->
            <div class="col__name">{col.name ?? basePiece.name}</div>

            <!-- Price -->
            <div class="col__price" class:col__price--best={col.price === Math.min(...columns.filter(c => c.price).map(c => c.price!))}>
              {formatPrice(col.price)}
              {#if col.price && col.price === Math.min(...columns.filter(c => c.price).map(c => c.price!))}
                <span class="best-tag">Best price</span>
              {/if}
            </div>

            <!-- Buy button -->
            {#if col.url && col.url !== '#'}
              <a href={col.url} target="_blank" rel="noopener sponsored" class="col__buy btn btn--primary">
                Shop at {col.store ?? 'store'}
              </a>
            {/if}

            <!-- Savings vs original -->
            {#if i > 0 && col.price && columns[0].price}
              {@const diff = columns[0].price - col.price}
              {#if diff > 0}
                <div class="col__saving col__saving--cheaper">Save ${diff.toFixed(0)}</div>
              {:else if diff < 0}
                <div class="col__saving col__saving--pricier">${Math.abs(diff).toFixed(0)} more</div>
              {:else}
                <div class="col__saving">Same price</div>
              {/if}
            {/if}
          {:else}
            <div class="col__name col__name--loading">Finding product…</div>
          {/if}

        </div>
      {/each}
    </div>

    <!-- BACK TO PRODUCT -->
    <div style="margin-top:var(--space-12);text-align:center">
      <a href="/outfit/product/{basePiece.slug}" class="btn btn--ghost">
        <i class="fas fa-arrow-left"></i> Back to product
      </a>
    </div>

  </div>
</div>

<style>
  .compare-page { padding-top: var(--nav-h); padding-bottom: var(--space-20); }

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
  .strip-spinner { width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--clr-light-taupe); border-top-color: var(--clr-terracotta); animation: spin 0.8s linear infinite; flex-shrink: 0; }

  /* Chips */
  .chips-strip { display: flex; gap: 8px; overflow-x: auto; padding: 2px 0 4px; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
  .chips-strip::-webkit-scrollbar { display: none; }
  .chip { display: flex; align-items: center; gap: 6px; flex-shrink: 0; height: 32px; padding: 0 10px 0 6px; background: var(--clr-cream); border: 1.5px solid var(--clr-border); border-radius: 999px; cursor: pointer; transition: background var(--dur-fast), border-color var(--dur-fast); font-family: var(--font-body); }
  .chip:hover { background: var(--clr-beige); border-color: var(--clr-light-taupe); }
  .chip.active { background: var(--clr-charcoal); border-color: var(--clr-charcoal); }
  .chip.active .chip__name { color: rgba(255,255,255,0.92); }
  .chip.active .chip__logo { filter: brightness(0) invert(1); }
  .chip:disabled { opacity: 0.5; cursor: not-allowed; }
  .chip__logo { width: 20px; height: 20px; border-radius: 50%; object-fit: contain; background: white; padding: 2px; flex-shrink: 0; }
  .chip__name { font-size: 12px; font-weight: 500; color: var(--clr-charcoal); white-space: nowrap; transition: color var(--dur-fast); }
  .chip__remove { font-size: 14px; color: rgba(255,255,255,0.7); margin-left: 2px; line-height: 1; }

  /* ── Page header ── */
  .breadcrumb { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding-top: var(--space-6); padding-bottom: var(--space-4); font-size: var(--text-xs); color: var(--clr-text-muted); }
  .breadcrumb a { color: var(--clr-taupe); transition: color var(--dur-fast); }
  .breadcrumb a:hover { color: var(--clr-charcoal); }
  .breadcrumb i { font-size: 9px; }
  .breadcrumb span { color: var(--clr-charcoal); font-weight: 500; }

  .page-title-row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); margin-bottom: var(--space-2); flex-wrap: wrap; }
  .page-title { font-family: var(--font-display); font-size: clamp(24px, 4vw, 40px); font-weight: 500; }
  .page-sub { font-size: var(--text-sm); color: var(--clr-text-muted); margin-bottom: var(--space-8); }
  .add-error { font-size: var(--text-sm); color: #a33020; margin-bottom: var(--space-4); display: flex; align-items: center; gap: 6px; }

  /* ── Compare grid ── */
  .compare-grid {
    display: grid;
    grid-template-columns: repeat(var(--cols, 2), 1fr);
    gap: var(--space-4);
    align-items: start;
  }

  .col {
    background: var(--clr-cream); border: 1px solid var(--clr-border);
    border-radius: var(--radius-xl); overflow: hidden;
    position: relative; transition: box-shadow var(--dur-base);
  }
  .col--base { border-color: var(--clr-charcoal); border-width: 2px; }
  .col:hover { box-shadow: var(--shadow-md); }
  .col--loading { opacity: 0.7; }

  .col__remove {
    position: absolute; top: 10px; right: 10px; z-index: 2;
    background: white; border: 1px solid var(--clr-border); border-radius: 50%;
    width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
    cursor: pointer; font-size: 12px; color: var(--clr-taupe);
    transition: background var(--dur-fast), color var(--dur-fast);
  }
  .col__remove:hover { background: #fdf0ee; color: #a33020; border-color: #f5c6c0; }

  .col__header {
    display: flex; align-items: center; justify-content: space-between;
    padding: var(--space-4) var(--space-4) 0;
  }
  .col__store { font-size: var(--text-xs); font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--clr-taupe); }
  .col__base-tag { background: var(--clr-charcoal); color: white; border-radius: 999px; padding: 2px 8px; font-size: 9px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; }
  .col__closest-tag { background: var(--clr-beige); color: var(--clr-brown); border-radius: 999px; padding: 2px 8px; font-size: 9px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }

  .col__img-wrap { padding: var(--space-3); }
  .col__img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: var(--radius-lg); display: block; }
  .col__img--ph { background: var(--clr-light-taupe); display: flex; align-items: center; justify-content: center; color: var(--clr-taupe); font-size: 32px; }
  .col__skeleton { background: var(--clr-light-taupe); animation: shimmer 1.2s ease infinite; }

  .col__name { padding: 0 var(--space-4) var(--space-3); font-size: var(--text-sm); font-weight: 500; color: var(--clr-charcoal); line-height: 1.4; }
  .col__name--loading { color: var(--clr-text-muted); font-weight: 300; font-style: italic; }

  .col__price {
    padding: 0 var(--space-4) var(--space-3);
    font-family: var(--font-display); font-size: var(--text-2xl); font-weight: 600;
    color: var(--clr-charcoal); display: flex; align-items: center; gap: 8px;
  }
  .col__price--best { color: #2a7a4b; }
  .best-tag { background: rgba(42,122,75,0.1); color: #2a7a4b; border-radius: 999px; padding: 3px 10px; font-size: 10px; font-weight: 600; font-family: var(--font-body); }

  .col__buy {
    display: block; margin: 0 var(--space-4) var(--space-3);
    text-align: center; font-size: 12px; padding: 10px 16px; text-decoration: none;
  }

  .col__saving {
    margin: 0 var(--space-4) var(--space-4);
    font-size: var(--text-xs); font-weight: 600; text-align: center;
    padding: 4px 0; border-radius: 999px;
    background: var(--clr-beige); color: var(--clr-taupe);
  }
  .col__saving--cheaper { background: rgba(42,122,75,0.08); color: #2a7a4b; }
  .col__saving--pricier { background: rgba(196,80,60,0.08); color: #a33020; }

  @media (max-width: 640px) {
    .compare-grid { grid-template-columns: repeat(2, 1fr) !important; }
  }
</style>
