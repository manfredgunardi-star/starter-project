-- ============================================================
-- Migration 016: Server-side closed-period enforcement (V3)
-- Adds is_period_closed() + _ensure_period_open() helpers, then
-- re-creates all 11 posting RPCs to call both guards at entry.
-- ============================================================

-- Helper: check if a date falls in a closed accounting period
create or replace function is_period_closed(p_date date)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_key text := to_char(p_date, 'YYYY-MM');
  v_closed jsonb;
begin
  select closed_periods into v_closed from company_settings limit 1;
  if v_closed is null then return false; end if;
  return v_closed ? v_key;
end $$;

-- Helper: raise if period is closed
create or replace function _ensure_period_open(p_date date)
returns void
language plpgsql
stable
as $$
begin
  if is_period_closed(p_date) then
    raise exception 'periode % sudah ditutup', to_char(p_date, 'YYYY-MM')
      using errcode = 'P0001';
  end if;
end $$;

-- ============================================================
-- Re-create posting RPCs with _ensure_can_post() + _ensure_period_open()
-- All functions are security definer (set in migration 015).
-- ============================================================

-- 1. post_goods_receipt
create or replace function post_goods_receipt(p_gr_id uuid)
returns uuid as $$
declare
  v_gr record;
  v_item record;
  v_journal_id uuid;
  v_coa_persediaan uuid;
  v_coa_hutang_barang uuid;
  v_total numeric := 0;
begin
  perform _ensure_can_post();

  select * into v_gr from goods_receipts where id = p_gr_id;
  if v_gr is null then raise exception 'goods receipt not found'; end if;
  if v_gr.status != 'draft' then
    raise exception 'Goods receipt already posted';
  end if;

  perform _ensure_period_open(v_gr.date);

  select id into v_coa_persediaan from coa where code = '1-14000';
  select id into v_coa_hutang_barang from coa where code = '2-11100';

  for v_item in select * from goods_receipt_items where goods_receipt_id = p_gr_id
  loop
    perform inventory_stock_in(
      v_item.product_id, v_item.quantity_base, v_item.unit_price,
      v_item.unit_id, v_item.quantity, 'goods_receipt', p_gr_id, v_gr.date
    );
    v_total := v_total + (v_item.quantity_base * v_item.unit_price);
  end loop;

  v_journal_id := gen_random_uuid();
  insert into journals (id, journal_number, date, description, source, reference_type, reference_id, supplier_id, is_posted, created_by)
    values (v_journal_id, generate_number('JRN'), v_gr.date,
      'Penerimaan Barang ' || v_gr.gr_number, 'auto', 'goods_receipt', p_gr_id,
      v_gr.supplier_id, true, v_gr.created_by);

  insert into journal_items (journal_id, coa_id, debit, description)
    values (v_journal_id, v_coa_persediaan, v_total, 'Persediaan masuk - ' || v_gr.gr_number);
  insert into journal_items (journal_id, coa_id, credit, description)
    values (v_journal_id, v_coa_hutang_barang, v_total, 'Hutang barang diterima - ' || v_gr.gr_number);

  update goods_receipts set status = 'posted' where id = p_gr_id;
  return v_journal_id;
end;
$$ language plpgsql security definer set search_path = public;

-- 2. post_goods_delivery
create or replace function post_goods_delivery(p_gd_id uuid)
returns uuid as $$
declare
  v_gd record;
  v_item record;
  v_journal_id uuid;
  v_coa_hpp uuid;
  v_coa_persediaan uuid;
  v_avg_cost numeric;
  v_total_hpp numeric := 0;
