/**
 * trend_orchestrator
 * Supabase Edge Function - Deno / TypeScript
 *
 * POST { account_id: string, category: string, topic?: string }
 *
 * Generates TRENDING PRODUCTS (individual items) for a category, split into
 * men's and women's:
 *   1. Fans out to the 4 source functions (instagram, youtube, shopping, web).
 *   2. For each gender, Claude reads the signals and lists the ~8 most trending
 *      individual products right now for that category + gender.
 *   3. Each product is found via SerpAPI, saved as a `pieces` row (so the
 *      product page + comparison work), and indexed in `trending_products`.
 *   4. Old trending_products for that category+gender are cleared first.
 *
 * Secrets: ANTHROPIC_API_KEY, SERP_API_KEY
 * Auto-injected: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")               ?? "";
const SERVICE_ROLE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")  ?? "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")          ?? "";
const SERP_API_KEY      = Deno.env.get("SERP_API_KEY")               ?? "";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
  "Access-Control-Max-Age":       "86400",
};

const SOURCES = ["instagram", "youtube", "shopping", "web"] as const;
const GENDERS = ["mens", "womens"] as const;
const GENDER_TERM: Record<string, string> = { mens: "men's", womens: "women's" };

// Topic phrasing per category (label used in prompts / search).
const CATEGORY_TOPICS: Record<string, string> = {
  streetwear:   "trending streetwear",
  formal:       "trending formal / smart wear",
  casual:       "trending casual everyday wear",
  athleisure:   "trending athleisure / sporty wear",
  "old-money":  "trending old money / quiet luxury",
  "date-night": "trending date night looks",
  "nike-tech":  "trending Nike Tech fleece",
  grunge:       "trending grunge fashion",
  y2k:          "trending Y2K fashion",
  techwear:     "trending techwear",
  preppy:       "trending preppy fashion",
  gorpcore:     "trending gorpcore / outdoor fashion",
};

const slugify = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const rand    = () => Math.random().toString(36).slice(2, 10);

interface ProductConcept { name: string; keywords: string[]; colors: string[]; }
interface FoundProduct {
  name: string; price: number | null; url: string; image_url: string;
  store: string; description: string | null; keywords: string[]; colors: string[];
}

// ── Call a source edge function (fail-safe) ────────────────────
async function callSource(source: string, topic: string): Promise<string> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/trend_source_${source}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_ROLE_KEY}`, "apikey": SERVICE_ROLE_KEY },
      body: JSON.stringify({ topic }),
    });
    if (!res.ok) return "";
    const data = await res.json();
    const text = (data.raw_text as string) ?? "";
    return text ? `### ${source.toUpperCase()}\n${text}` : "";
  } catch { return ""; }
}

// ── Claude: list trending individual products for a category + gender ──
async function listProducts(category: string, label: string, gender: string, signals: string): Promise<ProductConcept[]> {
  const g = GENDER_TERM[gender];
  const system = `You are a fashion trend analyst. From raw, messy trend signals you identify the
individual ${g} products that are most trending right now for a given style/category - the actual
items people are buying. Respond ONLY with valid JSON.`;

  const prompt = `CATEGORY: ${label} (${g})

RAW TREND SIGNALS (interpret them):
${signals.slice(0, 9000) || "(no live signals - use your knowledge of what's trending in this category)"}

List the 8 most trending individual ${g} products for "${label}" right now. Each must be a single
buyable item (not a full outfit). Return ONLY:
{
  "products": [
    { "name": "specific item, e.g. Nike Tech Fleece hoodie", "keywords": ["${gender === "mens" ? "mens" : "womens"}","specific","google","shopping","terms"], "colors": ["#hex"] }
  ]
}
Keywords must be specific enough to find the item on Google Shopping and should start with "${gender === "mens" ? "mens" : "womens"}".`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-opus-4-5", max_tokens: 1200, temperature: 0.5, system, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const raw  = (data.content?.[0]?.text ?? "").replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const out  = JSON.parse(raw);
  return Array.isArray(out.products) ? out.products : [];
}

// ── SerpAPI: find one product ──────────────────────────────────
async function searchProduct(p: ProductConcept, gender: string): Promise<FoundProduct | null> {
  if (!SERP_API_KEY) return null;
  try {
    const kws = p.keywords.slice(0, 4);
    if (!kws.some(k => /\b(mens|men's|womens|women's)\b/i.test(k))) kws.unshift(GENDER_TERM[gender] ?? "");
    const q = kws.filter(Boolean).join(" ");
    const url = `https://serpapi.com/search?engine=google_shopping&q=${encodeURIComponent(q)}&api_key=${SERP_API_KEY}&num=10`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const results = (data.shopping_results ?? []) as Record<string, unknown>[];
    if (!results.length) return null;
    const hit = results.find(r => r.thumbnail && (r.extracted_price || r.price)) ?? results[0];
    const priceRaw = hit.extracted_price ?? hit.price;
    const price = typeof priceRaw === "number" ? priceRaw : typeof priceRaw === "string" ? parseFloat(priceRaw.replace(/[^0-9.]/g, "")) || null : null;
    const exts = Array.isArray(hit.extensions) ? (hit.extensions as string[]).join(" · ") : "";
    const description = (typeof hit.snippet === "string" && hit.snippet.trim()) ? hit.snippet.trim()
      : (typeof hit.description === "string" && hit.description.trim()) ? hit.description.trim() : (exts.trim() || null);
    return {
      name: (hit.title as string) ?? p.name, price,
      url: (hit.link as string) ?? (hit.product_link as string) ?? "#",
      image_url: (hit.thumbnail as string) ?? "", store: (hit.source as string) ?? "Online",
      description, keywords: p.keywords, colors: p.colors,
    };
  } catch { return null; }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { account_id, category, topic } = await req.json() as { account_id: string; category: string; topic?: string };
    if (!account_id) throw new Error("account_id required");
    if (!category)   throw new Error("category required");

    const catKey = category.toLowerCase().trim();
    const label  = CATEGORY_TOPICS[catKey] ?? `trending ${category}`;
    const theTopic = (topic && topic.trim()) || `${label} fashion items this season`;

    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    // Ensure a single hub board to attach trending pieces to (no style report needed).
    const hubSlug = `trending-products-${account_id.replace(/-/g, "").slice(0, 8)}`;
    let { data: hub } = await db.from("mood_boards").select("id").eq("slug", hubSlug).maybeSingle();
    if (!hub) {
      const { data: created, error: hubErr } = await db.from("mood_boards").insert({
        account_id, title: "Trending Products",
        description: "Individual trending products.", occasion: "Trending", goal: "trending",
        category: "trending", store_name: "general", colors: [], image_url: null,
        public: true, is_official: true, slug: hubSlug,
      }).select("id").single();
      if (hubErr) throw new Error(`Hub board insert: ${hubErr.message}`);
      hub = created;
    }
    if (!hub) throw new Error("Could not create hub board");

    // Gather signals once (shared across genders).
    const signalParts = await Promise.all(SOURCES.map(s => callSource(s, theTopic)));
    const signals = signalParts.filter(Boolean).join("\n\n");

    const summary: { gender: string; count: number }[] = [];

    for (const gender of GENDERS) {
      const concepts = await listProducts(catKey, label, gender, signals);
      if (!concepts.length) { summary.push({ gender, count: 0 }); continue; }

      const rawFound = (await Promise.all(concepts.slice(0, 10).map(c => searchProduct(c, gender))))
        .filter(Boolean) as FoundProduct[];

      // Dedupe: different concepts often resolve to the same product on SerpAPI.
      const seen = new Set<string>();
      const found = rawFound.filter(p => {
        const nameKey = p.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
        const urlKey  = (p.url ?? "").trim();
        if (seen.has(nameKey) || (urlKey && seen.has(urlKey))) return false;
        seen.add(nameKey); if (urlKey) seen.add(urlKey);
        return true;
      });

      if (!found.length) { summary.push({ gender, count: 0 }); continue; }

      // Insert pieces (so the product page + comparison work).
      const pieceRows = found.map(p => ({
        mood_board_id: hub!.id,
        name: p.name, title: p.name, price: p.price,
        url: p.url, image_url: p.image_url, colors: p.colors,
        style: `Trending ${label}`, description: p.description, store: p.store, keywords: p.keywords,
        slug: slugify(`${p.store} ${p.name}`.slice(0, 55)) + "-" + rand(),
      }));
      const { data: insertedPieces, error: pErr } = await db.from("pieces").insert(pieceRows).select("id, slug, name, image_url, price, store");
      if (pErr) { console.error(`[trend] ${gender} pieces insert:`, pErr.message); summary.push({ gender, count: 0 }); continue; }

      // Clear old trending_products for this category+gender (and their pieces).
      const { data: oldRows } = await db.from("trending_products").select("piece_id").eq("category", catKey).eq("gender", gender);
      const oldPieceIds = (oldRows ?? []).map(r => r.piece_id).filter(Boolean);
      await db.from("trending_products").delete().eq("category", catKey).eq("gender", gender);
      if (oldPieceIds.length) await db.from("pieces").delete().in("id", oldPieceIds);

      // Index the fresh ones.
      const tpRows = (insertedPieces ?? []).map((pc, i) => ({
        category: catKey, gender, piece_id: pc.id, slug: pc.slug,
        name: pc.name, image_url: pc.image_url, price: pc.price, store: pc.store, rank: i,
      }));
      const { error: tpErr } = await db.from("trending_products").insert(tpRows);
      if (tpErr) throw new Error(`trending_products insert: ${tpErr.message}`);
      summary.push({ gender, count: tpRows.length });
    }

    return new Response(JSON.stringify({ success: true, category: catKey, summary }),
      { headers: { ...CORS, "Content-Type": "application/json" } });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[trend_orchestrator] Fatal:", msg);
    // Return 200 so the admin runner can read and display the real error.
    return new Response(JSON.stringify({ success: false, error: msg }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
