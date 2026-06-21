/**
 * outfit_store_comparer
 * Supabase Edge Function - Deno / TypeScript
 *
 * POST {
 *   account_id:    string,
 *   mood_board_id: string,
 *   store:         string,      // target store to compare at
 *   products:      Product[],   // original outfit pieces
 * }
 *
 * For each product:
 *   1. Claude Haiku extracts the product type, gender, color & key attributes
 *      and builds a precise Google Shopping query.
 *   2. SerpAPI searches for that query + target store name.
 *   3. Results are filtered to ONLY listings from the target store.
 *      If none are found → return null (no false positives).
 *   4. Store-filtered results are scored for product-type relevance.
 *   5. Best match is saved as a comparison piece and returned.
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
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
  "Access-Control-Max-Age":       "86400",
};

// ─────────────────────────────────────────────────────────────
//  TYPES
// ─────────────────────────────────────────────────────────────

interface InputProduct {
  name:            string;
  keywords:        string[];
  colors?:         string[];
  url?:            string;
  store?:          string;
  original_price?: number | null;
  description?:    string | null;
}

interface ProductAttributes {
  productType:    string;   // e.g. "hoodie", "football jersey", "chelsea boots"
  gender:         string;   // "men's" | "women's" | "kids'" | "unisex" | ""
  colors:         string[];
  keyAttributes:  string[]; // e.g. ["oversized", "zip-up", "wool"]
  searchQuery:    string;   // tight 3-6 word Google Shopping query (no store, no brand)
}

interface ComparedProduct {
  original_name:  string;
  store:          string;
  name:           string;
  price:          number | null;
  url:            string;
  image_url:      string;
  description:    string | null;
  keywords:       string[];
  colors:         string[];
  slug:           string;
  id:             string;
  original_price: number | null;
  price_delta:    number | null;
  price_verdict:  "cheaper" | "pricier" | "similar" | "unknown";
  same_store:     boolean;
  match_score:    number;
}

// ─────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function uuidSuffix(id: string): string {
  return id.replace(/-/g, "").slice(0, 8);
}
function normTitle(s: string): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const STOPWORDS = new Set([
  "the","a","an","and","for","with","from","at","in","of","to","by","is",
  "mens","womens","men","women","unisex","size","new","sale","item","product",
]);
function tokens(s: string): string[] {
  return normTitle(s).split(" ").filter(t => t.length > 2 && !STOPWORDS.has(t));
}

function overlapScore(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const setB = new Set(b);
  const hits = a.filter(t => setB.has(t)).length;
  return hits / Math.max(a.length, Math.min(b.length, a.length + 2));
}

function parsePrice(raw: unknown): number | null {
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") return parseFloat(raw.replace(/[^0-9.]/g, "")) || null;
  return null;
}

function isSameProduct(
  candidate: Record<string, unknown>,
  origUrl?: string,
  origName?: string,
): boolean {
  const candUrl  = ((candidate.link ?? candidate.product_link ?? "") as string).trim();
  const candName = normTitle(candidate.title as string);
  if (origUrl && candUrl && candUrl === origUrl.trim()) return true;
  if (origName && candName && candName === normTitle(origName)) return true;
  return false;
}

// ─────────────────────────────────────────────────────────────
//  STEP 1 — AI-powered attribute extraction & query building
// ─────────────────────────────────────────────────────────────

async function buildSearchQuery(product: InputProduct): Promise<ProductAttributes> {
  const fallback: ProductAttributes = {
    productType:   product.name,
    gender:        "",
    colors:        product.colors ?? [],
    keyAttributes: (product.keywords ?? []).slice(0, 3),
    searchQuery:   [
      product.name,
      (product.colors ?? [])[0] ?? "",
      (product.keywords ?? []).slice(0, 2).join(" "),
    ].filter(Boolean).join(" ").trim(),
  };

  if (!ANTHROPIC_API_KEY) return fallback;

  const prompt = `You are a fashion product search specialist. Analyze the product below and extract the key attributes needed to find the same product type at a different store.

Product name: ${product.name}
Keywords: ${(product.keywords ?? []).join(", ") || "none"}
Colors: ${(product.colors ?? []).join(", ") || "not specified"}
Description: ${product.description?.slice(0, 300) || "none"}

Extract and return ONLY this JSON (no markdown, no explanation):
{
  "productType": "the specific product type, e.g. hoodie, football jersey, chelsea boots, linen blazer, sports bra",
  "gender": "men's | women's | kids' | unisex | (empty string if not specified)",
  "colors": ["primary color if clearly mentioned, else empty array"],
  "keyAttributes": ["at most 2 specific descriptors like oversized, zip-up, wool, slim-fit - only if clearly stated"],
  "searchQuery": "a precise 3-6 word Google Shopping search query: gender + color + productType + 1 key attribute max. No brand names, no store names."
}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":    "application/json",
        "x-api-key":       ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:      "claude-haiku-4-5-20251001",
        max_tokens: 256,
        temperature: 0,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      console.warn(`[comparer] AI query builder HTTP ${res.status} - using fallback`);
      return fallback;
    }

    const d   = await res.json();
    const raw = (d.content?.[0]?.text ?? "")
      .replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(raw) as ProductAttributes;

    console.log(`[comparer] AI attrs for "${product.name}": type="${parsed.productType}" gender="${parsed.gender}" query="${parsed.searchQuery}"`);

    return {
      productType:   parsed.productType   ?? product.name,
      gender:        parsed.gender        ?? "",
      colors:        parsed.colors?.length ? parsed.colors : (product.colors ?? []),
      keyAttributes: parsed.keyAttributes ?? [],
      searchQuery:   parsed.searchQuery   ?? fallback.searchQuery,
    };
  } catch (e) {
    console.warn("[comparer] AI query builder parse error:", e);
    return fallback;
  }
}

// ─────────────────────────────────────────────────────────────
//  STEP 2 — SerpAPI search
// ─────────────────────────────────────────────────────────────

async function serp(query: string): Promise<Record<string, unknown>[]> {
  const url = `https://serpapi.com/search?engine=google_shopping&q=${encodeURIComponent(query)}&api_key=${SERP_API_KEY}&num=20`;
  const res = await fetch(url);
  if (!res.ok) { console.warn(`[comparer] serp HTTP ${res.status} for "${query}"`); return []; }
  const data = await res.json();
  return (data.shopping_results ?? []) as Record<string, unknown>[];
}

// Check whether a result's source field matches the intended store
function sourceMatchesStore(source: string, store: string): boolean {
  const s = source.toLowerCase().replace(/[^a-z0-9]/g, "");
  const t = store.toLowerCase().replace(/[^a-z0-9]/g, "");
  // Direct substring match in either direction (handles "H&M" ↔ "hm", "Levi's" ↔ "levis")
  return s.includes(t) || t.includes(s);
}

// ─────────────────────────────────────────────────────────────
//  STEP 3 — Find best matching product at the target store
// ─────────────────────────────────────────────────────────────

async function findBestMatch(
  product: InputProduct,
  store: string,
): Promise<Omit<ComparedProduct, "slug" | "id"> | null> {
  const origPrice = product.original_price ?? null;

  // 1. AI extracts product type, gender, color → tight search query
  const attrs = await buildSearchQuery(product);
  const { productType, gender, colors, keyAttributes, searchQuery } = attrs;

  // 2. Query chain — stop as soon as we get candidates from the target store
  const queries = [
    `${searchQuery} ${store}`.trim(),
    `${gender} ${productType} ${colors[0] ?? ""} ${store}`.replace(/\s+/g, " ").trim(),
    `${productType} ${keyAttributes[0] ?? ""} ${store}`.replace(/\s+/g, " ").trim(),
    `${product.name} ${store}`.trim(),
  ].filter((q, i, arr) => q !== store && arr.indexOf(q) === i); // deduplicate

  let results: Record<string, unknown>[] = [];
  let usedQuery = "";
  for (const q of queries) {
    const raw = await serp(q);
    if (raw.length) {
      // Immediately check if any result is from the target store before moving on
      const hasStoreHit = raw.some(r =>
        sourceMatchesStore((r.source as string) ?? "", store)
      );
      results = raw;
      usedQuery = q;
      if (hasStoreHit) break;
      // If no store hit yet, try the next query (but keep results as fallback check)
    }
  }

  if (!results.length) {
    console.warn(`[comparer] no search results for "${product.name}" @ ${store}`);
    return null;
  }

  // 3. Filter strictly to results from the target store only
  const storeResults = results.filter(r =>
    sourceMatchesStore((r.source as string) ?? "", store)
  );

  if (!storeResults.length) {
    // Target store not stocked / not on Google Shopping for this product
    console.warn(`[comparer] "${store}" has no matching listing for "${product.name}" — not returning false match`);
    return null;
  }

  console.log(`[comparer] "${product.name}" @ ${store}: ${storeResults.length} store hits from query "${usedQuery}"`);

  // 4. Score store results for product-type match
  // Reference tokens: product type + gender + colors + key attributes
  const refTokens = tokens(
    [productType, gender, ...colors, ...keyAttributes, ...( product.keywords ?? [])].join(" ")
  );

  const scored = storeResults
    .filter(r => !isSameProduct(r, product.url, product.name))
    .map(r => {
      const title = (r.title as string) ?? "";
      const price = parsePrice(r.extracted_price ?? r.price);
      const rel   = overlapScore(tokens(title), refTokens);

      // Sanity-check price against original (drop absurd mismatches)
      let priceOk = true;
      if (origPrice && price) {
        const ratio = price / origPrice;
        priceOk = ratio >= 0.15 && ratio <= 7;
      }

      return { r, title, price, rel, score: rel - (priceOk ? 0 : 0.6) };
    })
    .filter(c => c.rel >= 0.08)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) {
    console.warn(`[comparer] store results found but none relevant to "${product.name}" @ ${store}`);
    return null;
  }

  const best     = scored[0];
  const hit      = best.r;
  const price    = best.price;
  const storeName = (hit.source as string) ?? store;

  const exts = Array.isArray(hit.extensions)
    ? (hit.extensions as string[]).join(" · ")
    : "";
  const description =
    (typeof hit.snippet === "string" && hit.snippet.trim())     ? hit.snippet.trim()
    : (typeof hit.description === "string" && hit.description.trim()) ? hit.description.trim()
    : (exts.trim() || null);

  const delta: number | null =
    origPrice != null && price != null ? +(price - origPrice).toFixed(2) : null;
  const verdict: ComparedProduct["price_verdict"] =
    delta == null ? "unknown"
    : delta < -1  ? "cheaper"
    : delta >  1  ? "pricier"
    : "similar";

  console.log(
    `[comparer] ✓ MATCH "${best.title.slice(0, 55)}" @ ${storeName}` +
    ` | $${price} | rel=${best.rel.toFixed(2)} | ${verdict}`
  );

  return {
    original_name:  product.name,
    store:          storeName,
    name:           (hit.title as string) ?? product.name,
    price,
    url:            (hit.link as string) ?? (hit.product_link as string) ?? "#",
    image_url:      (hit.thumbnail as string) ?? "",
    description,
    keywords:       product.keywords,
    colors,
    original_price: origPrice,
    price_delta:    delta,
    price_verdict:  verdict,
    same_store:     true, // always true — we only return confirmed store matches
    match_score:    +best.rel.toFixed(2),
  };
}

// ─────────────────────────────────────────────────────────────
//  STEP 4 — AI SEO slugs
// ─────────────────────────────────────────────────────────────

async function generateSlugs(
  products: Omit<ComparedProduct, "slug" | "id">[],
  pieceIds: string[],
  store: string,
): Promise<string[]> {
  const fallback = () => products.map((p, i) =>
    slugify(`${p.store} ${p.name}`.slice(0, 60)) + "-" + uuidSuffix(pieceIds[i] ?? String(i)));

  if (!ANTHROPIC_API_KEY) return fallback();

  const context = products.map((p, i) => ({
    index: i, store: p.store, name: p.name, keywords: p.keywords, price: p.price,
  }));

  const prompt = `You are an SEO expert for a fashion e-commerce platform.
Generate URL slugs for product comparison pages optimised for Google search ranking.

RULES:
- Lowercase, hyphens only, no special characters
- Must include: store/brand name + product type + key color or material + fit or style detail
- Max 8 words per slug
- No filler: "the", "a", "and", "for", "with", "from", "at"
- Every slug must be unique
- These are price comparison results from: ${store}

PRODUCTS (${context.length} total):
${JSON.stringify(context, null, 2)}

Return ONLY a JSON array of ${context.length} slug strings — no markdown:
["store-product-color-fit", "..."]`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":    "application/json",
        "x-api-key":       ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        temperature: 0.2,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) { console.warn(`[slugs] Claude ${res.status} - fallback`); return fallback(); }

    const d   = await res.json();
    const raw = (d.content?.[0]?.text ?? "")
      .replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(raw) as string[];
    const slugs  = parsed.map((s, i) =>
      slugify(s) + "-" + uuidSuffix(pieceIds[i] ?? String(i)));

    while (slugs.length < products.length) {
      const i = slugs.length;
      slugs.push(
        slugify(`${products[i]?.store ?? "item"} ${products[i]?.name ?? "piece"}`.slice(0, 60))
        + "-" + uuidSuffix(pieceIds[i] ?? String(i))
      );
    }
    return slugs;
  } catch {
    console.warn("[slugs] non-JSON from Claude - fallback");
    return fallback();
  }
}

// ─────────────────────────────────────────────────────────────
//  MAIN
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

    if (!account_id)       throw new Error("account_id required");
    if (!mood_board_id)    throw new Error("mood_board_id required");
    if (!store)            throw new Error("store required");
    if (!products?.length) throw new Error("products array required");

    console.log(`[comparer] account=${account_id} board=${mood_board_id} store="${store}" products=${products.length}`);

    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Search all products in parallel (AI query build + SERP each product)
    const matches = await Promise.all(
      products.slice(0, 7).map(p => findBestMatch(p, store))
    );
    const found = matches.filter(Boolean) as Omit<ComparedProduct, "slug" | "id">[];
    console.log(`[comparer] matched ${found.length}/${products.length} confirmed at "${store}"`);

    if (!found.length) {
      return new Response(
        JSON.stringify({ success: true, store, count: 0, products: products.map(() => null) }),
        { headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // Insert confirmed matches as pieces
    const pieceRows = found.map(p => ({
      mood_board_id,
      name: p.name, title: p.name, price: p.price,
      url: p.url, image_url: p.image_url, colors: p.colors,
      style: `${store} comparison`, description: p.description,
      store: p.store, keywords: p.keywords,
    }));

    const { data: insertedPieces, error: pErr } = await db
      .from("pieces").insert(pieceRows).select("id");
    if (pErr) throw new Error(`Pieces insert: ${pErr.message}`);

    const pieceIds = (insertedPieces ?? []).map(p => p.id as string);

    // AI SEO slugs
    const slugs = await generateSlugs(found, pieceIds, store);
    await Promise.all(
      pieceIds.map((id, i) => db.from("pieces").update({ slug: slugs[i] }).eq("id", id))
    );

    // Rebuild preserving original product order
    let fi = 0;
    const ordered = matches.map(m => {
      if (!m) return null;
      const id = pieceIds[fi]; const slug = slugs[fi]; fi++;
      return { ...m, id, slug } as ComparedProduct;
    });

    return new Response(
      JSON.stringify({ success: true, store, count: found.length, products: ordered }),
      { headers: { ...CORS, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[comparer] Fatal:", msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});
