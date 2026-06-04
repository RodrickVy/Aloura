<script lang="ts">
  import { createSupabaseBrowserClient } from '$lib/supabase';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import FitCheck from '$lib/FitCheck.svelte';
  import AuthModal from '$lib/AuthModal.svelte';
  import ShareButton from '$lib/ShareButton.svelte';
  import { track } from '$lib/analytics';

  let { data } = $props();
  const supabase = createSupabaseBrowserClient();

  const BRANDS = [
    { id:'amazon',         name:'Amazon',          logo:'/assets/logos/amazon.png' },
    { id:'asos',           name:'ASOS',            logo:'/assets/logos/asos.png' },
    { id:'zara',           name:'Zara',            logo:'/assets/logos/zara.png' },
    { id:'hm',             name:'H&M',             logo:'/assets/logos/hm.png' },
    { id:'uniqlo',         name:'Uniqlo',          logo:'/assets/logos/uniqlo.png' },
    { id:'aritzia',        name:'Aritzia',         logo:'/assets/logos/aritzia.png' },
    { id:'nike',           name:'Nike',            logo:'/assets/logos/nike.png' },
    { id:'adidas',         name:'Adidas',          logo:'/assets/logos/adidas.png' },
    { id:'lululemon',      name:'Lululemon',       logo:'/assets/logos/lululemon.png' },
    { id:'shein',          name:'SHEIN',           logo:'/assets/logos/shein.png' },
    { id:'abercrombie',    name:'Abercrombie',     logo:'/assets/logos/abercrombie.png' },
    { id:'nordstrom',      name:'Nordstrom',       logo:'/assets/logos/nordstrom.png' },
    { id:'urbanoutfitters',name:'Urban Outfitters',logo:'/assets/logos/urbanoutfitters.png' },
    { id:'levis',          name:"Levi's",          logo:'/assets/logos/levis.png' },
    { id:'gap',            name:'Gap',             logo:'/assets/logos/gap.png' },
    { id:'oldnavy',        name:'Old Navy',        logo:'/assets/logos/oldnavy.png' },
    { id:'ssense',         name:'SSENSE',          logo:'/assets/logos/ssense.png' },
    { id:'hollister',      name:'Hollister',       logo:'/assets/logos/hollister.png' },
  ];

  const original = data.original;

  // Columns: original + comparison boards, keyed by store_name
  interface Column {
    store:    string;
    board_id: string | null;
    pieces:   any[];
    loading:  boolean;
    error:    string;
  }

  // Build initial columns from server data
  function buildColumns(): Column[] {
    const cols: Column[] = [];
    for (const storeName of data.storeNames) {
      const existing = data.comparisonBoards.find((b: any) => b.store_name === storeName);
      cols.push({
        store:    storeName,
        board_id: existing?.id ?? null,
        pieces:   existing?.pieces ?? [],
        loading:  !existing, // if no board yet, will load client-side
        error:    '',
      });
    }
    return cols;
  }

  let columns     = $state<Column[]>(buildColumns());
  let addingStore = $state<string | null>(null);
  const accountId  = data.viewerAccountId ?? null;
  const isLoggedIn = data.isLoggedIn;
  let sortByPrice = $state(false);

  // Auth prompt for logged-out visitors who try to add a store
  let authOpen     = $state(false);
  let authPrompt   = $state('');
  let authReturnTo = $state('');

  // Sort columns by total price (cheapest first), keeping original always first
  const sortedColumns = $derived(
    sortByPrice
      ? [...columns].sort((a, b) => total(a.pieces) - total(b.pieces))
      : columns
  );

  // Total price helper
  const total = (pieces: any[]) => pieces.reduce((s, p) => s + (p.price ?? 0), 0);

  // On mount: for any columns without a board yet, create them (logged-in only).
  // Anonymous visitors only see comparison boards that already exist (shared links).
  import { onMount } from 'svelte';
  onMount(async () => {
    if (!isLoggedIn) {
      // Drop any requested stores that have no generated board — anon can't create them
      const pruned = columns.filter(c => c.board_id);
      if (pruned.length !== columns.length) { columns = pruned; updateUrl(); }
      return;
    }
    for (const col of columns) {
      if (!col.board_id) {
        await createComparisonBoard(col.store);
      }
    }
  });

  async function createComparisonBoard(storeName: string) {
    // Set loading
    columns = columns.map(c => c.store === storeName ? { ...c, loading: true, error: '' } : c);

    try {
      // 1. Copy original board
      const { data: newBoard, error: bErr } = await supabase
        .from('mood_boards')
        .insert({
          account_id:     accountId,                 // owned by the viewer creating it
          style_report_id: original.style_report_id,
          title:          original.title,
          description:    original.description,
          occasion:       original.occasion,
          goal:           original.goal,
          colors:         original.colors,
          image_url:      original.image_url,
          public:         original.public,            // inherit shareability from the parent
          comparison_of:  original.id,
          store_name:     storeName.toLowerCase(),
          slug:           null, // will be auto-generated by trigger or left null
        })
        .select('id')
        .single();

      if (bErr || !newBoard) throw new Error(bErr?.message ?? 'Failed to create comparison board');

      // 2. Search products at this store
      const { data: result, error: cErr } = await supabase.functions.invoke('outfit_store_comparer', {
        body: {
          account_id:    accountId,
          mood_board_id: newBoard.id,
          store:         storeName,
          products:      (original.pieces ?? []).map((p: any) => ({
            name:     p.name,
            keywords: p.keywords ?? [],
            colors:   p.colors ?? [],
            url:      p.url ?? undefined,
            store:    p.store ?? undefined,
          })),
        },
      });

      if (cErr) throw new Error(cErr.message);

      const pieces = (result?.products ?? []).filter(Boolean);

      // 3. Update column with results
      columns = columns.map(c =>
        c.store === storeName
          ? { ...c, board_id: newBoard.id, pieces, loading: false }
          : c
      );

    } catch (e: any) {
      columns = columns.map(c =>
        c.store === storeName ? { ...c, loading: false, error: 'Could not load results for this store.' } : c
      );
    }
  }

  async function addStore(brand: { id: string; name: string }) {
    const storeName = brand.name.toLowerCase();

    // Already in columns — remove it (allowed for everyone, no write involved)
    if (columns.some(c => c.store === storeName)) {
      columns = columns.filter(c => c.store !== storeName);
      updateUrl();
      return;
    }

    // Adding a new store creates a comparison board — require sign-up.
    // Return them here with the new store already in the URL so it auto-creates.
    if (!isLoggedIn || !accountId) {
      const stores = [...columns.map(c => c.store), storeName].join(',');
      authReturnTo = `/outfit/compare/${original.slug}?stores=${stores}`;
      authPrompt = 'Sign up to compare this outfit across stores.';
      authOpen = true;
      return;
    }

    track(supabase, accountId, 'mood_board_comparisons');
    addingStore = brand.id;

    // Check if comparison board already exists
    const { data: existing } = await supabase
      .from('mood_boards')
      .select('id')
      .eq('comparison_of', original.id)
      .eq('store_name', storeName)
      .maybeSingle();

    // Add column (loading if no board yet)
    const col: Column = {
      store:    storeName,
      board_id: existing?.id ?? null,
      pieces:   [],
      loading:  !existing,
      error:    '',
    };
    columns = [...columns, col];
    addingStore = null;
    updateUrl();

    // Load pieces if board exists, or create if not
    if (existing) {
      const { data: pieces } = await supabase
        .from('pieces')
        .select('*')
        .eq('mood_board_id', existing.id)
        .order('created_at', { ascending: true });
      columns = columns.map(c => c.store === storeName ? { ...c, pieces: pieces ?? [], loading: false } : c);
    } else {
      await createComparisonBoard(storeName);
    }
  }

  function updateUrl() {
    const stores = columns.map(c => c.store).join(',');
    const newUrl = `/outfit/compare/${original.slug}${stores ? '?stores=' + stores : ''}`;
    goto(newUrl, { replaceState: true, noScroll: true });
  }

  function isActive(brandName: string) {
    return columns.some(c => c.store === brandName.toLowerCase());
  }

  const formatPrice = (n: number) => '$' + n.toFixed(0);
