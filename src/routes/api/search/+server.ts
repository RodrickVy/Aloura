import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const SERP_API_KEY = import.meta.env.VITE_SERP_API_KEY ?? '';

export const GET: RequestHandler = async ({ url, locals }) => {
  const { user } = await locals.safeGetSession();
  if (!user) throw error(401, 'Unauthorised');

  const q     = url.searchParams.get('q') ?? '';
  const store = url.searchParams.get('store') ?? '';
  if (!q.trim()) throw error(400, 'Query required');

  const query = store ? `${q} ${store}` : q;
  const apiUrl = `https://serpapi.com/search?engine=google_shopping&q=${encodeURIComponent(query)}&api_key=${SERP_API_KEY}&num=10`;

  try {
    const res  = await fetch(apiUrl);
    if (!res.ok) throw new Error(`SerpAPI ${res.status}`);
    const data = await res.json();

    const results = (data.shopping_results ?? []).slice(0, 10).map((r: any) => ({
      name:      r.title ?? '',
      store:     r.source ?? store ?? 'Online',
      price:     r.extracted_price ?? (typeof r.price === 'string' ? parseFloat(r.price.replace(/[^0-9.]/g, '')) || null : null),
      url:       r.link ?? r.product_link ?? '#',
      image_url: r.thumbnail ?? '',
      keywords:  (r.title ?? '').split(' ').slice(0, 6).filter(Boolean),
    }));

    return json({ results });
  } catch (e: any) {
    throw error(500, e.message);
  }
};
