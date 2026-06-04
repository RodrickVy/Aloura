import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const { user } = await locals.safeGetSession();

  // Logged-out visitors are allowed — they see the public catalogue only.
  if (!user) {
    return { accountId: null, isLoggedIn: false };
  }

  const { data: account } = await locals.supabase
    .from('accounts')
    .select('id')
    .eq('auth_id', user.id)
    .maybeSingle();

  return { accountId: account?.id ?? null, isLoggedIn: true };
};
