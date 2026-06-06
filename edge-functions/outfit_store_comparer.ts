/**
 * outfit_store_comparer
 * Supabase Edge Function - Deno / TypeScript
 *
 * POST {
 *   account_id:    string,
 *   mood_board_id: string,      // board these pieces belong to
 *   store:         string,      // target store to compare at
 *   products:      Product[],   // original outfit pieces
 * }
 *
 * For each product, searches Google Shopping at the given store, scores the
 * candidates for same-item relevance, picks the best match, computes price
 * savings vs the original, generates AI SEO slugs, saves pieces to DB, and
 * returns a full order-preserving payload.
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
  url?:            string;   // original product url - used to exclude the same listing
  store?:          string;   // original store - deprioritise matches from the same store
  original_price?: number | null;  // for savings calculation
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
  // price intelligence
  original_price: number | null;
  price_delta:    number | null;          // candidate - original (negative = cheaper)
  price_verdict:  "cheaper" | "pricier" | "similar" | "unknown";
  same_store:     boolean;                 // true if best match was from the requested store
  match_score:    number;                  // 0..1 relevance
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

const STOPWORDS = new Set(["the","a","and","for","with","from","at","in","of","to","mens","womens","men","women","unisex","size"]);
function tokens(s: string): string[] {
  return normTitle(s).split(" ").filter(t => t.length > 2 && !STOPWORDS.has(t));
}

/** Overlap of two token sets, 0..1. */
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

/** True if two products are effectively the same listing (exclude self). */
function isSameProduct(candidate: Record<string, unknown>, origUrl?: string, origName?: string): boolean {
  const candUrl  = ((candidate.link as string) ?? (candidate.product_link as string) ?? "").trim();
  const candName = normTitle(candidate.title as string);
  if (origUrl && candUrl && candUrl === origUrl.trim()) return true;
  if (origName && candName && candName === normTitle(origName)) return true;
  return false;
}

// ─────────────────────────────────────────────────────────────
//  SERP - one query
// ─────────────────────────────────────────────────────────────

async function serp(query: string): Promise<Record<string, unknown>[]> {
  const url = `https://serpapi.com/search?engine=google_shopping&q=${encodeURIComponent(query)}&api_key=${SERP_API_KEY}&num=20`;
  const res = await fetch(url);
  if (!res.ok) { console.warn(`[comparer] serp HTTP ${res.status} for "${query}"`); return []; }
  const data = await res.json();
  return (data.shopping_results ?? []) as Record<string, unknown>[];
}

// ─────────────────────────────────────────────────────────────
//  STEP 1 - find the best same-item match at a store
// ─────────────────────────────────────────────────────────────

async function findBestMatch(
  product: InputProduct,
  store: string,
): Promise<Omit<ComparedProduct, "slug" | "id"> | null> {
  const color     = (product.colors ?? [])[0] ?? "";
  const kw        = product.keywords.slice(0, 4).join(" ");
  const origPrice = product.original_price ?? null;

  // Reference tokens describing the original item (name + keywords + colour)
  const refTokens = tokens(`${product.name} ${product.keywords.join(" ")} ${color}`);

  // Fallback query chain - stop as soon as one yields candidates
  const queries = [
    `${color} ${kw} ${store}`.trim(),
    `${product.name} ${store}`.trim(),
    `${color} ${kw}`.trim(),          // no store - we store-filter / score below
  ];

  let results: Record<string, unknown>[] = [];
  for (const q of queries) {
    results = await serp(q);
    if (results.length) { console.log(`[comparer] "${product.name}" @ ${store}: hit on "${q}" (${results.length})`); break; }
  }
  if (!results.length) { console.warn(`[comparer] no results for "${product.name}" @ ${store}`); return null; }

  const origStore = (product.store ?? "").toLowerCase();
  const wantStore = store.toLowerCase();

  // Build scored candidates (exclude the exact same listing)
  const scored = results
    .filter(r => !isSameProduct(r, product.url, product.name))
    .map(r => {
      const title  = (r.title as string) ?? "";
      const src    = typeof r.source === "string" ? (r.source as string).toLowerCase() : "";
      const price  = parsePrice(r.extracted_price ?? r.price);
      const rel    = overlapScore(tokens(title), refTokens);            // 0..1 same-item relevance
      const storeMatch = wantStore && src.includes(wantStore) ? 1 : 0;  // from requested store?
      const sameOrig   = origStore && src.includes(origStore) ? 1 : 0;  // from original store (avoid)

      // Price sanity vs original (drop absurd mismatches: <0.2x or >5x)
      let priceOk = true;
      if (origPrice && price) { const ratio = price / origPrice; priceOk = ratio >= 0.2 && ratio <= 5; }

      // Composite score: relevance dominates, store match is a strong bonus
      const score = rel * 0.7 + storeMatch * 0.3 - sameOrig * 0.4 - (priceOk ? 0 : 0.5);
      return { r, title, src, price, rel, storeMatch, score };
    })
    // need at least a little relevance to count as the "same item"
    .filter(c => c.rel >= 0.15)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) { console.warn(`[comparer] no relevant candidate for "${product.name}" @ ${store}`); return null; }

  // Prefer a store match if any cleared the bar; else best overall (closest from any store)
  const best = scored.find(c => c.storeMatch === 1) ?? scored[0];
  const hit  = best.r;

  const price     = best.price;
  const storeName = (hit.source as string) ?? store;
  const delta     = (origPrice != null && price != null) ? +(price - origPrice).toFixed(2) : null;
  const verdict: ComparedProduct["price_verdict"] =
    delta == null ? "unknown" :
    delta < -1     ? "cheaper" :
    delta >  1     ? "pricier" : "similar";

  console.log(`[comparer] best: "${best.title.slice(0,40)}" @ ${storeName} | $${price} | rel=${best.rel.toFixed(2)} | ${verdict}`);

  return {
    original_name:  product.name,
    store:          storeName,
    name:           (hit.title as string) ?? product.name,
    price,
    url:            (hit.link as string) ?? (hit.product_link as string) ?? "#",
    image_url:      (hit.thumbnail as string) ?? "",
    keywords:       product.keywords,
    colors:         product.colors ?? [],
    original_price: origPrice,
    price_delta:    delta,
    price_verdict:  verdict,
    same_store:     best.storeMatch === 1,
    match_score:    +best.rel.toFixed(2),
  };
}

