import { supabase } from '../lib/supabase'

export async function getProformaInvoices() {
  const { data, error } = await supabase
    .from('proforma_invoices')
    .select('*, customer:customers(name), sales_order:sales_orders(so_number)')
    .eq('is_active', true)
    .order('date', { ascending: false })
  if (error) throw error
  return data
}

export async function getProformaInvoice(id) {
  const { data, error } = await supabase
    .from('proforma_invoices')
    .select(`
      *,
      customer:customers(id, name, address, phone, email, npwp),
      sales_order:sales_orders(id, so_number),
      items:proforma_invoice_items(
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

export async function saveProformaInvoice(proforma, items) {
  const { data, error } = await supabase.rpc('save_proforma_invoice', {
    p_proforma: {
      id:             proforma.id || null,
      date:           proforma.date,
      valid_until:    proforma.valid_until || null,
      customer_id:    proforma.customer_id,
      sales_order_id: proforma.sales_order_id || null,
      notes:          proforma.notes || null,
      subtotal:       proforma.subtotal || 0,
      tax_total:      proforma.tax_total || 0,
      total:          proforma.total || 0,
    },
    p_items: items.map(i => ({
      product_id:    i.product_id,
      unit_id:       i.unit_id,
      quantity:      Number(i.quantity),
      quantity_base: Number(i.quantity_base) || Number(i.quantity),
      unit_price:    Number(i.unit_price) || 0,
      tax_amount:    Number(i.tax_amount) || 0,
      total:         Number(i.total) || 0,
    })),
  })
  if (error) throw error
  return data
}

export async function cancelProformaInvoice(id) {
  const { error } = await supabase.rpc('cancel_proforma_invoice', { p_id: id })
  if (error) throw error
}
