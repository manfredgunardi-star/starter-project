import { supabase } from '../lib/supabase'
import { listCategories } from './assetCategoryService'

// Financial fields that are locked once depreciation has been posted
const FINANCIAL_FIELDS = [
  'acquisition_cost',
  'acquisition_date',
  'useful_life_months',
  'salvage_value',
  'depreciation_method',
  'category_id',
]

/**
 * Compute the first day of the month after a given date string.
 * Used to set depreciation_start_date = month after acquisition.
 */
function startOfNextMonth(dateStr) {
  const d = new Date(dateStr)
  return new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString().slice(0, 10)
}

// ---- LIST / GET ----

/**
 * List active assets with optional filters.
 * @param {object} opts
 * @param {string} [opts.categoryId]
 * @param {string} [opts.status='all']
 * @param {string} [opts.q] - search term for code or name
 */
export async function listAssets({ categoryId, status = 'all', q } = {}) {
  let query = supabase
    .from('assets')
    .select(`
      *,
      category:asset_categories(code, name)
    `)
    .eq('is_active', true)

  if (categoryId) query = query.eq('category_id', categoryId)
  if (status !== 'all') query = query.eq('status', status)
  if (q) query = query.or(`code.ilike.%${q}%,name.ilike.%${q}%`)

  query = query.order('code')

  const { data, error } = await query
  if (error) throw error
  return data
}

/**
 * Get a single asset by ID with joined category and journal references.
 */
