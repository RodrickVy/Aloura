<script lang="ts">
  type Gender = 'any' | 'mens' | 'womens' | 'unisex';

  interface Props {
    value?:        string;
    mode?:         'outfit' | 'product';
    loading?:      boolean;
    placeholder?:  string;
    showImage?:    boolean;
    showFilters?:  boolean;
    gender?:       Gender;
    priceMax?:     number | null;
    onsubmit:      () => void;
    onimage?:      (b64: string, type: string, name: string) => void;
    onimageerror?: (msg: string) => void;
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
    showFilters = true,
    gender      = $bindable<Gender>('any'),
    priceMax    = $bindable<number | null>(null),
    onsubmit,
    onimage,
    onimageerror,
    imageAttached = false,
    imageName     = '',
    imagePreview  = '',
    onclearimage,
  }: Props = $props();

  const ALLOWED_TYPES = ['image/jpeg', 'image/png'];
  const FILE_ERR = 'Only JPG and PNG images are supported. Please choose a different file.';

  const ph = $derived(
    mode === 'product'
      ? 'Search a product - white linen shirt, chelsea boots…'
      : placeholder
  );

  // ── Filters ──
  let filterOpen = $state(false);

  const GENDERS: { v: Gender; l: string }[] = [
    { v: 'any',     l: 'Any' },
    { v: 'mens',    l: "Men's" },
    { v: 'womens',  l: "Women's" },
    { v: 'unisex',  l: 'Unisex' },
  ];

  // Mode-aware price buckets. Outfit = whole-outfit budget; product = per item.
  // The top bucket is an open-ended "+" tier = no upper limit (premium / any).
  const NO_CAP = 100000;
  const priceBuckets = $derived(mode === 'product' ? [25, 50, 100, 150, 200] : [150, 200, 250, 300, 500, 800]);
  const lastBucket = $derived(priceBuckets[priceBuckets.length - 1]);
  const storedFor  = (v: number) => (v === lastBucket ? NO_CAP : v);
  const priceLabel = (v: number) => (v === lastBucket ? `$${v}+` : `Under $${v}`);
  function togglePrice(v: number) {
    const s = storedFor(v);
    priceMax = priceMax === s ? null : s;
  }

  const activeFilters = $derived((gender !== 'any' ? 1 : 0) + (priceMax ? 1 : 0));

  function clearFilters() { gender = 'any'; priceMax = null; }

  function handleFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      onimageerror?.(FILE_ERR);
      input.value = '';
      return;
    }
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
          <button type="button" class="thumb__remove" onclick={() => onclearimage?.()} aria-label="Remove image">×</button>
        </div>
      {:else}
        <label class="upload-btn" title="Add image">
          <i class="fas fa-plus"></i>
          <input type="file" accept="image/jpeg,image/png" style="display:none" onchange={handleFile} />
        </label>
      {/if}
    {/if}

    <!-- Text input (single line, scrolls horizontally) -->
    <input
      class="search-input"
      type="text"
      placeholder={ph}
      bind:value
      onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onsubmit(); } }}
    />

    <!-- Filter toggle -->
    {#if showFilters}
      <button
        class="filter-btn"
        class:active={filterOpen || activeFilters > 0}
        onclick={() => filterOpen = !filterOpen}
        title="Filters"
        aria-label="Filters"
      >
        <i class="fas fa-sliders"></i>
        {#if activeFilters > 0}<span class="filter-count">{activeFilters}</span>{/if}
      </button>
    {/if}

    <!-- Submit -->
    <button class="search-btn" onclick={onsubmit} disabled={loading || (!value.trim() && !imageAttached)} aria-label="Search">
      {#if loading}<span class="btn-spin"></span>{:else}<i class="fas fa-arrow-right"></i>{/if}
    </button>
  </div>

  <!-- Filter panel -->
  {#if showFilters && filterOpen}
    <div class="filter-panel">
      <div class="filter-group">
        <span class="filter-label">For</span>
        <div class="filter-chips">
          {#each GENDERS as g}
            <button class="fchip" class:on={gender === g.v} onclick={() => gender = g.v}>{g.l}</button>
          {/each}
        </div>
      </div>

      <div class="filter-group">
        <span class="filter-label">{mode === 'outfit' ? 'Total budget' : 'Price'}</span>
        <div class="filter-chips">
          {#each priceBuckets as p}
            <button class="fchip" class:on={priceMax === storedFor(p)} onclick={() => togglePrice(p)}>{priceLabel(p)}</button>
          {/each}
        </div>
      </div>

      <div class="filter-foot">
        {#if activeFilters > 0}<button class="filter-clear" onclick={clearFilters}>Clear filters</button>{/if}
        <button class="filter-done" onclick={() => filterOpen = false}>Done</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .search-wrap { width: 100%; position: relative; }

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
  @media (max-width: 560px) { .mode-opt span { display: none; } .mode-opt { padding: 6px 9px; } }

  .search-inner {
    display: flex; align-items: center; gap: 8px;
    background: var(--clr-cream); border: 1.5px solid var(--clr-light-taupe);
    border-radius: var(--radius-full); padding: 7px 8px;
    transition: border-color var(--dur-base);
  }
  .search-inner:focus-within { border-color: var(--clr-brown); }
  .search-inner.has-image { border-color: var(--clr-terracotta); }

  .upload-btn {
    display: flex; align-items: center; justify-content: center;
    width: 30px; height: 30px; border-radius: 50%; flex-shrink: 0;
    background: var(--clr-beige); cursor: pointer; color: var(--clr-taupe); font-size: 13px;
    transition: background var(--dur-fast), color var(--dur-fast); position: relative;
  }
  .upload-btn:hover { background: var(--clr-light-taupe); color: var(--clr-charcoal); }

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

  /* Single-line input that scrolls horizontally instead of wrapping */
  .search-input {
    flex: 1; min-width: 0; background: none; border: none; outline: none;
    font-family: var(--font-body); font-size: var(--text-base);
    font-weight: 300; color: var(--clr-charcoal); line-height: 1.5;
    white-space: nowrap; overflow-x: auto; text-overflow: clip;
  }

  .filter-btn {
    position: relative; flex-shrink: 0;
    width: 32px; height: 32px; border-radius: 50%;
    background: var(--clr-beige); border: none; cursor: pointer;
    color: var(--clr-taupe); font-size: 13px; display: flex; align-items: center; justify-content: center;
    transition: background 0.15s, color 0.15s;
  }
  .filter-btn:hover { background: var(--clr-light-taupe); color: var(--clr-charcoal); }
  .filter-btn.active { background: var(--clr-charcoal); color: #fff; }
  .filter-count {
    position: absolute; top: -3px; right: -3px;
    min-width: 15px; height: 15px; padding: 0 3px; border-radius: 999px;
    background: var(--clr-terracotta); color: #fff; font-size: 9px; font-weight: 700;
    display: flex; align-items: center; justify-content: center; border: 1.5px solid var(--clr-cream);
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

  /* Filter panel */
  .filter-panel {
    margin-top: 8px; background: #fff; border: 1.5px solid var(--clr-border);
    border-radius: 16px; padding: 14px 16px; box-shadow: var(--shadow-md);
    display: flex; flex-direction: column; gap: 14px;
    animation: fpIn 0.15s ease;
  }
  .filter-group { display: flex; flex-direction: column; gap: 8px; }
  .filter-label { font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--clr-taupe); }
  .filter-chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .fchip {
    background: var(--clr-beige); border: 1.5px solid transparent; border-radius: 999px;
    padding: 6px 13px; font-size: 12.5px; font-weight: 500; color: var(--clr-charcoal);
    cursor: pointer; font-family: var(--font-body); transition: all 0.13s;
  }
  .fchip:hover { border-color: var(--clr-light-taupe); }
  .fchip.on { background: var(--clr-charcoal); color: #fff; }
  .filter-foot { display: flex; align-items: center; justify-content: flex-end; gap: 14px; }
  .filter-clear { background: none; border: none; cursor: pointer; font-family: var(--font-body); font-size: 12.5px; color: var(--clr-taupe); text-decoration: underline; }
  .filter-clear:hover { color: var(--clr-charcoal); }
  .filter-done { background: var(--clr-charcoal); color: #fff; border: none; border-radius: 999px; padding: 7px 18px; font-family: var(--font-body); font-size: 12.5px; font-weight: 500; cursor: pointer; }
  .filter-done:hover { background: var(--clr-brown); }
  @keyframes fpIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
</style>
