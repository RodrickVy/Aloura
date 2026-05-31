/**
 * report.service.js
 * Aloura — Report Service
 *
 * Responsibilities:
 *   1. Create a skeleton style_report row in Supabase (immediately after
 *      onboarding) with account info, profile image references, and empty
 *      text fields that the AI will fill in later.
 *   2. Listen to that row in realtime — fires a callback whenever the AI
 *      updates any field, so the report page can progressively render.
 *   3. Fetch the current state of a report by ID at any time.
 *
 * Usage:
 *   import { ReportService } from './report.service.js';
 *   const reports = new ReportService(supabaseClient);
 *
 *   // Create the skeleton (call this right after photo upload)
 *   const result = await reports.createReport({ accountId, imageIds, goals });
 *   if (result.ok) window.location.href = `report.html?report=${result.data.id}`;
 *
 *   // On the report page — fetch + subscribe
 *   const report = await reports.getReport(reportId);
 *   const unsubscribe = reports.subscribeToReport(reportId, (updatedReport) => {
 *     renderReport(updatedReport);
 *   });
 */

/* ─────────────────────────────────────────
   RESULT HELPERS
───────────────────────────────────────── */

/** @returns {{ ok: true,  data: any,    error: null   }} */
const ok  = (data = null) => ({ ok: true,  data,  error: null });

/** @returns {{ ok: false, data: null,   error: string }} */
const err = (message)     => ({ ok: false, data:  null, error: message });

/* ─────────────────────────────────────────
   REPORT SKELETON BUILDER
   Defines the full shape of a style_report row.
   Every AI-generated text field starts as null.
   The AI service fills these in asynchronously.
───────────────────────────────────────── */

/**
 * @typedef {Object} CreateReportParams
 * @property {string}        accountId       - public.accounts.id
 * @property {string[]}      imageIds        - up to 3 profile_images.id values
 * @property {string[]}      [goals]         - selected goal strings from onboarding
 */

/**
 * Builds the skeleton object to insert into style_reports.
 * All AI-generated fields are null — the AI fills them in later.
 *
 * @param {CreateReportParams} params
 * @returns {Object}
 */
function buildReportSkeleton({ accountId, imageIds = [], goals = [] }) {
  const [img1 = null, img2 = null, img3 = null] = imageIds;

  const [goal1 = null, goal2 = null, goal3 = null] = goals;

  return {
    account_id:           accountId,

    // Profile image references
    profile_image_1_id:   img1,
    profile_image_2_id:   img2,
    profile_image_3_id:   img3,

    // Goals from onboarding
    goal_1:               goal1,
    goal_2:               goal2,
    goal_3:               goal3,

    // Header — AI fills these in
    title:                null,
    description:          null,

    // Quick snapshot — AI fills these in
    skin_tone:            null,
    undertone:            null,
    color_family:         null,
    accessories:          null,

    // Color intelligence — AI fills these in
    color_intelligence:           null,

    best_colors:                  null,
    best_colors_description:      null,

    accent_colors:                null,
    accent_colors_description:    null,

    neutral_staples:              null,
    neutral_staples_description:  null,

    use_sparingly:                null,
    use_sparingly_description:    null,

    high_contrast_pairings:             null,
    high_contrast_pairings_description: null,

    harmony_note:                 null,
    harmony_note_description:     null,
    harmony_note_cool_colors:     null,

    // Jewelry & accessories — AI fills these in
    metals:               null,
    chains:               null,
    watches_and_leather:  null,

    // Eyewear & frames — AI fills these in
    recommended_shapes:   null,
    size_and_thickness:   null,
    lens_and_material:    null,

    // Face analysis — filled in by face_analyser + skin_tone_analyzer pipeline
    source:                     '',
    image_count:                '',
    skin_type:                  '',
    skin_type_confidence:       '',
    skin_raw_type_id:           '',
    face_shape:                 '',
    face_shape_confidence:      '',
    gender:                     '',
    gender_confidence:          '',
    age:                        '',
    eye_glasses:                '',
    eye_glasses_confidence:     '',
    eye_open:                   '',
    eye_open_confidence:        '',
    eye_eyelid:                 '',
    eye_eyelid_confidence:      '',
    eye_size:                   '',
    eye_size_confidence:        '',
    eyebrow_density:            '',
    eyebrow_density_confidence: '',
    eyebrow_curve:              '',
    eyebrow_curve_confidence:   '',
    eyebrow_length:             '',
    eyebrow_length_confidence:  '',
    hair_length:                '',
    hair_length_confidence:     '',
    hair_fringe:                '',
    hair_fringe_confidence:     '',
    hair_color:                 '',
    hair_color_confidence:      '',
    hat_style:                  '',
    hat_style_confidence:       '',
    hat_color:                  '',
    hat_color_confidence:       '',
    nose:                       '',
    nose_confidence:            '',
    moustache:                  '',
    moustache_confidence:       '',
    mouth:                      '',
    mouth_confidence:           '',
    mask:                       '',
    mask_confidence:            '',
    emotion:                    '',
    emotion_confidence:         '',

    // generated_at is set by DB default (now())
  };
}