export async function getAsset(id) {
  const { data, error } = await supabase
    .from('assets')
    .select(`
      *,
      category:asset_categories(*),
      acquisition_journal:journals!assets_acquisition_journal_id_fkey(id, journal_number, date),
      disposal_journal:journals!assets_disposal_journal_id_fkey(id, journal_number, date)
    `)
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

/**
 * Get a single asset with its full depreciation schedule.
 */
export async function getAssetWithSchedule(id) {
  const asset = await getAsset(id)

  const { data: schedule, error } = await supabase
    .from('depreciation_schedules')
    .select('*')
    .eq('asset_id', id)
    .order('sequence_no')
  if (error) throw error

  return { ...asset, schedule }
}

// ---- CREATE ----

/**
 * Create a new fixed asset with acquisition journal and depreciation schedule.
 *
 * @param {object} input
 * @param {string} input.name
 * @param {string} input.category_id
 * @param {string} input.acquisition_date  - ISO date string
 * @param {number} input.acquisition_cost
 * @param {number} [input.salvage_value=0]
 * @param {number} input.useful_life_months
 * @param {string} [input.location]
 * @param {string} [input.description]
 * @param {string} [input.supplier_id]
 * @param {object} input.payment
 * @param {string} input.payment.method - 'cash_bank' | 'hutang' | 'uang_muka' | 'mixed'
 * @param {string|null} input.payment.cash_bank_account_id
 * @param {number}  input.payment.cash_bank_amount
 * @param {string|null} input.payment.supplier_id
 * @param {string|null} input.payment.hutang_account_id
 * @param {number}  input.payment.hutang_amount
 * @param {string|null} input.payment.uang_muka_account_id
 * @param {number}  input.payment.uang_muka_amount
 */
export async function createAsset(input) {
  const {
    name,
    category_id,
    acquisition_date,
    acquisition_cost,
    salvage_value = 0,
    useful_life_months,
    location,
    description,
    supplier_id,
    payment,
  } = input

  // --- 1. Validate payment sum ---
  const sum =
    (Number(payment.cash_bank_amount) || 0) +
    (Number(payment.hutang_amount) || 0) +
    (Number(payment.uang_muka_amount) || 0)

  if (Math.abs(sum - Number(acquisition_cost)) > 0.01) {
    throw new Error(
      `Total pembayaran (${sum}) tidak sama dengan harga perolehan (${acquisition_cost})`
    )
  }

  // --- 2. Validate acquisition_cost > salvage_value ---
  if (Number(acquisition_cost) <= Number(salvage_value)) {
    throw new Error('Harga perolehan harus lebih besar dari nilai sisa')
  }

  // --- 3. Get category code ---
  const categories = await listCategories()
  const category = categories.find((c) => c.id === category_id)
  if (!category) throw new Error('Kategori aset tidak ditemukan')
  const categoryCode = category.code

  // --- 4. Generate asset code ---
  const { data: assetCode, error: codeError } = await supabase.rpc('generate_asset_code', {
    category_code: categoryCode,
  })
  if (codeError) throw codeError

  // --- 5. Get current user ---
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // --- 6. Insert asset ---
  const { data: asset, error: insertError } = await supabase
    .from('assets')
    .insert({
      code: assetCode,
      name,
      category_id,
      acquisition_date,
      acquisition_cost: Number(acquisition_cost),
      salvage_value: Number(salvage_value),
      useful_life_months: Number(useful_life_months),
      location: location ?? null,
      description: description ?? null,
      depreciation_start_date: startOfNextMonth(acquisition_date),
      payment_method: payment.method,
      supplier_id: payment.supplier_id ?? supplier_id ?? null,
      is_active: true,
      created_by: user?.id ?? null,
    })
    .select('id')
    .single()
  if (insertError) throw insertError

  // --- 7. Create acquisition journal ---
  let journalId
  try {
    const { data: journalResult, error: journalError } = await supabase.rpc(
      'create_asset_acquisition_journal',
      {
        p_asset_id: asset.id,
        p_payment: payment,
      }
    )
    if (journalError) throw journalError
    journalId = journalResult
  } catch (journalErr) {
    // Rollback: soft-delete the asset we just inserted
    await supabase.from('assets').update({ is_active: false }).eq('id', asset.id)
    throw journalErr
  }

  // --- 8. Link journal to asset ---
  const { error: linkError } = await supabase
    .from('assets')
    .update({ acquisition_journal_id: journalId })
    .eq('id', asset.id)
  if (linkError) throw linkError

  // --- 9. Generate depreciation schedule ---
  const { error: scheduleError } = await supabase.rpc('generate_depreciation_schedule', {
    p_asset_id: asset.id,
  })
  if (scheduleError) throw scheduleError

  return asset.id
}

// ---- UPDATE ----

/**
 * Update an asset's fields.
 * Financial fields are locked if any depreciation schedule rows are posted.
 */
export async function updateAsset(id, patch) {
  // Check posted depreciation count
  const { count: postedCount, error: countError } = await supabase
    .from('depreciation_schedules')
    .select('id', { count: 'exact', head: true })
    .eq('asset_id', id)
    .eq('status', 'posted')
  if (countError) throw countError

  const touchesFinancialFields = FINANCIAL_FIELDS.some((f) => f in patch)

  if (postedCount > 0 && touchesFinancialFields) {
    throw new Error('Field finansial terkunci – sudah ada jurnal penyusutan terposting')
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { error } = await supabase
    .from('assets')
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
      updated_by: user?.id ?? null,
    })
    .eq('id', id)
  if (error) throw error

  // Regenerate schedule if financial fields changed and no posted rows
  if (touchesFinancialFields && postedCount === 0) {
    const { error: scheduleError } = await supabase.rpc('generate_depreciation_schedule', {
      p_asset_id: id,
    })
    if (scheduleError) throw scheduleError
  }
}

// ---- SOFT DELETE ----

/**
 * Soft-delete an asset.
 * Blocked if any posted depreciation journal exists — use Disposal instead.
 */
export async function softDeleteAsset(id) {
  const { count, error: countError } = await supabase
    .from('depreciation_schedules')
    .select('id', { count: 'exact', head: true })
    .eq('asset_id', id)
    .eq('status', 'posted')
  if (countError) throw countError

  if (count > 0) {
    throw new Error('Aset sudah punya jurnal terposting – gunakan Disposal')
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { error } = await supabase
    .from('assets')
    .update({
      is_active: false,
      deleted_at: new Date().toISOString(),
      deleted_by: user?.id ?? null,
    })
    .eq('id', id)
  if (error) throw error
}
