import { supabase } from '../lib/supabase'
import { getClosedPeriods } from './companySettingsService'
import { isPeriodClosed } from '../utils/periodUtils'

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
  const { data: { user } } = await supabase.auth.getUser()

  let soNumber = so.so_number
  if (!so.id) {
    const { data: num, error: numErr } = await supabase.rpc('generate_number', { p_prefix: 'SO' })
    if (numErr) throw numErr
    soNumber = num
  }

  const subtotal = items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0)
  const taxAmount = items.reduce((s, i) => s + (Number(i.tax_amount) || 0), 0)
  const total = subtotal + taxAmount

  const soPayload = {
    so_number: soNumber,
    date: so.date,
    customer_id: so.customer_id,
    status: so.status || 'draft',
    subtotal,
    tax_amount: taxAmount,
    total,
    notes: so.notes || null,
    created_by: user?.id ?? null,
  }

  let soId = so.id
  if (soId) {
    const { error } = await supabase.from('sales_orders').update(soPayload).eq('id', soId)
    if (error) throw error
    // Delete old items
    const { error: delErr } = await supabase.from('sales_order_items').delete().eq('sales_order_id', soId)
    if (delErr) throw delErr
  } else {
    const { data, error } = await supabase.from('sales_orders').insert(soPayload).select('id').single()
    if (error) throw error
    soId = data.id
  }

  if (items.length > 0) {
    const itemRows = items.map(i => ({
      sales_order_id: soId,
      product_id: i.product_id,
      unit_id: i.unit_id,
      quantity: Number(i.quantity),
      quantity_base: Number(i.quantity_base) || Number(i.quantity),
      unit_price: Number(i.unit_price) || 0,
      tax_amount: Number(i.tax_amount) || 0,
      total: Number(i.total) || 0,
    }))
    const { error: itemErr } = await supabase.from('sales_order_items').insert(itemRows)
    if (itemErr) throw itemErr
  }

  return soId
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
  const { data: { user } } = await supabase.auth.getUser()

  let gdNumber = gd.gd_number
  if (!gd.id) {
    const { data: num, error: numErr } = await supabase.rpc('generate_number', { p_prefix: 'GD' })
    if (numErr) throw numErr
    gdNumber = num
  }

  const gdPayload = {
    gd_number: gdNumber,
    date: gd.date,
    customer_id: gd.customer_id,
    sales_order_id: gd.sales_order_id || null,
    status: gd.status || 'draft',
    notes: gd.notes || null,
    created_by: user?.id ?? null,
  }

  let gdId = gd.id
  if (gdId) {
    const { error } = await supabase.from('goods_deliveries').update(gdPayload).eq('id', gdId)
    if (error) throw error
    await supabase.from('goods_delivery_items').delete().eq('goods_delivery_id', gdId)
  } else {
    const { data, error } = await supabase.from('goods_deliveries').insert(gdPayload).select('id').single()
    if (error) throw error
    gdId = data.id
  }

  if (items.length > 0) {
    const itemRows = items.map(i => ({
      goods_delivery_id: gdId,
      product_id: i.product_id,
      unit_id: i.unit_id,
      quantity: Number(i.quantity),
      quantity_base: Number(i.quantity_base) || Number(i.quantity),
    }))
    const { error } = await supabase.from('goods_delivery_items').insert(itemRows)
    if (error) throw error
  }

  return gdId
}

export async function postGoodsDelivery(id) {
  const { data: gd, error: fetchErr } = await supabase
    .from('goods_deliveries')
    .select('date')
    .eq('id', id)
    .single()
  if (fetchErr) throw fetchErr
  const { closedPeriods } = await getClosedPeriods()
  if (isPeriodClosed(gd.date, closedPeriods)) {
    throw new Error(`Periode ${gd.date.slice(0, 7)} sudah ditutup. Tidak dapat memposting pengiriman barang.`)
  }
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
  const { data: { user } } = await supabase.auth.getUser()

  const { closedPeriods } = await getClosedPeriods()
  if (isPeriodClosed(invoice.date, closedPeriods)) {
    throw new Error(`Periode ${invoice.date.slice(0, 7)} sudah ditutup. Tidak dapat menyimpan invoice penjualan.`)
  }

  let invNumber = invoice.invoice_number
  if (!invoice.id) {
    const { data: num, error: numErr } = await supabase.rpc('generate_number', { p_prefix: 'INV' })
    if (numErr) throw numErr
    invNumber = num
  }

  const subtotal = items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0)
  const taxAmount = items.reduce((s, i) => s + (Number(i.tax_amount) || 0), 0)
  const total = subtotal + taxAmount

  const invPayload = {
    invoice_number: invNumber,
    date: invoice.date,
    due_date: invoice.due_date || null,
    type: 'sales',
    customer_id: invoice.customer_id,
    sales_order_id: invoice.sales_order_id || null,
    status: invoice.status || 'draft',
    subtotal,
    tax_amount: taxAmount,
    total,
    notes: invoice.notes || null,
    created_by: user?.id ?? null,
  }

  let invId = invoice.id
  if (invId) {
    const { error } = await supabase.from('invoices').update(invPayload).eq('id', invId)
    if (error) throw error
    await supabase.from('invoice_items').delete().eq('invoice_id', invId)
  } else {
    const { data, error } = await supabase.from('invoices').insert(invPayload).select('id').single()
    if (error) throw error
    invId = data.id
  }

  if (items.length > 0) {
    const itemRows = items.map(i => ({
      invoice_id: invId,
      product_id: i.product_id,
      unit_id: i.unit_id,
      quantity: Number(i.quantity),
      quantity_base: Number(i.quantity_base) || Number(i.quantity),
      unit_price: Number(i.unit_price) || 0,
      tax_amount: Number(i.tax_amount) || 0,
      total: Number(i.total) || 0,
    }))
    const { error } = await supabase.from('invoice_items').insert(itemRows)
    if (error) throw error
  }

  return invId
}

export async function postSalesInvoice(id) {
  const { data: inv, error: fetchErr } = await supabase
    .from('invoices')
    .select('date')
    .eq('id', id)
    .single()
  if (fetchErr) throw fetchErr
  const { closedPeriods } = await getClosedPeriods()
  if (isPeriodClosed(inv.date, closedPeriods)) {
    throw new Error(`Periode ${inv.date.slice(0, 7)} sudah ditutup. Tidak dapat memposting invoice penjualan.`)
  }

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
