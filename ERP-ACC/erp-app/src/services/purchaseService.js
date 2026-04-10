import { supabase } from '../lib/supabase'

export async function getPurchaseOrders() {
  const { data, error } = await supabase
    .from('purchase_orders')
    .select(`
      *,
      supplier:suppliers(name)
    `)
    .eq('is_active', true)
    .order('date', { ascending: false })
  if (error) throw error
  return data
}

export async function getPurchaseOrder(id) {
  const { data, error } = await supabase
    .from('purchase_orders')
    .select(`
      *,
      supplier:suppliers(name),
      purchase_order_items(
        *,
        product:products(name, sku, is_taxable, tax_rate, buy_price),
        unit:units(name)
      )
    `)
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function savePurchaseOrder(po, items) {
  const { data: { user } } = await supabase.auth.getUser()

  const { data: num, error: numErr } = await supabase.rpc('generate_number', { p_prefix: 'PO' })
  if (numErr) throw numErr

  // Calculate totals
  const subtotal = items.reduce((sum, item) => sum + (Number(item.unit_price) * Number(item.quantity_base)), 0)
  const tax_amount = items.reduce((sum, item) => sum + (item.tax_amount || 0), 0)
  const total = subtotal + tax_amount

  const poPayload = {
    po_number: num,
    date: po.date,
    supplier_id: po.supplier_id,
    status: po.status || 'draft',
    subtotal,
    tax_amount,
    total,
    notes: po.notes || null,
    created_by: user?.id ?? null,
  }

  // Upsert PO
  const { data: poData, error: poError } = po.id
    ? await supabase
        .from('purchase_orders')
        .update(poPayload)
        .eq('id', po.id)
        .select('id')
        .single()
    : await supabase
        .from('purchase_orders')
        .insert(poPayload)
        .select('id')
        .single()

  if (poError) throw poError
  const poId = poData.id

  // Delete old items if updating
  if (po.id) {
    const { error: delError } = await supabase
      .from('purchase_order_items')
      .delete()
      .eq('purchase_order_id', poId)
    if (delError) throw delError
  }

  // Insert items
  const itemsPayload = items.map(item => ({
    purchase_order_id: poId,
    product_id: item.product_id,
    unit_id: item.unit_id,
    quantity: Number(item.quantity),
    quantity_base: Number(item.quantity_base),
    unit_price: Number(item.unit_price),
    tax_amount: Number(item.tax_amount || 0),
    total: Number(item.total || 0),
  }))

  const { error: itemsError } = await supabase
    .from('purchase_order_items')
    .insert(itemsPayload)
  if (itemsError) throw itemsError

  return poId
}

export async function confirmPurchaseOrder(id) {
  const { error } = await supabase
    .from('purchase_orders')
    .update({ status: 'confirmed' })
    .eq('id', id)
  if (error) throw error
}
