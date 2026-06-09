<script lang="ts">
  import '../app.css';
  import { createSupabaseBrowserClient } from '$lib/supabase';
  import { invalidate, goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import FeedbackForm from '$lib/FeedbackForm.svelte';

  let { children, data } = $props();
  const supabase = createSupabaseBrowserClient();

  onMount(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, _session) => {
      if (event === 'SIGNED_OUT') invalidate('supabase:auth');
    });
    return () => subscription.unsubscribe();
  });

  let scrolled = $state(false);

  onMount(() => {
    const onScroll = () => { scrolled = window.scrollY > 10; };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  });

  // The app feed (discover) now lives at the root "/". The marketing page
  // moved to "/about" and carries its own header + footer, so we hide the
  // global nav/footer there.
  const isAbout    = $derived($page.url.pathname === '/about');
  const isDiscover = $derived($page.url.pathname === '/');

  async function signOut() {
    await supabase.auth.signOut();
    goto('/');
  }
</script>

{#if !isAbout}
  <!-- NAV - always-visible icon links (no hamburger). On the root feed the
       search row carries its own header on desktop, so the bar is hidden there only. -->
  <nav class="nav" class:scrolled class:nav--discover={isDiscover}>
    <div class="nav__inner">
      <a href="/" class="nav__logo">Aloura<span>.</span></a>

      <div class="nav__links">
        <a href="/trending" class="nav__link" title="Trending">
          <i class="fas fa-fire"></i><span class="nav__txt">Trending</span>
        </a>
        {#if data.user}
          <a href="/" class="nav__link" title="Discover">
            <i class="fas fa-compass"></i><span class="nav__txt">Discover</span>
          </a>
          <a href="/account" class="nav__link" title="Account">
            <i class="fas fa-user"></i><span class="nav__txt">Account</span>
          </a>
          <button class="nav__link nav__link--danger" onclick={signOut} title="Sign out">
            <i class="fas fa-sign-out-alt"></i><span class="nav__txt">Sign out</span>
          </button>
        {:else}
          <a href="/" class="nav__link nav__link--cta" title="Get started">
            <i class="fas fa-arrow-right-to-bracket"></i><span class="nav__txt">Get started</span>
          </a>
        {/if}
      </div>
    </div>
  </nav>
{/if}

{@render children()}

{#if !isAbout}
  <footer class="app-footer">
    <div class="app-footer__inner">
      <span class="app-footer__logo">Aloura<span>.</span></span>
      <FeedbackForm accountId={data.user?.id ?? null} />
      <nav class="app-footer__links">
        <a href="/about">About</a>
        <a href="/terms">Terms &amp; Conditions</a>
        <a href="/privacy">Privacy Policy</a>
        <a href="/feedback">Feedback</a>
      </nav>
      <p class="app-footer__copy">&copy; {new Date().getFullYear()} Aloura</p>
    </div>
  </footer>
{/if}

<style>
  /* ── Nav ── */
  .nav {
    position: fixed; top: 0; left: 0; right: 0; z-index: 1000;
    height: var(--nav-h); display: flex; align-items: center;
    background: #fdfbf8;                 /* solid - no blur/filter dependency */
    border-bottom: 1px solid var(--clr-border);
    transition: box-shadow var(--dur-base);
  }
  .nav.scrolled { border-color: var(--clr-border); box-shadow: var(--shadow-sm); }
  .nav__inner {
    display: flex; align-items: center; justify-content: space-between;
    width: 100%; padding-inline: var(--page-px);
  }
  .nav__logo { font-family: var(--font-display); font-size: 22px; font-weight: 600; color: var(--clr-charcoal); letter-spacing: -0.5px; flex-shrink: 0; }
  .nav__logo span { color: var(--clr-terracotta); }

  /* Always-visible icon links - no hamburger, no drawer */
  .nav__links { display: flex; align-items: center; gap: 4px; }
  .nav__link {
    display: inline-flex; align-items: center; gap: 7px;
    padding: 8px 12px; border-radius: 999px;
    font-family: var(--font-body); font-size: var(--text-sm); font-weight: 500;
    color: var(--clr-charcoal); text-decoration: none;
    background: none; border: none; cursor: pointer;
    transition: background 0.15s, color 0.15s; white-space: nowrap;
  }
  .nav__link i { font-size: 15px; color: var(--clr-taupe); }
  .nav__link:hover { background: var(--clr-beige); }
  .nav__link:hover i { color: var(--clr-charcoal); }
  .nav__link--danger { color: #a33020; }
  .nav__link--danger i { color: #a33020; }
  .nav__link--cta { background: var(--clr-terracotta); color: #fff; }
  .nav__link--cta i { color: #fff; }
  .nav__link--cta:hover { background: #c4835a; }
  .nav__link--cta:hover i { color: #fff; }

  /* Mobile: tighten spacing and drop the text labels (icons only) so every
     link fits on one row next to the logo. */
  @media (max-width: 600px) {
    .nav__inner { padding-inline: 14px; }
    .nav__links { gap: 2px; }
    .nav__link { padding: 8px 9px; }
    .nav__txt { display: none; }
    .nav__link i { font-size: 17px; }
  }

  /* Discover has its own search-first header on desktop - hide the global bar there only */
  @media (min-width: 768px) {
    .nav--discover { display: none; }
  }

  /* ── App footer ── */
  .app-footer { background: var(--clr-charcoal); padding: var(--space-8) 0 var(--space-6); margin-top: var(--space-16); }
  .app-footer__inner { max-width: var(--max-w); margin: 0 auto; padding: 0 var(--page-px); }
  .app-footer__logo { font-family: var(--font-display); font-size: 20px; font-weight: 600; color: #fff; letter-spacing: -0.5px; display: block; margin-bottom: var(--space-6); }
  .app-footer__logo span { color: var(--clr-terracotta); }
  .app-footer__links { display: flex; flex-wrap: wrap; gap: 20px; margin-top: var(--space-6); }
  .app-footer__links a { font-size: 13px; color: rgba(253,251,248,0.6); text-decoration: none; transition: color 0.15s; }
  .app-footer__links a:hover { color: rgba(253,251,248,0.95); }
  .app-footer__copy { font-size: 11px; color: rgba(253,251,248,0.25); margin-top: var(--space-5); }
</style>
