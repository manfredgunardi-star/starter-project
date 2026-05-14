-- ============================================================
-- Migration 026: Master Data Tier 1
-- product_categories, payment_terms, tax_codes, warehouses
-- + backfill default records to existing data (non-breaking)
-- ============================================================

-- 1) PRODUCT CATEGORIES
create table product_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  parent_id uuid references product_categories(id),
  is_active boolean not null default true,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_product_categories_parent on product_categories(parent_id);

-- 2) PAYMENT TERMS
create table payment_terms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  net_days int not null default 0 check (net_days >= 0),
  discount_percent numeric(5,2) not null default 0 check (discount_percent >= 0 and discount_percent <= 100),
  discount_days int not null default 0 check (discount_days >= 0),
  is_active boolean not null default true,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3) TAX CODES
create table tax_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  rate numeric(5,2) not null default 0 check (rate >= 0 and rate <= 100),
  is_inclusive boolean not null default false,
  output_account_id uuid references coa(id),
  input_account_id  uuid references coa(id),
  is_active boolean not null default true,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4) WAREHOUSES
create table warehouses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  address text,
  is_default boolean not null default false,
  is_active boolean not null default true,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Hanya boleh ada 1 warehouse default
create unique index uq_warehouses_one_default on warehouses (is_default) where is_default = true;

-- 5) ALTER existing tables — tambah FK kolom (semua nullable untuk backward compat)
alter table products
  add column category_id uuid references product_categories(id),
  add column default_tax_code_id uuid references tax_codes(id);

alter table customers
  add column default_payment_term_id uuid references payment_terms(id),
  add column default_tax_code_id uuid references tax_codes(id);

alter table suppliers
  add column default_payment_term_id uuid references payment_terms(id),
  add column default_tax_code_id uuid references tax_codes(id);

alter table sales_orders
  add column payment_term_id uuid references payment_terms(id),
  add column warehouse_id uuid references warehouses(id);

alter table purchase_orders
  add column payment_term_id uuid references payment_terms(id),
  add column warehouse_id uuid references warehouses(id);

alter table goods_deliveries  add column warehouse_id uuid references warehouses(id);
alter table goods_receipts    add column warehouse_id uuid references warehouses(id);
alter table invoices          add column payment_term_id uuid references payment_terms(id);

alter table sales_order_items     add column tax_code_id uuid references tax_codes(id);
alter table purchase_order_items  add column tax_code_id uuid references tax_codes(id);
alter table invoice_items         add column tax_code_id uuid references tax_codes(id);

-- 6) SEED default records (idempotent dengan ON CONFLICT)
insert into product_categories (code, name) values ('UNCAT', 'Uncategorized')
  on conflict (code) do nothing;

insert into payment_terms (code, name, net_days) values
  ('CASH','Cash / COD',0),
  ('NET14','Net 14',14),
  ('NET30','Net 30',30),
  ('NET60','Net 60',60)
  on conflict (code) do nothing;

insert into tax_codes (code, name, rate) values
  ('PPN11','PPN 11%',11),
  ('PPN0','PPN 0%',0),
  ('NON','Non-PPN',0)
  on conflict (code) do nothing;

insert into warehouses (code, name, is_default) values ('WH-MAIN','Gudang Utama',true)
  on conflict (code) do nothing;

-- 7) BACKFILL FK ke default record
update products
  set category_id = (select id from product_categories where code='UNCAT')
  where category_id is null;

update products
  set default_tax_code_id = case
    when is_taxable then (select id from tax_codes where code='PPN11')
    else (select id from tax_codes where code='NON')
  end
  where default_tax_code_id is null;

update customers
  set default_payment_term_id = (select id from payment_terms where code='NET30')
  where default_payment_term_id is null;

update suppliers
  set default_payment_term_id = (select id from payment_terms where code='NET30')
  where default_payment_term_id is null;

update sales_orders
  set warehouse_id = (select id from warehouses where is_default = true limit 1)
  where warehouse_id is null;

update purchase_orders
  set warehouse_id = (select id from warehouses where is_default = true limit 1)
  where warehouse_id is null;

update goods_deliveries
  set warehouse_id = (select id from warehouses where is_default = true limit 1)
  where warehouse_id is null;

update goods_receipts
  set warehouse_id = (select id from warehouses where is_default = true limit 1)
  where warehouse_id is null;

-- 8) RLS POLICIES — split per-action; delete restricted to admin only
-- (mirrors migration 009 master-data convention; aligns with soft-delete rule)
alter table product_categories enable row level security;
alter table payment_terms      enable row level security;
alter table tax_codes          enable row level security;
alter table warehouses         enable row level security;

create policy "Authenticated can read active product_categories"
  on product_categories for select to authenticated using (is_active = true);
create policy "Admins and staff can insert product_categories"
  on product_categories for insert to authenticated with check (is_admin_or_staff());
create policy "Admins and staff can update product_categories"
  on product_categories for update to authenticated using (is_admin_or_staff());
create policy "Only admins can delete product_categories"
  on product_categories for delete to authenticated using (is_admin());

create policy "Authenticated can read active payment_terms"
  on payment_terms for select to authenticated using (is_active = true);
create policy "Admins and staff can insert payment_terms"
  on payment_terms for insert to authenticated with check (is_admin_or_staff());
create policy "Admins and staff can update payment_terms"
  on payment_terms for update to authenticated using (is_admin_or_staff());
create policy "Only admins can delete payment_terms"
  on payment_terms for delete to authenticated using (is_admin());

create policy "Authenticated can read active tax_codes"
  on tax_codes for select to authenticated using (is_active = true);
create policy "Admins and staff can insert tax_codes"
  on tax_codes for insert to authenticated with check (is_admin_or_staff());
create policy "Admins and staff can update tax_codes"
  on tax_codes for update to authenticated using (is_admin_or_staff());
create policy "Only admins can delete tax_codes"
  on tax_codes for delete to authenticated using (is_admin());

create policy "Authenticated can read active warehouses"
  on warehouses for select to authenticated using (is_active = true);
create policy "Admins and staff can insert warehouses"
  on warehouses for insert to authenticated with check (is_admin_or_staff());
create policy "Admins and staff can update warehouses"
  on warehouses for update to authenticated using (is_admin_or_staff());
create policy "Only admins can delete warehouses"
  on warehouses for delete to authenticated using (is_admin());

-- 9) Trigger updated_at (reuse existing function update_updated_at)
create trigger set_updated_at before update on product_categories
  for each row execute function update_updated_at();
create trigger set_updated_at before update on payment_terms
  for each row execute function update_updated_at();
create trigger set_updated_at before update on tax_codes
  for each row execute function update_updated_at();
create trigger set_updated_at before update on warehouses
  for each row execute function update_updated_at();

-- 10) Indexes untuk lookup form dropdown
create index idx_payment_terms_active on payment_terms(name) where is_active = true;
create index idx_tax_codes_active on tax_codes(code) where is_active = true;
create index idx_warehouses_active on warehouses(name) where is_active = true;
create index idx_product_categories_active on product_categories(name) where is_active = true;