begin
  perform _ensure_can_post();

  select * into v_gd from goods_deliveries where id = p_gd_id;
  if v_gd is null then raise exception 'goods delivery not found'; end if;
  if v_gd.status != 'draft' then
    raise exception 'Goods delivery already posted';
  end if;

  perform _ensure_period_open(v_gd.date);

  select id into v_coa_hpp from coa where code = '5-11000';
  select id into v_coa_persediaan from coa where code = '1-14000';

  for v_item in select * from goods_delivery_items where goods_delivery_id = p_gd_id
  loop
    v_avg_cost := inventory_stock_out(
      v_item.product_id, v_item.quantity_base,
      v_item.unit_id, v_item.quantity, 'goods_delivery', p_gd_id, v_gd.date
    );
    v_total_hpp := v_total_hpp + (v_item.quantity_base * v_avg_cost);
  end loop;

  v_journal_id := gen_random_uuid();
  insert into journals (id, journal_number, date, description, source, reference_type, reference_id, customer_id, is_posted, created_by)
    values (v_journal_id, generate_number('JRN'), v_gd.date,
      'HPP Pengiriman ' || v_gd.gd_number, 'auto', 'goods_delivery', p_gd_id,
      v_gd.customer_id, true, v_gd.created_by);

  insert into journal_items (journal_id, coa_id, debit, description)
    values (v_journal_id, v_coa_hpp, v_total_hpp, 'HPP - ' || v_gd.gd_number);
  insert into journal_items (journal_id, coa_id, credit, description)
    values (v_journal_id, v_coa_persediaan, v_total_hpp, 'Persediaan keluar - ' || v_gd.gd_number);

  update goods_deliveries set status = 'posted' where id = p_gd_id;
  return v_journal_id;
end;
$$ language plpgsql security definer set search_path = public;

-- 3. post_sales_invoice
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
begin
  perform _ensure_can_post();

  select * into v_inv from invoices where id = p_invoice_id;
  if v_inv is null then raise exception 'invoice not found'; end if;
  if v_inv.status != 'draft' then
    raise exception 'Invoice already posted';
  end if;
  if v_inv.type != 'sales' then
    raise exception 'Not a sales invoice';
  end if;

  perform _ensure_period_open(v_inv.date);

  select id into v_coa_piutang from coa where code = '1-13000';
  select id into v_coa_pendapatan from coa where code = '4-11000';
  select id into v_coa_ppn_out from coa where code = '2-12000';
  select id into v_coa_hpp from coa where code = '5-11000';
  select id into v_coa_persediaan from coa where code = '1-14000';

  v_journal_id := gen_random_uuid();
  insert into journals (id, journal_number, date, description, source, reference_type, reference_id, customer_id, is_posted, created_by)
    values (v_journal_id, generate_number('JRN'), v_inv.date,
      'Penjualan ' || v_inv.invoice_number, 'auto', 'sales_invoice', p_invoice_id,
      v_inv.customer_id, true, v_inv.created_by);

  insert into journal_items (journal_id, coa_id, debit, description)
    values (v_journal_id, v_coa_piutang, v_inv.total, 'Piutang - ' || v_inv.invoice_number);
  insert into journal_items (journal_id, coa_id, credit, description)
    values (v_journal_id, v_coa_pendapatan, v_inv.subtotal, 'Pendapatan - ' || v_inv.invoice_number);

  if v_inv.tax_amount > 0 then
    insert into journal_items (journal_id, coa_id, credit, description)
      values (v_journal_id, v_coa_ppn_out, v_inv.tax_amount, 'PPN Keluaran - ' || v_inv.invoice_number);
  end if;

  select exists(
    select 1 from goods_deliveries
      where sales_order_id = v_inv.sales_order_id
        and status = 'posted'
  ) into v_has_gd;

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

  update invoices set status = 'posted' where id = p_invoice_id;
  if v_inv.sales_order_id is not null then
    update sales_orders set status = 'invoiced' where id = v_inv.sales_order_id;
  end if;

  return v_journal_id;
end;
$$ language plpgsql security definer set search_path = public;

-- 4. post_purchase_invoice
create or replace function post_purchase_invoice(p_invoice_id uuid)
returns uuid as $$
declare
  v_inv record;
  v_item record;
  v_journal_id uuid;
  v_coa_persediaan uuid;
  v_coa_ppn_in uuid;
  v_coa_hutang uuid;
  v_coa_hutang_barang uuid;
  v_coa_selisih uuid;
  v_has_gr boolean;
  v_gr_total numeric := 0;
  v_selisih numeric;
