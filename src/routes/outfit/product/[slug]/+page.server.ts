import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
  const { data: piece, error: pErr } = await locals.supabase
    .from('pieces')
    .select('*')
    .eq('slug', params.slug)
    .single();

  if (pErr || !piece) throw error(404, 'Product not found');

  // Load the parent board for context
  const { data: board } = await locals.supabase
    .from('mood_boards')
    .select('id, title, slug, occasion, image_url')
    .eq('id', piece.mood_board_id)
    .maybeSingle();

  return { piece, board };
};
