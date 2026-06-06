<script lang="ts">
  import { createSupabaseBrowserClient } from '$lib/supabase';
  import { goto } from '$app/navigation';

  let { data } = $props();
  const supabase = createSupabaseBrowserClient();

  let boards     = $state(data.boards);
  let creating   = $state(false);
  let deleting   = $state<string | null>(null);

  // New board form
  let showForm   = $state(false);
  const CATEGORIES = ['general','casual','formal','streetwear','workwear','athleisure','date night','vacation','festival','evening'];
  let form = $state({ title: '', description: '', occasion: '', goal: '', category: 'general' });
  let saving     = $state(false);
  let formError  = $state('');

  async function createBoard() {
    if (!form.title.trim()) { formError = 'Title is required.'; return; }
    saving = true; formError = '';
    try {
      const { data: board, error } = await supabase
        .from('mood_boards')
        .insert({
          account_id:      data.accountId,
          style_report_id: await getStyleReportId(),
          title:       form.title.trim(),
          description: form.description.trim() || null,
          occasion:    form.occasion.trim() || null,
          goal:        form.goal.trim() || null,
          category:    form.category,
          colors:      [],
          image_url:   null,
          public:      false,
        })
        .select('id').single();
      if (error) throw error;
      goto(`/editor/${board.id}`);
    } catch (e: any) {
      formError = e.message ?? 'Something went wrong.';
    } finally {
      saving = false;
    }
  }

  async function getStyleReportId(): Promise<string | null> {
    const { data: rep } = await supabase
      .from('style_reports')
      .select('id')
      .eq('account_id', data.accountId)
      .order('generated_at', { ascending: false })
      .limit(1).maybeSingle();
    return rep?.id ?? null;
  }

  async function togglePublic(id: string, current: boolean) {
    await supabase.from('mood_boards').update({ public: !current }).eq('id', id);
    boards = boards.map(b => b.id === id ? { ...b, public: !current } : b);
  }

  async function deleteBoard(id: string) {
    if (!confirm('Delete this board? This cannot be undone.')) return;
    deleting = id;
    await supabase.from('mood_boards').delete().eq('id', id);
    boards = boards.filter(b => b.id !== id);
    deleting = null;
  }
</script>

