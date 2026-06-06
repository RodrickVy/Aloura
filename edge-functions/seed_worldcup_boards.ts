/**
 * seed_worldcup_boards
 * Supabase Edge Function - Deno / TypeScript
 *
 * ONE-TIME catalogue seeder for FIFA World Cup 2026 team kits.
 *   POST { account_id: string, teams?: string[] }   // teams optional - defaults to all 48
 *
 * For each team:
 *   - one board, category "fifa 2026"
 *   - 2 pieces: jersey + shorts (SerpAPI, biased to a jersey retailer)
 *   - public + featured, NO AI image (collage only)
 * Also backfills the `categories` table with every official category
 * (fifa 2026 + all seeded sports) so they can get header images in the editor.
 *
 * Secrets: SERP_API_KEY      Auto-injected: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")               ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")  ?? "";
const SERP_API_KEY     = Deno.env.get("SERP_API_KEY")               ?? "";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CATEGORY      = "fifa 2026";
const KIT_RETAILER  = "Fanatics";   // bias jersey/shorts searches toward an official-ish retailer
const TEAM_CHUNK    = 8;            // teams processed concurrently per chunk

const ALL_TEAMS = [
  "Mexico","South Africa","South Korea","Czechia",
  "Canada","Bosnia and Herzegovina","Qatar","Switzerland",
  "Brazil","Morocco","Haiti","Scotland",
  "United States","Paraguay","Australia","Turkey",
  "Germany","Curaçao","Ivory Coast","Ecuador",
  "Netherlands","Japan","Sweden","Tunisia",
  "Belgium","Egypt","Iran","New Zealand",
  "Spain","Cape Verde","Saudi Arabia","Uruguay",
  "France","Senegal","Iraq","Norway",
  "Algeria","Argentina","Austria","Jordan",
  "Colombia","DR Congo","Portugal","Uzbekistan",
  "Croatia","England","Ghana","Panama",
];

// ── helpers ───────────────────────────────────────────────────
const slugify = (t: string) =>
  t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const uuidSuffix = (id: string) => id.replace(/-/g, "").slice(0, 8);
const randSuffix = () => Math.random().toString(36).slice(2, 10);

interface Found { name: string; store: string; price: number | null; url: string; image_url: string; keywords: string[]; }

async function serpSearch(query: string): Promise<Found | null> {
  const url = `https://serpapi.com/search?engine=google_shopping&q=${encodeURIComponent(query)}&api_key=${SERP_API_KEY}&num=10`;
  const res = await fetch(url);
  if (!res.ok) { console.warn(`[wc] serp ${res.status} for "${query}"`); return null; }
  const data    = await res.json();
  const results = (data.shopping_results ?? []) as Record<string, unknown>[];
  if (!results.length) return null;
  const hit = results.find(r => (r.thumbnail || r.image) && (r.extracted_price || r.price)) ?? results[0];

  const priceRaw = hit.extracted_price ?? hit.price;
  const price    = typeof priceRaw === "number" ? priceRaw
    : typeof priceRaw === "string" ? parseFloat((priceRaw as string).replace(/[^0-9.]/g, "")) || null
    : null;

  return {
    name:      (hit.title as string) ?? query,
    store:     (hit.source as string) ?? KIT_RETAILER,
    price,
    url:       (hit.link as string) ?? (hit.product_link as string) ?? "#",
    image_url: (hit.thumbnail as string) ?? "",
    keywords:  query.split(" ").slice(0, 6),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    let payload: { account_id?: string; teams?: string[] } = {};
    try {
      payload = await req.json();
    } catch {
      throw new Error("Request body is empty or not valid JSON. Send { \"account_id\": \"...\" }.");
    }
    const { account_id, teams } = payload;
    if (!account_id) throw new Error("account_id is required");
    const teamList = (teams?.length ? teams : ALL_TEAMS);

    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    // owner's latest style report (required by schema)
    const { data: rep } = await db.from("style_reports").select("id")
      .eq("account_id", account_id).order("generated_at", { ascending: false }).limit(1).maybeSingle();
    if (!rep) throw new Error(`No style_report for account ${account_id}. Onboard that account first.`);
    const styleReportId = rep.id;

    async function seedTeam(team: string) {
      const teamKey = team.trim();

      // skip if already seeded
      const { data: existing } = await db.from("mood_boards").select("id")
        .eq("category", CATEGORY).eq("goal", teamKey.toLowerCase()).limit(1).maybeSingle();
      if (existing) return { team: teamKey, skipped: true };

      // jersey + shorts in parallel
      const [jersey, shorts] = await Promise.all([
        serpSearch(`${teamKey} soccer jersey 2026 ${KIT_RETAILER}`),
        serpSearch(`${teamKey} soccer shorts 2026 ${KIT_RETAILER}`),
      ]);
      const products = [jersey, shorts].filter(Boolean) as Found[];
      if (!products.length) return { team: teamKey, error: "no products" };

      const { data: board, error: bErr } = await db.from("mood_boards").insert({
        account_id,
        style_report_id: styleReportId,
        title:       `${teamKey} - World Cup 2026`,
        description: `${teamKey}'s 2026 World Cup kit - jersey and shorts.`,
        occasion:    `${teamKey} World Cup 2026 kit`,
        goal:        teamKey.toLowerCase(),
        category:    CATEGORY,
        store_name:  "general",
        colors:      [],
        image_url:   null,
        public:      true,
        is_official: true,
        slug:        slugify(`${teamKey} world cup 2026`) + "-" + uuidSuffix(crypto.randomUUID()),
      }).select("id, slug").single();
      if (bErr || !board) return { team: teamKey, error: bErr?.message ?? "insert failed" };

      const rows = products.map(p => ({
        mood_board_id: board.id,
        name: p.name, title: p.name, price: p.price,
        url: p.url, image_url: p.image_url, colors: [],
        style: `${teamKey} World Cup 2026 kit`, store: p.store, keywords: p.keywords,
        slug: slugify(`${p.store} ${p.name}`.slice(0, 60)) + "-" + randSuffix(),
      }));
      await db.from("pieces").insert(rows);

      return { team: teamKey, slug: board.slug, pieces: rows.length };
    }

    // Process teams in concurrent chunks
    const results: any[] = [];
    for (let i = 0; i < teamList.length; i += TEAM_CHUNK) {
      const chunk = teamList.slice(i, i + TEAM_CHUNK);
      results.push(...await Promise.all(chunk.map(seedTeam)));
    }

    // Ensure the fifa 2026 category exists, plus backfill every official category (sports too)
    const { data: catRows } = await db.from("mood_boards")
      .select("category").eq("is_official", true);
    const names = [...new Set([CATEGORY, ...(catRows ?? []).map(r => (r.category ?? "").trim()).filter(Boolean)])];
    if (names.length) {
      await db.from("categories")
        .upsert(names.map(name => ({ name })), { onConflict: "name", ignoreDuplicates: true });
    }

    return new Response(JSON.stringify({ success: true, count: results.length, results, categories: names }),
      { headers: { ...CORS, "Content-Type": "application/json" } });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[wc] Fatal:", msg);
    return new Response(JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
