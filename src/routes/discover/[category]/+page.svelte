<script lang="ts">
  import { page } from '$app/stores';
  let { data } = $props();

  const displayCategory = (c: string) =>
    c.split(' ').map(w => (w.toLowerCase() === 'fifa' ? 'FIFA' : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');

  const pieceImgs = (b: any) => (b.pieces ?? []).filter((p: any) => p.image_url).slice(0, 4).map((p: any) => p.image_url);
  const firstPiece = (b: any) => (b.pieces ?? []).find((p: any) => p.image_url) ?? (b.pieces ?? [])[0] ?? null;
  const boardHref = (b: any) => (b.slug ? `/outfit/${b.slug}` : '#');
  const pieceHref = (b: any) => {
    const p = firstPiece(b);
    return p?.slug ? `/outfit/product/${p.slug}` : boardHref(b);
  };

  const BRAND_IDS = ['amazon','asos','zara','hm','uniqlo','aritzia','nike','adidas','lululemon','shein','abercrombie','hollister','urbanoutfitters','ssense','nordstrom','oldnavy','levis','gap','facebook'];
  function storeLogo(store: string | null | undefined): string | null {
    if (!store) return null;
    const n = store.toLowerCase().replace(/[^a-z]/g, '');
    const id = BRAND_IDS.find(b => n.includes(b) || b.includes(n.slice(0, 5)));
    return id ? `/assets/logos/${id}.png` : null;
  }

  // Contextual social image: category image → first piece image of the first board → site default
  const firstPieceImg = data.boards.flatMap((b: any) => pieceImgs(b))[0] ?? null;
  const ogImage = $derived(data.image || firstPieceImg || `${$page.url.origin}/assets/man_on_chair.jpg`);
  const title   = displayCategory(data.category);
</script>

<svelte:head>
  <title>{title} - Aloura</title>
  <meta name="description" content="Browse {title} outfit boards on Aloura." />
  <link rel="canonical" href="{$page.url.origin}/discover/{encodeURIComponent(data.category)}" />

  <meta property="og:type"        content="website" />
  <meta property="og:site_name"   content="Aloura" />
  <meta property="og:title"       content="{title} - Aloura" />
  <meta property="og:description" content="Browse {title} outfit boards on Aloura." />
  <meta property="og:url"         content="{$page.url.origin}/discover/{encodeURIComponent(data.category)}" />
  <meta property="og:image"       content={ogImage} />

  <meta name="twitter:card"  content="summary_large_image" />
  <meta name="twitter:title" content="{title} - Aloura" />
  <meta name="twitter:image" content={ogImage} />
</svelte:head>

<div class="cat-page">
  <div class="cat-header">
    <a href="/" class="back-link"><i class="fas fa-arrow-left"></i> Discover</a>
    <div class="cat-title-wrap">
      {#if data.image}<img src={data.image} alt="" class="cat-img" />{/if}
      <h1 class="cat-title">{displayCategory(data.category)}</h1>
      <span class="cat-count">{data.boards.length} item{data.boards.length === 1 ? '' : 's'}</span>
    </div>
  </div>

  <div class="grid">
    {#each data.boards as board}
      {@const piece = firstPiece(board)}
      {@const logo = storeLogo(piece?.store)}
      <a class="board-card" href={pieceHref(board)}>
        <div class="collage collage--1">
          {#if piece?.image_url}
            <div class="collage__cell">
              <img src={piece.image_url} alt={piece.name ?? piece.title ?? ''} loading="lazy"
                onerror={(e) => { (e.target as HTMLImageElement).parentElement!.style.background = '#E8E0D8'; (e.target as HTMLImageElement).style.display = 'none'; }} />
            </div>
          {:else}
            <div class="collage__ph"><i class="fas fa-tshirt"></i></div>
          {/if}
        </div>
        <div class="board-card__info">
          <div class="board-card__occasion">{piece?.name ?? piece?.title ?? board.occasion ?? board.goal ?? board.title}</div>
          <div class="board-card__meta">
            <span class="store-meta">
              {#if logo}<img src={logo} alt={piece?.store ?? ''} class="store-logo-sm" />{/if}
              {piece?.store ?? ''}
            </span>
            {#if piece?.price}<span>${piece.price.toFixed(0)}</span>{/if}
          </div>
        </div>
      </a>
    {/each}
  </div>
</div>

<style>
  .cat-page { padding: calc(var(--nav-h) + var(--space-6)) var(--page-px) var(--space-16); max-width: var(--max-w); margin: 0 auto; }
  .cat-header { margin-bottom: var(--space-8); }
  .back-link { display: inline-flex; align-items: center; gap: 8px; font-size: var(--text-sm); color: var(--clr-taupe); text-decoration: none; transition: color 0.15s; }
  .back-link:hover { color: var(--clr-charcoal); }
  .cat-title-wrap { display: flex; align-items: center; gap: 12px; margin-top: var(--space-4); flex-wrap: wrap; }
  .cat-img { width: 44px; height: 44px; border-radius: 10px; object-fit: cover; box-shadow: var(--shadow-sm); }
  .cat-title { font-family: var(--font-display); font-size: var(--text-3xl); font-weight: 500; color: var(--clr-charcoal); }
  .cat-count { font-size: var(--text-sm); color: var(--clr-taupe); }

  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: var(--space-3); }
  .board-card { display: block; background: var(--clr-cream); border-radius: var(--radius-lg); overflow: hidden; box-shadow: var(--shadow-sm); text-decoration: none; color: inherit; transition: box-shadow var(--dur-base), transform var(--dur-base); }
  .board-card:hover { box-shadow: var(--shadow-lg); transform: translateY(-2px); }
  .collage { width: 100%; aspect-ratio: 1; display: grid; gap: 2px; background: var(--clr-light-taupe); }
  .collage--1 { grid-template-columns: 1fr; }
  .collage--2 { grid-template-columns: 1fr 1fr; }
  .collage--3 { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }
  .collage--3 .collage__cell:first-child { grid-row: span 2; }
  .collage--4 { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }
  .collage__cell { overflow: hidden; background: #e8e0d8; }
  .collage__cell img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .collage__ph { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; color: var(--clr-taupe); font-size: 28px; }
  .board-card__info { background: var(--clr-off-white); padding: var(--space-3); }
  .board-card__occasion { font-size: var(--text-xs); font-weight: 500; color: var(--clr-charcoal); margin-bottom: var(--space-1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .board-card__meta { display: flex; justify-content: space-between; align-items: center; font-size: var(--text-xs); color: var(--clr-taupe); }
  .store-meta { display: flex; align-items: center; gap: 4px; }
  .store-logo-sm { width: 14px; height: 14px; object-fit: contain; border-radius: 2px; flex-shrink: 0; }
</style>
