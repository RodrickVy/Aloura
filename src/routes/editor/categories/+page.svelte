<script lang="ts">
  import { createSupabaseBrowserClient } from '$lib/supabase';

  let { data } = $props();
  const supabase = createSupabaseBrowserClient();

  interface Category {
    id: string; name: string; description: string | null; image_url: string | null; created_at: string;
  }

  let categories  = $state<Category[]>(data.categories);
  let editingId   = $state<string | null>(null);
  let deletingId  = $state<string | null>(null);
  let saving      = $state(false);
  let saveError   = $state('');
  let savedId     = $state<string | null>(null);

  // Edited fields per category (keyed by id)
  let edits = $state<Record<string, { name: string; description: string; image_url: string; newImg: File | null; preview: string }>>({});

  function startEdit(cat: Category) {
    edits[cat.id] = {
      name:        cat.name,
      description: cat.description ?? '',
      image_url:   cat.image_url ?? '',
      newImg:      null,
      preview:     cat.image_url ?? '',
    };
    editingId = cat.id;
    saveError = '';
  }

  function cancelEdit() { editingId = null; saveError = ''; }

  function onImageSelect(id: string, e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    edits[id].newImg   = file;
    edits[id].preview  = URL.createObjectURL(file);
  }

  async function saveCategory(cat: Category) {
    const edit = edits[cat.id];
    if (!edit) return;
    if (!edit.name.trim()) { saveError = 'Name is required.'; return; }

    saving = true; saveError = '';
    try {
      let image_url = edit.image_url || null;

      if (edit.newImg) {
        const path = `categories/${Date.now()}_${edit.newImg.name}`;
        const { error: upErr } = await supabase.storage
          .from('profile_images').upload(path, edit.newImg, { upsert: true });
        if (upErr) throw upErr;
        const { data: { publicUrl } } = supabase.storage.from('profile_images').getPublicUrl(path);
        image_url = publicUrl;
      }

      const { error } = await supabase.from('categories').update({
        name:        edit.name.trim().toLowerCase(),
        description: edit.description.trim() || null,
        image_url,
      }).eq('id', cat.id);
      if (error) throw error;

      // Update local state
      categories = categories.map(c => c.id === cat.id
        ? { ...c, name: edit.name.trim().toLowerCase(), description: edit.description.trim() || null, image_url }
        : c
      );

      savedId = cat.id;
      editingId = null;
      setTimeout(() => savedId = null, 2000);
    } catch (e: any) {
      saveError = e.message?.includes('unique') ? 'That name already exists.' : (e.message ?? 'Save failed.');
    } finally {
      saving = false;
    }
  }

  async function deleteCategory(id: string) {
    if (!confirm('Delete this category? Boards using it will keep the name but it won\'t appear in the list.')) return;
    deletingId = id;
    await supabase.from('categories').delete().eq('id', id);
    categories = categories.filter(c => c.id !== id);
    deletingId = null;
  }
</script>

