import type { PageServerLoad } from './$types';

// Display order + labels for the trend categories (matches mood_boards.goal).
const CATEGORY_ORDER: { key: string; label: string }[] = [
  { key: 'streetwear',  label: 'Streetwear' },
  { key: 'formal',      label: 'Formal' },
  { key: 'casual',      label: 'Casual' },
  { key: 'athleisure',  label: 'Athleisure' },
  { key: 'old-money',   label: 'Old Money' },
  { key: 'date-night',  label: 'Date Night' },
];

export const load: PageServerLoad = async ({ locals }) => {
  // Public page. Trend boards are regular public mood_boards in the
  // "trending" category; the trend sub-category is stored in `goal`.
  const { data: boards } = await locals.supabase
    .from('mood_boards')
    .select('id, slug, title, description, goal, created_at')
    .eq('category', 'trending')
    .eq('public', true)
    .order('created_at', { ascending: false });

  const rows = boards ?? [];
  const boardIds = rows.map(b => b.id);

  // Pull piece images for the collages in one query.
  const imagesByBoard: Record<string, string[]> = {};
  if (boardIds.length) {
    const { data: pieces } = await locals.supabase
      .from('pieces')
      .select('mood_board_id, image_url')
      .in('mood_board_id', boardIds);
    for (const p of pieces ?? []) {
      if (!p.image_url) continue;
      (imagesByBoard[p.mood_board_id] ??= []).push(p.image_url);
    }
  }

  // Group boards under their trend category, in display order.
  const categories = CATEGORY_ORDER.map(c => ({
    key:   c.key,
    label: c.label,
    items: rows
      .filter(b => (b.goal ?? '') === c.key)
      .map(b => ({
        id:          b.id,
        title:       b.title,
        description: b.description,
        slug:        b.slug,
        images:      (imagesByBoard[b.id] ?? []).slice(0, 4),
      })),
  })).filter(c => c.items.length > 0);

  return { categories };
};
