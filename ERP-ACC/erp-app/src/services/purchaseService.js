import { supabase } from '../lib/supabase'

// ---- GOODS RECEIPTS ----

export async function getGoodsReceipts() {
  const { data, error } = await supabase
    .from('goods_receipts')
    .select('*, supplier:suppliers(name), purchase_order:purchase_orders(po_number)')
    .order('date', { ascending: false })
  if (error) throw error
  return data
}

export async function getGoodsReceipt(id) {
  const { data, error } = await supabase
    .from('goods_receipts')
    .select(`
      *,
      supplier:suppliers(id, name),
      purchase_order:purchase_orders(id, po_number),
      items:goods_receipt_items(
        id, product_id, unit_id, quantity, quantity_base, unit_price,
        product:products(id, name, sku, buy_price),
        unit:units(id, name)
      )
    `)
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function saveGoodsReceipt(gr, items) {
  const { data, error } = await supabase.rpc('save_goods_receipt', {
    p_gr: {
      id:                gr.id                || null,
      date:              gr.date,
      supplier_id:       gr.supplier_id,
      purchase_order_id: gr.purchase_order_id || null,
      status:            gr.status            || 'draft',
      notes:             gr.notes             || null,
    },
    p_items: items.map(i => ({
      product_id:    i.product_id,
      unit_id:       i.unit_id,
      quantity:      Number(i.quantity),
      quantity_base: Number(i.quantity_base) || Number(i.quantity),
      unit_price:    Number(i.unit_price)    || 0,
    })),
  })
  if (error) throw error
  return data
}

export async function postGoodsReceipt(id) {
  // Period check enforced server-side (migration 016)
  const { error } = await supabase.rpc('post_goods_receipt', { p_gr_id: id })
  if (error) throw error
}

// ---- PURCHASE INVOICES ----

export async function getPurchaseInvoices() {
  const { data, error } = await supabase
    .from('invoices')
    .select('*, supplier:suppliers(name), purchase_order:purchase_orders(po_number)')
    .eq('type', 'purchase')
    .order('date', { ascending: false })
  if (error) throw error
  return data
}

export async function getPurchaseInvoice(id) {
  const { data, error } = await supabase
    .from('invoices')
    .select(`
      *,
      supplier:suppliers(id, name),
      purchase_order:purchase_orders(id, po_number),
      items:invoice_items(
        id, product_id, unit_id, quantity, quantity_base, unit_price, tax_amount, total,
        product:products(id, name, sku, is_taxable, tax_rate, buy_price),
        unit:units(id, name)
      )
    `)
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function savePurchaseInvoice(invoice, items) {
  const { data, error } = await supabase.rpc('save_purchase_invoice', {
    p_invoice: {
      id:                invoice.id                || null,
      date:              invoice.date,
      due_date:          invoice.due_date          || null,
      supplier_id:       invoice.supplier_id,
      purchase_order_id: invoice.purchase_order_id || null,
      status:            invoice.status            || 'draft',
      notes:             invoice.notes             || null,
    },
    p_items: items.map(i => ({
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

export async function postPurchaseInvoice(id) {
  // Period check enforced server-side (migration 016)
  const { error } = await supabase.rpc('post_purchase_invoice', { p_invoice_id: id })
  if (error) throw error
}

export async function getOutstandingPurchaseInvoicesBySupplier(supplierId) {
  const { data, error } = await supabase
    .from('invoices')
    .select('id, invoice_number, date, total, amount_paid, status')
    .eq('type', 'purchase')
    .eq('supplier_id', supplierId)
    .in('status', ['posted', 'partial'])
    .order('date')
  if (error) throw error
  return data
}

// ---- PURCHASE ORDERS ----

export async function getPurchaseOrders() {
  const { data, error } = await supabase
    .from('purchase_orders')
    .select(`
      *,
      supplier:suppliers(name)
    `)
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
  const { data, error } = await supabase.rpc('save_purchase_order', {
    p_po: {
      id:          po.id          || null,
      date:        po.date,
      supplier_id: po.supplier_id,
      status:      po.status      || 'draft',
      notes:       po.notes       || null,
    },
    p_items: items.map(i => ({
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

export async function confirmPurchaseOrder(id) {
  const { error } = await supabase
    .from('purchase_orders')
    .update({ status: 'confirmed' })
    .eq('id', id)
  if (error) throw error
}
