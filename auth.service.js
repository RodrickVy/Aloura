/**
 * auth.service.js
 * Aloura — Authentication Service
 *
 * Handles email + OTP (magic code) sign-up and sign-in via Supabase Auth.
 * No passwords. Users enter their email, receive a 6-digit code, confirm it.
 *
 * Usage:
 *   import { AuthService } from './auth.service.js';
 *   const auth = new AuthService(supabaseClient);
 *
 *   await auth.sendCode({ name: 'Maya', email: 'maya@example.com' });
 *   await auth.verifyCode({ email: 'maya@example.com', code: '483921' });
 */

/* ─────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────── */

const OTP_LENGTH        = 6;
const NAME_MIN_LENGTH   = 2;
const NAME_MAX_LENGTH   = 60;
const CODE_EXPIRY_MS    = 10 * 60 * 1000; // 10 minutes — matches Supabase default
const RESEND_COOLDOWN_S = 60;             // seconds before user can resend

/* ─────────────────────────────────────────
   RESULT HELPERS
   Every public method returns { ok, data, error }
   so callers never need try/catch.
───────────────────────────────────────── */

/**
 * @typedef {{ ok: true,  data: any,    error: null   }} OkResult
 * @typedef {{ ok: false, data: null,   error: string }} ErrResult
 * @typedef {OkResult | ErrResult} Result
 */

/** @returns {OkResult} */
const ok  = (data = null)    => ({ ok: true,  data,  error: null });

/** @returns {ErrResult} */
const err = (message = '')   => ({ ok: false, data:  null, error: message });

/* ─────────────────────────────────────────
   VALIDATORS  (static — pure functions)
   Each returns { valid: boolean, message: string }
───────────────────────────────────────── */

export class AuthValidators {

  /**
   * Validates a display name.
   * Rules: required, 2–60 chars, letters / spaces / hyphens / apostrophes only.
   *
   * @param {string} value
   * @returns {{ valid: boolean, message: string }}
   */
  static validateName(value) {
    const trimmed = (value ?? '').trim();

    if (!trimmed) {
      return { valid: false, message: 'Please enter your name.' };
    }
    if (trimmed.length < NAME_MIN_LENGTH) {
      return { valid: false, message: `Name must be at least ${NAME_MIN_LENGTH} characters.` };
    }
    if (trimmed.length > NAME_MAX_LENGTH) {
      return { valid: false, message: `Name must be ${NAME_MAX_LENGTH} characters or fewer.` };
    }
    if (!/^[\p{L}\p{M}'\- ]+$/u.test(trimmed)) {
      return { valid: false, message: 'Name can only contain letters, spaces, hyphens, and apostrophes.' };
    }

    return { valid: true, message: '' };
  }

  /**
   * Validates an email address.
   * Uses a pragmatic RFC-5321-aligned regex — not pedantically exhaustive,
   * but catches every real-world bad input.
   *
   * @param {string} value
   * @returns {{ valid: boolean, message: string }}
   */
  static validateEmail(value) {
    const trimmed = (value ?? '').trim().toLowerCase();

    if (!trimmed) {
      return { valid: false, message: 'Please enter your email address.' };
    }

    // Must contain exactly one @
    const atCount = (trimmed.match(/@/g) ?? []).length;
    if (atCount !== 1) {
      return { valid: false, message: 'Enter a valid email address (e.g. you@example.com).' };
    }

    const [local, domain] = trimmed.split('@');

    if (!local || local.length > 64) {
      return { valid: false, message: 'The part before @ looks invalid.' };
    }

    if (!domain || domain.length > 255) {
      return { valid: false, message: 'The part after @ looks invalid.' };
    }

    // Domain must have at least one dot and a valid TLD
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/.test(domain)) {
      return { valid: false, message: 'Enter a valid email address (e.g. you@example.com).' };
    }

    // Reject obvious test/placeholder values
    const blocked = ['test@test.com', 'example@example.com', 'user@domain.com'];
    if (blocked.includes(trimmed)) {
      return { valid: false, message: 'Please use a real email address.' };
    }

    return { valid: true, message: '' };
  }

