import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

const ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY ?? '';

export const POST: RequestHandler = async ({ request, locals }) => {
  const { user } = await locals.safeGetSession();
  if (!user) throw error(401, 'Unauthorised');

  const { pieces } = await request.json() as { pieces: { name?: string; store?: string; style?: string; image_url?: string }[] };
  if (!pieces?.length) return json({ colors: [] });

  // Build context from all pieces
  const pieceContext = pieces.map(p =>
    `- ${p.name ?? 'Unknown item'} from ${p.store ?? 'unknown store'}${p.style ? `, style: ${p.style}` : ''}`
  ).join('\n');

  const imageContent = pieces
    .filter(p => p.image_url && p.image_url.startsWith('http'))
    .slice(0, 3) // max 3 images to keep prompt fast
    .map(p => ({ type: 'image', source: { type: 'url', url: p.image_url! } }));

  const messages: any[] = [{
    role: 'user',
    content: [
      ...imageContent,
      {
        type: 'text',
        text: `You are a fashion color analyst. Based on these outfit pieces${imageContent.length ? ' and their images' : ''}:

${pieceContext}

Extract the dominant colors visible in this outfit. Return 4-6 hex color codes that best represent the outfit's color palette.

Rules:
- Use exact hex codes (#RRGGBB format)
- Include the most prominent colors
- Mix neutrals and accent colors realistically
- Return ONLY a JSON array of hex strings, nothing else

Example: ["#2C2C2C", "#C4906A", "#D4C9BE", "#8B7355"]`,
      },
    ],
  }];

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
        max_tokens: 100,
        messages,
      }),
    });

    if (!res.ok) throw new Error(`Claude ${res.status}`);
    const data = await res.json();
    const raw  = (data.content?.[0]?.text ?? '').trim();
    const colors = JSON.parse(raw);
    return json({ colors: Array.isArray(colors) ? colors : [] });
  } catch (e) {
    console.error('[detect-colors]', e);
    return json({ colors: [] });
  }
};
