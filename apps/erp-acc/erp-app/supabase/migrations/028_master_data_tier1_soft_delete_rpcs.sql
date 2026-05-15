-- Soft-delete RPCs for Master Data Tier 1.
-- Client-side updates to is_active=false can still be blocked by RLS visibility.
-- These RPCs keep the write server-side, preserve reference checks, and only
-- allow admin/staff users through is_admin_or_staff().

create or replace function soft_delete_product_category(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ref_count int;
begin
  if not is_admin_or_staff() then
    raise exception 'permission denied';
  end if;

  select count(*) into ref_count
  from product_categories
  where parent_id = p_id and is_active = true;
  if ref_count > 0 then
    raise exception 'Kategori produk masih digunakan oleh % sub-kategori aktif', ref_count;
  end if;

  select count(*) into ref_count
  from products
  where category_id = p_id and is_active = true;
  if ref_count > 0 then
    raise exception 'Kategori produk masih digunakan oleh % produk aktif', ref_count;
  end if;

  update product_categories
  set
    is_active = false,
    deleted_at = now(),
    deleted_by = auth.uid()
  where id = p_id;
end;
$$;

create or replace function soft_delete_payment_term(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ref_count int;
begin
  if not is_admin_or_staff() then
    raise exception 'permission denied';
  end if;

  select count(*) into ref_count
  from customers
  where default_payment_term_id = p_id and is_active = true;
  if ref_count > 0 then
    raise exception 'Syarat pembayaran masih digunakan oleh % pelanggan aktif', ref_count;
  end if;

  select count(*) into ref_count
  from suppliers
  where default_payment_term_id = p_id and is_active = true;
  if ref_count > 0 then
    raise exception 'Syarat pembayaran masih digunakan oleh % supplier aktif', ref_count;
  end if;

  select count(*) into ref_count from sales_orders where payment_term_id = p_id;
  if ref_count > 0 then
    raise exception 'Syarat pembayaran masih digunakan oleh % sales order', ref_count;
  end if;

  select count(*) into ref_count from purchase_orders where payment_term_id = p_id;
  if ref_count > 0 then
    raise exception 'Syarat pembayaran masih digunakan oleh % purchase order', ref_count;
  end if;

  select count(*) into ref_count from invoices where payment_term_id = p_id;
  if ref_count > 0 then
    raise exception 'Syarat pembayaran masih digunakan oleh % invoice', ref_count;
  end if;

  update payment_terms
  set
    is_active = false,
    deleted_at = now(),
    deleted_by = auth.uid()
  where id = p_id;
end;
$$;

create or replace function soft_delete_tax_code(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ref_count int;
begin
  if not is_admin_or_staff() then
    raise exception 'permission denied';
  end if;

  select count(*) into ref_count
  from products
  where default_tax_code_id = p_id and is_active = true;
  if ref_count > 0 then
    raise exception 'Kode pajak masih digunakan oleh % produk aktif', ref_count;
  end if;

  select count(*) into ref_count
  from customers
  where default_tax_code_id = p_id and is_active = true;
  if ref_count > 0 then
    raise exception 'Kode pajak masih digunakan oleh % pelanggan aktif', ref_count;
  end if;

  select count(*) into ref_count
  from suppliers
  where default_tax_code_id = p_id and is_active = true;
  if ref_count > 0 then
    raise exception 'Kode pajak masih digunakan oleh % supplier aktif', ref_count;
  end if;

  select count(*) into ref_count from sales_order_items where tax_code_id = p_id;
  if ref_count > 0 then
    raise exception 'Kode pajak masih digunakan oleh % item sales order', ref_count;
  end if;

  select count(*) into ref_count from purchase_order_items where tax_code_id = p_id;
  if ref_count > 0 then
    raise exception 'Kode pajak masih digunakan oleh % item purchase order', ref_count;
  end if;

  select count(*) into ref_count from invoice_items where tax_code_id = p_id;
  if ref_count > 0 then
    raise exception 'Kode pajak masih digunakan oleh % item invoice', ref_count;
  end if;

  update tax_codes
  set
    is_active = false,
    deleted_at = now(),
    deleted_by = auth.uid()
  where id = p_id;
end;
$$;

create or replace function soft_delete_warehouse(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ref_count int;
  target_is_default boolean;
begin
  if not is_admin_or_staff() then
    raise exception 'permission denied';
  end if;

  select is_default into target_is_default
  from warehouses
  where id = p_id;
  if target_is_default then
    raise exception 'Gudang default tidak dapat dihapus';
  end if;

  select count(*) into ref_count from sales_orders where warehouse_id = p_id;
  if ref_count > 0 then
    raise exception 'Gudang masih digunakan oleh % sales order', ref_count;
  end if;

  select count(*) into ref_count from purchase_orders where warehouse_id = p_id;
  if ref_count > 0 then
    raise exception 'Gudang masih digunakan oleh % purchase order', ref_count;
  end if;

  select count(*) into ref_count from goods_deliveries where warehouse_id = p_id;
  if ref_count > 0 then
    raise exception 'Gudang masih digunakan oleh % goods delivery', ref_count;
  end if;

  select count(*) into ref_count from goods_receipts where warehouse_id = p_id;
  if ref_count > 0 then
    raise exception 'Gudang masih digunakan oleh % goods receipt', ref_count;
  end if;

  update warehouses
  set
    is_active = false,
    deleted_at = now(),
    deleted_by = auth.uid()
  where id = p_id;
end;
$$;

grant execute on function soft_delete_product_category(uuid) to authenticated;
grant execute on function soft_delete_payment_term(uuid) to authenticated;
grant execute on function soft_delete_tax_code(uuid) to authenticated;
grant execute on function soft_delete_warehouse(uuid) to authenticated;
