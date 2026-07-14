import { supabase } from '../lib/supabase'

export async function getSalesReturns() {
  const { data, error } = await supabase
    .from('sales_returns')
    .select('*, customer:customers(name), sales_order:sales_orders(so_number), invoice:invoices(invoice_number)')
    .order('date', { ascending: false })
  if (error) throw error
  return data
}

export async function getSalesReturn(id) {
  const { data, error } = await supabase
    .from('sales_returns')
    .select(`
      *,
      customer:customers(id, name),
      sales_order:sales_orders(id, so_number),
      invoice:invoices(id, invoice_number),
      items:sales_return_items(
        id, invoice_item_id, product_id, unit_id, quantity, quantity_base, unit_price, tax_amount, total,
        product:products(id, name, sku, is_taxable, tax_rate, sell_price),
        unit:units(id, name)
      )
    `)
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

// Sales invoices eligible as a return's origin: same customer, posted/partial/paid.
export async function getReturnableSalesInvoices(customerId) {
  const { data, error } = await supabase
    .from('invoices')
    .select('id, invoice_number, date, total')
    .eq('type', 'sales')
    .eq('customer_id', customerId)
    .in('status', ['posted', 'partial', 'paid'])
    .order('date', { ascending: false })
  if (error) throw error
  return data
}

// Line items of one invoice with their remaining returnable qty.
export async function getReturnableSalesInvoiceItems(invoiceId) {
  const { data, error } = await supabase.rpc('get_returnable_sales_invoice_items', {
    p_invoice_id: invoiceId,
  })
  if (error) throw error
  return data
}

// Products this customer has ever received via a posted Goods Delivery (or
// invoice), with remaining returnable qty already netted against all posted
// returns for that customer+product combo (any path — see
// docs/superpowers/specs/2026-07-14-double-retur-prevention-design.md).
// Used by the "tanpa invoice (retur stok saja)" form path.
export async function getCustomerReturnableProducts(customerId) {
  const { data, error } = await supabase.rpc('get_customer_returnable_products', {
    p_customer_id: customerId,
  })
  if (error) throw error
  return data
}

export async function saveSalesReturn(sr, items) {
  const { data, error } = await supabase.rpc('save_sales_return', {
    p_sr: {
      id:             sr.id             || null,
      date:           sr.date,
      customer_id:    sr.customer_id,
      sales_order_id: sr.sales_order_id || null,
      invoice_id:     sr.invoice_id     || null,
      warehouse_id:   sr.warehouse_id   || null,
      status:         sr.status         || 'draft',
      notes:          sr.notes          || null,
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

export async function postSalesReturn(id) {
  const { error } = await supabase.rpc('post_sales_return', { p_sr_id: id })
  if (error) throw error
}
