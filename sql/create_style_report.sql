-- ─────────────────────────────────────────────────────────────
--  Paid Style Report ($1.22) - dedicated tables, separate from the
--  existing style_reports table.
--    style_report          : the questionnaire answers + generated analysis
--    style_report_payment  : the payment record that unlocks viewing
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS style_report (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      uuid REFERENCES accounts(id) ON DELETE CASCADE,

  -- Questionnaire answers
  gender          text,                 -- mens | womens (their pick)
  height_cm       integer,
  vibe            text,                 -- bold | neutral | calm
  occasions       text[],               -- where they dress for (college, work, outdoors…)
  goal            text,                 -- what comes to mind when they dress
  selected_styles text[],               -- styles that resonate (from the ~25)

  -- Uploaded photos (storage paths / signed-url sources)
  close_up_url    text,
  full_body_url   text,

  -- Generated analysis
  skin_tone       text,
  undertone       text,
  face_shape      text,
  color_sets      jsonb,                -- [{ label, colors:[hex,hex,hex], note }]
  avoid_colors    jsonb,                -- { colors:[hex,hex,hex], note }
  accessories     jsonb,                -- { metals, chains, earrings, note }
  frames          jsonb,                -- { shapes:[...], note }
  recommended_styles text[],            -- which of the styles suit them
  signature_style text,
  summary         text,

  status          text NOT NULL DEFAULT 'generating',  -- generating | ready | failed
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS style_report_account_idx ON style_report (account_id);

CREATE TABLE IF NOT EXISTS style_report_payment (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  style_report_id uuid REFERENCES style_report(id) ON DELETE CASCADE,
  account_id      uuid REFERENCES accounts(id) ON DELETE CASCADE,
  amount_cents    integer NOT NULL DEFAULT 122,
  currency        text NOT NULL DEFAULT 'usd',
  status          text NOT NULL DEFAULT 'paid',  -- paid (stub) | pending | failed
  provider        text NOT NULL DEFAULT 'stub',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS style_report_payment_report_idx ON style_report_payment (style_report_id);

-- ── RLS: a user owns their own reports + payments ──
ALTER TABLE style_report         ENABLE ROW LEVEL SECURITY;
ALTER TABLE style_report_payment ENABLE ROW LEVEL SECURITY;

-- Helper expression: the caller's account id(s).
-- (Policies use a subquery against accounts so we don't need a separate function.)

DROP POLICY IF EXISTS "style_report owner all" ON style_report;
CREATE POLICY "style_report owner all" ON style_report
  FOR ALL TO authenticated
  USING      (account_id IN (SELECT id FROM accounts WHERE auth_id = auth.uid()))
  WITH CHECK (account_id IN (SELECT id FROM accounts WHERE auth_id = auth.uid()));

DROP POLICY IF EXISTS "style_report_payment owner read" ON style_report_payment;
CREATE POLICY "style_report_payment owner read" ON style_report_payment
  FOR SELECT TO authenticated
  USING (account_id IN (SELECT id FROM accounts WHERE auth_id = auth.uid()));

DROP POLICY IF EXISTS "style_report_payment owner insert" ON style_report_payment;
CREATE POLICY "style_report_payment owner insert" ON style_report_payment
  FOR INSERT TO authenticated
  WITH CHECK (account_id IN (SELECT id FROM accounts WHERE auth_id = auth.uid()));

-- NOTE: the style_report_creator edge function runs with the service role,
-- which bypasses RLS, so it can write the generated analysis fields freely.
