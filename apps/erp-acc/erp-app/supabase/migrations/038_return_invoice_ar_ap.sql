-- ============================================================
-- Migration 038: Invoice AR/AP deletion via return documents
-- ============================================================

-- 1) Link returns to a specific invoice (nullable — old SO/PO-only
--    returns keep working unchanged).
alter table sales_returns
  add column invoice_id uuid references invoices(id),
  add column return_credit_amount numeric not null default 0,
  add column excess_credit_amount numeric not null default 0;

alter table purchase_returns
  add column invoice_id uuid references invoices(id),
  add column return_credit_amount numeric not null default 0,
  add column excess_credit_amount numeric not null default 0;

alter table sales_return_items
  add column invoice_item_id uuid references invoice_items(id);

alter table purchase_return_items
  add column invoice_item_id uuid references invoice_items(id),
  add column tax_amount numeric not null default 0;

create index idx_sales_returns_invoice on sales_returns(invoice_id);
create index idx_purchase_returns_invoice on purchase_returns(invoice_id);
create index idx_sales_return_items_invoice_item on sales_return_items(invoice_item_id);
create index idx_purchase_return_items_invoice_item on purchase_return_items(invoice_item_id);

-- 2) Invoice-side tracking columns (mirrors advance_deduction_amount pattern).
alter table invoices
  add column credit_applied_amount numeric not null default 0
    check (credit_applied_amount >= 0),
  add column return_credit_amount numeric not null default 0
    check (return_credit_amount >= 0);

-- 3) Returnable-qty helpers: invoice_items.quantity_base minus qty already
--    consumed by posted returns for that same line.
create or replace function sales_returnable_qty(p_invoice_item_id uuid)
returns numeric
language sql stable security definer set search_path = public
as $$
  select ii.quantity_base
       - coalesce((
           select sum(sri.quantity_base)
             from sales_return_items sri
             join sales_returns sr on sr.id = sri.sales_return_id
            where sri.invoice_item_id = p_invoice_item_id
              and sr.status = 'posted'
         ), 0)
    from invoice_items ii
   where ii.id = p_invoice_item_id;
$$;

create or replace function purchase_returnable_qty(p_invoice_item_id uuid)
returns numeric
language sql stable security definer set search_path = public
as $$
  select ii.quantity_base
       - coalesce((
           select sum(pri.quantity_base)
             from purchase_return_items pri
             join purchase_returns pr on pr.id = pri.purchase_return_id
            where pri.invoice_item_id = p_invoice_item_id
              and pr.status = 'posted'
         ), 0)
    from invoice_items ii
   where ii.id = p_invoice_item_id;
$$;

-- 4) One-round-trip helpers for the form's item picker.
create or replace function get_returnable_sales_invoice_items(p_invoice_id uuid)
returns table (
  invoice_item_id uuid, product_id uuid, product_name text, unit_id uuid, unit_name text,
  quantity_base numeric, unit_price numeric, returnable numeric
)
language sql stable security definer set search_path = public
as $$
  select ii.id, ii.product_id, p.name, ii.unit_id, u.name,
         ii.quantity_base, ii.unit_price, sales_returnable_qty(ii.id)
    from invoice_items ii
    join invoices i on i.id = ii.invoice_id and i.type = 'sales'
    join products p on p.id = ii.product_id
    join units u on u.id = ii.unit_id
   where ii.invoice_id = p_invoice_id;
$$;

create or replace function get_returnable_purchase_invoice_items(p_invoice_id uuid)
returns table (
  invoice_item_id uuid, product_id uuid, product_name text, unit_id uuid, unit_name text,
  quantity_base numeric, unit_price numeric, returnable numeric
)
language sql stable security definer set search_path = public
as $$
  select ii.id, ii.product_id, p.name, ii.unit_id, u.name,
         ii.quantity_base, ii.unit_price, purchase_returnable_qty(ii.id)
    from invoice_items ii
    join invoices i on i.id = ii.invoice_id and i.type = 'purchase'
    join products p on p.id = ii.product_id
    join units u on u.id = ii.unit_id
   where ii.invoice_id = p_invoice_id;
$$;

