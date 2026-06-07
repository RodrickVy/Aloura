-- Trending outfits are just regular public mood_boards in the "trending"
-- category. No dedicated trends table - the /trending page reads them
-- straight from mood_boards (WHERE category = 'trending').

-- Register the "trending" category in the regular categories table.
INSERT INTO categories (name) VALUES ('trending') ON CONFLICT (name) DO NOTHING;
