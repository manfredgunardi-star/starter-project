-- ============================================================
-- Migration 004: Purchase Tables
-- (purchase_orders, purchase_order_items, goods_receipts, goods_receipt_items)
-- ============================================================

-- Purchase Orders
create table purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_number text not null unique,
  date date not null,
  supplier_id uuid not null references suppliers(id),
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'received', 'done')),
  subtotal numeric(15,2) not null default 0,
  tax_amount numeric(15,2) not null default 0,
  total numeric(15,2) not null default 0,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  product_id uuid not null references products(id),
  unit_id uuid not null references units(id),
  quantity numeric(15,4) not null check (quantity > 0),
  quantity_base numeric(15,4) not null check (quantity_base > 0),
  unit_price numeric(15,2) not null check (unit_price >= 0),
  tax_amount numeric(15,2) not null default 0,
  total numeric(15,2) not null default 0
);

-- Goods Receipts (penerimaan barang dari supplier)
create table goods_receipts (
  id uuid primary key default gen_random_uuid(),
  gr_number text not null unique,
  date date not null,
  purchase_order_id uuid references purchase_orders(id),
  supplier_id uuid not null references suppliers(id),
  status text not null default 'draft' check (status in ('draft', 'posted')),
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table goods_receipt_items (
  id uuid primary key default gen_random_uuid(),
  goods_receipt_id uuid not null references goods_receipts(id) on delete cascade,
  product_id uuid not null references products(id),
  unit_id uuid not null references units(id),
  quantity numeric(15,4) not null check (quantity > 0),
  quantity_base numeric(15,4) not null check (quantity_base > 0),
  unit_price numeric(15,2) not null check (unit_price >= 0)
);

-- Indexes
create index idx_po_supplier on purchase_orders(supplier_id);
create index idx_po_status on purchase_orders(status);
create index idx_po_date on purchase_orders(date);
create index idx_gr_supplier on goods_receipts(supplier_id);
create index idx_gr_po on goods_receipts(purchase_order_id);

create trigger set_updated_at before update on purchase_orders
  for each row execute function update_updated_at();
