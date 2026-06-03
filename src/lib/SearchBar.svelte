<script lang="ts">
  interface Props {
    value?:        string;
    loading?:      boolean;
    placeholder?:  string;
    onsubmit:      () => void;
    onimage:       (b64: string, type: string, name: string) => void;
    imageAttached?: boolean;
    imageName?:    string;
    onclearimage:  () => void;
  }

  let {
    value       = $bindable(''),
    loading     = false,
    placeholder = 'Date night, casual work look, gym outfit…',
    onsubmit,
    onimage,
    imageAttached = false,
    imageName     = '',
    onclearimage,
  }: Props = $props();

  function handleFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      onimage(result.split(',')[1], file.type, file.name);
    };
    reader.readAsDataURL(file);
  }
</script>

<div class="search-wrap">
  <div class="search-inner" class:has-image={imageAttached}>

    <!-- Plus / image upload on left -->
    <label class="upload-btn" title={imageAttached ? imageName : 'Add image'}>
      {#if imageAttached}
        <i class="fas fa-image" style="color:var(--clr-terracotta)"></i>
        <button
          type="button"
          class="upload-clear"
          onclick={(e) => { e.preventDefault(); onclearimage(); }}
          aria-label="Remove image"
        >×</button>
      {:else}
        <i class="fas fa-plus"></i>
      {/if}
      <input type="file" accept="image/*" style="display:none" onchange={handleFile} />
    </label>

    <!-- Text input -->
    <textarea
      class="search-input"
      {placeholder}
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

  .search-inner {
    display: flex; align-items: center; gap: 10px;
    background: var(--clr-cream); border: 1.5px solid var(--clr-light-taupe);
    border-radius: var(--radius-full); padding: 8px 10px 8px 14px;
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
