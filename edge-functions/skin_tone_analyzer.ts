/**
 * skin_tone_analyzer
 * Supabase Edge Function - Deno / TypeScript
 *
 * Generalised: takes an image URL directly (no DB coupling). Sends the image
 * to Claude Vision with optional face coordinates, focuses on the skin, and
 * returns { skin_tone, undertone, skin_color_hex }.
 *
 * POST { image_url: string, x?: number, y?: number, width?: number, height?: number }
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

const SYSTEM = `You are a professional colour analyst specialising in personal styling and skin tone analysis.
Focus ONLY on the person's facial skin. Ignore background, clothing, and hair.
Respond ONLY with valid JSON - no markdown, no explanation.`;

const buildUserPrompt = (hasCoords: boolean, x: number, y: number, w: number, h: number) =>
`${hasCoords ? `The face is located at top-left (${x}, ${y}), width ${w}px, height ${h}px. Analyse ONLY the skin within that region.` : "Analyse the facial skin of the main person in the image."}

Return:
1. skin_tone - depth/lightness. One of: Fair, Light, Light-Medium, Medium, Medium-Tan, Tan, Olive, Brown, Deep-Brown, Deep
2. undertone - one of: Warm, Cool, Neutral, Warm-Neutral, Olive
3. skin_color_hex - representative mid-tone hex (#xxxxxx), not the lightest highlight or darkest shadow.

Return ONLY:
{ "skin_tone": "string", "undertone": "Warm | Cool | Neutral | Warm-Neutral | Olive", "skin_color_hex": "#xxxxxx" }`;

function sniffMediaType(buf: Uint8Array): string {
  if (buf[0] === 0x89 && buf[1] === 0x50) return "image/png";
  if (buf[0] === 0x47 && buf[1] === 0x49) return "image/gif";
  if (buf[0] === 0x52 && buf[1] === 0x49) return "image/webp";
  return "image/jpeg";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { image_url, x = 0, y = 0, width = 0, height = 0 } = await req.json() as {
      image_url: string; x?: number; y?: number; width?: number; height?: number;
    };
    if (!image_url) throw new Error("image_url is required");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY secret is not set");

    const r = await fetch(image_url);
    if (!r.ok) throw new Error(`Image fetch failed: HTTP ${r.status}`);
    const bytes = new Uint8Array(await r.arrayBuffer());

    let binary = ""; const CHUNK = 8192;
    for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    const base64 = btoa(binary);
    const mediaType = sniffMediaType(bytes);
    const hasCoords = width > 0 && height > 0;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-opus-4-5", max_tokens: 256, temperature: 0.1, system: SYSTEM,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
            { type: "text", text: buildUserPrompt(hasCoords, x, y, width, height) },
          ],
        }],
      }),
    });
    if (!claudeRes.ok) throw new Error(`Claude ${claudeRes.status}: ${(await claudeRes.text()).slice(0, 300)}`);
    const claudeData = await claudeRes.json();
    const raw = (claudeData.content?.[0]?.text ?? "").replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const result = JSON.parse(raw) as { skin_tone: string; undertone: string; skin_color_hex: string };

    return new Response(JSON.stringify({
      success: true, skin_tone: result.skin_tone, undertone: result.undertone, skin_color_hex: result.skin_color_hex,
    }), { headers: { ...CORS, "Content-Type": "application/json" } });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[skin_tone] Fatal:", msg);
    return new Response(JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
