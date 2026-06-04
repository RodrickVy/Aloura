import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Returns true if the currently authenticated user is an admin.
 * Uses the secure `is_current_user_admin` RPC — the admins table itself
 * is locked down by RLS, so this is the only way to check.
 */
export async function isAdmin(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_current_user_admin');
  if (error) {
    console.error('[admin] check failed:', error.message);
    return false;
  }
  return data === true;
}
