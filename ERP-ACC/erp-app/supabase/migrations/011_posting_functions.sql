-- ============================================================
-- Migration 011: Posting Functions (Auto-journal & Inventory)
-- Core business logic — all document posting operations
-- ============================================================

-- ============================================================
-- INVENTORY: Update stock and avg_cost (average costing method)
-- ============================================================

-- Stock IN (purchase/goods receipt): update avg_cost via weighted average
create or replace function inventory_stock_in(
  p_product_id uuid,
  p_quantity_base numeric,
  p_unit_cost numeric,
  p_unit_id uuid,
  p_quantity_original numeric,
  p_reference_type text,
  p_reference_id uuid,
  p_date date
)
returns void as $$
declare
  v_current_qty numeric;
  v_current_avg numeric;
  v_new_avg numeric;
begin
  -- Get or create stock record
  insert into inventory_stock (product_id, quantity_on_hand, avg_cost, last_updated)
    values (p_product_id, 0, 0, now())
    on conflict (product_id) do nothing;

  select quantity_on_hand, avg_cost into v_current_qty, v_current_avg
    from inventory_stock where product_id = p_product_id for update;

  -- Calculate new average cost (weighted average)
  if v_current_qty + p_quantity_base > 0 then
    v_new_avg := (v_current_qty * v_current_avg + p_quantity_base * p_unit_cost)
                 / (v_current_qty + p_quantity_base);
  else
    v_new_avg := p_unit_cost;
  end if;

  -- Update stock
  update inventory_stock
    set quantity_on_hand = quantity_on_hand + p_quantity_base,
        avg_cost = v_new_avg,
        last_updated = now()
    where product_id = p_product_id;

  -- Record movement
  insert into inventory_movements (date, product_id, type, quantity_base, unit_id, quantity_original, unit_cost, reference_type, reference_id)
    values (p_date, p_product_id, 'in', p_quantity_base, p_unit_id, p_quantity_original, p_unit_cost, p_reference_type, p_reference_id);
end;
$$ language plpgsql;

-- Stock OUT (sales/goods delivery): use avg_cost as HPP
create or replace function inventory_stock_out(
  p_product_id uuid,
  p_quantity_base numeric,
  p_unit_id uuid,
  p_quantity_original numeric,
  p_reference_type text,
  p_reference_id uuid,
  p_date date
)
returns numeric as $$  -- returns avg_cost used (for HPP journal)
declare
  v_avg_cost numeric;
begin
  select avg_cost into v_avg_cost
    from inventory_stock where product_id = p_product_id for update;

  if v_avg_cost is null then
    raise exception 'No stock record for product %', p_product_id;
  end if;

  update inventory_stock
    set quantity_on_hand = quantity_on_hand - p_quantity_base,
        last_updated = now()
    where product_id = p_product_id;

  insert into inventory_movements (date, product_id, type, quantity_base, unit_id, quantity_original, unit_cost, reference_type, reference_id)
    values (p_date, p_product_id, 'out', p_quantity_base, p_unit_id, p_quantity_original, v_avg_cost, p_reference_type, p_reference_id);

  return v_avg_cost;
end;
$$ language plpgsql;

-- ============================================================
-- POST GOODS RECEIPT (Penerimaan Barang dari Supplier)
-- Journal: Persediaan (D) / Hutang Barang Diterima (K)
-- ============================================================

create or replace function post_goods_receipt(p_gr_id uuid)
returns uuid as $$  -- returns journal_id
declare
  v_gr record;
  v_item record;
  v_journal_id uuid;
  v_coa_persediaan uuid;
  v_coa_hutang_barang uuid;
  v_total numeric := 0;
