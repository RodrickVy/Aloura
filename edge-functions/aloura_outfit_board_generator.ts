/**
 * aloura_outfit_board_generator
 * Supabase Edge Function - Deno / TypeScript
 *
 * POST {
 *   account_id:  string,
 *   goal:        string,        // text query / occasion
 *   store?:      string,        // e.g. "Zara" - empty = any store
 * }
 *
 * Pipeline:
 *  1. Load first style_report for account_id (colours, undertone, etc.)
 *  2. Claude → outfit concept (3-5 pieces) using style report + goal
 *  3. SerpAPI Google Shopping → find each piece (with store filter if given)
 *  4. Insert mood_board + pieces rows
 *  5. Claude → generate SEO slugs for board + all pieces (single call)
 *  6. Return full board payload (no image - UI builds a collage from pieces)
 *
 * Secrets: ANTHROPIC_API_KEY, SERP_API_KEY
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

// ─────────────────────────────────────────────────────────────
//  TYPES
// ─────────────────────────────────────────────────────────────

interface PieceConcept {
  name:     string;
  keywords: string[];
  colors:   string[];
}

interface OutfitConcept {
  title:       string;
  occasion:    string;
  description: string;
  colors:      string[];
  pieces:      PieceConcept[];
}

interface ShoppingProduct {
  name:        string;
  price:       number | null;
  url:         string;
  image_url:   string;
  store:       string;
  style:       string;          // occasion/outfit context
  description: string | null;   // REAL product description from SerpAPI (never AI-generated)
  keywords:    string[];
  colors:      string[];
}

interface SlugPayload {
  mood_board_slug: string;
  piece_slugs:     string[];
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

function fallbackSlugs(
  concept: OutfitConcept,
  products: ShoppingProduct[],
  boardId: string,
  pieceIds: string[],
): SlugPayload {
  const mood_board_slug =
    slugify(`${concept.occasion} ${concept.title}`) + "-" + uuidSuffix(boardId);
  const piece_slugs = products.map((p, i) =>
    slugify(`${p.store} ${p.name}`.slice(0, 60)) + "-" + uuidSuffix(pieceIds[i] ?? boardId + i)
  );
  return { mood_board_slug, piece_slugs };
}

// ─────────────────────────────────────────────────────────────
//  STEP 1 - Generate outfit concept
// ─────────────────────────────────────────────────────────────

async function generateOutfitConcept(
  goal: string,
  personProfile: string,
  imageDesc: string,
  store: string,
  gender: string,
  maxBudget: number | null,
): Promise<OutfitConcept> {
  const imageContext = imageDesc
    ? `\nUSER UPLOADED ITEM:\n${imageDesc}\nIncorporate this item or find similar pieces in the outfit.`
    : "";
  const storeContext = store
    ? `\nPREFERRED STORE: ${store} - prefer pieces findable at ${store}.`
    : "";
  const genderLabel = gender === "mens" ? "men's" : gender === "womens" ? "women's" : gender === "unisex" ? "unisex" : "";
  const genderContext = genderLabel ? `\nGENDER: design a ${genderLabel} outfit; every piece must be a ${genderLabel} item.` : "";
  const budgetContext = maxBudget
    ? `\nBUDGET: the WHOLE outfit must total UNDER $${maxBudget}. Pick realistically priced pieces so the combined cost stays under $${maxBudget}.`
    : "";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type":      "application/json",
      "x-api-key":         ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model:       "claude-opus-4-5",
      max_tokens:  1500,
      temperature: 0.4,
      system: `You are a personal stylist. Design realistic outfit boards. All pieces must be findable on Google Shopping.
CRITICAL: Use only the person's good colours (best_colors, accent_colors, neutral_staples). Avoid use_sparingly colours.
Respond ONLY with valid JSON.`,
      messages: [{
        role: "user",
        content: `Design a complete outfit for this goal/occasion: "${goal}"

PERSON STYLE PROFILE:
${personProfile}
${imageContext}
${storeContext}
${genderContext}
${budgetContext}

Return ONLY:
{
  "title": "short evocative outfit name",
  "occasion": "${goal}",
  "description": "why this outfit works (1-2 sentences)",
  "colors": ["#hex1","#hex2","#hex3"],
  "pieces": [
    {
      "name": "piece type e.g. Trousers",
      "keywords": ["specific","searchable","google shopping","terms","max 5"],
      "colors": ["#hex"]
    }
  ]
}

3-5 pieces maximum. Each piece needs keywords specific enough to find on Google Shopping.`,
      }],
    }),
  });
  if (!res.ok) throw new Error(`Concept ${res.status}`);
  const d   = await res.json();
  const raw = (d.content?.[0]?.text ?? "").replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  try { return JSON.parse(raw) as OutfitConcept; }
  catch { throw new Error("Claude concept non-JSON"); }
}

// ─────────────────────────────────────────────────────────────
//  STEP 3 - Google Shopping search for one piece
// ─────────────────────────────────────────────────────────────

const GENDER_TERM: Record<string, string> = { mens: "men's", womens: "women's", unisex: "unisex" };

function parsePrice(raw: unknown): number | null {
  return typeof raw === "number" ? raw
    : typeof raw === "string" ? parseFloat(raw.replace(/[^0-9.]/g, "")) || null
    : null;
}

async function searchGoogleShopping(
  piece: PieceConcept,
  store: string,
  occasion: string,
  gender: string,
  perPieceCap: number | null,
): Promise<ShoppingProduct | null> {
  const genderTerm = GENDER_TERM[gender] ?? "";
  const q = [
    genderTerm,
    ...piece.keywords.slice(0, 4),
    store ? `site:${store.toLowerCase().replace(/\s+/g, "")}.com OR "${store}"` : "",
  ].filter(Boolean).join(" ");

  const url = `https://serpapi.com/search?engine=google_shopping&q=${encodeURIComponent(q)}&api_key=${SERP_API_KEY}&num=40`;
  console.log(`[shop] Searching: "${q}"`);

  const res = await fetch(url);
  if (!res.ok) { console.warn(`[shop] HTTP ${res.status}`); return null; }

  const data    = await res.json();
  const results = data.shopping_results ?? [];
  if (!results.length) { console.warn(`[shop] No results for "${q}"`); return null; }

  // Prefer an item with image + price; if a per-piece budget cap is set, prefer
  // the first relevant result under the cap, else fall back to the cheapest.
  const withImgPrice = results.filter((r: Record<string, unknown>) => r.thumbnail && (r.extracted_price || r.price));
  let product: Record<string, unknown> | undefined;
  if (perPieceCap) {
    const underCap = withImgPrice.filter((r: Record<string, unknown>) => {
      const p = parsePrice(r.extracted_price ?? r.price);
      return p != null && p <= perPieceCap;
    });
    if (underCap.length) {
      product = underCap[0];
    } else if (withImgPrice.length) {
      // cheapest available if nothing fits the cap
      product = [...withImgPrice].sort((a, b) =>
        (parsePrice(a.extracted_price ?? a.price) ?? 1e9) - (parsePrice(b.extracted_price ?? b.price) ?? 1e9))[0];
    }
  }
  product = product ?? withImgPrice[0] ?? results[0];

  const priceRaw = product.extracted_price ?? product.price;
  const price    = typeof priceRaw === "number" ? priceRaw
    : typeof priceRaw === "string" ? parseFloat(priceRaw.replace(/[^0-9.]/g, "")) || null
    : null;

  const storeName = (product.source as string) ?? (store || "Online");

  // REAL product description straight from SerpAPI - never AI-generated.
  // Prefer the snippet/description; fall back to the retailer extensions
  // (e.g. "Free shipping · In stock"); null if SerpAPI gives us nothing.
  const exts = Array.isArray(product.extensions) ? (product.extensions as string[]).join(" · ") : "";
  const description =
    (typeof product.snippet === "string" && product.snippet.trim()) ? product.snippet.trim()
    : (typeof product.description === "string" && product.description.trim()) ? product.description.trim()
    : (exts.trim() || null);

  console.log(`[shop] "${(product.title as string)?.slice(0, 40)}" at ${storeName} | $${price} | desc:${description ? "yes" : "no"}`);

  return {
    name:        (product.title as string) ?? piece.name,
    price,
    url:         (product.link as string) ?? (product.product_link as string) ?? "#",
    image_url:   (product.thumbnail as string) ?? "",
    store:       storeName,
    style:       occasion,
    description,
    keywords:    piece.keywords,
    colors:      piece.colors,
  };
}

// ─────────────────────────────────────────────────────────────
//  STEP 4 - Generate SEO slugs via Claude (single call)
// ─────────────────────────────────────────────────────────────

async function generateSlugs(
  concept: OutfitConcept,
  products: ShoppingProduct[],
  boardId: string,
  pieceIds: string[],
): Promise<SlugPayload> {
  const piecesContext = products.map((p, i) => ({
    index:    i,
    store:    p.store,
    name:     p.name,
    style:    p.style,
    keywords: p.keywords,
    colors:   p.colors,
    price:    p.price,
  }));

  const prompt = `You are an SEO expert for a fashion e-commerce platform.
Generate URL slugs optimised for Google search ranking.

RULES:
- Lowercase, hyphens only, no special characters
- Mood board slug: capture occasion + style vibe + 2-3 dominant colors or garments. Max 10 words.
- Piece slugs: MUST include store/brand name + product type + key color + material or fit detail. Max 8 words each.
- No filler words: "the", "a", "and", "for", "with", "from"
- Every slug must be unique

MOOD BOARD:
  Title: ${concept.title}
  Occasion: ${concept.occasion}
  Description: ${concept.description}
  Colors: ${concept.colors.join(", ")}

PIECES (${piecesContext.length} total):
${JSON.stringify(piecesContext, null, 2)}

Return ONLY this JSON - no markdown, no explanation:
{
  "mood_board_slug": "occasion-style-color-detail",
  "piece_slugs": [
    "store-product-type-color-fit",
    "..."
  ]
}

piece_slugs must have exactly ${piecesContext.length} entries in order.`;

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

  if (!res.ok) {
    console.warn(`[slugs] Claude ${res.status} - using fallback slugs`);
    return fallbackSlugs(concept, products, boardId, pieceIds);
  }

  const d   = await res.json();
  const raw = (d.content?.[0]?.text ?? "").replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  try {
    const parsed = JSON.parse(raw) as SlugPayload;

    const mbSlug = slugify(parsed.mood_board_slug) + "-" + uuidSuffix(boardId);

    const pieceSlugs = (parsed.piece_slugs ?? []).map((s, i) =>
      slugify(s) + "-" + uuidSuffix(pieceIds[i] ?? boardId + i)
    );

    // Pad if Claude returned fewer than expected
    while (pieceSlugs.length < products.length) {
      const i = pieceSlugs.length;
      pieceSlugs.push(
        slugify(`${products[i]?.store ?? "item"} ${products[i]?.name ?? "piece"}`.slice(0, 60))
        + "-" + uuidSuffix(pieceIds[i] ?? boardId + i)
      );
    }

    console.log(`[slugs] Board: ${mbSlug}`);
    pieceSlugs.forEach((s, i) => console.log(`[slugs] Piece ${i}: ${s}`));

    return { mood_board_slug: mbSlug, piece_slugs: pieceSlugs };
  } catch {
    console.warn("[slugs] Non-JSON from Claude - using fallback slugs");
    return fallbackSlugs(concept, products, boardId, pieceIds);
  }
}

// ─────────────────────────────────────────────────────────────
//  MAIN HANDLER
// ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { account_id, goal, store = "", gender = "", max_budget = null } = await req.json() as {
      account_id:  string;
      goal:        string;
      store?:      string;
      gender?:     string;
      max_budget?: number | null;
    };
    if (!account_id) throw new Error("account_id required");
    if (!goal)       throw new Error("goal required");

    // A very large budget is the open-ended "+" tier = no real cap.
    const budget = (max_budget && max_budget <= 5000) ? max_budget : null;
    console.log(`[board_gen] account=${account_id} goal="${goal}" store="${store}" gender="${gender}" budget=${budget}`);

    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    // ── Load style report ──────────────────────────────────────
    const { data: report, error: rErr } = await db
      .from("style_reports")
      .select(`id, skin_tone, undertone, color_family,
        best_colors, best_colors_description,
        accent_colors, neutral_staples,
        use_sparingly, use_sparingly_description,
        metals, chains, recommended_shapes,
        face_shape, gender, hair_color, hair_length, age`)
      .eq("account_id", account_id)
      .order("generated_at", { ascending: false })
      .limit(1)
      .single();

    if (rErr || !report) throw new Error(`No style report found for account: ${account_id}`);

    const _j = (a: string[] | null) => (a ?? []).filter(Boolean).join(", ") || "Unknown";
    const _v = (v: string | null)   => (v && v.trim()) ? v : "Unknown";

    const personProfile = [
      `Skin Tone: ${_v(report.skin_tone)}`,
      `Undertone: ${_v(report.undertone)}`,
      `Best Colors (USE THESE): ${_j(report.best_colors)}`,
      `Accent Colors: ${_j(report.accent_colors)}`,
      `Neutral Staples: ${_j(report.neutral_staples)}`,
      `AVOID These Colors: ${_j(report.use_sparingly)} - ${_v(report.use_sparingly_description)}`,
      `Face Shape: ${_v(report.face_shape)}`,
      `Jewellery Metals: ${_v(report.metals)}`,
      `Eyewear: ${_v(report.recommended_shapes)}`,
    ].join("\n");

    // ── Generate outfit concept ────────────────────────────────
    console.log("[board_gen] Generating outfit concept…");
    const concept = await generateOutfitConcept(goal, personProfile, "", store, gender, budget);
    console.log(`[board_gen] Concept: "${concept.title}" - ${concept.pieces.length} pieces`);

    // Per-piece budget cap = total budget / number of pieces (keeps the whole outfit under budget).
    const pieceCount  = Math.max(1, Math.min(5, concept.pieces.length));
    const perPieceCap = budget ? budget / pieceCount : null;

    // ── Search Google Shopping ─────────────────────────────────
    console.log("[board_gen] Searching Google Shopping…");
    const products: ShoppingProduct[] = [];
    for (const piece of concept.pieces.slice(0, 5)) {
      const product = await searchGoogleShopping(piece, store, concept.occasion, gender, perPieceCap);
      products.push(product ?? {
        name:        piece.name,
        price:       null,
        url:         `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(piece.keywords.join(" "))}`,
        image_url:   "",
        store:       store || "Online",
        style:       concept.occasion,
        description: null,
        keywords:    piece.keywords,
        colors:      piece.colors,
      });
      await new Promise(r => setTimeout(r, 200));
    }

    // ── Insert mood_board to get real UUID for slug generation ─
    const { data: board, error: bErr } = await db
      .from("mood_boards")
      .insert({
        account_id,
        style_report_id: report.id,
        title:           concept.title,
        description:     concept.description,
        occasion:        concept.occasion,
        goal,
        colors:          concept.colors,
        image_url:       null,
      })
      .select()
      .single();
    if (bErr || !board) throw new Error(`Board insert: ${bErr?.message}`);
    console.log(`[board_gen] mood_board created: ${board.id}`);

    // ── Insert pieces to get real UUIDs for slug generation ────
    const pieceRows = products.map(p => ({
      mood_board_id: board.id,
      name:          p.name,
      title:         p.name,
      price:         p.price,
      url:           p.url,
      image_url:     p.image_url,
      colors:        p.colors,
      style:         p.style,         // occasion/outfit context
      description:   p.description,   // REAL SerpAPI product description
      store:         p.store,         // brand/retailer name
      keywords:      p.keywords,
    }));

    const { data: insertedPieces, error: pErr } = await db
      .from("pieces")
      .insert(pieceRows)
      .select("id");
    if (pErr) throw new Error(`Pieces insert: ${pErr.message}`);

    const pieceIds = (insertedPieces ?? []).map(p => p.id as string);
    console.log(`[board_gen] ${pieceIds.length} pieces inserted`);

    // ── Generate AI SEO slugs ──────────────────────────────────
    console.log("[board_gen] Generating SEO slugs…");
    const { mood_board_slug, piece_slugs } = await generateSlugs(
      concept, products, board.id, pieceIds,
    );

    // Update mood_board slug
    await db.from("mood_boards").update({ slug: mood_board_slug }).eq("id", board.id);

    // Update each piece slug
    await Promise.all(
      pieceIds.map((id, i) =>
        db.from("pieces").update({ slug: piece_slugs[i] }).eq("id", id)
      )
    );
    console.log("[board_gen] Slugs applied ✓");

    // No board image - the UI builds a collage from the piece images.

    // ── Return ─────────────────────────────────────────────────
    return new Response(
      JSON.stringify({
        success: true,
        mood_board: {
          id:          board.id,
          slug:        mood_board_slug,
          title:       concept.title,
          goal,
          occasion:    concept.occasion,
          description: concept.description,
          colors:      concept.colors,
          image_url:   null,
          pieces:      products.map((p, i) => ({
            ...p,
            id:   pieceIds[i],
            slug: piece_slugs[i],
          })),
        },
      }),
      { headers: { ...CORS, "Content-Type": "application/json" } },
    );

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[board_gen] Fatal:", msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
});
