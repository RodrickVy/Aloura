import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
  const { user } = await locals.safeGetSession();
  if (!user) throw redirect(303, '/auth');

  const { data: report, error: rErr } = await locals.supabase
    .from('style_reports')
    .select('*')
    .eq('id', params.id)
    .single();

  if (rErr || !report) throw error(404, 'Report not found');

  // Load profile images
  const imageIds = [report.profile_image_1_id, report.profile_image_2_id, report.profile_image_3_id].filter(Boolean);
  let profileImages: { id: string; public_url: string }[] = [];
  if (imageIds.length) {
    const { data: imgs } = await locals.supabase
      .from('profile_images')
      .select('id, public_url')
      .in('id', imageIds);
    profileImages = imgs ?? [];
  }

  return { report, profileImages };
};