  /**
   * Validates a 6-digit OTP code entered by the user.
   *
   * @param {string} value
   * @returns {{ valid: boolean, message: string }}
   */
  static validateCode(value) {
    const trimmed = (value ?? '').trim().replace(/\s/g, '');

    if (!trimmed) {
      return { valid: false, message: 'Please enter the verification code.' };
    }
    if (!/^\d+$/.test(trimmed)) {
      return { valid: false, message: 'The code should only contain numbers.' };
    }
    if (trimmed.length !== OTP_LENGTH) {
      return {
        valid: false,
        message: `The code should be ${OTP_LENGTH} digits. You've entered ${trimmed.length}.`,
      };
    }

    return { valid: true, message: '' };
  }

  /**
   * Runs all sign-up fields at once and returns a map of field → message.
   * Returns null if everything is valid.
   *
   * @param {{ name: string, email: string }} fields
   * @returns {Record<string, string> | null}
   */
  static validateSignUpForm({ name, email }) {
    const errors = {};

    const nameResult  = AuthValidators.validateName(name);
    const emailResult = AuthValidators.validateEmail(email);

    if (!nameResult.valid)  errors.name  = nameResult.message;
    if (!emailResult.valid) errors.email = emailResult.message;

    return Object.keys(errors).length ? errors : null;
  }

  /**
   * Runs all verification fields at once.
   * Returns null if everything is valid.
   *
   * @param {{ email: string, code: string }} fields
   * @returns {Record<string, string> | null}
   */
  static validateVerifyForm({ email, code }) {
    const errors = {};

    const emailResult = AuthValidators.validateEmail(email);
    const codeResult  = AuthValidators.validateCode(code);

    if (!emailResult.valid) errors.email = emailResult.message;
    if (!codeResult.valid)  errors.code  = codeResult.message;

    return Object.keys(errors).length ? errors : null;
  }
}

/* ─────────────────────────────────────────
   AUTH SERVICE CLASS
───────────────────────────────────────── */

export class AuthService {

  /** @type {import('@supabase/supabase-js').SupabaseClient} */
  #client;

  /** @type {number | null} Unix ms timestamp of last sendCode call */
  #lastSentAt = null;

  /** @type {string | null} The email a code was most recently sent to */
  #pendingEmail = null;

  /**
   * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
   *   Pass in an already-initialised Supabase client so this service
   *   stays decoupled from configuration concerns.
   *
   * @example
   *   import { createClient } from '@supabase/supabase-js';
   *   const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
   *   const auth = new AuthService(supabase);
   */
  constructor(supabaseClient) {
    if (!supabaseClient) {
      throw new Error('[AuthService] A Supabase client is required.');
    }
    this.#client = supabaseClient;
  }

  /* ── Public API ─────────────────────────── */

  /**
   * Sends a one-time verification code to the user's email.
   * Works for both sign-up (new users) and sign-in (returning users) —
   * Supabase handles both with the same OTP flow.
   *
   * On sign-up, stores the display name in user metadata so it is
   * available immediately after verification.
   *
   * @param {{ name: string, email: string }} params
   * @returns {Promise<Result>}
   *
   * @example
   *   const result = await auth.sendCode({ name: 'Maya', email: 'maya@example.com' });
   *   if (!result.ok) showError(result.error);
   */
  async sendCode({ name, email }) {

    // 1. Validate inputs
    const formErrors = AuthValidators.validateSignUpForm({ name, email });
    if (formErrors) {
      return err(Object.values(formErrors)[0]); // surface the first error
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName  = name.trim();

    // 2. Enforce resend cooldown
    const cooldownResult = this.#checkResendCooldown();
    if (!cooldownResult.ok) return cooldownResult;

    // 3. Send OTP via Supabase Auth
    const { error: supabaseError } = await this.#client.auth.signInWithOtp({
      email: cleanEmail,
      options: {
        // data is stored in user_metadata on first sign-up
        data: { full_name: cleanName, display_name: cleanName },
        // Don't create the user if they don't exist —
        // set to false so both sign-up and sign-in work identically here
        shouldCreateUser: true,
      },
    });

    if (supabaseError) {
      return err(this.#mapSupabaseError(supabaseError));
    }

    // 4. Record send time for cooldown tracking
    this.#lastSentAt  = Date.now();
    this.#pendingEmail = cleanEmail;

    return ok({ email: cleanEmail, expiresInMs: CODE_EXPIRY_MS });
  }

