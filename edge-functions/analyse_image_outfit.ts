/**
 * analyse_image_outfit
 * Supabase Edge Function - Deno / TypeScript
 *
 * POST { image_url: string, hint?: string }
 *
 * Vision analysis of an outfit photo, tuned for SHOPPING. Instead of one prose
 * blob it returns a structured per-garment breakdown, each item with its own
 * tight Google-Shopping search query, plus an overall description for outfit
 * generation.
 *
 * Returns:
 * {
 *   description:   string,            // head-to-toe paragraph (for board generator)
 *   gender:        "mens"|"womens"|"unisex"|"unknown",
 *   primary_index: number,            // index of the main / hint-matched item
 *   items: [{
 *     category:     "head"|"top"|"outerwear"|"bottom"|"footwear"|"accessory",
 *     type:         string,           // e.g. "oversized linen blazer"
 *     color:        string,
 *     material:     string | null,    // null if not confidently visible
 *     fit:          string | null,
 *     pattern:      string | null,
 *     brand:        string | null,    // only if a logo is clearly legible
 *     search_query: string,           // tight shopping query for this item
 *     confidence:   "high"|"medium"|"low"
 *   }]
 * }
 *
 * Secrets: ANTHROPIC_API_KEY
 */

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
  "Access-Control-Max-Age":       "86400",
};

const CATEGORIES = ["head", "top", "outerwear", "bottom", "footwear", "accessory"] as const;
type Category = typeof CATEGORIES[number];

interface Item {
  category:     Category;
  type:         string;
  color:        string;
  material:     string | null;
  fit:          string | null;
  pattern:      string | null;
  brand:        string | null;
  search_query: string;
  confidence:   "high" | "medium" | "low";
}

// Detect the REAL image type from the file's magic bytes. Storage often
// serves a wrong/generic Content-Type, and Claude rejects a base64 image
// whose declared media type doesn't match the actual bytes.
function sniffMediaType(buf: Uint8Array): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf.length >= 6 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "image/gif";
  // WEBP: "RIFF"...."WEBP"
  if (buf.length >= 12 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46
      && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return "image/webp";
  return null;
}

// Fetch a remote image and return base64 + media type (most reliable for vision)
async function fetchAsBase64(url: string): Promise<{ b64: string; mediaType: string }> {
  console.log("[analyse] fetching image…");
  const res = await fetch(url);
  console.log("[analyse] image fetch status:", res.status, res.headers.get("content-type"));
  if (!res.ok) throw new Error(`fetch image ${res.status} - is the URL reachable?`);
  const buf = new Uint8Array(await res.arrayBuffer());
  console.log("[analyse] image bytes:", buf.length);

  // Prefer the real format sniffed from bytes; fall back to the header.
  const headerType = (res.headers.get("content-type") ?? "").split(";")[0];
  const sniffed    = sniffMediaType(buf);
  const allowed    = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  const mediaType  = sniffed ?? (allowed.includes(headerType) ? headerType : "image/jpeg");
  console.log("[analyse] media type - header:", headerType, "sniffed:", sniffed, "using:", mediaType);

  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) binary += String.fromCharCode(...buf.subarray(i, i + chunk));
  return { b64: btoa(binary), mediaType };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { image_url, hint } = await req.json() as { image_url: string; hint?: string };
    console.log("[analyse] POST. hint:", hint ?? "(none)", "url:", image_url?.slice(0, 120));
    if (!image_url) throw new Error("image_url is required");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY secret is not set on this function");

    const { b64, mediaType } = await fetchAsBase64(image_url);
    console.log("[analyse] calling Claude vision…");

    const system = `You are an expert fashion product analyst for a clothing shopping app.
Your job: look at the photo and identify EXACTLY what clothing the person is wearing, so each
garment can be searched for and bought online. Accuracy matters more than detail.

Hard rules:
- Describe APPAREL, FOOTWEAR and worn ACCESSORIES only. Ignore the background, scenery and faces.
- Output ONE item per distinct garment actually visible. Do NOT invent items: if the legs or feet
  are cropped out of frame or hidden, do not include them.
- If several people are present, focus on the single most prominent person (or the one matching the
  user's hint) and describe only their outfit.
- BRAND: only fill "brand" if a logo or wordmark is clearly legible. If you are guessing, use null.
  Never guess a brand from style alone.
- MATERIAL / PATTERN: only state them if visually obvious; otherwise use null. Do not hallucinate fabric.
- COLOR: use a concrete, shoppable colour name (e.g. "charcoal grey", "cream", "washed indigo").
- search_query: a tight Google-Shopping style query a shopper would type, 3-7 words, in the form
  "<gender> <colour> <fit/detail> <garment>" (e.g. "mens cream oversized linen blazer"). No punctuation.
- confidence: "high" if the garment is clearly visible and unambiguous, "medium" if partly obscured,
  "low" if you are largely inferring it.

Respond ONLY with valid JSON. No markdown, no commentary.`;

    const prompt = `Identify every clothing item the person is wearing, head to toe.

For EACH visible garment return an object with:
- "category": one of ["head","top","outerwear","bottom","footwear","accessory"]
- "type": specific garment name (e.g. "oversized linen blazer", "straight-leg jeans")
- "color": concrete shoppable colour name
- "material": fabric if obvious, else null
- "fit": fit/silhouette if visible (e.g. slim, relaxed, oversized, cropped, tailored), else null
- "pattern": pattern if any (e.g. striped, plaid, solid), else null
- "brand": brand ONLY if a logo is clearly legible, else null
- "search_query": 3-7 word shoppable query "<gender> <colour> <fit> <garment>"
- "confidence": "high" | "medium" | "low"

Also return:
- "gender": "mens" | "womens" | "unisex" | "unknown" (your best read of how the items are styled/cut)
- "primary_index": index in the items array of the single most prominent garment${hint ? `, preferring the item that best matches the user's request: "${hint}"` : ""}
- "description": one natural head-to-toe paragraph summarising the whole look, for outfit recreation
${hint ? `\nThe user is specifically interested in: "${hint}". Make sure that item is included and set as primary_index if present.` : ""}

