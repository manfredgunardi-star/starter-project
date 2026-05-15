import { supabase } from '../lib/supabase'

export async function getTaxCodes() {
  const { data, error } = await supabase
    .from('tax_codes')
    .select(`
      *,
      output_account:coa!tax_codes_output_account_id_fkey(id, code, name, type),
      input_account:coa!tax_codes_input_account_id_fkey(id, code, name, type)
    `)
    .eq('is_active', true)
    .order('code')
  if (error) throw error
  return data
}

export async function createTaxCode(tc) {
  const { data, error } = await supabase
    .from('tax_codes')
    .insert({
      code: tc.code,
      name: tc.name,
      rate: tc.rate ?? 0,
      is_inclusive: tc.is_inclusive ?? false,
      output_account_id: tc.output_account_id || null,
      input_account_id: tc.input_account_id || null,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateTaxCode(id, tc) {
  const { data, error } = await supabase
    .from('tax_codes')
    .update({
      code: tc.code,
      name: tc.name,
      rate: tc.rate ?? 0,
      is_inclusive: tc.is_inclusive ?? false,
      output_account_id: tc.output_account_id || null,
      input_account_id: tc.input_account_id || null,
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteTaxCode(id) {
  const { error } = await supabase.rpc('soft_delete_tax_code', { p_id: id })
  if (error) throw error
}
