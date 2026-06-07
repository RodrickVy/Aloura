-- ─────────────────────────────────────────────────────────────
--  Self-contained analytics setup. Safe to re-run.
--  Ensures every counter column, the unique constraint, and the
--  track_event RPC all exist and match what the client calls.
-- ─────────────────────────────────────────────────────────────

-- 1. All counter columns (no-ops if they already exist).
ALTER TABLE analytics ADD COLUMN IF NOT EXISTS sign_ups       integer NOT NULL DEFAULT 0;
ALTER TABLE analytics ADD COLUMN IF NOT EXISTS onboarded      integer NOT NULL DEFAULT 0;
ALTER TABLE analytics ADD COLUMN IF NOT EXISTS searches       integer NOT NULL DEFAULT 0;
ALTER TABLE analytics ADD COLUMN IF NOT EXISTS comparisons    integer NOT NULL DEFAULT 0;
ALTER TABLE analytics ADD COLUMN IF NOT EXISTS shares         integer NOT NULL DEFAULT 0;
ALTER TABLE analytics ADD COLUMN IF NOT EXISTS product_tracks integer NOT NULL DEFAULT 0;
ALTER TABLE analytics ADD COLUMN IF NOT EXISTS fit_checks     integer NOT NULL DEFAULT 0;
ALTER TABLE analytics ADD COLUMN IF NOT EXISTS buy_clicks     integer NOT NULL DEFAULT 0;
ALTER TABLE analytics ADD COLUMN IF NOT EXISTS trends         integer NOT NULL DEFAULT 0;

-- 2. One analytics row per account (required for the upsert in track_event).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'analytics_account_id_key') THEN
    ALTER TABLE analytics ADD CONSTRAINT analytics_account_id_key UNIQUE (account_id);
  END IF;
END $$;

-- 3. Drop any older versions to avoid signature/overload conflicts (the
--    source of the 400), then create the canonical one.
DROP FUNCTION IF EXISTS track_event(text);

CREATE FUNCTION track_event(p_field text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account uuid;
BEGIN
  IF p_field NOT IN (
    'sign_ups','onboarded','searches','comparisons',
    'shares','product_tracks','fit_checks','buy_clicks','trends'
  ) THEN
    RETURN;
  END IF;

  SELECT id INTO v_account FROM accounts WHERE auth_id = auth.uid();
  IF v_account IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO analytics (account_id) VALUES (v_account)
    ON CONFLICT (account_id) DO NOTHING;

  EXECUTE format('UPDATE analytics SET %I = COALESCE(%I, 0) + 1 WHERE account_id = $1', p_field, p_field)
    USING v_account;
END;
$$;

GRANT EXECUTE ON FUNCTION track_event(text) TO authenticated, anon;