<svelte:head>
  <title>Editor - Aloura</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="editor-list">
  <div class="editor-list__header">
    <div>
      <h1 class="heading-lg">My Boards</h1>
      <p class="lead" style="font-size:var(--text-sm);margin-top:4px">{boards.length} board{boards.length !== 1 ? 's' : ''}</p>
    </div>
    <div style="display:flex;gap:var(--space-3);align-items:center">
      <a href="/editor/categories" class="btn btn--ghost" style="font-size:var(--text-sm)">
        <i class="fas fa-tag"></i> Categories
      </a>
      <button class="btn btn--primary" onclick={() => showForm = !showForm}>
        <i class="fas fa-plus"></i> New board
      </button>
    </div>
  </div>

  <!-- Create form -->
  {#if showForm}
    <div class="create-form">
      <h2 class="form-title">Create a new board</h2>
      {#if formError}<div class="form-error"><i class="fas fa-exclamation-circle"></i> {formError}</div>{/if}
      <div class="form-grid">
        <div class="form-field form-field--full">
          <label>Title <span class="req">*</span></label>
          <input type="text" bind:value={form.title} placeholder="e.g. Smart casual Friday" />
        </div>
        <div class="form-field form-field--full">
          <label>Description</label>
          <textarea bind:value={form.description} placeholder="What is this outfit for?" rows={2}></textarea>
        </div>
        <div class="form-field">
          <label>Occasion</label>
          <input type="text" bind:value={form.occasion} placeholder="e.g. Work meeting" />
        </div>
        <div class="form-field">
          <label>Goal</label>
          <input type="text" bind:value={form.goal} placeholder="e.g. Look professional" />
        </div>
        <div class="form-field form-field--full">
          <label>Category</label>
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px">
            {#each CATEGORIES as cat}
              <button type="button"
                style="padding:5px 12px;border-radius:999px;font-size:12px;font-weight:500;cursor:pointer;border:1.5px solid;font-family:var(--font-body);text-transform:capitalize;transition:all 0.15s;background:{form.category===cat?'var(--clr-charcoal)':'#faf7f2'};color:{form.category===cat?'#fff':'var(--clr-taupe)'};border-color:{form.category===cat?'var(--clr-charcoal)':'var(--clr-border)'}"
                onclick={() => form.category = cat}>{cat}</button>
            {/each}
          </div>
        </div>
      </div>
      <div class="form-actions">
        <button class="btn btn--ghost" onclick={() => { showForm = false; formError = ''; }}>Cancel</button>
        <button class="btn btn--primary" onclick={createBoard} disabled={saving}>
          {#if saving}<span class="btn-spin"></span>{/if}
          Create board
        </button>
      </div>
    </div>
  {/if}

  <!-- Board list -->
  {#if boards.length === 0}
    <div class="empty">
      <i class="fas fa-layer-group"></i>
      <p>No boards yet. Create your first one above.</p>
    </div>
  {:else}
    <div class="boards-grid">
      {#each boards as board}
        {@const imgs = (board.pieces ?? []).filter((p: any) => p.image_url).slice(0, 4).map((p: any) => p.image_url)}
        {@const count = imgs.length}
        <div class="board-card">
          <!-- Collage -->
          <div class="board-card__img-wrap">
            <div class="collage" class:collage--1={count === 1} class:collage--2={count === 2} class:collage--3={count === 3} class:collage--4={count >= 4}>
              {#if count === 0}
                <div class="collage__ph"><i class="fas fa-tshirt"></i></div>
              {:else}
                {#each imgs as src}
                  <div class="collage__cell">
                    <img src={src} alt="" loading="lazy" onerror={(e) => { (e.target as HTMLImageElement).parentElement!.style.background = '#E8E0D8'; (e.target as HTMLImageElement).style.display = 'none'; }} />
                  </div>
                {/each}
              {/if}
            </div>
            <!-- Public badge -->
            <button
              class="public-badge"
              class:is-public={board.public}
              onclick={() => togglePublic(board.id, board.public)}
              title={board.public ? 'Click to make private' : 'Click to make public'}
            >
              <i class={board.public ? 'fas fa-globe' : 'fas fa-lock'}></i>
              {board.public ? 'Public' : 'Private'}
            </button>
          </div>

          <!-- Info -->
          <div class="board-card__body">
            <div class="board-card__title">{board.title}</div>
            {#if board.occasion}<div class="board-card__occ">{board.occasion}</div>{/if}
          </div>

          <!-- Actions -->
          <div class="board-card__actions">
            <a href="/editor/{board.id}" class="btn-icon" title="Edit">
              <i class="fas fa-pen"></i> Edit
            </a>
            {#if board.slug}
              <a href="/outfit/{board.slug}" target="_blank" class="btn-icon" title="View public page">
                <i class="fas fa-external-link-alt"></i> View
              </a>
            {/if}
            <button
              class="btn-icon btn-icon--danger"
              onclick={() => deleteBoard(board.id)}
              disabled={deleting === board.id}
              title="Delete"
            >
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .editor-list { padding: calc(var(--nav-h) + var(--space-8)) var(--page-px) var(--space-16); max-width: 900px; margin: 0 auto; }

  .editor-list__header { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-4); margin-bottom: var(--space-8); }

  /* Create form */
  .create-form { background: var(--clr-cream); border: 1px solid var(--clr-border); border-radius: var(--radius-xl); padding: var(--space-8); margin-bottom: var(--space-8); }
  .form-title { font-family: var(--font-display); font-size: var(--text-xl); font-weight: 500; margin-bottom: var(--space-6); }
  .form-error { background: #fdf0ee; color: #a33020; border: 1px solid #f5c6c0; border-radius: var(--radius-md); padding: 10px 14px; font-size: 13px; margin-bottom: var(--space-4); display: flex; align-items: center; gap: 8px; }
  .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4); margin-bottom: var(--space-6); }
  .form-field { display: flex; flex-direction: column; gap: 6px; }
  .form-field--full { grid-column: 1 / -1; }
  .form-field label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--clr-taupe); }
  .form-field .req { color: var(--clr-terracotta); }
  .form-field .hint { font-weight: 400; text-transform: none; letter-spacing: 0; color: var(--clr-text-faint); }
  .form-field input, .form-field textarea { font-family: var(--font-body); font-size: var(--text-sm); color: var(--clr-charcoal); background: #fff; border: 1.5px solid var(--clr-border); border-radius: var(--radius-md); padding: 11px 14px; outline: none; transition: border-color 0.2s; resize: vertical; }
  .form-field input:focus, .form-field textarea:focus { border-color: var(--clr-brown); }
  .form-actions { display: flex; gap: var(--space-3); justify-content: flex-end; }

  /* Board grid */
  .boards-grid { display: grid; gap: var(--space-4); }
  .board-card { background: #fff; border: 1px solid var(--clr-border); border-radius: var(--radius-xl); overflow: hidden; }
  .board-card__img-wrap { position: relative; height: 160px; overflow: hidden; }

  .collage { width: 100%; height: 100%; display: grid; gap: 2px; background: var(--clr-light-taupe); }
  .collage--1 { grid-template-columns: 1fr; }
  .collage--2 { grid-template-columns: 1fr 1fr; }
  .collage--3 { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }
  .collage--3 .collage__cell:first-child { grid-row: span 2; }
  .collage--4 { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }
  .collage__cell { overflow: hidden; background: #e8e0d8; }
  .collage__cell img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .collage__ph { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; color: var(--clr-taupe); font-size: 32px; }
  .public-badge { position: absolute; top: 10px; right: 10px; display: flex; align-items: center; gap: 5px; padding: 5px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; border: none; cursor: pointer; background: rgba(255,255,255,0.9); color: var(--clr-taupe); backdrop-filter: blur(4px); transition: all 0.15s; }
  .public-badge.is-public { background: var(--clr-charcoal); color: #fff; }
  .board-card__body { padding: var(--space-4) var(--space-4) var(--space-2); }
  .board-card__title { font-size: var(--text-base); font-weight: 600; color: var(--clr-charcoal); margin-bottom: 2px; }
  .board-card__occ { font-size: var(--text-xs); color: var(--clr-taupe); }
  .board-card__actions { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-3) var(--space-4); border-top: 1px solid var(--clr-border); }
  .btn-icon { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 500; color: var(--clr-taupe); background: none; border: none; cursor: pointer; padding: 6px 10px; border-radius: var(--radius-md); text-decoration: none; transition: background 0.15s, color 0.15s; font-family: var(--font-body); }
  .btn-icon:hover { background: var(--clr-beige); color: var(--clr-charcoal); }
  .btn-icon--danger:hover { background: #fdf0ee; color: #a33020; }
  .btn-spin { width: 14px; height: 14px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; animation: spin 0.8s linear infinite; }

  .empty { text-align: center; padding: var(--space-16); color: var(--clr-taupe); display: flex; flex-direction: column; align-items: center; gap: var(--space-4); }
  .empty i { font-size: 36px; }
  .empty p { font-size: var(--text-sm); font-weight: 300; }

  @media (min-width: 640px) { .boards-grid { grid-template-columns: repeat(2, 1fr); } }
  @media (min-width: 900px) { .boards-grid { grid-template-columns: repeat(3, 1fr); } }
</style>
