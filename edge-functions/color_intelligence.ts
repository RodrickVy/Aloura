/**
 * color_intelligence
 * Supabase Edge Function - Deno / TypeScript
 *
 * POST { image_url: string }
 *
 * Takes a photo of a person, runs the necessary skin-analysis step
 * (skin tone + undertone via Claude vision), then returns a flattering
 * clothing colour palette. That's it - no DB reads, no style_report
 * writes, no style_bible. Just the colours.
 *
 * Returns: { skin_tone, undertone, colors: [{ hex, name }] }
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

// ── Fetch a remote image and base64-encode it ──────────────────
async function fetchAsBase64(url: string): Promise<{ b64: string; mediaType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch image ${res.status}`);
  const mediaType = (res.headers.get("content-type") ?? "image/jpeg").split(";")[0];
  const buf = new Uint8Array(await res.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) binary += String.fromCharCode(...buf.subarray(i, i + chunk));
  return { b64: btoa(binary), mediaType };
}

const SYSTEM = `You are a professional personal colour analyst (seasonal colour analysis).
Step 1: assess the person's skin tone and undertone from the photo.
Step 2: from that, recommend a palette of real, wearable CLOTHING colours that flatter them
(never skin-tone colours themselves).
Respond with valid JSON only - no markdown, no preamble.`;

const PROMPT = `Analyse the person in this photo and recommend 8-10 flattering clothing colours.
Each colour needs a real hex code and a short human name.
Return ONLY:
{
  "skin_tone": "short description",
  "undertone": "warm | cool | neutral",
  "colors": [ { "hex": "#RRGGBB", "name": "Colour name" } ]
}`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { image_url } = await req.json() as { image_url: string };
    if (!image_url) throw new Error("image_url is required");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY secret is not set");

    const { b64, mediaType } = await fetchAsBase64(image_url);

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-5",
        max_tokens: 700,
        temperature: 0.3,
        system: SYSTEM,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: b64 } },
            { type: "text", text: PROMPT },
          ],
        }],
      }),
    });

    if (!res.ok) throw new Error(`Claude ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const raw  = (data.content?.[0]?.text ?? "").replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(raw);

    const colors = Array.isArray(parsed.colors)
      ? parsed.colors.filter((c: any) => typeof c?.hex === "string").slice(0, 12)
      : [];
    if (!colors.length) throw new Error("No colours returned");

    return new Response(JSON.stringify({
      skin_tone: parsed.skin_tone ?? "",
      undertone: parsed.undertone ?? "",
      colors,
    }), { headers: { ...CORS, "Content-Type": "application/json" } });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[color_intelligence] Fatal:", msg);
    return new Response(JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
