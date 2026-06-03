/**
 * aloura_outfit_board_generator
 * Supabase Edge Function — Deno / TypeScript
 *
 * POST {
 *   account_id:  string,
 *   goal:        string,        // text query / occasion
 *   store?:      string,        // e.g. "Zara" — empty = any store
 *   image_b64?:  string,        // base64 encoded image (optional)
 *   image_type?: string,        // e.g. "image/jpeg"
 * }
 *
 * Pipeline:
 *  1. Load first style_report for account_id (colours, undertone, etc.)
 *  2. If image provided → Claude Vision describes the item
 *  3. Claude → outfit concept (3-5 pieces) using style report + goal + image desc
 *  4. SerpAPI Google Shopping → find each piece (with store filter if given)
 *  5. Insert mood_board + pieces rows to get real UUIDs
 *  6. Claude → generate SEO slugs for board + all pieces (single call)
 *  7. Update mood_board + pieces rows with slugs
 *  8. Claude → mannequin image prompt
 *  9. Together.ai FLUX → generate mannequin image
 * 10. Upload image to Supabase Storage, update mood_board image_url
 * 11. Return full board payload (with slugs)
 *
 * Secrets: ANTHROPIC_API_KEY, TOGETHER_API_KEY, SERP_API_KEY
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")               ?? "";
const SERVICE_ROLE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")  ?? "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")          ?? "";
const TOGETHER_API_KEY  = Deno.env.get("TOGETHER_API_KEY")           ?? "";
const SERP_API_KEY      = Deno.env.get("SERP_API_KEY")               ?? "";
const STORAGE_BUCKET    = "profile_images";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
  name:      string;
  price:     number | null;
  url:       string;
  image_url: string;
  store:     string;
  style:     string;   // occasion/outfit context
  keywords:  string[];
  colors:    string[];
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
//  STEP 1 — Describe uploaded image (if any)
// ─────────────────────────────────────────────────────────────

async function describeImage(b64: string, mediaType: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type":      "application/json",
      "x-api-key":         ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model:       "claude-opus-4-5",
      max_tokens:  400,
      temperature: 0.2,
      system: `You are a fashion product analyst. The image likely shows an apparel item or clothing product.
Describe it in detail — type of garment, colour, fabric texture if visible, silhouette, any branding, and style notes.
Be specific and accurate. Return only the description, no preamble.`,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: b64 } },
          { type: "text",  text: "Describe this clothing item in detail for fashion search purposes." },
        ],
      }],
    }),
  });
  if (!res.ok) throw new Error(`Image desc ${res.status}`);
  const d = await res.json();
  return (d.content?.[0]?.text ?? "").trim();
}

// ─────────────────────────────────────────────────────────────
//  STEP 2 — Generate outfit concept
// ─────────────────────────────────────────────────────────────

async function generateOutfitConcept(
  goal: string,
  personProfile: string,
  imageDesc: string,
  store: string,
): Promise<OutfitConcept> {
  const imageContext = imageDesc
    ? `\nUSER UPLOADED ITEM:\n${imageDesc}\nIncorporate this item or find similar pieces in the outfit.`
    : "";
  const storeContext = store
    ? `\nPREFERRED STORE: ${store} — prefer pieces findable at ${store}.`
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
//  STEP 3 — Google Shopping search for one piece
// ─────────────────────────────────────────────────────────────

async function searchGoogleShopping(
  piece: PieceConcept,
  store: string,
  occasion: string,
): Promise<ShoppingProduct | null> {
  const q = [
    ...piece.keywords.slice(0, 4),
    store ? `site:${store.toLowerCase().replace(/\s+/g, "")}.com OR "${store}"` : "",
  ].filter(Boolean).join(" ");

  const url = `https://serpapi.com/search?engine=google_shopping&q=${encodeURIComponent(q)}&api_key=${SERP_API_KEY}`;
  console.log(`[shop] Searching: "${q}"`);

  const res = await fetch(url);
  if (!res.ok) { console.warn(`[shop] HTTP ${res.status}`); return null; }

  const data    = await res.json();
  const results = data.shopping_results ?? [];
  if (!results.length) { console.warn(`[shop] No results for "${q}"`); return null; }

  const product = results.find((r: Record<string, unknown>) => r.thumbnail && r.price) ?? results[0];

  const priceRaw = product.extracted_price ?? product.price;
  const price    = typeof priceRaw === "number" ? priceRaw
    : typeof priceRaw === "string" ? parseFloat(priceRaw.replace(/[^0-9.]/g, "")) || null
    : null;

  const storeName = (product.source as string) ?? (store || "Online");

  console.log(`[shop] "${(product.title as string)?.slice(0, 40)}" at ${storeName} | $${price}`);

  return {
    name:      (product.title as string) ?? piece.name,
    price,
    url:       (product.link as string) ?? (product.product_link as string) ?? "#",
    image_url: (product.thumbnail as string) ?? "",
    store:     storeName,
    style:     occasion,
    keywords:  piece.keywords,
    colors:    piece.colors,
  };
}

// ─────────────────────────────────────────────────────────────
//  STEP 4 — Generate SEO slugs via Claude (single call)
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

Return ONLY this JSON — no markdown, no explanation:
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
    console.warn(`[slugs] Claude ${res.status} — using fallback slugs`);
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
    console.warn("[slugs] Non-JSON from Claude — using fallback slugs");
    return fallbackSlugs(concept, products, boardId, pieceIds);
  }
}

// ─────────────────────────────────────────────────────────────
//  STEP 5 — Build mannequin image prompt
// ─────────────────────────────────────────────────────────────

async function buildMannequinPrompt(
  concept: OutfitConcept,
  products: ShoppingProduct[],
  personProfile: string,
): Promise<string> {
  const pieces = products
    .filter(p => p.name)
    .map((p, i) =>
      `${i + 1}. ${p.name} from ${p.store}` +
      (p.keywords?.length ? ` (${p.keywords.slice(0, 3).join(", ")})` : "")
    )
    .join("\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type":      "application/json",
      "x-api-key":         ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model:       "claude-opus-4-5",
      max_tokens:  500,
      temperature: 0.2,
      messages: [{
        role: "user",
        content: `Write an image generation prompt (max 250 words) for a luxury fashion mannequin photo.

MANNEQUIN: Sleek dark articulated mannequin, no face, no human features. Mid-walk stride on a runway platform inside a luxury boutique. Warm pendant lighting, polished marble floor, minimalist boutique background.

OUTFIT to show on mannequin:
${pieces}

COLOUR PALETTE: ${concept.colors.join(", ")}

STYLE CONTEXT: ${personProfile.split("\n").slice(0, 8).join(", ")}

Write as one paragraph. Start "A sleek dark mannequin wearing...". Describe every garment with fabric and fit. End with: "Luxury boutique interior, warm lighting, polished floor, fashion editorial. No text, no logos."

Return ONLY the prompt.`,
      }],
    }),
  });
  if (!res.ok) throw new Error(`Prompt build ${res.status}`);
  const d = await res.json();
  return (d.content?.[0]?.text ?? "").trim();
}

// ─────────────────────────────────────────────────────────────
//  STEP 6 — Generate + upload image
// ─────────────────────────────────────────────────────────────

async function generateImage(prompt: string): Promise<Uint8Array> {
  if (!TOGETHER_API_KEY) throw new Error("TOGETHER_API_KEY not set");
  const res = await fetch("https://api.together.xyz/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${TOGETHER_API_KEY}`,
    },
    body: JSON.stringify({
      model: "black-forest-labs/FLUX.1-schnell",
      prompt, width: 768, height: 1024, steps: 4, n: 1, response_format: "b64_json",
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Together.ai ${res.status}: ${t.slice(0, 200)}`);
  }
  const data   = await res.json();
  const base64 = data.data?.[0]?.b64_json;
  if (!base64) throw new Error("No image data");
  const binary = atob(base64);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function uploadImage(
  db: ReturnType<typeof createClient>,
  bytes: Uint8Array,
  accountId: string,
  filename: string,
): Promise<string> {
  const path = `${accountId}/boards/${filename}`;
  const { error } = await db.storage.from(STORAGE_BUCKET).upload(path, bytes, {
    contentType: "image/png", cacheControl: "3600", upsert: true,
  });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  const { data } = db.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// ─────────────────────────────────────────────────────────────
//  MAIN HANDLER
// ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { account_id, goal, store = "", image_b64, image_type } = await req.json() as {
      account_id:  string;
      goal:        string;
      store?:      string;
      image_b64?:  string;
      image_type?: string;
    };
    if (!account_id) throw new Error("account_id required");
    if (!goal)       throw new Error("goal required");

    console.log(`[board_gen] account=${account_id} goal="${goal}" store="${store}"`);

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
      `AVOID These Colors: ${_j(report.use_sparingly)} — ${_v(report.use_sparingly_description)}`,
      `Face Shape: ${_v(report.face_shape)}`,
      `Jewellery Metals: ${_v(report.metals)}`,
      `Eyewear: ${_v(report.recommended_shapes)}`,
    ].join("\n");

    // ── Describe uploaded image if provided ────────────────────
    let imageDesc = "";
    if (image_b64 && image_type) {
      console.log("[board_gen] Describing uploaded image…");
      imageDesc = await describeImage(image_b64, image_type);
      console.log("[board_gen] Image desc:", imageDesc.slice(0, 100));
    }

    // ── Generate outfit concept ────────────────────────────────
    console.log("[board_gen] Generating outfit concept…");
    const concept = await generateOutfitConcept(goal, personProfile, imageDesc, store);
    console.log(`[board_gen] Concept: "${concept.title}" — ${concept.pieces.length} pieces`);

    // ── Search Google Shopping ─────────────────────────────────
    console.log("[board_gen] Searching Google Shopping…");
    const products: ShoppingProduct[] = [];
    for (const piece of concept.pieces.slice(0, 5)) {
      const product = await searchGoogleShopping(piece, store, concept.occasion);
      products.push(product ?? {
        name:      piece.name,
        price:     null,
        url:       `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(piece.keywords.join(" "))}`,
        image_url: "",
        store:     store || "Online",
        style:     concept.occasion,
        keywords:  piece.keywords,
        colors:    piece.colors,
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
        image_url:       "",   // filled in after image upload
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
      style:         p.style,   // occasion/outfit context
      store:         p.store,   // brand/retailer name
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

    // ── Generate mannequin image ───────────────────────────────
    console.log("[board_gen] Building image prompt…");
    const imgPrompt  = await buildMannequinPrompt(concept, products, personProfile);
    console.log("[board_gen] Generating image…");
    const imageBytes = await generateImage(imgPrompt);
    const filename   = `${account_id}_${Date.now()}_board.png`;
    const imageUrl   = await uploadImage(db, imageBytes, account_id, filename);
    console.log(`[board_gen] Image uploaded → ${imageUrl}`);

    // Update mood_board with final image_url
    await db.from("mood_boards").update({ image_url: imageUrl }).eq("id", board.id);

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
          image_url:   imageUrl,
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
