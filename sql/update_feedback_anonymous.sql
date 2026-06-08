-- Make feedback fully anonymous (no sign-up required) and add a source tag.
-- Safe to re-run.

-- 1. account_id becomes optional (anonymous submissions store null).
ALTER TABLE feedback ALTER COLUMN account_id DROP NOT NULL;

-- 2. Optional: where the feedback came from ("footer" | "feedback_page").
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS source text;

-- 3. Allow anyone (logged out included) to submit feedback.
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feedback anon insert" ON feedback;
CREATE POLICY "feedback anon insert" ON feedback
  FOR INSERT TO anon, authenticated WITH CHECK (true);

-- 4. Keep the /analytics page able to read feedback (admins only).
--    Uses your existing is_current_user_admin() helper so enabling RLS
--    above doesn't accidentally hide feedback from the analytics page.
DROP POLICY IF EXISTS "feedback admin read" ON feedback;
CREATE POLICY "feedback admin read" ON feedback
  FOR SELECT TO authenticated USING (is_current_user_admin());