begin
  select * into v_gr from goods_receipts where id = p_gr_id;
  if v_gr.status != 'draft' then
    raise exception 'Goods receipt already posted';
  end if;

  -- Get COA accounts (codes defined in seed data)
  select id into v_coa_persediaan from coa where code = '1-14000'; -- Persediaan Barang
  select id into v_coa_hutang_barang from coa where code = '2-11100'; -- Hutang Barang Diterima

  -- Process items: stock in + accumulate total
  for v_item in select * from goods_receipt_items where goods_receipt_id = p_gr_id
  loop
    perform inventory_stock_in(
      v_item.product_id, v_item.quantity_base, v_item.unit_price,
      v_item.unit_id, v_item.quantity, 'goods_receipt', p_gr_id, v_gr.date
    );
    v_total := v_total + (v_item.quantity_base * v_item.unit_price);
  end loop;

  -- Create auto journal
  v_journal_id := gen_random_uuid();
  insert into journals (id, journal_number, date, description, source, reference_type, reference_id, supplier_id, is_posted, created_by)
    values (v_journal_id, generate_number('JRN'), v_gr.date,
      'Penerimaan Barang ' || v_gr.gr_number, 'auto', 'goods_receipt', p_gr_id,
      v_gr.supplier_id, true, v_gr.created_by);

  insert into journal_items (journal_id, coa_id, debit, description)
    values (v_journal_id, v_coa_persediaan, v_total, 'Persediaan masuk - ' || v_gr.gr_number);
  insert into journal_items (journal_id, coa_id, credit, description)
    values (v_journal_id, v_coa_hutang_barang, v_total, 'Hutang barang diterima - ' || v_gr.gr_number);

  -- Update status
  update goods_receipts set status = 'posted' where id = p_gr_id;

  return v_journal_id;
end;
$$ language plpgsql;

-- ============================================================
-- POST GOODS DELIVERY (Pengiriman Barang ke Customer — HPP)
-- Journal: HPP (D) / Persediaan (K)
-- ============================================================

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
  select * into v_gd from goods_deliveries where id = p_gd_id;
  if v_gd.status != 'draft' then
    raise exception 'Goods delivery already posted';
  end if;

  select id into v_coa_hpp from coa where code = '5-11000'; -- HPP
  select id into v_coa_persediaan from coa where code = '1-14000'; -- Persediaan

  for v_item in select * from goods_delivery_items where goods_delivery_id = p_gd_id
  loop
    v_avg_cost := inventory_stock_out(
      v_item.product_id, v_item.quantity_base,
      v_item.unit_id, v_item.quantity, 'goods_delivery', p_gd_id, v_gd.date
    );
    v_total_hpp := v_total_hpp + (v_item.quantity_base * v_avg_cost);
  end loop;

  -- Create HPP journal
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
$$ language plpgsql;

-- ============================================================
-- POST SALES INVOICE
-- Journal: Piutang (D) / Pendapatan (K) + PPN Keluaran (K)
-- Also auto-handles HPP if no prior goods_delivery
-- ============================================================

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
  select * into v_inv from invoices where id = p_invoice_id;
  if v_inv.status != 'draft' then
    raise exception 'Invoice already posted';
  end if;
  if v_inv.type != 'sales' then
    raise exception 'Not a sales invoice';
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

  -- Debit: Piutang = total invoice
  insert into journal_items (journal_id, coa_id, debit, description)
    values (v_journal_id, v_coa_piutang, v_inv.total, 'Piutang - ' || v_inv.invoice_number);

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

  -- Update invoice status & SO status
  update invoices set status = 'posted' where id = p_invoice_id;
  if v_inv.sales_order_id is not null then
    update sales_orders set status = 'invoiced' where id = v_inv.sales_order_id;
  end if;

  return v_journal_id;
end;
$$ language plpgsql;

