import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const { user } = await locals.safeGetSession();
  if (!user) throw redirect(303, '/');

  // Aggregate analytics across all users
  const { data: rows } = await locals.supabase
    .from('analytics')
    .select('*');

  const totals = (rows ?? []).reduce(
    (acc, row) => ({
      sign_ups:                acc.sign_ups                + (row.sign_ups ?? 0),
      mood_boards_made:        acc.mood_boards_made        + (row.mood_boards_made ?? 0),
      fit_check_hits:          acc.fit_check_hits          + (row.fit_check_hits ?? 0),
      outfit_search_hits:      acc.outfit_search_hits      + (row.outfit_search_hits ?? 0),
      outfit_checkout_hits:    acc.outfit_checkout_hits    + (row.outfit_checkout_hits ?? 0),
      mood_board_comparisons:  acc.mood_board_comparisons  + (row.mood_board_comparisons ?? 0),
      buy_clicks:              acc.buy_clicks              + (row.buy_clicks ?? 0),
      piece_comparisons:       acc.piece_comparisons       + (row.piece_comparisons ?? 0),
      report_generated:        acc.report_generated        + (row.report_generated ?? 0),
      store_filter_used:       acc.store_filter_used       + (row.store_filter_used ?? 0),
    }),
    {
      sign_ups: 0, mood_boards_made: 0, fit_check_hits: 0,
      outfit_search_hits: 0, outfit_checkout_hits: 0,
      mood_board_comparisons: 0, buy_clicks: 0,
      piece_comparisons: 0, report_generated: 0, store_filter_used: 0,
    }
  );

  const totalUsers = (rows ?? []).length;

  // Feedback submissions
  const { data: feedback } = await locals.supabase
    .from('feedback')
    .select('*')
    .order('created_at', { ascending: false });

  return { totals, totalUsers, feedback: feedback ?? [] };
};
