import { supabase } from '../lib/supabase'

export async function listFiscalYearsStatus() {
  const { data, error } = await supabase.rpc('list_fiscal_years_status')
  if (error) throw error
  return data
}

export async function previewFiscalYearClosing(year) {
  const { data, error } = await supabase.rpc('preview_fiscal_year_closing', { p_year: year })
  if (error) throw error
  return data
}

export async function closeFiscalYear(year) {
  const { data, error } = await supabase.rpc('close_fiscal_year', { p_year: year })
  if (error) throw error
  return data
}

export async function reverseFiscalYearClosing(year) {
  const { data, error } = await supabase.rpc('reverse_fiscal_year_closing', { p_year: year })
  if (error) throw error
  return data
}
