import type { PageServerLoad } from './$types';

// About / landing page - informational, viewable by everyone (no redirect).
export const load: PageServerLoad = async ({ locals }) => {
  // Recent public moodboards for the Pinterest grid.
  const { data: boards } = await locals.supabase
    .from('mood_boards')
    .select('id, title, image_url, occasion, slug, colors')
    .not('image_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(40);

  return { boards: boards ?? [] };
};
