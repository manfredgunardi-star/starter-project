import { supabase } from '../lib/supabase'

export async function getJournals({ startDate, endDate, source } = {}) {
  let query = supabase
    .from('journals')
    .select('id, journal_number, date, description, source, is_posted, created_at')
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })

  if (startDate) query = query.gte('date', startDate)
  if (endDate) query = query.lte('date', endDate)
  if (source) query = query.eq('source', source)

  const { data, error } = await query
  if (error) throw error
  return data
}

export async function getJournal(id) {
  const { data, error } = await supabase
    .from('journals')
    .select(`
      *,
      journal_items(
        id, coa_id, cost_center_id, account_id, debit, credit, description,
        coa:coa(id, code, name)
      )
    `)
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function saveManualJournal(header, items) {
  const { data: { user } } = await supabase.auth.getUser()

  const { data: num, error: numErr } = await supabase.rpc('generate_number', { p_prefix: 'JRN' })
  if (numErr) throw numErr

  const { data: journal, error: jErr } = await supabase
    .from('journals')
    .insert({
      journal_number: num,
      date: header.date,
      description: header.description,
      source: 'manual',
      is_posted: false,
      created_by: user?.id ?? null,
    })
    .select('id')
    .single()
  if (jErr) throw jErr

  const itemRows = items.map(i => ({
    journal_id: journal.id,
    coa_id: i.coa_id,
    account_id: i.account_id || null,
    debit: Number(i.debit) || 0,
    credit: Number(i.credit) || 0,
    description: i.description || null,
    cost_center_id: i.cost_center_id ?? null,
  }))
  const { error: itemErr } = await supabase.from('journal_items').insert(itemRows)
  if (itemErr) {
    // Kompensasi: insert header & items belum atomik (idealnya satu RPC transaksional,
    // mirip save_and_post_payment). Bila insert baris gagal, hapus header yatim agar
    // tidak meninggalkan jurnal tanpa baris di database.
    await supabase.from('journals').delete().eq('id', journal.id)
    throw itemErr
  }

  return journal.id
}

export async function postManualJournal(id) {
  const { error } = await supabase.rpc('post_manual_journal', { p_journal_id: id })
  if (error) throw error
}
