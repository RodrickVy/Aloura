<script lang="ts">
  import { page } from '$app/stores';
  let { data } = $props();

  const displayCategory = (c: string) =>
    c.split(' ').map(w => (w.toLowerCase() === 'fifa' ? 'FIFA' : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');

  const pieceImgs = (b: any) => (b.pieces ?? []).filter((p: any) => p.image_url).slice(0, 4).map((p: any) => p.image_url);
  const totalPrice = (b: any) => (b.pieces ?? []).reduce((s: number, p: any) => s + (p.price ?? 0), 0);
  const boardHref = (b: any) => (b.slug ? `/outfit/${b.slug}` : '#');

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
    <a href="/discover" class="back-link"><i class="fas fa-arrow-left"></i> Discover</a>
    <div class="cat-title-wrap">
      {#if data.image}<img src={data.image} alt="" class="cat-img" />{/if}
      <h1 class="cat-title">{displayCategory(data.category)}</h1>
      <span class="cat-count">{data.boards.length} board{data.boards.length === 1 ? '' : 's'}</span>
    </div>
  </div>

  <div class="grid">
    {#each data.boards as board}
      {@const imgs = pieceImgs(board)}
      {@const count = imgs.length}
      <a class="board-card" href={boardHref(board)}>
        <div class="collage" class:collage--1={count === 1} class:collage--2={count === 2} class:collage--3={count === 3} class:collage--4={count >= 4}>
          {#if count === 0}
            <div class="collage__ph"><i class="fas fa-tshirt"></i></div>
          {:else}
            {#each imgs as src}
              <div class="collage__cell">
                <img src={src ?? ''} alt="" loading="lazy" onerror={(e) => { (e.target as HTMLImageElement).parentElement!.style.background = '#E8E0D8'; (e.target as HTMLImageElement).style.display = 'none'; }} />
              </div>
            {/each}
          {/if}
        </div>
        <div class="board-card__info">
          <div class="board-card__occasion">{board.occasion ?? board.goal ?? board.title}</div>
          <div class="board-card__meta">
            <span>{totalPrice(board) > 0 ? '$' + totalPrice(board).toFixed(0) : ''}</span>
            <span>{(board.pieces ?? []).length} pieces</span>
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
  .board-card__meta { display: flex; justify-content: space-between; font-size: var(--text-xs); color: var(--clr-taupe); }
</style>
