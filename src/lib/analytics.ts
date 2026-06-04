/**
 * analytics.ts
 * Fire-and-forget analytics helpers.
 * These NEVER block the UI — errors are swallowed silently.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

type AnalyticsField =
  | 'sign_ups'
  | 'mood_boards_made'
  | 'fit_check_hits'
  | 'outfit_search_hits'
  | 'outfit_checkout_hits'
  | 'mood_board_comparisons'
  | 'buy_clicks'
  | 'piece_comparisons'
  | 'report_generated'
  | 'store_filter_used';

/**
 * Increment a single analytics counter for a user.
 * Completely non-blocking — call without await.
 */
export function track(
  supabase: SupabaseClient,
  accountId: string | null | undefined,
  field: AnalyticsField,
): void {
  if (!accountId) return;
  // fire-and-forget — swallow both fulfilled and rejected outcomes
  supabase
    .rpc('increment_analytics', { p_account_id: accountId, p_field: field })
    .then(() => {}, () => {});
}
