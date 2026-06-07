<script lang="ts">
  import { createSupabaseBrowserClient } from '$lib/supabase';
  import { goto } from '$app/navigation';
  import { track } from '$lib/analytics';
  import OnboardingSteps from '$lib/OnboardingSteps.svelte';

  interface Props {
    open?:    boolean;
    mode?:    'signup' | 'signin' | 'forgot';
    /** Optional message shown above the form, e.g. "Sign up to compare prices." */
    prompt?:  string;
    /** Where to return after auth. Onboarded users go straight here (hard nav so
     *  the destination re-runs fresh); new users go to onboarding and are returned
     *  here once their report is ready. */
    returnTo?: string;
  }

  let {
    open     = $bindable(false),
    mode     = $bindable<'signup' | 'signin' | 'forgot'>('signup'),
    prompt   = '',
    returnTo = '',
  }: Props = $props();

  const supabase = createSupabaseBrowserClient();

  let name     = $state('');
  let email    = $state('');
  let password = $state('');
  let showPw   = $state(false);
  let error    = $state('');
  let success  = $state('');
  let loading  = $state(false);

  // 'auth' = sign in/up/forgot · 'onboarding' = preference steps
  let view        = $state<'auth' | 'onboarding'>('auth');
  let onbAccountId = $state<string>('');

  function switchMode(m: 'signup' | 'signin' | 'forgot') { mode = m; error = ''; success = ''; }
  function close() { if (!loading) open = false; }
  function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && view === 'auth') close(); }

  function finishRedirect() {
    if (returnTo) { window.location.href = returnTo; return; }
    goto('/discover');
  }

  // Make sure the account has a (possibly empty) style_report so generation works.
  async function ensureStyleReport(accountId: string) {
    const { data: rep } = await supabase
      .from('style_reports').select('id').eq('account_id', accountId).limit(1).maybeSingle();
    if (!rep) {
      await supabase.from('style_reports').insert({
        account_id: accountId,
        goal_1: 'Be more confident',
        goal_2: 'Look more attractive',
        goal_3: 'Be more consistent in style',
      });
    }
  }

  // After auth: ensure account, then run onboarding if not done, else redirect.
  async function proceed(userId: string, name = '', email = '') {
    let { data: account } = await supabase.from('accounts').select('id, onboarded').eq('auth_id', userId).maybeSingle();
    if (!account) {
      const { data: created } = await supabase.from('accounts')
        .insert({ auth_id: userId, name: name || null, email: email.toLowerCase() })
        .select('id, onboarded').single();
      account = created;
      track(supabase, account?.id, 'sign_ups');
    }
    if (!account) { finishRedirect(); return; }

    await ensureStyleReport(account.id);

    if (account.onboarded) { finishRedirect(); return; }

    // Not onboarded - run the preference steps in this same popup
    onbAccountId = account.id;
    view = 'onboarding';
  }

  async function sendReset() {
    error = ''; success = '';
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { error = 'Enter a valid email.'; return; }
    loading = true;
    try {
      const { error: e } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (e) throw e;
      success = 'Check your inbox - we sent a reset link.';
    } catch {
      error = 'Could not send reset email. Please try again.';
    } finally {
      loading = false;
    }
  }

  async function submit() {
    error = '';
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { error = 'Enter a valid email.'; return; }
    if (password.length < 8) { error = 'Password must be at least 8 characters.'; return; }
    if (mode === 'signup' && name.trim().length < 2) { error = 'Enter your name.'; return; }
    loading = true;
    try {
      if (mode === 'signup') {
        const { data: authData, error: e } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(), password,
          options: { data: { full_name: name.trim() } },
        });
        if (e) throw e;
        if (authData.user) await proceed(authData.user.id, name.trim(), email.trim());
      } else {
        const { data: authData, error: e } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
        if (e) throw e;
        if (authData.user) await proceed(authData.user.id, '', email.trim());
      }
    } catch (e: any) {
      const msg = (e.message ?? '').toLowerCase();
      if (msg.includes('invalid') || msg.includes('credentials')) error = 'Incorrect email or password.';
      else if (msg.includes('already registered')) error = 'Account exists. Try signing in.';
      else if (msg.includes('email not confirmed')) error = 'Check your email to confirm your account.';
      else error = 'Something went wrong. Please try again.';
    } finally {
      loading = false;
    }
  }
</script>

