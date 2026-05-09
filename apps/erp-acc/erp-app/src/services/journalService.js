import { supabase } from '../lib/supabase'
import { getClosedPeriods } from './companySettingsService'
import { isPeriodClosed } from '../utils/periodUtils'

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
        id, coa_id, debit, credit, description,
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

  const { closedPeriods } = await getClosedPeriods()
  if (isPeriodClosed(header.date, closedPeriods)) {
    throw new Error(`Periode ${header.date.slice(0, 7)} sudah ditutup. Tidak dapat menyimpan jurnal.`)
  }

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
    debit: Number(i.debit) || 0,
    credit: Number(i.credit) || 0,
    description: i.description || null,
  }))
  const { error: itemErr } = await supabase.from('journal_items').insert(itemRows)
  if (itemErr) throw itemErr

  return journal.id
}

export async function postManualJournal(id) {
  const { data: journal, error: fetchErr } = await supabase
    .from('journals')
    .select('date')
    .eq('id', id)
    .single()
  if (fetchErr) throw fetchErr
  const { closedPeriods } = await getClosedPeriods()
  if (isPeriodClosed(journal.date, closedPeriods)) {
    throw new Error(`Periode ${journal.date.slice(0, 7)} sudah ditutup. Tidak dapat memposting jurnal.`)
  }

  const { error } = await supabase.rpc('post_manual_journal', { p_journal_id: id })
  if (error) throw error
}
