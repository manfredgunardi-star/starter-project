-- ============================================================
-- Migration 023: Document Linkage
-- Adds goods_delivery_id to invoices (link SI→GD).
-- Activates goods_receipt_id in save_purchase_invoice.
-- Adds goods_delivery_id to save_sales_invoice.
-- ============================================================

-- 1. New column: goods_delivery_id on invoices
alter table invoices
  add column goods_delivery_id uuid references goods_deliveries(id);

create index idx_invoices_gd on invoices(goods_delivery_id);

-- 2. save_purchase_invoice: activate goods_receipt_id (column exists since 005, never set)
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
      purchase_order_id, goods_receipt_id, status, subtotal, tax_amount, total,
      notes, created_by
    ) values (
      v_inv_id, v_number,
      (p_invoice->>'date')::date,
      nullif(p_invoice->>'due_date', '')::date,
      'purchase',
      (p_invoice->>'supplier_id')::uuid,
      nullif(p_invoice->>'purchase_order_id', '')::uuid,
      nullif(p_invoice->>'goods_receipt_id',  '')::uuid,
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
           goods_receipt_id  = nullif(p_invoice->>'goods_receipt_id',  '')::uuid,
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

-- 3. save_sales_invoice: add goods_delivery_id field
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
      sales_order_id, goods_delivery_id, status, subtotal, tax_amount, total,
      notes, created_by
    ) values (
      v_inv_id, v_number,
      (p_invoice->>'date')::date,
      nullif(p_invoice->>'due_date', '')::date,
      'sales',
      (p_invoice->>'customer_id')::uuid,
      nullif(p_invoice->>'sales_order_id',    '')::uuid,
      nullif(p_invoice->>'goods_delivery_id', '')::uuid,
      coalesce(p_invoice->>'status', 'draft'),
      v_subtotal, v_tax, v_total,
      nullif(p_invoice->>'notes', ''),
      auth.uid()
    );
  else
    update invoices
       set date              = (p_invoice->>'date')::date,
           due_date          = nullif(p_invoice->>'due_date', '')::date,
           customer_id       = (p_invoice->>'customer_id')::uuid,
           sales_order_id    = nullif(p_invoice->>'sales_order_id',    '')::uuid,
           goods_delivery_id = nullif(p_invoice->>'goods_delivery_id', '')::uuid,
           subtotal          = v_subtotal,
           tax_amount        = v_tax,
           total             = v_total,
           notes             = nullif(p_invoice->>'notes', '')
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
