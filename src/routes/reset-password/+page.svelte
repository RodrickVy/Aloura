<script lang="ts">
  import { createSupabaseBrowserClient } from '$lib/supabase';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  const supabase = createSupabaseBrowserClient();

  let pageState = $state<'loading' | 'form' | 'success' | 'invalid'>('loading');
  let password = $state('');
  let confirm  = $state('');
  let showPw   = $state(false);
  let error    = $state('');
  let loading  = $state(false);

  onMount(async () => {
    // Supabase puts the recovery token in the URL hash - the browser client
    // exchanges it automatically. We just need to confirm a session exists
    // and that it's a recovery session.
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      pageState = 'form';
    } else {
      // Try to pick up the token from the hash fragment
      const { data, error: e } = await supabase.auth.exchangeCodeForSession(
        window.location.href
      ).catch(() => ({ data: null, error: new Error('no code') }));

      if (data?.session) {
        pageState = 'form';
      } else {
        pageState = 'invalid';
      }
    }
  });

  async function submit() {
    error = '';
    if (password.length < 8)     { error = 'Password must be at least 8 characters.'; return; }
    if (password !== confirm)     { error = 'Passwords do not match.'; return; }

    loading = true;
    try {
      const { error: e } = await supabase.auth.updateUser({ password });
      if (e) throw e;
      pageState = 'success';
      setTimeout(() => goto('/'), 2500);
    } catch (e: any) {
      error = e.message ?? 'Something went wrong. Please try again.';
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Reset Password - Aloura</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="reset-page">
  <a href="/" class="reset-logo">Aloura<span>.</span></a>

  <div class="reset-card">
    {#if pageState === 'loading'}
      <div class="reset-center">
        <div class="spinner"></div>
        <p class="reset-sub">Verifying your link…</p>
      </div>

    {:else if pageState === 'invalid'}
      <div class="reset-center">
        <div class="reset-icon reset-icon--warn"><i class="fas fa-exclamation-triangle"></i></div>
        <h1 class="reset-title">Link expired</h1>
        <p class="reset-sub">This reset link has expired or already been used.</p>
        <a href="/" class="btn btn--primary" style="margin-top:24px">Back to Aloura</a>
      </div>

    {:else if pageState === 'success'}
      <div class="reset-center">
        <div class="reset-icon reset-icon--ok"><i class="fas fa-check"></i></div>
        <h1 class="reset-title">Password updated</h1>
        <p class="reset-sub">You're all set. Taking you to your account…</p>
      </div>

    {:else}
      <!-- FORM -->
      <h1 class="reset-title">Set a new password</h1>
      <p class="reset-sub" style="margin-bottom:28px">Choose something secure - at least 8 characters.</p>

      {#if error}
        <div class="reset-error"><i class="fas fa-exclamation-circle"></i> {error}</div>
      {/if}

      <form onsubmit={(e) => { e.preventDefault(); submit(); }} class="reset-form">
        <div class="field">
          <label class="field__label" for="pw">New password</label>
          <div class="field__wrap">
            <input
              id="pw"
              class="field__input"
              type={showPw ? 'text' : 'password'}
              placeholder="At least 8 characters"
              bind:value={password}
              autocomplete="new-password"
            />
            <button type="button" class="field__eye" onclick={() => showPw = !showPw} tabindex="-1">
              <i class={showPw ? 'fas fa-eye-slash' : 'fas fa-eye'}></i>
            </button>
          </div>
        </div>

        <div class="field">
          <label class="field__label" for="confirm">Confirm password</label>
          <input
            id="confirm"
            class="field__input"
            type={showPw ? 'text' : 'password'}
            placeholder="Same password again"
            bind:value={confirm}
            autocomplete="new-password"
          />
        </div>

        <!-- Password match indicator -->
        {#if confirm.length > 0}
          <p class="match-hint" class:match-ok={password === confirm} class:match-no={password !== confirm}>
            {#if password === confirm}
              <i class="fas fa-check-circle"></i> Passwords match
            {:else}
              <i class="fas fa-times-circle"></i> Passwords don't match
            {/if}
          </p>
        {/if}

        <button class="btn btn--primary btn--full" type="submit" disabled={loading} style="margin-top:8px">
          {#if loading}
            <span class="btn-spin"></span>
          {:else}
            Update password
          {/if}
        </button>
      </form>
    {/if}
  </div>
</div>

<style>
  .reset-page {
    min-height: 100vh; display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    background: #faf7f2; padding: 24px;
  }
  .reset-logo {
    font-family: var(--font-display); font-size: 22px; font-weight: 600;
    color: var(--clr-charcoal); letter-spacing: -0.5px;
    text-decoration: none; margin-bottom: 32px;
  }
  .reset-logo span { color: var(--clr-terracotta); }

  .reset-card {
    background: #fff; border-radius: 20px; padding: 40px 36px;
    width: 100%; max-width: 420px; box-shadow: 0 8px 40px rgba(0,0,0,0.1);
  }

  .reset-center { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 12px; }

  .reset-icon {
    width: 56px; height: 56px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center; font-size: 22px;
  }
  .reset-icon--ok   { background: #f0fdf4; color: #2a7a4b; }
  .reset-icon--warn { background: #fdf0ee; color: #a33020; }

  .reset-title { font-family: var(--font-display); font-size: 26px; font-weight: 500; color: var(--clr-charcoal); margin-bottom: 4px; }
  .reset-sub   { font-size: 14px; font-weight: 300; color: var(--clr-taupe); line-height: 1.6; }

  .reset-error {
    background: #fdf0ee; color: #a33020; border: 1px solid #f5c6c0;
    border-radius: 10px; padding: 10px 14px; font-size: 13px; margin-bottom: 16px;
    display: flex; align-items: center; gap: 8px;
  }

  .reset-form { display: flex; flex-direction: column; gap: 16px; }

  .field { display: flex; flex-direction: column; gap: 6px; }
  .field__label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--clr-taupe); }
  .field__wrap { position: relative; }
  .field__input {
    width: 100%; font-family: var(--font-body); font-size: 14px; font-weight: 300;
    color: var(--clr-charcoal); background: #faf7f2; border: 1.5px solid #e8e0d8;
    border-radius: 10px; padding: 13px 16px; outline: none; transition: border-color 0.2s;
  }
  .field__input:focus { border-color: var(--clr-brown); }
  .field__wrap .field__input { padding-right: 44px; }
  .field__eye { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: #c4b5a8; font-size: 13px; }

  .match-hint { font-size: 12px; display: flex; align-items: center; gap: 6px; margin-top: -6px; }
  .match-ok { color: #2a7a4b; }
  .match-no { color: #a33020; }

  .btn-spin { width: 18px; height: 18px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; animation: spin 0.8s linear infinite; }
  button:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
