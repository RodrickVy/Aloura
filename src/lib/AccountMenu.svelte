<script lang="ts">
  import { createSupabaseBrowserClient } from '$lib/supabase';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  const supabase = createSupabaseBrowserClient();

  let open      = $state(false);
  let loggedIn  = $state(false);
  let email     = $state('');
  let name      = $state('');
  let ready     = $state(false);

  const initial = $derived(((name || email || '?').trim()[0] || '?').toUpperCase());

  onMount(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        loggedIn = true;
        email = data.user.email ?? '';
        name  = (data.user.user_metadata?.full_name as string) ?? '';
      }
      ready = true;
    })();

    const onDocClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement)?.closest?.('.acct')) open = false;
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  });

  async function signOut() {
    open = false;
    await supabase.auth.signOut();
    goto('/');
  }
</script>

{#if ready}
  {#if loggedIn}
    <div class="acct">
      <button class="acct__btn" onclick={() => open = !open} aria-haspopup="menu" aria-expanded={open}>
        <span class="acct__avatar">{initial}</span>
        <i class="fas fa-chevron-{open ? 'up' : 'down'} acct__caret"></i>
      </button>

      {#if open}
        <div class="acct__menu" role="menu">
          <div class="acct__head">
            {#if name}<div class="acct__name">{name}</div>{/if}
            <div class="acct__email">{email}</div>
          </div>
          <a href="/" class="acct__item" role="menuitem"><i class="fas fa-compass"></i> Discover</a>
          <a href="/account" class="acct__item" role="menuitem"><i class="fas fa-user"></i> My account</a>
          <div class="acct__divider"></div>
          <button class="acct__item acct__item--danger" role="menuitem" onclick={signOut}>
            <i class="fas fa-sign-out-alt"></i> Sign out
          </button>
        </div>
      {/if}
    </div>
  {:else}
    <a href="/" class="acct__signin">Get started</a>
  {/if}
{/if}

<style>
  .acct { position: relative; flex-shrink: 0; }
  .acct__btn {
    display: inline-flex; align-items: center; gap: 7px;
    height: 38px; padding: 0 8px 0 6px; border-radius: 999px;
    background: #fff; border: 1.5px solid var(--clr-border); cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
  }
  .acct__btn:hover { border-color: var(--clr-light-taupe); background: var(--clr-beige); }
  .acct__avatar {
    width: 28px; height: 28px; border-radius: 50%;
    background: var(--clr-charcoal); color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-family: var(--font-body); font-size: 13px; font-weight: 600;
  }
  .acct__caret { font-size: 10px; color: var(--clr-taupe); }

  .acct__menu {
    position: absolute; top: calc(100% + 8px); right: 0; z-index: 400;
    width: 220px; background: var(--clr-off-white, #fdfbf8);
    border: 1px solid var(--clr-border); border-radius: 14px;
    box-shadow: 0 16px 40px rgba(0,0,0,0.16); padding: 8px;
    animation: acctIn 0.16s ease;
  }
  .acct__head { padding: 8px 10px 10px; border-bottom: 1px solid var(--clr-border); margin-bottom: 6px; }
  .acct__name { font-size: 13px; font-weight: 600; color: var(--clr-charcoal); }
  .acct__email { font-size: 12px; color: var(--clr-taupe); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .acct__item {
    display: flex; align-items: center; gap: 10px; width: 100%;
    padding: 10px 10px; border-radius: 9px; border: none; background: none;
    font-family: var(--font-body); font-size: 13px; font-weight: 500;
    color: var(--clr-charcoal); cursor: pointer; text-decoration: none;
    text-align: left; transition: background 0.13s;
  }
  .acct__item i { width: 16px; text-align: center; color: var(--clr-taupe); font-size: 14px; }
  .acct__item:hover { background: var(--clr-beige); }
  .acct__item--danger { color: #a33020; }
  .acct__item--danger i { color: #a33020; }
  .acct__item--danger:hover { background: #fdf0ee; }
  .acct__divider { height: 1px; background: var(--clr-border); margin: 6px 0; }

  .acct__signin {
    display: inline-flex; align-items: center; height: 38px; padding: 0 18px;
    border-radius: 999px; background: var(--clr-charcoal); color: #fff;
    font-family: var(--font-body); font-size: 13px; font-weight: 500; text-decoration: none;
  }
  .acct__signin:hover { background: var(--clr-brown); }

  @keyframes acctIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
</style>
