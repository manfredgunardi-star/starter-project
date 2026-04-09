-- ============================================================
-- Migration 002: Master Data Tables
-- (units, products, unit_conversions, customers, suppliers, coa)
-- ============================================================

-- Units (satuan dasar: kg, liter, pcs, dll)
create table units (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- Products (barang dagang)
create table products (
  id uuid primary key default gen_random_uuid(),
  sku text unique,
  name text not null,
  category text,
  base_unit_id uuid not null references units(id),
  buy_price numeric(15,2) not null default 0,
  sell_price numeric(15,2) not null default 0,
  is_taxable boolean not null default false,
  tax_rate numeric(5,2) not null default 11,
  is_active boolean not null default true,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Unit conversions (konversi satuan per produk, e.g. 1 karung = 50 kg)
create table unit_conversions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  from_unit_id uuid not null references units(id),
  to_unit_id uuid not null references units(id),
  conversion_factor numeric(15,4) not null check (conversion_factor > 0),
  unique (product_id, from_unit_id, to_unit_id)
);

-- Customers (pelanggan)
create table customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  phone text,
  email text,
  npwp text,
  ar_account_id uuid,  -- FK ke coa ditambahkan setelah tabel coa dibuat
  is_active boolean not null default true,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Suppliers (pemasok)
create table suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  phone text,
  email text,
  npwp text,
  ap_account_id uuid,  -- FK ke coa ditambahkan setelah tabel coa dibuat
  is_active boolean not null default true,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Chart of Accounts (COA — akun buku besar)
create table coa (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  type text not null check (type in ('asset', 'liability', 'equity', 'revenue', 'expense')),
  normal_balance text not null check (normal_balance in ('debit', 'credit')),
  parent_id uuid references coa(id),
  is_active boolean not null default true,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- Tambahkan FK ar/ap ke customers & suppliers setelah coa dibuat
alter table customers
  add constraint fk_customers_ar_account foreign key (ar_account_id) references coa(id);

alter table suppliers
  add constraint fk_suppliers_ap_account foreign key (ap_account_id) references coa(id);

-- Indexes
create index idx_products_category on products(category) where is_active = true;
create index idx_products_sku on products(sku) where is_active = true;
create index idx_coa_type on coa(type) where is_active = true;
create index idx_coa_parent on coa(parent_id);
create index idx_customers_name on customers(name) where is_active = true;
create index idx_suppliers_name on suppliers(name) where is_active = true;

-- Shared updated_at trigger function
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at before update on products
  for each row execute function update_updated_at();
create trigger set_updated_at before update on customers
  for each row execute function update_updated_at();
create trigger set_updated_at before update on suppliers
  for each row execute function update_updated_at();

-- RLS: semua tabel master data readable oleh user terotentikasi
alter table units enable row level security;
alter table products enable row level security;
alter table unit_conversions enable row level security;
alter table customers enable row level security;
alter table suppliers enable row level security;
alter table coa enable row level security;

create policy "Authenticated users can read units"
  on units for select to authenticated using (true);
create policy "Admins and staff can manage units"
  on units for all to authenticated using (get_my_role() in ('admin', 'staff'));

create policy "Authenticated users can read active products"
  on products for select to authenticated using (is_active = true);
create policy "Admins and staff can manage products"
  on products for all to authenticated using (get_my_role() in ('admin', 'staff'));

create policy "Authenticated users can read unit conversions"
  on unit_conversions for select to authenticated using (true);
create policy "Admins and staff can manage unit conversions"
  on unit_conversions for all to authenticated using (get_my_role() in ('admin', 'staff'));

create policy "Authenticated users can read active customers"
  on customers for select to authenticated using (is_active = true);
create policy "Admins and staff can manage customers"
  on customers for all to authenticated using (get_my_role() in ('admin', 'staff'));

create policy "Authenticated users can read active suppliers"
  on suppliers for select to authenticated using (is_active = true);
create policy "Admins and staff can manage suppliers"
  on suppliers for all to authenticated using (get_my_role() in ('admin', 'staff'));

create policy "Authenticated users can read active COA"
  on coa for select to authenticated using (is_active = true);
create policy "Admins can manage COA"
  on coa for all to authenticated using (get_my_role() = 'admin');
