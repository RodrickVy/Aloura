import { error, redirect } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/admin';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
  const { user } = await locals.safeGetSession();
  if (!user) throw redirect(303, '/');

  if (!(await isAdmin(locals.supabase))) throw error(404, 'Not found');

  const { data: account } = await locals.supabase
    .from('accounts').select('id').eq('auth_id', user.id).maybeSingle();
  if (!account) throw redirect(303, '/account');

  const { data: board, error: bErr } = await locals.supabase
    .from('mood_boards')
    .select('*')
    .eq('id', params.id)
    .eq('account_id', account.id) // ensure ownership
    .single();

  if (bErr || !board) throw error(404, 'Board not found');

  const [{ data: pieces }, { data: categories }] = await Promise.all([
    locals.supabase.from('pieces').select('*').eq('mood_board_id', board.id).order('created_at', { ascending: true }),
    locals.supabase.from('categories').select('id, name, description, image_url').order('name'),
  ]);

  return { board, pieces: pieces ?? [], categories: categories ?? [], accountId: account.id };
};
