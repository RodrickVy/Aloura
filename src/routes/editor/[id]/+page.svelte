<script lang="ts">
  import { createSupabaseBrowserClient } from '$lib/supabase';
  import { goto } from '$app/navigation';
  import type { Piece } from '$lib/types';

  let { data } = $props();
  const supabase = createSupabaseBrowserClient();

  interface Category { id: string; name: string; description: string | null; image_url: string | null; }

  let categories  = $state<Category[]>(data.categories);

  // New category form
  let showNewCat   = $state(false);
  let newCatName   = $state('');
  let newCatDesc   = $state('');
  let newCatImg    = $state<File | null>(null);
  let newCatPreview= $state('');
  let savingCat    = $state(false);
  let catError     = $state('');

  function onCatImageSelect(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    newCatImg     = file;
    newCatPreview = URL.createObjectURL(file);
  }

  async function createCategory() {
    if (!newCatName.trim()) { catError = 'Name is required.'; return; }
    savingCat = true; catError = '';
    try {
      let image_url: string | null = null;
      if (newCatImg) {
        const path = `categories/${Date.now()}_${newCatImg.name}`;
        const { error: upErr } = await supabase.storage.from('profile_images').upload(path, newCatImg, { upsert: true });
        if (upErr) throw upErr;
        const { data: { publicUrl } } = supabase.storage.from('profile_images').getPublicUrl(path);
        image_url = publicUrl;
      }
      const { data: cat, error } = await supabase.from('categories').insert({
        name:        newCatName.trim().toLowerCase(),
        description: newCatDesc.trim() || null,
        image_url,
      }).select('id, name, description, image_url').single();
      if (error) throw error;
      categories = [...categories, cat].sort((a, b) => a.name.localeCompare(b.name));
      board.category = cat.name;
      showNewCat = false; newCatName = ''; newCatDesc = ''; newCatImg = null; newCatPreview = '';
    } catch (e: any) {
      catError = e.message?.includes('unique') ? 'That category already exists.' : (e.message ?? 'Failed to create category.');
    } finally {
      savingCat = false;
    }
  }

  // ── Board fields ───────────────────────────────────────────
  let board = $state({ ...data.board });
  let pieces = $state<Piece[]>(data.pieces);
  let savingBoard    = $state(false);
  let boardSaved     = $state(false);
  let boardError     = $state('');
  let detectingColors = $state(false);

  // ── Product search ─────────────────────────────────────────
  let searchQuery   = $state('');
  let searchResults = $state<any[]>([]);
  let searching     = $state(false);
  let searchError   = $state('');

  // ── Piece being staged (not yet saved) ────────────────────
  let staged   = $state<any | null>(null);
  let addingPiece = $state(false);

  // ── Piece editing ──────────────────────────────────────────
  let editingPiece = $state<string | null>(null); // piece id
  let removingPiece = $state<string | null>(null);

  function slugify(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  // ── Save board metadata ────────────────────────────────────
  async function saveBoard() {
    savingBoard = true; boardError = ''; boardSaved = false;
    try {
      // Slug from title + piece names
      const pieceNames = pieces.map(p => p.name ?? '').join(' ');
      const slugBase   = slugify(`${board.title} ${pieceNames}`.slice(0, 60));
      const slug       = slugBase + '-' + board.id.replace(/-/g, '').slice(0, 8);

      const { error } = await supabase.from('mood_boards').update({
        title:       board.title,
        description: board.description,
        occasion:    board.occasion,
        goal:        board.goal,
        category:    board.category ?? 'general',
        colors:      board.colors ?? [],
        public:      board.is_official ? true : board.public, // featured boards must be public
        is_official: board.is_official ?? false,
        slug,
      }).eq('id', board.id);

      if (error) throw error;
      boardSaved = true;
      setTimeout(() => boardSaved = false, 2500);
    } catch (e: any) {
      boardError = e.message ?? 'Save failed.';
    } finally {
      savingBoard = false;
    }
  }

  async function detectColors() {
    if (!pieces.length) return;
    detectingColors = true;
    try {
      const res = await fetch('/api/detect-colors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pieces: pieces.map(p => ({
            name: p.name, store: p.store, style: p.style, image_url: p.image_url,
          })),
        }),
      });
      const data = await res.json();
      if (data.colors?.length) {
        board.colors = data.colors;
        // Auto-save colors to DB
        await supabase.from('mood_boards').update({ colors: data.colors }).eq('id', board.id);
      }
    } finally {
      detectingColors = false;
    }
  }

  // ── Search products ────────────────────────────────────────
  async function searchProducts() {
    if (!searchQuery.trim()) return;
    searching = true; searchError = ''; searchResults = [];
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`);
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      searchResults = data.results ?? [];
    } catch (e: any) {
      searchError = 'Search failed. Please try again.';
    } finally {
      searching = false;
    }
  }

  // ── Stage a result (preview before adding) ────────────────
  function stageProduct(product: any) {
    staged = { ...product, colors: [], style: board.occasion ?? '' };
    searchResults = [];
    searchQuery = '';
  }

  // ── Add staged product as a piece ─────────────────────────
  async function addPiece() {
    if (!staged) return;
    addingPiece = true;
    try {
      // Generate piece slug
      const pieceSlug = slugify(`${staged.store ?? ''} ${staged.name}`.slice(0, 60))
        + '-' + Math.random().toString(36).slice(2, 10);

      const { data: newPiece, error } = await supabase
        .from('pieces')
        .insert({
          mood_board_id: board.id,
          name:      staged.name,
          title:     staged.name,
          price:     staged.price ?? null,
          url:       staged.url ?? null,
          image_url: staged.image_url ?? null,
          colors:    staged.colors ?? [],
          style:     staged.style ?? null,
          store:     staged.store ?? null,
          keywords:  staged.keywords ?? [],
          slug:      pieceSlug,
        })
        .select('*')
        .single();

      if (error) throw error;
      pieces = [...pieces, newPiece];
      staged = null;
      // Auto-detect colors from all pieces (non-blocking)
      detectColors();
    } catch (e: any) {
      console.error('Add piece failed:', e);
    } finally {
      addingPiece = false;
    }
  }

  // ── Update piece inline ────────────────────────────────────
  async function updatePiece(piece: Piece) {
    await supabase.from('pieces').update({
      name:      piece.name,
      title:     piece.title,
      price:     piece.price,
      url:       piece.url,
      image_url: piece.image_url,
      style:     piece.style,
      store:     piece.store,
    }).eq('id', piece.id);
    editingPiece = null;
  }

  // ── Remove piece ───────────────────────────────────────────
  async function removePiece(id: string) {
    removingPiece = id;
    await supabase.from('pieces').delete().eq('id', id);
    pieces = pieces.filter(p => p.id !== id);
    removingPiece = null;
    if (pieces.length) detectColors();
  }

  // Colors are auto-generated — no manual input needed
</script>

<svelte:head>
  <title>Edit: {board.title} — Aloura Editor</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="editor-page">

  <!-- HEADER -->
  <div class="editor-header">
    <a href="/editor" class="back-link"><i class="fas fa-arrow-left"></i> My Boards</a>
    <div class="header-actions">
      <button
        class="public-toggle"
        class:is-public={board.public}
        onclick={() => board.public = !board.public}
        title="Public boards are viewable by anyone with the link"
      >
        <i class={board.public ? 'fas fa-globe' : 'fas fa-lock'}></i>
        {board.public ? 'Public' : 'Private'}
      </button>
      <button
        class="public-toggle"
        class:is-public={board.is_official}
        onclick={() => board.is_official = !board.is_official}
        title="Featured boards appear in the public Discover feed"
      >
        <i class={board.is_official ? 'fas fa-star' : 'fa-regular fa-star'}></i>
        {board.is_official ? 'Featured' : 'Not featured'}
      </button>
      <button class="btn btn--primary" onclick={saveBoard} disabled={savingBoard}>
        {#if savingBoard}<span class="btn-spin"></span>
        {:else if boardSaved}<i class="fas fa-check"></i> Saved
        {:else}<i class="fas fa-save"></i> Save{/if}
      </button>
    </div>
  </div>

  {#if boardError}
    <div class="banner-error"><i class="fas fa-exclamation-circle"></i> {boardError}</div>
  {/if}

  <!-- BOARD METADATA -->
  <section class="section-card">
    <h2 class="section-title">Board details</h2>
    <div class="meta-grid">
      <div class="field field--full">
        <label>Title</label>
        <input type="text" bind:value={board.title} placeholder="e.g. Smart casual Friday" />
      </div>
      <div class="field field--full">
        <label>Description</label>
        <textarea bind:value={board.description} placeholder="What is this outfit for?" rows={2}></textarea>
      </div>
      <div class="field">
        <label>Occasion</label>
        <input type="text" bind:value={board.occasion} placeholder="e.g. Work meeting" />
      </div>
      <div class="field">
        <label>Goal</label>
        <input type="text" bind:value={board.goal} placeholder="e.g. Look professional" />
      </div>
      <div class="field field--full">
        <label>Category</label>

        <!-- Existing categories -->
        <div class="cat-grid">
          {#each categories as cat}
            <button
              type="button"
              class="cat-card"
              class:active={board.category === cat.name}
              onclick={() => board.category = cat.name}
              title={cat.description ?? cat.name}
            >
              {#if cat.image_url}
                <img src={cat.image_url} alt={cat.name} class="cat-card__img" />
              {:else}
                <div class="cat-card__img cat-card__img--ph"><i class="fas fa-tag"></i></div>
              {/if}
              <span class="cat-card__name">{cat.name}</span>
              {#if board.category === cat.name}
                <div class="cat-card__check"><i class="fas fa-check"></i></div>
              {/if}
            </button>
          {/each}

          <!-- Add new category button -->
          <button type="button" class="cat-card cat-card--new" onclick={() => { showNewCat = !showNewCat; catError = ''; }}>
            <div class="cat-card__img cat-card__img--add"><i class="fas fa-plus"></i></div>
            <span class="cat-card__name">New</span>
          </button>
        </div>

        <!-- New category form -->
        {#if showNewCat}
          <div class="new-cat-form">
            <h4 class="new-cat-title">Create a new category</h4>
            {#if catError}<p class="cat-error"><i class="fas fa-exclamation-circle"></i> {catError}</p>{/if}
            <div class="new-cat-body">
              <!-- Image upload -->
              <label class="cat-img-upload">
                {#if newCatPreview}
                  <img src={newCatPreview} alt="preview" class="cat-img-preview" />
                  <div class="cat-img-overlay"><i class="fas fa-camera"></i></div>
                {:else}
                  <div class="cat-img-ph"><i class="fas fa-image"></i><span>Add image</span></div>
                {/if}
                <input type="file" accept="image/*" style="display:none" onchange={onCatImageSelect} />
              </label>
              <!-- Fields -->
              <div class="new-cat-fields">
                <div class="field">
                  <label>Name <span style="color:var(--clr-terracotta)">*</span></label>
                  <input type="text" bind:value={newCatName} placeholder="e.g. resort wear" />
                </div>
                <div class="field">
                  <label>Description</label>
                  <input type="text" bind:value={newCatDesc} placeholder="Optional short description" />
                </div>
              </div>
            </div>
            <div class="new-cat-actions">
              <button type="button" class="btn btn--ghost" onclick={() => { showNewCat = false; catError = ''; }}>Cancel</button>
              <button type="button" class="btn btn--primary" onclick={createCategory} disabled={savingCat}>
                {#if savingCat}<span class="btn-spin"></span>{/if}
                Create & select
              </button>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </section>

  <!-- PRODUCT SEARCH -->
  <section class="section-card">
    <h2 class="section-title">Add products</h2>
    <p class="section-sub">Search for a product to add it to this board.</p>

    <div class="search-bar">
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="Search e.g. white slim fit shirt Zara…"
        onkeydown={(e) => { if (e.key === 'Enter') searchProducts(); }}
        class="search-input"
      />
      <button class="search-btn" onclick={searchProducts} disabled={searching}>
        {#if searching}<span class="btn-spin" style="border-top-color:white"></span>
        {:else}<i class="fas fa-search"></i>{/if}
      </button>
    </div>

    {#if searchError}
      <p class="search-error"><i class="fas fa-exclamation-circle"></i> {searchError}</p>
    {/if}

    <!-- Search results -->
    {#if searchResults.length}
      <div class="search-results">
        {#each searchResults as result}
          <button class="result-row" onclick={() => stageProduct(result)}>
            <div class="result-img-wrap">
              {#if result.image_url}
                <img src={result.image_url} alt={result.name} class="result-img" />
              {:else}
                <div class="result-img result-img--ph"><i class="fas fa-tshirt"></i></div>
              {/if}
            </div>
            <div class="result-info">
              <div class="result-store">{result.store}</div>
              <div class="result-name">{result.name}</div>
              {#if result.price}<div class="result-price">${result.price.toFixed(2)}</div>{/if}
            </div>
            <i class="fas fa-plus result-add"></i>
          </button>
        {/each}
      </div>
    {/if}

    <!-- Staged product -->
    {#if staged}
      <div class="staged-card">
        <div class="staged-header">
          <span class="staged-label">Review before adding</span>
          <button class="staged-dismiss" onclick={() => staged = null}>×</button>
        </div>
        <div class="staged-body">
          {#if staged.image_url}
            <img src={staged.image_url} alt={staged.name} class="staged-img" />
          {/if}
          <div class="staged-fields">
            <div class="field">
              <label>Name</label>
              <input type="text" bind:value={staged.name} />
            </div>
            <div class="field">
              <label>Store / Brand</label>
              <input type="text" bind:value={staged.store} />
            </div>
            <div class="field">
              <label>Price ($)</label>
              <input type="number" bind:value={staged.price} step="0.01" />
            </div>
            <div class="field">
              <label>Buy URL</label>
              <input type="url" bind:value={staged.url} />
            </div>
            <div class="field">
              <label>Image URL</label>
              <input type="url" bind:value={staged.image_url} />
            </div>
            <div class="field">
              <label>Style / Occasion</label>
              <input type="text" bind:value={staged.style} />
            </div>
          </div>
        </div>
        <div class="staged-actions">
          <button class="btn btn--ghost" onclick={() => staged = null}>Cancel</button>
          <button class="btn btn--primary" onclick={addPiece} disabled={addingPiece}>
            {#if addingPiece}<span class="btn-spin"></span>{/if}
            Add to board
          </button>
        </div>
      </div>
    {/if}
  </section>

  <!-- PIECES LIST -->
  <section class="section-card">
    <h2 class="section-title">Pieces <span class="piece-count">{pieces.length}</span></h2>

    {#if pieces.length === 0}
      <p class="section-sub">No pieces yet. Search above to add your first one.</p>
    {:else}
      <div class="pieces-list">
        {#each pieces as piece}
          <div class="piece-row" class:is-editing={editingPiece === piece.id}>

            {#if editingPiece === piece.id}
              <!-- EDIT MODE -->
              <div class="piece-edit-form">
                <div class="piece-edit-grid">
                  <div class="field"><label>Name</label><input type="text" bind:value={piece.name} /></div>
                  <div class="field"><label>Store</label><input type="text" bind:value={piece.store} /></div>
                  <div class="field"><label>Price ($)</label><input type="number" bind:value={piece.price} step="0.01" /></div>
                  <div class="field"><label>Style</label><input type="text" bind:value={piece.style} /></div>
                  <div class="field field--full"><label>Buy URL</label><input type="url" bind:value={piece.url} /></div>
                  <div class="field field--full"><label>Image URL</label><input type="url" bind:value={piece.image_url} /></div>
                </div>
                <div class="piece-edit-actions">
                  <button class="btn btn--ghost" onclick={() => editingPiece = null}>Cancel</button>
                  <button class="btn btn--primary" onclick={() => updatePiece(piece)}>Save piece</button>
                </div>
              </div>

            {:else}
              <!-- VIEW MODE -->
              <div class="piece-img-wrap">
                {#if piece.image_url}
                  <img src={piece.image_url} alt={piece.name ?? ''} class="piece-img" />
                {:else}
                  <div class="piece-img piece-img--ph"><i class="fas fa-tshirt"></i></div>
                {/if}
              </div>
              <div class="piece-info">
                <div class="piece-store">{piece.store ?? 'Online'}</div>
                <div class="piece-name">{piece.name}</div>
                {#if piece.price}<div class="piece-price">${piece.price.toFixed(2)}</div>{/if}
              </div>
              <div class="piece-actions">
                <button class="btn-icon" onclick={() => editingPiece = piece.id}><i class="fas fa-pen"></i></button>
                <button
                  class="btn-icon btn-icon--danger"
                  onclick={() => removePiece(piece.id)}
                  disabled={removingPiece === piece.id}
                ><i class="fas fa-trash"></i></button>
              </div>
            {/if}

          </div>
        {/each}
      </div>
    {/if}
  </section>

  <!-- COLORS (auto-generated) -->
  <section class="section-card">
    <div class="colors-header">
      <div>
        <h2 class="section-title" style="margin-bottom:4px">Palette</h2>
        <p class="section-sub" style="margin:0">Auto-detected from your pieces using AI.</p>
      </div>
      <button class="btn btn--ghost" onclick={detectColors} disabled={detectingColors || !pieces.length} style="font-size:12px;padding:8px 14px">
        {#if detectingColors}<span class="btn-spin-dark"></span> Detecting…
        {:else}<i class="fas fa-magic"></i> Refresh{/if}
      </button>
    </div>
    {#if board.colors?.length}
      <div class="color-preview" style="margin-top:var(--space-4)">
        {#each board.colors as hex}
          <div class="color-dot-lg" style="background:{hex}" title={hex}>
            <span class="color-hex">{hex}</span>
          </div>
        {/each}
      </div>
    {:else}
      <p class="colors-empty">
        <i class="fas fa-palette"></i>
        {pieces.length ? 'Click Refresh to detect colors from your pieces.' : 'Add pieces first — colors will be detected automatically.'}
      </p>
    {/if}
  </section>

</div>

<style>
  .editor-page { padding: calc(var(--nav-h) + var(--space-4)) var(--page-px) var(--space-16); max-width: 720px; margin: 0 auto; display: flex; flex-direction: column; gap: var(--space-5); }

  /* Header */
  .editor-header { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); padding-bottom: var(--space-4); border-bottom: 1px solid var(--clr-border); }
  .back-link { display: flex; align-items: center; gap: 8px; font-size: var(--text-sm); color: var(--clr-taupe); text-decoration: none; transition: color 0.15s; }
  .back-link:hover { color: var(--clr-charcoal); }
  .header-actions { display: flex; align-items: center; gap: var(--space-3); }
  .public-toggle { display: flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 999px; border: 1.5px solid var(--clr-border); background: #fff; font-size: 12px; font-weight: 600; color: var(--clr-taupe); cursor: pointer; transition: all 0.15s; font-family: var(--font-body); }
  .public-toggle.is-public { background: var(--clr-charcoal); border-color: var(--clr-charcoal); color: #fff; }

  .banner-error { background: #fdf0ee; color: #a33020; border: 1px solid #f5c6c0; border-radius: var(--radius-lg); padding: 12px 16px; font-size: 13px; display: flex; align-items: center; gap: 8px; }

  /* Section cards */
  .section-card { background: #fff; border: 1px solid var(--clr-border); border-radius: var(--radius-xl); padding: var(--space-6); }
  .section-title { font-family: var(--font-display); font-size: var(--text-lg); font-weight: 500; margin-bottom: var(--space-5); display: flex; align-items: center; gap: 10px; }
  .section-sub { font-size: var(--text-sm); color: var(--clr-taupe); margin-bottom: var(--space-5); margin-top: -12px; }
  .piece-count { background: var(--clr-beige); color: var(--clr-taupe); border-radius: 999px; padding: 2px 10px; font-size: 12px; font-family: var(--font-body); font-weight: 600; }

  /* Form fields */
  .meta-grid, .piece-edit-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4); }
  .field { display: flex; flex-direction: column; gap: 5px; }
  .field--full { grid-column: 1 / -1; }
  .field label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--clr-taupe); }
  .field .hint { font-weight: 400; text-transform: none; letter-spacing: 0; color: var(--clr-text-faint); font-size: 10px; }
  .field input, .field textarea { font-family: var(--font-body); font-size: var(--text-sm); color: var(--clr-charcoal); background: #faf7f2; border: 1.5px solid var(--clr-border); border-radius: var(--radius-md); padding: 10px 13px; outline: none; transition: border-color 0.2s; resize: vertical; }
  .field input:focus, .field textarea:focus { border-color: var(--clr-brown); background: #fff; }
  .color-preview { display: flex; gap: 6px; margin-top: 4px; flex-wrap: wrap; }
  .color-dot { width: 24px; height: 24px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 0 0 1px var(--clr-border); }

  /* Search */
  .search-bar { display: flex; gap: var(--space-2); margin-bottom: var(--space-4); }
  .search-input { flex: 1; font-family: var(--font-body); font-size: var(--text-sm); color: var(--clr-charcoal); background: #faf7f2; border: 1.5px solid var(--clr-border); border-radius: var(--radius-full); padding: 10px 16px; outline: none; transition: border-color 0.2s; }
  .search-input:focus { border-color: var(--clr-brown); background: #fff; }
  .search-btn { width: 40px; height: 40px; border-radius: 50%; background: var(--clr-charcoal); color: #fff; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: background 0.15s; }
  .search-btn:hover:not(:disabled) { background: var(--clr-brown); }
  .search-btn:disabled { opacity: 0.5; }
  .search-error { font-size: 13px; color: #a33020; margin-bottom: var(--space-3); display: flex; align-items: center; gap: 6px; }

  /* Search results */
  .search-results { display: flex; flex-direction: column; border: 1px solid var(--clr-border); border-radius: var(--radius-lg); overflow: hidden; margin-bottom: var(--space-4); }
  .result-row { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3); background: none; border: none; border-bottom: 1px solid var(--clr-border); cursor: pointer; text-align: left; transition: background 0.15s; width: 100%; font-family: var(--font-body); }
  .result-row:last-child { border-bottom: none; }
  .result-row:hover { background: var(--clr-cream); }
  .result-img-wrap { flex-shrink: 0; }
  .result-img { width: 52px; height: 52px; object-fit: cover; border-radius: var(--radius-md); display: block; }
  .result-img--ph { background: var(--clr-light-taupe); display: flex; align-items: center; justify-content: center; color: var(--clr-taupe); font-size: 18px; }
  .result-info { flex: 1; min-width: 0; }
  .result-store { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--clr-taupe); margin-bottom: 2px; }
  .result-name { font-size: 13px; font-weight: 500; color: var(--clr-charcoal); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-bottom: 2px; }
  .result-price { font-size: 13px; font-weight: 600; color: var(--clr-brown); }
  .result-add { color: var(--clr-terracotta); font-size: 14px; flex-shrink: 0; }

  /* Staged card */
  .staged-card { background: var(--clr-cream); border: 1.5px solid var(--clr-terracotta); border-radius: var(--radius-xl); padding: var(--space-5); margin-bottom: var(--space-4); }
  .staged-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-4); }
  .staged-label { font-size: 12px; font-weight: 600; color: var(--clr-terracotta); text-transform: uppercase; letter-spacing: 0.08em; }
  .staged-dismiss { background: none; border: none; cursor: pointer; font-size: 18px; color: var(--clr-taupe); line-height: 1; padding: 0; }
  .staged-body { display: flex; gap: var(--space-4); }
  .staged-img { width: 80px; height: 80px; object-fit: cover; border-radius: var(--radius-md); flex-shrink: 0; }
  .staged-fields { flex: 1; display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); }
  .staged-actions { display: flex; gap: var(--space-3); justify-content: flex-end; margin-top: var(--space-4); }

  /* Pieces list */
  .pieces-list { display: flex; flex-direction: column; gap: var(--space-2); }
  .piece-row { background: #faf7f2; border: 1px solid var(--clr-border); border-radius: var(--radius-lg); overflow: hidden; }
  .piece-row:not(.is-editing) { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3); }
  .piece-img-wrap { flex-shrink: 0; }
  .piece-img { width: 56px; height: 56px; object-fit: cover; border-radius: var(--radius-md); display: block; }
  .piece-img--ph { background: var(--clr-light-taupe); display: flex; align-items: center; justify-content: center; color: var(--clr-taupe); font-size: 18px; }
  .piece-info { flex: 1; min-width: 0; }
  .piece-store { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--clr-taupe); }
  .piece-name { font-size: 13px; font-weight: 500; color: var(--clr-charcoal); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .piece-price { font-size: 13px; font-weight: 600; color: var(--clr-brown); }
  .piece-actions { display: flex; gap: 4px; }

  .piece-edit-form { padding: var(--space-5); }
  .piece-edit-grid { margin-bottom: var(--space-4); }
  .piece-edit-actions { display: flex; gap: var(--space-3); justify-content: flex-end; }

  .btn-icon { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: var(--radius-md); background: none; border: none; cursor: pointer; color: var(--clr-taupe); font-size: 13px; transition: background 0.15s, color 0.15s; font-family: var(--font-body); }
  .btn-icon:hover { background: var(--clr-beige); color: var(--clr-charcoal); }
  .btn-icon--danger:hover { background: #fdf0ee; color: #a33020; }

  /* Category grid */
  .cat-grid { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 4px; }

  .cat-card {
    display: flex; flex-direction: column; align-items: center; gap: 6px;
    width: 72px; background: none; border: 1.5px solid var(--clr-border);
    border-radius: var(--radius-lg); padding: 8px 6px;
    cursor: pointer; position: relative; font-family: var(--font-body);
    transition: border-color 0.15s, background 0.15s;
  }
  .cat-card:hover { border-color: var(--clr-light-taupe); background: var(--clr-cream); }
  .cat-card.active { border-color: var(--clr-charcoal); background: var(--clr-charcoal); }
  .cat-card.active .cat-card__name { color: #fff; }
  .cat-card__img { width: 40px; height: 40px; border-radius: var(--radius-md); object-fit: cover; flex-shrink: 0; }
  .cat-card__img--ph { background: var(--clr-beige); display: flex; align-items: center; justify-content: center; color: var(--clr-taupe); font-size: 14px; }
  .cat-card.active .cat-card__img--ph { background: rgba(255,255,255,0.15); color: rgba(255,255,255,0.8); }
  .cat-card__img--add { background: var(--clr-beige); display: flex; align-items: center; justify-content: center; color: var(--clr-terracotta); font-size: 14px; border: 2px dashed var(--clr-terracotta); }
  .cat-card--new { border-color: var(--clr-terracotta); border-style: dashed; }
  .cat-card--new .cat-card__name { color: var(--clr-terracotta); }
  .cat-card__name { font-size: 10px; font-weight: 500; color: var(--clr-taupe); text-align: center; text-transform: capitalize; line-height: 1.2; transition: color 0.15s; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
  .cat-card__check { position: absolute; top: 4px; right: 4px; width: 16px; height: 16px; border-radius: 50%; background: var(--clr-terracotta); color: white; font-size: 8px; display: flex; align-items: center; justify-content: center; }

  /* New category form */
  .new-cat-form { background: var(--clr-cream); border: 1px solid var(--clr-border); border-radius: var(--radius-lg); padding: var(--space-5); margin-top: var(--space-4); }
  .new-cat-title { font-family: var(--font-display); font-size: var(--text-base); font-weight: 500; margin-bottom: var(--space-4); }
  .cat-error { font-size: 12px; color: #a33020; display: flex; align-items: center; gap: 6px; margin-bottom: var(--space-3); }
  .new-cat-body { display: flex; gap: var(--space-4); align-items: flex-start; }
  .cat-img-upload { width: 80px; height: 80px; flex-shrink: 0; border-radius: var(--radius-md); overflow: hidden; cursor: pointer; position: relative; border: 2px dashed var(--clr-light-taupe); transition: border-color 0.15s; }
  .cat-img-upload:hover { border-color: var(--clr-brown); }
  .cat-img-preview { width: 100%; height: 100%; object-fit: cover; display: block; }
  .cat-img-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center; color: white; font-size: 16px; opacity: 0; transition: opacity 0.15s; }
  .cat-img-upload:hover .cat-img-overlay { opacity: 1; }
  .cat-img-ph { width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; color: var(--clr-taupe); font-size: 20px; }
  .cat-img-ph span { font-size: 9px; font-weight: 500; text-align: center; }
  .new-cat-fields { flex: 1; display: flex; flex-direction: column; gap: var(--space-3); }
  .new-cat-actions { display: flex; gap: var(--space-3); justify-content: flex-end; margin-top: var(--space-4); }

  /* Colors section */
  .colors-header { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-4); margin-bottom: var(--space-2); }
  .color-preview { display: flex; gap: 10px; flex-wrap: wrap; }
  .color-dot-lg { width: 48px; height: 48px; border-radius: var(--radius-md); border: 2px solid rgba(255,255,255,0.8); box-shadow: 0 2px 8px rgba(0,0,0,0.1); position: relative; cursor: default; }
  .color-dot-lg:hover .color-hex { opacity: 1; }
  .color-hex { position: absolute; bottom: -20px; left: 50%; transform: translateX(-50%); font-size: 9px; color: var(--clr-taupe); white-space: nowrap; opacity: 0; transition: opacity 0.15s; }
  .colors-empty { font-size: var(--text-sm); color: var(--clr-taupe); display: flex; align-items: center; gap: 8px; margin-top: var(--space-4); font-weight: 300; }
  .colors-empty i { color: var(--clr-terracotta); }
  .btn-spin-dark { width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--clr-light-taupe); border-top-color: var(--clr-charcoal); animation: spin 0.8s linear infinite; display: inline-block; }

  .btn-spin { width: 14px; height: 14px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; animation: spin 0.8s linear infinite; }

  @media (max-width: 480px) {
    .meta-grid, .staged-fields, .piece-edit-grid { grid-template-columns: 1fr; }
    .staged-body { flex-direction: column; }
  }
</style>