<svelte:window onkeydown={onKey} />

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="backdrop" onclick={(e) => { if (e.target === e.currentTarget && view === 'auth') close(); }}>
    <div class="modal" class:modal--wide={view === 'onboarding'}>

    {#if view === 'onboarding'}
      <OnboardingSteps accountId={onbAccountId} onDone={finishRedirect} />
    {:else}
      <button class="modal__close" onclick={close} aria-label="Close"><i class="fas fa-times"></i></button>

      <div class="modal__logo">Aloura<span>.</span></div>

      {#if prompt}
        <p class="modal__prompt">{prompt}</p>
      {/if}

      <h2 class="modal__title">
        {#if mode === 'signup'}Create your profile
        {:else if mode === 'signin'}Welcome back
        {:else}Reset your password{/if}
      </h2>

      {#if error}<div class="modal__error"><i class="fas fa-exclamation-circle"></i> {error}</div>{/if}
      {#if success}<div class="modal__success"><i class="fas fa-check-circle"></i> {success}</div>{/if}

      {#if mode === 'forgot'}
        {#if !success}
          <form onsubmit={(e) => { e.preventDefault(); sendReset(); }} class="modal__form">
            <input class="modal__input" type="email" placeholder="Your email address" bind:value={email} autocomplete="email" />
            <button class="modal__submit" type="submit" disabled={loading}>
              {#if loading}<span class="modal__spin"></span>{:else}Send reset link{/if}
            </button>
          </form>
        {/if}
        <p class="modal__switch">
          <button onclick={() => switchMode('signin')}><i class="fas fa-arrow-left" style="font-size:10px"></i> Back to sign in</button>
        </p>
      {:else}
        <form onsubmit={(e) => { e.preventDefault(); submit(); }} class="modal__form">
          {#if mode === 'signup'}
            <input class="modal__input" type="text" placeholder="Your name" bind:value={name} autocomplete="name" />
          {/if}
          <input class="modal__input" type="email" placeholder="Email" bind:value={email} autocomplete="email" />
          <div class="modal__pw">
            <input class="modal__input" type={showPw ? 'text' : 'password'} placeholder="Password (8+ characters)" bind:value={password} autocomplete={mode === 'signup' ? 'new-password' : 'current-password'} />
            <button type="button" class="modal__pw-eye" onclick={() => showPw = !showPw} tabindex="-1">
              <i class={showPw ? 'fas fa-eye-slash' : 'fas fa-eye'}></i>
            </button>
          </div>
          {#if mode === 'signin'}
            <button type="button" class="modal__forgot" onclick={() => switchMode('forgot')}>Forgot password?</button>
          {/if}
          <button class="modal__submit" type="submit" disabled={loading}>
            {#if loading}<span class="modal__spin"></span>{:else}{mode === 'signup' ? 'Create account' : 'Sign in'}{/if}
          </button>
        </form>
        <p class="modal__switch">
          {mode === 'signup' ? 'Already have an account?' : "Don't have an account?"}
          <button onclick={() => switchMode(mode === 'signup' ? 'signin' : 'signup')}>
            {mode === 'signup' ? 'Sign in' : 'Sign up free'}
          </button>
        </p>
      {/if}
    {/if}
    </div>
  </div>
{/if}

<style>
  .backdrop { position: fixed; inset: 0; z-index: 500; background: rgba(0,0,0,0.45); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); display: flex; align-items: center; justify-content: center; padding: 20px; animation: fadeIn 0.18s ease; }
  .modal { background: #fff; border-radius: 20px; padding: 36px 32px; width: 100%; max-width: 400px; position: relative; animation: slideUp 0.22s ease; box-shadow: 0 24px 80px rgba(0,0,0,0.18); max-height: 92vh; overflow-y: auto; }
  .modal--wide { max-width: 460px; }
  .modal__close { position: absolute; top: 14px; right: 14px; background: #f5f0eb; border: none; cursor: pointer; width: 32px; height: 32px; border-radius: 50%; color: var(--clr-taupe); font-size: 12px; display: flex; align-items: center; justify-content: center; transition: background 0.15s; }
  .modal__close:hover { background: #ede5db; }
  .modal__logo { font-family: var(--font-display); font-size: 20px; font-weight: 600; color: var(--clr-charcoal); margin-bottom: 16px; }
  .modal__logo span { color: var(--clr-terracotta); }
  .modal__prompt { font-size: 13px; color: var(--clr-terracotta); font-weight: 500; margin-bottom: 8px; }
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
</style>
