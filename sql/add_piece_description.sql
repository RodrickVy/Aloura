-- Adds a real product description (sourced from SerpAPI, never AI-generated)
-- to each piece. Safe to run multiple times.

ALTER TABLE pieces ADD COLUMN IF NOT EXISTS description text;
