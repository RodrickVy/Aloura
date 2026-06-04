import { redirect, error } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/admin';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const { user } = await locals.safeGetSession();
  if (!user) throw redirect(303, '/');

  if (!(await isAdmin(locals.supabase))) throw error(404, 'Not found');

  const { data: categories } = await locals.supabase
    .from('categories')
    .select('*')
    .order('name');

  return { categories: categories ?? [] };
};
