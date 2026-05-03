import { supabase } from '../lib/supabase'

// ---- SALES ORDERS ----
export async function getSalesOrders() {
  const { data, error } = await supabase
    .from('sales_orders')
    .select('*, customer:customers(name)')
    .order('date', { ascending: false })
  if (error) throw error
  return data
}

export async function getSalesOrder(id) {
  const { data, error } = await supabase
    .from('sales_orders')
    .select(`
      *,
      customer:customers(id, name),
      items:sales_order_items(
        id, product_id, unit_id, quantity, quantity_base, unit_price, tax_amount, total,
        product:products(id, name, sku, is_taxable, tax_rate, sell_price),
        unit:units(id, name)
      )
    `)
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function saveSalesOrder(so, items) {
  // Atomic: upsert header + delete-old-items + insert-new-items in one RPC transaction.
  // Server recomputes subtotal/tax/total from items (V6).
  const { data, error } = await supabase.rpc('save_sales_order', {
    p_so: {
      id:          so.id          || null,
      date:        so.date,
      customer_id: so.customer_id,
      status:      so.status      || 'draft',
      notes:       so.notes       || null,
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

export async function confirmSalesOrder(id) {
  const { error } = await supabase
    .from('sales_orders')
    .update({ status: 'confirmed' })
    .eq('id', id)
  if (error) throw error
}

// ---- GOODS DELIVERIES ----
export async function getGoodsDeliveries() {
  const { data, error } = await supabase
    .from('goods_deliveries')
    .select('*, customer:customers(name), sales_order:sales_orders(so_number)')
    .order('date', { ascending: false })
  if (error) throw error
  return data
}

export async function getGoodsDelivery(id) {
  const { data, error } = await supabase
    .from('goods_deliveries')
    .select(`
      *,
      customer:customers(id, name),
      sales_order:sales_orders(id, so_number),
      items:goods_delivery_items(
        id, product_id, unit_id, quantity, quantity_base,
        product:products(id, name, sku),
        unit:units(id, name)
      )
    `)
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function saveGoodsDelivery(gd, items) {
  const { data, error } = await supabase.rpc('save_goods_delivery', {
    p_gd: {
      id:             gd.id             || null,
      date:           gd.date,
      customer_id:    gd.customer_id,
      sales_order_id: gd.sales_order_id || null,
      status:         gd.status         || 'draft',
      notes:          gd.notes          || null,
    },
    p_items: items.map(i => ({
      product_id:    i.product_id,
      unit_id:       i.unit_id,
      quantity:      Number(i.quantity),
      quantity_base: Number(i.quantity_base) || Number(i.quantity),
    })),
  })
  if (error) throw error
  return data
}

export async function postGoodsDelivery(id) {
  // Period check enforced server-side (migration 016)
  const { error } = await supabase.rpc('post_goods_delivery', { p_gd_id: id })
  if (error) throw error
}

// ---- SALES INVOICES ----
export async function getSalesInvoices() {
  const { data, error } = await supabase
    .from('invoices')
    .select('*, customer:customers(name), sales_order:sales_orders(so_number)')
    .eq('type', 'sales')
    .order('date', { ascending: false })
  if (error) throw error
  return data
}

export async function getSalesInvoice(id) {
  const { data, error } = await supabase
    .from('invoices')
    .select(`
      *,
      customer:customers(id, name),
      sales_order:sales_orders(id, so_number),
      items:invoice_items(
        id, product_id, unit_id, quantity, quantity_base, unit_price, tax_amount, total,
        product:products(id, name, sku, is_taxable, tax_rate, sell_price),
        unit:units(id, name)
      )
    `)
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function saveSalesInvoice(invoice, items) {
  const { data, error } = await supabase.rpc('save_sales_invoice', {
    p_invoice: {
      id:             invoice.id             || null,
      date:           invoice.date,
      due_date:       invoice.due_date       || null,
      customer_id:    invoice.customer_id,
      sales_order_id: invoice.sales_order_id || null,
      status:         invoice.status         || 'draft',
      notes:          invoice.notes          || null,
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

export async function postSalesInvoice(id) {
  // Period check enforced server-side (migration 016)
  const { error } = await supabase.rpc('post_sales_invoice', { p_invoice_id: id })
  if (error) throw error
}

// Get outstanding sales invoices for a customer (for payment form)
export async function getOutstandingInvoices(customerId) {
  const { data, error } = await supabase
    .from('invoices')
    .select('id, invoice_number, date, total, amount_paid, status')
    .eq('type', 'sales')
    .eq('customer_id', customerId)
    .in('status', ['posted', 'partial'])
    .order('date')
  if (error) throw error
  return data
}
