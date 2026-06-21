<script lang="ts">
  import { createSupabaseBrowserClient } from '$lib/supabase';

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
    isLoggedIn?:   boolean;
  }

  let {
    value       = $bindable(''),
    mode        = $bindable<'outfit' | 'product'>('product'),
    loading     = false,
    placeholder = 'Search a product - white linen shirt, chelsea boots…',
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
    isLoggedIn    = false,
  }: Props = $props();

  const supabase = createSupabaseBrowserClient();

  // Teleport popup nodes to <body> so they escape any backdrop-filter stacking context
  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return { destroy() { node.remove(); } };
  }

  // ── Outfit popup ──
  let outfitPopupOpen = $state(false);
  let notifChecked    = $state(false);
  let notifEmail      = $state('');
  let notifSaving     = $state(false);
  let notifDone       = $state(false);
  let notifError      = $state('');

  // ── Image popup ──
  let imagePopupOpen = $state(false);
  let imgEmail       = $state('');
  let imgSaving      = $state(false);
  let imgDone        = $state(false);
  let imgError       = $state('');

  async function saveOutfitNotif() {
    notifSaving = true; notifError = '';
    try {
      if (isLoggedIn) {
        await supabase.from('waitlist').insert({ email: 'notify-logged-in', source: 'outfit-feature' });
      } else {
        const email = notifEmail.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
          notifError = 'Please enter a valid email.'; notifSaving = false; return;
        }
        const { error } = await supabase.from('waitlist').insert({ email, source: 'outfit-feature' });
        if (error && !/duplicate|unique/i.test(error.message)) throw error;
      }
      notifDone = true;
      setTimeout(() => { outfitPopupOpen = false; notifDone = false; notifChecked = false; notifEmail = ''; }, 1400);
    } catch { notifError = 'Something went wrong. Please try again.'; }
    finally { notifSaving = false; }
  }

  async function saveImageNotif() {
    const email = imgEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { imgError = 'Please enter a valid email.'; return; }
    imgSaving = true; imgError = '';
    try {
      const { error } = await supabase.from('waitlist').insert({ email, source: 'image-search-feature' });
      if (error && !/duplicate|unique/i.test(error.message)) throw error;
      imgDone = true;
      setTimeout(() => { imagePopupOpen = false; imgDone = false; imgEmail = ''; }, 1400);
    } catch { imgError = 'Something went wrong. Please try again.'; }
    finally { imgSaving = false; }
  }

  // ── Filters ──
  let filterOpen = $state(false);

  const GENDERS: { v: Gender; l: string }[] = [
    { v: 'any',    l: 'Any' },
    { v: 'mens',   l: "Men's" },
    { v: 'womens', l: "Women's" },
    { v: 'unisex', l: 'Unisex' },
  ];

  const NO_CAP = 100000;
  const priceBuckets = [25, 50, 80, 150];
  const lastBucket = priceBuckets[priceBuckets.length - 1];
  const storedFor  = (v: number) => (v === lastBucket ? NO_CAP : v);
  const priceLabel = (v: number) => (v === lastBucket ? `$${v}+` : `Under $${v}`);
  function togglePrice(v: number) {
    const s = storedFor(v);
    priceMax = priceMax === s ? null : s;
  }

  const activeFilters = $derived((gender !== 'any' ? 1 : 0) + (priceMax ? 1 : 0));
  function clearFilters() { gender = 'any'; priceMax = null; }
</script>