  /**
   * Verifies the OTP code the user received by email.
   * On success, returns the Supabase session and user objects.
   *
   * @param {{ email: string, code: string }} params
   * @returns {Promise<Result>}
   *
   * @example
   *   const result = await auth.verifyCode({ email: 'maya@example.com', code: '483921' });
   *   if (result.ok) {
   *     const { session, user } = result.data;
   *     // redirect to /report
   *   }
   */
  async verifyCode({ email, code }) {

    // 1. Validate inputs
    const formErrors = AuthValidators.validateVerifyForm({ email, code });
    if (formErrors) {
      return err(Object.values(formErrors)[0]);
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanCode  = code.trim().replace(/\s/g, '');

    // 2. Verify the OTP with Supabase
    const { data, error: supabaseError } = await this.#client.auth.verifyOtp({
      email: cleanEmail,
      token: cleanCode,
      type: 'email',
    });

    if (supabaseError) {
      return err(this.#mapSupabaseError(supabaseError));
    }

    // 3. Clear pending state
    this.#pendingEmail = null;

    return ok({ session: data.session, user: data.user });
  }

  /**
   * Signs up a new user with email and password.
   *
   * @param {{ name: string, email: string, password: string }} params
   * @returns {Promise<Result>}
   */
  async signUpWithPassword({ name, email, password }) {
    if (!name?.trim())     return err('Please enter your name.');
    if (!email?.trim())    return err('Please enter your email address.');
    if (!password)         return err('Please enter a password.');
    if (password.length < 8) return err('Password must be at least 8 characters.');

    const { data, error: supabaseError } = await this.#client.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: { full_name: name.trim(), display_name: name.trim() },
      },
    });

    if (supabaseError) return err(this.#mapSupabaseError(supabaseError));
    return ok({ session: data.session, user: data.user });
  }

  /**
   * Signs in an existing user with email and password.
   *
   * @param {{ email: string, password: string }} params
   * @returns {Promise<Result>}
   */
  async signInWithPassword({ email, password }) {
    if (!email?.trim()) return err('Please enter your email address.');
    if (!password)      return err('Please enter your password.');

    const { data, error: supabaseError } = await this.#client.auth.signInWithPassword({
      email:    email.trim().toLowerCase(),
      password,
    });

    if (supabaseError) return err(this.#mapSupabaseError(supabaseError));
    return ok({ session: data.session, user: data.user });
  }

  /**
   * Creates an account row in public.accounts after OTP verification.
   * If the row already exists (returning user), fetches and returns it.
   * Call this immediately after verifyCode succeeds.
   *
   * @param {{ authId: string, name: string, email: string }} params
   * @returns {Promise<Result>} data: { id, auth_id, name, email, ... }
   */
  async createOrFetchAccount({ authId, name, email }) {
    if (!authId) return err('Auth ID is required.');
    if (!email)  return err('Email is required.');

    // 1. First try to fetch existing row — avoids insert conflict entirely
    const { data: existing } = await this.#client
      .from('accounts')
      .select('*')
      .eq('auth_id', authId)
      .maybeSingle();

    if (existing) {
      // Returning user — update last sign in
      await this.#client
        .from('accounts')
        .update({ last_sign_in_at: new Date().toISOString() })
        .eq('auth_id', authId);
      return ok(existing);
    }

    // 2. No row found — new user, insert
    const { data: inserted, error: insertError } = await this.#client
      .from('accounts')
      .insert({
        auth_id: authId,
        name:    name?.trim() || null,
        email:   email.trim().toLowerCase(),
      })
      .select()
      .single();

    if (inserted) return ok(inserted);

    console.error('[createOrFetchAccount] Insert error:', JSON.stringify(insertError));
    return err('Account setup failed. Please try again.');
  }

  /**
   * Resends the verification code to the same email.
   * Respects the resend cooldown window.
   *
   * @param {{ name: string, email: string }} params
   * @returns {Promise<Result>}
   */
  async resendCode({ name, email }) {
    return this.sendCode({ name, email });
  }

  /**
   * Signs the current user out and clears the local session.
   *
   * @returns {Promise<Result>}
   */
  async signOut() {
    const { error: supabaseError } = await this.#client.auth.signOut();

    if (supabaseError) {
      return err(this.#mapSupabaseError(supabaseError));
    }

    this.#lastSentAt   = null;
    this.#pendingEmail = null;

    return ok();
  }

  /**
   * Returns the currently authenticated user, or null if signed out.
   *
   * @returns {Promise<Result>}
   */
  async getUser() {
    const { data, error: supabaseError } = await this.#client.auth.getUser();

    if (supabaseError) {
      return err(this.#mapSupabaseError(supabaseError));
    }

    return ok(data.user ?? null);
  }

  /**
   * Returns the active session, or null if none exists.
   *
   * @returns {Promise<Result>}
   */
  async getSession() {
    const { data, error: supabaseError } = await this.#client.auth.getSession();

    if (supabaseError) {
      return err(this.#mapSupabaseError(supabaseError));
    }

    return ok(data.session ?? null);
  }

  /**
   * Subscribes to auth state changes (SIGNED_IN, SIGNED_OUT, etc.)
   * Returns an unsubscribe function.
   *
   * @param {(event: string, session: object | null) => void} callback
   * @returns {() => void} unsubscribe
   *
   * @example
   *   const unsubscribe = auth.onAuthChange((event, session) => {
   *     if (event === 'SIGNED_IN') router.push('/report');
   *   });
   */
  onAuthChange(callback) {
    const { data: { subscription } } = this.#client.auth.onAuthStateChange(callback);
    return () => subscription.unsubscribe();
  }

  /* ── Resend cooldown helper ─────────────── */

  /**
   * Returns how many seconds remain before the user can resend.
   * Returns 0 if the cooldown has passed.
   *
   * @returns {number}
   */
  getResendCooldownSeconds() {
    if (!this.#lastSentAt) return 0;
    const elapsed = (Date.now() - this.#lastSentAt) / 1000;
    const remaining = RESEND_COOLDOWN_S - elapsed;
    return remaining > 0 ? Math.ceil(remaining) : 0;
  }

  /**
   * The email a code is currently pending for, or null.
   * Useful for pre-filling the verify screen.
   *
   * @returns {string | null}
   */
  get pendingEmail() {
    return this.#pendingEmail;
  }

  /* ── Private helpers ────────────────────── */

  /**
   * Checks whether the resend cooldown is still active.
   * @returns {Result}
   */
  #checkResendCooldown() {
    const remaining = this.getResendCooldownSeconds();
    if (remaining > 0) {
      return err(`Please wait ${remaining} second${remaining !== 1 ? 's' : ''} before requesting another code.`);
    }
    return ok();
  }

  /**
   * Maps raw Supabase error messages to user-friendly strings.
   * Keeps Supabase internals out of the UI layer.
   *
   * @param {{ message: string, status?: number }} supabaseError
   * @returns {string}
   */
  #mapSupabaseError(supabaseError) {
    const msg    = (supabaseError.message ?? '').toLowerCase();
    const status = supabaseError.status;

    // OTP / code errors
    if (msg.includes('token has expired') || msg.includes('otp expired')) {
      return 'That code has expired. Request a new one and try again.';
    }
    if (msg.includes('invalid') && msg.includes('token') || msg.includes('invalid otp')) {
      return 'That code is incorrect. Double-check it and try again.';
    }
    if (msg.includes('token not found')) {
      return 'Code not found. Make sure you\'re using the most recent code sent to your email.';
    }

    // Email errors
    if (msg.includes('unable to validate email')) {
      return 'That email address couldn\'t be reached. Please check it and try again.';
    }
    if (msg.includes('email rate limit') || status === 429) {
      return 'Too many requests. Please wait a moment before trying again.';
    }

    // User errors
    if (msg.includes('user already registered')) {
      return 'An account with that email already exists. We\'ve sent you a sign-in code instead.';
    }
    if (msg.includes('signup is disabled')) {
      return 'New sign-ups are temporarily paused. Please try again later.';
    }

    // Network / server errors
    if (!navigator.onLine) {
      return 'You appear to be offline. Check your connection and try again.';
    }
    if (status >= 500) {
      return 'Something went wrong on our end. Please try again in a moment.';
    }

    // Fallback — don't expose raw Supabase messages to users
    return 'Something went wrong. Please try again.';
  }
}