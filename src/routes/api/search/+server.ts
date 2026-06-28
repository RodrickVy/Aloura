import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

const SERP_API_KEY = env.SERP_API_KEY ?? '';

interface ProductResult {
  name: string; store: string; price: number | null;
  url: string; image_url: string; keywords: string[];
}

const GENDER_TERM: Record<string, string> = { mens: "men's", womens: "women's", unisex: 'unisex' };

// ── Short-TTL in-memory cache (per warm server instance) ──
const TTL = 12 * 60 * 1000; // 12 minutes
const cache = new Map<string, { at: number; results: ProductResult[] }>();

const normTitle = (s: string) => (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

async function serpShopping(query: string, store: string, gender: string, maxPrice: number | null): Promise<ProductResult[]> {
  const genderTerm = GENDER_TERM[gender] ?? '';
  const q = [genderTerm, query, store].filter(Boolean).join(' ').trim();

  const cacheKey = `${gender}|${maxPrice ?? ''}|${store}|${q}`.toLowerCase();
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL) return hit.results;

  const apiUrl = `https://serpapi.com/search?engine=google_shopping&q=${encodeURIComponent(q)}&api_key=${SERP_API_KEY}&num=60`;
  const res = await fetch(apiUrl);
  if (!res.ok) throw new Error(`SerpAPI ${res.status}`);
  const data = await res.json();

  const raw: ProductResult[] = (data.shopping_results ?? []).map((r: any) => ({
    name:      r.title ?? '',
    store:     r.source ?? store ?? 'Online',
    price:     r.extracted_price ?? (typeof r.price === 'string' ? parseFloat(r.price.replace(/[^0-9.]/g, '')) || null : null),
    url:       r.link ?? r.product_link ?? '#',
    image_url: r.thumbnail ?? '',
    keywords:  (r.title ?? '').split(' ').slice(0, 6).filter(Boolean),
  }));

  // Drop junk: must have a real image, a price, and a name.
  let results = raw.filter(r => r.name && r.image_url && r.price != null);

  // Price cap.
  if (maxPrice) results = results.filter(r => (r.price as number) <= maxPrice);

  // Dedupe near-duplicate listings (same normalised title + store, or same url).
  const seen = new Set<string>();
  results = results.filter(r => {
    const key = `${normTitle(r.name)}|${(r.store ?? '').toLowerCase()}`;
    const urlKey = r.url;
    if (seen.has(key) || seen.has(urlKey)) return false;
    seen.add(key); seen.add(urlKey);
    return true;
  });

  results = results.slice(0, 24);
  cache.set(cacheKey, { at: Date.now(), results });
  return results;
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
