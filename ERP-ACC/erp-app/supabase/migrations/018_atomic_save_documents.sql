-- ============================================================
-- Migration 018: Atomic document save RPCs (V5 + V6)
-- Moves header-upsert + delete-items + insert-items into a single
-- server-side transaction for each document type.
-- Server recomputes subtotal/tax/total from items (V6 in same pass).
-- Covered: sales_order, goods_delivery, sales_invoice,
--          purchase_order, goods_receipt, purchase_invoice
-- ============================================================

-- -------------------------------------------------------
-- 1. save_sales_order
-- -------------------------------------------------------
create or replace function save_sales_order(
  p_so    jsonb,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_so_id     uuid;
  v_number    text;
  v_subtotal  numeric := 0;
  v_tax       numeric := 0;
  v_total     numeric := 0;
  v_item      jsonb;
begin
  if not is_admin_or_staff() then
    raise exception 'permission denied';
  end if;
  perform _ensure_period_open((p_so->>'date')::date);

  -- Server-side recompute (V6)
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_subtotal := v_subtotal
      + coalesce((v_item->>'quantity')::numeric, 0)
        * coalesce((v_item->>'unit_price')::numeric, 0);
    v_tax := v_tax + coalesce((v_item->>'tax_amount')::numeric, 0);
  end loop;
  v_total := v_subtotal + v_tax;

  v_so_id := nullif(p_so->>'id', '')::uuid;

  if v_so_id is null then
    v_number := generate_number('SO');
    v_so_id  := gen_random_uuid();
    insert into sales_orders (
      id, so_number, date, customer_id, status,
      subtotal, tax_amount, total, notes, created_by
    ) values (
      v_so_id, v_number,
      (p_so->>'date')::date,
      (p_so->>'customer_id')::uuid,
      coalesce(p_so->>'status', 'draft'),
      v_subtotal, v_tax, v_total,
      nullif(p_so->>'notes', ''),
      auth.uid()
    );
  else
    update sales_orders
       set date        = (p_so->>'date')::date,
           customer_id = (p_so->>'customer_id')::uuid,
           subtotal    = v_subtotal,
           tax_amount  = v_tax,
           total       = v_total,
           notes       = nullif(p_so->>'notes', '')
     where id = v_so_id and status = 'draft';
    if not found then
      raise exception 'sales order tidak dapat diubah (sudah dikonfirmasi atau tidak ditemukan)';
    end if;
    delete from sales_order_items where sales_order_id = v_so_id;
  end if;

  insert into sales_order_items (
    sales_order_id, product_id, unit_id,
    quantity, quantity_base, unit_price, tax_amount, total
  )
  select
    v_so_id,
    (i->>'product_id')::uuid,
    (i->>'unit_id')::uuid,
    (i->>'quantity')::numeric,
    coalesce((i->>'quantity_base')::numeric, (i->>'quantity')::numeric),
    coalesce((i->>'unit_price')::numeric, 0),
    coalesce((i->>'tax_amount')::numeric, 0),
    coalesce((i->>'total')::numeric, 0)
  from jsonb_array_elements(p_items) as i;

  return v_so_id;
end $$;

-- -------------------------------------------------------
-- 2. save_goods_delivery
-- -------------------------------------------------------
create or replace function save_goods_delivery(
  p_gd    jsonb,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gd_id  uuid;
  v_number text;
begin
  if not is_admin_or_staff() then
    raise exception 'permission denied';
  end if;
  perform _ensure_period_open((p_gd->>'date')::date);

  v_gd_id := nullif(p_gd->>'id', '')::uuid;

  if v_gd_id is null then
    v_number := generate_number('GD');
    v_gd_id  := gen_random_uuid();
    insert into goods_deliveries (
      id, gd_number, date, customer_id, sales_order_id,
      status, notes, created_by
    ) values (
      v_gd_id, v_number,
      (p_gd->>'date')::date,
      (p_gd->>'customer_id')::uuid,
      nullif(p_gd->>'sales_order_id', '')::uuid,
      coalesce(p_gd->>'status', 'draft'),
      nullif(p_gd->>'notes', ''),
      auth.uid()
    );
  else
    update goods_deliveries
       set date            = (p_gd->>'date')::date,
           customer_id     = (p_gd->>'customer_id')::uuid,
           sales_order_id  = nullif(p_gd->>'sales_order_id', '')::uuid,
           notes           = nullif(p_gd->>'notes', '')
     where id = v_gd_id and status = 'draft';
    if not found then
      raise exception 'goods delivery tidak dapat diubah (sudah diposting atau tidak ditemukan)';
    end if;
    delete from goods_delivery_items where goods_delivery_id = v_gd_id;
  end if;

  insert into goods_delivery_items (
    goods_delivery_id, product_id, unit_id, quantity, quantity_base
  )
  select
    v_gd_id,
    (i->>'product_id')::uuid,
    (i->>'unit_id')::uuid,
    (i->>'quantity')::numeric,
    coalesce((i->>'quantity_base')::numeric, (i->>'quantity')::numeric)
  from jsonb_array_elements(p_items) as i;

  return v_gd_id;
end $$;

-- -------------------------------------------------------
-- 3. save_sales_invoice
-- -------------------------------------------------------
create or replace function save_sales_invoice(
  p_invoice jsonb,
  p_items   jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv_id   uuid;
  v_number   text;
  v_subtotal numeric := 0;
  v_tax      numeric := 0;
  v_total    numeric := 0;
  v_item     jsonb;
begin
  if not is_admin_or_staff() then
    raise exception 'permission denied';
  end if;
  perform _ensure_period_open((p_invoice->>'date')::date);

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_subtotal := v_subtotal
      + coalesce((v_item->>'quantity')::numeric, 0)
        * coalesce((v_item->>'unit_price')::numeric, 0);
    v_tax := v_tax + coalesce((v_item->>'tax_amount')::numeric, 0);
  end loop;
  v_total := v_subtotal + v_tax;

  v_inv_id := nullif(p_invoice->>'id', '')::uuid;

  if v_inv_id is null then
    v_number := generate_number('INV');
    v_inv_id  := gen_random_uuid();
    insert into invoices (
      id, invoice_number, date, due_date, type, customer_id,
      sales_order_id, status, subtotal, tax_amount, total,
      notes, created_by
    ) values (
      v_inv_id, v_number,
      (p_invoice->>'date')::date,
      nullif(p_invoice->>'due_date', '')::date,
      'sales',
      (p_invoice->>'customer_id')::uuid,
      nullif(p_invoice->>'sales_order_id', '')::uuid,
      coalesce(p_invoice->>'status', 'draft'),
      v_subtotal, v_tax, v_total,
      nullif(p_invoice->>'notes', ''),
      auth.uid()
    );
  else
    update invoices
       set date            = (p_invoice->>'date')::date,
           due_date        = nullif(p_invoice->>'due_date', '')::date,
           customer_id     = (p_invoice->>'customer_id')::uuid,
           sales_order_id  = nullif(p_invoice->>'sales_order_id', '')::uuid,
           subtotal        = v_subtotal,
           tax_amount      = v_tax,
           total           = v_total,
           notes           = nullif(p_invoice->>'notes', '')
     where id = v_inv_id and status = 'draft' and type = 'sales';
    if not found then
      raise exception 'sales invoice tidak dapat diubah (sudah diposting atau tidak ditemukan)';
    end if;
    delete from invoice_items where invoice_id = v_inv_id;
  end if;

  insert into invoice_items (
    invoice_id, product_id, unit_id,
    quantity, quantity_base, unit_price, tax_amount, total
  )
  select
    v_inv_id,
    (i->>'product_id')::uuid,
    (i->>'unit_id')::uuid,
    (i->>'quantity')::numeric,
    coalesce((i->>'quantity_base')::numeric, (i->>'quantity')::numeric),
    coalesce((i->>'unit_price')::numeric, 0),
    coalesce((i->>'tax_amount')::numeric, 0),
    coalesce((i->>'total')::numeric, 0)
  from jsonb_array_elements(p_items) as i;

  return v_inv_id;
end $$;

-- -------------------------------------------------------
-- 4. save_purchase_order
-- -------------------------------------------------------
create or replace function save_purchase_order(
  p_po    jsonb,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_po_id    uuid;
  v_number   text;
  v_subtotal numeric := 0;
  v_tax      numeric := 0;
  v_total    numeric := 0;
  v_item     jsonb;
begin
  if not is_admin_or_staff() then
    raise exception 'permission denied';
  end if;
  perform _ensure_period_open((p_po->>'date')::date);

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_subtotal := v_subtotal
      + coalesce((v_item->>'quantity_base')::numeric, (v_item->>'quantity')::numeric, 0)
        * coalesce((v_item->>'unit_price')::numeric, 0);
    v_tax := v_tax + coalesce((v_item->>'tax_amount')::numeric, 0);
  end loop;
  v_total := v_subtotal + v_tax;

  v_po_id := nullif(p_po->>'id', '')::uuid;

  if v_po_id is null then
    v_number := generate_number('PO');
    v_po_id  := gen_random_uuid();
    insert into purchase_orders (
      id, po_number, date, supplier_id, status,
      subtotal, tax_amount, total, notes, created_by
    ) values (
      v_po_id, v_number,
      (p_po->>'date')::date,
      (p_po->>'supplier_id')::uuid,
      coalesce(p_po->>'status', 'draft'),
      v_subtotal, v_tax, v_total,
      nullif(p_po->>'notes', ''),
      auth.uid()
    );
  else
    update purchase_orders
       set date        = (p_po->>'date')::date,
           supplier_id = (p_po->>'supplier_id')::uuid,
           subtotal    = v_subtotal,
           tax_amount  = v_tax,
           total       = v_total,
           notes       = nullif(p_po->>'notes', '')
     where id = v_po_id and status = 'draft';
    if not found then
      raise exception 'purchase order tidak dapat diubah (sudah dikonfirmasi atau tidak ditemukan)';
    end if;
    delete from purchase_order_items where purchase_order_id = v_po_id;
  end if;

  insert into purchase_order_items (
    purchase_order_id, product_id, unit_id,
    quantity, quantity_base, unit_price, tax_amount, total
  )
  select
    v_po_id,
    (i->>'product_id')::uuid,
    (i->>'unit_id')::uuid,
    (i->>'quantity')::numeric,
    coalesce((i->>'quantity_base')::numeric, (i->>'quantity')::numeric),
    coalesce((i->>'unit_price')::numeric, 0),
    coalesce((i->>'tax_amount')::numeric, 0),
    coalesce((i->>'total')::numeric, 0)
  from jsonb_array_elements(p_items) as i;

  return v_po_id;
end $$;

-- -------------------------------------------------------
-- 5. save_goods_receipt
-- -------------------------------------------------------
create or replace function save_goods_receipt(
  p_gr    jsonb,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gr_id  uuid;
  v_number text;
begin
  if not is_admin_or_staff() then
    raise exception 'permission denied';
  end if;
  perform _ensure_period_open((p_gr->>'date')::date);

  v_gr_id := nullif(p_gr->>'id', '')::uuid;

  if v_gr_id is null then
    v_number := generate_number('GR');
    v_gr_id  := gen_random_uuid();
    insert into goods_receipts (
      id, gr_number, date, supplier_id, purchase_order_id,
      status, notes, created_by
    ) values (
      v_gr_id, v_number,
      (p_gr->>'date')::date,
      (p_gr->>'supplier_id')::uuid,
      nullif(p_gr->>'purchase_order_id', '')::uuid,
      coalesce(p_gr->>'status', 'draft'),
      nullif(p_gr->>'notes', ''),
      auth.uid()
    );
  else
    update goods_receipts
       set date               = (p_gr->>'date')::date,
           supplier_id        = (p_gr->>'supplier_id')::uuid,
           purchase_order_id  = nullif(p_gr->>'purchase_order_id', '')::uuid,
           notes              = nullif(p_gr->>'notes', '')
     where id = v_gr_id and status = 'draft';
    if not found then
      raise exception 'goods receipt tidak dapat diubah (sudah diposting atau tidak ditemukan)';
    end if;
    delete from goods_receipt_items where goods_receipt_id = v_gr_id;
  end if;

  insert into goods_receipt_items (
    goods_receipt_id, product_id, unit_id,
    quantity, quantity_base, unit_price
  )
  select
    v_gr_id,
    (i->>'product_id')::uuid,
    (i->>'unit_id')::uuid,
    (i->>'quantity')::numeric,
    coalesce((i->>'quantity_base')::numeric, (i->>'quantity')::numeric),
    coalesce((i->>'unit_price')::numeric, 0)
  from jsonb_array_elements(p_items) as i;

  return v_gr_id;
end $$;

-- -------------------------------------------------------
-- 6. save_purchase_invoice
-- -------------------------------------------------------
create or replace function save_purchase_invoice(
  p_invoice jsonb,
  p_items   jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv_id   uuid;
  v_number   text;
  v_subtotal numeric := 0;
  v_tax      numeric := 0;
  v_total    numeric := 0;
  v_item     jsonb;
begin
  if not is_admin_or_staff() then
    raise exception 'permission denied';
  end if;
  perform _ensure_period_open((p_invoice->>'date')::date);

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_subtotal := v_subtotal
      + coalesce((v_item->>'quantity')::numeric, 0)
        * coalesce((v_item->>'unit_price')::numeric, 0);
    v_tax := v_tax + coalesce((v_item->>'tax_amount')::numeric, 0);
  end loop;
  v_total := v_subtotal + v_tax;

  v_inv_id := nullif(p_invoice->>'id', '')::uuid;

  if v_inv_id is null then
    v_number := generate_number('PINV');
    v_inv_id  := gen_random_uuid();
    insert into invoices (
      id, invoice_number, date, due_date, type, supplier_id,
      purchase_order_id, status, subtotal, tax_amount, total,
      notes, created_by
    ) values (
      v_inv_id, v_number,
      (p_invoice->>'date')::date,
      nullif(p_invoice->>'due_date', '')::date,
      'purchase',
      (p_invoice->>'supplier_id')::uuid,
      nullif(p_invoice->>'purchase_order_id', '')::uuid,
      coalesce(p_invoice->>'status', 'draft'),
      v_subtotal, v_tax, v_total,
      nullif(p_invoice->>'notes', ''),
      auth.uid()
    );
  else
    update invoices
       set date              = (p_invoice->>'date')::date,
           due_date          = nullif(p_invoice->>'due_date', '')::date,
           supplier_id       = (p_invoice->>'supplier_id')::uuid,
           purchase_order_id = nullif(p_invoice->>'purchase_order_id', '')::uuid,
           subtotal          = v_subtotal,
           tax_amount        = v_tax,
           total             = v_total,
           notes             = nullif(p_invoice->>'notes', '')
     where id = v_inv_id and status = 'draft' and type = 'purchase';
    if not found then
      raise exception 'purchase invoice tidak dapat diubah (sudah diposting atau tidak ditemukan)';
    end if;
    delete from invoice_items where invoice_id = v_inv_id;
  end if;

  insert into invoice_items (
    invoice_id, product_id, unit_id,
    quantity, quantity_base, unit_price, tax_amount, total
  )
  select
    v_inv_id,
    (i->>'product_id')::uuid,
    (i->>'unit_id')::uuid,
    (i->>'quantity')::numeric,
    coalesce((i->>'quantity_base')::numeric, (i->>'quantity')::numeric),
    coalesce((i->>'unit_price')::numeric, 0),
    coalesce((i->>'tax_amount')::numeric, 0),
    coalesce((i->>'total')::numeric, 0)
  from jsonb_array_elements(p_items) as i;

  return v_inv_id;
end $$;
