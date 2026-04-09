-- ============================================================
-- Migration 009: RLS Policies for all tables
-- ============================================================

-- Enable RLS on all tables
alter table units enable row level security;
alter table products enable row level security;
alter table unit_conversions enable row level security;
alter table customers enable row level security;
alter table suppliers enable row level security;
alter table coa enable row level security;
alter table sales_orders enable row level security;
alter table sales_order_items enable row level security;
alter table goods_deliveries enable row level security;
alter table goods_delivery_items enable row level security;
alter table purchase_orders enable row level security;
alter table purchase_order_items enable row level security;
alter table goods_receipts enable row level security;
alter table goods_receipt_items enable row level security;
alter table invoices enable row level security;
alter table invoice_items enable row level security;
alter table payments enable row level security;
alter table inventory_movements enable row level security;
alter table inventory_stock enable row level security;
alter table accounts enable row level security;
alter table journals enable row level security;
alter table journal_items enable row level security;
alter table bank_reconciliations enable row level security;
alter table audit_logs enable row level security;

-- Helper functions
create or replace function is_admin_or_staff()
returns boolean as $$
  select get_my_role() in ('admin', 'staff');
$$ language sql security definer stable;

create or replace function is_admin()
returns boolean as $$
  select get_my_role() = 'admin';
$$ language sql security definer stable;

-- MASTER DATA: everyone reads, admin/staff writes, admin deletes
-- (units, products, unit_conversions, customers, suppliers, coa, accounts)
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'units', 'products', 'unit_conversions', 'customers', 'suppliers', 'coa', 'accounts'
  ] loop
    execute format('create policy "Authenticated read %1$s" on %1$s for select to authenticated using (true)', tbl);
    execute format('create policy "Admin/staff insert %1$s" on %1$s for insert to authenticated with check (is_admin_or_staff())', tbl);
    execute format('create policy "Admin/staff update %1$s" on %1$s for update to authenticated using (is_admin_or_staff())', tbl);
    execute format('create policy "Admin delete %1$s" on %1$s for delete to authenticated using (is_admin())', tbl);
  end loop;
end $$;

-- TRANSACTION TABLES: same pattern for SO, PO, invoices, payments, goods_*, inventory
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'sales_orders', 'sales_order_items',
    'goods_deliveries', 'goods_delivery_items',
    'purchase_orders', 'purchase_order_items',
    'goods_receipts', 'goods_receipt_items',
    'invoices', 'invoice_items',
    'payments',
    'inventory_movements', 'inventory_stock',
    'bank_reconciliations'
  ] loop
    execute format('create policy "Authenticated read %1$s" on %1$s for select to authenticated using (true)', tbl);
    execute format('create policy "Admin/staff insert %1$s" on %1$s for insert to authenticated with check (is_admin_or_staff())', tbl);
    execute format('create policy "Admin/staff update %1$s" on %1$s for update to authenticated using (is_admin_or_staff())', tbl);
    execute format('create policy "Admin delete %1$s" on %1$s for delete to authenticated using (is_admin())', tbl);
  end loop;
end $$;

-- JOURNALS: only admin can create/edit manual journals; auto journals by system
create policy "Authenticated read journals" on journals for select to authenticated using (true);
create policy "Auto journals by system" on journals for insert to authenticated with check (
  source = 'auto' or is_admin()
);
create policy "Admin update journals" on journals for update to authenticated using (is_admin());
create policy "Admin delete journals" on journals for delete to authenticated using (is_admin());

create policy "Authenticated read journal_items" on journal_items for select to authenticated using (true);
create policy "Insert journal_items" on journal_items for insert to authenticated with check (true);
create policy "Admin update journal_items" on journal_items for update to authenticated using (is_admin());
create policy "Admin delete journal_items" on journal_items for delete to authenticated using (is_admin());

-- AUDIT LOGS: everyone reads, system inserts
create policy "Authenticated read audit_logs" on audit_logs for select to authenticated using (true);
create policy "System insert audit_logs" on audit_logs for insert to authenticated with check (true);
