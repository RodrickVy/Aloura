import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const { user } = await locals.safeGetSession();
  if (!user) throw redirect(303, '/');

  const { data: account } = await locals.supabase
    .from('accounts')
    .select('id')
    .eq('auth_id', user.id)
    .maybeSingle();

  if (!account) throw redirect(303, '/onboarding');

  return { accountId: account.id };
};
