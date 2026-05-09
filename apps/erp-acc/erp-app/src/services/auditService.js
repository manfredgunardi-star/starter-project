import { supabase } from '../lib/supabase'

/**
 * Fetch audit logs with optional filters.
 * @param {{ tableName?: string, recordId?: string, startDate?: string, endDate?: string, limit?: number }} opts
 */
export async function getAuditLogs({ tableName, recordId, startDate, endDate, limit = 200 } = {}) {
  let q = supabase
    .from('audit_logs')
    .select(`
      id,
      table_name,
      record_id,
      action,
      old_data,
      new_data,
      created_at,
      user:user_id ( id, email )
    `)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (tableName) q = q.eq('table_name', tableName)
  if (recordId)  q = q.eq('record_id', recordId)
  if (startDate) q = q.gte('created_at', startDate + 'T00:00:00')
  if (endDate)   q = q.lte('created_at', endDate + 'T23:59:59')

  const { data, error } = await q
  if (error) throw error
  return data
}
