import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Discover is now the home page (root "/"). Redirect any old /discover links
// (bookmarks, shared links, returnTo) to "/", preserving query params.
export const load: PageServerLoad = async ({ url }) => {
  throw redirect(308, `/${url.search}`);
};
