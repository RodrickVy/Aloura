<script lang="ts">
  import { createSupabaseBrowserClient } from '$lib/supabase';
  import { invalidateAll, goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import OnboardingSteps from '$lib/OnboardingSteps.svelte';

  let { data } = $props();
  const supabase = createSupabaseBrowserClient();

  const account = $derived(data.account);

  // ── Name (lives on accounts) ──
  let editName = $state(data.account?.name ?? '');

  // ── Profile fields (generic over every column) ──
  const SYSTEM_KEYS = new Set(['id', 'account_id', 'created_at', 'updated_at']);
  const editableKeys = $derived(
    data.profile ? Object.keys(data.profile).filter(k => !SYSTEM_KEYS.has(k)) : []
  );

  // Editable working copy of the profile row
  let form = $state<Record<string, any>>({});
  // Per-array-field "add new tag" input buffers
  let newTag = $state<Record<string, string>>({});

  $effect(() => {
    if (data.profile) {
      const next: Record<string, any> = {};
      for (const k of Object.keys(data.profile)) {
        if (!SYSTEM_KEYS.has(k)) next[k] = structuredClone(data.profile[k]);
      }
      form = next;
    }
  });

  const BUDGET_OPTIONS = [
    { value: 'budget-friendly',  label: 'Budget-friendly' },
    { value: 'balanced',         label: 'Balanced' },
    { value: 'premium-occasion', label: 'Premium on occasion' },
  ];

  const prettify = (k: string) =>
    k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  function fieldType(key: string, value: any): 'budget' | 'array' | 'boolean' | 'number' | 'text' {
    if (key === 'budget_preference') return 'budget';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number') return 'number';
    return 'text';
  }

  function addTag(key: string) {
    const v = (newTag[key] ?? '').trim();
    if (!v) return;
    form[key] = [...(form[key] ?? []), v];
    newTag[key] = '';
  }
  function removeTag(key: string, i: number) {
    form[key] = (form[key] ?? []).filter((_: any, idx: number) => idx !== i);
  }

  let saving = $state(false);
  let saved  = $state(false);
  let err    = $state('');

  async function save() {
    if (!account) return;
    saving = true; saved = false; err = '';
    try {
      if (editName !== (account.name ?? '')) {
        await supabase.from('accounts').update({ name: editName || null }).eq('id', account.id);
      }
      const payload: Record<string, any> = { account_id: account.id, updated_at: new Date().toISOString() };
      for (const k of editableKeys) payload[k] = form[k];
      const { error } = await supabase.from('profile').upsert(payload, { onConflict: 'account_id' });
      if (error) throw error;
      saved = true;
      await invalidateAll();
      setTimeout(() => saved = false, 2500);
    } catch {
      err = 'Could not save your changes. Please try again.';
    } finally {
      saving = false;
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    goto('/');
  }

  // ── Onboarding popup (when no profile yet) ──
  let showOnb = $state(false);
  onMount(() => { if (!data.profile) showOnb = true; });

  async function onboardingDone() {
    showOnb = false;
    await invalidateAll();   // profile now exists -> form renders
  }
</script>

<svelte:head>
  <title>My Account - Aloura</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="account-page">
  <div class="account">

    <!-- HEADER -->
    <div class="acc-header">
      <div class="acc-avatar">{((editName || data.authEmail || '?').trim()[0] || '?').toUpperCase()}</div>
      <div class="acc-id">
        <h1 class="acc-name">{editName || 'Your account'}</h1>
        <p class="acc-email">{data.authEmail}</p>
      </div>
      <button class="acc-signout" onclick={signOut}><i class="fas fa-sign-out-alt"></i> Sign out</button>
    </div>

    {#if !data.profile}
      <!-- NO PROFILE YET -->
      <div class="acc-empty">
        <i class="fas fa-wand-magic-sparkles"></i>
        <h2>Let's set up your style profile</h2>
        <p>Answer a few quick questions so we can tailor everything to you.</p>
        <button class="btn btn--primary" onclick={() => showOnb = true}>Start setup</button>
      </div>
    {:else}
      <!-- PROFILE EDITOR -->
      <form class="acc-card" onsubmit={(e) => { e.preventDefault(); save(); }}>
        <h2 class="acc-card__title">Profile details</h2>
        <p class="acc-card__sub">Update anything below - changes are saved to your profile.</p>

        <!-- Name (account) -->
        <div class="field">
          <label class="field__label" for="acc-name-input">Name</label>
          <input id="acc-name-input" class="field__input" type="text" bind:value={editName} placeholder="Your name" />
        </div>

        <!-- Email (read-only) -->
        <div class="field">
          <label class="field__label" for="acc-email-input">Email</label>
          <input id="acc-email-input" class="field__input field__input--readonly" type="email" value={data.authEmail} readonly />
          <span class="field__hint">Email is managed by your login and can't be changed here.</span>
        </div>

        <div class="acc-divider"></div>

        {#each editableKeys as key}
          {@const type = fieldType(key, form[key])}
          <div class="field">
            <label class="field__label">{prettify(key)}</label>

            {#if type === 'budget'}
              <select class="field__input" bind:value={form[key]}>
                <option value={null}>Not set</option>
                {#each BUDGET_OPTIONS as o}<option value={o.value}>{o.label}</option>{/each}
              </select>

            {:else if type === 'boolean'}
              <label class="toggle">
                <input type="checkbox" bind:checked={form[key]} />
                <span>{form[key] ? 'Yes' : 'No'}</span>
              </label>

            {:else if type === 'number'}
              <input class="field__input" type="number" bind:value={form[key]} />

            {:else if type === 'array'}
              <div class="tags">
                {#each (form[key] ?? []) as tag, i}
                  <span class="tag">
                    {#if typeof tag === 'string' && tag.startsWith('#')}
                      <span class="tag__swatch" style="background:{tag}"></span>
                    {/if}
                    {tag}
                    <button type="button" class="tag__x" onclick={() => removeTag(key, i)} aria-label="Remove">×</button>
                  </span>
                {/each}
              </div>
              <div class="tag-add">
                <input
                  class="field__input"
                  type="text"
                  placeholder="Add and press Enter"
                  bind:value={newTag[key]}
                  onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(key); } }}
                />
                <button type="button" class="tag-add__btn" onclick={() => addTag(key)}>Add</button>
              </div>

            {:else}
              <input class="field__input" type="text" bind:value={form[key]} placeholder="Not set" />
            {/if}
          </div>
        {/each}

        {#if err}<p class="acc-error"><i class="fas fa-exclamation-circle"></i> {err}</p>{/if}

        <div class="acc-actions">
          <button class="btn btn--primary" type="submit" disabled={saving}>
            {#if saving}Saving…{:else if saved}<i class="fas fa-check"></i> Saved{:else}Save changes{/if}
          </button>
          <button type="button" class="acc-redo" onclick={() => showOnb = true}>Redo guided setup</button>
        </div>
      </form>
    {/if}
  </div>
</div>

<!-- ONBOARDING POPUP -->
{#if showOnb && account}
  <div class="onb-overlay" role="presentation">
    <div class="onb-modal" role="dialog" aria-modal="true">
      <OnboardingSteps accountId={account.id} onDone={onboardingDone} />
    </div>
  </div>
{/if}

<style>
  .account-page { padding-top: calc(var(--nav-h) + var(--space-8)); padding-bottom: var(--space-20); }
  .account { max-width: 640px; margin: 0 auto; padding: 0 var(--page-px); }

  /* Header */
  .acc-header { display: flex; align-items: center; gap: var(--space-4); margin-bottom: var(--space-8); }
  .acc-avatar {
    width: 56px; height: 56px; border-radius: 50%; flex-shrink: 0;
    background: var(--clr-charcoal); color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-family: var(--font-display); font-size: 24px; font-weight: 600;
  }
  .acc-id { flex: 1; min-width: 0; }
  .acc-name { font-family: var(--font-display); font-size: 24px; font-weight: 500; color: var(--clr-charcoal); }
  .acc-email { font-size: 13px; color: var(--clr-taupe); }
  .acc-signout {
    display: inline-flex; align-items: center; gap: 7px; flex-shrink: 0;
    height: 38px; padding: 0 16px; border-radius: 999px;
    border: 1.5px solid var(--clr-border); background: #fff; cursor: pointer;
    font-family: var(--font-body); font-size: 13px; font-weight: 500; color: var(--clr-charcoal);
    transition: background 0.15s, border-color 0.15s;
  }
  .acc-signout:hover { background: #fdf0ee; border-color: #f0c7bf; color: #a33020; }

  /* Empty / no profile */
  .acc-empty {
    text-align: center; background: var(--clr-cream); border: 1px solid var(--clr-border);
    border-radius: 20px; padding: var(--space-12) var(--space-6);
    display: flex; flex-direction: column; align-items: center; gap: var(--space-3);
  }
  .acc-empty i { font-size: 30px; color: var(--clr-terracotta); margin-bottom: var(--space-2); }
  .acc-empty h2 { font-family: var(--font-display); font-size: 22px; font-weight: 500; color: var(--clr-charcoal); }
  .acc-empty p { font-size: 14px; color: var(--clr-taupe); margin-bottom: var(--space-4); max-width: 360px; }

  /* Card */
  .acc-card { background: var(--clr-cream); border: 1px solid var(--clr-border); border-radius: 20px; padding: var(--space-8) var(--space-6); }
  .acc-card__title { font-family: var(--font-display); font-size: 20px; font-weight: 500; color: var(--clr-charcoal); margin-bottom: 4px; }
  .acc-card__sub { font-size: 13px; color: var(--clr-taupe); margin-bottom: var(--space-6); }
  .acc-divider { height: 1px; background: var(--clr-border); margin: var(--space-5) 0; }

  /* Fields */
  .field { margin-bottom: var(--space-5); display: flex; flex-direction: column; }
  .field__label { font-size: 12px; font-weight: 600; color: var(--clr-charcoal); margin-bottom: 8px; }
  .field__input {
    height: 44px; padding: 0 14px; border: 1.5px solid var(--clr-border); border-radius: 12px;
    font-family: var(--font-body); font-size: 14px; color: var(--clr-charcoal);
    background: #fff; outline: none; transition: border-color 0.15s; width: 100%;
  }
  .field__input:focus { border-color: var(--clr-terracotta); }
  .field__input--readonly { background: var(--clr-beige); color: var(--clr-taupe); cursor: not-allowed; }
  .field__hint { font-size: 11px; color: var(--clr-taupe); margin-top: 6px; }
  select.field__input { appearance: none; cursor: pointer; }

  .toggle { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; color: var(--clr-charcoal); cursor: pointer; }
  .toggle input { width: 18px; height: 18px; accent-color: var(--clr-charcoal); }

  /* Tag editor (arrays) */
  .tags { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
  .tags:empty { display: none; }
  .tag {
    display: inline-flex; align-items: center; gap: 6px;
    background: #fff; border: 1.5px solid var(--clr-border); border-radius: 999px;
    padding: 5px 8px 5px 12px; font-size: 13px; color: var(--clr-charcoal);
  }
  .tag__swatch { width: 14px; height: 14px; border-radius: 50%; box-shadow: 0 0 0 1px var(--clr-border); }
  .tag__x { border: none; background: none; cursor: pointer; color: var(--clr-taupe); font-size: 16px; line-height: 1; padding: 0 2px; }
  .tag__x:hover { color: #a33020; }
  .tag-add { display: flex; gap: 8px; }
  .tag-add__btn {
    flex-shrink: 0; padding: 0 16px; border-radius: 12px; border: 1.5px solid var(--clr-border);
    background: #fff; cursor: pointer; font-family: var(--font-body); font-size: 13px; font-weight: 500;
    color: var(--clr-charcoal); transition: background 0.15s;
  }
  .tag-add__btn:hover { background: var(--clr-beige); }

  .acc-error { font-size: 13px; color: #a33020; margin: var(--space-3) 0; display: flex; align-items: center; gap: 6px; }
  .acc-actions { display: flex; align-items: center; gap: var(--space-4); margin-top: var(--space-6); }
  .acc-redo { background: none; border: none; cursor: pointer; font-family: var(--font-body); font-size: 13px; color: var(--clr-brown); text-decoration: underline; text-underline-offset: 2px; }
  .acc-redo:hover { color: var(--clr-charcoal); }

  /* Onboarding popup */
  .onb-overlay {
    position: fixed; inset: 0; z-index: 100000;
    background: rgba(40,33,28,0.5); -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center; padding: 20px;
    animation: onbFade 0.18s ease;
  }
  .onb-modal {
    width: 100%; max-width: 460px; background: var(--clr-off-white, #fdfbf8);
    border-radius: 20px; padding: 28px 26px; box-shadow: 0 24px 60px rgba(0,0,0,0.28);
    max-height: 90vh; overflow-y: auto; animation: onbUp 0.22s cubic-bezier(0.2,0.8,0.2,1);
  }
  @keyframes onbFade { from { opacity: 0; } to { opacity: 1; } }
  @keyframes onbUp { from { opacity: 0; transform: translateY(16px) scale(0.98); } to { opacity: 1; transform: none; } }
</style>