-- ============================================================
-- POST PURCHASE INVOICE
-- Jika ada GR: clear accrual (Hutang Barang Diterima D / Hutang Usaha K)
-- Jika tidak ada GR: Persediaan (D) + PPN Masukan (D) / Hutang Usaha (K)
-- ============================================================

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
  select * into v_inv from invoices where id = p_invoice_id;
  if v_inv.status != 'draft' then
    raise exception 'Invoice already posted';
  end if;
  if v_inv.type != 'purchase' then
    raise exception 'Not a purchase invoice';
  end if;

  select id into v_coa_persediaan from coa where code = '1-14000';
  select id into v_coa_ppn_in from coa where code = '1-15000'; -- PPN Masukan
  select id into v_coa_hutang from coa where code = '2-11000'; -- Hutang Usaha
  select id into v_coa_hutang_barang from coa where code = '2-11100'; -- Hutang Barang Diterima
  select id into v_coa_selisih from coa where code = '5-19000'; -- Selisih Harga

  v_journal_id := gen_random_uuid();
  insert into journals (id, journal_number, date, description, source, reference_type, reference_id, supplier_id, is_posted, created_by)
    values (v_journal_id, generate_number('JRN'), v_inv.date,
      'Pembelian ' || v_inv.invoice_number, 'auto', 'purchase_invoice', p_invoice_id,
      v_inv.supplier_id, true, v_inv.created_by);

  -- Check if goods already received
  select exists(
    select 1 from goods_receipts
      where purchase_order_id = v_inv.purchase_order_id
        and status = 'posted'
  ) into v_has_gr;

  if v_has_gr then
    -- Goods sudah diterima via GR: clear accrual (Hutang Barang Diterima → Hutang Usaha)
    select coalesce(sum(gri.quantity_base * gri.unit_price), 0) into v_gr_total
      from goods_receipt_items gri
      join goods_receipts gr on gri.goods_receipt_id = gr.id
      where gr.purchase_order_id = v_inv.purchase_order_id and gr.status = 'posted';

    -- Debit: Hutang Barang Diterima (clear accrual)
    insert into journal_items (journal_id, coa_id, debit, description)
      values (v_journal_id, v_coa_hutang_barang, v_gr_total, 'Clear accrual - ' || v_inv.invoice_number);

    -- Credit: Hutang Usaha = invoice total
    insert into journal_items (journal_id, coa_id, credit, description)
      values (v_journal_id, v_coa_hutang, v_inv.total, 'Hutang usaha - ' || v_inv.invoice_number);

    -- Debit: PPN Masukan (jika ada)
    if v_inv.tax_amount > 0 then
      insert into journal_items (journal_id, coa_id, debit, description)
        values (v_journal_id, v_coa_ppn_in, v_inv.tax_amount, 'PPN Masukan - ' || v_inv.invoice_number);
    end if;

    -- Handle selisih harga antara GR dan Invoice
    v_selisih := v_inv.subtotal - v_gr_total;
    if v_selisih > 0 then
      insert into journal_items (journal_id, coa_id, debit, description)
        values (v_journal_id, v_coa_selisih, v_selisih, 'Selisih harga - ' || v_inv.invoice_number);
    elsif v_selisih < 0 then
      insert into journal_items (journal_id, coa_id, credit, description)
        values (v_journal_id, v_coa_selisih, abs(v_selisih), 'Selisih harga - ' || v_inv.invoice_number);
    end if;

  else
    -- Tidak ada GR: stock in sekarang saat invoice
    for v_item in select * from invoice_items where invoice_id = p_invoice_id
    loop
      perform inventory_stock_in(
        v_item.product_id, v_item.quantity_base, v_item.unit_price,
        v_item.unit_id, v_item.quantity, 'purchase_invoice', p_invoice_id, v_inv.date
      );
    end loop;

    -- Debit: Persediaan = subtotal
    insert into journal_items (journal_id, coa_id, debit, description)
      values (v_journal_id, v_coa_persediaan, v_inv.subtotal, 'Persediaan masuk - ' || v_inv.invoice_number);

    -- Debit: PPN Masukan (jika ada)
    if v_inv.tax_amount > 0 then
      insert into journal_items (journal_id, coa_id, debit, description)
        values (v_journal_id, v_coa_ppn_in, v_inv.tax_amount, 'PPN Masukan - ' || v_inv.invoice_number);
    end if;

    -- Credit: Hutang Usaha = total invoice
    insert into journal_items (journal_id, coa_id, credit, description)
      values (v_journal_id, v_coa_hutang, v_inv.total, 'Hutang usaha - ' || v_inv.invoice_number);
  end if;

  update invoices set status = 'posted' where id = p_invoice_id;
  if v_inv.purchase_order_id is not null then
    update purchase_orders set status = 'done' where id = v_inv.purchase_order_id;
  end if;

  return v_journal_id;
