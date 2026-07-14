# Double-Retur Prevention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **This plan is written for handover to Codex (GPT-5.5/GPT-5.6), not Claude subagents.** Every task below contains complete, self-contained code with zero placeholders — Codex should be able to execute each task with no additional codebase exploration beyond what's quoted here.

**Goal:** Prevent the same physical return (Sales Return / Purchase Return) from being posted more than once, whether it goes through the existing invoice-linked path or the "tanpa invoice (retur stok saja)" free-form path — closing a gap that has already caused confirmed duplicate postings in production (ERP-MG).

**Architecture:** One aggregate SQL ledger function per (party, product) — `GREATEST(total delivered/received via GD/GR, total invoiced) − total already returned (posted, any path)`. No table schema changes. The ledger is called as an *additional* validation layer inside the 4 existing return RPCs (`save_sales_return`, `save_purchase_return`, `post_sales_return`, `post_purchase_return`) — none of their existing logic is removed or altered, only extended. A new picker component replaces the free-form product/qty input for the no-invoice path.

**Tech Stack:** React 19, Ant Design 6, Supabase (PostgreSQL 17), Vite 8. No test framework — verification is `npm run build` + manual SQL smoke test.

## Global Constraints

- Run `npm run build` in `apps/erp-acc/erp-app` after every task — must pass with zero errors before moving to the next task.
- Do not modify any table schema (no `ALTER TABLE`) — this feature is additive functions + RPC extensions only.
- Do not remove or alter the existing `invoice_item_id`-based validation in `save_sales_return`/`save_purchase_return`/`post_sales_return`/`post_purchase_return` — all new logic is inserted alongside it, never replacing it.
- All new SQL functions must guard with `if auth.uid() is null then raise exception 'permission denied'; end if;` (matches the established pattern from migration `039_return_invoice_ar_ap_read_guard.sql` — do NOT rely on default PostgREST grants).
- **Never run `firebase deploy` or apply this migration directly to a production Supabase project without the user's explicit go-ahead.** If a Supabase CLI/branch workflow is available, apply and smoke-test on a branch/local instance first.
- Respond to the user in Bahasa Indonesia for any commentary; code, SQL, and commit messages stay in English (conventional commit style).

---

## File Map

| File | Action | Task |
|---|---|---|
| `apps/erp-acc/erp-app/supabase/migrations/042_double_retur_prevention.sql` | Create | 1 |
| `apps/erp-acc/erp-app/src/services/salesReturnService.js` | Modify | 2 |
| `apps/erp-acc/erp-app/src/services/purchaseReturnService.js` | Modify | 2 |
| `apps/erp-acc/erp-app/src/components/shared/PartyReturnableProductsPicker.jsx` | Create | 3 |
| `apps/erp-acc/erp-app/src/pages/sales/SalesReturnFormPage.jsx` | Modify | 4 |
| `apps/erp-acc/erp-app/src/pages/purchase/PurchaseReturnFormPage.jsx` | Modify | 5 |

---

## Model & Effort

| Task | Recommended | Why |
|---|---|---|
| Task 1: SQL migration (ledger + RPC extensions) | **Codex GPT-5.6, high reasoning effort** | Financial/inventory logic, must preserve existing function bodies byte-for-byte except the marked insertions — precision-critical. |
| Task 2: Service layer (2 files, ~10 lines each) | **Codex GPT-5.5** | Purely mechanical, mirrors an existing function in the same file. |
| Task 3: New picker component | **Codex GPT-5.5** | Mechanical mirror of an existing component (`InvoiceReturnItemsPicker.jsx`), full code already provided below. |
| Task 4: Wire picker into `SalesReturnFormPage.jsx` | **Codex GPT-5.6** | Cross-file reasoning inside an existing complex form (multiple interacting `useEffect`s) — needs care to not break the invoice-linked path. |
| Task 5: Wire picker into `PurchaseReturnFormPage.jsx` | **Codex GPT-5.6** | Mirror of Task 4, same care level. |
| Task 6: Smoke test + build verification | **Codex GPT-5.5** | Mechanical execution of a fully-scripted test plan. |

---

## Task 1: SQL Migration — Ledger Functions + RPC Extensions

**Files:**
- Create: `apps/erp-acc/erp-app/supabase/migrations/042_double_retur_prevention.sql`

**Context you need (already-existing schema/functions — do not redefine, only reference):**
- `sales_returns(id, sr_number, date, customer_id, sales_order_id, invoice_id, warehouse_id, status, subtotal, tax_amount, total, notes, created_by, return_credit_amount, excess_credit_amount)`
- `sales_return_items(id, sales_return_id, invoice_item_id, product_id, unit_id, quantity, quantity_base, unit_price, tax_amount, total)`
- `purchase_returns` / `purchase_return_items` — mirror structure with `supplier_id`/`purchase_order_id`.
- `goods_deliveries(id, gd_number, date, sales_order_id, customer_id, status, ...)` — `status` is `'draft'` or `'posted'`.
- `goods_delivery_items(id, goods_delivery_id, product_id, unit_id, quantity, quantity_base)`.
- `goods_receipts(id, gr_number, date, purchase_order_id, supplier_id, status, ...)` — same status values.
- `goods_receipt_items(id, goods_receipt_id, product_id, unit_id, quantity, quantity_base, unit_price)`.
- `invoices(id, invoice_number, date, type, customer_id, supplier_id, ..., status)` — `status` in `('draft','posted','partial','paid')`.
- `invoice_items(id, invoice_id, product_id, unit_id, quantity, quantity_base, unit_price, tax_amount, total)`.
- `products(id, sku, name, base_unit_id, buy_price, sell_price, is_taxable, tax_rate, ...)`.
- `units(id, name, ...)`.
- `sales_returnable_qty(p_invoice_item_id uuid)` / `purchase_returnable_qty(p_invoice_item_id uuid)` — existing per-invoice-line caps, untouched by this migration.
- `_ensure_can_post()`, `_ensure_period_open(date)`, `is_admin_or_staff()` — existing guards, already called inside the functions you're extending.

- [ ] **Step 1: Create the migration file with the following complete content**

