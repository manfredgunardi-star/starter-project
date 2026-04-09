-- ============================================================
-- Migration 005: Invoices & Payments
-- ============================================================

-- Invoices (sales & purchase share one table)
create table invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  date date not null,
  due_date date,
  type text not null check (type in ('sales', 'purchase')),
  customer_id uuid references customers(id),
  supplier_id uuid references suppliers(id),
  sales_order_id uuid references sales_orders(id),
  purchase_order_id uuid references purchase_orders(id),
  goods_receipt_id uuid references goods_receipts(id),
  subtotal numeric(15,2) not null default 0,
  tax_amount numeric(15,2) not null default 0,
  total numeric(15,2) not null default 0,
  amount_paid numeric(15,2) not null default 0,
  status text not null default 'draft' check (status in ('draft', 'posted', 'partial', 'paid')),
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Ensure correct party for type
  check (
    (type = 'sales' and customer_id is not null and supplier_id is null) or
    (type = 'purchase' and supplier_id is not null and customer_id is null)
  )
);

create table invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  product_id uuid not null references products(id),
  unit_id uuid not null references units(id),
  quantity numeric(15,4) not null check (quantity > 0),
  quantity_base numeric(15,4) not null check (quantity_base > 0),
  unit_price numeric(15,2) not null check (unit_price >= 0),
  tax_amount numeric(15,2) not null default 0,
  total numeric(15,2) not null default 0
);

-- Indexes
create index idx_invoices_type on invoices(type);
create index idx_invoices_status on invoices(status);
create index idx_invoices_customer on invoices(customer_id);
create index idx_invoices_supplier on invoices(supplier_id);
create index idx_invoices_date on invoices(date);

create trigger set_updated_at before update on invoices
  for each row execute function update_updated_at();
