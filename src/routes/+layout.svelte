<script lang="ts">
  import '../app.css';
  import { createSupabaseBrowserClient } from '$lib/supabase';
  import { invalidate, goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import FeedbackForm from '$lib/FeedbackForm.svelte';
  import AccountMenu from '$lib/AccountMenu.svelte';

  let { children, data } = $props();
  const supabase = createSupabaseBrowserClient();

  onMount(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, _session) => {
      if (event === 'SIGNED_OUT') invalidate('supabase:auth');
    });
    return () => subscription.unsubscribe();
  });

  let scrolled    = $state(false);
  let drawerOpen  = $state(false);

  onMount(() => {
    const onScroll = () => { scrolled = window.scrollY > 10; };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  });

  // Close drawer on route change
  $effect(() => { $page.url.pathname; drawerOpen = false; });

  const isHome     = $derived($page.url.pathname === '/');
  const isDiscover = $derived($page.url.pathname === '/discover');

  async function signOut() {
    drawerOpen = false;
    await supabase.auth.signOut();
    goto('/');
  }
</script>

{#if !isHome}
  <!-- NAV (hidden on desktop for /discover - the search row carries the logo there) -->
  <nav class="nav" class:scrolled class:nav--discover={isDiscover}>
    <div class="nav__inner">
      <a href="/" class="nav__logo">Aloura<span>.</span></a>

      <!-- Desktop links -->
      <div class="nav__links">
        <a href="/trending" class="nav__link">Trending</a>
        {#if data.user}
          <a href="/discover" class="nav__link">Discover</a>
          <AccountMenu />
        {:else}
          <a href="/" class="btn btn--primary" style="padding:10px 20px">Get started</a>
        {/if}
      </div>

      <!-- Mobile hamburger -->
      <button
        class="hamburger"
        onclick={() => drawerOpen = !drawerOpen}
        aria-label="Menu"
        aria-expanded={drawerOpen}
      >
        <span class="hamburger__bar" class:open={drawerOpen}></span>
        <span class="hamburger__bar" class:open={drawerOpen}></span>
        <span class="hamburger__bar" class:open={drawerOpen}></span>
      </button>
    </div>
  </nav>

  <!-- MOBILE DRAWER -->
  {#if drawerOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="drawer-backdrop" onclick={() => drawerOpen = false}></div>
  {/if}

  <div class="drawer" class:drawer--open={drawerOpen}>
    <div class="drawer__header">
      <span class="drawer__logo">Aloura<span>.</span></span>
      <button class="drawer__close" onclick={() => drawerOpen = false} aria-label="Close menu">
        <i class="fas fa-times"></i>
      </button>
    </div>

    <nav class="drawer__nav">
      <a href="/trending" class="drawer__link">
        <i class="fas fa-fire"></i> Trending
      </a>
      {#if data.user}
        <a href="/discover" class="drawer__link">
          <i class="fas fa-compass"></i> Discover
        </a>
        <a href="/account" class="drawer__link">
          <i class="fas fa-user"></i> My account
        </a>
        <div class="drawer__divider"></div>
        <button class="drawer__link drawer__link--danger" onclick={signOut}>
          <i class="fas fa-sign-out-alt"></i> Sign out
        </button>
      {:else}
        <a href="/" class="drawer__link">
          <i class="fas fa-home"></i> Home
        </a>
        <div class="drawer__divider"></div>
        <a href="/" class="drawer__cta btn btn--primary btn--full">Get started</a>
      {/if}
    </nav>
  </div>
{/if}

{@render children()}

{#if !isHome}
  <footer class="app-footer">
    <div class="app-footer__inner">
      <span class="app-footer__logo">Aloura<span>.</span></span>
      <FeedbackForm accountId={data.user?.id ?? null} />
      <p class="app-footer__copy">&copy; {new Date().getFullYear()} Aloura</p>
    </div>
  </footer>
{/if}

<style>
  /* ── Nav ── */
  .nav {
    position: fixed; top: 0; left: 0; right: 0; z-index: 200;
    height: var(--nav-h); display: flex; align-items: center;
    background: rgba(253,251,248,0.92); -webkit-backdrop-filter: blur(20px); backdrop-filter: blur(20px);
    border-bottom: 1px solid transparent;
    transition: border-color var(--dur-base), box-shadow var(--dur-base);
  }
  .nav.scrolled { border-color: var(--clr-border); box-shadow: var(--shadow-sm); }
  .nav__inner {
    display: flex; align-items: center; justify-content: space-between;
    width: 100%; padding-inline: var(--page-px);
  }
  .nav__logo { font-family: var(--font-display); font-size: 24px; font-weight: 600; color: var(--clr-charcoal); letter-spacing: -0.5px; }
  .nav__logo span { color: var(--clr-terracotta); }
  .nav__links { display: none; align-items: center; gap: var(--space-8); }
  .nav__link { font-size: var(--text-sm); font-weight: 400; color: var(--clr-text-muted); transition: color var(--dur-fast); text-decoration: none; }
  .nav__link:hover { color: var(--clr-text-primary); }

  /* ── Hamburger ── */
  .hamburger {
    display: flex; flex-direction: column; justify-content: center; gap: 5px;
    width: 36px; height: 36px; background: none; border: none; cursor: pointer;
    padding: 4px; border-radius: var(--radius-md);
  }
  .hamburger__bar {
    display: block; height: 2px; background: var(--clr-charcoal);
    border-radius: 2px; transition: transform 0.25s ease, opacity 0.25s ease;
    transform-origin: center;
  }
  .hamburger__bar.open:nth-child(1) { transform: translateY(7px) rotate(45deg); }
  .hamburger__bar.open:nth-child(2) { opacity: 0; transform: scaleX(0); }
  .hamburger__bar.open:nth-child(3) { transform: translateY(-7px) rotate(-45deg); }

  /* ── Drawer backdrop ── */
  .drawer-backdrop {
    position: fixed; inset: 0; z-index: 299;
    background: rgba(0,0,0,0.35); -webkit-backdrop-filter: blur(2px); backdrop-filter: blur(2px);
    animation: fadeIn 0.2s ease;
  }

  /* ── Drawer ── */
  .drawer {
    position: fixed; top: 0; right: 0; bottom: 0; z-index: 300;
    width: min(280px, 85vw);
    background: var(--clr-off-white);
    box-shadow: -8px 0 40px rgba(0,0,0,0.12);
    transform: translateX(100%);
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    display: flex; flex-direction: column;
  }
  .drawer--open { transform: translateX(0); }

  .drawer__header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 20px var(--page-px);
    border-bottom: 1px solid var(--clr-border);
  }
  .drawer__logo { font-family: var(--font-display); font-size: 22px; font-weight: 600; color: var(--clr-charcoal); letter-spacing: -0.5px; }
  .drawer__logo span { color: var(--clr-terracotta); }
  .drawer__close {
    width: 32px; height: 32px; border-radius: 50%; background: var(--clr-beige);
    border: none; cursor: pointer; display: flex; align-items: center; justify-content: center;
    color: var(--clr-taupe); font-size: 14px; transition: background 0.15s;
  }
  .drawer__close:hover { background: var(--clr-light-taupe); }

  .drawer__nav { display: flex; flex-direction: column; padding: var(--space-5) var(--space-4); gap: 4px; flex: 1; }

  .drawer__link {
    display: flex; align-items: center; gap: var(--space-3);
    padding: 14px 16px; border-radius: var(--radius-lg);
    font-size: var(--text-base); font-weight: 400; color: var(--clr-charcoal);
    text-decoration: none; background: none; border: none; cursor: pointer;
    font-family: var(--font-body); width: 100%; text-align: left;
    transition: background 0.15s, color 0.15s;
  }
  .drawer__link i { width: 20px; text-align: center; color: var(--clr-taupe); font-size: 16px; }
  .drawer__link:hover { background: var(--clr-beige); }
  .drawer__link--danger { color: #a33020; }
  .drawer__link--danger i { color: #a33020; }
  .drawer__link--danger:hover { background: #fdf0ee; }

  .drawer__divider { height: 1px; background: var(--clr-border); margin: var(--space-3) 0; }
  .drawer__cta { margin-top: auto; }

  /* Desktop: hide hamburger, show links */
  @media (min-width: 768px) {
    .nav__links  { display: flex; }
    .hamburger   { display: none; }
    .drawer      { display: none; }
    .drawer-backdrop { display: none; }
    /* Discover gets a search-first header on desktop - drop the global bar */
    .nav--discover { display: none; }
  }

  /* ── App footer ── */
  .app-footer { background: var(--clr-charcoal); padding: var(--space-8) 0 var(--space-6); margin-top: var(--space-16); }
  .app-footer__inner { max-width: var(--max-w); margin: 0 auto; padding: 0 var(--page-px); }
  .app-footer__logo { font-family: var(--font-display); font-size: 20px; font-weight: 600; color: #fff; letter-spacing: -0.5px; display: block; margin-bottom: var(--space-6); }
  .app-footer__logo span { color: var(--clr-terracotta); }
  .app-footer__copy { font-size: 11px; color: rgba(253,251,248,0.25); margin-top: var(--space-6); }
</style>
