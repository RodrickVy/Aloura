import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

const ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY ?? '';

/**
 * Comprehensive vision analysis of an uploaded apparel/outfit image.
 * Returns:
 *   - search_query: a short shopping query for the main item(s)
 *   - breakdown:    a richer description of the whole look (for outfit generation)
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  const { user } = await locals.safeGetSession();
  if (!user) throw error(401, 'Unauthorised');

  const { image_b64, image_type, mode } = await request.json() as {
    image_b64?: string; image_type?: string; mode?: 'outfit' | 'product';
  };
  if (!image_b64 || !image_type) throw error(400, 'image required');

  const system = `You are a fashion product analyst. Analyse the clothing/outfit in the image.
Identify garments and footwear (type, colour, material, pattern, fit, notable details) - apparel only, ignore background and people.
Respond ONLY with valid JSON, no markdown.`;

  const prompt = mode === 'product'
    ? `Focus on the SINGLE most prominent clothing item in the image (the product someone would shop for).
Return ONLY:
{
  "search_query": "concise shopping query for that item, e.g. 'beige oversized linen blazer', max 8 words",
  "breakdown": "one sentence describing the item in detail"
}`
    : `Describe the WHOLE outfit head to toe.
Return ONLY:
{
  "search_query": "short query capturing the overall look, max 8 words",
  "breakdown": "a detailed head-to-toe description of every garment and shoe: type, colour, material, fit, and overall style/vibe (2-4 sentences)"
}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 400,
        temperature: 0.2,
        system,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: image_type, data: image_b64 } },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });
    if (!res.ok) throw new Error(`Vision ${res.status}`);
    const data = await res.json();
    const raw  = (data.content?.[0]?.text ?? '').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(raw);
    return json({
      search_query: (parsed.search_query ?? '').trim(),
      breakdown:    (parsed.breakdown ?? '').trim(),
    });
  } catch (e: any) {
    console.error('[analyze-image]', e);
    throw error(500, 'Could not analyse image');
  }
};