/* ─────────────────────────────────────────
   REPORT COMPLETENESS CHECKER
   Determines what percentage of AI fields
   have been filled in — used by the loading
   screen to show meaningful progress.
───────────────────────────────────────── */

const AI_FIELDS = [
  'title', 'description',
  'skin_tone', 'undertone', 'color_family', 'accessories',
  'color_intelligence',
  'best_colors', 'best_colors_description',
  'accent_colors', 'accent_colors_description',
  'neutral_staples', 'neutral_staples_description',
  'use_sparingly', 'use_sparingly_description',
  'high_contrast_pairings', 'high_contrast_pairings_description',
  'harmony_note', 'harmony_note_description',
  'metals', 'chains', 'watches_and_leather',
  'recommended_shapes', 'size_and_thickness', 'lens_and_material',
];

/**
 * Returns how complete the AI fill-in is as a 0–100 integer.
 *
 * @param {Object} report - style_report row
 * @returns {number} 0–100
 */
export function getReportCompleteness(report) {
  if (!report) return 0;
  const filled = AI_FIELDS.filter(f => {
    const val = report[f];
    if (val === null || val === undefined) return false;
    if (typeof val === 'string') return val.trim().length > 0;
    if (Array.isArray(val)) return val.length > 0;
    return true;
  }).length;
  return Math.round((filled / AI_FIELDS.length) * 100);
}

/**
 * Returns true if enough fields are filled to show the report.
 * Uses a threshold rather than 100% so minor missing fields
 * don't block rendering.
 *
 * @param {Object} report
 * @returns {boolean}
 */
export function isReportReady(report) {
  return getReportCompleteness(report) >= 60;
}

/* ─────────────────────────────────────────
   REPORT SERVICE CLASS
───────────────────────────────────────── */

export class ReportService {

  /** @type {import('@supabase/supabase-js').SupabaseClient} */
  #client;

  /** @type {Map<string, Function>} reportId → unsubscribe function */
  #subscriptions = new Map();

  /**
   * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
   *
   * @example
   *   const reports = new ReportService(supabase);
   */
  constructor(supabaseClient) {
    if (!supabaseClient) {
      throw new Error('[ReportService] A Supabase client is required.');
    }
    this.#client = supabaseClient;
  }

  /* ── Public API ─────────────────────────── */

