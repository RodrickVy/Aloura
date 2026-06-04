<script lang="ts">
  import { createSupabaseBrowserClient } from '$lib/supabase';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import SearchBar from '$lib/SearchBar.svelte';
  import FitCheck from '$lib/FitCheck.svelte';
  import AuthModal from '$lib/AuthModal.svelte';
  import { track } from '$lib/analytics';
  import type { MoodBoard, Piece } from '$lib/types';

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
    { id:'hollister',      name:'Hollister',       logo:'/assets/logos/hollister.png' },
    { id:'urbanoutfitters',name:'Urban Outfitters',logo:'/assets/logos/urbanoutfitters.png' },
    { id:'ssense',         name:'SSENSE',          logo:'/assets/logos/ssense.png' },
    { id:'nordstrom',      name:'Nordstrom',       logo:'/assets/logos/nordstrom.png' },
    { id:'oldnavy',        name:'Old Navy',        logo:'/assets/logos/oldnavy.png' },
    { id:'levis',          name:"Levi's",          logo:'/assets/logos/levis.png' },
    { id:'gap',            name:'Gap',             logo:'/assets/logos/gap.png' },
    { id:'facebook',       name:'Facebook Mkt',   logo:'/assets/logos/facebook.png' },
  ];

  let accountId = $state<string | null>(data.accountId);
  const isLoggedIn = data.isLoggedIn;
  let styleReportId = $state<string | null>(null);
  let boards = $state<MoodBoard[]>([]);
  let selectedBrands = $state<Set<string>>(new Set());
  let goal = $state('');
  let loading = $state(false);
  let loadingBoards = $state(true);

  // Search mode + product results
  let searchMode = $state<'outfit' | 'product'>('outfit');
  let productResults = $state<any[]>([]);
  let showingProducts = $state(false);
  let defaultBoardId = $state<string | null>(null);

  // Progressive, contextual loading messages
  let loadingMsg = $state('');
  let loadingTimer: ReturnType<typeof setInterval> | null = null;

  const OUTFIT_STAGES = [
    'Reading your style profile…',
    'Designing your outfit…',
    'Picking colours that suit you…',
    'Searching stores for each piece…',
    'Styling the final look…',
    'Almost ready…',
  ];
  const PRODUCT_STAGES = [
    'Cross-referencing stores…',
    'Fetching products…',
    'Comparing prices…',
    'Matching your search…',
    'Almost there…',
  ];

  function startLoadingMessages(stages: string[]) {
    let i = 0;
    loadingMsg = stages[0];
    loadingTimer = setInterval(() => {
      i = Math.min(i + 1, stages.length - 1);
      loadingMsg = stages[i];
    }, 1600);
  }
  function stopLoadingMessages() {
    if (loadingTimer) { clearInterval(loadingTimer); loadingTimer = null; }
    loadingMsg = '';
  }

  // Auth prompt for logged-out visitors
  let authOpen   = $state(false);
  let authPrompt = $state('');
  function requireAuth(message: string): boolean {
    if (isLoggedIn && accountId) return true;
    authPrompt = message;
    authOpen = true;
    return false;
  }

  // Image upload state
  let uploadedB64 = $state<string | null>(null);
  let uploadedType = $state<string | null>(null);
  let uploadedName = $state<string | null>(null);

  onMount(async () => {
    if (accountId) {
      const { data: rep } = await supabase
        .from('style_reports')
        .select('id')
        .eq('account_id', accountId)
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (rep) {
        styleReportId = rep.id;
        if (typeof localStorage !== 'undefined') localStorage.setItem('aloura_report_id', rep.id);
      }
    }

    await loadBoards();
  });

  async function loadBoards() {
    loadingBoards = true;
    try {
      const cols = 'id,title,description,goal,occasion,colors,image_url,slug,account_id,created_at';

      // Public catalogue — official, public, non-comparison boards (visible to everyone, incl. anon)
      const officialQuery = supabase.from('mood_boards').select(cols)
        .eq('public', true).eq('is_official', true).is('comparison_of', null)
        .order('created_at', { ascending: false }).limit(40);

      // Logged-in users also see their own boards
      const queries: any[] = [officialQuery];
      if (accountId) {
        queries.push(
          supabase.from('mood_boards').select(cols)
            .eq('account_id', accountId).is('comparison_of', null)
            .order('created_at', { ascending: false })
        );
      }

      const results = await Promise.all(queries);
      const officialRows = results[0].data ?? [];
      const myRows       = results[1]?.data ?? [];

      const myIds   = new Set(myRows.map((b: any) => b.id));
      const allRows = [...myRows, ...officialRows.filter((b: any) => !myIds.has(b.id))];

      if (!allRows.length) { boards = []; return; }

      const mbIds = allRows.map((b: any) => b.id);
      const { data: pieces } = await supabase.from('pieces').select('*').in('mood_board_id', mbIds);
      boards = allRows.map((b: any) => ({
        ...b,
        style_report_id: '',
        pieces: (pieces ?? []).filter(p => p.mood_board_id === b.id),
      })) as MoodBoard[];
    } finally {
      loadingBoards = false;
    }
  }

  // Branch on search mode
  function onSearch() {
    if (searchMode === 'product') productSearch();
    else generate();
  }

  async function generate() {
    if (!goal.trim() && !uploadedB64) return;
    if (!requireAuth('Sign up to generate your own outfits.')) return;
    loading = true;
    startLoadingMessages(OUTFIT_STAGES);
    track(supabase, accountId, 'outfit_search_hits');
    try {
      const store = selectedBrands.size ? BRANDS.filter(b => selectedBrands.has(b.id)).map(b => b.name).join(', ') : '';
      const body: Record<string, any> = { account_id: accountId, goal: goal.trim() || 'general outfit', store };
      if (uploadedB64) { body.image_b64 = uploadedB64; body.image_type = uploadedType; }

      const { data: result, error } = await supabase.functions.invoke('aloura_outfit_board_generator', { body });
      if (error) throw error;
      if (!result?.mood_board) throw new Error('No board returned');

      boards = [result.mood_board, ...boards];
      track(supabase, accountId, 'mood_boards_made');
    } catch (e) {
      console.error('[generate]', e);
    } finally {
      loading = false;
      stopLoadingMessages();
    }
  }

  // ── Product search (SerpAPI direct, server-side) ──────────────
  async function productSearch() {
    if (!goal.trim() && !uploadedB64) return;
    if (!requireAuth('Sign up to search products.')) return;
    loading = true;
    startLoadingMessages(uploadedB64 ? ['Looking at your image…', ...PRODUCT_STAGES] : PRODUCT_STAGES);
    track(supabase, accountId, 'outfit_search_hits');
    try {
      const store = selectedBrands.size ? BRANDS.filter(b => selectedBrands.has(b.id)).map(b => b.name).join(', ') : '';
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: goal.trim(), store, image_b64: uploadedB64 ?? undefined, image_type: uploadedType ?? undefined }),
      });
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      productResults = data.results ?? [];
      showingProducts = true;
    } catch (e) {
      console.error('[productSearch]', e);
      productResults = [];
      showingProducts = true;
    } finally {
      loading = false;
      stopLoadingMessages();
    }
  }

  function clearProducts() {
    showingProducts = false;
    productResults = [];
  }

  const slugify = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  // Click a product → save to default board → open its product page
  let openingProduct = $state<string | null>(null);
  async function openProduct(p: any) {
    if (!accountId) return;
    openingProduct = p.url;
    try {
      // 1. Ensure the user's default "My searches" board exists
      let boardId = defaultBoardId;
      if (!boardId) {
        const { data: existing } = await supabase
          .from('mood_boards').select('id').eq('account_id', accountId).eq('is_default', true).maybeSingle();
        if (existing) {
          boardId = existing.id;
        } else {
          const { data: rep } = await supabase
            .from('style_reports').select('id').eq('account_id', accountId)
            .order('generated_at', { ascending: false }).limit(1).maybeSingle();
          const { data: nb, error: nbErr } = await supabase.from('mood_boards').insert({
            account_id: accountId,
            style_report_id: rep?.id ?? null,
            title: 'My searches',
            is_default: true,
            public: false,
            slug: 'my-searches-' + accountId.replace(/-/g, '').slice(0, 8),
          }).select('id').single();
          if (nbErr) throw nbErr;
          boardId = nb.id;
        }
        defaultBoardId = boardId;
      }

      // 2. Save the product as a piece with a slug
      const pieceSlug = slugify(`${p.store} ${p.name}`.slice(0, 60)) + '-' + Math.random().toString(36).slice(2, 10);
      const { data: piece, error: pErr } = await supabase.from('pieces').insert({
        mood_board_id: boardId,
        name: p.name, title: p.name, price: p.price ?? null,
        url: p.url, image_url: p.image_url, store: p.store,
        keywords: p.keywords ?? [], slug: pieceSlug,
      }).select('slug').single();
      if (pErr) throw pErr;

      goto(`/outfit/product/${piece.slug}`);
    } catch (e) {
      console.error('[openProduct]', e);
      openingProduct = null;
    }
  }

  function boardHref(board: MoodBoard): string {
    return board.slug ? `/outfit/${board.slug}` : '#';
  }

  function handleFileUpload(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    uploadedType = file.type;
    uploadedName = file.name;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      uploadedB64 = result.split(',')[1];
    };
    reader.readAsDataURL(file);
  }

  const totalPrice = (pieces: Piece[]) => pieces.reduce((s, p) => s + (p.price ?? 0), 0);
