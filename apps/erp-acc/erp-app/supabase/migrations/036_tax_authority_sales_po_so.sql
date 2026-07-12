-- 036_tax_authority_sales_po_so.sql
--
-- Defense-in-depth PPN, lanjutan dari migration 035 (purchase invoice).
--
-- save_sales_invoice, save_sales_order, dan save_purchase_order sebelumnya
-- menjumlahkan tax_amount mentah dari client. Untuk sales invoice ini bug nyata:
-- saat dibuat dari Goods Delivery, client mengirim tax_amount: 0 sehingga PPN
-- keluaran tersimpan 0.
--
-- Perbaikan: ketiga RPC menghitung ulang tax_amount & total per baris dari master
-- produk (products.is_taxable / products.tax_rate, default 11%). quantity,
-- quantity_base, unit_price tetap dari client. Konvensi subtotal tiap dokumen
-- dipertahankan apa adanya: sales invoice & sales order memakai quantity,
-- purchase order memakai quantity_base (sesuai definisi sebelumnya).

-- =====================================================================
-- 1. save_sales_invoice  (subtotal basis: quantity * unit_price)
-- =====================================================================
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
begin
  if not is_admin_or_staff() then
    raise exception 'permission denied';
  end if;
  perform _ensure_period_open((p_invoice->>'date')::date);

  select coalesce(sum(line_subtotal), 0), coalesce(sum(line_tax), 0)
  into v_subtotal, v_tax
  from (
    select
      qty * price as line_subtotal,
      case when p.is_taxable
           then round(qty * price * coalesce(nullif(p.tax_rate, 0), 11) / 100, 2)
           else 0 end as line_tax
    from jsonb_array_elements(p_items) as i
    join products p on p.id = (i->>'product_id')::uuid
    cross join lateral (
      select coalesce((i->>'quantity')::numeric, 0)   as qty,
             coalesce((i->>'unit_price')::numeric, 0)  as price
    ) v
  ) lines;
  v_total := v_subtotal + v_tax;

  v_inv_id := nullif(p_invoice->>'id', '')::uuid;

  if v_inv_id is null then
    v_number := generate_number('INV');
    v_inv_id  := gen_random_uuid();
    insert into invoices (
      id, invoice_number, date, due_date, type, customer_id,
      sales_order_id, goods_delivery_id, payment_term_id,
      status, subtotal, tax_amount, total, notes, created_by
    ) values (
      v_inv_id, v_number,
      (p_invoice->>'date')::date,
      nullif(p_invoice->>'due_date', '')::date,
      'sales',
      (p_invoice->>'customer_id')::uuid,
      nullif(p_invoice->>'sales_order_id',    '')::uuid,
      nullif(p_invoice->>'goods_delivery_id', '')::uuid,
      nullif(p_invoice->>'payment_term_id',   '')::uuid,
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
           payment_term_id   = nullif(p_invoice->>'payment_term_id',   '')::uuid,
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
    v.qty,
    coalesce((i->>'quantity_base')::numeric, v.qty),
    v.price,
    t.line_tax,
    v.qty * v.price + t.line_tax
  from jsonb_array_elements(p_items) as i
  join products p on p.id = (i->>'product_id')::uuid
  cross join lateral (
    select coalesce((i->>'quantity')::numeric, 0)  as qty,
           coalesce((i->>'unit_price')::numeric, 0) as price
  ) v
  cross join lateral (
    select case when p.is_taxable
                then round(v.qty * v.price * coalesce(nullif(p.tax_rate, 0), 11) / 100, 2)
                else 0 end as line_tax
  ) t;

  return v_inv_id;
end $$;

-- =====================================================================
-- 2. save_sales_order  (subtotal basis: quantity * unit_price)
-- =====================================================================
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
  v_so_id    uuid;
  v_number   text;
  v_subtotal numeric := 0;
  v_tax      numeric := 0;
  v_total    numeric := 0;
begin
  if not is_admin_or_staff() then
    raise exception 'permission denied';
  end if;
  perform _ensure_period_open((p_so->>'date')::date);

  select coalesce(sum(line_subtotal), 0), coalesce(sum(line_tax), 0)
  into v_subtotal, v_tax
  from (
    select
      qty * price as line_subtotal,
      case when p.is_taxable
           then round(qty * price * coalesce(nullif(p.tax_rate, 0), 11) / 100, 2)
           else 0 end as line_tax
    from jsonb_array_elements(p_items) as i
    join products p on p.id = (i->>'product_id')::uuid
    cross join lateral (
      select coalesce((i->>'quantity')::numeric, 0)   as qty,
             coalesce((i->>'unit_price')::numeric, 0)  as price
    ) v
  ) lines;
  v_total := v_subtotal + v_tax;

  v_so_id := nullif(p_so->>'id', '')::uuid;

  if v_so_id is null then
    v_number := generate_number('SO');
    v_so_id  := gen_random_uuid();
    insert into sales_orders (
      id, so_number, date, customer_id, payment_term_id, warehouse_id, status,
      subtotal, tax_amount, total, notes, created_by
    ) values (
      v_so_id, v_number,
      (p_so->>'date')::date,
      (p_so->>'customer_id')::uuid,
      nullif(p_so->>'payment_term_id', '')::uuid,
      nullif(p_so->>'warehouse_id', '')::uuid,
      coalesce(p_so->>'status', 'draft'),
      v_subtotal, v_tax, v_total,
      nullif(p_so->>'notes', ''),
      auth.uid()
    );
  else
    update sales_orders
       set date            = (p_so->>'date')::date,
           customer_id     = (p_so->>'customer_id')::uuid,
           payment_term_id = nullif(p_so->>'payment_term_id', '')::uuid,
           warehouse_id    = nullif(p_so->>'warehouse_id', '')::uuid,
           subtotal        = v_subtotal,
           tax_amount      = v_tax,
           total           = v_total,
           notes           = nullif(p_so->>'notes', '')
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
    v.qty,
    coalesce((i->>'quantity_base')::numeric, v.qty),
    v.price,
    t.line_tax,
    v.qty * v.price + t.line_tax
  from jsonb_array_elements(p_items) as i
  join products p on p.id = (i->>'product_id')::uuid
  cross join lateral (
    select coalesce((i->>'quantity')::numeric, 0)  as qty,
           coalesce((i->>'unit_price')::numeric, 0) as price
  ) v
  cross join lateral (
    select case when p.is_taxable
                then round(v.qty * v.price * coalesce(nullif(p.tax_rate, 0), 11) / 100, 2)
                else 0 end as line_tax
  ) t;

  return v_so_id;
end $$;

-- =====================================================================
-- 3. save_purchase_order  (subtotal basis: quantity_base * unit_price,
--    konvensi asli dipertahankan)
-- =====================================================================
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
begin
  if not is_admin_or_staff() then
    raise exception 'permission denied';
  end if;
  perform _ensure_period_open((p_po->>'date')::date);

  select coalesce(sum(line_subtotal), 0), coalesce(sum(line_tax), 0)
  into v_subtotal, v_tax
  from (
    select
      qbase * price as line_subtotal,
      case when p.is_taxable
           then round(qbase * price * coalesce(nullif(p.tax_rate, 0), 11) / 100, 2)
           else 0 end as line_tax
    from jsonb_array_elements(p_items) as i
    join products p on p.id = (i->>'product_id')::uuid
    cross join lateral (
      select coalesce((i->>'quantity_base')::numeric, (i->>'quantity')::numeric, 0) as qbase,
             coalesce((i->>'unit_price')::numeric, 0)                                as price
    ) v
  ) lines;
  v_total := v_subtotal + v_tax;

  v_po_id := nullif(p_po->>'id', '')::uuid;

  if v_po_id is null then
    v_number := generate_number('PO');
    v_po_id  := gen_random_uuid();
    insert into purchase_orders (
      id, po_number, date, supplier_id, payment_term_id, warehouse_id, status,
      subtotal, tax_amount, total, notes, created_by
    ) values (
      v_po_id, v_number,
      (p_po->>'date')::date,
      (p_po->>'supplier_id')::uuid,
      nullif(p_po->>'payment_term_id', '')::uuid,
      nullif(p_po->>'warehouse_id', '')::uuid,
      coalesce(p_po->>'status', 'draft'),
      v_subtotal, v_tax, v_total,
      nullif(p_po->>'notes', ''),
      auth.uid()
    );
  else
    update purchase_orders
       set date            = (p_po->>'date')::date,
           supplier_id     = (p_po->>'supplier_id')::uuid,
           payment_term_id = nullif(p_po->>'payment_term_id', '')::uuid,
           warehouse_id    = nullif(p_po->>'warehouse_id', '')::uuid,
           subtotal        = v_subtotal,
           tax_amount      = v_tax,
           total           = v_total,
           notes           = nullif(p_po->>'notes', '')
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
    v.qbase,
    v.price,
    t.line_tax,
    v.qbase * v.price + t.line_tax
  from jsonb_array_elements(p_items) as i
  join products p on p.id = (i->>'product_id')::uuid
  cross join lateral (
    select coalesce((i->>'quantity_base')::numeric, (i->>'quantity')::numeric, 0) as qbase,
           coalesce((i->>'unit_price')::numeric, 0)                                as price
  ) v
  cross join lateral (
    select case when p.is_taxable
                then round(v.qbase * v.price * coalesce(nullif(p.tax_rate, 0), 11) / 100, 2)
                else 0 end as line_tax
  ) t;

  return v_po_id;
end $$;
