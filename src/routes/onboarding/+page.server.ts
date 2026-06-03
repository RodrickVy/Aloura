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

  // No account yet — create one then continue
  if (!account) {
    const { data: newAccount } = await locals.supabase
      .from('accounts')
      .insert({ auth_id: user.id, email: user.email ?? '' })
      .select('id')
      .single();

    return { accountId: newAccount?.id ?? null };
  }

  return { accountId: account.id };
};
