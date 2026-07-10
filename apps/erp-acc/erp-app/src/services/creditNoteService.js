import { supabase } from '../lib/supabase'

export async function getCreditNotes({ partyType, status } = {}) {
  let q = supabase
    .from('credit_notes')
    .select('*, applications:credit_note_applications(id, invoice_id, amount, applied_at, invoice:invoices(invoice_number))')
    .order('created_at', { ascending: false })
  if (partyType) q = q.eq('party_type', partyType)
  if (status) q = q.eq('status', status)
  const { data, error } = await q
  if (error) throw error
  return data
}

// party names aren't a direct FK join target since party_id can point at
// either customers or suppliers — resolve them client-side in two lookups.
export async function getCustomerNames(ids) {
  if (ids.length === 0) return {}
  const { data, error } = await supabase.from('customers').select('id, name').in('id', ids)
  if (error) throw error
  return Object.fromEntries(data.map(c => [c.id, c.name]))
}

export async function getSupplierNames(ids) {
  if (ids.length === 0) return {}
  const { data, error } = await supabase.from('suppliers').select('id, name').in('id', ids)
  if (error) throw error
  return Object.fromEntries(data.map(s => [s.id, s.name]))
}

export async function getAvailableCredit(partyType, partyId) {
  const { data, error } = await supabase
    .from('credit_notes')
    .select('remaining')
    .eq('party_type', partyType)
    .eq('party_id', partyId)
    .eq('status', 'open')
  if (error) throw error
  return data.reduce((sum, r) => sum + Number(r.remaining), 0)
}
