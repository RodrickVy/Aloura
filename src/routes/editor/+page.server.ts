import { redirect, error } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/admin';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const { user } = await locals.safeGetSession();
  if (!user) throw redirect(303, '/');

  if (!(await isAdmin(locals.supabase))) throw error(404, 'Not found');

  const { data: account } = await locals.supabase
    .from('accounts').select('id').eq('auth_id', user.id).maybeSingle();
  if (!account) throw redirect(303, '/account');

  const { data: boards, error: bErr } = await locals.supabase
    .from('mood_boards')
    .select('id, title, description, occasion, image_url, slug, public, created_at')
    .eq('account_id', account.id)
    .is('comparison_of', null)
    .order('created_at', { ascending: false });

  if (bErr) {
    console.error('[editor] boards query failed:', bErr.message);
    throw error(500, bErr.message);
  }

  const boardIds = (boards ?? []).map(b => b.id);
  let pieces: any[] = [];
  if (boardIds.length) {
    const { data: p, error: pErr } = await locals.supabase
      .from('pieces')
      .select('id, mood_board_id, image_url')
      .in('mood_board_id', boardIds);
    if (pErr) console.error('[editor] pieces query failed:', pErr.message);
    pieces = p ?? [];
  }

  const boardsWithPieces = (boards ?? []).map(b => ({
    ...b,
    pieces: pieces.filter(p => p.mood_board_id === b.id),
  }));

  return { boards: boardsWithPieces, accountId: account.id };
};
