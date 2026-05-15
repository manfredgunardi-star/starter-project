import { supabase } from '../lib/supabase'

export async function getPaymentTerms() {
  const { data, error } = await supabase
    .from('payment_terms')
    .select('*')
    .eq('is_active', true)
    .order('net_days')
  if (error) throw error
  return data
}

export async function createPaymentTerm(term) {
  const { data, error } = await supabase
    .from('payment_terms')
    .insert({
      code: term.code,
      name: term.name,
      net_days: term.net_days ?? 0,
      discount_percent: term.discount_percent ?? 0,
      discount_days: term.discount_days ?? 0,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updatePaymentTerm(id, term) {
  const { data, error } = await supabase
    .from('payment_terms')
    .update({
      code: term.code,
      name: term.name,
      net_days: term.net_days ?? 0,
      discount_percent: term.discount_percent ?? 0,
      discount_days: term.discount_days ?? 0,
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deletePaymentTerm(id) {
  const { error } = await supabase.rpc('soft_delete_payment_term', { p_id: id })
  if (error) throw error
}
