import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

const SERP_API_KEY      = env.SERP_API_KEY ?? '';
const ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY ?? '';

interface ProductResult {
  name: string; store: string; price: number | null;
  url: string; image_url: string; keywords: string[];
}

async function serpShopping(query: string, store: string): Promise<ProductResult[]> {
  const q = store ? `${query} ${store}` : query;
  const apiUrl = `https://serpapi.com/search?engine=google_shopping&q=${encodeURIComponent(q)}&api_key=${SERP_API_KEY}&num=20`;
  const res = await fetch(apiUrl);
  if (!res.ok) throw new Error(`SerpAPI ${res.status}`);
  const data = await res.json();
  return (data.shopping_results ?? []).slice(0, 20).map((r: any) => ({
    name:      r.title ?? '',
    store:     r.source ?? store ?? 'Online',
    price:     r.extracted_price ?? (typeof r.price === 'string' ? parseFloat(r.price.replace(/[^0-9.]/g, '')) || null : null),
    url:       r.link ?? r.product_link ?? '#',
    image_url: r.thumbnail ?? '',
    keywords:  (r.title ?? '').split(' ').slice(0, 6).filter(Boolean),
  }));
}

/** Describe an uploaded image into a short search query via Claude vision. */
async function describeImage(b64: string, mediaType: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 60,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
          { type: 'text', text: 'Describe this clothing item as a short shopping search query (e.g. "beige oversized linen blazer"). Return ONLY the query, max 8 words.' },
        ],
      }],
    }),
  });
  if (!res.ok) throw new Error(`Vision ${res.status}`);
  const data = await res.json();
  return (data.content?.[0]?.text ?? '').trim();
}

// Text search (used by editor + discover text product search)
export const GET: RequestHandler = async ({ url, locals }) => {
  const { user } = await locals.safeGetSession();
  if (!user) throw error(401, 'Unauthorised');

  const q     = url.searchParams.get('q') ?? '';
  const store = url.searchParams.get('store') ?? '';
  if (!q.trim()) throw error(400, 'Query required');

  try {
    return json({ results: await serpShopping(q, store) });
  } catch (e: any) {
    throw error(500, e.message);
  }
};

// Text + optional image search (discover product mode)
export const POST: RequestHandler = async ({ request, locals }) => {
  const { user } = await locals.safeGetSession();
  if (!user) throw error(401, 'Unauthorised');

  const { q = '', store = '', image_b64, image_type } = await request.json() as {
    q?: string; store?: string; image_b64?: string; image_type?: string;
  };

  try {
    let query = q.trim();
    // If an image was supplied, turn it into a text query first
    if (image_b64 && image_type) {
      const described = await describeImage(image_b64, image_type);
      query = [described, query].filter(Boolean).join(' ').trim();
    }
    if (!query) throw error(400, 'Query or image required');

    return json({ results: await serpShopping(query, store), resolvedQuery: query });
  } catch (e: any) {
    if (e.status) throw e;
    throw error(500, e.message);
  }
};
