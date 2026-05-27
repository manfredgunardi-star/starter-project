import { supabase } from '../lib/supabase'

export async function getPurchaseReturns() {
  const { data, error } = await supabase
    .from('purchase_returns')
    .select('*, supplier:suppliers(name), purchase_order:purchase_orders(po_number)')
    .order('date', { ascending: false })
  if (error) throw error
  return data
}

export async function getPurchaseReturn(id) {
  const { data, error } = await supabase
    .from('purchase_returns')
    .select(`
      *,
      supplier:suppliers(id, name),
      purchase_order:purchase_orders(id, po_number),
      items:purchase_return_items(
        id, product_id, unit_id, quantity, quantity_base, unit_price, total,
        product:products(id, name, sku, buy_price),
        unit:units(id, name)
      )
    `)
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function savePurchaseReturn(pr, items) {
  const { data, error } = await supabase.rpc('save_purchase_return', {
    p_pr: {
      id:                pr.id                || null,
      date:              pr.date,
      supplier_id:       pr.supplier_id,
      purchase_order_id: pr.purchase_order_id || null,
      warehouse_id:      pr.warehouse_id      || null,
      status:            pr.status            || 'draft',
      notes:             pr.notes             || null,
    },
    p_items: items.map(i => ({
      product_id:    i.product_id,
      unit_id:       i.unit_id,
      quantity:      Number(i.quantity),
      quantity_base: Number(i.quantity_base) || Number(i.quantity),
      unit_price:    Number(i.unit_price)    || 0,
      total:         Number(i.total)         || 0,
    })),
  })
  if (error) throw error
  return data
}

export async function postPurchaseReturn(id) {
  const { error } = await supabase.rpc('post_purchase_return', { p_pr_id: id })
  if (error) throw error
}
