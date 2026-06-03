<script lang="ts">
  import '../app.css';
  import { createSupabaseBrowserClient } from '$lib/supabase';
  import { invalidate, goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { page } from '$app/stores';

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

  const isHome = $derived($page.url.pathname === '/');

  async function signOut() {
    await supabase.auth.signOut();
    goto('/');
  }
</script>

<!-- Hide nav on landing — it has its own header -->
{#if !isHome}
  <nav class="nav" class:scrolled>
    <div class="nav__inner">
      <a href="/" class="nav__logo">Aloura<span>.</span></a>
      <div class="nav__links">
        {#if data.user}
          <a href="/editor"   class="nav__link">Editor</a>
          <a href="/report"   class="nav__link">Account</a>
          <button onclick={signOut} class="btn btn--ghost" style="padding:10px 20px">Sign out</button>
        {:else}
          <a href="/" class="btn btn--primary" style="padding:10px 20px">Get started</a>
        {/if}
      </div>
    </div>
  </nav>
{/if}

{@render children()}

<style>
  .nav {
    position: fixed; top: 0; left: 0; right: 0; z-index: 200;
    height: var(--nav-h); display: flex; align-items: center;
    background: rgba(253,251,248,0.92); backdrop-filter: blur(20px);
    border-bottom: 1px solid transparent;
    transition: border-color var(--dur-base), box-shadow var(--dur-base);
  }
  .nav.scrolled { border-color: var(--clr-border); box-shadow: var(--shadow-sm); }
  .nav__inner {
    display: flex; align-items: center; justify-content: space-between;
    width: 100%; max-width: var(--max-w); margin-inline: auto; padding-inline: var(--page-px);
  }
  .nav__logo { font-family: var(--font-display); font-size: 24px; font-weight: 600; color: var(--clr-charcoal); letter-spacing: -0.5px; }
  .nav__logo span { color: var(--clr-terracotta); }
  .nav__links { display: none; align-items: center; gap: var(--space-8); }
  .nav__link { font-size: var(--text-sm); font-weight: 400; color: var(--clr-text-muted); transition: color var(--dur-fast); }
  .nav__link:hover { color: var(--clr-text-primary); }
  @media (min-width: 768px) { .nav__links { display: flex; } }
</style>