// ─────────────────────────────────────────────────────────────
//  STEP 2 - AI SEO slugs (single Claude call)
// ─────────────────────────────────────────────────────────────

async function generateSlugs(
  products: Omit<ComparedProduct, "slug" | "id">[],
  pieceIds: string[],
  store: string,
): Promise<string[]> {
  const fallback = () => products.map((p, i) =>
    slugify(`${p.store} ${p.name}`.slice(0, 60)) + "-" + uuidSuffix(pieceIds[i] ?? i.toString()));

  if (!ANTHROPIC_API_KEY) return fallback();

  const context = products.map((p, i) => ({ index: i, store: p.store, name: p.name, keywords: p.keywords, price: p.price }));
  const prompt = `You are an SEO expert for a fashion e-commerce platform.
Generate URL slugs for product comparison pages - optimised for Google search ranking.

RULES:
- Lowercase, hyphens only, no special characters
- MUST include store/brand name + product type + key color or material + fit or style detail
- Max 8 words per slug
- No filler words: "the", "a", "and", "for", "with", "from", "at"
- Every slug must be unique
- These are price comparison results from: ${store}

PRODUCTS (${context.length} total):
${JSON.stringify(context, null, 2)}

Return ONLY a JSON array of ${context.length} slug strings in order - no markdown:
["store-product-color-fit", "..."]`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-opus-4-5", max_tokens: 512, temperature: 0.2, messages: [{ role: "user", content: prompt }] }),
    });
    if (!res.ok) { console.warn(`[slugs] Claude ${res.status} - fallback`); return fallback(); }
    const d   = await res.json();
    const raw = (d.content?.[0]?.text ?? "").replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(raw) as string[];
    const slugs  = parsed.map((s, i) => slugify(s) + "-" + uuidSuffix(pieceIds[i] ?? i.toString()));
    while (slugs.length < products.length) {
      const i = slugs.length;
      slugs.push(slugify(`${products[i]?.store ?? "item"} ${products[i]?.name ?? "piece"}`.slice(0, 60)) + "-" + uuidSuffix(pieceIds[i] ?? i.toString()));
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
      account_id: string; mood_board_id: string; store: string; products: InputProduct[];
    };
    if (!account_id)       throw new Error("account_id required");
    if (!mood_board_id)    throw new Error("mood_board_id required");
    if (!store)            throw new Error("store required");
    if (!products?.length) throw new Error("products array required");

    console.log(`[comparer] account=${account_id} board=${mood_board_id} store="${store}" products=${products.length}`);
    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    // ── Search all products in PARALLEL (no more sequential sleeps) ──
    const matches = await Promise.all(products.slice(0, 7).map(p => findBestMatch(p, store)));
    const found   = matches.filter(Boolean) as Omit<ComparedProduct, "slug" | "id">[];
    console.log(`[comparer] matched ${found.length}/${products.length} at ${store}`);

    if (!found.length) {
      return new Response(JSON.stringify({ success: true, store, count: 0, products: products.map(() => null) }),
        { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // ── Insert only the good matches ──
    const pieceRows = found.map(p => ({
      mood_board_id,
      name: p.name, title: p.name, price: p.price,
      url: p.url, image_url: p.image_url, colors: p.colors,
      style: `${store} comparison`, store: p.store, keywords: p.keywords,
    }));
    const { data: insertedPieces, error: pErr } = await db.from("pieces").insert(pieceRows).select("id");
    if (pErr) throw new Error(`Pieces insert: ${pErr.message}`);
    const pieceIds = (insertedPieces ?? []).map(p => p.id as string);

    // ── AI SEO slugs ──
    const slugs = await generateSlugs(found, pieceIds, store);
    await Promise.all(pieceIds.map((id, i) => db.from("pieces").update({ slug: slugs[i] }).eq("id", id)));

    // ── Rebuild result preserving original product order ──
    let fi = 0;
    const ordered = matches.map(m => {
      if (!m) return null;
      const id = pieceIds[fi]; const slug = slugs[fi]; fi++;
      return { ...m, id, slug } as ComparedProduct;
    });

    return new Response(JSON.stringify({ success: true, store, count: found.length, products: ordered }),
      { headers: { ...CORS, "Content-Type": "application/json" } });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[comparer] Fatal:", msg);
    return new Response(JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