```sql
-- ============================================================
-- Migration 042: Double-retur prevention (aggregate ledger)
--
-- Closes a gap where the existing invoice_item_id-based returnable-qty
-- cap (migration 038) and the "tanpa invoice (retur stok saja)" free-form
-- path are two independent tracking dimensions -- the same physical
-- return can slip through both, since invoice_items has no FK back to
-- goods_delivery_items/goods_receipt_items. See
-- docs/superpowers/specs/2026-07-14-double-retur-prevention-design.md
-- and docs/superpowers/specs/2026-07-14-double-retur-historical-findings.md
-- for the production incidents this closes.
--
-- Approach: one aggregate ledger per (party, product) that both return
-- paths share -- GREATEST(total delivered/received via GD/GR, total
-- invoiced) minus total already returned (posted, ANY path). Existing
-- invoice_item_id-based checks in save_sales_return/save_purchase_return/
-- post_sales_return/post_purchase_return are untouched; this migration
-- only adds a second, additive layer of defense to those same functions.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Ledger functions
-- ------------------------------------------------------------
create or replace function sales_return_remaining_qty(p_customer_id uuid, p_product_id uuid)
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

  return greatest(
    coalesce((
      select sum(gdi.quantity_base)
        from goods_delivery_items gdi
        join goods_deliveries gd on gd.id = gdi.goods_delivery_id
       where gd.customer_id = p_customer_id
         and gdi.product_id = p_product_id
         and gd.status = 'posted'
    ), 0),
    coalesce((
      select sum(ii.quantity_base)
        from invoice_items ii
        join invoices i on i.id = ii.invoice_id
       where i.customer_id = p_customer_id
         and ii.product_id = p_product_id
         and i.type = 'sales'
         and i.status <> 'draft'
    ), 0)
  ) - coalesce((
    select sum(sri.quantity_base)
      from sales_return_items sri
      join sales_returns sr on sr.id = sri.sales_return_id
     where sr.customer_id = p_customer_id
       and sri.product_id = p_product_id
       and sr.status = 'posted'
  ), 0);
end;
$$;

create or replace function purchase_return_remaining_qty(p_supplier_id uuid, p_product_id uuid)
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

  return greatest(
    coalesce((
      select sum(gri.quantity_base)
        from goods_receipt_items gri
        join goods_receipts gr on gr.id = gri.goods_receipt_id
       where gr.supplier_id = p_supplier_id
         and gri.product_id = p_product_id
         and gr.status = 'posted'
    ), 0),
    coalesce((
      select sum(ii.quantity_base)
        from invoice_items ii
        join invoices i on i.id = ii.invoice_id
       where i.supplier_id = p_supplier_id
         and ii.product_id = p_product_id
         and i.type = 'purchase'
         and i.status <> 'draft'
    ), 0)
  ) - coalesce((
    select sum(pri.quantity_base)
      from purchase_return_items pri
      join purchase_returns pr on pr.id = pri.purchase_return_id
     where pr.supplier_id = p_supplier_id
       and pri.product_id = p_product_id
       and pr.status = 'posted'
  ), 0);
end;
$$;

-- ------------------------------------------------------------
-- 2) Picker helpers for the "tanpa invoice" form path
-- ------------------------------------------------------------
create or replace function get_customer_returnable_products(p_customer_id uuid)
returns table (
  product_id uuid, product_name text, sku text, unit_id uuid, unit_name text,
  unit_price numeric, remaining numeric
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
  select p.id, p.name, p.sku, p.base_unit_id, u.name, p.sell_price,
         sales_return_remaining_qty(p_customer_id, p.id) as remaining
    from products p
    join units u on u.id = p.base_unit_id
   where exists (
           select 1 from goods_delivery_items gdi
             join goods_deliveries gd on gd.id = gdi.goods_delivery_id
            where gd.customer_id = p_customer_id
              and gdi.product_id = p.id
              and gd.status = 'posted'
         )
     and sales_return_remaining_qty(p_customer_id, p.id) > 0;
end;
$$;

create or replace function get_supplier_returnable_products(p_supplier_id uuid)
returns table (
  product_id uuid, product_name text, sku text, unit_id uuid, unit_name text,
  unit_price numeric, remaining numeric
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
  select p.id, p.name, p.sku, p.base_unit_id, u.name, p.buy_price,
         purchase_return_remaining_qty(p_supplier_id, p.id) as remaining
    from products p
    join units u on u.id = p.base_unit_id
   where exists (
           select 1 from goods_receipt_items gri
             join goods_receipts gr on gr.id = gri.goods_receipt_id
            where gr.supplier_id = p_supplier_id
              and gri.product_id = p.id
              and gr.status = 'posted'
         )
     and purchase_return_remaining_qty(p_supplier_id, p.id) > 0;
end;
$$;

-- ------------------------------------------------------------
-- 3) Extend save_sales_return: add the aggregate-ledger check after the
--    existing per-item loop (which still does the invoice_item_id check
--    unchanged), before the insert/update branch. Full function body
--    reproduced below with ONLY that one addition (marked) plus one new
--    declared variable (marked) — everything else is byte-identical to
--    migration 038.
-- ------------------------------------------------------------
create or replace function save_sales_return(
  p_sr jsonb,
  p_items jsonb[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_item jsonb;
  v_subtotal numeric := 0;
  v_tax_amount numeric := 0;
  v_total numeric := 0;
  v_invoice_id uuid;
  v_customer_id uuid;
  v_inv_customer_id uuid;
  v_inv_status text;
  v_returnable numeric;
  v_prod_check record; -- NEW
begin
  if not is_admin_or_staff() then
    raise exception 'permission denied';
  end if;

  perform _ensure_period_open((p_sr->>'date')::date);

  v_invoice_id := nullif(p_sr->>'invoice_id', '')::uuid;
  v_customer_id := (p_sr->>'customer_id')::uuid;

  if v_invoice_id is not null then
    select customer_id, status into v_inv_customer_id, v_inv_status
      from invoices where id = v_invoice_id and type = 'sales';
    if v_inv_customer_id is null then
      raise exception 'invoice asal tidak ditemukan atau bukan sales invoice';
    end if;
    if v_inv_customer_id <> v_customer_id then
      raise exception 'customer retur harus sama dengan customer invoice asal';
    end if;
    if v_inv_status not in ('posted', 'partial', 'paid') then
      raise exception 'invoice asal harus berstatus posted/partial/paid, saat ini: %', v_inv_status;
    end if;
  end if;

  foreach v_item in array p_items loop
    if v_invoice_id is not null then
      if nullif(v_item->>'invoice_item_id', '') is null then
        raise exception 'setiap item retur wajib invoice_item_id jika retur link ke invoice';
      end if;
      if not exists (
        select 1 from invoice_items
         where id = (v_item->>'invoice_item_id')::uuid
           and invoice_id = v_invoice_id
      ) then
        raise exception 'baris invoice tidak ditemukan pada invoice asal';
      end if;
      select sales_returnable_qty((v_item->>'invoice_item_id')::uuid) into v_returnable;
      if coalesce((v_item->>'quantity_base')::numeric, (v_item->>'quantity')::numeric)
           > coalesce(v_returnable, 0) then
        raise exception 'qty retur melebihi sisa yang bisa diretur (%)', v_returnable;
      end if;
    end if;
    v_subtotal := v_subtotal
      + coalesce((v_item->>'unit_price')::numeric, 0)
        * coalesce((v_item->>'quantity')::numeric, 0);
    v_tax_amount := v_tax_amount + coalesce((v_item->>'tax_amount')::numeric, 0);
    v_total := v_total + coalesce((v_item->>'total')::numeric, 0);
  end loop;

  -- NEW: aggregate ledger cap. Groups this return's items by product and
  -- checks each product's total qty against sales_return_remaining_qty,
  -- regardless of whether invoice_id is set. This is what closes the
  -- cross-path double-retur gap (see design spec).
  for v_prod_check in
    select (elem->>'product_id')::uuid as product_id,
           sum(coalesce((elem->>'quantity_base')::numeric, (elem->>'quantity')::numeric)) as qty
      from unnest(p_items) as elem
     group by (elem->>'product_id')::uuid
  loop
    v_returnable := sales_return_remaining_qty(v_customer_id, v_prod_check.product_id);
    if v_prod_check.qty > coalesce(v_returnable, 0) then
      raise exception 'Sisa retur untuk produk (id %) tinggal % unit, qty diminta % melebihi itu',
        v_prod_check.product_id, coalesce(v_returnable, 0), v_prod_check.qty;
    end if;
  end loop;

  if (p_sr->>'id') is null or (p_sr->>'id') = '' then
    v_id := gen_random_uuid();

    insert into sales_returns (
      id, sr_number, date, customer_id, sales_order_id, invoice_id, warehouse_id,
      status, subtotal, tax_amount, total, notes, created_by
    ) values (
      v_id,
      generate_number('SRN'),
      (p_sr->>'date')::date,
      v_customer_id,
      nullif(p_sr->>'sales_order_id', '')::uuid,
      v_invoice_id,
      nullif(p_sr->>'warehouse_id', '')::uuid,
      coalesce(nullif(p_sr->>'status', ''), 'draft'),
      v_subtotal, v_tax_amount, v_total,
      nullif(p_sr->>'notes', ''),
      auth.uid()
    );
  else
    v_id := (p_sr->>'id')::uuid;

    update sales_returns
       set date           = (p_sr->>'date')::date,
           customer_id    = v_customer_id,
           sales_order_id = nullif(p_sr->>'sales_order_id', '')::uuid,
           invoice_id     = v_invoice_id,
           warehouse_id   = nullif(p_sr->>'warehouse_id', '')::uuid,
           notes          = nullif(p_sr->>'notes', ''),
           subtotal       = v_subtotal,
           tax_amount     = v_tax_amount,
           total          = v_total
     where id = v_id
       and status = 'draft';

    if not found then
      raise exception 'Sales return tidak ditemukan atau sudah diposting';
    end if;
  end if;

  delete from sales_return_items where sales_return_id = v_id;

  foreach v_item in array p_items loop
    insert into sales_return_items (
      sales_return_id, invoice_item_id, product_id, unit_id,
      quantity, quantity_base, unit_price, tax_amount, total
    ) values (
      v_id,
      nullif(v_item->>'invoice_item_id', '')::uuid,
      (v_item->>'product_id')::uuid,
      (v_item->>'unit_id')::uuid,
      (v_item->>'quantity')::numeric,
      (v_item->>'quantity_base')::numeric,
      coalesce((v_item->>'unit_price')::numeric, 0),
      coalesce((v_item->>'tax_amount')::numeric, 0),
      coalesce((v_item->>'total')::numeric, 0)
    );
  end loop;

  return v_id;
end;
$$;

-- ------------------------------------------------------------
-- 4) Extend save_purchase_return: mirror of the save_sales_return change
--    above (supplier_id instead of customer_id, purchase_ prefix).
-- ------------------------------------------------------------
create or replace function save_purchase_return(
  p_pr jsonb,
  p_items jsonb[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_item jsonb;
  v_subtotal numeric := 0;
  v_tax_amount numeric := 0;
  v_total numeric := 0;
  v_invoice_id uuid;
  v_supplier_id uuid;
  v_inv_supplier_id uuid;
  v_inv_status text;
  v_returnable numeric;
  v_prod_check record; -- NEW
begin
  if not is_admin_or_staff() then
    raise exception 'permission denied';
  end if;

  perform _ensure_period_open((p_pr->>'date')::date);

  v_invoice_id := nullif(p_pr->>'invoice_id', '')::uuid;
  v_supplier_id := (p_pr->>'supplier_id')::uuid;

  if v_invoice_id is not null then
    select supplier_id, status into v_inv_supplier_id, v_inv_status
      from invoices where id = v_invoice_id and type = 'purchase';
    if v_inv_supplier_id is null then
      raise exception 'invoice asal tidak ditemukan atau bukan purchase invoice';
    end if;
    if v_inv_supplier_id <> v_supplier_id then
      raise exception 'supplier retur harus sama dengan supplier invoice asal';
    end if;
    if v_inv_status not in ('posted', 'partial', 'paid') then
      raise exception 'invoice asal harus berstatus posted/partial/paid, saat ini: %', v_inv_status;
    end if;
  end if;

  foreach v_item in array p_items loop
    if v_invoice_id is not null then
      if nullif(v_item->>'invoice_item_id', '') is null then
        raise exception 'setiap item retur wajib invoice_item_id jika retur link ke invoice';
      end if;
      if not exists (
        select 1 from invoice_items
         where id = (v_item->>'invoice_item_id')::uuid
           and invoice_id = v_invoice_id
      ) then
        raise exception 'baris invoice tidak ditemukan pada invoice asal';
      end if;
      select purchase_returnable_qty((v_item->>'invoice_item_id')::uuid) into v_returnable;
      if coalesce((v_item->>'quantity_base')::numeric, (v_item->>'quantity')::numeric)
           > coalesce(v_returnable, 0) then
        raise exception 'qty retur melebihi sisa yang bisa diretur (%)', v_returnable;
      end if;
    end if;
    v_subtotal := v_subtotal
      + coalesce((v_item->>'unit_price')::numeric, 0)
        * coalesce((v_item->>'quantity')::numeric, 0);
    v_tax_amount := v_tax_amount + coalesce((v_item->>'tax_amount')::numeric, 0);
    v_total := v_total + coalesce((v_item->>'total')::numeric, 0);
  end loop;

  -- NEW: aggregate ledger cap (mirror of save_sales_return).
  for v_prod_check in
    select (elem->>'product_id')::uuid as product_id,
           sum(coalesce((elem->>'quantity_base')::numeric, (elem->>'quantity')::numeric)) as qty
      from unnest(p_items) as elem
     group by (elem->>'product_id')::uuid
  loop
    v_returnable := purchase_return_remaining_qty(v_supplier_id, v_prod_check.product_id);
    if v_prod_check.qty > coalesce(v_returnable, 0) then
      raise exception 'Sisa retur untuk produk (id %) tinggal % unit, qty diminta % melebihi itu',
        v_prod_check.product_id, coalesce(v_returnable, 0), v_prod_check.qty;
    end if;
  end loop;

  if (p_pr->>'id') is null or (p_pr->>'id') = '' then
    v_id := gen_random_uuid();

    insert into purchase_returns (
      id, pr_number, date, supplier_id, purchase_order_id, invoice_id, warehouse_id,
      status, subtotal, tax_amount, total, notes, created_by
    ) values (
      v_id,
      generate_number('PRN'),
      (p_pr->>'date')::date,
      v_supplier_id,
      nullif(p_pr->>'purchase_order_id', '')::uuid,
      v_invoice_id,
      nullif(p_pr->>'warehouse_id', '')::uuid,
      coalesce(nullif(p_pr->>'status', ''), 'draft'),
      v_subtotal, v_tax_amount, v_total,
      nullif(p_pr->>'notes', ''),
      auth.uid()
    );
  else
    v_id := (p_pr->>'id')::uuid;

    update purchase_returns
       set date              = (p_pr->>'date')::date,
           supplier_id       = v_supplier_id,
           purchase_order_id = nullif(p_pr->>'purchase_order_id', '')::uuid,
           invoice_id        = v_invoice_id,
           warehouse_id      = nullif(p_pr->>'warehouse_id', '')::uuid,
           notes             = nullif(p_pr->>'notes', ''),
           subtotal          = v_subtotal,
           tax_amount        = v_tax_amount,
           total             = v_total
     where id = v_id
       and status = 'draft';

    if not found then
      raise exception 'Purchase return tidak ditemukan atau sudah diposting';
    end if;
  end if;

  delete from purchase_return_items where purchase_return_id = v_id;

  foreach v_item in array p_items loop
    insert into purchase_return_items (
      purchase_return_id, invoice_item_id, product_id, unit_id,
      quantity, quantity_base, unit_price, tax_amount, total
    ) values (
      v_id,
      nullif(v_item->>'invoice_item_id', '')::uuid,
      (v_item->>'product_id')::uuid,
      (v_item->>'unit_id')::uuid,
      (v_item->>'quantity')::numeric,
      (v_item->>'quantity_base')::numeric,
      coalesce((v_item->>'unit_price')::numeric, 0),
      coalesce((v_item->>'tax_amount')::numeric, 0),
      coalesce((v_item->>'total')::numeric, 0)
    );
  end loop;

  return v_id;
end;
$$;

-- ------------------------------------------------------------
-- 5) Extend post_sales_return: add advisory-lock + aggregate-ledger hard
--    check right after the existing invoice-item re-validation block and
--    before the inventory-reversal loop. Full function body reproduced
--    below with ONLY that one addition (marked) plus one new declared
--    variable (marked) — everything else is byte-identical to migration
--    038 (including all its existing comments).
-- ------------------------------------------------------------
create or replace function post_sales_return(p_sr_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sr record;
  v_item record;
  v_avg_cost numeric;
  v_journal_id uuid;
  v_total_cost numeric := 0;
  v_coa_persediaan uuid;
  v_coa_hpp uuid;
  v_coa_piutang uuid;
  v_coa_retur_penjualan uuid;
  v_coa_ppn_out uuid;
  v_inv record;
  v_outstanding numeric;
  v_return_credit numeric;
  v_excess numeric;
  v_returnable numeric;
  v_prod_check record; -- NEW
begin
  perform _ensure_can_post();

  select * into v_sr from sales_returns where id = p_sr_id for update;

  if v_sr is null then
    raise exception 'Sales return tidak ditemukan';
  end if;

  if v_sr.status <> 'draft' then
    raise exception 'Sales return sudah diposting';
  end if;

  perform _ensure_period_open(v_sr.date);

  select id into v_coa_persediaan from coa where code = '1-14000';
  select id into v_coa_hpp from coa where code = '5-11000';

  if v_coa_persediaan is null or v_coa_hpp is null then
    raise exception 'COA retur penjualan tidak lengkap';
  end if;

  -- Lock the linked invoice up front (before the qty re-validation loop and
  -- before the inventory-reversal loop) so that any two returns posted
  -- concurrently against the same invoice — whether or not they target the
  -- same line — fully serialize on this row lock. Locking it later (e.g.
  -- only inside the AR block) would let two concurrent posts both pass the
  -- qty check before either commits, over-consuming the returnable qty.
  if v_sr.invoice_id is not null then
    select * into v_inv from invoices where id = v_sr.invoice_id for update;
  end if;

  -- Re-validate qty under row lock (race-safe: two concurrent returns on
  -- the same invoice line cannot both slip through the save-time soft check).
  -- Ownership check first: confirm invoice_item_id actually belongs to this
  -- return's invoice_id before trusting it (defends against a tampered /
  -- foreign invoice_item_id submitted directly to the RPC).
  if v_sr.invoice_id is not null then
    for v_item in select * from sales_return_items where sales_return_id = p_sr_id loop
      if not exists (
        select 1 from invoice_items
         where id = v_item.invoice_item_id
           and invoice_id = v_sr.invoice_id
      ) then
        raise exception 'baris invoice tidak ditemukan pada invoice asal';
      end if;
      select sales_returnable_qty(v_item.invoice_item_id) into v_returnable;
      if v_item.quantity_base > coalesce(v_returnable, 0) then
        raise exception 'qty retur item % melebihi sisa yang bisa diretur (%)',
          v_item.product_id, v_returnable;
      end if;
    end loop;
  end if;

  -- NEW: aggregate ledger cap + advisory lock. Serializes concurrent posts
  -- for the same customer+product across ANY return path (there is no
  -- single row to FOR-UPDATE-lock for an aggregate computed across GD +
  -- invoice + return tables, so an advisory lock keyed by customer+product
  -- provides equivalent serialization). Runs regardless of invoice_id.
  for v_prod_check in
    select product_id, sum(quantity_base) as qty
      from sales_return_items
     where sales_return_id = p_sr_id
     group by product_id
  loop
    perform pg_advisory_xact_lock(
      hashtextextended(v_sr.customer_id::text || ':' || v_prod_check.product_id::text, 0)
    );
    v_returnable := sales_return_remaining_qty(v_sr.customer_id, v_prod_check.product_id);
    if v_prod_check.qty > coalesce(v_returnable, 0) then
      raise exception 'Sisa retur untuk produk (id %) tinggal % unit, qty diminta % melebihi itu',
        v_prod_check.product_id, coalesce(v_returnable, 0), v_prod_check.qty;
    end if;
  end loop;

  -- Inventory reversal (unchanged from the original implementation).
  for v_item in
    select * from sales_return_items where sales_return_id = p_sr_id
  loop
    v_avg_cost := coalesce(
      (select avg_cost from inventory_stock where product_id = v_item.product_id),
      0
    );

    perform inventory_stock_in(
      v_item.product_id, v_item.quantity_base, v_avg_cost,
      v_item.unit_id, v_item.quantity,
      'sales_return', p_sr_id, v_sr.date
    );

    v_total_cost := v_total_cost + (v_item.quantity_base * v_avg_cost);
  end loop;

  if v_total_cost > 0 then
    v_journal_id := gen_random_uuid();

    insert into journals (
      id, journal_number, date, description, source,
      reference_type, reference_id, customer_id, is_posted, created_by
    ) values (
      v_journal_id, generate_number('JRN'), v_sr.date,
      'Retur Penjualan ' || v_sr.sr_number, 'auto',
      'sales_return', p_sr_id, v_sr.customer_id, true, v_sr.created_by
    );

    insert into journal_items (journal_id, coa_id, debit, description)
      values (
        v_journal_id, v_coa_persediaan, v_total_cost,
        'Persediaan masuk retur - ' || v_sr.sr_number
      );

    insert into journal_items (journal_id, coa_id, credit, description)
      values (
        v_journal_id, v_coa_hpp, v_total_cost,
        'Reversal HPP retur - ' || v_sr.sr_number
      );
  end if;

  -- AR reduction (only when this return is linked to an invoice).
  if v_sr.invoice_id is not null then
    select id into v_coa_piutang from coa where code = '1-13000';
    select id into v_coa_retur_penjualan from coa where code = '4-13000';
    select id into v_coa_ppn_out from coa where code = '2-12000';

    if v_coa_piutang is null or v_coa_retur_penjualan is null then
      raise exception 'COA piutang/retur penjualan tidak lengkap';
    end if;

    -- v_inv was already locked ("for update") earlier, right after the v_sr
    -- lock and before the qty re-validation loop — the row lock has been
    -- held continuously since then, so its columns are still current here;
    -- no need to re-select.

    v_outstanding := v_inv.total - v_inv.amount_paid - v_inv.advance_deduction_amount
                      - v_inv.credit_applied_amount - v_inv.return_credit_amount;
    v_return_credit := least(v_sr.total, greatest(v_outstanding, 0));
    v_excess := v_sr.total - v_return_credit;

    if abs(v_sr.total - (v_sr.subtotal + v_sr.tax_amount)) > 0.01 then
      raise exception 'retur tidak konsisten: total (%) tidak sama dengan subtotal + pajak (%)',
        v_sr.total, v_sr.subtotal + v_sr.tax_amount;
    end if;

    v_journal_id := gen_random_uuid();
    insert into journals (
      id, journal_number, date, description, source,
      reference_type, reference_id, customer_id, is_posted, created_by
    ) values (
      v_journal_id, generate_number('JRN'), v_sr.date,
      'Retur Penjualan (Piutang) ' || v_sr.sr_number, 'auto',
      'sales_return_ar', p_sr_id, v_sr.customer_id, true, v_sr.created_by
    );

    insert into journal_items (journal_id, coa_id, debit, description)
      values (v_journal_id, v_coa_retur_penjualan, v_sr.subtotal,
              'Retur Penjualan - ' || v_sr.sr_number);

    if v_sr.tax_amount > 0 then
      if v_coa_ppn_out is null then
        raise exception 'COA PPN Keluaran tidak ditemukan';
      end if;
      insert into journal_items (journal_id, coa_id, debit, description)
        values (v_journal_id, v_coa_ppn_out, v_sr.tax_amount,
                'PPN Keluaran reverse - ' || v_sr.sr_number);
    end if;

    insert into journal_items (journal_id, coa_id, credit, description)
      values (v_journal_id, v_coa_piutang, v_sr.total,
              'Piutang berkurang - ' || v_sr.sr_number);

    update sales_returns
       set return_credit_amount = v_return_credit,
           excess_credit_amount = v_excess
     where id = p_sr_id;

    update invoices
       set return_credit_amount = return_credit_amount + v_return_credit,
           status = case
             when amount_paid + advance_deduction_amount + credit_applied_amount
                    + return_credit_amount + v_return_credit >= total - 0.01
             then 'paid'
             else 'partial'
           end
     where id = v_sr.invoice_id;

    if v_excess > 0 then
      insert into credit_notes (party_type, party_id, source_type, source_id, amount, remaining, status)
        values ('customer', v_sr.customer_id, 'sales_return', p_sr_id, v_excess, v_excess, 'open');
    end if;
  end if;

  update sales_returns set status = 'posted' where id = p_sr_id;
end;
$$;

-- ------------------------------------------------------------
-- 6) Extend post_purchase_return: mirror of the post_sales_return change
--    above (supplier_id instead of customer_id, purchase_ prefix). Full
--    function body reproduced below with ONLY the one addition (marked)
--    plus one new declared variable (marked) — everything else is
--    byte-identical to migration 038 (including all its existing
--    comments, e.g. the "Deliberate SECOND credit to Persediaan" note).
-- ------------------------------------------------------------
create or replace function post_purchase_return(p_pr_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pr record;
  v_item record;
  v_avg_cost numeric;
  v_journal_id uuid;
  v_total_cost numeric := 0;
  v_coa_persediaan uuid;
  v_coa_hutang_gl uuid;
  v_coa_hutang uuid;
  v_coa_ppn_in uuid;
  v_coa_selisih uuid;
  v_inv record;
  v_outstanding numeric;
  v_return_credit numeric;
  v_excess numeric;
  v_returnable numeric;
  v_selisih numeric;
  v_prod_check record; -- NEW
begin
  perform _ensure_can_post();

  select * into v_pr from purchase_returns where id = p_pr_id for update;

  if v_pr is null then
    raise exception 'Purchase return tidak ditemukan';
  end if;

  if v_pr.status <> 'draft' then
    raise exception 'Purchase return sudah diposting';
  end if;

  perform _ensure_period_open(v_pr.date);

  select id into v_coa_persediaan from coa where code = '1-14000';
  select id into v_coa_hutang_gl from coa where code = '2-11100';

  if v_coa_persediaan is null or v_coa_hutang_gl is null then
    raise exception 'COA retur pembelian tidak lengkap';
  end if;

  -- Lock the linked invoice up front (before the qty re-validation loop and
  -- before the inventory-reversal loop) so that any two returns posted
  -- concurrently against the same invoice — whether or not they target the
  -- same line — fully serialize on this row lock. Locking it later (e.g.
  -- only inside the AP block) would let two concurrent posts both pass the
  -- qty check before either commits, over-consuming the returnable qty.
  if v_pr.invoice_id is not null then
    select * into v_inv from invoices where id = v_pr.invoice_id for update;
  end if;

  -- Re-validate qty under row lock (race-safe: two concurrent returns on
  -- the same invoice line cannot both slip through the save-time soft check).
  -- Ownership check first: confirm invoice_item_id actually belongs to this
  -- return's invoice_id before trusting it (defends against a tampered /
  -- foreign invoice_item_id submitted directly to the RPC).
  if v_pr.invoice_id is not null then
    for v_item in select * from purchase_return_items where purchase_return_id = p_pr_id loop
      if not exists (
        select 1 from invoice_items
         where id = v_item.invoice_item_id
           and invoice_id = v_pr.invoice_id
      ) then
        raise exception 'baris invoice tidak ditemukan pada invoice asal';
      end if;
      select purchase_returnable_qty(v_item.invoice_item_id) into v_returnable;
      if v_item.quantity_base > coalesce(v_returnable, 0) then
        raise exception 'qty retur item % melebihi sisa yang bisa diretur (%)',
          v_item.product_id, v_returnable;
      end if;
    end loop;
  end if;

  -- NEW: aggregate ledger cap + advisory lock (mirror of post_sales_return).
  for v_prod_check in
    select product_id, sum(quantity_base) as qty
      from purchase_return_items
     where purchase_return_id = p_pr_id
     group by product_id
  loop
    perform pg_advisory_xact_lock(
      hashtextextended(v_pr.supplier_id::text || ':' || v_prod_check.product_id::text, 0)
    );
    v_returnable := purchase_return_remaining_qty(v_pr.supplier_id, v_prod_check.product_id);
    if v_prod_check.qty > coalesce(v_returnable, 0) then
      raise exception 'Sisa retur untuk produk (id %) tinggal % unit, qty diminta % melebihi itu',
        v_prod_check.product_id, coalesce(v_returnable, 0), v_prod_check.qty;
    end if;
  end loop;

  -- Inventory reversal (unchanged from the original implementation).
  for v_item in
    select * from purchase_return_items where purchase_return_id = p_pr_id
  loop
    v_avg_cost := public.inventory_stock_out(
      v_item.product_id, v_item.quantity_base,
      v_item.unit_id, v_item.quantity,
      'purchase_return', p_pr_id, v_pr.date
    );

    v_total_cost := v_total_cost + (v_item.quantity_base * v_avg_cost);
  end loop;

  if v_total_cost > 0 then
    v_journal_id := gen_random_uuid();

    insert into journals (
      id, journal_number, date, description, source,
      reference_type, reference_id, supplier_id, is_posted, created_by
    ) values (
      v_journal_id, generate_number('JRN'), v_pr.date,
      'Retur Pembelian ' || v_pr.pr_number, 'auto',
      'purchase_return', p_pr_id, v_pr.supplier_id, true, v_pr.created_by
    );

    insert into journal_items (journal_id, coa_id, debit, description)
      values (
        v_journal_id, v_coa_hutang_gl, v_total_cost,
        'Hutang berkurang retur - ' || v_pr.pr_number
      );

    insert into journal_items (journal_id, coa_id, credit, description)
      values (
        v_journal_id, v_coa_persediaan, v_total_cost,
        'Persediaan keluar retur - ' || v_pr.pr_number
      );
  end if;

  -- AP reduction (only when this return is linked to an invoice).
  if v_pr.invoice_id is not null then
    select id into v_coa_hutang from coa where code = '2-11000';
    select id into v_coa_ppn_in from coa where code = '1-15000';
    select id into v_coa_selisih from coa where code = '5-19000';

    if v_coa_hutang is null or v_coa_selisih is null then
      raise exception 'COA hutang/selisih harga tidak lengkap';
    end if;

    -- v_inv was already locked ("for update") earlier, right after the COA
    -- checks and before the qty re-validation loop — the row lock has been
    -- held continuously since then, so its columns are still current here;
    -- no need to re-select.

    v_outstanding := v_inv.total - v_inv.amount_paid - v_inv.credit_applied_amount
                      - v_inv.return_credit_amount;
    v_return_credit := least(v_pr.total, greatest(v_outstanding, 0));
    v_excess := v_pr.total - v_return_credit;

    -- Guard against an unbalanced journal if purchase_returns.total doesn't
    -- equal subtotal + tax_amount (save_purchase_return recomputes
    -- subtotal/tax_amount from items but trusts client-sent total verbatim).
    if abs(v_pr.total - (v_pr.subtotal + v_pr.tax_amount)) > 0.01 then
      raise exception 'retur tidak konsisten: total (%) tidak sama dengan subtotal + pajak (%)',
        v_pr.total, v_pr.subtotal + v_pr.tax_amount;
    end if;

    v_journal_id := gen_random_uuid();
    insert into journals (
      id, journal_number, date, description, source,
      reference_type, reference_id, supplier_id, is_posted, created_by
    ) values (
      v_journal_id, generate_number('JRN'), v_pr.date,
      'Retur Pembelian (Hutang) ' || v_pr.pr_number, 'auto',
      'purchase_return_ap', p_pr_id, v_pr.supplier_id, true, v_pr.created_by
    );

    insert into journal_items (journal_id, coa_id, debit, description)
      values (v_journal_id, v_coa_hutang, v_pr.total,
              'Hutang usaha berkurang - ' || v_pr.pr_number);

    if v_pr.tax_amount > 0 then
      if v_coa_ppn_in is null then
        raise exception 'COA PPN Masukan tidak ditemukan';
      end if;
      insert into journal_items (journal_id, coa_id, credit, description)
        values (v_journal_id, v_coa_ppn_in, v_pr.tax_amount,
                'PPN Masukan reverse - ' || v_pr.pr_number);
    end if;

    -- Deliberate SECOND credit to Persediaan, not a duplicate of the one in
    -- the unconditional inventory-reversal journal above (~line 743). That
    -- earlier journal is a self-contained Hutang-Barang-Diterima <-> Persediaan
    -- entry that runs for every return regardless of invoice link (it's how
    -- stock actually moves). This journal is a separate, additional entry
    -- that exists only to record the AP-side effect for invoice-linked
    -- returns (Debit Hutang Usaha, matched by Credit Persediaan + Credit PPN
    -- Masukan + Selisih). Two independently-balanced journals — do not merge.
    insert into journal_items (journal_id, coa_id, credit, description)
      values (v_journal_id, v_coa_persediaan, v_total_cost,
              'Persediaan keluar (invoice-linked) - ' || v_pr.pr_number);

    -- Selisih antara harga invoice (subtotal) vs avg-cost inventory-out.
    -- A variance is expected: avg_cost is a moving average that drifts from
    -- the original invoiced unit price by the time the return is posted, so
    -- subtotal (invoice price) and v_total_cost (current avg-cost-based
    -- inventory value) don't line up.
    -- NOTE: this is the OPPOSITE debit/credit convention from the
    -- superficially-similar variance line in post_purchase_invoice
    -- (migration 016). There, Hutang-Barang-Diterima is debited and Hutang
    -- Usaha is credited, so a positive (subtotal > gr_total) variance is
    -- booked as a DEBIT to close the gap. Here the entry is a reversal:
    -- Hutang Usaha is debited (v_pr.total) and Persediaan is credited
    -- (v_total_cost), i.e. the two sides that carried the variance in the
    -- original entry have swapped sides. Copying the same debit-on-positive
    -- convention verbatim would double the imbalance instead of closing it
    -- (e.g. subtotal=100, tax=10, total_cost=80 => selisih=+20: debit
    -- would give debit=130/credit=90, a 40 gap). Crediting on positive
    -- variance and debiting on negative variance is what actually balances
    -- this journal (same example => debit=110/credit=110).
    v_selisih := v_pr.subtotal - v_total_cost;
    if v_selisih > 0 then
      insert into journal_items (journal_id, coa_id, credit, description)
        values (v_journal_id, v_coa_selisih, v_selisih, 'Selisih harga retur - ' || v_pr.pr_number);
    elsif v_selisih < 0 then
      insert into journal_items (journal_id, coa_id, debit, description)
        values (v_journal_id, v_coa_selisih, abs(v_selisih), 'Selisih harga retur - ' || v_pr.pr_number);
    end if;

    update purchase_returns
       set return_credit_amount = v_return_credit,
           excess_credit_amount = v_excess
     where id = p_pr_id;

    update invoices
       set return_credit_amount = return_credit_amount + v_return_credit,
           status = case
             when amount_paid + credit_applied_amount + return_credit_amount
                    + v_return_credit >= total - 0.01
             then 'paid'
             else 'partial'
           end
     where id = v_pr.invoice_id;

    if v_excess > 0 then
      insert into credit_notes (party_type, party_id, source_type, source_id, amount, remaining, status)
        values ('supplier', v_pr.supplier_id, 'purchase_return', p_pr_id, v_excess, v_excess, 'open');
    end if;
  end if;

  update purchase_returns set status = 'posted' where id = p_pr_id;
end;
$$;
```

