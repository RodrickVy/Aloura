import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
  const category = decodeURIComponent(params.category).trim();

  const { data: boards, error: bErr } = await locals.supabase
    .from('mood_boards')
    .select('id, title, description, goal, occasion, category, colors, image_url, slug, created_at')
    .eq('public', true)
    .eq('is_official', true)
    .is('comparison_of', null)
    .ilike('category', category)
    .order('created_at', { ascending: false });

  if (bErr) throw error(500, 'Failed to load category');
  if (!boards?.length) throw error(404, 'Category not found');

  // Attach pieces for collages
  const ids = boards.map(b => b.id);
  const { data: pieces } = await locals.supabase
    .from('pieces').select('id, mood_board_id, image_url, price').in('mood_board_id', ids);

  const withPieces = boards.map(b => ({
    ...b,
    pieces: (pieces ?? []).filter(p => p.mood_board_id === b.id),
  }));

  // Category header image
  const { data: cat } = await locals.supabase
    .from('categories').select('image_url').ilike('name', category).maybeSingle();

  return { category, image: cat?.image_url ?? null, boards: withPieces };
};