end;
$$ language plpgsql;

-- ============================================================
-- POST PAYMENT
-- Incoming (dari customer): Kas/Bank (D) / Piutang (K)
-- Outgoing (ke supplier): Hutang (D) / Kas/Bank (K)
-- ============================================================

create or replace function post_payment(p_payment_id uuid)
returns uuid as $$
declare
  v_pay record;
  v_journal_id uuid;
  v_coa_piutang uuid;
  v_coa_hutang uuid;
begin
  select p.*, a.coa_id as account_coa_id
    into v_pay
    from payments p
    join accounts a on p.account_id = a.id
    where p.id = p_payment_id;

  select id into v_coa_piutang from coa where code = '1-13000';
  select id into v_coa_hutang from coa where code = '2-11000';

  v_journal_id := gen_random_uuid();
  insert into journals (id, journal_number, date, description, source, reference_type, reference_id,
    customer_id, supplier_id, is_posted, created_by)
    values (v_journal_id, generate_number('JRN'), v_pay.date,
      'Pembayaran ' || v_pay.payment_number, 'auto', 'payment', p_payment_id,
      v_pay.customer_id, v_pay.supplier_id, true, v_pay.created_by);

  if v_pay.type = 'incoming' then
    -- Terima dari customer
    insert into journal_items (journal_id, coa_id, debit, description)
      values (v_journal_id, v_pay.account_coa_id, v_pay.amount, 'Terima pembayaran - ' || v_pay.payment_number);
    insert into journal_items (journal_id, coa_id, credit, description)
      values (v_journal_id, v_coa_piutang, v_pay.amount, 'Pelunasan piutang - ' || v_pay.payment_number);
    update accounts set balance = balance + v_pay.amount where id = v_pay.account_id;

  elsif v_pay.type = 'outgoing' then
    -- Bayar ke supplier
    insert into journal_items (journal_id, coa_id, debit, description)
      values (v_journal_id, v_coa_hutang, v_pay.amount, 'Pelunasan hutang - ' || v_pay.payment_number);
    insert into journal_items (journal_id, coa_id, credit, description)
      values (v_journal_id, v_pay.account_coa_id, v_pay.amount, 'Bayar supplier - ' || v_pay.payment_number);
    update accounts set balance = balance - v_pay.amount where id = v_pay.account_id;
  end if;

  -- Update invoice amount_paid dan status
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
$$ language plpgsql;

-- ============================================================
-- POST TRANSFER KAS/BANK
-- Journal: Kas/Bank Tujuan (D) / Kas/Bank Asal (K)
-- ============================================================

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
$$ language plpgsql;

-- ============================================================
-- POST EXPENSE (Pengeluaran Operasional)
-- Journal: Beban (D) / Kas/Bank (K)
-- ============================================================

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
$$ language plpgsql;

-- ============================================================
-- POST MANUAL JOURNAL (admin only — validates debit = credit)
-- ============================================================

create or replace function post_manual_journal(p_journal_id uuid)
returns void as $$
begin
  if not validate_journal_balance(p_journal_id) then
    raise exception 'Journal is not balanced (total debit != total credit)';
  end if;

  update journals set is_posted = true where id = p_journal_id and source = 'manual';
end;
$$ language plpgsql;
