<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import AuthModal from '$lib/AuthModal.svelte';
  import SearchBar from '$lib/SearchBar.svelte';

  let { data } = $props();

  // Absolute social-preview image, derived from the live origin
  const ogImage = $derived(`${$page.url.origin}/assets/man_on_chair.jpg`);

  // Hero search - takes the visitor to discover, which captures + auto-runs it
  let heroQuery = $state('');
  let heroMode  = $state<'outfit' | 'product'>('outfit');

  function heroSearch() {
    if (!heroQuery.trim()) return;
    const params = new URLSearchParams({ action: 'search', mode: heroMode, q: heroQuery.trim() });
    goto(`/discover?${params.toString()}`);
  }

  // Auth modal (handles sign in/up + onboarding)
  let authOpen = $state(false);
  let authMode = $state<'signup' | 'signin' | 'forgot'>('signup');
  function openModal(m: 'signup' | 'signin') { authMode = m; authOpen = true; }

  const pins = [
    { src: '/assets/man_on_chair.jpg',   label: 'Casual layers',       h: 380 },
    { src: '/assets/woman_standing.jpg', label: 'Everyday elegance',   h: 460 },
    { src: '/assets/trendy_glasses.jpg', label: 'Eyewear picks',       h: 340 },
  ];

  const brands = [
    { name: 'Amazon',          logo: '/assets/logos/amazon.png' },
    { name: 'ASOS',            logo: '/assets/logos/asos.png' },
    { name: 'Zara',            logo: '/assets/logos/zara.png' },
    { name: 'H&M',             logo: '/assets/logos/hm.png' },
    { name: 'Uniqlo',          logo: '/assets/logos/uniqlo.png' },
    { name: 'Aritzia',         logo: '/assets/logos/aritzia.png' },
    { name: 'Nike',            logo: '/assets/logos/nike.png' },
    { name: 'Adidas',          logo: '/assets/logos/adidas.png' },
    { name: 'Lululemon',       logo: '/assets/logos/lululemon.png' },
    { name: 'SHEIN',           logo: '/assets/logos/shein.png' },
    { name: 'Abercrombie',     logo: '/assets/logos/abercrombie.png' },
    { name: 'Hollister',       logo: '/assets/logos/hollister.png' },
    { name: 'Urban Outfitters',logo: '/assets/logos/urbanoutfitters.png' },
    { name: 'SSENSE',          logo: '/assets/logos/ssense.png' },
    { name: 'Nordstrom',       logo: '/assets/logos/nordstrom.png' },
    { name: 'Old Navy',        logo: '/assets/logos/oldnavy.png' },
    { name: "Levi's",          logo: '/assets/logos/levis.png' },
    { name: 'Gap',             logo: '/assets/logos/gap.png' },
    { name: 'Facebook Mkt',    logo: '/assets/logos/facebook.png' },
  ];
</script>

<svelte:head>
  <title>Aloura - Know What Works For You</title>
  <meta name="description" content="Personalized style intelligence - your best colors, outfit boards, and price comparisons built around how you actually look." />
  <link rel="canonical" href="{$page.url.origin}/" />
  <meta property="og:title"       content="Aloura - Know What Works For You" />
  <meta property="og:description" content="Search outfits, find the best prices, and get clothing picks matched to your style." />
  <meta property="og:image"       content={ogImage} />
  <meta property="og:image:width"  content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:type"        content="website" />
  <meta property="og:url"         content="{$page.url.origin}/" />
  <meta name="twitter:card"        content="summary_large_image" />
  <meta name="twitter:title"       content="Aloura - Know What Works For You" />
  <meta name="twitter:description" content="Search outfits, find the best prices, and get clothing picks matched to your style." />
  <meta name="twitter:image"       content={ogImage} />
</svelte:head>