-- 5) Credit balance ledger (subsidiary tracking only — does not itself
--    post journal entries; the originating return's journal already
--    reduced Piutang/Hutang for the excess. This table exists so the
--    UI can show "Saldo Kredit Tersedia" and prevent the same credit
--    being consumed twice).
create table credit_notes (
  id uuid primary key default gen_random_uuid(),
  party_type text not null check (party_type in ('customer', 'supplier')),
  party_id uuid not null,
  source_type text not null check (source_type in ('sales_return', 'purchase_return')),
  source_id uuid not null,
  amount numeric not null check (amount > 0),
  remaining numeric not null check (remaining >= 0),
  status text not null default 'open' check (status in ('open', 'applied', 'cancelled')),
  created_at timestamptz not null default now()
);
create index idx_credit_notes_party on credit_notes(party_type, party_id, status);

create table credit_note_applications (
  id uuid primary key default gen_random_uuid(),
  credit_note_id uuid not null references credit_notes(id),
  invoice_id uuid not null references invoices(id),
  amount numeric not null check (amount > 0),
  applied_at timestamptz not null default now(),
  applied_by uuid references auth.users(id)
);
create index idx_credit_note_applications_invoice on credit_note_applications(invoice_id);
create index idx_credit_note_applications_note on credit_note_applications(credit_note_id);

alter table credit_notes enable row level security;
create policy "credit_notes_select" on credit_notes
  for select to authenticated using (true);
create policy "credit_notes_insert" on credit_notes
  for insert to authenticated with check (is_admin_or_staff());
create policy "credit_notes_update" on credit_notes
  for update to authenticated using (is_admin_or_staff()) with check (is_admin_or_staff());

alter table credit_note_applications enable row level security;
create policy "credit_note_applications_select" on credit_note_applications
  for select to authenticated using (true);
create policy "credit_note_applications_insert" on credit_note_applications
  for insert to authenticated with check (is_admin_or_staff());

-- 6) New COA account for the sales-side contra-revenue entry. The purchase
--    side reuses the existing "Selisih Harga" account (5-19000) exactly
--    like post_purchase_invoice already does for GR/invoice price
--    variance — no new purchase-side account needed.
insert into coa (code, name, type, normal_balance)
values ('4-13000', 'Retur Penjualan', 'revenue', 'debit')
on conflict (code) do nothing;

update coa set parent_id = (select id from coa where code = '4-00000')
 where code = '4-13000';

