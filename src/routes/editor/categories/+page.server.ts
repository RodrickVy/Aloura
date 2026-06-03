import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const { user } = await locals.safeGetSession();
  if (!user) throw redirect(303, '/');

  const { data: categories } = await locals.supabase
    .from('categories')
    .select('*')
    .order('name');

  return { categories: categories ?? [] };
};
