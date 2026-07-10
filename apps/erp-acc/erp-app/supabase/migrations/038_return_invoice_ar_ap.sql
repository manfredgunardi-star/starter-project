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