-- ============================================================
-- save_sales_return: accept optional invoice_id / invoice_item_id,
-- validate party match + returnable qty (soft check; hard check
-- happens again at post time under row lock).
-- ============================================================
create or replace function save_sales_return(
  p_sr jsonb,
  p_items jsonb[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_item jsonb;
  v_subtotal numeric := 0;
  v_tax_amount numeric := 0;
  v_total numeric := 0;
  v_invoice_id uuid;
  v_customer_id uuid;
  v_inv_customer_id uuid;
  v_inv_status text;
  v_returnable numeric;
begin
  if not is_admin_or_staff() then
    raise exception 'permission denied';
  end if;

  perform _ensure_period_open((p_sr->>'date')::date);

  v_invoice_id := nullif(p_sr->>'invoice_id', '')::uuid;
  v_customer_id := (p_sr->>'customer_id')::uuid;

  if v_invoice_id is not null then
    select customer_id, status into v_inv_customer_id, v_inv_status
      from invoices where id = v_invoice_id and type = 'sales';
    if v_inv_customer_id is null then
      raise exception 'invoice asal tidak ditemukan atau bukan sales invoice';
    end if;
    if v_inv_customer_id <> v_customer_id then
      raise exception 'customer retur harus sama dengan customer invoice asal';
    end if;
    if v_inv_status not in ('posted', 'partial', 'paid') then
      raise exception 'invoice asal harus berstatus posted/partial/paid, saat ini: %', v_inv_status;
    end if;
  end if;

  foreach v_item in array p_items loop
    if v_invoice_id is not null then
      if nullif(v_item->>'invoice_item_id', '') is null then
        raise exception 'setiap item retur wajib invoice_item_id jika retur link ke invoice';
      end if;
      if not exists (
        select 1 from invoice_items
         where id = (v_item->>'invoice_item_id')::uuid
           and invoice_id = v_invoice_id
      ) then
        raise exception 'baris invoice tidak ditemukan pada invoice asal';
      end if;
      select sales_returnable_qty((v_item->>'invoice_item_id')::uuid) into v_returnable;
      if coalesce((v_item->>'quantity_base')::numeric, (v_item->>'quantity')::numeric)
           > coalesce(v_returnable, 0) then
        raise exception 'qty retur melebihi sisa yang bisa diretur (%)', v_returnable;
      end if;
    end if;
    v_subtotal := v_subtotal
      + coalesce((v_item->>'unit_price')::numeric, 0)
        * coalesce((v_item->>'quantity')::numeric, 0);
    v_tax_amount := v_tax_amount + coalesce((v_item->>'tax_amount')::numeric, 0);
    v_total := v_total + coalesce((v_item->>'total')::numeric, 0);
  end loop;

  if (p_sr->>'id') is null or (p_sr->>'id') = '' then
    v_id := gen_random_uuid();

    insert into sales_returns (
      id, sr_number, date, customer_id, sales_order_id, invoice_id, warehouse_id,
      status, subtotal, tax_amount, total, notes, created_by
    ) values (
      v_id,
      generate_number('SRN'),
      (p_sr->>'date')::date,
      v_customer_id,
      nullif(p_sr->>'sales_order_id', '')::uuid,
      v_invoice_id,
      nullif(p_sr->>'warehouse_id', '')::uuid,
      coalesce(nullif(p_sr->>'status', ''), 'draft'),
      v_subtotal, v_tax_amount, v_total,
      nullif(p_sr->>'notes', ''),
      auth.uid()
    );
  else
    v_id := (p_sr->>'id')::uuid;

    update sales_returns
       set date           = (p_sr->>'date')::date,
           customer_id    = v_customer_id,
           sales_order_id = nullif(p_sr->>'sales_order_id', '')::uuid,
           invoice_id     = v_invoice_id,
           warehouse_id   = nullif(p_sr->>'warehouse_id', '')::uuid,
           notes          = nullif(p_sr->>'notes', ''),
           subtotal       = v_subtotal,
           tax_amount     = v_tax_amount,
           total          = v_total
     where id = v_id
       and status = 'draft';

    if not found then
      raise exception 'Sales return tidak ditemukan atau sudah diposting';
    end if;
  end if;

  delete from sales_return_items where sales_return_id = v_id;

  foreach v_item in array p_items loop
    insert into sales_return_items (
      sales_return_id, invoice_item_id, product_id, unit_id,
      quantity, quantity_base, unit_price, tax_amount, total
    ) values (
      v_id,
      nullif(v_item->>'invoice_item_id', '')::uuid,
      (v_item->>'product_id')::uuid,
      (v_item->>'unit_id')::uuid,
      (v_item->>'quantity')::numeric,
      (v_item->>'quantity_base')::numeric,
      coalesce((v_item->>'unit_price')::numeric, 0),
      coalesce((v_item->>'tax_amount')::numeric, 0),
      coalesce((v_item->>'total')::numeric, 0)
    );
  end loop;

  return v_id;
end;
$$;

create or replace function save_purchase_return(
  p_pr jsonb,
  p_items jsonb[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_item jsonb;
  v_subtotal numeric := 0;
  v_tax_amount numeric := 0;
  v_total numeric := 0;
  v_invoice_id uuid;
  v_supplier_id uuid;
  v_inv_supplier_id uuid;
  v_inv_status text;
  v_returnable numeric;
begin
  if not is_admin_or_staff() then
    raise exception 'permission denied';
  end if;

  perform _ensure_period_open((p_pr->>'date')::date);

  v_invoice_id := nullif(p_pr->>'invoice_id', '')::uuid;
  v_supplier_id := (p_pr->>'supplier_id')::uuid;

  if v_invoice_id is not null then
    select supplier_id, status into v_inv_supplier_id, v_inv_status
      from invoices where id = v_invoice_id and type = 'purchase';
    if v_inv_supplier_id is null then
      raise exception 'invoice asal tidak ditemukan atau bukan purchase invoice';
    end if;
    if v_inv_supplier_id <> v_supplier_id then
      raise exception 'supplier retur harus sama dengan supplier invoice asal';
    end if;
    if v_inv_status not in ('posted', 'partial', 'paid') then
      raise exception 'invoice asal harus berstatus posted/partial/paid, saat ini: %', v_inv_status;
    end if;
  end if;

  foreach v_item in array p_items loop
    if v_invoice_id is not null then
      if nullif(v_item->>'invoice_item_id', '') is null then
        raise exception 'setiap item retur wajib invoice_item_id jika retur link ke invoice';
      end if;
      if not exists (
        select 1 from invoice_items
         where id = (v_item->>'invoice_item_id')::uuid
           and invoice_id = v_invoice_id
      ) then
        raise exception 'baris invoice tidak ditemukan pada invoice asal';
      end if;
      select purchase_returnable_qty((v_item->>'invoice_item_id')::uuid) into v_returnable;
      if coalesce((v_item->>'quantity_base')::numeric, (v_item->>'quantity')::numeric)
           > coalesce(v_returnable, 0) then
        raise exception 'qty retur melebihi sisa yang bisa diretur (%)', v_returnable;
      end if;
    end if;
    v_subtotal := v_subtotal
      + coalesce((v_item->>'unit_price')::numeric, 0)
        * coalesce((v_item->>'quantity')::numeric, 0);
    v_tax_amount := v_tax_amount + coalesce((v_item->>'tax_amount')::numeric, 0);
    v_total := v_total + coalesce((v_item->>'total')::numeric, 0);
  end loop;

  if (p_pr->>'id') is null or (p_pr->>'id') = '' then
    v_id := gen_random_uuid();

    insert into purchase_returns (
      id, pr_number, date, supplier_id, purchase_order_id, invoice_id, warehouse_id,
      status, subtotal, tax_amount, total, notes, created_by
    ) values (
      v_id,
      generate_number('PRN'),
      (p_pr->>'date')::date,
      v_supplier_id,
      nullif(p_pr->>'purchase_order_id', '')::uuid,
      v_invoice_id,
      nullif(p_pr->>'warehouse_id', '')::uuid,
      coalesce(nullif(p_pr->>'status', ''), 'draft'),
      v_subtotal, v_tax_amount, v_total,
      nullif(p_pr->>'notes', ''),
      auth.uid()
    );
  else
    v_id := (p_pr->>'id')::uuid;

    update purchase_returns
       set date              = (p_pr->>'date')::date,
           supplier_id       = v_supplier_id,
           purchase_order_id = nullif(p_pr->>'purchase_order_id', '')::uuid,
           invoice_id        = v_invoice_id,
           warehouse_id      = nullif(p_pr->>'warehouse_id', '')::uuid,
           notes             = nullif(p_pr->>'notes', ''),
           subtotal          = v_subtotal,
           tax_amount        = v_tax_amount,
           total             = v_total
     where id = v_id
       and status = 'draft';

    if not found then
      raise exception 'Purchase return tidak ditemukan atau sudah diposting';
    end if;
  end if;

  delete from purchase_return_items where purchase_return_id = v_id;

  foreach v_item in array p_items loop
    insert into purchase_return_items (
      purchase_return_id, invoice_item_id, product_id, unit_id,
      quantity, quantity_base, unit_price, tax_amount, total
    ) values (
      v_id,
      nullif(v_item->>'invoice_item_id', '')::uuid,
      (v_item->>'product_id')::uuid,
      (v_item->>'unit_id')::uuid,
      (v_item->>'quantity')::numeric,
      (v_item->>'quantity_base')::numeric,
      coalesce((v_item->>'unit_price')::numeric, 0),
      coalesce((v_item->>'tax_amount')::numeric, 0),
      coalesce((v_item->>'total')::numeric, 0)
    );
  end loop;

  return v_id;
end;
$$;

-- ============================================================
-- post_sales_return: preserves the existing Persediaan/HPP reversal
-- block verbatim, adds AR-reduction block after it (only when this
-- return is linked to an invoice).
-- ============================================================
create or replace function post_sales_return(p_sr_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sr record;
  v_item record;
  v_avg_cost numeric;
  v_journal_id uuid;
  v_total_cost numeric := 0;
  v_coa_persediaan uuid;
  v_coa_hpp uuid;
  v_coa_piutang uuid;
  v_coa_retur_penjualan uuid;
  v_coa_ppn_out uuid;
  v_inv record;
  v_outstanding numeric;
  v_return_credit numeric;
  v_excess numeric;
  v_returnable numeric;
begin
  perform _ensure_can_post();

  select * into v_sr from sales_returns where id = p_sr_id for update;

  if v_sr is null then
    raise exception 'Sales return tidak ditemukan';
  end if;

  if v_sr.status <> 'draft' then
    raise exception 'Sales return sudah diposting';
  end if;

  perform _ensure_period_open(v_sr.date);

  select id into v_coa_persediaan from coa where code = '1-14000';
  select id into v_coa_hpp from coa where code = '5-11000';

  if v_coa_persediaan is null or v_coa_hpp is null then
    raise exception 'COA retur penjualan tidak lengkap';
  end if;

  -- Lock the linked invoice up front (before the qty re-validation loop and
  -- before the inventory-reversal loop) so that any two returns posted
  -- concurrently against the same invoice — whether or not they target the
  -- same line — fully serialize on this row lock. Locking it later (e.g.
  -- only inside the AR block) would let two concurrent posts both pass the
  -- qty check before either commits, over-consuming the returnable qty.
  if v_sr.invoice_id is not null then
    select * into v_inv from invoices where id = v_sr.invoice_id for update;
  end if;

  -- Re-validate qty under row lock (race-safe: two concurrent returns on
  -- the same invoice line cannot both slip through the save-time soft check).
  -- Ownership check first: confirm invoice_item_id actually belongs to this
  -- return's invoice_id before trusting it (defends against a tampered /
  -- foreign invoice_item_id submitted directly to the RPC).
  if v_sr.invoice_id is not null then
    for v_item in select * from sales_return_items where sales_return_id = p_sr_id loop
      if not exists (
        select 1 from invoice_items
         where id = v_item.invoice_item_id
           and invoice_id = v_sr.invoice_id
      ) then
        raise exception 'baris invoice tidak ditemukan pada invoice asal';
      end if;
      select sales_returnable_qty(v_item.invoice_item_id) into v_returnable;
      if v_item.quantity_base > coalesce(v_returnable, 0) then
        raise exception 'qty retur item % melebihi sisa yang bisa diretur (%)',
          v_item.product_id, v_returnable;
      end if;
    end loop;
  end if;

  -- Inventory reversal (unchanged from the original implementation).
  for v_item in
    select * from sales_return_items where sales_return_id = p_sr_id
  loop
    v_avg_cost := coalesce(
      (select avg_cost from inventory_stock where product_id = v_item.product_id),
      0
    );

    perform inventory_stock_in(
      v_item.product_id, v_item.quantity_base, v_avg_cost,
      v_item.unit_id, v_item.quantity,
      'sales_return', p_sr_id, v_sr.date
    );

    v_total_cost := v_total_cost + (v_item.quantity_base * v_avg_cost);
  end loop;

  if v_total_cost > 0 then
    v_journal_id := gen_random_uuid();

    insert into journals (
      id, journal_number, date, description, source,
      reference_type, reference_id, customer_id, is_posted, created_by
    ) values (
      v_journal_id, generate_number('JRN'), v_sr.date,
      'Retur Penjualan ' || v_sr.sr_number, 'auto',
      'sales_return', p_sr_id, v_sr.customer_id, true, v_sr.created_by
    );

    insert into journal_items (journal_id, coa_id, debit, description)
      values (
        v_journal_id, v_coa_persediaan, v_total_cost,
        'Persediaan masuk retur - ' || v_sr.sr_number
      );

    insert into journal_items (journal_id, coa_id, credit, description)
      values (
        v_journal_id, v_coa_hpp, v_total_cost,
        'Reversal HPP retur - ' || v_sr.sr_number
      );
  end if;

  -- AR reduction (only when this return is linked to an invoice).
  if v_sr.invoice_id is not null then
    select id into v_coa_piutang from coa where code = '1-13000';
    select id into v_coa_retur_penjualan from coa where code = '4-13000';
    select id into v_coa_ppn_out from coa where code = '2-12000';

    if v_coa_piutang is null or v_coa_retur_penjualan is null then
      raise exception 'COA piutang/retur penjualan tidak lengkap';
    end if;

    -- v_inv was already locked ("for update") earlier, right after the v_sr
    -- lock and before the qty re-validation loop — the row lock has been
    -- held continuously since then, so its columns are still current here;
    -- no need to re-select.

    v_outstanding := v_inv.total - v_inv.amount_paid - v_inv.advance_deduction_amount
                      - v_inv.credit_applied_amount - v_inv.return_credit_amount;
    v_return_credit := least(v_sr.total, greatest(v_outstanding, 0));
    v_excess := v_sr.total - v_return_credit;

    if abs(v_sr.total - (v_sr.subtotal + v_sr.tax_amount)) > 0.01 then
      raise exception 'retur tidak konsisten: total (%) tidak sama dengan subtotal + pajak (%)',
        v_sr.total, v_sr.subtotal + v_sr.tax_amount;
    end if;

    v_journal_id := gen_random_uuid();
    insert into journals (
      id, journal_number, date, description, source,
      reference_type, reference_id, customer_id, is_posted, created_by
    ) values (
      v_journal_id, generate_number('JRN'), v_sr.date,
      'Retur Penjualan (Piutang) ' || v_sr.sr_number, 'auto',
      'sales_return_ar', p_sr_id, v_sr.customer_id, true, v_sr.created_by
    );

    insert into journal_items (journal_id, coa_id, debit, description)
      values (v_journal_id, v_coa_retur_penjualan, v_sr.subtotal,
              'Retur Penjualan - ' || v_sr.sr_number);

    if v_sr.tax_amount > 0 then
      if v_coa_ppn_out is null then
        raise exception 'COA PPN Keluaran tidak ditemukan';
      end if;
      insert into journal_items (journal_id, coa_id, debit, description)
        values (v_journal_id, v_coa_ppn_out, v_sr.tax_amount,
                'PPN Keluaran reverse - ' || v_sr.sr_number);
    end if;

    insert into journal_items (journal_id, coa_id, credit, description)
      values (v_journal_id, v_coa_piutang, v_sr.total,
              'Piutang berkurang - ' || v_sr.sr_number);

    update sales_returns
       set return_credit_amount = v_return_credit,
           excess_credit_amount = v_excess
     where id = p_sr_id;

    update invoices
       set return_credit_amount = return_credit_amount + v_return_credit,
           status = case
             when amount_paid + advance_deduction_amount + credit_applied_amount
                    + return_credit_amount + v_return_credit >= total - 0.01
             then 'paid'
             else 'partial'
           end
     where id = v_sr.invoice_id;

    if v_excess > 0 then
      insert into credit_notes (party_type, party_id, source_type, source_id, amount, remaining, status)
        values ('customer', v_sr.customer_id, 'sales_return', p_sr_id, v_excess, v_excess, 'open');
    end if;
  end if;

  update sales_returns set status = 'posted' where id = p_sr_id;
end;
$$;

-- ============================================================
-- post_purchase_return: preserves the existing Persediaan reversal
-- block verbatim (unconditional, mirrors legacy live behavior), adds
-- AP-reduction block after it (only when this return is linked to an
-- invoice). Mirror image of post_sales_return above.
-- ============================================================
create or replace function post_purchase_return(p_pr_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pr record;
  v_item record;
  v_avg_cost numeric;
  v_journal_id uuid;
  v_total_cost numeric := 0;
  v_coa_persediaan uuid;
  v_coa_hutang_gl uuid;
  v_coa_hutang uuid;
  v_coa_ppn_in uuid;
  v_coa_selisih uuid;
  v_inv record;
  v_outstanding numeric;
  v_return_credit numeric;
  v_excess numeric;
  v_returnable numeric;
  v_selisih numeric;
begin
  perform _ensure_can_post();

  select * into v_pr from purchase_returns where id = p_pr_id for update;

  if v_pr is null then
    raise exception 'Purchase return tidak ditemukan';
  end if;

  if v_pr.status <> 'draft' then
    raise exception 'Purchase return sudah diposting';
  end if;

  perform _ensure_period_open(v_pr.date);

  select id into v_coa_persediaan from coa where code = '1-14000';
  select id into v_coa_hutang_gl from coa where code = '2-11100';

  if v_coa_persediaan is null or v_coa_hutang_gl is null then
    raise exception 'COA retur pembelian tidak lengkap';
  end if;

  -- Lock the linked invoice up front (before the qty re-validation loop and
  -- before the inventory-reversal loop) so that any two returns posted
  -- concurrently against the same invoice — whether or not they target the
  -- same line — fully serialize on this row lock. Locking it later (e.g.
  -- only inside the AP block) would let two concurrent posts both pass the
  -- qty check before either commits, over-consuming the returnable qty.
  if v_pr.invoice_id is not null then
    select * into v_inv from invoices where id = v_pr.invoice_id for update;
  end if;

  -- Re-validate qty under row lock (race-safe: two concurrent returns on
  -- the same invoice line cannot both slip through the save-time soft check).
  -- Ownership check first: confirm invoice_item_id actually belongs to this
  -- return's invoice_id before trusting it (defends against a tampered /
  -- foreign invoice_item_id submitted directly to the RPC).
  if v_pr.invoice_id is not null then
    for v_item in select * from purchase_return_items where purchase_return_id = p_pr_id loop
      if not exists (
        select 1 from invoice_items
         where id = v_item.invoice_item_id
           and invoice_id = v_pr.invoice_id
      ) then
        raise exception 'baris invoice tidak ditemukan pada invoice asal';
      end if;
      select purchase_returnable_qty(v_item.invoice_item_id) into v_returnable;
      if v_item.quantity_base > coalesce(v_returnable, 0) then
        raise exception 'qty retur item % melebihi sisa yang bisa diretur (%)',
          v_item.product_id, v_returnable;
      end if;
    end loop;
  end if;

  -- Inventory reversal (unchanged from the original implementation).
  for v_item in
    select * from purchase_return_items where purchase_return_id = p_pr_id
  loop
    v_avg_cost := public.inventory_stock_out(
      v_item.product_id, v_item.quantity_base,
      v_item.unit_id, v_item.quantity,
      'purchase_return', p_pr_id, v_pr.date
    );

    v_total_cost := v_total_cost + (v_item.quantity_base * v_avg_cost);
  end loop;

  if v_total_cost > 0 then
    v_journal_id := gen_random_uuid();

    insert into journals (
      id, journal_number, date, description, source,
      reference_type, reference_id, supplier_id, is_posted, created_by
    ) values (
      v_journal_id, generate_number('JRN'), v_pr.date,
      'Retur Pembelian ' || v_pr.pr_number, 'auto',
      'purchase_return', p_pr_id, v_pr.supplier_id, true, v_pr.created_by
    );

    insert into journal_items (journal_id, coa_id, debit, description)
      values (
        v_journal_id, v_coa_hutang_gl, v_total_cost,
        'Hutang berkurang retur - ' || v_pr.pr_number
      );

    insert into journal_items (journal_id, coa_id, credit, description)
      values (
        v_journal_id, v_coa_persediaan, v_total_cost,
        'Persediaan keluar retur - ' || v_pr.pr_number
      );
  end if;

  -- AP reduction (only when this return is linked to an invoice).
  if v_pr.invoice_id is not null then
    select id into v_coa_hutang from coa where code = '2-11000';
    select id into v_coa_ppn_in from coa where code = '1-15000';
    select id into v_coa_selisih from coa where code = '5-19000';

    if v_coa_hutang is null or v_coa_selisih is null then
      raise exception 'COA hutang/selisih harga tidak lengkap';
    end if;

    -- v_inv was already locked ("for update") earlier, right after the COA
    -- checks and before the qty re-validation loop — the row lock has been
    -- held continuously since then, so its columns are still current here;
    -- no need to re-select.

    v_outstanding := v_inv.total - v_inv.amount_paid - v_inv.credit_applied_amount
                      - v_inv.return_credit_amount;
    v_return_credit := least(v_pr.total, greatest(v_outstanding, 0));
    v_excess := v_pr.total - v_return_credit;

    -- Guard against an unbalanced journal if purchase_returns.total doesn't
    -- equal subtotal + tax_amount (save_purchase_return recomputes
    -- subtotal/tax_amount from items but trusts client-sent total verbatim).
    if abs(v_pr.total - (v_pr.subtotal + v_pr.tax_amount)) > 0.01 then
      raise exception 'retur tidak konsisten: total (%) tidak sama dengan subtotal + pajak (%)',
        v_pr.total, v_pr.subtotal + v_pr.tax_amount;
    end if;

    v_journal_id := gen_random_uuid();
    insert into journals (
      id, journal_number, date, description, source,
      reference_type, reference_id, supplier_id, is_posted, created_by
    ) values (
      v_journal_id, generate_number('JRN'), v_pr.date,
      'Retur Pembelian (Hutang) ' || v_pr.pr_number, 'auto',
      'purchase_return_ap', p_pr_id, v_pr.supplier_id, true, v_pr.created_by
    );

    insert into journal_items (journal_id, coa_id, debit, description)
      values (v_journal_id, v_coa_hutang, v_pr.total,
              'Hutang usaha berkurang - ' || v_pr.pr_number);

    if v_pr.tax_amount > 0 then
      if v_coa_ppn_in is null then
        raise exception 'COA PPN Masukan tidak ditemukan';
      end if;
      insert into journal_items (journal_id, coa_id, credit, description)
        values (v_journal_id, v_coa_ppn_in, v_pr.tax_amount,
                'PPN Masukan reverse - ' || v_pr.pr_number);
    end if;

    -- Deliberate SECOND credit to Persediaan, not a duplicate of the one in
    -- the unconditional inventory-reversal journal above (~line 743). That
    -- earlier journal is a self-contained Hutang-Barang-Diterima <-> Persediaan
    -- entry that runs for every return regardless of invoice link (it's how
    -- stock actually moves). This journal is a separate, additional entry
    -- that exists only to record the AP-side effect for invoice-linked
    -- returns (Debit Hutang Usaha, matched by Credit Persediaan + Credit PPN
    -- Masukan + Selisih). Two independently-balanced journals — do not merge.
    insert into journal_items (journal_id, coa_id, credit, description)
      values (v_journal_id, v_coa_persediaan, v_total_cost,
              'Persediaan keluar (invoice-linked) - ' || v_pr.pr_number);

    -- Selisih antara harga invoice (subtotal) vs avg-cost inventory-out.
    -- A variance is expected: avg_cost is a moving average that drifts from
    -- the original invoiced unit price by the time the return is posted, so
    -- subtotal (invoice price) and v_total_cost (current avg-cost-based
    -- inventory value) don't line up.
    -- NOTE: this is the OPPOSITE debit/credit convention from the
    -- superficially-similar variance line in post_purchase_invoice
    -- (migration 016). There, Hutang-Barang-Diterima is debited and Hutang
    -- Usaha is credited, so a positive (subtotal > gr_total) variance is
    -- booked as a DEBIT to close the gap. Here the entry is a reversal:
    -- Hutang Usaha is debited (v_pr.total) and Persediaan is credited
    -- (v_total_cost), i.e. the two sides that carried the variance in the
    -- original entry have swapped sides. Copying the same debit-on-positive
    -- convention verbatim would double the imbalance instead of closing it
    -- (e.g. subtotal=100, tax=10, total_cost=80 => selisih=+20: debit
    -- would give debit=130/credit=90, a 40 gap). Crediting on positive
    -- variance and debiting on negative variance is what actually balances
    -- this journal (same example => debit=110/credit=110).
    v_selisih := v_pr.subtotal - v_total_cost;
    if v_selisih > 0 then
      insert into journal_items (journal_id, coa_id, credit, description)
        values (v_journal_id, v_coa_selisih, v_selisih, 'Selisih harga retur - ' || v_pr.pr_number);
    elsif v_selisih < 0 then
      insert into journal_items (journal_id, coa_id, debit, description)
        values (v_journal_id, v_coa_selisih, abs(v_selisih), 'Selisih harga retur - ' || v_pr.pr_number);
    end if;

    update purchase_returns
       set return_credit_amount = v_return_credit,
           excess_credit_amount = v_excess
     where id = p_pr_id;

    update invoices
       set return_credit_amount = return_credit_amount + v_return_credit,
           status = case
             when amount_paid + credit_applied_amount + return_credit_amount
                    + v_return_credit >= total - 0.01
             then 'paid'
             else 'partial'
           end
     where id = v_pr.invoice_id;

    if v_excess > 0 then
      insert into credit_notes (party_type, party_id, source_type, source_id, amount, remaining, status)
        values ('supplier', v_pr.supplier_id, 'purchase_return', p_pr_id, v_excess, v_excess, 'open');
    end if;
  end if;

  update purchase_returns set status = 'posted' where id = p_pr_id;
end;
$$;
