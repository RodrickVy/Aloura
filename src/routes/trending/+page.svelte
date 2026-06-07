<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { createSupabaseBrowserClient } from '$lib/supabase';
  import { track } from '$lib/analytics';

  let { data } = $props();
  const supabase = createSupabaseBrowserClient();

  // Count a visit to the trending page.
  onMount(() => { track(supabase, null, 'trends'); });

  const ogImage = $derived(
    data.categories[0]?.items[0]?.images?.[0]
      || `${$page.url.origin}/assets/man_on_chair.jpg`
  );
</script>

<svelte:head>
  <title>Trending Outfits - Aloura</title>
  <meta name="description" content="See what's trending right now across streetwear, formal, casual, athleisure, old money and date night - shop the looks on Aloura." />
  <link rel="canonical" href="{$page.url.origin}/trending" />
  <meta property="og:type"        content="website" />
  <meta property="og:site_name"   content="Aloura" />
  <meta property="og:title"       content="Trending Outfits - Aloura" />
  <meta property="og:description" content="What's trending now across streetwear, formal, casual and more. Shop the looks." />
  <meta property="og:image"       content={ogImage} />
  <meta name="twitter:card"  content="summary_large_image" />
  <meta name="twitter:image" content={ogImage} />
</svelte:head>

<div class="trending-page">
  <header class="trending-hero">
    <p class="eyebrow">What's hot right now</p>
    <h1 class="trending-title">Trending <em>outfits.</em></h1>
    <p class="trending-sub">Looks pulled from across the web, distilled into shoppable outfits - refreshed regularly.</p>
  </header>

  {#if data.categories.length === 0}
    <div class="trending-empty">
      <i class="fas fa-fire"></i>
      <p>Fresh trends are on the way. Check back soon.</p>
    </div>
  {:else}
    {#each data.categories as cat}
      <section class="trend-section">
        <div class="trend-section__head">
          <h2 class="trend-section__title">{cat.label}</h2>
          <span class="trend-section__count">{cat.items.length} look{cat.items.length === 1 ? '' : 's'}</span>
        </div>

        <div class="trend-grid">
          {#each cat.items as t}
            {@const imgs = t.images}
            {@const count = imgs.length}
            <a class="trend-card" href={t.slug ? `/outfit/${t.slug}` : '#'} onclick={() => track(supabase, null, 'trends')}>
              <div class="collage" class:collage--1={count === 1} class:collage--2={count === 2} class:collage--3={count === 3} class:collage--4={count >= 4}>
                {#if count === 0}
                  <div class="collage__ph"><i class="fas fa-tshirt"></i></div>
                {:else}
                  {#each imgs.slice(0, 4) as src}
                    <div class="collage__cell"><img {src} alt={t.title ?? 'Trending outfit'} loading="lazy" /></div>
                  {/each}
                {/if}
              </div>
              <div class="trend-card__info">
                <div class="trend-card__title">{t.title ?? cat.label}</div>
                {#if t.description}<div class="trend-card__desc">{t.description}</div>{/if}
              </div>
            </a>
          {/each}
        </div>
      </section>
    {/each}
  {/if}
</div>

<style>
  .trending-page { padding: calc(var(--nav-h) + var(--space-8)) var(--page-px) var(--space-16); max-width: var(--max-w); margin: 0 auto; }

  .trending-hero { margin-bottom: var(--space-10); }
  .eyebrow { font-size: 11px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--clr-terracotta); margin-bottom: var(--space-2); }
  .trending-title { font-family: var(--font-display); font-size: clamp(28px, 5vw, 44px); font-weight: 500; color: var(--clr-charcoal); }
  .trending-title em { font-style: italic; color: var(--clr-terracotta); }
  .trending-sub { font-size: 15px; font-weight: 300; color: var(--clr-taupe); max-width: 540px; margin-top: var(--space-3); line-height: 1.6; }

  .trending-empty { text-align: center; padding: var(--space-20); color: var(--clr-taupe); display: flex; flex-direction: column; align-items: center; gap: var(--space-4); }
  .trending-empty i { font-size: 30px; color: var(--clr-terracotta); }

  .trend-section { margin-bottom: var(--space-12); }
  .trend-section__head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: var(--space-5); }
  .trend-section__title { font-family: var(--font-display); font-size: var(--text-xl); font-weight: 500; color: var(--clr-charcoal); }
  .trend-section__count { font-size: 12px; color: var(--clr-taupe); }

  .trend-grid {
    display: grid; gap: var(--space-5);
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  }

  .trend-card {
    display: block; background: var(--clr-cream); border-radius: var(--radius-lg);
    overflow: hidden; box-shadow: var(--shadow-sm); text-decoration: none; color: inherit;
    transition: box-shadow var(--dur-base), transform var(--dur-base);
  }
  .trend-card:hover { box-shadow: var(--shadow-lg); transform: translateY(-2px); }

  .collage { width: 100%; aspect-ratio: 1; display: grid; gap: 2px; background: var(--clr-light-taupe); }
  .collage__cell { overflow: hidden; }
  .collage__cell img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 0.4s ease; }
  .trend-card:hover .collage__cell img { transform: scale(1.04); }
  .collage__ph { display: flex; align-items: center; justify-content: center; color: var(--clr-taupe); font-size: 28px; }
  .collage--1 { grid-template-columns: 1fr; }
  .collage--2 { grid-template-columns: 1fr 1fr; }
  .collage--3 { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }
  .collage--3 .collage__cell:first-child { grid-row: span 2; }
  .collage--4 { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }

  .trend-card__info { padding: var(--space-4); }
  .trend-card__title { font-size: var(--text-sm); font-weight: 600; color: var(--clr-charcoal); margin-bottom: 4px; }
  .trend-card__desc { font-size: var(--text-xs); font-weight: 300; color: var(--clr-taupe); line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
</style>
