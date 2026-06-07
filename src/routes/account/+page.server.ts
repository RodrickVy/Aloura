import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const { user } = await locals.safeGetSession();
  if (!user) throw redirect(303, '/');

  // Ensure an account row exists for this auth user.
  let { data: account } = await locals.supabase
    .from('accounts')
    .select('id, name, email, onboarded')
    .eq('auth_id', user.id)
    .maybeSingle();

  if (!account) {
    const { data: created } = await locals.supabase
      .from('accounts')
      .insert({ auth_id: user.id, email: user.email ?? '' })
      .select('id, name, email, onboarded')
      .single();
    account = created;
  }

  // Load the user's profile row (may be null - triggers onboarding popup).
  const { data: profile } = await locals.supabase
    .from('profile')
    .select('*')
    .eq('account_id', account!.id)
    .maybeSingle();

  return {
    account,
    profile,
    authEmail: user.email ?? '',
  };
};
