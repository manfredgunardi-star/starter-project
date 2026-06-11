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

-- -------------------------------------------------------
-- post_sales_invoice: debit akun UM mengurangi piutang yang dibukukan.
-- Jurnal pendapatan (lanjutan dari migration 011):
--   D Piutang            = total - UM        (hanya jika > 0)
--   D Akun Uang Muka     = UM                (hanya jika UM > 0)
--   C Pendapatan         = subtotal
--   C PPN Keluaran       = tax_amount        (hanya jika > 0)
-- Status invoice: 'paid' bila UM >= total - 0.01 (UM menutup seluruh tagihan),
-- selain itu 'posted'.
-- -------------------------------------------------------
create or replace function post_sales_invoice(p_invoice_id uuid)
returns uuid as $$
declare
  v_inv record;
  v_item record;
  v_journal_id uuid;
  v_hpp_journal_id uuid;
  v_coa_piutang uuid;
  v_coa_pendapatan uuid;
  v_coa_ppn_out uuid;
  v_coa_hpp uuid;
  v_coa_persediaan uuid;
  v_has_gd boolean;
  v_avg_cost numeric;
  v_total_hpp numeric := 0;
  v_piutang numeric;
begin
  select * into v_inv from invoices where id = p_invoice_id;
  if v_inv.status != 'draft' then
    raise exception 'Invoice already posted';
  end if;
  if v_inv.type != 'sales' then
    raise exception 'Not a sales invoice';
  end if;

  if v_inv.advance_deduction_amount > 0 and v_inv.advance_deduction_coa_id is null then
    raise exception 'akun COA uang muka wajib dipilih jika potongan uang muka > 0';
  end if;
  if v_inv.advance_deduction_amount > v_inv.total + 0.01 then
    raise exception 'potongan uang muka melebihi total invoice';
  end if;

  select id into v_coa_piutang from coa where code = '1-13000'; -- Piutang Usaha
  select id into v_coa_pendapatan from coa where code = '4-11000'; -- Pendapatan Penjualan
  select id into v_coa_ppn_out from coa where code = '2-12000'; -- PPN Keluaran
  select id into v_coa_hpp from coa where code = '5-11000'; -- HPP
  select id into v_coa_persediaan from coa where code = '1-14000'; -- Persediaan

  -- Revenue journal
  v_journal_id := gen_random_uuid();
  insert into journals (id, journal_number, date, description, source, reference_type, reference_id, customer_id, is_posted, created_by)
    values (v_journal_id, generate_number('JRN'), v_inv.date,
      'Penjualan ' || v_inv.invoice_number, 'auto', 'sales_invoice', p_invoice_id,
      v_inv.customer_id, true, v_inv.created_by);

  -- Debit: Piutang = total - uang muka (skip jika 0)
  v_piutang := v_inv.total - v_inv.advance_deduction_amount;
  if v_piutang > 0 then
    insert into journal_items (journal_id, coa_id, debit, description)
      values (v_journal_id, v_coa_piutang, v_piutang, 'Piutang - ' || v_inv.invoice_number);
  end if;

  -- Debit: Akun Uang Muka (offset) jika ada
  if v_inv.advance_deduction_amount > 0 then
    insert into journal_items (journal_id, coa_id, debit, description)
      values (v_journal_id, v_inv.advance_deduction_coa_id, v_inv.advance_deduction_amount,
              'Potongan uang muka - ' || v_inv.invoice_number);
  end if;

  -- Credit: Pendapatan = subtotal (sebelum PPN)
  insert into journal_items (journal_id, coa_id, credit, description)
    values (v_journal_id, v_coa_pendapatan, v_inv.subtotal, 'Pendapatan - ' || v_inv.invoice_number);

  -- Credit: PPN Keluaran (jika ada)
  if v_inv.tax_amount > 0 then
    insert into journal_items (journal_id, coa_id, credit, description)
      values (v_journal_id, v_coa_ppn_out, v_inv.tax_amount, 'PPN Keluaran - ' || v_inv.invoice_number);
  end if;

  -- Check if goods already delivered via goods_deliveries (HPP sudah dibuat)
  select exists(
    select 1 from goods_deliveries
      where sales_order_id = v_inv.sales_order_id
        and status = 'posted'
  ) into v_has_gd;

  -- Jika belum ada delivery, handle HPP + stock out sekarang
  if not v_has_gd then
    for v_item in select * from invoice_items where invoice_id = p_invoice_id
    loop
      v_avg_cost := inventory_stock_out(
        v_item.product_id, v_item.quantity_base,
        v_item.unit_id, v_item.quantity, 'sales_invoice', p_invoice_id, v_inv.date
      );
      v_total_hpp := v_total_hpp + (v_item.quantity_base * v_avg_cost);
    end loop;

    if v_total_hpp > 0 then
      v_hpp_journal_id := gen_random_uuid();
      insert into journals (id, journal_number, date, description, source, reference_type, reference_id, customer_id, is_posted, created_by)
        values (v_hpp_journal_id, generate_number('JRN'), v_inv.date,
          'HPP Penjualan ' || v_inv.invoice_number, 'auto', 'sales_invoice_hpp', p_invoice_id,
          v_inv.customer_id, true, v_inv.created_by);
      insert into journal_items (journal_id, coa_id, debit, description)
        values (v_hpp_journal_id, v_coa_hpp, v_total_hpp, 'HPP - ' || v_inv.invoice_number);
      insert into journal_items (journal_id, coa_id, credit, description)
        values (v_hpp_journal_id, v_coa_persediaan, v_total_hpp, 'Persediaan keluar - ' || v_inv.invoice_number);
    end if;
  end if;

  -- Update invoice status & SO status. UM penuh => langsung 'paid'.
  update invoices
     set status = case when advance_deduction_amount >= total - 0.01 then 'paid' else 'posted' end
   where id = p_invoice_id;
  if v_inv.sales_order_id is not null then
    update sales_orders set status = 'invoiced' where id = v_inv.sales_order_id;
  end if;

  return v_journal_id;
