-- Trending PRODUCTS (individual items), split by category + gender.
-- Each row references a real `pieces` row (so the product page + comparison
-- work), with denormalised fields for fast rendering on /trending.

CREATE TABLE IF NOT EXISTS trending_products (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category    text NOT NULL,                 -- streetwear | nike-tech | grunge | ...
  gender      text NOT NULL,                 -- mens | womens
  piece_id    uuid REFERENCES pieces(id) ON DELETE CASCADE,
  slug        text,                          -- piece slug -> /outfit/product/[slug]
  name        text,
  image_url   text,
  price       numeric,
  store       text,
  rank        integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trending_products_cat_idx ON trending_products (category, gender);

ALTER TABLE trending_products ENABLE ROW LEVEL SECURITY;

-- Public read (the trending page is public). Writes happen via the service
-- role inside the trend_orchestrator edge function.
DROP POLICY IF EXISTS "trending_products public read" ON trending_products;
CREATE POLICY "trending_products public read" ON trending_products FOR SELECT USING (true);
