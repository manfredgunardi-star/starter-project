import { supabase } from '../lib/supabase'

async function getCurrentUserId() {
  const { data } = await supabase.auth.getUser()
  return data?.user?.id ?? null
}

async function countReferences(table, column, value) {
  const { count, error } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq(column, value)
  if (error) throw error
  return count ?? 0
}

async function assertWarehouseNotReferenced(id) {
  const checks = [
    {
      label: 'sales order',
      count: await countReferences('sales_orders', 'warehouse_id', id),
    },
    {
      label: 'purchase order',
      count: await countReferences('purchase_orders', 'warehouse_id', id),
    },
    {
      label: 'goods delivery',
      count: await countReferences('goods_deliveries', 'warehouse_id', id),
    },
    {
      label: 'goods receipt',
      count: await countReferences('goods_receipts', 'warehouse_id', id),
    },
  ]

  const reference = checks.find(check => check.count > 0)
  if (reference) {
    throw new Error(`Gudang masih digunakan oleh ${reference.count} ${reference.label}`)
  }
}

export async function getWarehouses() {
  const { data, error } = await supabase
    .from('warehouses')
    .select('*')
    .eq('is_active', true)
    .order('name')
  if (error) throw error
  return data
}

export async function getDefaultWarehouse() {
  const { data, error } = await supabase
    .from('warehouses')
    .select('*')
    .eq('is_active', true)
    .eq('is_default', true)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function createWarehouse(w) {
  const { data, error } = await supabase
    .from('warehouses')
    .insert({
      code: w.code,
      name: w.name,
      address: w.address || null,
      is_default: w.is_default ?? false,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateWarehouse(id, w) {
  const { data, error } = await supabase
    .from('warehouses')
    .update({
      code: w.code,
      name: w.name,
      address: w.address || null,
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function setDefaultWarehouse(id) {
  const { data: target, error: targetError } = await supabase
    .from('warehouses')
    .select('id')
    .eq('id', id)
    .eq('is_active', true)
    .single()
  if (targetError) throw targetError
  if (!target) throw new Error('Gudang aktif tidak ditemukan')

  const { error: clearError } = await supabase
    .from('warehouses')
    .update({ is_default: false })
    .eq('is_default', true)
  if (clearError) throw clearError

  const { data, error } = await supabase
    .from('warehouses')
    .update({ is_default: true })
    .eq('id', id)
    .eq('is_active', true)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteWarehouse(id) {
  const { data: warehouse, error: readError } = await supabase
    .from('warehouses')
    .select('is_default')
    .eq('id', id)
    .single()
  if (readError) throw readError
  if (warehouse?.is_default) {
    throw new Error('Gudang default tidak dapat dihapus')
  }

  await assertWarehouseNotReferenced(id)

  const userId = await getCurrentUserId()
  const { error } = await supabase
    .from('warehouses')
    .update({
      is_active: false,
      deleted_at: new Date().toISOString(),
      deleted_by: userId,
    })
    .eq('id', id)
  if (error) throw error
}
