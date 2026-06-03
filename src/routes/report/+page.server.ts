import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const { user } = await locals.safeGetSession();
  if (!user) throw redirect(303, '/auth');

  const { data: account } = await locals.supabase
    .from('accounts')
    .select('id')
    .eq('auth_id', user.id)
    .maybeSingle();

  if (!account) throw redirect(303, '/onboarding');

  const { data: report } = await locals.supabase
    .from('style_reports')
    .select('id')
    .eq('account_id', account.id)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!report) throw redirect(303, '/onboarding');
  throw redirect(303, `/report/${report.id}`);
};
