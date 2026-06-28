import type { PageServerLoad } from './$types';

const CATEGORY_ORDER: { key: string; label: string }[] = [
  { key: 'streetwear',  label: 'Streetwear' },
  { key: 'formal',      label: 'Formal' },
  { key: 'casual',      label: 'Casual' },
  { key: 'athleisure',  label: 'Athleisure' },
  { key: 'old-money',   label: 'Old Money' },
  { key: 'date-night',  label: 'Date Night' },
  { key: 'nike-tech',   label: 'Nike Tech' },
  { key: 'grunge',      label: 'Grunge' },
  { key: 'y2k',         label: 'Y2K' },
  { key: 'techwear',    label: 'Techwear' },
  { key: 'preppy',      label: 'Preppy' },
  { key: 'gorpcore',    label: 'Gorpcore' },
];

export const load: PageServerLoad = async ({ locals }) => {
  // Public page. Trending products live in trending_products (per category + gender).
  const { data: rows } = await locals.supabase
    .from('trending_products')
    .select('category, gender, slug, name, image_url, price, store, rank')
    .order('rank', { ascending: true });

  const all = rows ?? [];

  const categories = CATEGORY_ORDER
    .map(c => ({
      key:   c.key,
      label: c.label,
      products: all.filter(r => r.category === c.key),
    }))
    .filter(c => c.products.length > 0);

  return { categories };
};
