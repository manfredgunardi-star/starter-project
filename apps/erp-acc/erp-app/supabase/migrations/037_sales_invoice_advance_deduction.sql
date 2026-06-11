-- ============================================================
-- Migration 037: Sales Invoice — Potongan Uang Muka (advance deduction)
-- Menambah 2 kolom di invoices (pola mengikuti discount_coa_id migration 033):
--   advance_deduction_amount : nominal potongan uang muka (>= 0)
--   advance_deduction_coa_id : akun COA tujuan debit saat posting (dipilih user)
--
-- Konvensi: invoices.total tetap PENUH (subtotal + PPN). Potongan uang muka
-- mengurangi PIUTANG yang dibukukan saat posting, bukan total invoice.
-- Sisa tagih = total - advance_deduction_amount - amount_paid.
--
-- Hanya berlaku untuk sales invoice (type='sales'). Validasi UM <= total
-- dilakukan server-side di save_sales_invoice.
-- ============================================================

alter table invoices
  add column if not exists advance_deduction_amount numeric(15,2) not null default 0
    check (advance_deduction_amount >= 0),
  add column if not exists advance_deduction_coa_id  uuid references coa(id);

-- -------------------------------------------------------
-- save_sales_invoice: persist + validasi UM
-- (lanjutan dari migration 036; subtotal/tax tetap recompute server-side)
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
  v_inv_id     uuid;
  v_number     text;
  v_subtotal   numeric := 0;
  v_tax        numeric := 0;
  v_total      numeric := 0;
  v_adv_amount numeric := 0;
  v_adv_coa    uuid;
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

  -- Potongan uang muka (manual). Validasi: 0 <= UM <= total, butuh COA bila > 0.
  v_adv_amount := coalesce((p_invoice->>'advance_deduction_amount')::numeric, 0);
  v_adv_coa    := nullif(p_invoice->>'advance_deduction_coa_id', '')::uuid;
  if v_adv_amount < 0 then
    raise exception 'potongan uang muka tidak boleh negatif';
  end if;
  if v_adv_amount > v_total + 0.01 then
    raise exception 'potongan uang muka (%) melebihi total invoice (%)', v_adv_amount, v_total;
  end if;
  if v_adv_amount > 0 and v_adv_coa is null then
    raise exception 'akun COA uang muka wajib dipilih jika potongan uang muka > 0';
  end if;

  v_inv_id := nullif(p_invoice->>'id', '')::uuid;

  if v_inv_id is null then
    v_number := generate_number('INV');
    v_inv_id  := gen_random_uuid();
    insert into invoices (
      id, invoice_number, date, due_date, type, customer_id,
      sales_order_id, goods_delivery_id, payment_term_id,
      status, subtotal, tax_amount, total,
      advance_deduction_amount, advance_deduction_coa_id,
      notes, created_by
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
      v_adv_amount, v_adv_coa,
      nullif(p_invoice->>'notes', ''),
      auth.uid()
    );
  else
    update invoices
       set date                     = (p_invoice->>'date')::date,
           due_date                 = nullif(p_invoice->>'due_date', '')::date,
           customer_id              = (p_invoice->>'customer_id')::uuid,
           sales_order_id           = nullif(p_invoice->>'sales_order_id',    '')::uuid,
           goods_delivery_id        = nullif(p_invoice->>'goods_delivery_id', '')::uuid,
           payment_term_id          = nullif(p_invoice->>'payment_term_id',   '')::uuid,
           subtotal                 = v_subtotal,
           tax_amount               = v_tax,
           total                    = v_total,
           advance_deduction_amount = v_adv_amount,
           advance_deduction_coa_id = v_adv_coa,
           notes                    = nullif(p_invoice->>'notes', '')
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