begin
  perform _ensure_can_post();

  select * into v_inv from invoices where id = p_invoice_id;
  if v_inv is null then raise exception 'invoice not found'; end if;
  if v_inv.status != 'draft' then
    raise exception 'Invoice already posted';
  end if;
  if v_inv.type != 'purchase' then
    raise exception 'Not a purchase invoice';
  end if;

  perform _ensure_period_open(v_inv.date);

  select id into v_coa_persediaan from coa where code = '1-14000';
  select id into v_coa_ppn_in from coa where code = '1-15000';
  select id into v_coa_hutang from coa where code = '2-11000';
  select id into v_coa_hutang_barang from coa where code = '2-11100';
  select id into v_coa_selisih from coa where code = '5-19000';

  v_journal_id := gen_random_uuid();
  insert into journals (id, journal_number, date, description, source, reference_type, reference_id, supplier_id, is_posted, created_by)
    values (v_journal_id, generate_number('JRN'), v_inv.date,
      'Pembelian ' || v_inv.invoice_number, 'auto', 'purchase_invoice', p_invoice_id,
      v_inv.supplier_id, true, v_inv.created_by);

  select exists(
    select 1 from goods_receipts
      where purchase_order_id = v_inv.purchase_order_id
        and status = 'posted'
  ) into v_has_gr;

  if v_has_gr then
    select coalesce(sum(gri.quantity_base * gri.unit_price), 0) into v_gr_total
      from goods_receipt_items gri
      join goods_receipts gr on gri.goods_receipt_id = gr.id
      where gr.purchase_order_id = v_inv.purchase_order_id and gr.status = 'posted';

    insert into journal_items (journal_id, coa_id, debit, description)
      values (v_journal_id, v_coa_hutang_barang, v_gr_total, 'Clear accrual - ' || v_inv.invoice_number);
    insert into journal_items (journal_id, coa_id, credit, description)
      values (v_journal_id, v_coa_hutang, v_inv.total, 'Hutang usaha - ' || v_inv.invoice_number);

    if v_inv.tax_amount > 0 then
      insert into journal_items (journal_id, coa_id, debit, description)
        values (v_journal_id, v_coa_ppn_in, v_inv.tax_amount, 'PPN Masukan - ' || v_inv.invoice_number);
    end if;

    v_selisih := v_inv.subtotal - v_gr_total;
    if v_selisih > 0 then
      insert into journal_items (journal_id, coa_id, debit, description)
        values (v_journal_id, v_coa_selisih, v_selisih, 'Selisih harga - ' || v_inv.invoice_number);
    elsif v_selisih < 0 then
      insert into journal_items (journal_id, coa_id, credit, description)
        values (v_journal_id, v_coa_selisih, abs(v_selisih), 'Selisih harga - ' || v_inv.invoice_number);
    end if;

  else
    for v_item in select * from invoice_items where invoice_id = p_invoice_id
    loop
      perform inventory_stock_in(
        v_item.product_id, v_item.quantity_base, v_item.unit_price,
        v_item.unit_id, v_item.quantity, 'purchase_invoice', p_invoice_id, v_inv.date
      );
    end loop;

    insert into journal_items (journal_id, coa_id, debit, description)
      values (v_journal_id, v_coa_persediaan, v_inv.subtotal, 'Persediaan masuk - ' || v_inv.invoice_number);

    if v_inv.tax_amount > 0 then
      insert into journal_items (journal_id, coa_id, debit, description)
        values (v_journal_id, v_coa_ppn_in, v_inv.tax_amount, 'PPN Masukan - ' || v_inv.invoice_number);
    end if;

    insert into journal_items (journal_id, coa_id, credit, description)
      values (v_journal_id, v_coa_hutang, v_inv.total, 'Hutang usaha - ' || v_inv.invoice_number);
  end if;

  update invoices set status = 'posted' where id = p_invoice_id;
  if v_inv.purchase_order_id is not null then
    update purchase_orders set status = 'done' where id = v_inv.purchase_order_id;
  end if;

  return v_journal_id;
