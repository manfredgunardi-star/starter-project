import { supabase } from '../lib/supabase'
import { addDays, addWeeks, addMonths, addYears, endOfMonth, setDate } from 'date-fns'

// ---- Helpers ----

export function calcNextRun(intervalType, dayOfMonth, dayOfWeek, fromDate) {
  const base = new Date(fromDate)
  switch (intervalType) {
    case 'daily':
      return addDays(base, 1).toISOString().slice(0, 10)
    case 'weekly': {
      const next = addWeeks(base, 1)
      return next.toISOString().slice(0, 10)
    }
    case 'monthly': {
      const next = addMonths(base, 1)
      if (dayOfMonth === -1) return endOfMonth(next).toISOString().slice(0, 10)
      return setDate(next, Math.min(dayOfMonth, 28)).toISOString().slice(0, 10)
    }
    case 'yearly':
      return addYears(base, 1).toISOString().slice(0, 10)
    default:
      return addMonths(base, 1).toISOString().slice(0, 10)
  }
}

// ---- CRUD ----

export async function listRecurringTemplates() {
  const { data, error } = await supabase
    .from('recurring_templates')
    .select('*')
    .eq('is_active', true)
    .order('name')
  if (error) throw error
  return data
}

export async function getRecurringTemplate(id) {
  const { data, error } = await supabase
    .from('recurring_templates')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function getRecurringInstances(templateId) {
  const { data, error } = await supabase
    .from('recurring_instances')
    .select('*')
    .eq('template_id', templateId)
    .order('run_date', { ascending: false })
  if (error) throw error
  return data
}

export async function createRecurringTemplate(input) {
  const { data: { user } } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('recurring_templates')
    .insert({
      name:          input.name,
      type:          input.type,
      interval_type: input.interval_type,
      day_of_month:  input.day_of_month ?? null,
      day_of_week:   input.day_of_week ?? null,
      start_date:    input.start_date,
      end_date:      input.end_date ?? null,
      next_run:      input.start_date,
      status:        'active',
      template_data: input.template_data,
      created_by:    user?.id ?? null,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateRecurringTemplate(id, patch) {
  const { data: { user } } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('recurring_templates')
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
      updated_by: user?.id ?? null,
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function pauseRecurringTemplate(id) {
  return updateRecurringTemplate(id, { status: 'paused' })
}

export async function resumeRecurringTemplate(id) {
  return updateRecurringTemplate(id, { status: 'active' })
}

export async function softDeleteRecurringTemplate(id) {
  const { data: { user } } = await supabase.auth.getUser()

  const { error } = await supabase
    .from('recurring_templates')
    .update({
      is_active:  false,
      deleted_at: new Date().toISOString(),
      deleted_by: user?.id ?? null,
    })
    .eq('id', id)
  if (error) throw error
}

// ---- Run Now ----

export async function runNow(templateId) {
  const { data, error } = await supabase.rpc('process_recurring_templates', {
    p_template_id: templateId,
  })
  if (error) throw error
  // data is a jsonb array: [{ template_id, status, transaction_id, doc_number }]
  const result = Array.isArray(data) ? data[0] : data
  if (result?.status === 'failed') throw new Error(result.error ?? 'Run failed')
  return result
}
