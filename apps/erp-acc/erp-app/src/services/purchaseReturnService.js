import { supabase } from '../lib/supabase'

export async function getPurchaseReturns() {
  const { data, error } = await supabase
    .from('purchase_returns')
    .select('*, supplier:suppliers(name), purchase_order:purchase_orders(po_number), invoice:invoices(invoice_number)')
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
      invoice:invoices(id, invoice_number),
      items:purchase_return_items(
        id, invoice_item_id, product_id, unit_id, quantity, quantity_base, unit_price, tax_amount, total,
        product:products(id, name, sku, is_taxable, tax_rate, buy_price),
        unit:units(id, name)
      )
    `)
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function getReturnablePurchaseInvoices(supplierId) {
  const { data, error } = await supabase
    .from('invoices')
    .select('id, invoice_number, date, total')
    .eq('type', 'purchase')
    .eq('supplier_id', supplierId)
    .in('status', ['posted', 'partial', 'paid'])
    .order('date', { ascending: false })
  if (error) throw error
  return data
}

export async function getReturnablePurchaseInvoiceItems(invoiceId) {
  const { data, error } = await supabase.rpc('get_returnable_purchase_invoice_items', {
    p_invoice_id: invoiceId,
  })
  if (error) throw error
  return data
}

// Mirror of getCustomerReturnableProducts for the purchase side.
export async function getSupplierReturnableProducts(supplierId) {
  const { data, error } = await supabase.rpc('get_supplier_returnable_products', {
    p_supplier_id: supplierId,
  })
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
      invoice_id:        pr.invoice_id        || null,
      warehouse_id:      pr.warehouse_id      || null,
      status:            pr.status            || 'draft',
      notes:             pr.notes             || null,
    },
    p_items: items.map(i => ({
      invoice_item_id: i.invoice_item_id || null,
      product_id:    i.product_id,
      unit_id:       i.unit_id,
      quantity:      Number(i.quantity),
      quantity_base: Number(i.quantity_base) || Number(i.quantity),
      unit_price:    Number(i.unit_price)    || 0,
      tax_amount:    Number(i.tax_amount)    || 0,
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