- [ ] **Step 2: Apply the migration to a non-production Supabase branch/local instance first**

If the project has a Supabase CLI workflow available (`supabase db push` against a local/dev database, or a Supabase branch), apply there first. **Do not apply directly to the `ERP-MG` production project without the user's explicit confirmation** — this project has no separate staging Supabase instance today, only `ERP-MG` (production, active) and `erp-acc-control` (inactive). Flag this to the user rather than deciding unilaterally.

- [ ] **Step 3: Verify the migration applies cleanly**

Run the migration file against the target database and confirm no errors (all 6 `create or replace function` statements succeed, no syntax errors).

- [ ] **Step 4: Commit**

```bash
git add apps/erp-acc/erp-app/supabase/migrations/042_double_retur_prevention.sql
git commit -m "feat(erp-acc): add aggregate ledger to prevent double-retur across invoice/GD/GR paths"
```

---

## Task 2: Service Layer — Picker Query Functions

**Files:**
- Modify: `apps/erp-acc/erp-app/src/services/salesReturnService.js`
- Modify: `apps/erp-acc/erp-app/src/services/purchaseReturnService.js`

**Interfaces:**
- Consumes: RPCs `get_customer_returnable_products(p_customer_id)` / `get_supplier_returnable_products(p_supplier_id)` from Task 1.
- Produces: `getCustomerReturnableProducts(customerId)` / `getSupplierReturnableProducts(supplierId)` — each returns an array of `{ product_id, product_name, sku, unit_id, unit_name, unit_price, remaining }`. Consumed by Task 4/5.

