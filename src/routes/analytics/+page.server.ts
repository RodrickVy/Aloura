import { redirect, error } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/admin';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const { user } = await locals.safeGetSession();
  if (!user) throw redirect(303, '/');

  if (!(await isAdmin(locals.supabase))) throw error(404, 'Not found');

  // The admin's own account id - passed to the trend orchestrator runner.
  const { data: account } = await locals.supabase
    .from('accounts')
    .select('id')
    .eq('auth_id', user.id)
    .maybeSingle();

  // Aggregate analytics across all users
  const { data: rows } = await locals.supabase
    .from('analytics')
    .select('*');

  const totals = (rows ?? []).reduce(
    (acc, row) => ({
      sign_ups:       acc.sign_ups       + (row.sign_ups ?? 0),
      onboarded:      acc.onboarded      + (row.onboarded ?? 0),
      searches:       acc.searches       + (row.searches ?? 0),
      comparisons:    acc.comparisons    + (row.comparisons ?? 0),
      shares:         acc.shares         + (row.shares ?? 0),
      product_tracks: acc.product_tracks + (row.product_tracks ?? 0),
      fit_checks:     acc.fit_checks     + (row.fit_checks ?? 0),
      buy_clicks:     acc.buy_clicks     + (row.buy_clicks ?? 0),
      trends:         acc.trends         + (row.trends ?? 0),
    }),
    {
      sign_ups: 0, onboarded: 0, searches: 0, comparisons: 0,
      shares: 0, product_tracks: 0, fit_checks: 0, buy_clicks: 0, trends: 0,
    }
  );

  const totalUsers = (rows ?? []).length;

  // Feedback submissions
  const { data: feedback } = await locals.supabase
    .from('feedback')
    .select('*')
    .order('created_at', { ascending: false });

  return { totals, totalUsers, feedback: feedback ?? [], accountId: account?.id ?? null };
};
