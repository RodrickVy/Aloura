<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { createSupabaseBrowserClient } from '$lib/supabase';
  import { track } from '$lib/analytics';

  let { data } = $props();
  const supabase = createSupabaseBrowserClient();

  let gender = $state<'mens' | 'womens'>('mens');

  // Categories that have at least one product for the selected gender.
  const visibleCategories = $derived(
    data.categories
      .map(c => ({ ...c, items: c.products.filter((p: any) => p.gender === gender) }))
      .filter(c => c.items.length > 0)
  );

  onMount(() => { track(supabase, null, 'trends'); });

  const ogImage = $derived(
    data.categories[0]?.products?.[0]?.image_url || `${$page.url.origin}/assets/man_on_chair.jpg`
  );
</script>

<svelte:head>
  <title>Trending Products - Aloura</title>
  <meta name="description" content="The individual products trending right now across streetwear, Nike Tech, grunge, old money and more - shop and compare on Aloura." />
  <link rel="canonical" href="{$page.url.origin}/trending" />
  <meta property="og:type"        content="website" />
  <meta property="og:site_name"   content="Aloura" />
  <meta property="og:title"       content="Trending Products - Aloura" />
  <meta property="og:description" content="The products trending right now - shop and compare." />
  <meta property="og:image"       content={ogImage} />
  <meta name="twitter:card"  content="summary_large_image" />
  <meta name="twitter:image" content={ogImage} />
</svelte:head>

<div class="trending-page">
  <header class="trending-hero">
    <p class="eyebrow">What's hot right now</p>
    <h1 class="trending-title">Trending <em>products.</em></h1>
    <p class="trending-sub">The individual pieces trending across styles right now - tap any to compare it across stores.</p>

    <div class="gender-toggle">
      <button class="gender-opt" class:active={gender === 'mens'} onclick={() => gender = 'mens'}>Men's</button>
      <button class="gender-opt" class:active={gender === 'womens'} onclick={() => gender = 'womens'}>Women's</button>
    </div>
  </header>

  {#if visibleCategories.length === 0}
    <div class="trending-empty">
      <i class="fas fa-fire"></i>
      <p>Fresh trends are on the way. Check back soon.</p>
    </div>
  {:else}
    {#each visibleCategories as cat}
      <section class="trend-section">
        <div class="trend-section__head">
          <h2 class="trend-section__title">{cat.label}</h2>
          <span class="trend-section__count">{cat.items.length} item{cat.items.length === 1 ? '' : 's'}</span>
        </div>

        <div class="prod-grid">
          {#each cat.items as p}
            <a class="prod-card" href={p.slug ? `/outfit/product/${p.slug}` : '#'} onclick={() => track(supabase, null, 'trends')}>
              <div class="prod-card__img-wrap">
                {#if p.image_url}
                  <img src={p.image_url} alt={p.name} loading="lazy" onerror={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                {:else}
                  <div class="prod-card__ph"><i class="fas fa-tshirt"></i></div>
                {/if}
              </div>
              <div class="prod-card__info">
                <div class="prod-card__store">{p.store}</div>
                <div class="prod-card__name">{p.name}</div>
                {#if p.price}<div class="prod-card__price">${Number(p.price).toFixed(2)}</div>{/if}
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
  .trending-hero { margin-bottom: var(--space-8); }
  .eyebrow { font-size: 11px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--clr-terracotta); margin-bottom: var(--space-2); }
  .trending-title { font-family: var(--font-display); font-size: clamp(28px, 5vw, 44px); font-weight: 500; color: var(--clr-charcoal); }
  .trending-title em { font-style: italic; color: var(--clr-terracotta); }
  .trending-sub { font-size: 15px; font-weight: 300; color: var(--clr-taupe); max-width: 540px; margin-top: var(--space-3); line-height: 1.6; }

  .gender-toggle { display: inline-flex; background: var(--clr-beige); border-radius: 999px; padding: 3px; margin-top: var(--space-5); }
  .gender-opt { border: none; background: none; cursor: pointer; font-family: var(--font-body); font-size: 14px; font-weight: 500; color: var(--clr-taupe); padding: 8px 22px; border-radius: 999px; transition: background 0.15s, color 0.15s; }
  .gender-opt.active { background: var(--clr-charcoal); color: #fff; }

  .trending-empty { text-align: center; padding: var(--space-20); color: var(--clr-taupe); display: flex; flex-direction: column; align-items: center; gap: var(--space-4); }
  .trending-empty i { font-size: 30px; color: var(--clr-terracotta); }

  .trend-section { margin-bottom: var(--space-12); }
  .trend-section__head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: var(--space-5); }
  .trend-section__title { font-family: var(--font-display); font-size: var(--text-xl); font-weight: 500; color: var(--clr-charcoal); }
  .trend-section__count { font-size: 12px; color: var(--clr-taupe); }

  .prod-grid { display: grid; gap: var(--space-4); grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); }
  .prod-card { display: block; background: var(--clr-cream); border: 1px solid var(--clr-border); border-radius: var(--radius-lg); overflow: hidden; text-decoration: none; color: inherit; transition: box-shadow var(--dur-base), transform var(--dur-base); }
  .prod-card:hover { box-shadow: var(--shadow-lg); transform: translateY(-2px); }
  .prod-card__img-wrap { aspect-ratio: 1; background: #e8e0d8; }
  .prod-card__img-wrap img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .prod-card__ph { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--clr-taupe); font-size: 26px; }
  .prod-card__info { padding: var(--space-3); }
  .prod-card__store { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--clr-taupe); margin-bottom: 2px; }
  .prod-card__name { font-size: var(--text-xs); font-weight: 500; color: var(--clr-charcoal); line-height: 1.4; margin-bottom: 4px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .prod-card__price { font-size: var(--text-sm); font-weight: 600; color: var(--clr-brown); }
</style>