end;
$$ language plpgsql security definer set search_path = public;

-- 5. post_payment
create or replace function post_payment(p_payment_id uuid)
returns uuid as $$
declare
  v_pay record;
  v_journal_id uuid;
  v_coa_piutang uuid;
  v_coa_hutang uuid;
begin
  perform _ensure_can_post();

  select p.*, a.coa_id as account_coa_id
    into v_pay
    from payments p
    join accounts a on p.account_id = a.id
    where p.id = p_payment_id;

  if v_pay is null then raise exception 'payment not found'; end if;

  perform _ensure_period_open(v_pay.date);

  select id into v_coa_piutang from coa where code = '1-13000';
  select id into v_coa_hutang from coa where code = '2-11000';

  v_journal_id := gen_random_uuid();
  insert into journals (id, journal_number, date, description, source, reference_type, reference_id,
    customer_id, supplier_id, is_posted, created_by)
    values (v_journal_id, generate_number('JRN'), v_pay.date,
      'Pembayaran ' || v_pay.payment_number, 'auto', 'payment', p_payment_id,
      v_pay.customer_id, v_pay.supplier_id, true, v_pay.created_by);

  if v_pay.type = 'incoming' then
    insert into journal_items (journal_id, coa_id, debit, description)
      values (v_journal_id, v_pay.account_coa_id, v_pay.amount, 'Terima pembayaran - ' || v_pay.payment_number);
    insert into journal_items (journal_id, coa_id, credit, description)
      values (v_journal_id, v_coa_piutang, v_pay.amount, 'Pelunasan piutang - ' || v_pay.payment_number);
    update accounts set balance = balance + v_pay.amount where id = v_pay.account_id;
  elsif v_pay.type = 'outgoing' then
    insert into journal_items (journal_id, coa_id, debit, description)
      values (v_journal_id, v_coa_hutang, v_pay.amount, 'Pelunasan hutang - ' || v_pay.payment_number);
    insert into journal_items (journal_id, coa_id, credit, description)
      values (v_journal_id, v_pay.account_coa_id, v_pay.amount, 'Bayar supplier - ' || v_pay.payment_number);
    update accounts set balance = balance - v_pay.amount where id = v_pay.account_id;
  end if;

  if v_pay.invoice_id is not null then
    update invoices
      set amount_paid = amount_paid + v_pay.amount,
          status = case
            when amount_paid + v_pay.amount >= total then 'paid'
            else 'partial'
          end
      where id = v_pay.invoice_id;
  end if;

  return v_journal_id;
end;
$$ language plpgsql security definer set search_path = public;

-- 6. post_transfer
create or replace function post_transfer(
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_amount numeric,
  p_date date,
  p_notes text,
  p_user_id uuid
)
returns uuid as $$
declare
  v_journal_id uuid;
  v_from_coa uuid;
  v_to_coa uuid;
  v_number text;
begin
  perform _ensure_can_post();
  perform _ensure_period_open(p_date);

  select coa_id into v_from_coa from accounts where id = p_from_account_id;
  select coa_id into v_to_coa from accounts where id = p_to_account_id;
  v_number := generate_number('TRF');

  v_journal_id := gen_random_uuid();
  insert into journals (id, journal_number, date, description, source, reference_type, reference_id, is_posted, created_by)
    values (v_journal_id, generate_number('JRN'), p_date,
      'Transfer ' || v_number || coalesce(' - ' || p_notes, ''),
      'auto', 'transfer', v_journal_id, true, p_user_id);

  insert into journal_items (journal_id, coa_id, debit, description)
    values (v_journal_id, v_to_coa, p_amount, 'Transfer masuk');
  insert into journal_items (journal_id, coa_id, credit, description)
    values (v_journal_id, v_from_coa, p_amount, 'Transfer keluar');

  update accounts set balance = balance - p_amount where id = p_from_account_id;
  update accounts set balance = balance + p_amount where id = p_to_account_id;

  return v_journal_id;
