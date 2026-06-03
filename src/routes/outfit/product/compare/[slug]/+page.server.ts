import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
  const slugs = params.slug.split('--vs--').filter(Boolean);
  if (slugs.length < 1) throw error(400, 'No products specified');

  const { data: pieces, error: pErr } = await locals.supabase
    .from('pieces')
    .select('*')
    .in('slug', slugs);

  if (pErr) throw error(500, 'Failed to load products');

  // Return in URL order (DB may return in any order)
  const ordered = slugs
    .map(s => (pieces ?? []).find(p => p.slug === s))
    .filter(Boolean);

  if (!ordered.length) throw error(404, 'Products not found');

  // Load board for context from the first piece
  const { data: board } = await locals.supabase
    .from('mood_boards')
    .select('id, title, slug, occasion')
    .eq('id', ordered[0].mood_board_id)
    .maybeSingle();

  return { pieces: ordered, slugs, board };
};
