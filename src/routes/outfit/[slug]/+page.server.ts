import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
  const { data: board, error: bErr } = await locals.supabase
    .from('mood_boards')
    .select('*')
    .eq('slug', params.slug)
    .single();

  if (bErr || !board) throw error(404, 'Outfit not found');

  const { data: pieces } = await locals.supabase
    .from('pieces')
    .select('*')
    .eq('mood_board_id', board.id)
    .order('created_at', { ascending: true });

  return { board: { ...board, pieces: pieces ?? [] } };
};