</script>

<svelte:head>
  <title>{original.title} — Price Comparison — Aloura</title>
  <meta name="description" content="Compare {original.title} across {columns.map(c => c.store).join(', ')} on Aloura." />
  <link rel="canonical" href="https://www.aloura.co/outfit/compare/{original.slug}" />
</svelte:head>

<div class="compare-page">

  <!-- STICKY HEADER -->
  <div class="sticky-header">
    <div class="sticky-header__inner">
      <!-- Back link -->
      <a href="/outfit/{original.slug}" class="back-link">
        <i class="fas fa-arrow-left"></i>
      </a>

      <!-- Title + share -->
      <div class="title-row">
        <div class="board-title">{original.title}</div>
        <ShareButton variant="pill" label="Share comparison" title="{original.title} — price comparison" text="Compare prices for this outfit on Aloura" />
      </div>

      <div class="strip-row">
        <FitCheck />
        <div class="strip-divider"></div>
        <div class="chips-scroll">
          {#each BRANDS as brand}
            <button
              class="chip"
              class:active={isActive(brand.name)}
              disabled={addingStore === brand.id}
              onclick={() => addStore(brand)}
            >
              <img src={brand.logo} alt={brand.name} class="chip__logo" />
              <span class="chip__name">{brand.name}</span>
              {#if isActive(brand.name)}
                <span class="chip__x">×</span>
              {/if}
            </button>
          {/each}
        </div>
      </div>
    </div>
  </div>

  <!-- SORT BAR -->
  {#if columns.length > 1}
    <div class="sort-bar">
      <button class="sort-btn" class:active={sortByPrice} onclick={() => sortByPrice = !sortByPrice}>
        <i class="fas fa-arrow-up-short-wide"></i>
        Sort by price
        {#if sortByPrice}<i class="fas fa-times" style="font-size:10px;opacity:0.7"></i>{/if}
      </button>
    </div>
  {/if}

  <!-- COLUMNS -->
  <div class="columns-wrap">
    <div class="columns" style="--col-count:{columns.length + 1}">

      <!-- ORIGINAL COLUMN -->
      <div class="col col--original">
        <div class="col__head">
          <div class="col__store-name">Original</div>
          <div class="col__total">{formatPrice(total(original.pieces ?? []))}</div>
        </div>
        <div class="col__pieces">
          {#each (original.pieces ?? []) as piece}
            <a
              class="piece-row"
              href={piece.slug ? `/outfit/product/${piece.slug}` : (piece.url ?? '#')}
              target={piece.slug ? '_self' : '_blank'}
              rel={piece.slug ? '' : 'noopener sponsored'}
              onclick={() => track(supabase, accountId, 'buy_clicks')}
            >
              <div class="piece-img-wrap">
                {#if piece.image_url}
                  <img src={piece.image_url} alt={piece.name} class="piece-img" loading="lazy" />
                {:else}
                  <div class="piece-img piece-img--ph"><i class="fas fa-tshirt"></i></div>
                {/if}
              </div>
              <div class="piece-info">
                <div class="piece-store">{piece.store ?? 'Original'}</div>
                <div class="piece-name">{piece.name}</div>
                {#if piece.price}<div class="piece-price">{formatPrice(piece.price)}</div>{/if}
              </div>
              <i class="fas fa-chevron-right piece-caret"></i>
            </a>
          {/each}
        </div>
      </div>

      <!-- COMPARISON COLUMNS -->
      {#each sortedColumns as col}
        <div class="col" class:col--loading={col.loading} class:col--error={!!col.error}>
          <div class="col__head">
            <div class="col__store-name" style="text-transform:capitalize">{col.store}</div>
            {#if !col.loading && !col.error}
              <div class="col__total" class:col__total--best={total(col.pieces) < total(original.pieces ?? []) && total(col.pieces) > 0}>
                {col.pieces.length ? formatPrice(total(col.pieces)) : '—'}
                {#if total(col.pieces) > 0 && total(col.pieces) < total(original.pieces ?? [])}
                  <span class="save-badge">Save {formatPrice(total(original.pieces ?? []) - total(col.pieces))}</span>
                {/if}
              </div>
            {/if}
          </div>

          {#if col.loading}
            <div class="col__loading">
              <div class="spinner" style="width:28px;height:28px;border-width:3px"></div>
              <p>Finding at {col.store}…</p>
            </div>
          {:else if col.error}
            <div class="col__err">
              <i class="fas fa-exclamation-circle"></i>
              <p>{col.error}</p>
              <button onclick={() => createComparisonBoard(col.store)} class="retry-btn">Retry</button>
            </div>
          {:else}
            <div class="col__pieces">
              {#each col.pieces as piece}
                <a
                  class="piece-row"
                  href={piece.slug ? `/outfit/product/${piece.slug}` : (piece.url ?? '#')}
                  target={piece.slug ? '_self' : '_blank'}
                  rel={piece.slug ? '' : 'noopener sponsored'}
                >
                  <div class="piece-img-wrap">
                    {#if piece.image_url}
                      <img src={piece.image_url} alt={piece.name} class="piece-img" loading="lazy" />
                    {:else}
                      <div class="piece-img piece-img--ph"><i class="fas fa-tshirt"></i></div>
                    {/if}
                  </div>
                  <div class="piece-info">
                    <div class="piece-store">{piece.store ?? col.store}</div>
                    <div class="piece-name">{piece.name}</div>
                    {#if piece.price}<div class="piece-price">{formatPrice(piece.price)}</div>{/if}
                  </div>
                  <i class="fas fa-chevron-right piece-caret"></i>
                </a>
              {:else}
                <div class="col__empty">No products found at {col.store}.</div>
              {/each}
            </div>
          {/if}

          <!-- Remove column -->
          <button class="col__remove" onclick={() => { columns = columns.filter(c => c.store !== col.store); updateUrl(); }}>
            <i class="fas fa-times"></i> Remove
          </button>
        </div>
      {/each}

      <!-- ADD STORE HINT (when no columns yet) -->
      {#if columns.length === 0}
        <div class="col col--hint">
          <div class="hint-body">
            <i class="fas fa-store"></i>
            <p>Select a store above to compare prices.</p>
          </div>
        </div>
      {/if}

    </div>
  </div>

</div>

<AuthModal bind:open={authOpen} mode="signup" prompt={authPrompt} returnTo={authReturnTo} />

<style>
  .compare-page { padding-top: var(--nav-h); min-height: 100vh; background: var(--clr-cream); }

  /* ── Sticky header ── */
  .sticky-header {
    position: sticky; top: var(--nav-h); z-index: 100;
    background: rgba(253,251,248,0.97); backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--clr-border);
    padding: 10px var(--page-px) 8px;
  }
  .sticky-header__inner { max-width: var(--max-w); margin: 0 auto; }

  .back-link { display: inline-flex; align-items: center; color: var(--clr-taupe); font-size: 14px; text-decoration: none; margin-bottom: 8px; transition: color 0.15s; }
  .back-link:hover { color: var(--clr-charcoal); }

  .title-row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); margin-bottom: 10px; }
  .board-title { font-family: var(--font-display); font-size: clamp(16px, 3vw, 22px); font-weight: 500; color: var(--clr-charcoal); }

  /* Strip row */
  .strip-row { display: flex; align-items: center; gap: 10px; }
  .strip-divider { width: 1px; height: 24px; background: var(--clr-border); flex-shrink: 0; }

  /* Chips */
  .chips-scroll { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; scrollbar-width: none; flex: 1; }
  .chips-scroll::-webkit-scrollbar { display: none; }

  /* Sort bar */
  .sort-bar { padding: var(--space-3) var(--page-px) 0; display: flex; align-items: center; gap: var(--space-2); }
  .sort-btn {
    display: flex; align-items: center; gap: 6px;
    height: 30px; padding: 0 14px; border-radius: 999px;
    border: 1.5px solid var(--clr-border); background: #fff;
    font-family: var(--font-body); font-size: 12px; font-weight: 500;
    color: var(--clr-taupe); cursor: pointer; transition: all 0.15s; white-space: nowrap;
  }
  .sort-btn:hover { border-color: var(--clr-light-taupe); background: var(--clr-beige); color: var(--clr-charcoal); }
  .sort-btn.active { background: var(--clr-charcoal); border-color: var(--clr-charcoal); color: #fff; }
  .chip { display: flex; align-items: center; gap: 6px; flex-shrink: 0; height: 32px; padding: 0 10px 0 6px; background: var(--clr-cream); border: 1.5px solid var(--clr-border); border-radius: 999px; cursor: pointer; transition: all 0.15s; font-family: var(--font-body); }
  .chip:hover { background: var(--clr-beige); border-color: var(--clr-light-taupe); }
  .chip.active { background: var(--clr-charcoal); border-color: var(--clr-charcoal); }
  .chip.active .chip__name { color: #fff; }
  .chip.active .chip__logo { filter: brightness(0) invert(1); }
  .chip:disabled { opacity: 0.5; cursor: wait; }
  .chip__logo { width: 20px; height: 20px; border-radius: 50%; object-fit: contain; background: white; padding: 2px; flex-shrink: 0; }
  .chip__name { font-size: 12px; font-weight: 500; color: var(--clr-charcoal); white-space: nowrap; }
  .chip__x { font-size: 14px; color: rgba(255,255,255,0.7); margin-left: 2px; }

  /* ── Columns layout ── */
  .columns-wrap { overflow-x: auto; padding: var(--space-5) var(--page-px) var(--space-16); }
  .columns { display: grid; grid-template-columns: repeat(var(--col-count, 2), minmax(180px, 1fr)); gap: var(--space-4); align-items: start; min-width: 0; }

  /* ── Column ── */
  .col { background: #fff; border: 1px solid var(--clr-border); border-radius: var(--radius-xl); overflow: hidden; display: flex; flex-direction: column; }
  .col--original { border-color: var(--clr-charcoal); border-width: 2px; }
  .col--loading, .col--error { border-style: dashed; }

  .col__head { padding: var(--space-4) var(--space-4) var(--space-3); border-bottom: 1px solid var(--clr-border); background: var(--clr-cream); }
  .col__store-name { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--clr-taupe); margin-bottom: 4px; }
  .col--original .col__store-name { color: var(--clr-charcoal); }
  .col__total { font-family: var(--font-display); font-size: var(--text-2xl); font-weight: 600; color: var(--clr-charcoal); display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .col__total--best { color: #16a34a; }
  .save-badge { background: #dcfce7; color: #16a34a; border-radius: 999px; padding: 2px 10px; font-size: 11px; font-weight: 600; font-family: var(--font-body); }

  .col__loading { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--space-3); padding: var(--space-10); color: var(--clr-taupe); text-align: center; }
  .col__loading p { font-size: var(--text-xs); font-weight: 300; }
  .col__err { display: flex; flex-direction: column; align-items: center; gap: var(--space-3); padding: var(--space-8); text-align: center; color: #a33020; }
  .col__err i { font-size: 20px; }
  .col__err p { font-size: var(--text-xs); }
  .retry-btn { background: none; border: 1px solid #a33020; color: #a33020; border-radius: 999px; padding: 5px 14px; font-size: 12px; cursor: pointer; font-family: var(--font-body); }
  .col__empty { padding: var(--space-6); font-size: var(--text-sm); color: var(--clr-taupe); text-align: center; font-weight: 300; }

  .col__pieces { display: flex; flex-direction: column; flex: 1; }
  .col__remove { background: none; border: none; border-top: 1px solid var(--clr-border); cursor: pointer; color: var(--clr-text-muted); font-size: 11px; padding: var(--space-3); display: flex; align-items: center; justify-content: center; gap: 6px; font-family: var(--font-body); transition: background 0.15s, color 0.15s; }
  .col__remove:hover { background: #fdf0ee; color: #a33020; }

  /* ── Piece row ── */
  .piece-row { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3) var(--space-4); border-bottom: 1px solid var(--clr-border); text-decoration: none; color: inherit; transition: background 0.15s; }
  .piece-row:last-child { border-bottom: none; }
  .piece-row:hover { background: var(--clr-cream); }
  .piece-img-wrap { flex-shrink: 0; }
  .piece-img { width: 52px; height: 52px; border-radius: var(--radius-md); object-fit: cover; display: block; }
  .piece-img--ph { background: var(--clr-light-taupe); display: flex; align-items: center; justify-content: center; color: var(--clr-taupe); font-size: 16px; }
  .piece-info { flex: 1; min-width: 0; }
  .piece-store { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--clr-taupe); margin-bottom: 2px; }
  .piece-name { font-size: 12px; font-weight: 500; color: var(--clr-charcoal); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-bottom: 2px; }
  .piece-price { font-size: 13px; font-weight: 600; color: var(--clr-brown); }
  .piece-caret { font-size: 10px; color: var(--clr-light-taupe); flex-shrink: 0; }

  /* ── Hint column ── */
  .col--hint { border-style: dashed; background: transparent; }
  .hint-body { display: flex; flex-direction: column; align-items: center; gap: var(--space-4); padding: var(--space-10); text-align: center; color: var(--clr-taupe); }
  .hint-body i { font-size: 28px; }
  .hint-body p { font-size: var(--text-sm); font-weight: 300; }

  @media (max-width: 640px) {
    .columns { grid-template-columns: repeat(var(--col-count, 2), minmax(180px, 1fr)); }
  }
</style>