  /**
   * Creates a skeleton style_report row.
   * Call this immediately after the user finishes photo upload.
   * The AI service reads this row and fills in the text fields async.
   *
   * @param {CreateReportParams} params
   * @returns {Promise<Result>} data: the newly created report row
   *
   * @example
   *   const result = await reports.createReport({
   *     accountId: '...',
   *     imageIds:  ['uuid1', 'uuid2'],
   *     goals:     ['Improve Confidence', 'Look More Attractive'],
   *   });
   *   if (result.ok) {
   *     window.location.href = `report.html?report=${result.data.id}`;
   *   }
   */
  async createReport({ accountId, imageIds = [], goals = [] }) {
    if (!accountId) return err('Account ID is required to create a report.');

    const skeleton = buildReportSkeleton({ accountId, imageIds, goals });

    const { data, error: dbError } = await this.#client
      .from('style_reports')
      .insert(skeleton)
      .select()
      .single();

    if (dbError) return err(this.#mapDbError(dbError));

    return ok(data);
  }

  /**
   * Fetches the current state of a report by ID.
   * Use this on page load before subscribing to realtime updates.
   *
   * @param {string} reportId - style_reports.id (UUID)
   * @returns {Promise<Result>} data: the report row or null
   *
   * @example
   *   const result = await reports.getReport(reportId);
   *   if (result.ok && result.data) renderReport(result.data);
   */
  async getReport(reportId) {
    if (!reportId) return err('Report ID is required.');

    const { data, error: dbError } = await this.#client
      .from('style_reports')
      .select('*')
      .eq('id', reportId)
      .single();

    if (dbError) {
      if (dbError.code === 'PGRST116') return ok(null); // not found
      return err(this.#mapDbError(dbError));
    }

    return ok(data);
  }

  /**
   * Updates the profile image references on an existing report row.
   * Called after the user finishes uploading photos on the upload screen.
   *
   * @param {{ reportId: string, imageIds: string[] }} params
   * @returns {Promise<Result>}
   */
  async updateReportImages({ reportId, imageIds = [] }) {
    if (!reportId) return err('Report ID is required.');

    const [img1 = null, img2 = null, img3 = null] = imageIds;

    const { data, error: dbError } = await this.#client
      .from('style_reports')
      .update({
        profile_image_1_id: img1,
        profile_image_2_id: img2,
        profile_image_3_id: img3,
      })
      .eq('id', reportId)
      .select()
      .single();

    if (dbError) return err(this.#mapDbError(dbError));
    return ok(data);
  }

  /**
   * Subscribes to realtime updates on a specific report row.
   * Fires the callback immediately with the current state, then again
   * whenever the AI service updates any field.
   *
   * Returns an unsubscribe function — call it when leaving the page.
   *
   * @param {string}   reportId  - style_reports.id
   * @param {Function} callback  - (report: Object, completeness: number) => void
   * @returns {Promise<() => void>} unsubscribe function
   *
   * @example
   *   const unsubscribe = await reports.subscribeToReport(reportId, (report, pct) => {
   *     if (isReportReady(report)) showReport(report);
   *     else showLoading(pct);
   *   });
   *
   *   // On page unload:
   *   window.addEventListener('pagehide', unsubscribe);
   */
  async subscribeToReport(reportId, callback) {
    if (!reportId) return () => {};

    // 1. Fetch current state and fire callback immediately
    const initial = await this.getReport(reportId);
    if (initial.ok && initial.data) {
      callback(initial.data, getReportCompleteness(initial.data));
    }

    // 2. Subscribe to realtime UPDATE events on this row
    const channel = this.#client
      .channel(`report:${reportId}`)
      .on(
        'postgres_changes',
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'style_reports',
          filter: `id=eq.${reportId}`,
        },
        (payload) => {
          const updated = payload.new;
          callback(updated, getReportCompleteness(updated));
        }
      )
      .subscribe();

    // 3. Store and return unsubscribe function
    const unsubscribe = () => {
      this.#client.removeChannel(channel);
      this.#subscriptions.delete(reportId);
    };

    this.#subscriptions.set(reportId, unsubscribe);

    return unsubscribe;
  }

  /**
   * Unsubscribes from all active realtime subscriptions.
   * Call on app teardown or user sign-out.
   */
  unsubscribeAll() {
    this.#subscriptions.forEach(unsub => unsub());
    this.#subscriptions.clear();
  }

  /* ── Private helpers ────────────────────── */

  /**
   * @param {{ message: string, code: string }} error
   * @returns {string}
   */
  #mapDbError(error) {
    const msg  = (error.message ?? '').toLowerCase();
    const code = error.code ?? '';

    if (code === '42501' || msg.includes('permission')) {
      return 'You do not have permission to access this report.';
    }
    if (code === '23503') {
      return 'Account or image reference not found. Please try again.';
    }
    if (!navigator.onLine) {
      return 'You appear to be offline. Check your connection and try again.';
    }

    return 'Something went wrong. Please try again.';
  }
}