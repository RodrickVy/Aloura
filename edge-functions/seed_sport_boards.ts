/**
 * seed_sport_boards
 * Supabase Edge Function — Deno / TypeScript
 *
 * ONE-TIME catalogue seeder. Invoke manually:
 *   POST { account_id: string, sports: string[] }
 *
 * For each sport it:
 *   1. Skips if already seeded (a featured board already exists for that sport)
 *   2. Claude → ONE unisex apparel + footwear outfit concept (no equipment)
 *   3. Claude → picks a mainstream sporting retailer + a niche specialty store
 *   4. For each of 3 stores (Amazon, mainstream, specialty):
 *        - SerpAPI search each piece at that store
 *        - create a public + featured mood_board with SEO slugs
 *        - NO AI image (collage only)
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
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─────────────────────────────────────────────────────────────
//  TYPES
// ─────────────────────────────────────────────────────────────

interface PieceConcept { name: string; keywords: string[]; colors: string[]; }
interface OutfitConcept {
  title: string; occasion: string; description: string;
  colors: string[]; pieces: PieceConcept[];
}
interface FoundProduct {
  name: string; store: string; price: number | null;
  url: string; image_url: string; keywords: string[]; colors: string[];
}

// ─────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────

const slugify = (t: string) =>
  t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const uuidSuffix = (id: string) => id.replace(/-/g, "").slice(0, 8);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

async function claudeJSON(prompt: string, system: string, maxTokens = 1500): Promise<any> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-opus-4-5",
      max_tokens: maxTokens,
      temperature: 0.4,
      system,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const raw  = (data.content?.[0]?.text ?? "").replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(raw);
}

// ── 1. Outfit concept for a sport ─────────────────────────────
async function generateConcept(sport: string): Promise<OutfitConcept> {
  const system = `You are a sports apparel stylist. You design the essential head-to-toe
APPAREL + FOOTWEAR outfit for a given sport. Apparel and shoes ONLY — never include hard
equipment (rackets, bikes, balls, clubs, helmets-as-gear, bags). Unisex/general styling.
Respond ONLY with valid JSON, no markdown.`;

  const prompt = `Sport: ${sport}

Design the essential outfit someone needs to dress for ${sport} — head to toe, apparel + footwear only.
Typically 4-6 pieces (e.g. headwear, top, mid-layer or jacket, bottoms, socks, shoes) — only what makes sense for ${sport}.
NO equipment.

Return ONLY:
{
  "title": "short evocative name (e.g. 'Court-Ready Essentials')",
  "occasion": "${cap(sport)} essentials",
  "description": "1-2 sentences on what this kit covers and why",
  "colors": ["#hex1","#hex2","#hex3"],
  "pieces": [
    { "name": "piece type (e.g. Performance polo)", "keywords": ["specific","searchable","shopping","terms","max 5"], "colors": ["#hex"] }
  ]
}`;
  return await claudeJSON(prompt, system) as OutfitConcept;
}

// ── 2. Pick the two AI stores for a sport ─────────────────────
async function pickStores(sport: string): Promise<{ mainstream: string; specialty: string }> {
  const system = `You recommend real US retailers that sell APPAREL for a given sport.
Respond ONLY with valid JSON, no markdown.`;
  const prompt = `Sport: ${sport}

Give two real retailers that sell ${sport} apparel/footwear (not Amazon):
- "mainstream": a large mainstream sporting-goods retailer (e.g. Dick's Sporting Goods, Decathlon, REI)
- "specialty": a niche store known specifically for ${sport} (e.g. for tennis -> Tennis Warehouse)

Return ONLY: { "mainstream": "Store Name", "specialty": "Store Name" }`;
  const out = await claudeJSON(prompt, system, 200);
  return { mainstream: out.mainstream ?? "Dick's Sporting Goods", specialty: out.specialty ?? out.mainstream ?? "" };
}

// ── 3. SerpAPI: find one piece at a store ─────────────────────
async function searchPiece(piece: PieceConcept, store: string): Promise<FoundProduct | null> {
  const query = `${piece.keywords.slice(0, 4).join(" ")} ${store}`.trim();
  const url   = `https://serpapi.com/search?engine=google_shopping&q=${encodeURIComponent(query)}&api_key=${SERP_API_KEY}&num=10`;
  const res = await fetch(url);
  if (!res.ok) { console.warn(`[seed] serp ${res.status} for "${query}"`); return null; }
  const data    = await res.json();
  const results = (data.shopping_results ?? []) as Record<string, unknown>[];
  if (!results.length) return null;

  const storeMatch = results.find(r =>
    typeof r.source === "string" && (r.source as string).toLowerCase().includes(store.toLowerCase()));
  const hit = storeMatch ?? results[0];

  const priceRaw = hit.extracted_price ?? hit.price;
  const price    = typeof priceRaw === "number" ? priceRaw
    : typeof priceRaw === "string" ? parseFloat((priceRaw as string).replace(/[^0-9.]/g, "")) || null
    : null;

  return {
    name:      (hit.title as string) ?? piece.name,
    store:     (hit.source as string) ?? store,
    price,
    url:       (hit.link as string) ?? (hit.product_link as string) ?? "#",
    image_url: (hit.thumbnail as string) ?? "",
    keywords:  piece.keywords,
    colors:    piece.colors,
  };
}

// ─────────────────────────────────────────────────────────────
//  MAIN
// ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { account_id, sports } = await req.json() as { account_id: string; sports: string[] };
    if (!account_id)        throw new Error("account_id is required");
    if (!sports?.length)    throw new Error("sports array is required");

    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    // Latest style report for the owner (required by schema)
    const { data: rep } = await db
      .from("style_reports").select("id")
      .eq("account_id", account_id)
      .order("generated_at", { ascending: false }).limit(1).maybeSingle();
    if (!rep) throw new Error(`No style_report found for account ${account_id}. Complete onboarding on that account first.`);
    const styleReportId = rep.id;

    const summary: any[] = [];

    for (const rawSport of sports) {
      const sport      = rawSport.trim().toLowerCase();
      const sportLabel = cap(sport);

      // Skip if already seeded
      const { data: existing } = await db
        .from("mood_boards").select("id")
        .eq("category", sport).eq("is_official", true).limit(1).maybeSingle();
      if (existing) { summary.push({ sport, skipped: true }); continue; }

      console.log(`[seed] === ${sportLabel} ===`);

      // 1. Concept + 2. stores (parallel)
      let concept: OutfitConcept, stores: string[];
      try {
        const [c, s] = await Promise.all([generateConcept(sport), pickStores(sport)]);
        concept = c;
        stores  = ["Amazon", s.mainstream, s.specialty].filter((v, i, a) => v && a.indexOf(v) === i);
      } catch (e) {
        console.error(`[seed] concept/store failed for ${sport}:`, e);
        summary.push({ sport, error: String(e) });
        continue;
      }

      const createdBoards: any[] = [];

      // Process the 3 stores in parallel; within each store search all pieces in parallel.
      const perStore = await Promise.all(stores.map(async (store) => {
        const found = await Promise.all(concept.pieces.map(p => searchPiece(p, store)));
        return { store, products: found.filter(Boolean) as FoundProduct[] };
      }));

      for (const { store, products } of perStore) {
        if (!products.length) { console.warn(`[seed] no products for ${sport} @ ${store}`); continue; }

        // Create board
        const { data: board, error: bErr } = await db.from("mood_boards").insert({
          account_id,
          style_report_id: styleReportId,
          title:       `${sportLabel} Essentials — ${store}`,
          description: concept.description,
          occasion:    concept.occasion,
          goal:        sport,
          category:    sport,
          store_name:  store,
          colors:      concept.colors,
          image_url:   null,
          public:      true,
          is_official: true,
          slug:        slugify(`${sport} essentials ${store}`) + "-" + uuidSuffix(crypto.randomUUID()),
        }).select("id, slug").single();
        if (bErr || !board) { console.error(`[seed] board insert failed:`, bErr?.message); continue; }

        // Insert pieces with slugs
        const pieceRows = products.map(p => ({
          mood_board_id: board.id,
          name: p.name, title: p.name, price: p.price,
          url: p.url, image_url: p.image_url, colors: p.colors,
          style: concept.occasion, store: p.store, keywords: p.keywords,
          slug: slugify(`${p.store} ${p.name}`.slice(0, 60)) + "-" + Math.random().toString(36).slice(2, 10),
        }));
        await db.from("pieces").insert(pieceRows);

        createdBoards.push({ store, board_id: board.id, slug: board.slug, pieces: pieceRows.length });
        console.log(`[seed] ${sportLabel} @ ${store}: ${pieceRows.length} pieces ✓`);
      }

      summary.push({ sport, boards: createdBoards });
    }

    return new Response(JSON.stringify({ success: true, summary }),
      { headers: { ...CORS, "Content-Type": "application/json" } });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[seed] Fatal:", msg);
    return new Response(JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
