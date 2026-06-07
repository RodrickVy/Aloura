-- ─────────────────────────────────────────────────────────────
--  Analytics refresh
--  New focused event set:
--    sign_ups, onboarded, searches, comparisons, shares,
--    product_tracks, fit_checks, buy_clicks
-- ─────────────────────────────────────────────────────────────

-- 1. Columns (safe to re-run). sign_ups / buy_clicks may already exist.
ALTER TABLE analytics ADD COLUMN IF NOT EXISTS sign_ups       integer NOT NULL DEFAULT 0;
ALTER TABLE analytics ADD COLUMN IF NOT EXISTS onboarded      integer NOT NULL DEFAULT 0;
ALTER TABLE analytics ADD COLUMN IF NOT EXISTS searches       integer NOT NULL DEFAULT 0;
ALTER TABLE analytics ADD COLUMN IF NOT EXISTS comparisons    integer NOT NULL DEFAULT 0;
ALTER TABLE analytics ADD COLUMN IF NOT EXISTS shares         integer NOT NULL DEFAULT 0;
ALTER TABLE analytics ADD COLUMN IF NOT EXISTS product_tracks integer NOT NULL DEFAULT 0;
ALTER TABLE analytics ADD COLUMN IF NOT EXISTS fit_checks     integer NOT NULL DEFAULT 0;
ALTER TABLE analytics ADD COLUMN IF NOT EXISTS buy_clicks     integer NOT NULL DEFAULT 0;

-- 2. Ensure one analytics row per account (needed for the upsert below).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'analytics_account_id_key') THEN
    ALTER TABLE analytics ADD CONSTRAINT analytics_account_id_key UNIQUE (account_id);
  END IF;
END $$;

-- 3. track_event - resolves the account from the session (auth.uid()),
--    so any logged-in user's action counts on any page.
CREATE OR REPLACE FUNCTION track_event(p_field text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account uuid;
BEGIN
  -- whitelist - reject anything not in the known event set
  IF p_field NOT IN (
    'sign_ups','onboarded','searches','comparisons',
    'shares','product_tracks','fit_checks','buy_clicks'
  ) THEN
    RETURN;
  END IF;

  SELECT id INTO v_account FROM accounts WHERE auth_id = auth.uid();
  IF v_account IS NULL THEN
    RETURN;   -- anonymous / no account - nothing to count
  END IF;

  INSERT INTO analytics (account_id) VALUES (v_account)
    ON CONFLICT (account_id) DO NOTHING;

  EXECUTE format('UPDATE analytics SET %I = COALESCE(%I, 0) + 1 WHERE account_id = $1', p_field, p_field)
    USING v_account;
END;
$$;

GRANT EXECUTE ON FUNCTION track_event(text) TO authenticated, anon;

-- 4. (Optional) drop the now-unused legacy columns once you're happy:
-- ALTER TABLE analytics
--   DROP COLUMN IF EXISTS mood_boards_made,
--   DROP COLUMN IF EXISTS outfit_search_hits,
--   DROP COLUMN IF EXISTS outfit_checkout_hits,
--   DROP COLUMN IF EXISTS mood_board_comparisons,
--   DROP COLUMN IF EXISTS piece_comparisons,
--   DROP COLUMN IF EXISTS report_generated,
--   DROP COLUMN IF EXISTS store_filter_used,
--   DROP COLUMN IF EXISTS fit_check_hits;
