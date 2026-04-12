import { supabase } from '../lib/supabase'

/**
 * Preview disposal calculation (client-side, does NOT call RPCs).
 * Returns catch-up periods, accumulated depreciation, book value, and gain/loss.
 */
export async function previewDisposal({ asset_id, disposal_date, disposal_type, sale_price = 0 }) {
  // Step A — Get asset
  const { data: asset, error: aErr } = await supabase
    .from('assets')
    .select('acquisition_cost, salvage_value, status, code, name')
    .eq('id', asset_id)
    .single()
  if (aErr) throw aErr
  if (asset.status === 'disposed') throw new Error('Aset sudah di-dispose')

  // Step B — Compute cutoff period (month BEFORE disposal_date)
  const d = new Date(disposal_date)
  d.setDate(0) // last day of previous month
  const cutoffPeriod = d.toISOString().slice(0, 7) // 'YYYY-MM'

  // Step C — Get pending schedules up to cutoffPeriod (catch-up)
  const { data: pending, error: pErr } = await supabase
    .from('depreciation_schedules')
    .select('period, amount')
    .eq('asset_id', asset_id)
    .eq('status', 'pending')
    .lte('period', cutoffPeriod)
    .order('period')
  if (pErr) throw pErr

  // Step D — Get sum of already-posted depreciation
  const { data: postedRows, error: poErr } = await supabase
    .from('depreciation_schedules')
    .select('amount')
    .eq('asset_id', asset_id)
    .eq('status', 'posted')
  if (poErr) throw poErr
  const postedSum = postedRows.reduce((s, r) => s + Number(r.amount), 0)

  // Step E — Calculate
  const pendingSum = (pending || []).reduce((s, r) => s + Number(r.amount), 0)
  const accumulated = postedSum + pendingSum
  const bookValue = Number(asset.acquisition_cost) - accumulated
  const gainLoss = disposal_type === 'sale' ? (Number(sale_price) - bookValue) : -bookValue

  return {
    asset,
    catchUpPeriods: pending || [],
    catchUpTotal: pendingSum,
    accumulated,
    bookValue,
    gainLoss,
  }
}

/**
 * Execute asset disposal by calling the execute_asset_disposal RPC.
 * Returns the journal_id (uuid) of the generated disposal journal entry.
 */
export async function executeDisposal({ asset_id, disposal_date, disposal_type, sale_price, payment_account_id, notes }) {
  const { data, error } = await supabase.rpc('execute_asset_disposal', {
    p_asset_id: asset_id,
    p_disposal_date: disposal_date,
    p_disposal_type: disposal_type,
    p_sale_price: sale_price ?? null,
    p_payment_account_id: payment_account_id ?? null,
    p_notes: notes ?? null,
  })
  if (error) throw error
  return data // journal_id (uuid)
}
