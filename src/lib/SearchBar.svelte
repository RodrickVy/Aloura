<script lang="ts">
  interface Props {
    value?:        string;
    mode?:         'outfit' | 'product';
    loading?:      boolean;
    placeholder?:  string;
    showImage?:    boolean;
    onsubmit:      () => void;
    onimage?:      (b64: string, type: string, name: string) => void;
    imageAttached?: boolean;
    imageName?:    string;
    imagePreview?: string;
    onclearimage?: () => void;
  }

  let {
    value       = $bindable(''),
    mode        = $bindable<'outfit' | 'product'>('outfit'),
    loading     = false,
    placeholder = 'Date night, casual work look, gym outfit…',
    showImage   = true,
    onsubmit,
    onimage,
    imageAttached = false,
    imageName     = '',
    imagePreview  = '',
    onclearimage,
  }: Props = $props();

  const ph = $derived(
    mode === 'product'
      ? 'Search a product - white linen shirt, chelsea boots…'
      : placeholder
  );

  function handleFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      onimage?.(result.split(',')[1], file.type, file.name);
    };
    reader.readAsDataURL(file);
  }
</script>

<div class="search-wrap">
  <div class="search-inner" class:has-image={imageAttached}>

    <!-- Mode toggle (embedded, left) -->
    <div class="mode-toggle">
      <button class="mode-opt" class:active={mode === 'outfit'} onclick={() => mode = 'outfit'} title="Outfit">
        <i class="fas fa-layer-group"></i><span>Outfit</span>
      </button>
      <button class="mode-opt" class:active={mode === 'product'} onclick={() => mode = 'product'} title="Product">
        <i class="fas fa-tag"></i><span>Product</span>
      </button>
    </div>

    <!-- Plus / image upload -->
    {#if showImage}
      {#if imageAttached}
        <div class="thumb" title={imageName}>
          {#if imagePreview}
            <img src={imagePreview} alt="upload preview" />
          {:else}
            <i class="fas fa-image"></i>
          {/if}
          <button
            type="button"
            class="thumb__remove"
            onclick={() => onclearimage?.()}
            aria-label="Remove image"
          >×</button>
        </div>
      {:else}
        <label class="upload-btn" title="Add image">
          <i class="fas fa-plus"></i>
          <input type="file" accept="image/*" style="display:none" onchange={handleFile} />
        </label>
      {/if}
    {/if}

    <!-- Text input -->
    <textarea
      class="search-input"
      placeholder={ph}
      bind:value
      rows={1}
      onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onsubmit(); } }}
    ></textarea>

    <!-- Submit -->
    <button
      class="search-btn"
      onclick={onsubmit}
      disabled={loading || (!value.trim() && !imageAttached)}
      aria-label="Search"
    >
      {#if loading}
        <span class="btn-spin"></span>
      {:else}
        <i class="fas fa-arrow-right"></i>
      {/if}
    </button>
  </div>
</div>

<style>
  .search-wrap { width: 100%; }

  /* Compact toggle embedded at the left of the box */
  .mode-toggle {
    display: inline-flex; gap: 2px; flex-shrink: 0;
    background: var(--clr-beige); border-radius: 999px; padding: 2px;
  }
  .mode-opt {
    display: inline-flex; align-items: center; gap: 5px;
    border: none; background: none; cursor: pointer;
    font-family: var(--font-body); font-size: 11px; font-weight: 500;
    color: var(--clr-taupe); padding: 5px 10px; border-radius: 999px;
    transition: background 0.15s, color 0.15s; white-space: nowrap;
  }
  .mode-opt.active { background: #fff; color: var(--clr-charcoal); box-shadow: var(--shadow-sm); }
  .mode-opt i { font-size: 10px; }
  /* Hide labels on small screens - icons only */
  @media (max-width: 560px) { .mode-opt span { display: none; } .mode-opt { padding: 6px 9px; } }

  .search-inner {
    display: flex; align-items: center; gap: 8px;
    background: var(--clr-cream); border: 1.5px solid var(--clr-light-taupe);
    border-radius: var(--radius-full); padding: 7px 8px 7px 8px;
    transition: border-color var(--dur-base);
  }
  .search-inner:focus-within { border-color: var(--clr-brown); }
  .search-inner.has-image { border-color: var(--clr-terracotta); }

  .upload-btn {
    display: flex; align-items: center; justify-content: center;
    width: 30px; height: 30px; border-radius: 50%; flex-shrink: 0;
    background: var(--clr-beige); cursor: pointer;
    color: var(--clr-taupe); font-size: 13px;
    transition: background var(--dur-fast), color var(--dur-fast);
    position: relative;
  }
  .upload-btn:hover { background: var(--clr-light-taupe); color: var(--clr-charcoal); }

  /* Image thumbnail preview inside the box */
  .thumb {
    position: relative; flex-shrink: 0;
    width: 34px; height: 34px; border-radius: 8px; overflow: visible;
    background: var(--clr-beige); display: flex; align-items: center; justify-content: center;
    color: var(--clr-taupe); font-size: 13px;
  }
  .thumb img { width: 34px; height: 34px; border-radius: 8px; object-fit: cover; display: block; }
  .thumb__remove {
    position: absolute; top: -6px; right: -6px;
    width: 16px; height: 16px; border-radius: 50%;
    background: var(--clr-charcoal); color: #fff; border: 1.5px solid #fff;
    cursor: pointer; font-size: 10px; line-height: 1;
    display: flex; align-items: center; justify-content: center;
  }
  .upload-clear {
    position: absolute; top: -4px; right: -4px;
    width: 14px; height: 14px; border-radius: 50%;
    background: var(--clr-charcoal); color: white;
    border: none; cursor: pointer; font-size: 9px; line-height: 1;
    display: flex; align-items: center; justify-content: center;
  }

  .search-input {
    flex: 1; background: none; border: none; outline: none;
    font-family: var(--font-body); font-size: var(--text-base);
    font-weight: 300; color: var(--clr-charcoal); resize: none; line-height: 1.5;
  }

  .search-btn {
    width: 34px; height: 34px; border-radius: 50%; flex-shrink: 0;
    background: var(--clr-charcoal); color: white; border: none; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    font-size: 13px; transition: background var(--dur-base);
  }
  .search-btn:hover:not(:disabled) { background: var(--clr-brown); }
  .search-btn:disabled { opacity: 0.45; cursor: not-allowed; }

  .btn-spin {
    width: 16px; height: 16px; border-radius: 50%;
    border: 2px solid rgba(255,255,255,0.4); border-top-color: white;
    animation: spin 0.8s linear infinite;
  }
</style>
