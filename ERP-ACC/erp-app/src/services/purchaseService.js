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
  const { data: { user } } = await supabase.auth.getUser()

  let grNumber = gr.gr_number
  if (!gr.id) {
    const { data: num, error: numErr } = await supabase.rpc('generate_number', { p_prefix: 'GR' })
    if (numErr) throw numErr
    grNumber = num
  }

  const grPayload = {
    gr_number: grNumber,
    date: gr.date,
    supplier_id: gr.supplier_id,
    purchase_order_id: gr.purchase_order_id || null,
    status: gr.status || 'draft',
    notes: gr.notes || null,
    created_by: user?.id ?? null,
  }

  let grId = gr.id
  if (grId) {
    const { error } = await supabase.from('goods_receipts').update(grPayload).eq('id', grId)
    if (error) throw error
    await supabase.from('goods_receipt_items').delete().eq('goods_receipt_id', grId)
  } else {
    const { data, error } = await supabase.from('goods_receipts').insert(grPayload).select('id').single()
    if (error) throw error
    grId = data.id
  }

  if (items.length > 0) {
    const itemRows = items.map(i => ({
      goods_receipt_id: grId,
      product_id: i.product_id,
      unit_id: i.unit_id,
      quantity: Number(i.quantity),
      quantity_base: Number(i.quantity_base) || Number(i.quantity),
      unit_price: Number(i.unit_price) || 0,
    }))
    const { error } = await supabase.from('goods_receipt_items').insert(itemRows)
    if (error) throw error
  }

  return grId
}

export async function postGoodsReceipt(id) {
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
  const { data: { user } } = await supabase.auth.getUser()

  let invNumber = invoice.invoice_number
  if (!invoice.id) {
    const { data: num, error: numErr } = await supabase.rpc('generate_number', { p_prefix: 'PINV' })
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
    type: 'purchase',
    supplier_id: invoice.supplier_id,
    purchase_order_id: invoice.purchase_order_id || null,
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

export async function postPurchaseInvoice(id) {
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
