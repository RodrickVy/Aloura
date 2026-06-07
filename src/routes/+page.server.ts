import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const { user } = await locals.safeGetSession();

  if (user) {
    // Check if user has an account + style report
    const { data: account } = await locals.supabase
      .from('accounts')
      .select('id')
      .eq('auth_id', user.id)
      .maybeSingle();

    if (account) {
      const { data: report } = await locals.supabase
        .from('style_reports')
        .select('id')
        .eq('account_id', account.id)
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      throw redirect(303, report ? '/discover' : '/account');
    }
  }

  // Fetch recent public moodboards for the Pinterest grid
  const { data: boards } = await locals.supabase
    .from('mood_boards')
    .select('id, title, image_url, occasion, slug, colors')
    .not('image_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(40);

  return { boards: boards ?? [] };
};
