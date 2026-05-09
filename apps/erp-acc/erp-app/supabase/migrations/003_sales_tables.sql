-- ============================================================
-- Migration 003: Sales Tables
-- (sales_orders, sales_order_items, goods_deliveries, goods_delivery_items)
-- ============================================================

-- Sales Orders
create table sales_orders (
  id uuid primary key default gen_random_uuid(),
  so_number text not null unique,
  date date not null,
  customer_id uuid not null references customers(id),
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'invoiced', 'done')),
  subtotal numeric(15,2) not null default 0,
  tax_amount numeric(15,2) not null default 0,
  total numeric(15,2) not null default 0,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table sales_order_items (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null references sales_orders(id) on delete cascade,
  product_id uuid not null references products(id),
  unit_id uuid not null references units(id),
  quantity numeric(15,4) not null check (quantity > 0),
  quantity_base numeric(15,4) not null check (quantity_base > 0),
  unit_price numeric(15,2) not null check (unit_price >= 0),
  tax_amount numeric(15,2) not null default 0,
  total numeric(15,2) not null default 0
);

-- Goods Deliveries (pengiriman barang ke customer)
create table goods_deliveries (
  id uuid primary key default gen_random_uuid(),
  gd_number text not null unique,
  date date not null,
  sales_order_id uuid references sales_orders(id),
  customer_id uuid not null references customers(id),
  status text not null default 'draft' check (status in ('draft', 'posted')),
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table goods_delivery_items (
  id uuid primary key default gen_random_uuid(),
  goods_delivery_id uuid not null references goods_deliveries(id) on delete cascade,
  product_id uuid not null references products(id),
  unit_id uuid not null references units(id),
  quantity numeric(15,4) not null check (quantity > 0),
  quantity_base numeric(15,4) not null check (quantity_base > 0)
);

-- Indexes
create index idx_so_customer on sales_orders(customer_id);
create index idx_so_status on sales_orders(status);
create index idx_so_date on sales_orders(date);
create index idx_gd_customer on goods_deliveries(customer_id);
create index idx_gd_so on goods_deliveries(sales_order_id);

create trigger set_updated_at before update on sales_orders
  for each row execute function update_updated_at();
