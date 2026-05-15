-- Fix Master Data Tier 1 RLS so admin/staff updates may soft-delete records.
-- Migration 026 select policies only expose active rows; update policies must
-- explicitly allow the new row state where is_active becomes false.

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'product_categories',
    'payment_terms',
    'tax_codes',
    'warehouses'
  ]
  loop
    execute format(
      'drop policy if exists %I on %I',
      'Admins and staff can update ' || tbl,
      tbl
    );

    execute format(
      'create policy %I on %I for update to authenticated using (is_admin_or_staff()) with check (is_admin_or_staff())',
      'Admins and staff can update ' || tbl,
      tbl
    );
  end loop;
end $$;
