/**
 * outfit_store_comparer
 * Supabase Edge Function — Deno / TypeScript
 *
 * POST {
 *   account_id:    string,
 *   mood_board_id: string,      // board these pieces belong to
 *   store:         string,      // target store to compare at
 *   products:      Product[],   // original outfit pieces
 * }
 *
 * For each product, searches Google Shopping at the given store,
 * generates SEO slugs, saves pieces to DB, and returns full payload.
 *
 * Secrets: SERP_API_KEY, ANTHROPIC_API_KEY
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")               ?? "";
const SERVICE_ROLE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")  ?? "";
const SERP_API_KEY      = Deno.env.get("SERP_API_KEY")               ?? "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")          ?? "";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─────────────────────────────────────────────────────────────
//  TYPES
// ─────────────────────────────────────────────────────────────

interface InputProduct {
  name:     string;
  keywords: string[];
  colors?:  string[];
}

interface ComparedProduct {
  original_name: string;
  store:         string;
  name:          string;
  price:         number | null;
  url:           string;
  image_url:     string;
  keywords:      string[];
  colors:        string[];
  slug:          string;
  id:            string;
}

// ─────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function uuidSuffix(id: string): string {
  return id.replace(/-/g, "").slice(0, 8);
}

// ─────────────────────────────────────────────────────────────
//  STEP 1 — Google Shopping search for one product
// ─────────────────────────────────────────────────────────────

async function searchStoreForProduct(
  product: InputProduct,
  store: string,
): Promise<Omit<ComparedProduct, "slug" | "id"> | null> {
  const coreTerms = product.keywords.slice(0, 3).join(" ");
  const q         = `${coreTerms} ${store}`.trim();
  const url       = `https://serpapi.com/search?engine=google_shopping&q=${encodeURIComponent(q)}&api_key=${SERP_API_KEY}`;

  console.log(`[comparer] "${product.name}" at ${store}: query="${q}"`);

  const res = await fetch(url);
  if (!res.ok) { console.warn(`[comparer] HTTP ${res.status}`); return null; }

  const data    = await res.json();
  const results = (data.shopping_results ?? []) as Record<string, unknown>[];
  if (!results.length) { console.warn(`[comparer] No results`); return null; }

  // Prefer results from the target store
  const storeMatch = results.find(r =>
    typeof r.source === "string" &&
    r.source.toLowerCase().includes(store.toLowerCase())
  );
  const hit = storeMatch ?? results[0];

  const priceRaw = hit.extracted_price ?? hit.price;
  const price    = typeof priceRaw === "number" ? priceRaw
    : typeof priceRaw === "string" ? parseFloat((priceRaw as string).replace(/[^0-9.]/g, "")) || null
    : null;

  const storeName = (hit.source as string) ?? store;
  console.log(`[comparer] Found: "${(hit.title as string)?.slice(0, 40)}" at ${storeName} | $${price}`);

  return {
    original_name: product.name,
    store:         storeName,
    name:          (hit.title as string) ?? product.name,
    price,
    url:           (hit.link as string) ?? "#",
    image_url:     (hit.thumbnail as string) ?? "",
    keywords:      product.keywords,
    colors:        product.colors ?? [],
  };
}

// ─────────────────────────────────────────────────────────────
//  STEP 2 — Generate SEO slugs via Claude (single call)
// ─────────────────────────────────────────────────────────────

async function generateSlugs(
  products: Omit<ComparedProduct, "slug" | "id">[],
  pieceIds: string[],
  store: string,
): Promise<string[]> {
  const context = products.map((p, i) => ({
    index:    i,
    store:    p.store,
    name:     p.name,
    keywords: p.keywords,
    price:    p.price,
  }));

  const prompt = `You are an SEO expert for a fashion e-commerce platform.
Generate URL slugs for product comparison pages — optimised for Google search ranking.

RULES:
- Lowercase, hyphens only, no special characters
- MUST include store/brand name + product type + key color or material + fit or style detail
- Max 8 words per slug
- No filler words: "the", "a", "and", "for", "with", "from", "at"
- Every slug must be unique
- These are price comparison results from: ${store}

PRODUCTS (${context.length} total):
${JSON.stringify(context, null, 2)}

Return ONLY a JSON array of ${context.length} slug strings in order — no markdown, no explanation:
["store-product-color-fit", "..."]`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type":      "application/json",
      "x-api-key":         ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model:       "claude-opus-4-5",
      max_tokens:  512,
      temperature: 0.2,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  // Fallback: rule-based slugs
  const fallback = () => products.map((p, i) =>
    slugify(`${p.store} ${p.name}`.slice(0, 60)) + "-" + uuidSuffix(pieceIds[i])
  );

  if (!res.ok) {
    console.warn(`[slugs] Claude ${res.status} — using fallback`);
    return fallback();
  }

  const d   = await res.json();
  const raw = (d.content?.[0]?.text ?? "").replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  try {
    const parsed = JSON.parse(raw) as string[];
    const slugs  = parsed.map((s, i) =>
      slugify(s) + "-" + uuidSuffix(pieceIds[i] ?? i.toString())
    );

    // Pad if short
    while (slugs.length < products.length) {
      const i = slugs.length;
      slugs.push(
        slugify(`${products[i]?.store ?? "item"} ${products[i]?.name ?? "piece"}`.slice(0, 60))
        + "-" + uuidSuffix(pieceIds[i] ?? i.toString())
      );
    }

    slugs.forEach((s, i) => console.log(`[slugs] Piece ${i}: ${s}`));
    return slugs;
  } catch {
    console.warn("[slugs] Non-JSON from Claude — using fallback");
    return fallback();
  }
}

// ─────────────────────────────────────────────────────────────
//  MAIN HANDLER
// ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { account_id, mood_board_id, store, products } = await req.json() as {
      account_id:    string;
      mood_board_id: string;
      store:         string;
      products:      InputProduct[];
    };
    if (!account_id)    throw new Error("account_id required");
    if (!mood_board_id) throw new Error("mood_board_id required");
    if (!store)         throw new Error("store required");
    if (!products?.length) throw new Error("products array required");

    console.log(`[comparer] account=${account_id} board=${mood_board_id} store="${store}" products=${products.length}`);

    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    // ── Search Google Shopping for each product ───────────────
    const found: Omit<ComparedProduct, "slug" | "id">[] = [];
    const nullMap: boolean[] = [];   // track which positions had no result

    for (const product of products.slice(0, 7)) {
      const result = await searchStoreForProduct(product, store);
      nullMap.push(result === null);
      if (result) found.push(result);
      await new Promise(r => setTimeout(r, 250));
    }

    console.log(`[comparer] Found ${found.length}/${products.length} alternatives at ${store}`);

    if (!found.length) {
      return new Response(JSON.stringify({
        success: true,
        store,
        count:    0,
        products: products.map(() => null),
      }), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // ── Insert pieces to get real UUIDs ───────────────────────
    const pieceRows = found.map(p => ({
      mood_board_id,
      name:      p.name,
      title:     p.name,
      price:     p.price,
      url:       p.url,
      image_url: p.image_url,
      colors:    p.colors,
      style:     `${store} comparison`,  // occasion context
      store:     p.store,                // brand/retailer
      keywords:  p.keywords,
    }));

    const { data: insertedPieces, error: pErr } = await db
      .from("pieces")
      .insert(pieceRows)
      .select("id");

    if (pErr) throw new Error(`Pieces insert: ${pErr.message}`);

    const pieceIds = (insertedPieces ?? []).map(p => p.id as string);
    console.log(`[comparer] ${pieceIds.length} pieces inserted`);

    // ── Generate AI SEO slugs ─────────────────────────────────
    console.log("[comparer] Generating SEO slugs…");
    const slugs = await generateSlugs(found, pieceIds, store);

    // Update each piece with its slug
    await Promise.all(
      pieceIds.map((id, i) =>
        db.from("pieces").update({ slug: slugs[i] }).eq("id", id)
      )
    );
    console.log("[comparer] Slugs applied ✓");

    // ── Build final result preserving original order ──────────
    let foundIdx = 0;
    const orderedResults = nullMap.map(wasNull => {
      if (wasNull) return null;
      const p    = found[foundIdx];
      const id   = pieceIds[foundIdx];
      const slug = slugs[foundIdx];
      foundIdx++;
      return { ...p, id, slug } as ComparedProduct;
    });

    return new Response(
      JSON.stringify({
        success:  true,
        store,
        count:    found.length,
        products: orderedResults,   // null where not found — preserves original order
      }),
      { headers: { ...CORS, "Content-Type": "application/json" } },
    );

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[comparer] Fatal:", msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
});
