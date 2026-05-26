import { supabase } from '../lib/supabase'

/**
 * Soft-delete a single row by setting is_active=false, deleted_at, deleted_by.
 * Table must have columns: is_active (boolean), deleted_at (timestamptz), deleted_by (uuid).
 */
export async function softDelete(table, id) {
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase
    .from(table)
    .update({
      is_active: false,
      deleted_at: new Date().toISOString(),
      deleted_by: user?.id ?? null,
    })
    .eq('id', id)
  if (error) throw error
}