</script>

<svelte:head>
  <title>Discover Outfits — Aloura</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="discover">

  <!-- SEARCH ROW -->
  <div class="search-row">

      <!-- Search bar + fit check -->
      <div class="search-bar-group">
        <SearchBar
          bind:value={goal}
          bind:mode={searchMode}
          loading={loading}
          imageAttached={!!uploadedB64}
          imageName={uploadedName ?? ''}
          onsubmit={onSearch}
          onimage={(b64, type, name) => { uploadedB64 = b64; uploadedType = type; uploadedName = name; }}
          onclearimage={() => { uploadedB64 = null; uploadedType = null; uploadedName = null; }}
        />
        <FitCheck {accountId} />
      </div>

      <!-- Brand filter chips -->
      <div class="brands-scroll">
        {#each BRANDS as brand}
          <button
            class="brand-chip"
            class:active={selectedBrands.has(brand.id)}
            onclick={() => {
              const next = new Set(selectedBrands);
              next.has(brand.id) ? next.delete(brand.id) : next.add(brand.id);
              selectedBrands = next;
              track(supabase, accountId, 'store_filter_used');
            }}
          >
            <img src={brand.logo} alt={brand.name} class="brand-chip__logo" />
            <span class="brand-chip__name">{brand.name}</span>
          </button>
        {/each}
      </div>

    </div>

  <!-- PRODUCT RESULTS BAR -->
  {#if showingProducts}
    <div class="products-bar">
      <span>{productResults.length} product{productResults.length === 1 ? '' : 's'} found</span>
      <button class="back-to-boards" onclick={clearProducts}>
        <i class="fas fa-arrow-left"></i> Back to boards
      </button>
    </div>
  {/if}

  <!-- GRID VIEW -->
  {#if showingProducts}
    <!-- PRODUCT RESULTS -->
    <div class="masonry">
      {#if loading}
        <div class="generating-card">
          <div class="spinner"></div>
          {#key loadingMsg}<p class="loading-msg">{loadingMsg || 'Searching products…'}</p>{/key}
        </div>
      {:else if !productResults.length}
        <div class="empty-state"><i class="fas fa-magnifying-glass"></i><p>No products found. Try different keywords.</p></div>
      {:else}
        {#each productResults as p}
          <button class="product-card" onclick={() => openProduct(p)} disabled={openingProduct === p.url}>
            <div class="product-card__img-wrap">
              {#if p.image_url}
                <img src={p.image_url} alt={p.name} loading="lazy" onerror={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              {:else}
                <div class="product-card__ph"><i class="fas fa-tshirt"></i></div>
              {/if}
              {#if openingProduct === p.url}
                <div class="product-card__loading"><span class="spinner" style="width:22px;height:22px;border-width:2px"></span></div>
              {/if}
            </div>
            <div class="product-card__info">
              <div class="product-card__store">{p.store}</div>
              <div class="product-card__name">{p.name}</div>
              {#if p.price}<div class="product-card__price">${p.price.toFixed(2)}</div>{/if}
            </div>
          </button>
        {/each}
      {/if}
    </div>
  {:else}
    <div class="masonry">
      {#if loading}
        <div class="generating-card">
          <div class="spinner"></div>
          {#key loadingMsg}<p class="loading-msg">{loadingMsg || 'Building your outfit…'}</p>{/key}
        </div>
      {/if}
      {#if loadingBoards && !boards.length}
        <div class="empty-state"><div class="spinner"></div></div>
      {:else if !boards.length && !loading}
        <div class="empty-state">
          <i class="fas fa-tshirt"></i>
          <p>Type an occasion above to get started.</p>
        </div>
      {:else}
        {#each boards as board, i}
          {@const imgs = (board.pieces ?? []).filter(p => p.image_url).slice(0, 4).map(p => p.image_url)}
          {@const count = imgs.length}
          <a class="board-card" href={boardHref(board)} onclick={() => track(supabase, accountId, 'outfit_checkout_hits')}>
            <!-- Collage -->
            <div class="collage" class:collage--1={count === 1} class:collage--2={count === 2} class:collage--3={count === 3} class:collage--4={count >= 4}>
              {#if count === 0}
                <div class="collage__ph"><i class="fas fa-tshirt"></i></div>
              {:else}
                {#each imgs as src, ci}
                  <div class="collage__cell">
                    <img
                      src={src ?? ''}
                      alt="piece {ci + 1}"
                      loading={i < 6 ? 'eager' : 'lazy'}
                      onerror={(e) => { (e.target as HTMLImageElement).parentElement!.style.background = '#E8E0D8'; (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  </div>
                {/each}
              {/if}
            </div>
            <div class="board-card__info">
              <div class="board-card__occasion">{board.occasion ?? board.goal ?? board.title}</div>
              <div class="board-card__meta">
                <span>{totalPrice(board.pieces ?? []) > 0 ? '$' + totalPrice(board.pieces ?? []).toFixed(0) : ''}</span>
                <span>{(board.pieces ?? []).length} pieces</span>
              </div>
            </div>
          </a>
        {/each}
      {/if}
    </div>
  {/if}

</div>

<AuthModal bind:open={authOpen} mode="signup" prompt={authPrompt} />

<style>
  .discover { padding-top: var(--nav-h); min-height: 100vh; }

  /* ── Search row ── */
  .search-row {
    position: sticky; top: var(--nav-h); z-index: 100;
    background: rgba(253,251,248,0.96); backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--clr-border);
    padding: 12px var(--page-px) 10px;
  }

  .search-bar-group { display: flex; align-items: flex-end; gap: 10px; margin-bottom: 12px; }

  .loading-msg { animation: msgFade 0.4s var(--ease); }
  @keyframes msgFade { from { opacity: 0.3; } to { opacity: 1; } }

  /* Product results bar */
  .products-bar { display: flex; align-items: center; justify-content: space-between; padding: 12px var(--page-px) 0; font-size: var(--text-sm); color: var(--clr-taupe); }
  .back-to-boards { display: inline-flex; align-items: center; gap: 6px; background: none; border: none; cursor: pointer; font-family: var(--font-body); font-size: var(--text-sm); font-weight: 500; color: var(--clr-brown); }
  .back-to-boards:hover { text-decoration: underline; }

  /* Product cards */
  .product-card { break-inside: avoid; display: block; width: 100%; margin-bottom: var(--space-3); background: var(--clr-cream); border: 1px solid var(--clr-border); padding: 0; cursor: pointer; border-radius: var(--radius-lg); overflow: hidden; text-align: left; transition: box-shadow var(--dur-base), transform var(--dur-base); }
  .product-card:hover { box-shadow: var(--shadow-lg); transform: translateY(-2px); }
  .product-card:disabled { opacity: 0.7; cursor: wait; }
  .product-card__img-wrap { position: relative; aspect-ratio: 1; background: #e8e0d8; }
  .product-card__img-wrap img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .product-card__ph { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--clr-taupe); font-size: 28px; }
  .product-card__loading { position: absolute; inset: 0; background: rgba(255,255,255,0.6); display: flex; align-items: center; justify-content: center; }
  .product-card__info { padding: var(--space-3); }
  .product-card__store { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--clr-taupe); margin-bottom: 2px; }
  .product-card__name { font-size: var(--text-xs); font-weight: 500; color: var(--clr-charcoal); line-height: 1.4; margin-bottom: 4px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .product-card__price { font-size: var(--text-sm); font-weight: 600; color: var(--clr-brown); }

  /* ── Brand chips — Material Design filter style ── */
  .brands-scroll {
    display: flex; gap: 8px;
    overflow-x: auto; padding-bottom: 2px;
    scrollbar-width: none; -webkit-overflow-scrolling: touch;
  }
  .brands-scroll::-webkit-scrollbar { display: none; }

  .brand-chip {
    display: flex; align-items: center; gap: 6px;
    flex-shrink: 0; height: 32px; padding: 0 12px 0 6px;
    background: var(--clr-cream); border: 1.5px solid var(--clr-border);
    border-radius: 999px; cursor: pointer;
    transition: background var(--dur-fast), border-color var(--dur-fast);
  }
  .brand-chip:hover { background: var(--clr-beige); border-color: var(--clr-light-taupe); }
  .brand-chip.active { background: var(--clr-charcoal); border-color: var(--clr-charcoal); }
  .brand-chip.active .brand-chip__name { color: rgba(255,255,255,0.92); }
  .brand-chip.active .brand-chip__logo { filter: brightness(0) invert(1); }

  .brand-chip__logo {
    width: 20px; height: 20px; border-radius: 50%;
    object-fit: contain; background: white; padding: 2px; flex-shrink: 0;
  }
  .brand-chip__name {
    font-size: 12px; font-weight: 500; color: var(--clr-charcoal);
    white-space: nowrap; line-height: 1;
    transition: color var(--dur-fast);
  }

  .detail-nav { position: sticky; top: var(--nav-h); z-index: 100; background: rgba(253,251,248,0.95); backdrop-filter: blur(12px); border-bottom: 1px solid var(--clr-border); padding: var(--space-3) var(--page-px); display: flex; align-items: center; gap: var(--space-4); }
  .back-btn { background: none; border: none; cursor: pointer; color: var(--clr-taupe); font-size: var(--text-sm); display: flex; align-items: center; gap: var(--space-2); transition: color var(--dur-fast); white-space: nowrap; }
  .back-btn:hover { color: var(--clr-charcoal); }

  .masonry { columns: 2; column-gap: var(--space-3); padding: var(--space-4) var(--page-px); }
  .board-card {
    break-inside: avoid; display: block; width: 100%; margin-bottom: var(--space-3);
    background: var(--clr-cream); border: none; padding: 0; cursor: pointer;
    border-radius: var(--radius-lg); overflow: hidden; box-shadow: var(--shadow-sm);
    transition: box-shadow var(--dur-base), transform var(--dur-base);
    text-decoration: none; color: inherit;
  }
  .board-card:hover { box-shadow: var(--shadow-lg); transform: translateY(-2px); }

  /* ── Collage ── */
  .collage { width: 100%; aspect-ratio: 1; display: grid; gap: 2px; background: var(--clr-light-taupe); }

  /* 1 image — full */
  .collage--1 { grid-template-columns: 1fr; }

  /* 2 images — side by side */
  .collage--2 { grid-template-columns: 1fr 1fr; }

  /* 3 images — one big left, two stacked right */
  .collage--3 { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }
  .collage--3 .collage__cell:first-child { grid-row: span 2; }

  /* 4 images — 2×2 grid */
  .collage--4 { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }

  .collage__cell { overflow: hidden; background: #e8e0d8; }
  .collage__cell img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 0.4s ease; }
  .board-card:hover .collage__cell img { transform: scale(1.04); }
  .collage__ph { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; color: var(--clr-taupe); font-size: 32px; }

  .board-card__info { background: var(--clr-off-white); padding: var(--space-3); }
  .board-card__occasion { font-size: var(--text-xs); font-weight: 500; color: var(--clr-charcoal); margin-bottom: var(--space-1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .board-card__meta { display: flex; justify-content: space-between; font-size: var(--text-xs); color: var(--clr-taupe); }

  .generating-card { column-span: all; background: var(--clr-cream); border: 1px solid var(--clr-border); border-radius: var(--radius-xl); padding: var(--space-12); text-align: center; display: flex; flex-direction: column; align-items: center; gap: var(--space-4); margin-bottom: var(--space-4); }
  .generating-card p { font-size: var(--text-sm); color: var(--clr-taupe); font-weight: 300; }
  .empty-state { column-span: all; text-align: center; padding: var(--space-20); color: var(--clr-taupe); display: flex; flex-direction: column; align-items: center; gap: var(--space-4); }
  .empty-state i { font-size: 32px; }
  .empty-state p { font-size: var(--text-sm); font-weight: 300; }

  .detail { padding: var(--space-8) var(--page-px); }
  .detail__hero { display: flex; flex-direction: column; gap: var(--space-6); margin-bottom: var(--space-10); }
  .detail__img { width: 100%; max-width: 400px; border-radius: var(--radius-xl); box-shadow: var(--shadow-lg); object-fit: cover; }


  .pieces-grid { display: grid; gap: var(--space-4); }
  .piece-card { background: var(--clr-cream); border: 1px solid var(--clr-border); border-radius: var(--radius-lg); overflow: hidden; display: flex; gap: var(--space-4); padding: var(--space-4); }
  .piece-card__img { width: 80px; height: 80px; object-fit: cover; border-radius: var(--radius-md); flex-shrink: 0; }
  .piece-card__img--ph { background: var(--clr-light-taupe); display: flex; align-items: center; justify-content: center; color: var(--clr-taupe); font-size: 24px; }
  .piece-card__body { flex: 1; min-width: 0; }
  .piece-card__store { font-size: var(--text-xs); font-weight: 500; color: var(--clr-taupe); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 2px; }
  .piece-card__name { font-size: var(--text-sm); font-weight: 500; color: var(--clr-charcoal); margin-bottom: 4px; line-clamp: 2; overflow: hidden; }
  .piece-card__price { font-size: var(--text-sm); font-weight: 500; color: var(--clr-brown); margin-bottom: var(--space-3); }
  .piece-card__actions { display: flex; gap: var(--space-2); flex-wrap: wrap; }
  .btn-spinner { width: 16px; height: 16px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.4); border-top-color: white; animation: spin 0.8s linear infinite; }

  @media (min-width: 640px)  { .masonry { columns: 3; } }
  @media (min-width: 1024px) { .masonry { columns: 4; } }
</style>
