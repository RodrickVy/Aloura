/**
 * style_report_creator
 * Supabase Edge Function - Deno / TypeScript
 *
 * POST { style_report_id: string }
 *
 * Generates a full personal Style Report:
 *   1. Reads the style_report row (questionnaire answers + photo URLs).
 *   2. face_analyze(close_up_url)      -> face shape, position, hair, gender.
 *   3. skin_tone_analyzer(close_up)    -> skin tone, undertone, hex.
 *   4. Claude synthesises colour sets, colours to avoid, accessories, frames,
 *      recommended styles + a signature style, and a summary.
 *   5. Writes everything back to style_report and sets status='ready'.
 *
 * Built to reuse the existing analysis functions and focus on accuracy.
 *
 * Secrets: ANTHROPIC_API_KEY   Auto-injected: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")               ?? "";
const SERVICE_ROLE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")  ?? "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")          ?? "";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
  "Access-Control-Max-Age":       "86400",
};

const STYLES = [
  "Classic / Timeless", "Minimalist", "Streetwear", "Old Money / Quiet Luxury", "Smart Casual",
  "Formal / Tailored", "Black-tie / Tuxedo", "Business", "Athleisure / Sporty", "Y2K",
  "Vintage / Retro", "Bohemian", "Grunge", "Preppy", "Nerdy / Geek-chic", "Edgy / Punk",
  "Techwear", "Normcore", "Avant-garde", "Cottagecore", "Coastal / Resort", "Western",
  "Gorpcore / Outdoor", "Romantic / Date-night", "Festival",
];

async function callFn(name: string, body: unknown): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_ROLE_KEY}`, "apikey": SERVICE_ROLE_KEY },
    body: JSON.stringify(body),
  });
  if (!res.ok) { console.warn(`[style_report] ${name} HTTP ${res.status}`); return null; }
  return await res.json();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { style_report_id } = await req.json() as { style_report_id: string };
    if (!style_report_id) throw new Error("style_report_id is required");

    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    const { data: rep, error: rErr } = await db.from("style_report").select("*").eq("id", style_report_id).single();
    if (rErr || !rep) throw new Error(`Style report not found: ${style_report_id}`);

    console.log(`[style_report] generating ${style_report_id} for account ${rep.account_id}`);

    // ── 1. Face analysis (face shape, position, hair) from the close-up ──
    let faceShape = "Unknown", facePos: any = null, hairColor = "Unknown";
    if (rep.close_up_url) {
      const face = await callFn("face_analyze", { image_url: rep.close_up_url });
      const m = face?.manifest;
      if (m) {
        faceShape = m.face_shape?.value ?? "Unknown";
        facePos   = m.face_position ?? null;
        hairColor = m.hair?.color?.value ?? "Unknown";
      }
      console.log(`[style_report] face_shape=${faceShape}`);
    }

    // ── 2. Skin tone / undertone ──
    let skinTone = "Unknown", undertone = "Neutral", skinHex = "";
    if (rep.close_up_url) {
      const skin = await callFn("skin_tone_analyzer", {
        image_url: rep.close_up_url,
        ...(facePos ? { x: facePos.x, y: facePos.y, width: facePos.width, height: facePos.height } : {}),
      });
      if (skin?.success) { skinTone = skin.skin_tone; undertone = skin.undertone; skinHex = skin.skin_color_hex; }
      console.log(`[style_report] skin=${skinTone} undertone=${undertone}`);
    }

    // ── 3. Claude synthesis ──
    const profile = [
      `Gender: ${rep.gender ?? "unspecified"}`,
      `Height: ${rep.height_cm ? rep.height_cm + "cm" : "unspecified"}`,
      `Dressing vibe: ${rep.vibe ?? "unspecified"}`,
      `Dresses for: ${(rep.occasions ?? []).join(", ") || "unspecified"}`,
      `Dressing goal: ${rep.goal ?? "unspecified"}`,
      `Styles they're drawn to: ${(rep.selected_styles ?? []).join(", ") || "unspecified"}`,
      `Skin tone: ${skinTone}`,
      `Undertone: ${undertone}`,
      `Skin hex: ${skinHex || "n/a"}`,
      `Face shape: ${faceShape}`,
      `Hair colour: ${hairColor}`,
    ].join("\n");

    const system = `You are a master personal stylist and colour analyst. You build precise, flattering,
data-grounded style reports - not generic AI fluff. Base colour choices on the person's undertone and skin tone,
frame choices on their face shape, and style choices on their stated vibe, occasions and the styles they're drawn to.
Respond ONLY with valid JSON.`;

    const prompt = `Build a personal style report for this person.

PERSON:
${profile}

AVAILABLE STYLES (choose recommended_styles ONLY from this list):
${STYLES.join(", ")}

Return ONLY this JSON:
{
  "color_sets": [
    { "label": "Bold",    "colors": ["#hex","#hex","#hex"], "note": "one sentence on when/why these work" },
    { "label": "Neutral", "colors": ["#hex","#hex","#hex"], "note": "..." },
    { "label": "Soft",    "colors": ["#hex","#hex","#hex"], "note": "..." }
  ],
  "avoid_colors": { "colors": ["#hex","#hex","#hex"], "note": "one sentence why these wash them out / clash" },
  "accessories":  { "metals": "gold | silver | both", "chains": "short note", "earrings": "short note", "note": "one sentence overall" },
  "frames":       { "shapes": ["shape1","shape2"], "note": "one sentence tying it to their ${faceShape} face shape" },
  "recommended_styles": ["3-5 styles from the list that suit them"],
  "signature_style": "the single best style for them",
  "summary": "2-3 sentence personal summary of their style identity"
}

All hex codes must be real wearable clothing colours grounded in their ${undertone} undertone.`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-opus-4-5", max_tokens: 1500, temperature: 0.4, system, messages: [{ role: "user", content: prompt }] }),
    });
    if (!res.ok) throw new Error(`Claude ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const raw  = (data.content?.[0]?.text ?? "").replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const out  = JSON.parse(raw);

    // ── 4. Save ──
    const { error: upErr } = await db.from("style_report").update({
      skin_tone:          skinTone,
      undertone,
      face_shape:         faceShape,
      color_sets:         out.color_sets ?? [],
      avoid_colors:       out.avoid_colors ?? {},
      accessories:        out.accessories ?? {},
      frames:             out.frames ?? {},
      recommended_styles: out.recommended_styles ?? [],
      signature_style:    out.signature_style ?? "",
      summary:            out.summary ?? "",
      status:             "ready",
      updated_at:         new Date().toISOString(),
    }).eq("id", style_report_id);
    if (upErr) throw new Error(`Save failed: ${upErr.message}`);

    return new Response(JSON.stringify({ success: true, style_report_id, status: "ready" }),
      { headers: { ...CORS, "Content-Type": "application/json" } });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[style_report_creator] Fatal:", msg);
    return new Response(JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
