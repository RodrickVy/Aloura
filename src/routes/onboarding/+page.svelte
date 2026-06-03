<script lang="ts">
  import { createSupabaseBrowserClient } from '$lib/supabase';
  import { goto } from '$app/navigation';

  let { data } = $props();
  const supabase = createSupabaseBrowserClient();

  const GOALS = [
    { id: 'find_outfits_photos',    icon: 'fas fa-camera',        label: 'Find outfits from photos I see online' },
    { id: 'lowest_price',           icon: 'fas fa-tag',           label: 'Get the lowest price on clothing and find affordable prices for expensive looks' },
    { id: 'compare_prices',         icon: 'fas fa-balance-scale', label: 'Compare prices across different stores' },
    { id: 'discover_outfits',       icon: 'fas fa-tshirt',        label: 'Discover outfits that match my style' },
    { id: 'colors_that_suit',       icon: 'fas fa-palette',       label: 'Know what colors actually suit me' },
    { id: 'accessories_eyewear',    icon: 'fas fa-glasses',       label: 'Get advice on accessories and eyewear' },
  ];

  let step           = $state(1);
  let accountId      = $state<string | null>(data.accountId);
  let selectedGoals  = $state<string[]>([]);
  let uploadedImages = $state<{ file: File; preview: string }[]>([]);
  let submitting     = $state(false);
  let error          = $state('');

  // Goals are required — no skip
  function toggleGoal(id: string) {
    selectedGoals = selectedGoals.includes(id)
      ? selectedGoals.filter(g => g !== id)
      : [...selectedGoals, id];
  }

  // Photos are optional
  let skippedPhotos = $state(false);

  async function handleFileSelect(e: Event) {
    const files = Array.from((e.target as HTMLInputElement).files ?? []);
    error = '';
    for (const file of files) {
      if (uploadedImages.length >= 3) break;
      if (file.size > 10 * 1024 * 1024) { error = 'Each photo must be under 10 MB.'; continue; }
      uploadedImages = [...uploadedImages, { file, preview: URL.createObjectURL(file) }];
    }
  }

  function removeImage(idx: number) {
    uploadedImages = uploadedImages.filter((_, i) => i !== idx);
  }

  async function submit() {
    if (!accountId) return;
    error = ''; submitting = true;

    try {
      // 1. Save the user's onboarding answers to their account as a goals array
      const goalLabels = selectedGoals.map(id => GOALS.find(g => g.id === id)?.label ?? id);
      await supabase.from('accounts').update({ goals: goalLabels }).eq('id', accountId);

      // 2. Upload photos (optional — user may have skipped)
      const imageIds: string[] = [];
      for (const img of uploadedImages) {
        const path = `${accountId}/profile/${Date.now()}_${img.file.name}`;
        const { error: upErr } = await supabase.storage.from('profile_images').upload(path, img.file, { upsert: true });
        if (upErr) throw upErr;
        const { data: { publicUrl } } = supabase.storage.from('profile_images').getPublicUrl(path);
        const { data: imgRow, error: imgErr } = await supabase.from('profile_images').insert({ account_id: accountId, storage_path: path, image_url: publicUrl }).select('id').single();
        if (imgErr) throw imgErr;
        imageIds.push(imgRow.id);
      }

      // 3. Create full skeleton style_report with all defaults
      const { data: report, error: rErr } = await supabase.from('style_reports').insert({
        account_id:           accountId,
        profile_image_1_id:   imageIds[0] ?? null,
        profile_image_2_id:   imageIds[1] ?? null,
        profile_image_3_id:   imageIds[2] ?? null,
        goal_1: 'Be more confident',
        goal_2: 'Look more attractive',
        goal_3: 'Be more consistent in style',
        // AI fields — null until filled by pipeline
        title: null, description: null,
        skin_tone: null, undertone: null, color_family: null, accessories: null,
        color_intelligence: null,
        best_colors: null, best_colors_description: null,
        accent_colors: null, accent_colors_description: null,
        neutral_staples: null, neutral_staples_description: null,
        use_sparingly: null, use_sparingly_description: null,
        high_contrast_pairings: null, high_contrast_pairings_description: null,
        harmony_note: null, harmony_note_description: null,
        metals: null, chains: null, watches_and_leather: null,
        recommended_shapes: null, size_and_thickness: null, lens_and_material: null,
        // Face analysis defaults
        source: '', image_count: '', skin_type: '', skin_type_confidence: '',
        skin_raw_type_id: '', face_shape: '', face_shape_confidence: '',
        gender: '', gender_confidence: '', age: '',
        eye_glasses: '', eye_glasses_confidence: '',
        eye_open: '', eye_open_confidence: '',
        eye_eyelid: '', eye_eyelid_confidence: '',
        eye_size: '', eye_size_confidence: '',
        eyebrow_density: '', eyebrow_density_confidence: '',
        eyebrow_curve: '', eyebrow_curve_confidence: '',
        eyebrow_length: '', eyebrow_length_confidence: '',
        hair_length: '', hair_length_confidence: '',
        hair_fringe: '', hair_fringe_confidence: '',
        hair_color: '', hair_color_confidence: '',
        hat_style: '', hat_style_confidence: '',
        hat_color: '', hat_color_confidence: '',
        nose: '', nose_confidence: '',
        moustache: '', moustache_confidence: '',
        mouth: '', mouth_confidence: '',
        mask: '', mask_confidence: '',
        emotion: '', emotion_confidence: '',
        gender_identity: '', race: '',
      }).select('id').single();
      if (rErr) throw rErr;

      if (typeof localStorage !== 'undefined') localStorage.setItem('aloura_report_id', report.id);
      goto(`/report/${report.id}`);
    } catch (e: any) {
      error = e.message ?? 'Something went wrong. Please try again.';
    } finally {
      submitting = false;
    }
  }
