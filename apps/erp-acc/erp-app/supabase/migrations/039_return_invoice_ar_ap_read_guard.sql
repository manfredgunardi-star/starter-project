-- ============================================================
-- Migration 039: close an anon-readable gap on migration 038's new
-- read-only helper functions.
--
-- get_advisors (security) flagged all SECURITY DEFINER functions in this
-- schema as anon-executable via PostgREST — that's a pre-existing,
-- systemic pattern across ~174 functions in this database (e.g.
-- save_sales_invoice/post_sales_invoice from migrations 011/016/018/037
-- have the identical warning) and is out of scope to fix app-wide here.
--
-- However, unlike every write RPC in this codebase (which self-checks
-- via is_admin_or_staff()/_ensure_can_post() and rejects unauthorized
-- callers with an exception), the four plain `language sql` read helpers
-- added in migration 038 had NO internal guard at all — an anonymous,
-- unauthenticated caller could invoke them directly via
-- /rest/v1/rpc/<name> and get real invoice/product data back (not just
-- a permission error). That's qualitatively worse than the pre-existing
-- pattern and specific to this migration, so it's fixed here: convert
-- all four to `language plpgsql` with a minimal "caller must be
-- authenticated" guard, matching how every RLS policy in this app reads
-- (`to authenticated`, never `to anon`/`public`). This does not require
-- admin/staff specifically (these are cheap, non-money-moving reads),
-- just a logged-in session.
-- ============================================================

create or replace function sales_returnable_qty(p_invoice_item_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'permission denied';
  end if;

  return (
    select ii.quantity_base
         - coalesce((
             select sum(sri.quantity_base)
               from sales_return_items sri
               join sales_returns sr on sr.id = sri.sales_return_id
              where sri.invoice_item_id = p_invoice_item_id
                and sr.status = 'posted'
           ), 0)
      from invoice_items ii
     where ii.id = p_invoice_item_id
  );
end;
$$;

create or replace function purchase_returnable_qty(p_invoice_item_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'permission denied';
  end if;

  return (
    select ii.quantity_base
         - coalesce((
             select sum(pri.quantity_base)
               from purchase_return_items pri
               join purchase_returns pr on pr.id = pri.purchase_return_id
              where pri.invoice_item_id = p_invoice_item_id
                and pr.status = 'posted'
           ), 0)
      from invoice_items ii
     where ii.id = p_invoice_item_id
  );
end;
$$;

create or replace function get_returnable_sales_invoice_items(p_invoice_id uuid)
returns table (
  invoice_item_id uuid, product_id uuid, product_name text, unit_id uuid, unit_name text,
  quantity_base numeric, unit_price numeric, returnable numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'permission denied';
  end if;

  return query
  select ii.id, ii.product_id, p.name, ii.unit_id, u.name,
         ii.quantity_base, ii.unit_price, sales_returnable_qty(ii.id)
    from invoice_items ii
    join invoices i on i.id = ii.invoice_id and i.type = 'sales'
    join products p on p.id = ii.product_id
    join units u on u.id = ii.unit_id
   where ii.invoice_id = p_invoice_id;
end;
$$;

create or replace function get_returnable_purchase_invoice_items(p_invoice_id uuid)
returns table (
  invoice_item_id uuid, product_id uuid, product_name text, unit_id uuid, unit_name text,
  quantity_base numeric, unit_price numeric, returnable numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'permission denied';
  end if;

  return query
  select ii.id, ii.product_id, p.name, ii.unit_id, u.name,
         ii.quantity_base, ii.unit_price, purchase_returnable_qty(ii.id)
    from invoice_items ii
    join invoices i on i.id = ii.invoice_id and i.type = 'purchase'
    join products p on p.id = ii.product_id
    join units u on u.id = ii.unit_id
   where ii.invoice_id = p_invoice_id;
end;
$$;
