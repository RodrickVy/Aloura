import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

const SERP_API_KEY = env.SERP_API_KEY ?? '';

interface ProductResult {
  name: string; store: string; price: number | null;
  url: string; image_url: string; keywords: string[];
}

const GENDER_TERM: Record<string, string> = { mens: "men's", womens: "women's", unisex: 'unisex' };

// Pure SerpAPI Google Shopping - raw product data only, no AI enrichment.
async function serpShopping(query: string, store: string, gender: string, maxPrice: number | null): Promise<ProductResult[]> {
  // Bias the query toward the chosen gender so results match.
  const genderTerm = GENDER_TERM[gender] ?? '';
  const q = [genderTerm, query, store].filter(Boolean).join(' ');
  const apiUrl = `https://serpapi.com/search?engine=google_shopping&q=${encodeURIComponent(q)}&api_key=${SERP_API_KEY}&num=40`;
  const res = await fetch(apiUrl);
  if (!res.ok) throw new Error(`SerpAPI ${res.status}`);
  const data = await res.json();

  let results: ProductResult[] = (data.shopping_results ?? []).map((r: any) => ({
    name:      r.title ?? '',
    store:     r.source ?? store ?? 'Online',
    price:     r.extracted_price ?? (typeof r.price === 'string' ? parseFloat(r.price.replace(/[^0-9.]/g, '')) || null : null),
    url:       r.link ?? r.product_link ?? '#',
    image_url: r.thumbnail ?? '',
    keywords:  (r.title ?? '').split(' ').slice(0, 6).filter(Boolean),
  }));

  // Price cap (keep items with no price so we don't over-filter).
  if (maxPrice) results = results.filter(r => r.price == null || r.price <= maxPrice);

  return results.slice(0, 20);
}

export const GET: RequestHandler = async ({ url, locals }) => {
  const { user } = await locals.safeGetSession();
  if (!user) throw error(401, 'Unauthorised');

  const q        = url.searchParams.get('q') ?? '';
  const store    = url.searchParams.get('store') ?? '';
  const gender   = url.searchParams.get('gender') ?? '';
  const maxPrice = parseFloat(url.searchParams.get('max_price') ?? '') || null;
  if (!q.trim()) throw error(400, 'Query required');

  try {
    return json({ results: await serpShopping(q, store, gender, maxPrice) });
  } catch (e: any) {
    throw error(500, e.message);
  }
};