</script>

<svelte:head>
  <title>Aloura — Create Your Style Profile</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="onboarding">

  <!-- Progress bar -->
  <div class="progress-wrap">
    <div class="progress-track">
      <div class="progress-fill" style="width:{step === 1 ? 50 : 100}%"></div>
    </div>
    <span class="progress-label">Step {step} of 2</span>
  </div>

  <div class="ob-body">

    {#if step === 1}
    <!-- ── STEP 1: GOALS ── -->
    <div class="step-card">
      <p class="eyebrow" style="margin-bottom:var(--space-4)">Let's personalise your experience</p>
      <h1 class="heading-lg" style="margin-bottom:var(--space-2)">What do you want Aloura<br>to help you with?</h1>
      <p class="step-sub">Pick everything that applies — no limit.</p>

      <div class="goals-list">
        {#each GOALS as goal}
          <button
            class="goal-row"
            class:selected={selectedGoals.includes(goal.id)}
            onclick={() => toggleGoal(goal.id)}
          >
            <div class="goal-row__icon">
              <i class={goal.icon}></i>
            </div>
            <span class="goal-row__label">{goal.label}</span>
            <div class="goal-row__check">
              {#if selectedGoals.includes(goal.id)}
                <i class="fas fa-check"></i>
              {/if}
            </div>
          </button>
        {/each}
      </div>

      <button
        class="btn btn--primary btn--full"
        style="margin-top:var(--space-8)"
        onclick={() => step = 2}
        disabled={selectedGoals.length === 0}
      >
        Continue <i class="fas fa-arrow-right"></i>
      </button>
    </div>

    {:else}
    <!-- ── STEP 2: PHOTOS ── -->
    <div class="step-card">
      <p class="eyebrow" style="margin-bottom:var(--space-4)">Almost there</p>
      <h1 class="heading-lg" style="margin-bottom:var(--space-2)">Upload your <em class="text-italic">photos.</em></h1>
      <p class="step-sub">1–3 clear face photos. Better photos = better analysis.<br>No makeup or glasses preferred for accuracy.</p>

      {#if error}
        <div class="error-msg"><i class="fas fa-exclamation-circle"></i> {error}</div>
      {/if}

      <div class="uploads">
        {#each uploadedImages as img, i}
          <div class="upload-preview">
            <img src={img.preview} alt="Upload {i + 1}" />
            <button class="upload-remove" onclick={() => removeImage(i)}>×</button>
          </div>
        {/each}
        {#if uploadedImages.length < 3}
          <label class="upload-slot">
            <i class="fas fa-plus"></i>
            <span>Add photo</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple style="display:none" onchange={handleFileSelect} />
          </label>
        {/if}
      </div>

      <div class="photo-tip">
        <i class="fas fa-lightbulb"></i>
        Good lighting and a neutral background give the best results.
      </div>

      <div class="step-actions">
        <button class="btn btn--ghost" onclick={() => step = 1}>
          <i class="fas fa-arrow-left"></i> Back
        </button>
        <button class="btn btn--primary" onclick={submit} disabled={submitting || uploadedImages.length === 0} style="opacity:{uploadedImages.length === 0 ? 0.45 : 1}">
          {#if submitting}<span class="btn-spinner"></span>{/if}
          Get started
        </button>
      </div>

      {#if uploadedImages.length === 0}
        <div class="photo-skip-wrap">
          <button class="skip-btn" onclick={() => { skippedPhotos = true; submit(); }}>
            Skip photos — I'll add them later
          </button>
          <p class="skip-note">
            <i class="fas fa-info-circle"></i>
            Without photos your color and style analysis won't be personalised to you.
          </p>
        </div>
      {/if}
    </div>
    {/if}

  </div>
</div>

<style>
  .onboarding { min-height: 100vh; padding-top: var(--nav-h); background: #faf7f2; }

  /* ── Progress ── */
  .progress-wrap {
    position: sticky; top: var(--nav-h); z-index: 10;
    background: rgba(253,251,248,0.95); backdrop-filter: blur(8px);
    border-bottom: 1px solid var(--clr-border);
    padding: 14px var(--page-px);
    display: flex; align-items: center; gap: var(--space-4);
  }
  .progress-track { flex: 1; height: 3px; background: var(--clr-light-taupe); border-radius: 999px; overflow: hidden; }
  .progress-fill  { height: 100%; background: var(--clr-terracotta); border-radius: 999px; transition: width 0.4s var(--ease); }
  .progress-label { font-size: var(--text-xs); color: var(--clr-text-muted); white-space: nowrap; }

  /* ── Body ── */
  .ob-body { display: flex; justify-content: center; padding: var(--space-10) var(--page-px) var(--space-16); }
  .step-card { width: 100%; max-width: 680px; background: #fff; border-radius: var(--radius-xl); padding: var(--space-10); box-shadow: var(--shadow-lg); }
  .step-sub { font-size: var(--text-sm); font-weight: 300; color: var(--clr-text-muted); line-height: 1.7; margin-bottom: var(--space-8); }

  /* ── Goals grid ── */
  .goals-list { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }

  .goal-row {
    display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-3);
    background: #faf7f2; border: 1.5px solid var(--clr-border);
    border-radius: var(--radius-lg); padding: 16px;
    cursor: pointer; text-align: left; width: 100%;
    transition: border-color var(--dur-fast), background var(--dur-fast);
    font-family: var(--font-body); position: relative;
  }
  .goal-row:hover { border-color: var(--clr-light-taupe); background: #f5efe8; }
  .goal-row.selected { border-color: var(--clr-charcoal); background: var(--clr-charcoal); }
  .goal-row.selected .goal-row__label { color: rgba(255,255,255,0.95); }
  .goal-row.selected .goal-row__icon  { background: rgba(255,255,255,0.12); color: rgba(255,255,255,0.9); border-color: transparent; }

  .goal-row__icon {
    width: 36px; height: 36px; border-radius: var(--radius-md); flex-shrink: 0;
    background: #fff; border: 1px solid var(--clr-border);
    display: flex; align-items: center; justify-content: center;
    font-size: 15px; color: var(--clr-terracotta);
    transition: background var(--dur-fast), color var(--dur-fast);
  }
  .goal-row__label { font-size: 13px; font-weight: 400; color: var(--clr-charcoal); line-height: 1.4; transition: color var(--dur-fast); }
  .goal-row__check {
    position: absolute; top: 12px; right: 12px;
    width: 20px; height: 20px; border-radius: 50%; flex-shrink: 0;
    border: 1.5px solid var(--clr-border); display: flex; align-items: center; justify-content: center;
    font-size: 9px; color: transparent; transition: all var(--dur-fast);
    background: #fff;
  }
  .goal-row.selected .goal-row__check { background: var(--clr-terracotta); border-color: var(--clr-terracotta); color: white; }

  .photo-skip-wrap { margin-top: var(--space-5); text-align: center; }
  .skip-btn {
    background: none; border: none; cursor: pointer;
    font-size: var(--text-xs); color: var(--clr-taupe);
    font-family: var(--font-body); text-decoration: underline;
    text-underline-offset: 3px; padding: var(--space-2);
    transition: color var(--dur-fast);
  }
  .skip-btn:hover { color: var(--clr-charcoal); }
  .skip-note {
    display: flex; align-items: flex-start; justify-content: center; gap: 6px;
    font-size: 11px; color: var(--clr-text-muted); margin-top: var(--space-2);
    line-height: 1.5; max-width: 340px; margin-inline: auto;
  }
  .skip-note i { color: var(--clr-terracotta); flex-shrink: 0; margin-top: 1px; }

  /* ── Photos ── */
  .uploads { display: flex; gap: var(--space-4); flex-wrap: wrap; margin-bottom: var(--space-5); }
  .upload-preview { position: relative; width: 100px; height: 100px; border-radius: var(--radius-lg); overflow: hidden; }
  .upload-preview img { width: 100%; height: 100%; object-fit: cover; }
  .upload-remove { position: absolute; top: 4px; right: 4px; background: rgba(44,44,44,0.75); color: white; border: none; cursor: pointer; border-radius: 50%; width: 22px; height: 22px; font-size: 13px; display: flex; align-items: center; justify-content: center; }
  .upload-slot { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; width: 100px; height: 100px; border: 2px dashed var(--clr-light-taupe); border-radius: var(--radius-lg); cursor: pointer; font-size: var(--text-xs); color: var(--clr-taupe); transition: border-color var(--dur-fast), color var(--dur-fast); }
  .upload-slot:hover { border-color: var(--clr-brown); color: var(--clr-brown); }
  .upload-slot i { font-size: 20px; }

  .photo-tip { display: flex; align-items: flex-start; gap: 8px; font-size: var(--text-xs); color: var(--clr-taupe); line-height: 1.6; padding: 10px 14px; background: #faf7f2; border-radius: var(--radius-md); margin-bottom: var(--space-8); }
  .photo-tip i { color: var(--clr-terracotta); margin-top: 1px; flex-shrink: 0; }

  .error-msg { background: rgba(196,80,60,0.08); color: #A33020; border: 1px solid rgba(196,80,60,0.2); border-radius: var(--radius-md); padding: var(--space-3) var(--space-4); font-size: var(--text-sm); margin-bottom: var(--space-5); display: flex; align-items: center; gap: var(--space-2); }
  .step-actions { display: flex; gap: var(--space-4); justify-content: flex-end; }
  .btn-spinner { width: 16px; height: 16px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.4); border-top-color: white; animation: spin 0.8s linear infinite; flex-shrink: 0; }
  button:disabled { opacity: 0.65; cursor: not-allowed; }
</style>