end;
$$ language plpgsql;

-- -------------------------------------------------------
-- post_payment: identik migration 033, KECUALI ambang status invoice
-- kini memperhitungkan advance_deduction_amount agar invoice dengan
-- potongan uang muka tetap bisa mencapai 'paid' saat sisa tagih lunas.
-- -------------------------------------------------------
create or replace function post_payment(p_payment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay           record;
  v_journal_id    uuid;
  v_coa_piutang   uuid;
  v_coa_hutang    uuid;
  v_effective     numeric;
begin
  perform _ensure_can_post();

  select p.*, a.coa_id as account_coa_id
    into v_pay
    from payments p
    join accounts a on p.account_id = a.id
   where p.id = p_payment_id
     for update of p;

  if v_pay is null then
    raise exception 'payment % not found', p_payment_id;
  end if;

  if v_pay.is_posted then
    return v_pay.posted_journal_id;
  end if;

  perform _ensure_period_open(v_pay.date);

  select id into v_coa_piutang from coa where code = '1-13000';
  select id into v_coa_hutang  from coa where code = '2-11000';

  v_effective := v_pay.amount + v_pay.discount_amount + v_pay.rounding_amount;

  v_journal_id := gen_random_uuid();
  insert into journals (
    id, journal_number, date, description, source,
    reference_type, reference_id, customer_id, supplier_id,
    is_posted, created_by
  ) values (
    v_journal_id, generate_number('JRN'), v_pay.date,
    'Pembayaran ' || v_pay.payment_number, 'auto', 'payment', p_payment_id,
    v_pay.customer_id, v_pay.supplier_id, true, v_pay.created_by
  );

  if v_pay.type = 'incoming' then
    insert into journal_items (journal_id, coa_id, debit, description)
      values (v_journal_id, v_pay.account_coa_id, v_pay.amount,
              'Terima pembayaran - ' || v_pay.payment_number);

    if v_pay.discount_amount > 0 then
      if v_pay.discount_coa_id is null then
        raise exception 'COA diskon wajib diisi jika discount_amount > 0';
      end if;
      insert into journal_items (journal_id, coa_id, debit, description)
        values (v_journal_id, v_pay.discount_coa_id, v_pay.discount_amount,
                'Diskon penjualan - ' || v_pay.payment_number);
    end if;

    if v_pay.rounding_amount != 0 then
      if v_pay.rounding_coa_id is null then
        raise exception 'COA pembulatan wajib diisi jika rounding_amount != 0';
      end if;
      if v_pay.rounding_amount > 0 then
        insert into journal_items (journal_id, coa_id, debit, description)
          values (v_journal_id, v_pay.rounding_coa_id, v_pay.rounding_amount,
                  'Selisih pembulatan - ' || v_pay.payment_number);
      else
        insert into journal_items (journal_id, coa_id, credit, description)
          values (v_journal_id, v_pay.rounding_coa_id, abs(v_pay.rounding_amount),
                  'Selisih pembulatan - ' || v_pay.payment_number);
      end if;
    end if;

    insert into journal_items (journal_id, coa_id, credit, description)
      values (v_journal_id, v_coa_piutang, v_effective,
              'Pelunasan piutang - ' || v_pay.payment_number);

    update accounts set balance = balance + v_pay.amount
     where id = v_pay.account_id;

  elsif v_pay.type = 'outgoing' then
    insert into journal_items (journal_id, coa_id, debit, description)
      values (v_journal_id, v_coa_hutang, v_effective,
              'Pelunasan hutang - ' || v_pay.payment_number);

    if v_pay.fee_amount > 0 then
      if v_pay.fee_coa_id is null then
        raise exception 'COA biaya bank wajib diisi jika fee_amount > 0';
      end if;
      insert into journal_items (journal_id, coa_id, debit, description)
        values (v_journal_id, v_pay.fee_coa_id, v_pay.fee_amount,
                'Biaya transfer - ' || v_pay.payment_number);
    end if;

    insert into journal_items (journal_id, coa_id, credit, description)
      values (v_journal_id, v_pay.account_coa_id, v_pay.amount + v_pay.fee_amount,
              'Bayar supplier - ' || v_pay.payment_number);

    if v_pay.discount_amount > 0 then
      if v_pay.discount_coa_id is null then
        raise exception 'COA diskon wajib diisi jika discount_amount > 0';
      end if;
      insert into journal_items (journal_id, coa_id, credit, description)
        values (v_journal_id, v_pay.discount_coa_id, v_pay.discount_amount,
                'Diskon pembelian - ' || v_pay.payment_number);
    end if;

    if v_pay.rounding_amount != 0 then
      if v_pay.rounding_coa_id is null then
        raise exception 'COA pembulatan wajib diisi jika rounding_amount != 0';
      end if;
      if v_pay.rounding_amount > 0 then
        insert into journal_items (journal_id, coa_id, credit, description)
          values (v_journal_id, v_pay.rounding_coa_id, v_pay.rounding_amount,
                  'Selisih pembulatan - ' || v_pay.payment_number);
      else
        insert into journal_items (journal_id, coa_id, debit, description)
          values (v_journal_id, v_pay.rounding_coa_id, abs(v_pay.rounding_amount),
                  'Selisih pembulatan - ' || v_pay.payment_number);
      end if;
    end if;

    update accounts set balance = balance - (v_pay.amount + v_pay.fee_amount)
     where id = v_pay.account_id;
  end if;

  -- Update invoice: ambang 'paid' kini memperhitungkan potongan uang muka.
  if v_pay.invoice_id is not null then
    update invoices
       set amount_paid = amount_paid + v_effective,
           status = case
             when amount_paid + v_effective + advance_deduction_amount >= total - 0.01 then 'paid'
             else 'partial'
           end
     where id = v_pay.invoice_id;
  end if;

  update payments
     set is_posted         = true,
         posted_journal_id = v_journal_id,
         posted_at         = now()
   where id = p_payment_id;

  return v_journal_id;
end $$;