<svelte:head>
  <title>Category Editor - Aloura</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="cat-editor">

  <!-- HEADER -->
  <div class="page-header">
    <div>
      <a href="/editor" class="back-link"><i class="fas fa-arrow-left"></i> Editor</a>
      <h1 class="heading-lg" style="margin-top:var(--space-3)">Categories</h1>
      <p class="lead" style="font-size:var(--text-sm);margin-top:4px">{categories.length} categories</p>
    </div>
  </div>

  <!-- LIST -->
  <div class="cat-list">
    {#each categories as cat}
      <div class="cat-row" class:is-editing={editingId === cat.id} class:is-saved={savedId === cat.id}>

        {#if editingId === cat.id}
          <!-- ── EDIT MODE ── -->
          <div class="edit-form">
            {#if saveError}
              <p class="edit-error"><i class="fas fa-exclamation-circle"></i> {saveError}</p>
            {/if}
            <div class="edit-body">
              <!-- Image -->
              <label class="img-upload" title="Change image">
                {#if edits[cat.id]?.preview}
                  <img src={edits[cat.id].preview} alt="preview" class="img-preview" />
                  <div class="img-overlay"><i class="fas fa-camera"></i></div>
                {:else}
                  <div class="img-ph"><i class="fas fa-image"></i><span>Add image</span></div>
                {/if}
                <input type="file" accept="image/*" style="display:none" onchange={(e) => onImageSelect(cat.id, e)} />
              </label>

              <!-- Fields -->
              <div class="edit-fields">
                <div class="field">
                  <label>Name <span class="req">*</span></label>
                  <input type="text" bind:value={edits[cat.id].name} placeholder="Category name" />
                </div>
                <div class="field">
                  <label>Description</label>
                  <input type="text" bind:value={edits[cat.id].description} placeholder="Short description" />
                </div>
                <div class="field">
                  <label>Image URL <span class="hint">or upload above</span></label>
                  <input type="url" bind:value={edits[cat.id].image_url} placeholder="https://…" />
                </div>
              </div>
            </div>

            <div class="edit-actions">
              <button class="btn btn--ghost" onclick={cancelEdit} disabled={saving}>Cancel</button>
              <button class="btn btn--primary" onclick={() => saveCategory(cat)} disabled={saving}>
                {#if saving}<span class="btn-spin"></span>{/if}
                Save
              </button>
            </div>
          </div>

        {:else}
          <!-- ── VIEW MODE ── -->
          <div class="cat-view">
            <div class="cat-img-wrap">
              {#if cat.image_url}
                <img src={cat.image_url} alt={cat.name} class="cat-img" />
              {:else}
                <div class="cat-img cat-img--ph"><i class="fas fa-tag"></i></div>
              {/if}
              {#if savedId === cat.id}
                <div class="saved-badge"><i class="fas fa-check"></i></div>
              {/if}
            </div>
            <div class="cat-info">
              <div class="cat-name">{cat.name}</div>
              {#if cat.description}<div class="cat-desc">{cat.description}</div>{/if}
            </div>
            <div class="cat-actions">
              <button class="btn-icon" onclick={() => startEdit(cat)} title="Edit">
                <i class="fas fa-pen"></i>
              </button>
              <button
                class="btn-icon btn-icon--danger"
                onclick={() => deleteCategory(cat.id)}
                disabled={deletingId === cat.id}
                title="Delete"
              >
                {#if deletingId === cat.id}
                  <span class="spin-dark"></span>
                {:else}
                  <i class="fas fa-trash"></i>
                {/if}
              </button>
            </div>
          </div>
        {/if}

      </div>
    {/each}

    {#if categories.length === 0}
      <div class="empty">
        <i class="fas fa-tag"></i>
        <p>No categories yet.</p>
      </div>
    {/if}
  </div>

</div>

<style>
  .cat-editor { padding: calc(var(--nav-h) + var(--space-8)) var(--page-px) var(--space-16); max-width: 640px; margin: 0 auto; }

  .page-header { margin-bottom: var(--space-8); }
  .back-link { display: inline-flex; align-items: center; gap: 8px; font-size: var(--text-sm); color: var(--clr-taupe); text-decoration: none; transition: color 0.15s; }
  .back-link:hover { color: var(--clr-charcoal); }

  /* List */
  .cat-list { display: flex; flex-direction: column; gap: var(--space-3); }

  .cat-row { background: #fff; border: 1px solid var(--clr-border); border-radius: var(--radius-xl); overflow: hidden; transition: border-color 0.15s; }
  .cat-row.is-saved { border-color: #86efac; }

  /* View mode */
  .cat-view { display: flex; align-items: center; gap: var(--space-4); padding: var(--space-4); }
  .cat-img-wrap { position: relative; flex-shrink: 0; }
  .cat-img { width: 56px; height: 56px; border-radius: var(--radius-md); object-fit: cover; display: block; }
  .cat-img--ph { background: var(--clr-beige); display: flex; align-items: center; justify-content: center; color: var(--clr-taupe); font-size: 20px; }
  .saved-badge { position: absolute; top: -4px; right: -4px; width: 18px; height: 18px; border-radius: 50%; background: #22c55e; color: white; font-size: 9px; display: flex; align-items: center; justify-content: center; }
  .cat-info { flex: 1; min-width: 0; }
  .cat-name { font-size: var(--text-sm); font-weight: 600; color: var(--clr-charcoal); text-transform: capitalize; margin-bottom: 2px; }
  .cat-desc { font-size: var(--text-xs); color: var(--clr-taupe); font-weight: 300; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cat-actions { display: flex; gap: 4px; }

  /* Edit mode */
  .edit-form { padding: var(--space-5); }
  .edit-error { font-size: 12px; color: #a33020; display: flex; align-items: center; gap: 6px; margin-bottom: var(--space-4); }
  .edit-body { display: flex; gap: var(--space-4); align-items: flex-start; margin-bottom: var(--space-5); }

  .img-upload { width: 80px; height: 80px; flex-shrink: 0; border-radius: var(--radius-md); overflow: hidden; cursor: pointer; position: relative; border: 2px dashed var(--clr-light-taupe); transition: border-color 0.15s; display: block; }
  .img-upload:hover { border-color: var(--clr-brown); }
  .img-preview { width: 100%; height: 100%; object-fit: cover; display: block; }
  .img-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center; color: white; font-size: 16px; opacity: 0; transition: opacity 0.15s; }
  .img-upload:hover .img-overlay { opacity: 1; }
  .img-ph { width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; color: var(--clr-taupe); font-size: 20px; background: var(--clr-beige); }
  .img-ph span { font-size: 9px; font-weight: 500; }

  .edit-fields { flex: 1; display: flex; flex-direction: column; gap: var(--space-3); }
  .field { display: flex; flex-direction: column; gap: 5px; }
  .field label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--clr-taupe); }
  .field .req  { color: var(--clr-terracotta); }
  .field .hint { font-weight: 400; text-transform: none; letter-spacing: 0; font-size: 10px; color: var(--clr-text-faint); }
  .field input { font-family: var(--font-body); font-size: var(--text-sm); color: var(--clr-charcoal); background: #faf7f2; border: 1.5px solid var(--clr-border); border-radius: var(--radius-md); padding: 10px 13px; outline: none; transition: border-color 0.2s; }
  .field input:focus { border-color: var(--clr-brown); background: #fff; }
  .edit-actions { display: flex; gap: var(--space-3); justify-content: flex-end; }

  /* Shared */
  .btn-icon { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: var(--radius-md); background: none; border: none; cursor: pointer; color: var(--clr-taupe); font-size: 13px; transition: background 0.15s, color 0.15s; font-family: var(--font-body); }
  .btn-icon:hover { background: var(--clr-beige); color: var(--clr-charcoal); }
  .btn-icon--danger:hover { background: #fdf0ee; color: #a33020; }
  .btn-spin  { width: 14px; height: 14px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; animation: spin 0.8s linear infinite; }
  .spin-dark { width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--clr-light-taupe); border-top-color: var(--clr-charcoal); animation: spin 0.8s linear infinite; display: inline-block; }
  button:disabled { opacity: 0.55; cursor: not-allowed; }

  .empty { text-align: center; padding: var(--space-16); color: var(--clr-taupe); display: flex; flex-direction: column; align-items: center; gap: var(--space-4); }
  .empty i { font-size: 32px; }
  .empty p { font-size: var(--text-sm); font-weight: 300; }
</style>
