import { supabase } from '../lib/supabase'

/**
 * Preview pending depreciation schedules for a given period range.
 * Returns array of { asset, rows, total } grouped by asset (active assets only).
 */
export async function previewPeriod({ period_from, period_to }) {
  if (!period_from || !period_to) throw new Error('period_from dan period_to wajib diisi')

  const { data, error } = await supabase
    .from('depreciation_schedules')
    .select(`
      id, asset_id, period, amount, status,
      asset:assets(code, name, status, category:asset_categories(code, name))
    `)
    .gte('period', period_from)
    .lte('period', period_to)
    .eq('status', 'pending')
    .order('period')
    .order('asset_id')

  if (error) throw error

  const byAsset = new Map()
  for (const row of data) {
    if (row.asset.status !== 'active') continue
    const key = row.asset_id
    if (!byAsset.has(key)) {
      byAsset.set(key, { asset: row.asset, rows: [], total: 0 })
    }
    const bucket = byAsset.get(key)
    bucket.rows.push(row)
    bucket.total += Number(row.amount)
  }
  return Array.from(byAsset.values())
}

/**
 * Post depreciation batch for a given period range.
 * Returns { posted, skipped, errors }.
 */
export async function postPeriod({ period_from, period_to, posting_date, description_template }) {
  if (!period_from || !period_to) throw new Error('period_from dan period_to wajib diisi')
  if (!posting_date) throw new Error('posting_date wajib diisi')

  const { data, error } = await supabase.rpc('post_depreciation_batch', {
    p_period_from: period_from,
    p_period_to: period_to,
    p_posting_date: posting_date,
    p_description_template: description_template || 'Penyusutan {asset} – {period}',
  })
  if (error) throw error
  return data  // { posted, skipped, errors }
}

/**
 * Get all depreciation schedules for one asset, ordered by sequence_no.
 */
export async function getScheduleForAsset(assetId) {
  if (!assetId) throw new Error('assetId wajib diisi')

  const { data, error } = await supabase
    .from('depreciation_schedules')
    .select('*, journal:journals(id, journal_number, date)')
    .eq('asset_id', assetId)
    .order('sequence_no')
  if (error) throw error
  return data
}