<div class="page">

  <!-- ── HEADER ───────────────────────────────────────────── -->
  <header class="header">
    <span class="logo">Aloura<span>.</span></span>
    <div class="header__actions">
      <button class="link-btn" onclick={() => openModal('signin')}>Log in</button>
      <button class="pill-btn" onclick={() => openModal('signup')}>Sign up</button>
    </div>
  </header>

  <!-- ── HERO TEXT ─────────────────────────────────────────── -->
  <section class="hero">
    <h1 class="hero__title">Be more <em>you.</em></h1>
    <p class="hero__sub">Search outfits, find the best prices, and get clothing picks matched to your style.</p>
    <div class="hero__search">
      <SearchBar
        bind:value={heroQuery}
        bind:mode={heroMode}
        showImage={false}
        onsubmit={heroSearch}
      />
      <button class="hero__login" onclick={() => openModal('signin')}>
        Already have an account? <span>Log in</span>
      </button>
    </div>
  </section>

  <!-- ── BRAND MARQUEE ─────────────────────────────────────── -->
  <div class="marquee-wrap">
    <p class="marquee-label">Compare prices across 30+ stores & brands</p>
    <div class="marquee">
      <div class="marquee__track">
        {#each [...brands, ...brands] as brand}
          <div class="marquee__item">
            <img src={brand.logo} alt={brand.name} class="marquee__logo" />
            <span class="marquee__name">{brand.name}</span>
          </div>
        {/each}
      </div>
    </div>
  </div>

  <!-- ── PINTEREST GRID ────────────────────────────────────── -->
  <section class="pin-section">
    <div class="pin-grid">
      {#each pins as pin}
        <div class="pin" style="height:{pin.h}px">
          <img src={pin.src} alt={pin.label} loading="lazy" />
          <div class="pin__footer">
            <span class="pin__label">{pin.label}</span>
          </div>
        </div>
      {/each}
    </div>
  </section>

  <!-- ── FEATURES ──────────────────────────────────────────── -->
  <section class="features">
    <div class="features__inner">
      {#each [
        { icon: 'fas fa-palette',  title: 'Color analysis',    desc: 'Your exact palette - best colors, accents, and what to avoid.' },
        { icon: 'fas fa-tshirt',   title: 'Outfit boards',     desc: 'Swipeable outfit boards tailored to your goals and occasions.' },
        { icon: 'fas fa-tag',      title: 'Price comparison',  desc: 'Find the same pieces across stores and see where to get the best deal.' },
        { icon: 'fas fa-glasses',  title: 'Accessories',       desc: 'Metals, chains, and eyewear shapes matched to your face and undertone.' },
      ] as f}
        <div class="feature">
          <div class="feature__icon"><i class={f.icon}></i></div>
          <h3 class="feature__title">{f.title}</h3>
          <p class="feature__desc">{f.desc}</p>
        </div>
      {/each}
    </div>
  </section>

  <!-- ── FOOTER ────────────────────────────────────────────── -->
  <footer class="footer">
    <span class="logo" style="color:rgba(255,255,255,0.9)">Aloura<span style="color:var(--clr-terracotta)">.</span></span>
    <p class="footer__copy">&copy; {new Date().getFullYear()} Aloura. All rights reserved.</p>
  </footer>

</div>

<!-- ── AUTH MODAL (sign in/up + onboarding) ──────────────── -->
<AuthModal bind:open={authOpen} bind:mode={authMode} />

<style>
  /* ── PAGE ── */
  .page { background: #fff; min-height: 100vh; }

  /* ── HEADER ── */
  .header {
    position: fixed; top: 0; left: 0; right: 0; z-index: 200;
    height: 60px; display: flex; align-items: center; justify-content: space-between;
    padding: 0 24px; background: rgba(255,255,255,0.95); backdrop-filter: blur(12px);
    border-bottom: 1px solid #f0ece8;
  }
  .logo { font-family: var(--font-display); font-size: 22px; font-weight: 600; color: var(--clr-charcoal); letter-spacing: -0.5px; }
  .logo span { color: var(--clr-terracotta); }
  .header__actions { display: flex; align-items: center; gap: 8px; }

  .link-btn { background: none; border: none; cursor: pointer; font-family: var(--font-body); font-size: 14px; font-weight: 500; color: var(--clr-charcoal); padding: 8px 12px; border-radius: 8px; transition: background 0.15s; }
  .link-btn:hover { background: #f5f0eb; }
  .link-btn--sm { font-size: 13px; color: var(--clr-taupe); }
  .link-btn--sm:hover { color: var(--clr-charcoal); background: transparent; }

  .pill-btn { background: var(--clr-terracotta); color: #fff; border: none; cursor: pointer; font-family: var(--font-body); font-size: 14px; font-weight: 500; padding: 10px 22px; border-radius: 999px; transition: background 0.2s, transform 0.15s; }
  .pill-btn:hover { background: #c4835a; transform: translateY(-1px); }
  .pill-btn--lg { font-size: 15px; padding: 14px 32px; }

  /* ── HERO ── */
  .hero {
    padding: 120px 24px 56px; max-width: 600px; margin: 0 auto; text-align: center;
  }
  .hero__title {
    font-family: var(--font-display); font-size: clamp(44px, 9vw, 76px); font-weight: 600;
    line-height: 1.02; letter-spacing: -2.5px; color: var(--clr-charcoal); margin-bottom: 18px;
  }
  .hero__title em { font-style: italic; color: var(--clr-terracotta); font-weight: 600; }

  /* ── Brand marquee ── */
  .marquee-wrap { padding: 40px 0 32px; border-top: 1px solid #f0ece8; border-bottom: 1px solid #f0ece8; overflow: hidden; }
  .marquee-label { text-align: center; font-size: 11px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: #b8aca2; margin-bottom: 20px; }
  .marquee { overflow: hidden; }
  .marquee__track {
    display: flex; gap: 12px; width: max-content;
    animation: marquee 28s linear infinite;
  }
  .marquee__track:hover { animation-play-state: paused; }
  .marquee__item {
    display: flex; align-items: center; gap: 8px; flex-shrink: 0;
    background: #fff; border: 1px solid #f0ece8; border-radius: 999px;
    padding: 8px 18px 8px 10px;
  }
  .marquee__logo { width: 28px; height: 28px; object-fit: contain; border-radius: 50%; background: #faf7f2; padding: 3px; }
  .marquee__name { font-size: 13px; font-weight: 500; color: #6b5a50; white-space: nowrap; }

  @keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
  .hero__sub { font-size: 16px; font-weight: 300; line-height: 1.8; color: var(--clr-taupe); max-width: 480px; margin: 0 auto 36px; }
  .hero__actions { display: flex; flex-direction: column; align-items: center; gap: 12px; }
  .hero__search { max-width: 520px; margin: 0 auto; display: flex; flex-direction: column; align-items: center; gap: 14px; }
  .hero__search :global(.search-wrap) { width: 100%; }
  .hero__login { background: none; border: none; cursor: pointer; font-family: var(--font-body); font-size: 13px; color: var(--clr-taupe); }
  .hero__login span { color: var(--clr-brown); font-weight: 600; text-decoration: underline; text-underline-offset: 2px; }
  .hero__login:hover span { color: var(--clr-charcoal); }

  /* ── PINTEREST GRID ── */
  .pin-section { padding: 0 16px 48px; }
  .pin-grid {
    columns: 2; column-gap: 12px;
    max-width: 1200px; margin: 0 auto;
  }
  .pin {
    break-inside: avoid; margin-bottom: 12px; border-radius: 16px;
    overflow: hidden; position: relative; background: #f5efe8;
    cursor: pointer;
  }
  .pin img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 0.4s ease; }
  .pin:hover img { transform: scale(1.03); }
  .pin__footer {
    position: absolute; bottom: 0; left: 0; right: 0;
    padding: 28px 14px 12px;
    background: linear-gradient(transparent, rgba(30,20,10,0.45));
    opacity: 0; transition: opacity 0.25s;
  }
  .pin:hover .pin__footer { opacity: 1; }
  .pin__label { font-size: 13px; font-weight: 500; color: #fff; }

  /* ── FEATURES ── */
  .features { background: #faf7f2; padding: 72px 24px; }
  .features__inner { display: grid; gap: 32px; max-width: 1000px; margin: 0 auto; }
  .feature__icon {
    width: 44px; height: 44px; border-radius: 12px; background: #fff;
    border: 1px solid #ede5db; display: flex; align-items: center; justify-content: center;
    font-size: 18px; color: var(--clr-terracotta); margin-bottom: 14px;
  }
  .feature__title { font-family: var(--font-display); font-size: 18px; font-weight: 500; margin-bottom: 8px; color: var(--clr-charcoal); }
  .feature__desc { font-size: 14px; font-weight: 300; line-height: 1.75; color: var(--clr-taupe); }

  /* ── FOOTER ── */
  .footer { background: var(--clr-charcoal); padding: 40px 24px; display: flex; flex-direction: column; align-items: center; gap: 12px; }
  .footer__copy { font-size: 11px; color: rgba(255,255,255,0.3); }

  /* ── MODAL ── */
  .backdrop {
    position: fixed; inset: 0; z-index: 500;
    background: rgba(0,0,0,0.45); backdrop-filter: blur(6px);
    display: flex; align-items: center; justify-content: center;
    padding: 20px; animation: fadeIn 0.18s ease;
  }
  .modal {
    background: #fff; border-radius: 20px; padding: 36px 32px;
    width: 100%; max-width: 400px; position: relative;
    animation: slideUp 0.22s ease; box-shadow: 0 24px 80px rgba(0,0,0,0.18);
  }
  .modal__close {
    position: absolute; top: 14px; right: 14px; background: #f5f0eb;
    border: none; cursor: pointer; width: 32px; height: 32px; border-radius: 50%;
    color: var(--clr-taupe); font-size: 12px;
    display: flex; align-items: center; justify-content: center; transition: background 0.15s;
  }
  .modal__close:hover { background: #ede5db; }
  .modal__logo { font-family: var(--font-display); font-size: 20px; font-weight: 600; color: var(--clr-charcoal); margin-bottom: 16px; }
  .modal__logo span { color: var(--clr-terracotta); }
  .modal__title { font-family: var(--font-display); font-size: 26px; font-weight: 500; margin-bottom: 20px; color: var(--clr-charcoal); }
  .modal__error   { background: #fdf0ee; color: #a33020; border: 1px solid #f5c6c0; border-radius: 10px; padding: 10px 14px; font-size: 13px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
  .modal__success { background: #f0fdf4; color: #2a7a4b; border: 1px solid #bbf7d0; border-radius: 10px; padding: 10px 14px; font-size: 13px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
  .modal__forgot  { background: none; border: none; cursor: pointer; font-family: var(--font-body); font-size: 12px; color: var(--clr-taupe); text-align: right; padding: 0; margin-top: -4px; margin-bottom: 4px; align-self: flex-end; transition: color 0.15s; }
  .modal__forgot:hover { color: var(--clr-brown); }
  .modal__form { display: flex; flex-direction: column; gap: 10px; }
  .modal__input { width: 100%; font-family: var(--font-body); font-size: 14px; font-weight: 300; color: var(--clr-charcoal); background: #faf7f2; border: 1.5px solid #e8e0d8; border-radius: 10px; padding: 13px 16px; outline: none; transition: border-color 0.2s; }
  .modal__input:focus { border-color: var(--clr-brown); }
  .modal__pw { position: relative; }
  .modal__pw .modal__input { padding-right: 44px; }
  .modal__pw-eye { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: #c4b5a8; font-size: 13px; }
  .modal__submit { width: 100%; margin-top: 4px; background: var(--clr-charcoal); color: #fff; border: none; cursor: pointer; font-family: var(--font-body); font-size: 14px; font-weight: 500; padding: 14px; border-radius: 10px; transition: background 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px; }
  .modal__submit:hover:not(:disabled) { background: var(--clr-brown); }
  .modal__submit:disabled { opacity: 0.6; cursor: not-allowed; }
  .modal__spin { width: 18px; height: 18px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; animation: spin 0.8s linear infinite; }
  .modal__switch { text-align: center; font-size: 13px; color: var(--clr-taupe); margin-top: 14px; }
  .modal__switch button { background: none; border: none; cursor: pointer; font-size: 13px; font-weight: 500; color: var(--clr-brown); text-decoration: underline; text-underline-offset: 2px; }

  @keyframes slideUp { from { opacity: 0; transform: translateY(16px) scale(0.98); } to { opacity: 1; transform: none; } }

  @media (min-width: 640px)  {
    .pin-grid { columns: 3; }
    .hero__actions { flex-direction: row; justify-content: center; }
    .features__inner { grid-template-columns: repeat(2, 1fr); }
  }
  @media (min-width: 1024px) {
    .pin-grid { columns: 4; }
    .features__inner { grid-template-columns: repeat(4, 1fr); }
  }
</style>
