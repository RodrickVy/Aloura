/**
 * trend_orchestrator
 * Supabase Edge Function - Deno / TypeScript
 *
 * POST { account_id: string, category: string, topic?: string }
 *
 * The ONLY trend function you call. For a given category it:
 *   1. Fans out to the 4 source functions (instagram, youtube, shopping, web)
 *      in parallel and collects their raw fashion signals.
 *   2. Uses Claude to read the messy signals and synthesise ONE concrete
 *      trending outfit concept (title, description, colours, 3-5 pieces).
 *   3. Searches real products for each piece via SerpAPI (our product search).
 *   4. Creates a shoppable, public mood_board + pieces in the "trending"
 *      category. The /trending page reads these boards directly - no
 *      separate trends table.
 *
 * Fail-safe: any source that errors just contributes nothing.
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

// Default topic phrasing per category (can be overridden by `topic`)
const CATEGORY_TOPICS: Record<string, string> = {
  streetwear:   "trending streetwear outfits this season",
  formal:       "trending formal and smart outfits this season",
  casual:       "trending casual everyday outfits this season",
  athleisure:   "trending athleisure and sporty outfits this season",
  "old-money":  "trending old money quiet luxury outfits this season",
  "date-night": "trending date night outfits this season",
};

const slugify = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const rand    = () => Math.random().toString(36).slice(2, 10);

interface PieceConcept { name: string; keywords: string[]; colors: string[]; }
interface OutfitConcept { title: string; description: string; colors: string[]; pieces: PieceConcept[]; }
interface Product {
  name: string; price: number | null; url: string; image_url: string;
  store: string; description: string | null; keywords: string[]; colors: string[];
}

// ── Call a source edge function (fail-safe) ────────────────────
async function callSource(source: string, topic: string): Promise<string> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/trend_source_${source}`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
        "apikey":        SERVICE_ROLE_KEY,
      },
      body: JSON.stringify({ topic }),
    });
    if (!res.ok) { console.warn(`[trend] ${source} HTTP ${res.status}`); return ""; }
    const data = await res.json();
    const text = (data.raw_text as string) ?? "";
    console.log(`[trend] ${source}: ${(data.results?.length ?? 0)} results`);
    return text ? `### ${source.toUpperCase()} SIGNALS\n${text}` : "";
  } catch (e) {
    console.warn(`[trend] ${source} failed:`, e);
    return "";
  }
}

// ── Claude: synthesise one trending outfit from raw signals ────
async function synthesise(category: string, topic: string, signals: string, gender: "mens" | "womens"): Promise<OutfitConcept> {
  const genderLabel = gender === "mens" ? "men's" : "women's";

  const system = `You are a fashion trend analyst. You read raw, messy trend signals from
social media, video, shopping and the web, then distil them into ONE concrete, currently
trending outfit that a shopper could actually buy. Every piece must be findable on Google
Shopping. Respond ONLY with valid JSON.`;

  const prompt = `CATEGORY: ${category}
TOPIC: ${topic}
GENDER: ${genderLabel} (design a ${genderLabel} outfit specifically)

RAW TREND SIGNALS (messy, unstructured - interpret them):
${signals.slice(0, 9000) || "(no live signals available - use your general knowledge of what is trending in this category)"}

From these signals, design the single most clearly trending ${genderLabel} ${category} outfit right now and return:
{
  "title": "short evocative outfit name",
  "description": "2 sentences on why this look is trending and who it's for",
  "colors": ["#hex1","#hex2","#hex3"],
  "pieces": [
    { "name": "piece type e.g. Pleated trousers", "keywords": ["${gender === "mens" ? "mens" : "womens"}","specific","google","shopping","terms"], "colors": ["#hex"] }
  ]
}
3-5 pieces. Every piece must be a ${genderLabel} item. Keywords must be specific enough to find the item on Google Shopping and should start with "${gender === "mens" ? "mens" : "womens"}".`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-opus-4-5", max_tokens: 1200, temperature: 0.5,
      system, messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const d   = await res.json();
  const raw = (d.content?.[0]?.text ?? "").replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(raw) as OutfitConcept;
}

// ── SerpAPI product search for one piece ───────────────────────
async function searchProduct(piece: PieceConcept, gender: "mens" | "womens"): Promise<Product | null> {
  if (!SERP_API_KEY) return null;
  try {
    const kws = piece.keywords.slice(0, 4);
    if (!kws.some(k => /\b(mens|men's|womens|women's)\b/i.test(k))) kws.unshift(gender);
    const q   = kws.join(" ");
    const url = `https://serpapi.com/search?engine=google_shopping&q=${encodeURIComponent(q)}&api_key=${SERP_API_KEY}&num=10`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data    = await res.json();
    const results = (data.shopping_results ?? []) as Record<string, unknown>[];
    if (!results.length) return null;
    const hit = results.find(r => r.thumbnail && (r.extracted_price || r.price)) ?? results[0];

    const priceRaw = hit.extracted_price ?? hit.price;
    const price = typeof priceRaw === "number" ? priceRaw
      : typeof priceRaw === "string" ? parseFloat(priceRaw.replace(/[^0-9.]/g, "")) || null : null;
    const exts = Array.isArray(hit.extensions) ? (hit.extensions as string[]).join(" · ") : "";
    const description =
      (typeof hit.snippet === "string" && hit.snippet.trim()) ? hit.snippet.trim()
      : (typeof hit.description === "string" && hit.description.trim()) ? hit.description.trim()
      : (exts.trim() || null);

    return {
      name:      (hit.title as string) ?? piece.name,
      price,
      url:       (hit.link as string) ?? (hit.product_link as string) ?? "#",
      image_url: (hit.thumbnail as string) ?? "",
      store:     (hit.source as string) ?? "Online",
      description,
      keywords:  piece.keywords,
      colors:    piece.colors,
    };
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { account_id, category, topic } = await req.json() as {
      account_id: string; category: string; topic?: string;
    };
    if (!account_id) throw new Error("account_id required");
    if (!category)   throw new Error("category required");

    const catKey   = category.toLowerCase().trim();
    const theTopic = (topic && topic.trim()) || CATEGORY_TOPICS[catKey] || `trending ${category} outfits this season`;

    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    // Owner's latest style report (required by mood_boards schema)
    const { data: rep } = await db.from("style_reports").select("id")
      .eq("account_id", account_id).order("generated_at", { ascending: false }).limit(1).maybeSingle();
    if (!rep) throw new Error(`No style_report for account ${account_id}. Onboard that account first.`);

    // 1. Fan out to the 4 sources in parallel (shared across both genders)
    console.log(`[trend] ${catKey}: gathering signals for "${theTopic}"`);
    const signalParts = await Promise.all(SOURCES.map(s => callSource(s, theTopic)));
    const signals = signalParts.filter(Boolean).join("\n\n");

    // Build one trending board for a given gender. Returns a summary or throws.
    async function buildBoard(gender: "mens" | "womens") {
      const label = gender === "mens" ? "Men's" : "Women's";

      // 2. Synthesise the gendered outfit
      const concept = await synthesise(catKey, theTopic, signals, gender);
      console.log(`[trend] ${gender} concept: "${concept.title}" (${concept.pieces.length} pieces)`);

      // 3. Find products in parallel
      const found = await Promise.all(concept.pieces.slice(0, 5).map(p => searchProduct(p, gender)));
      const products = found.filter(Boolean) as Product[];
      if (!products.length) throw new Error(`No ${gender} products found for "${concept.title}"`);

      // 4. Create the mood board
      const boardSlug = slugify(`trending ${gender} ${catKey} ${concept.title}`) + "-" + rand();
      const { data: board, error: bErr } = await db.from("mood_boards").insert({
        account_id,
        style_report_id: rep.id,
        title:       `${label} ${concept.title}`,
        description: concept.description,
        occasion:    `Trending ${category} (${label})`,
        goal:        catKey,
        category:    "trending",
        store_name:  "general",
        colors:      concept.colors,
        image_url:   null,
        public:      true,
        is_official: true,
        slug:        boardSlug,
      }).select("id, slug").single();
      if (bErr || !board) throw new Error(`Board insert (${gender}): ${bErr?.message}`);

      const pieceRows = products.map(p => ({
        mood_board_id: board.id,
        name: p.name, title: p.name, price: p.price,
        url: p.url, image_url: p.image_url, colors: p.colors,
        style: `Trending ${category}`, description: p.description,
        store: p.store, keywords: p.keywords,
        slug: slugify(`${p.store} ${p.name}`.slice(0, 60)) + "-" + rand(),
      }));
      const { error: pErr } = await db.from("pieces").insert(pieceRows);
      if (pErr) {
        console.error(`[trend] ${gender} pieces insert failed:`, pErr.message);
        await db.from("mood_boards").delete().eq("id", board.id);  // roll back empty board
        throw new Error(`Pieces insert failed (${gender}): ${pErr.message}`);
      }
      console.log(`[trend] ${gender}: inserted ${pieceRows.length} pieces`);
      return { gender, slug: board.slug, title: `${label} ${concept.title}`, pieces: pieceRows.length };
    }

    // Build both versions. If one gender fails, keep the other.
    const settled = await Promise.allSettled([buildBoard("mens"), buildBoard("womens")]);
    const boards = settled.filter(s => s.status === "fulfilled").map(s => (s as PromiseFulfilledResult<any>).value);
    const errors = settled.filter(s => s.status === "rejected").map(s => String((s as PromiseRejectedResult).reason?.message ?? s));

    if (!boards.length) throw new Error(errors.join(" | ") || "Failed to build any boards");

    // Both boards live as regular public mood_boards in the "trending"
    // category - the /trending page reads them directly.
    return new Response(JSON.stringify({
      success: true, category: catKey, boards, errors,
    }), { headers: { ...CORS, "Content-Type": "application/json" } });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[trend_orchestrator] Fatal:", msg);
    return new Response(JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
