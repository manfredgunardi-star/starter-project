-- ============================================================
-- Migration 006: Inventory
-- ============================================================

-- Inventory movements (all stock in/out/adjustments)
create table inventory_movements (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  product_id uuid not null references products(id),
  type text not null check (type in ('in', 'out', 'adjustment')),
  quantity_base numeric(15,4) not null,
  unit_id uuid not null references units(id),
  quantity_original numeric(15,4) not null,
  unit_cost numeric(15,2) not null default 0,
  reference_type text,
  reference_id uuid,
  notes text,
  created_at timestamptz not null default now()
);

-- Current stock per product (materialized summary)
create table inventory_stock (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) unique,
  quantity_on_hand numeric(15,4) not null default 0,
  avg_cost numeric(15,2) not null default 0,
  last_updated timestamptz not null default now()
);

-- Indexes
create index idx_inv_movements_product on inventory_movements(product_id);
create index idx_inv_movements_ref on inventory_movements(reference_type, reference_id);
create index idx_inv_movements_date on inventory_movements(date);
