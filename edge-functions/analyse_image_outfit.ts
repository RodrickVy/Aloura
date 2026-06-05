/**
 * analyse_image_outfit
 * Supabase Edge Function — Deno / TypeScript
 *
 * POST { image_url: string, hint?: string }
 *
 * Detects EVERY distinct outfit/person in the image and returns a long
 * paragraph description for each. If `hint` (the user's typed query) is given,
 * also returns which outfit best matches it.
 *
 * Returns: { outfits: string[], selected_index: number }
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

// Fetch a remote image and return base64 + media type (most reliable for vision)
async function fetchAsBase64(url: string): Promise<{ b64: string; mediaType: string }> {
  console.log("[analyse] fetching image…");
  const res = await fetch(url);
  console.log("[analyse] image fetch status:", res.status, res.headers.get("content-type"));
  if (!res.ok) throw new Error(`fetch image ${res.status} — is the URL publicly reachable?`);
  const mediaType = (res.headers.get("content-type") ?? "image/jpeg").split(";")[0];
  const buf = new Uint8Array(await res.arrayBuffer());
  console.log("[analyse] image bytes:", buf.length);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return { b64: btoa(binary), mediaType };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { image_url, hint } = await req.json() as { image_url: string; hint?: string };
    console.log("[analyse] POST received. hint:", hint ?? "(none)", "url:", image_url?.slice(0, 120));
    if (!image_url) throw new Error("image_url is required");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY secret is not set on this function");

    const { b64, mediaType } = await fetchAsBase64(image_url);
    console.log("[analyse] calling Claude vision…");

    const system = `You are a fashion analyst. Look at the image and describe ONE outfit in detail.
If several people are present, pick the single most prominent outfit (or the one matching the user's hint).
Apparel + footwear only — ignore the background and faces.
Respond ONLY with valid JSON, no markdown.`;

    const prompt = `Describe what the person is wearing, broken down by body area:
- HEAD: any hat, cap, headwear or notable accessory (or "none")
- TORSO: top / shirt / jacket / layers
- LEGS: pants / jeans / shorts / skirt
- FEET: shoes / footwear

For each item give: type of garment, colour, material/fabric, fit/size (e.g. slim, oversized, baggy, cropped), pattern, and any visible brand. Be as detailed as possible.

${hint ? `If multiple outfits are present, prefer the one matching: "${hint}".` : ''}

Return ONLY:
{
  "description": "A single detailed paragraph covering head, torso, legs and feet with type, colour, fit and material for each item."
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
        temperature: 0.3,
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

    const description = (parsed.description ?? "").trim();
    if (!description) throw new Error("No outfit detected in image");
    console.log(`[analyse] ✓ description length ${description.length}`);

    return new Response(JSON.stringify({ description }),
      { headers: { ...CORS, "Content-Type": "application/json" } });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[analyse_image_outfit] Fatal:", msg);
    return new Response(JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
