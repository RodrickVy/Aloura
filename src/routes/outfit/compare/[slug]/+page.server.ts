import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url, locals }) => {
  const { user } = await locals.safeGetSession();

  // Load original board by slug
  const { data: original, error: oErr } = await locals.supabase
    .from('mood_boards')
    .select('*')
    .eq('slug', params.slug)
    .single();

  if (oErr || !original) throw error(404, 'Board not found');

  // Load pieces for original board
  const { data: originalPieces } = await locals.supabase
    .from('pieces')
    .select('*')
    .eq('mood_board_id', original.id)
    .order('created_at', { ascending: true });

  // Parse ?stores= query param → ['amazon', 'zara', ...]
  const storesParam = url.searchParams.get('stores') ?? '';
  const storeNames  = storesParam.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

  // Load comparison boards that already exist for each requested store
  let comparisonBoards: any[] = [];
  if (storeNames.length) {
    const { data: cBoards } = await locals.supabase
      .from('mood_boards')
      .select('*')
      .eq('comparison_of', original.id)
      .in('store_name', storeNames);

    if (cBoards?.length) {
      // Load pieces for each comparison board
      const cIds = cBoards.map(b => b.id);
      const { data: cPieces } = await locals.supabase
        .from('pieces')
        .select('*')
        .in('mood_board_id', cIds)
        .order('created_at', { ascending: true });

      comparisonBoards = cBoards.map(b => ({
        ...b,
        pieces: (cPieces ?? []).filter(p => p.mood_board_id === b.id),
      }));
    }
  }

  // Resolve the viewer's account id (null for anon)
  let viewerAccountId: string | null = null;
  if (user) {
    const { data: acc } = await locals.supabase
      .from('accounts').select('id').eq('auth_id', user.id).maybeSingle();
    viewerAccountId = acc?.id ?? null;
  }

  return {
    original: { ...original, pieces: originalPieces ?? [] },
    comparisonBoards,
    storeNames,        // stores requested in URL (some may not have boards yet)
    isLoggedIn: !!user,
    viewerAccountId,
  };
};