end;
$$ language plpgsql security definer set search_path = public;

-- 7. post_expense
create or replace function post_expense(
  p_account_id uuid,
  p_coa_beban_id uuid,
  p_amount numeric,
  p_date date,
  p_description text,
  p_user_id uuid
)
returns uuid as $$
declare
  v_journal_id uuid;
  v_account_coa uuid;
begin
  perform _ensure_can_post();
  perform _ensure_period_open(p_date);

  select coa_id into v_account_coa from accounts where id = p_account_id;

  v_journal_id := gen_random_uuid();
  insert into journals (id, journal_number, date, description, source, reference_type, is_posted, created_by)
    values (v_journal_id, generate_number('JRN'), p_date,
      coalesce(p_description, 'Pengeluaran operasional'),
      'auto', 'expense', true, p_user_id);

  insert into journal_items (journal_id, coa_id, debit, description)
    values (v_journal_id, p_coa_beban_id, p_amount, p_description);
  insert into journal_items (journal_id, coa_id, credit, description)
    values (v_journal_id, v_account_coa, p_amount, 'Kas/Bank keluar');

  update accounts set balance = balance - p_amount where id = p_account_id;

  return v_journal_id;
end;
$$ language plpgsql security definer set search_path = public;

-- 8. post_manual_journal
create or replace function post_manual_journal(p_journal_id uuid)
returns void as $$
declare
  v_journal record;
begin
  perform _ensure_can_post();

  select * into v_journal from journals where id = p_journal_id;
  if v_journal is null then raise exception 'journal not found'; end if;

  perform _ensure_period_open(v_journal.date);

  if not validate_journal_balance(p_journal_id) then
    raise exception 'Journal is not balanced (total debit != total credit)';
  end if;

  update journals set is_posted = true where id = p_journal_id and source = 'manual';
end;
$$ language plpgsql security definer set search_path = public;