Return ONLY this JSON shape:
{
  "gender": "...",
  "primary_index": 0,
  "description": "...",
  "items": [
    { "category":"...", "type":"...", "color":"...", "material":null, "fit":null, "pattern":null, "brand":null, "search_query":"...", "confidence":"high" }
  ]
}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-5",
        max_tokens: 1500,
        temperature: 0,                 // deterministic factual extraction
        system,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: b64 } },
            { type: "text", text: prompt },
          ],
        }],
      }),
    });

    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Claude ${res.status}: ${t.slice(0, 200)}`);
    }

    const data = await res.json();
    const raw  = (data.content?.[0]?.text ?? "").replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    console.log("[analyse] Claude raw (first 200):", raw.slice(0, 200));
    const parsed = JSON.parse(raw);

    // ── Normalise / validate ──────────────────────────────────
    const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
    const items: Item[] = rawItems
      .filter((it: any) => it && typeof it.type === "string" && it.type.trim())
      .map((it: any) => {
        const category: Category = CATEGORIES.includes(it.category) ? it.category : "accessory";
        const clean = (v: unknown) =>
          typeof v === "string" && v.trim() && v.trim().toLowerCase() !== "null" ? v.trim() : null;
        const type  = String(it.type).trim();
        const color = clean(it.color) ?? "";
        const query = clean(it.search_query) ?? `${color} ${type}`.trim();
        const conf  = ["high", "medium", "low"].includes(it.confidence) ? it.confidence : "medium";
        return {
          category,
          type,
          color,
          material:     clean(it.material),
          fit:          clean(it.fit),
          pattern:      clean(it.pattern),
          brand:        clean(it.brand),
          search_query: query.replace(/[^\w\s-]/g, "").replace(/\s+/g, " ").trim(),
          confidence:   conf,
        };
      });

    if (!items.length) throw new Error("No clothing detected in image");

    let primary = Number.isInteger(parsed.primary_index) ? parsed.primary_index : 0;
    if (primary < 0 || primary >= items.length) primary = 0;

    const gender = ["mens", "womens", "unisex", "unknown"].includes(parsed.gender)
      ? parsed.gender : "unknown";

    // Build a reliable description even if the model omitted one
    const description = (typeof parsed.description === "string" && parsed.description.trim())
      ? parsed.description.trim()
      : items.map(i => `${i.color} ${i.fit ?? ""} ${i.type}`.replace(/\s+/g, " ").trim()).join(", ");

    console.log(`[analyse] ✓ ${items.length} items, gender=${gender}, primary=${primary}`);

    return new Response(
      JSON.stringify({ description, gender, primary_index: primary, items }),
      { headers: { ...CORS, "Content-Type": "application/json" } },
    );

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[analyse_image_outfit] Fatal:", msg);
    return new Response(JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
