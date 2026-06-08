-- Early-access / waitlist email capture (home page).
-- Measures concept interest independent of whether the product is fully working.

CREATE TABLE IF NOT EXISTS waitlist (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text NOT NULL,
  source     text,                       -- where they signed up from, e.g. "home"
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One row per email (a repeat submit is treated as success in the UI).
CREATE UNIQUE INDEX IF NOT EXISTS waitlist_email_key ON waitlist (lower(email));

ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

-- Anyone (logged out included) may add themselves; nobody can read the list
-- from the client (only the service role / dashboard can).
DROP POLICY IF EXISTS "waitlist insert" ON waitlist;
CREATE POLICY "waitlist insert" ON waitlist FOR INSERT TO anon, authenticated WITH CHECK (true);
