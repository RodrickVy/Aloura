/**
 * auth.service.js
 * Aloura — Authentication Service (Email + Password only)
 */

const NAME_MIN_LENGTH = 2;
const NAME_MAX_LENGTH = 60;

const ok  = (data = null) => ({ ok: true,  data,  error: null });
const err = (message = '') => ({ ok: false, data: null, error: message });

export class AuthValidators {
  static validateName(value) {
    const t = (value ?? '').trim();
    if (!t) return { valid: false, message: 'Please enter your name.' };
    if (t.length < NAME_MIN_LENGTH) return { valid: false, message: `Name must be at least ${NAME_MIN_LENGTH} characters.` };
    if (t.length > NAME_MAX_LENGTH) return { valid: false, message: `Name must be ${NAME_MAX_LENGTH} characters or fewer.` };
    return { valid: true, message: '' };
  }

  static validateEmail(value) {
    const t = (value ?? '').trim().toLowerCase();
    if (!t) return { valid: false, message: 'Please enter your email address.' };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t)) return { valid: false, message: 'Enter a valid email address.' };
    return { valid: true, message: '' };
  }

  static validatePassword(value) {
    if (!value) return { valid: false, message: 'Please enter a password.' };
    if (value.length < 8) return { valid: false, message: 'Password must be at least 8 characters.' };
    return { valid: true, message: '' };
  }
}

export class AuthService {
  #client;

  constructor(supabaseClient) {
    if (!supabaseClient) throw new Error('[AuthService] A Supabase client is required.');
    this.#client = supabaseClient;
  }

  async signUp({ name, email, password }) {
    const nameV = AuthValidators.validateName(name);
    if (!nameV.valid) return err(nameV.message);
    const emailV = AuthValidators.validateEmail(email);
    if (!emailV.valid) return err(emailV.message);
    const pwV = AuthValidators.validatePassword(password);
    if (!pwV.valid) return err(pwV.message);

    const { data, error: e } = await this.#client.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: { full_name: name.trim(), display_name: name.trim() } },
    });
    if (e) return err(this.#mapError(e));
    return ok({ session: data.session, user: data.user });
  }

  async signIn({ email, password }) {
    const emailV = AuthValidators.validateEmail(email);
    if (!emailV.valid) return err(emailV.message);
    if (!password) return err('Please enter your password.');

    const { data, error: e } = await this.#client.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (e) return err(this.#mapError(e));
    return ok({ session: data.session, user: data.user });
  }

  async sendPasswordReset(email) {
    const emailV = AuthValidators.validateEmail(email);
    if (!emailV.valid) return err(emailV.message);

    const { error: e } = await this.#client.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo: window.location.origin + '/reset-password.html' }
    );
    if (e) return err(this.#mapError(e));
    return ok();
  }

  async updatePassword(newPassword) {
    const pwV = AuthValidators.validatePassword(newPassword);
    if (!pwV.valid) return err(pwV.message);

    const { error: e } = await this.#client.auth.updateUser({ password: newPassword });
    if (e) return err(this.#mapError(e));
    return ok();
  }

  async signOut() {
    const { error: e } = await this.#client.auth.signOut();
    if (e) return err(this.#mapError(e));
    return ok();
  }

  async getSession() {
    const { data, error: e } = await this.#client.auth.getSession();
    if (e) return err(this.#mapError(e));
    return ok(data.session ?? null);
  }

  async getUser() {
    const { data, error: e } = await this.#client.auth.getUser();
    if (e) return err(this.#mapError(e));
    return ok(data.user ?? null);
  }

  onAuthChange(callback) {
    const { data: { subscription } } = this.#client.auth.onAuthStateChange(callback);
    return () => subscription.unsubscribe();
  }

  async createOrFetchAccount({ authId, name, email }) {
    if (!authId) return err('Auth ID is required.');
    if (!email)  return err('Email is required.');

    const { data: existing } = await this.#client
      .from('accounts')
      .select('*')
      .eq('auth_id', authId)
      .maybeSingle();

    if (existing) {
      await this.#client
        .from('accounts')
        .update({ last_sign_in_at: new Date().toISOString() })
        .eq('auth_id', authId);
      return ok(existing);
    }

    const { data: inserted, error: insertError } = await this.#client
      .from('accounts')
      .insert({ auth_id: authId, name: name?.trim() || null, email: email.trim().toLowerCase() })
      .select()
      .single();

    if (inserted) return ok(inserted);
    console.error('[createOrFetchAccount] Insert error:', JSON.stringify(insertError));
    return err('Account setup failed. Please try again.');
  }

  #mapError(e) {
    const msg = (e.message ?? '').toLowerCase();
    const status = e.status;
    if (msg.includes('invalid login') || msg.includes('invalid credentials')) return 'Incorrect email or password. Please try again.';
    if (msg.includes('email not confirmed')) return 'Please check your email and confirm your account first.';
    if (msg.includes('user already registered')) return 'An account with this email already exists. Try signing in instead.';
    if (msg.includes('password') && msg.includes('short')) return 'Password must be at least 8 characters.';
    if (msg.includes('rate limit') || status === 429) return 'Too many attempts. Please wait a moment and try again.';
    if (msg.includes('email') && msg.includes('invalid')) return 'That email address doesn\'t look right.';
    if (!navigator.onLine) return 'You appear to be offline. Check your connection and try again.';
    if (status >= 500) return 'Something went wrong on our end. Please try again in a moment.';
    return 'Something went wrong. Please try again.';
  }
}