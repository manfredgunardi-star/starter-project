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
create policy "credit_notes_write" on credit_notes
  for all to authenticated using (is_admin_or_staff()) with check (is_admin_or_staff());

alter table credit_note_applications enable row level security;
create policy "credit_note_applications_select" on credit_note_applications
  for select to authenticated using (true);
create policy "credit_note_applications_write" on credit_note_applications
  for all to authenticated using (is_admin_or_staff()) with check (is_admin_or_staff());

-- 6) New COA account for the sales-side contra-revenue entry. The purchase
--    side reuses the existing "Selisih Harga" account (5-19000) exactly
--    like post_purchase_invoice already does for GR/invoice price
--    variance — no new purchase-side account needed.
insert into coa (code, name, type, normal_balance)
select '4-13000', 'Retur Penjualan', 'revenue', 'debit'
where not exists (select 1 from coa where code = '4-13000');

update coa set parent_id = (select id from coa where code = '4-00000')
 where code = '4-13000';
