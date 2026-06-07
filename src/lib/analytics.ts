/**
 * analytics.ts
 * Fire-and-forget analytics helpers.
 * These NEVER block the UI - errors are swallowed silently.
 *
 * The account is resolved server-side from auth.uid() inside the
 * `track_event` RPC, so any logged-in user's action counts on any page
 * (including the public outfit/product pages) without passing an id.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type AnalyticsField =
  | 'sign_ups'        // someone creates an account
  | 'onboarded'       // someone completes the onboarding steps
  | 'searches'        // someone runs an outfit / product search
  | 'comparisons'     // someone compares a board or product across stores
  | 'shares'          // someone shares a board or product
  | 'product_tracks'  // someone taps "Track price" on a product/board
  | 'fit_checks'      // someone opens / attempts a Fit Check
  | 'buy_clicks'      // someone clicks through to buy
  | 'trends';         // someone opens /trending or clicks a trending board

/**
 * Increment a single analytics counter for the current user.
 * Completely non-blocking - call without await.
 *
 * The second arg is kept for backwards compatibility with existing call
 * sites but is no longer used - the account is derived from the session.
 */
export function track(
  supabase: SupabaseClient,
  _accountId: string | null | undefined,
  field: AnalyticsField,
): void {
  // fire-and-forget - swallow both fulfilled and rejected outcomes
  supabase
    .rpc('track_event', { p_field: field })
    .then(() => {}, () => {});
}