<!-- Outfit coming-soon popup -->
{#if outfitPopupOpen}
  <div class="popup-overlay" use:portal role="dialog" aria-modal="true" onclick={() => { outfitPopupOpen = false; notifDone = false; notifError = ''; }}>
    <div class="popup" onclick={(e) => e.stopPropagation()}>
      <button class="popup__close" onclick={() => { outfitPopupOpen = false; notifDone = false; notifError = ''; }} aria-label="Close">×</button>
      <div class="popup__icon"><i class="fas fa-layer-group"></i></div>
      <h2 class="popup__title">Search by Outfit</h2>
      <p class="popup__desc">
        Discover outfits curated to work together — so you never second-guess your look again.
      </p>
      <p class="popup__coming">Coming soon</p>
      {#if !notifDone}
        <div class="popup__notify">
          {#if isLoggedIn}
            <label class="popup__check">
              <input type="checkbox" bind:checked={notifChecked} />
              Receive notification when this feature comes out
            </label>
            {#if notifChecked}
              <button class="popup__btn" onclick={saveOutfitNotif} disabled={notifSaving}>
                {notifSaving ? 'Saving…' : 'Notify me'}
              </button>
            {/if}
          {:else}
            <p class="popup__notify-label">Get notified by email when it launches:</p>
            <div class="popup__email-row">
              <input class="popup__email" type="email" placeholder="your@email.com" bind:value={notifEmail}
                onkeydown={(e) => { if (e.key === 'Enter') saveOutfitNotif(); }} />
              <button class="popup__btn" onclick={saveOutfitNotif} disabled={notifSaving}>
                {notifSaving ? '…' : 'Notify me'}
              </button>
            </div>
          {/if}
          {#if notifError}<p class="popup__error">{notifError}</p>{/if}
        </div>
      {:else}
        <p class="popup__done"><i class="fas fa-check-circle"></i> You're on the list!</p>
      {/if}
    </div>
  </div>
{/if}

<!-- Image search coming-soon popup -->
{#if imagePopupOpen}
  <div class="popup-overlay" use:portal role="dialog" aria-modal="true" onclick={() => { imagePopupOpen = false; imgDone = false; imgError = ''; }}>
    <div class="popup" onclick={(e) => e.stopPropagation()}>
      <button class="popup__close" onclick={() => { imagePopupOpen = false; imgDone = false; imgError = ''; }} aria-label="Close">×</button>
      <div class="popup__icon"><i class="fas fa-camera"></i></div>
      <h2 class="popup__title">Recreating an Outfit from a Picture</h2>
      <p class="popup__desc">
        Upload any photo and we'll identify each piece, find them across 20+ stores, and build you a shoppable outfit — instantly.
      </p>
      <p class="popup__coming">Coming soon</p>
      {#if !imgDone}
        <div class="popup__notify">
          <p class="popup__notify-label">Get notified when image search launches:</p>
          <div class="popup__email-row">
            <input class="popup__email" type="email" placeholder="your@email.com" bind:value={imgEmail}
              onkeydown={(e) => { if (e.key === 'Enter') saveImageNotif(); }} />
            <button class="popup__btn" onclick={saveImageNotif} disabled={imgSaving}>
              {imgSaving ? '…' : 'Notify me'}
            </button>
          </div>
          {#if imgError}<p class="popup__error">{imgError}</p>{/if}
        </div>
      {:else}
        <p class="popup__done"><i class="fas fa-check-circle"></i> You're on the list!</p>
      {/if}
    </div>
  </div>
{/if}

<div class="search-wrap">
  <div class="search-inner" class:has-image={imageAttached}>

    <!-- Mode toggle -->
    <div class="mode-toggle">
      <button class="mode-opt mode-opt--soon" onclick={() => { outfitPopupOpen = true; notifDone = false; }} title="Outfit (coming soon)">
        <i class="fas fa-layer-group"></i><span>Outfit</span>
      </button>
      <button class="mode-opt active" onclick={() => mode = 'product'} title="Product">
        <i class="fas fa-tag"></i><span>Product</span>
      </button>
    </div>

    <!-- Image upload button → shows popup -->
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
        <button type="button" class="upload-btn" title="Search by image (coming soon)"
          onclick={() => { imagePopupOpen = true; imgDone = false; }}>
          <i class="fas fa-plus"></i>
        </button>
      {/if}
    {/if}

    <!-- Text input -->
    <input
      class="search-input"
      type="text"
      placeholder={placeholder}
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
    <button class="search-btn" onclick={onsubmit} disabled={loading || !value.trim()} aria-label="Search">
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
        <span class="filter-label">Price</span>
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
  /* ── Popups ── */
  .popup-overlay {
    position: fixed; inset: 0; z-index: 9999;
    background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center;
    padding: 20px; animation: overlayIn 0.18s ease;
  }
  @keyframes overlayIn { from { opacity: 0; } to { opacity: 1; } }

  .popup {
    position: relative; background: #fff; border-radius: 22px;
    padding: 36px 28px 28px; max-width: 420px; width: 100%;
    box-shadow: 0 24px 64px rgba(0,0,0,0.18);
    display: flex; flex-direction: column; align-items: center; gap: 14px;
    text-align: center; animation: popupIn 0.2s ease;
  }
  @keyframes popupIn { from { opacity: 0; transform: scale(0.94) translateY(8px); } to { opacity: 1; transform: none; } }

  .popup__close {
    position: absolute; top: 14px; right: 18px;
    background: none; border: none; cursor: pointer;
    font-size: 22px; color: var(--clr-taupe); line-height: 1; padding: 4px;
  }
  .popup__close:hover { color: var(--clr-charcoal); }

  .popup__icon {
    width: 54px; height: 54px; border-radius: 50%;
    background: var(--clr-beige); display: flex; align-items: center; justify-content: center;
    color: var(--clr-charcoal); font-size: 22px;
  }

  .popup__title {
    font-family: var(--font-display); font-size: 21px; font-weight: 500;
    color: var(--clr-charcoal); line-height: 1.25;
  }

  .popup__desc {
    font-size: 14px; font-weight: 300; color: var(--clr-taupe);
    line-height: 1.6; max-width: 310px;
  }

  .popup__coming {
    display: inline-block; background: var(--clr-beige);
    color: var(--clr-brown); font-size: 11px; font-weight: 600;
    letter-spacing: 0.08em; text-transform: uppercase;
    padding: 4px 12px; border-radius: 999px;
  }

  .popup__notify { width: 100%; display: flex; flex-direction: column; gap: 10px; margin-top: 4px; }
  .popup__notify-label { font-size: 13px; font-weight: 500; color: var(--clr-charcoal); text-align: left; }

  .popup__check {
    display: flex; align-items: center; gap: 9px;
    font-size: 13.5px; color: var(--clr-charcoal); cursor: pointer; text-align: left;
  }
  .popup__check input { width: 16px; height: 16px; cursor: pointer; accent-color: var(--clr-charcoal); }

  .popup__email-row { display: flex; gap: 8px; }
  .popup__email {
    flex: 1; border: 1.5px solid var(--clr-light-taupe); border-radius: 999px;
    padding: 9px 14px; font-family: var(--font-body); font-size: 13px; outline: none;
    background: var(--clr-cream); color: var(--clr-charcoal); transition: border-color 0.15s;
  }
  .popup__email:focus { border-color: var(--clr-brown); }

  .popup__btn {
    background: var(--clr-charcoal); color: #fff; border: none; border-radius: 999px;
    padding: 9px 18px; font-family: var(--font-body); font-size: 13px; font-weight: 500;
    cursor: pointer; white-space: nowrap; transition: background 0.15s;
  }
  .popup__btn:hover:not(:disabled) { background: var(--clr-brown); }
  .popup__btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .popup__error { font-size: 12px; color: #a33020; text-align: left; margin-top: -4px; }
  .popup__done {
    font-size: 14px; color: var(--clr-brown); font-weight: 500;
    display: flex; align-items: center; gap: 8px;
  }

  /* ── Search wrap ── */
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
    transition: background 0.15s, color 0.15s, opacity 0.15s; white-space: nowrap;
  }
  .mode-opt.active { background: #fff; color: var(--clr-charcoal); box-shadow: var(--shadow-sm); }
  .mode-opt--soon { opacity: 0.65; }
  .mode-opt--soon:hover { opacity: 0.85; }
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
    border: none; transition: background var(--dur-fast), color var(--dur-fast);
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
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