- [ ] **Step 1: Add to `src/services/salesReturnService.js`, right after the existing `getReturnableSalesInvoiceItems` function (before `saveSalesReturn`)**

```js
// Products this customer has ever received via a posted Goods Delivery (or
// invoice), with remaining returnable qty already netted against all posted
// returns for that customer+product combo (any path — see
// docs/superpowers/specs/2026-07-14-double-retur-prevention-design.md).
// Used by the "tanpa invoice (retur stok saja)" form path.
export async function getCustomerReturnableProducts(customerId) {
  const { data, error } = await supabase.rpc('get_customer_returnable_products', {
    p_customer_id: customerId,
  })
  if (error) throw error
  return data
}
```

- [ ] **Step 2: Add to `src/services/purchaseReturnService.js`, right after the existing `getReturnablePurchaseInvoiceItems` function (before `savePurchaseReturn`)**

```js
// Mirror of getCustomerReturnableProducts for the purchase side.
export async function getSupplierReturnableProducts(supplierId) {
  const { data, error } = await supabase.rpc('get_supplier_returnable_products', {
    p_supplier_id: supplierId,
  })
  if (error) throw error
  return data
}
```

- [ ] **Step 3: Verify build**

```bash
cd apps/erp-acc/erp-app
npm run build
```
Expected: `✓ built in X.Xs` with no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/erp-acc/erp-app/src/services/salesReturnService.js apps/erp-acc/erp-app/src/services/purchaseReturnService.js
git commit -m "feat(erp-acc): add returnable-products queries to return services"
```

---

## Task 3: New Component — `PartyReturnableProductsPicker`

**Files:**
- Create: `apps/erp-acc/erp-app/src/components/shared/PartyReturnableProductsPicker.jsx`

**Interfaces:**
- Consumes: `returnableProducts` array shaped `{ product_id, product_name, sku, unit_id, unit_name, unit_price, remaining }` (from Task 2's service functions), `items` array (return line items, same shape `saveSalesReturn`/`savePurchaseReturn` expect), `onItemsChange(items)`.
- Produces: a table UI identical in structure to `InvoiceReturnItemsPicker.jsx` but keyed by `product_id` instead of `invoice_item_id`, with qty capped to `row.remaining`. Consumed by Task 4/5.

- [ ] **Step 1: Create the file with the following complete content**

```jsx
import { formatCurrency } from '../../utils/currency'