-- 9. create_asset_acquisition_journal (already security definer in 014; add period check)
create or replace function create_asset_acquisition_journal(
  p_asset_id uuid,
  p_payment jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset record;
  v_category record;
  v_journal_id uuid;
  v_journal_number text;
  v_cash_amt numeric := coalesce((p_payment->>'cash_bank_amount')::numeric, 0);
  v_hutang_amt numeric := coalesce((p_payment->>'hutang_amount')::numeric, 0);
  v_um_amt numeric := coalesce((p_payment->>'uang_muka_amount')::numeric, 0);
begin
  perform _ensure_can_post();

  select * into v_asset from assets where id = p_asset_id;
  if v_asset is null then raise exception 'asset not found'; end if;

  perform _ensure_period_open(v_asset.acquisition_date);

  select * into v_category from asset_categories where id = v_asset.category_id;

  if abs((v_cash_amt + v_hutang_amt + v_um_amt) - v_asset.acquisition_cost) > 0.01 then
    raise exception 'payment sum (%) does not match acquisition_cost (%)',
      (v_cash_amt + v_hutang_amt + v_um_amt), v_asset.acquisition_cost;
  end if;

  v_journal_number := generate_number('JRN');

  insert into journals (journal_number, date, description, source, is_posted, created_by)
    values (v_journal_number, v_asset.acquisition_date,
            'Perolehan ' || v_asset.name || ' (' || v_asset.code || ')',
            'asset_acquisition', true, auth.uid())
    returning id into v_journal_id;

  insert into journal_items (journal_id, coa_id, debit, credit, description)
    values (v_journal_id, v_category.asset_account_id,
            v_asset.acquisition_cost, 0, 'Perolehan ' || v_asset.code);

  if v_cash_amt > 0 then
    insert into journal_items (journal_id, coa_id, debit, credit, description)
      values (v_journal_id, (p_payment->>'cash_bank_account_id')::uuid,
              0, v_cash_amt, 'Pembayaran tunai/bank');
  end if;

  if v_hutang_amt > 0 then
    insert into journal_items (journal_id, coa_id, debit, credit, description)
      values (v_journal_id, (p_payment->>'hutang_account_id')::uuid,
              0, v_hutang_amt, 'Hutang pembelian aset');
  end if;

  if v_um_amt > 0 then
    insert into journal_items (journal_id, coa_id, debit, credit, description)
      values (v_journal_id, (p_payment->>'uang_muka_account_id')::uuid,
              0, v_um_amt, 'Pemakaian uang muka');
  end if;

  return v_journal_id;
end $$;

-- 10. post_depreciation_batch (already security definer in 014; add period check)
create or replace function post_depreciation_batch(
  p_period_from text,
  p_period_to text,
  p_posting_date date,
  p_description_template text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_category record;
  v_journal_id uuid;
  v_journal_number text;
  v_posted int := 0;
  v_skipped int := 0;
  v_errors jsonb := '[]'::jsonb;
  v_desc text;
begin
  perform _ensure_can_post();
  perform _ensure_period_open(p_posting_date);

  for v_row in
    select ds.*, a.name as asset_name, a.code as asset_code, a.category_id
    from depreciation_schedules ds
    join assets a on a.id = ds.asset_id
    where ds.period between p_period_from and p_period_to
      and ds.status = 'pending'
      and a.status = 'active'
      and a.is_active = true
    order by ds.period, a.code
  loop
    begin
      select * into v_category from asset_categories where id = v_row.category_id;

      v_journal_number := generate_number('JRN');
      v_desc := replace(
        replace(p_description_template, '{asset}', v_row.asset_name),
        '{period}', v_row.period
      );

      insert into journals (journal_number, date, description, source, is_posted, created_by)
        values (v_journal_number, p_posting_date, v_desc,
                'asset_depreciation', true, auth.uid())
        returning id into v_journal_id;

      insert into journal_items (journal_id, coa_id, debit, credit, description)
        values (v_journal_id, v_category.depreciation_expense_account_id,
                v_row.amount, 0, 'Penyusutan ' || v_row.asset_code);
      insert into journal_items (journal_id, coa_id, debit, credit, description)
        values (v_journal_id, v_category.accumulated_depreciation_account_id,
                0, v_row.amount, 'Akum penyusutan ' || v_row.asset_code);

      update depreciation_schedules
        set status = 'posted', journal_id = v_journal_id,
            posted_at = now(), posted_by = auth.uid()
        where id = v_row.id;

      if v_row.sequence_no = (select useful_life_months from assets where id = v_row.asset_id) then
        update assets set status = 'fully_depreciated'
          where id = v_row.asset_id and status = 'active';
      end if;

      v_posted := v_posted + 1;
    exception when others then
      v_errors := v_errors || jsonb_build_object(
        'asset_id', v_row.asset_id, 'period', v_row.period, 'error', sqlerrm);
      v_skipped := v_skipped + 1;
    end;
  end loop;

  return jsonb_build_object('posted', v_posted, 'skipped', v_skipped, 'errors', v_errors);
end $$;

-- 11. execute_asset_disposal (already security definer in 014; add period check + restrict to admin)
create or replace function execute_asset_disposal(
  p_asset_id uuid,
  p_disposal_date date,
  p_disposal_type text,
  p_sale_price numeric,
  p_payment_account_id uuid,
  p_notes text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset record;
  v_category record;
  v_journal_id uuid;
  v_journal_number text;
  v_accumulated numeric(18,2);
  v_book_value numeric(18,2);
  v_gain_loss numeric(18,2);
  v_cutoff text := to_char(p_disposal_date, 'YYYY-MM');
  v_prev_period text := to_char(p_disposal_date - interval '1 month', 'YYYY-MM');
begin
  if not is_admin() then
    raise exception 'permission denied: hanya admin yang bisa disposal aset';
  end if;

  if p_disposal_type not in ('sale', 'writeoff') then
    raise exception 'invalid disposal_type';
  end if;

  perform _ensure_period_open(p_disposal_date);

  select * into v_asset from assets where id = p_asset_id for update;
  if v_asset is null then raise exception 'asset not found'; end if;
  if v_asset.status = 'disposed' then raise exception 'asset already disposed'; end if;

  select * into v_category from asset_categories where id = v_asset.category_id;

  perform post_depreciation_batch(
    '1900-01', v_prev_period, p_disposal_date,
    'Penyusutan {asset} – {period} (catch-up disposal)'
  );

  select coalesce(sum(amount), 0) into v_accumulated
    from depreciation_schedules
    where asset_id = p_asset_id and status = 'posted';
  v_book_value := v_asset.acquisition_cost - v_accumulated;
  v_gain_loss := coalesce(p_sale_price, 0) - v_book_value;

  v_journal_number := generate_number('JRN');

  insert into journals (journal_number, date, description, source, is_posted, created_by)
    values (v_journal_number, p_disposal_date,
            case p_disposal_type
              when 'sale' then 'Penjualan aset ' || v_asset.code
              else 'Penghapusan aset ' || v_asset.code end,
            'asset_disposal', true, auth.uid())
    returning id into v_journal_id;

  if p_disposal_type = 'sale' then
    insert into journal_items (journal_id, coa_id, debit, credit, description)
      values (v_journal_id, p_payment_account_id, p_sale_price, 0,
              'Penerimaan penjualan ' || v_asset.code);
    if v_accumulated > 0 then
      insert into journal_items (journal_id, coa_id, debit, credit, description)
        values (v_journal_id, v_category.accumulated_depreciation_account_id, v_accumulated, 0,
                'Eliminasi akum penyusutan');
    end if;
    insert into journal_items (journal_id, coa_id, debit, credit, description)
      values (v_journal_id, v_category.asset_account_id, 0, v_asset.acquisition_cost,
              'Eliminasi aset');
    if v_gain_loss > 0 then
      insert into journal_items (journal_id, coa_id, debit, credit, description)
        values (v_journal_id, (select id from coa where code = '4-19100'),
                0, v_gain_loss, 'Keuntungan penjualan aset');
    elsif v_gain_loss < 0 then
      insert into journal_items (journal_id, coa_id, debit, credit, description)
        values (v_journal_id, (select id from coa where code = '5-99100'),
                -v_gain_loss, 0, 'Kerugian penjualan aset');
    end if;
  else
    if v_accumulated > 0 then
      insert into journal_items (journal_id, coa_id, debit, credit, description)
        values (v_journal_id, v_category.accumulated_depreciation_account_id, v_accumulated, 0,
                'Eliminasi akum penyusutan');
    end if;
    if v_book_value > 0 then
      insert into journal_items (journal_id, coa_id, debit, credit, description)
        values (v_journal_id, (select id from coa where code = '5-99100'),
                v_book_value, 0, 'Kerugian penghapusan aset');
    end if;
    insert into journal_items (journal_id, coa_id, debit, credit, description)
      values (v_journal_id, v_category.asset_account_id, 0, v_asset.acquisition_cost,
              'Eliminasi aset');
    v_gain_loss := -v_book_value;
  end if;

  insert into asset_disposals (asset_id, disposal_date, disposal_type,
    sale_price, payment_account_id, book_value_at_disposal,
    accumulated_at_disposal, gain_loss, journal_id, notes, created_by)
  values (p_asset_id, p_disposal_date, p_disposal_type,
    p_sale_price, p_payment_account_id, v_book_value,
    v_accumulated, v_gain_loss, v_journal_id, p_notes, auth.uid());

  update depreciation_schedules
    set status = 'cancelled'
    where asset_id = p_asset_id and status = 'pending'
      and period >= v_cutoff;

  update assets
    set status = 'disposed',
        disposed_at = p_disposal_date,
        disposal_type = p_disposal_type,
        disposal_journal_id = v_journal_id,
        updated_at = now(),
        updated_by = auth.uid()
    where id = p_asset_id;

  return v_journal_id;
end $$;
