// erp-app/src/services/companySettingsService.js
import { supabase } from '../lib/supabase'

export async function getCompanySettings() {
  const { data, error } = await supabase
    .from('company_settings')
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function updateCompanySettings(settings) {
  const { error } = await supabase
    .from('company_settings')
    .update({
      name: settings.name,
      address: settings.address || null,
      phone: settings.phone || null,
      email: settings.email || null,
      npwp: settings.npwp || null,
      logo_url: settings.logo_url || null,
      bank_name: settings.bank_name || null,
      bank_account_number: settings.bank_account_number || null,
      bank_account_name: settings.bank_account_name || null,
      signer_name: settings.signer_name || null,
      signer_title: settings.signer_title || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', settings.id)
  if (error) throw error
}

export async function uploadCompanyLogo(file) {
  const ext = file.name.split('.').pop().toLowerCase()
  const path = `logo.${ext}`
  const { error } = await supabase.storage
    .from('company-assets')
    .upload(path, file, { upsert: true, contentType: file.type })
  if (error) throw error
  const { data } = supabase.storage
    .from('company-assets')
    .getPublicUrl(path)
  // Bust cache dengan timestamp agar browser tidak pakai versi lama
  return `${data.publicUrl}?t=${Date.now()}`
}

export async function getClosedPeriods() {
  const { data, error } = await supabase
    .from('company_settings')
    .select('id, closed_periods')
    .single()
  if (error) throw error
  return { id: data.id, closedPeriods: data.closed_periods || [] }
}

export async function closeAccountingPeriod(periodKey) {
  const { id, closedPeriods } = await getClosedPeriods()
  if (closedPeriods.includes(periodKey)) return
  const updated = [...closedPeriods, periodKey].sort()
  const { error } = await supabase
    .from('company_settings')
    .update({ closed_periods: updated, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function reopenAccountingPeriod(periodKey) {
  const { id, closedPeriods } = await getClosedPeriods()
  const updated = closedPeriods.filter(p => p !== periodKey)
  const { error } = await supabase
    .from('company_settings')
    .update({ closed_periods: updated, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}