// Renders one row per returnable product for a customer/supplier on the
// "tanpa invoice (retur stok saja)" form path. `returnableProducts` comes
// from getCustomerReturnableProducts/getSupplierReturnableProducts (each row
// has product_id, product_name, sku, unit_id, unit_name, unit_price,
// remaining). `items` is the current return's line array (same shape
// saveSalesReturn/savePurchaseReturn expects). Mirrors
// InvoiceReturnItemsPicker.jsx but keyed by product_id instead of
// invoice_item_id, and capped against `remaining` instead of `returnable`.
export default function PartyReturnableProductsPicker({
  returnableProducts = [],
  items,
  onItemsChange,
  showTax = true,
  isTaxable = () => false,
  taxRate = () => 11,
  readOnly = false,
}) {
  const rowFor = (productId) => items.find(i => i.product_id === productId)

  function setQty(row, qty) {
    const capped = Math.min(Math.max(Number(qty) || 0, 0), Number(row.remaining))
    const existing = rowFor(row.product_id)

    if (capped <= 0) {
      onItemsChange(items.filter(i => i.product_id !== row.product_id))
      return
    }

    const subtotal = capped * Number(row.unit_price)
    const taxable = isTaxable(row.product_id)
    const tax_amount = taxable ? subtotal * (taxRate(row.product_id) / 100) : 0
    const nextRow = {
      product_id: row.product_id,
      unit_id: row.unit_id,
      quantity: capped,
      quantity_base: capped,
      unit_price: Number(row.unit_price),
      tax_amount,
      total: subtotal + tax_amount,
    }

    if (existing) {
      onItemsChange(items.map(i => i.product_id === row.product_id ? nextRow : i))
    } else {
      onItemsChange([...items, nextRow])
    }
  }

  const cellStyle = { padding: '8px 16px', fontSize: 13 }
  const subtotal = items.reduce((s, i) => s + Number(i.unit_price) * Number(i.quantity), 0)
  const totalTax = items.reduce((s, i) => s + Number(i.tax_amount), 0)

  return (
    <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
        <thead style={{ background: '#f3f4f6', borderBottom: '1px solid #e5e7eb' }}>
          <tr>
            <th style={{ ...cellStyle, textAlign: 'left' }}>Produk</th>
            <th style={{ ...cellStyle, textAlign: 'left' }}>Satuan</th>
            <th style={{ ...cellStyle, textAlign: 'right' }}>Sisa Bisa Diretur</th>
            <th style={{ ...cellStyle, textAlign: 'right' }}>Qty Retur</th>
            <th style={{ ...cellStyle, textAlign: 'right' }}>Harga</th>
            {showTax && <th style={{ ...cellStyle, textAlign: 'right' }}>Pajak</th>}
            <th style={{ ...cellStyle, textAlign: 'right' }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {returnableProducts.length === 0 && (
            <tr>
              <td colSpan={showTax ? 7 : 6} style={{ ...cellStyle, textAlign: 'center', color: '#9ca3af', padding: '24px 16px' }}>
                Tidak ada produk yang bisa diretur untuk party ini.
              </td>
            </tr>
          )}
          {returnableProducts.map(row => {
            const current = rowFor(row.product_id)
            return (
              <tr key={row.product_id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={cellStyle}>{row.product_name}{row.sku ? ` (${row.sku})` : ''}</td>
                <td style={cellStyle}>{row.unit_name}</td>
                <td style={{ ...cellStyle, textAlign: 'right' }}>{row.remaining}</td>
                <td style={{ ...cellStyle, textAlign: 'right' }}>
                  {readOnly ? (
                    <span>{current?.quantity || 0}</span>
                  ) : (
                    <input
                      type="number"
                      min="0"
                      max={row.remaining}
                      step="any"
                      style={{ width: 90, textAlign: 'right', border: '1px solid #d9d9d9', borderRadius: 4, padding: '2px 8px' }}
                      value={current?.quantity ?? ''}
                      disabled={Number(row.remaining) <= 0}
                      onChange={e => setQty(row, e.target.value)}
                    />
                  )}
                </td>
                <td style={{ ...cellStyle, textAlign: 'right' }}>{formatCurrency(row.unit_price)}</td>
                {showTax && (
                  <td style={{ ...cellStyle, textAlign: 'right', color: '#4b5563' }}>
                    {formatCurrency(current?.tax_amount || 0)}
                  </td>
                )}
                <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 500 }}>
                  {formatCurrency(current?.total || 0)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {items.length > 0 && (
        <div style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13 }}>
          <div>Subtotal: {formatCurrency(subtotal)}</div>
          {showTax && totalTax > 0 && <div>Pajak: {formatCurrency(totalTax)}</div>}
          <div style={{ fontWeight: 700 }}>Total: {formatCurrency(subtotal + totalTax)}</div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
cd apps/erp-acc/erp-app
npm run build
```
Expected: `✓ built in X.Xs` with no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/erp-acc/erp-app/src/components/shared/PartyReturnableProductsPicker.jsx
git commit -m "feat(erp-acc): add PartyReturnableProductsPicker component"
```

---

## Task 4: Wire Picker into `SalesReturnFormPage.jsx`

**Files:**
- Modify: `apps/erp-acc/erp-app/src/pages/sales/SalesReturnFormPage.jsx`

**Interfaces:**
- Consumes: `getCustomerReturnableProducts` (Task 2), `PartyReturnableProductsPicker` (Task 3).

- [ ] **Step 1: Change the import block at the top of the file**

Find:
```jsx
import {
  getSalesReturn, saveSalesReturn, postSalesReturn,
  getReturnableSalesInvoices, getReturnableSalesInvoiceItems,
} from '../../services/salesReturnService'
import { getGoodsDelivery, getSalesInvoice } from '../../services/salesService'
import { getWarehouses, getDefaultWarehouse } from '../../services/warehouseService'
import { today } from '../../utils/date'
import Button from '../../components/ui/Button'
import Select from '../../components/ui/Select'
import DocumentHeader from '../../components/shared/DocumentHeader'
import LineItemsTable from '../../components/shared/LineItemsTable'
import InvoiceReturnItemsPicker from '../../components/shared/InvoiceReturnItemsPicker'
```

Replace with:
```jsx
import {
  getSalesReturn, saveSalesReturn, postSalesReturn,
  getReturnableSalesInvoices, getReturnableSalesInvoiceItems,
  getCustomerReturnableProducts,
} from '../../services/salesReturnService'
import { getGoodsDelivery, getSalesInvoice } from '../../services/salesService'
import { getWarehouses, getDefaultWarehouse } from '../../services/warehouseService'
import { today } from '../../utils/date'
import Button from '../../components/ui/Button'
import Select from '../../components/ui/Select'
import DocumentHeader from '../../components/shared/DocumentHeader'
import InvoiceReturnItemsPicker from '../../components/shared/InvoiceReturnItemsPicker'
import PartyReturnableProductsPicker from '../../components/shared/PartyReturnableProductsPicker'
```

(Note: `LineItemsTable` import is removed — it's no longer used anywhere in this file after this task.)

- [ ] **Step 2: Change the items initial state**

Find:
```jsx
  const [items, setItems] = useState([LineItemsTable.emptyRow()])
  const [warehouses, setWarehouses] = useState([])
  const [invoiceOptionsList, setInvoiceOptionsList] = useState([])
  const [returnableItems, setReturnableItems] = useState([])
```

Replace with:
```jsx
  const [items, setItems] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [invoiceOptionsList, setInvoiceOptionsList] = useState([])
  const [returnableItems, setReturnableItems] = useState([])
  const [returnableProducts, setReturnableProducts] = useState([])
```

- [ ] **Step 3: Add a new effect to load returnable products for the no-invoice path**

Find (the effect that loads returnable invoice line items):
```jsx
  // Load the selected invoice's returnable lines. Switching invoice clears
  // any items already picked (they belonged to the previous invoice).
  useEffect(() => {
    let cancelled = false
    if (!header.invoice_id) { setReturnableItems([]); return }
    getReturnableSalesInvoiceItems(header.invoice_id)
      .then(list => { if (!cancelled) setReturnableItems(list) })
      .catch(err => toastRef.current.error(err.message))
    return () => { cancelled = true }
  }, [header.invoice_id])
```

Add right after it:
```jsx
  // Returnable products for the "tanpa invoice (retur stok saja)" path —
  // only loaded/shown when no invoice is linked. Ledger comes from
  // sales_return_remaining_qty (see
  // docs/superpowers/specs/2026-07-14-double-retur-prevention-design.md).
  useEffect(() => {
    let cancelled = false
    if (!header.customer_id || header.invoice_id) { setReturnableProducts([]); return }
    getCustomerReturnableProducts(header.customer_id)
      .then(list => { if (!cancelled) setReturnableProducts(list) })
      .catch(err => toastRef.current.error(err.message))
    return () => { cancelled = true }
  }, [header.customer_id, header.invoice_id])

  // Clamp any pre-filled items (e.g. from the GD-prefill effect below) to
  // the current returnable-qty ledger once it loads — prevents the GD
  // shortcut from pre-filling more than what's actually still returnable.
  useEffect(() => {
    if (header.invoice_id) return
    if (returnableProducts.length === 0) return
    setItems(prev => prev
      .map(i => {
        const match = returnableProducts.find(r => r.product_id === i.product_id)
        if (!match) return null
        const originalQty = Number(i.quantity) || 0
        const qty = Math.min(originalQty, Number(match.remaining))
        if (qty <= 0) return null
        const ratio = originalQty > 0 ? qty / originalQty : 0
        return {
          ...i,
          quantity: qty,
          quantity_base: qty,
          tax_amount: Number(i.tax_amount || 0) * ratio,
          total: qty * Number(i.unit_price) + Number(i.tax_amount || 0) * ratio,
        }
      })
      .filter(Boolean))
  }, [returnableProducts]) // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 4: Replace the item picker render branch**

Find:
```jsx
        {header.invoice_id ? (
          <InvoiceReturnItemsPicker
            returnableItems={returnableItems}
            items={items}
            onItemsChange={setItems}
            readOnly={readOnly}
            showTax
            isTaxable={pid => products.find(p => p.id === pid)?.is_taxable}
            taxRate={pid => products.find(p => p.id === pid)?.tax_rate || 11}
          />
        ) : (
          <LineItemsTable
            items={items}
            onItemsChange={setItems}
            products={products}
            priceField="sell_price"
            readOnly={readOnly}
            showTax
          />
        )}
```

Replace with:
```jsx
        {header.invoice_id ? (
          <InvoiceReturnItemsPicker
            returnableItems={returnableItems}
            items={items}
            onItemsChange={setItems}
            readOnly={readOnly}
            showTax
            isTaxable={pid => products.find(p => p.id === pid)?.is_taxable}
            taxRate={pid => products.find(p => p.id === pid)?.tax_rate || 11}
          />
        ) : (
          <PartyReturnableProductsPicker
            returnableProducts={returnableProducts}
            items={items}
            onItemsChange={setItems}
            readOnly={readOnly}
            showTax
            isTaxable={pid => products.find(p => p.id === pid)?.is_taxable}
            taxRate={pid => products.find(p => p.id === pid)?.tax_rate || 11}
          />
        )}
```

- [ ] **Step 5: Verify build**

```bash
cd apps/erp-acc/erp-app
npm run build
```
Expected: `✓ built in X.Xs` with no errors. If it fails with "LineItemsTable is not defined" or similar, confirm Step 1 fully removed the import and no other reference to `LineItemsTable` remains in this file.

- [ ] **Step 6: Commit**

```bash
git add apps/erp-acc/erp-app/src/pages/sales/SalesReturnFormPage.jsx
git commit -m "feat(erp-acc): cap no-invoice sales return qty to returnable-products ledger"
```

---

## Task 5: Wire Picker into `PurchaseReturnFormPage.jsx`

**Files:**
- Modify: `apps/erp-acc/erp-app/src/pages/purchase/PurchaseReturnFormPage.jsx`

**Interfaces:**
- Consumes: `getSupplierReturnableProducts` (Task 2), `PartyReturnableProductsPicker` (Task 3).

- [ ] **Step 1: Change the import block at the top of the file**

Find:
```jsx
import {
  getPurchaseReturn, savePurchaseReturn, postPurchaseReturn,
  getReturnablePurchaseInvoices, getReturnablePurchaseInvoiceItems,
} from '../../services/purchaseReturnService'
import { getGoodsReceipt, getPurchaseInvoice } from '../../services/purchaseService'
import { getWarehouses, getDefaultWarehouse } from '../../services/warehouseService'
import { today } from '../../utils/date'
import Button from '../../components/ui/Button'
import Select from '../../components/ui/Select'
import DocumentHeader from '../../components/shared/DocumentHeader'
import LineItemsTable from '../../components/shared/LineItemsTable'
import InvoiceReturnItemsPicker from '../../components/shared/InvoiceReturnItemsPicker'
```

Replace with:
```jsx
import {
  getPurchaseReturn, savePurchaseReturn, postPurchaseReturn,
  getReturnablePurchaseInvoices, getReturnablePurchaseInvoiceItems,
  getSupplierReturnableProducts,
} from '../../services/purchaseReturnService'
import { getGoodsReceipt, getPurchaseInvoice } from '../../services/purchaseService'
import { getWarehouses, getDefaultWarehouse } from '../../services/warehouseService'
import { today } from '../../utils/date'
import Button from '../../components/ui/Button'
import Select from '../../components/ui/Select'
import DocumentHeader from '../../components/shared/DocumentHeader'
import InvoiceReturnItemsPicker from '../../components/shared/InvoiceReturnItemsPicker'
import PartyReturnableProductsPicker from '../../components/shared/PartyReturnableProductsPicker'
```

- [ ] **Step 2: Change the items initial state**

Find:
```jsx
  const [items, setItems] = useState([LineItemsTable.emptyRow()])
  const [warehouses, setWarehouses] = useState([])
  const [invoiceOptionsList, setInvoiceOptionsList] = useState([])
  const [returnableItems, setReturnableItems] = useState([])
```

Replace with:
```jsx
  const [items, setItems] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [invoiceOptionsList, setInvoiceOptionsList] = useState([])
  const [returnableItems, setReturnableItems] = useState([])
  const [returnableProducts, setReturnableProducts] = useState([])
```

- [ ] **Step 3: Add a new effect to load returnable products for the no-invoice path**

Find:
```jsx
  // Load the selected invoice's returnable lines. Switching invoice clears
  // any items already picked (they belonged to the previous invoice).
  useEffect(() => {
    let cancelled = false
    if (!header.invoice_id) { setReturnableItems([]); return }
    getReturnablePurchaseInvoiceItems(header.invoice_id)
      .then(list => { if (!cancelled) setReturnableItems(list) })
      .catch(err => toastRef.current.error(err.message))
    return () => { cancelled = true }
  }, [header.invoice_id])
```

Add right after it:
```jsx
  // Returnable products for the "tanpa invoice (retur stok saja)" path —
  // only loaded/shown when no invoice is linked. Ledger comes from
  // purchase_return_remaining_qty (see
  // docs/superpowers/specs/2026-07-14-double-retur-prevention-design.md).
  useEffect(() => {
    let cancelled = false
    if (!header.supplier_id || header.invoice_id) { setReturnableProducts([]); return }
    getSupplierReturnableProducts(header.supplier_id)
      .then(list => { if (!cancelled) setReturnableProducts(list) })
      .catch(err => toastRef.current.error(err.message))
    return () => { cancelled = true }
  }, [header.supplier_id, header.invoice_id])

  // Clamp any pre-filled items (e.g. from the GR-prefill effect below) to
  // the current returnable-qty ledger once it loads — prevents the GR
  // shortcut from pre-filling more than what's actually still returnable.
  useEffect(() => {
    if (header.invoice_id) return
    if (returnableProducts.length === 0) return
    setItems(prev => prev
      .map(i => {
        const match = returnableProducts.find(r => r.product_id === i.product_id)
        if (!match) return null
        const originalQty = Number(i.quantity) || 0
        const qty = Math.min(originalQty, Number(match.remaining))
        if (qty <= 0) return null
        const ratio = originalQty > 0 ? qty / originalQty : 0
        return {
          ...i,
          quantity: qty,
          quantity_base: qty,
          tax_amount: Number(i.tax_amount || 0) * ratio,
          total: qty * Number(i.unit_price) + Number(i.tax_amount || 0) * ratio,
        }
      })
      .filter(Boolean))
  }, [returnableProducts]) // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 4: Replace the item picker render branch**

Find:
```jsx
        {header.invoice_id ? (
          <InvoiceReturnItemsPicker
            returnableItems={returnableItems}
            items={items}
            onItemsChange={setItems}
            readOnly={readOnly}
            showTax
            isTaxable={pid => products.find(p => p.id === pid)?.is_taxable}
            taxRate={pid => products.find(p => p.id === pid)?.tax_rate || 11}
          />
        ) : (
          <LineItemsTable
            items={items}
            onItemsChange={setItems}
            products={products}
            priceField="buy_price"
            readOnly={readOnly}
            showTax
          />
        )}
```

Replace with:
```jsx
        {header.invoice_id ? (
          <InvoiceReturnItemsPicker
            returnableItems={returnableItems}
            items={items}
            onItemsChange={setItems}
            readOnly={readOnly}
            showTax
            isTaxable={pid => products.find(p => p.id === pid)?.is_taxable}
            taxRate={pid => products.find(p => p.id === pid)?.tax_rate || 11}
          />
        ) : (
          <PartyReturnableProductsPicker
            returnableProducts={returnableProducts}
            items={items}
            onItemsChange={setItems}
            readOnly={readOnly}
            showTax
            isTaxable={pid => products.find(p => p.id === pid)?.is_taxable}
            taxRate={pid => products.find(p => p.id === pid)?.tax_rate || 11}
          />
        )}
```

- [ ] **Step 5: Verify build**

```bash
cd apps/erp-acc/erp-app
npm run build
```
Expected: `✓ built in X.Xs` with no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/erp-acc/erp-app/src/pages/purchase/PurchaseReturnFormPage.jsx
git commit -m "feat(erp-acc): cap no-invoice purchase return qty to returnable-products ledger"
```

---

## Task 6: Smoke Test + Final Build Verification

**Files:** none (verification only).

- [ ] **Step 1: Manual SQL smoke test (run against the same non-production branch/instance from Task 1, Step 2)**

First, pick a real customer + product pairing with no prior returns to use as `<customer_id>`/`<product_id>` in the blocks below:

```sql
-- Any customer+product pair with zero rows in sales_return_items today is
-- safe to use as a clean starting point.
select c.id as customer_id, p.id as product_id, c.name, p.name
  from customers c
  cross join products p
 where not exists (
         select 1 from sales_return_items sri
           join sales_returns sr on sr.id = sri.sales_return_id
          where sr.customer_id = c.id and sri.product_id = p.id
       )
   and exists (
         select 1 from goods_delivery_items gdi
           join goods_deliveries gd on gd.id = gdi.goods_delivery_id
          where gd.customer_id = c.id and gdi.product_id = p.id and gd.status = 'posted'
       )
 limit 1;
```

Run each block in order, checking the noted expectation before proceeding to the next:

```sql
-- Substitute the customer_id/product_id found above into <customer_id>/
-- <product_id> below.

-- 1. Confirm ledger reads 0 before any delivery exists for a fresh pairing.
select sales_return_remaining_qty('<customer_id>', '<product_id>');
-- Expect: 0

-- 2. Create + post a Goods Delivery of 100 base units of <product_id> to
--    <customer_id> via the app UI (or save_goods_delivery/post_goods_delivery
--    RPCs directly), then re-check:
select sales_return_remaining_qty('<customer_id>', '<product_id>');
-- Expect: 100

-- 3. Create a Sales Return with NO invoice_id, 40 units of <product_id>, via
--    save_sales_return then post_sales_return. Re-check:
select sales_return_remaining_qty('<customer_id>', '<product_id>');
-- Expect: 60

-- 4. Attempt a second no-invoice Sales Return for exactly 60 units (the
--    remaining amount) — should succeed. Re-check:
select sales_return_remaining_qty('<customer_id>', '<product_id>');
-- Expect: 0

-- 5. Attempt a third no-invoice Sales Return for 1 unit — must be REJECTED
--    both at save_sales_return (save time) and, if step 5 is skipped, at
--    post_sales_return (post time). Expect an exception mentioning "Sisa
--    retur untuk produk".

-- 6. Repeat steps 1-5 for the purchase side using
--    purchase_return_remaining_qty / a Goods Receipt / save_purchase_return
--    / post_purchase_return with a fresh supplier+product pairing.
```

- [ ] **Step 2: Cross-path regression check (the exact scenario this migration closes)**

```sql
-- Using a FRESH customer+product pairing with 50 units delivered via GD:
-- a) Post a no-invoice Sales Return for 50 units (full amount). Ledger -> 0.
-- b) Create a Sales Invoice for the same customer+product (any qty <= 50,
--    e.g. 50 units), post it, then attempt an invoice-linked Sales Return
--    for those same 50 units.
-- Expect: step (b)'s return is REJECTED at save_sales_return with "Sisa
-- retur untuk produk ... melebihi itu" -- proving the two paths now share
-- one ledger instead of allowing the same physical qty to be returned twice.
```

- [ ] **Step 3: Final build verification**

```bash
cd apps/erp-acc/erp-app
npm run build
```
Expected: `✓ built in X.Xs` with zero errors or warnings related to the changed files.

- [ ] **Step 4: Report results to the user**

Summarize: which smoke-test steps passed, any unexpected results, and confirm the build is green. Do not mark the feature complete if any smoke-test step in Step 1 or Step 2 did not match its expected outcome — report the discrepancy instead.
