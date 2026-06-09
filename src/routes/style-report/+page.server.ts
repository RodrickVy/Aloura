import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const { user } = await locals.safeGetSession();
  if (!user) throw redirect(303, '/');

  let { data: account } = await locals.supabase
    .from('accounts').select('id').eq('auth_id', user.id).maybeSingle();

  if (!account) {
    const { data: created } = await locals.supabase
      .from('accounts').insert({ auth_id: user.id, email: user.email ?? '' }).select('id').single();
    account = created;
  }

  return { accountId: account!.id };
};
