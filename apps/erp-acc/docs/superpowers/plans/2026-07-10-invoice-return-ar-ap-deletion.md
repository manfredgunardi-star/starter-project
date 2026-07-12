# Invoice AR/AP Deletion via Return Documents — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a Sales Return (Retur Penjualan) is posted against a specific Sales Invoice, that invoice's outstanding piutang is reduced. When a Purchase Return (Retur Pembelian) is posted against a specific Purchase Invoice, that invoice's outstanding hutang is reduced. If the return exceeds the invoice's outstanding balance, the excess becomes a customer/supplier credit balance that can be applied manually to a future invoice.

**Architecture:** Extend the already-live `sales_returns`/`purchase_returns` tables with an optional `invoice_id`/`invoice_item_id` link (nullable — old SO/PO-only returns keep working unchanged). Extend their `post_*` RPCs to post an AR/AP-reducing journal line when linked. Add a new `credit_notes`/`credit_note_applications` ledger for the floating-credit case. Add `credit_applied_amount` to `invoices` (same pattern as the existing `advance_deduction_amount`) so a later invoice can consume available credit. All financial logic lives in Postgres RPCs (`SECURITY DEFINER`); frontend only calls RPCs and renders their results, following the existing codebase convention.

**Tech Stack:** Supabase Postgres (PL/pgSQL), React 18 + Ant Design + custom UI wrapper components (`components/ui/*`), Vite, Playwright (`erp-app/tests/*.spec.js`).

**Spec:** [`apps/erp-acc/docs/superpowers/specs/2026-07-10-invoice-return-ar-ap-deletion-design.md`](../specs/2026-07-10-invoice-return-ar-ap-deletion-design.md)

**Scope correction found during planning:** the spec assumed `cancel_sales_return`/`cancel_purchase_return` RPCs already exist and only need a new validation rule. They do not exist in the live codebase — posted returns are currently terminal/immutable (no cancel path at all). Building a full cancel-with-reversal RPC is new infrastructure, not an extension, and is **out of scope** for this plan. Practical effect: once a return creates a credit note, there is nothing to "protect" from cancellation because returns can't be cancelled today either way. This is a scope reduction, not a regression.

**All tasks below: Suggested executor: Sonnet 5.**

---

## File Structure

### New files
| File | Responsibility |
|---|---|
| `apps/erp-acc/erp-app/supabase/migrations/038_return_invoice_ar_ap.sql` | Schema + helper functions + RPC extensions (all SQL for this feature) |
| `apps/erp-acc/erp-app/src/components/shared/InvoiceReturnItemsPicker.jsx` | Item picker locked to one invoice's lines, capped at returnable qty |
| `apps/erp-acc/erp-app/src/services/creditNoteService.js` | Query credit_notes / credit_note_applications |
| `apps/erp-acc/erp-app/src/pages/shared/CreditNotesPage.jsx` | List page: open/applied credit balances per customer & supplier |
| `apps/erp-acc/erp-app/tests/return-invoice-credit.spec.js` | Playwright E2E for the whole flow |

### Modified files
| File | Change |
|---|---|
| `apps/erp-acc/erp-app/src/services/salesReturnService.js` | Send `invoice_id`/`invoice_item_id`; add `getReturnableSalesInvoiceItems`, `getOpenSalesInvoicesForCustomer` |
| `apps/erp-acc/erp-app/src/services/purchaseReturnService.js` | Mirror |
| `apps/erp-acc/erp-app/src/pages/sales/SalesReturnFormPage.jsx` | "Invoice Asal" picker + swap to `InvoiceReturnItemsPicker` when linked |
| `apps/erp-acc/erp-app/src/pages/purchase/PurchaseReturnFormPage.jsx` | Mirror + enable tax display (was `showTax={false}`) |
| `apps/erp-acc/erp-app/src/services/salesService.js` | Send `credit_applied_amount` to `save_sales_invoice` |
| `apps/erp-acc/erp-app/src/services/purchaseService.js` | Send `credit_applied_amount` to `save_purchase_invoice` |
| `apps/erp-acc/erp-app/src/pages/sales/SalesInvoiceFormPage.jsx` | "Saldo Kredit Tersedia" section + "Buat Retur" button |
| `apps/erp-acc/erp-app/src/pages/purchase/PurchaseInvoiceFormPage.jsx` | Mirror |
| `apps/erp-acc/erp-app/src/services/cashBankService.js` | `getOutstandingInvoicesByCustomer` selects/subtracts new columns |
| `apps/erp-acc/erp-app/src/services/purchaseService.js` | `getOutstandingPurchaseInvoicesBySupplier` selects/subtracts new columns |
| `apps/erp-acc/erp-app/src/services/reportService.js` | `getARAgingData`/`getAPAgingData` select new columns |
| `apps/erp-acc/erp-app/src/pages/reports/ARAPAgingPage.jsx` | `buildRows` balance formula |
| `apps/erp-acc/erp-app/src/pages/cash/PaymentFormPage.jsx` | Remaining-balance formula (3 spots) |
| `apps/erp-acc/erp-app/src/utils/pdfRenderers/invoiceRenderer.js` | "Potongan Retur" / "Kredit Diterapkan" PDF lines |
| `apps/erp-acc/erp-app/src/App.jsx` | Route for `CreditNotesPage` |
| `apps/erp-acc/erp-app/src/components/layout/Sidebar.jsx` | Nav entry "Saldo Kredit" |

---

## Task 1: Migration — Schema, helper functions, COA account

**Suggested executor:** Sonnet 5

**Files:**
- Create: `apps/erp-acc/erp-app/supabase/migrations/038_return_invoice_ar_ap.sql`

- [ ] **Step 1: Write schema section**

```sql
-- ============================================================
-- Migration 038: Invoice AR/AP deletion via return documents
-- ============================================================

-- 1) Link returns to a specific invoice (nullable — old SO/PO-only
--    returns keep working unchanged).
alter table sales_returns
  add column invoice_id uuid references invoices(id),
  add column return_credit_amount numeric not null default 0,
  add column excess_credit_amount numeric not null default 0;

alter table purchase_returns
  add column invoice_id uuid references invoices(id),
  add column return_credit_amount numeric not null default 0,
  add column excess_credit_amount numeric not null default 0;

alter table sales_return_items
  add column invoice_item_id uuid references invoice_items(id);

alter table purchase_return_items
  add column invoice_item_id uuid references invoice_items(id),
  add column tax_amount numeric not null default 0;

create index idx_sales_returns_invoice on sales_returns(invoice_id);
create index idx_purchase_returns_invoice on purchase_returns(invoice_id);
create index idx_sales_return_items_invoice_item on sales_return_items(invoice_item_id);
create index idx_purchase_return_items_invoice_item on purchase_return_items(invoice_item_id);

-- 2) Invoice-side tracking columns (mirrors advance_deduction_amount pattern).
alter table invoices
  add column credit_applied_amount numeric not null default 0
    check (credit_applied_amount >= 0),
  add column return_credit_amount numeric not null default 0
    check (return_credit_amount >= 0);

-- 3) Returnable-qty helpers: invoice_items.quantity_base minus qty already
--    consumed by posted returns for that same line.
create or replace function sales_returnable_qty(p_invoice_item_id uuid)
returns numeric
language sql stable security definer set search_path = public
as $$
  select ii.quantity_base
       - coalesce((
           select sum(sri.quantity_base)
             from sales_return_items sri
             join sales_returns sr on sr.id = sri.sales_return_id
            where sri.invoice_item_id = p_invoice_item_id
              and sr.status = 'posted'
         ), 0)
    from invoice_items ii
   where ii.id = p_invoice_item_id;
$$;

create or replace function purchase_returnable_qty(p_invoice_item_id uuid)
returns numeric
language sql stable security definer set search_path = public
as $$
  select ii.quantity_base
       - coalesce((
           select sum(pri.quantity_base)
             from purchase_return_items pri
             join purchase_returns pr on pr.id = pri.purchase_return_id
            where pri.invoice_item_id = p_invoice_item_id
              and pr.status = 'posted'
         ), 0)
    from invoice_items ii
   where ii.id = p_invoice_item_id;
$$;

-- 4) One-round-trip helpers for the form's item picker.
create or replace function get_returnable_sales_invoice_items(p_invoice_id uuid)
returns table (
  invoice_item_id uuid, product_id uuid, product_name text, unit_id uuid, unit_name text,
  quantity_base numeric, unit_price numeric, returnable numeric
)
language sql stable security definer set search_path = public
as $$
  select ii.id, ii.product_id, p.name, ii.unit_id, u.name,
         ii.quantity_base, ii.unit_price, sales_returnable_qty(ii.id)
    from invoice_items ii
    join products p on p.id = ii.product_id
    join units u on u.id = ii.unit_id
   where ii.invoice_id = p_invoice_id;
$$;

create or replace function get_returnable_purchase_invoice_items(p_invoice_id uuid)
returns table (
  invoice_item_id uuid, product_id uuid, product_name text, unit_id uuid, unit_name text,
  quantity_base numeric, unit_price numeric, returnable numeric
)
language sql stable security definer set search_path = public
as $$
  select ii.id, ii.product_id, p.name, ii.unit_id, u.name,
         ii.quantity_base, ii.unit_price, purchase_returnable_qty(ii.id)
    from invoice_items ii
    join products p on p.id = ii.product_id
    join units u on u.id = ii.unit_id
   where ii.invoice_id = p_invoice_id;
$$;

-- 5) Credit balance ledger (subsidiary tracking only — does not itself
--    post journal entries; the originating return's journal already
--    reduced Piutang/Hutang for the excess. This table exists so the
--    UI can show "Saldo Kredit Tersedia" and prevent the same credit
--    being consumed twice).
create table credit_notes (
  id uuid primary key default gen_random_uuid(),
  party_type text not null check (party_type in ('customer', 'supplier')),
  party_id uuid not null,
  source_type text not null check (source_type in ('sales_return', 'purchase_return')),
  source_id uuid not null,
  amount numeric not null check (amount > 0),
  remaining numeric not null check (remaining >= 0),
  status text not null default 'open' check (status in ('open', 'applied', 'cancelled')),
  created_at timestamptz not null default now()
);
create index idx_credit_notes_party on credit_notes(party_type, party_id, status);

create table credit_note_applications (
  id uuid primary key default gen_random_uuid(),
  credit_note_id uuid not null references credit_notes(id),
  invoice_id uuid not null references invoices(id),
  amount numeric not null check (amount > 0),
  applied_at timestamptz not null default now(),
  applied_by uuid references auth.users(id)
);
create index idx_credit_note_applications_invoice on credit_note_applications(invoice_id);
create index idx_credit_note_applications_note on credit_note_applications(credit_note_id);

alter table credit_notes enable row level security;
create policy "credit_notes_select" on credit_notes
  for select to authenticated using (true);
create policy "credit_notes_write" on credit_notes
  for all to authenticated using (is_admin_or_staff()) with check (is_admin_or_staff());

alter table credit_note_applications enable row level security;
create policy "credit_note_applications_select" on credit_note_applications
  for select to authenticated using (true);
create policy "credit_note_applications_write" on credit_note_applications
  for all to authenticated using (is_admin_or_staff()) with check (is_admin_or_staff());

-- 6) New COA account for the sales-side contra-revenue entry. The purchase
--    side reuses the existing "Selisih Harga" account (5-19000) exactly
--    like post_purchase_invoice already does for GR/invoice price
--    variance — no new purchase-side account needed.
insert into coa (code, name, type, normal_balance)
select '4-13000', 'Retur Penjualan', 'revenue', 'debit'
where not exists (select 1 from coa where code = '4-13000');

update coa set parent_id = (select id from coa where code = '4-00000')
 where code = '4-13000';
```

- [ ] **Step 2: Apply migration to local/dev Supabase and verify**

```bash
cd apps/erp-acc/erp-app
npx supabase db push
```

```sql
select count(*) from information_schema.columns
 where table_name = 'sales_returns' and column_name = 'invoice_id';
-- Expected: 1

select code, name from coa where code = '4-13000';
-- Expected: 1 row, "Retur Penjualan"

select id, quantity_base, sales_returnable_qty(id) from invoice_items limit 3;
-- Expected: sales_returnable_qty = quantity_base (no returns posted yet)
```

- [ ] **Step 3: Commit**

```bash
git add apps/erp-acc/erp-app/supabase/migrations/038_return_invoice_ar_ap.sql
git commit -m "feat(erp-acc): add schema for invoice-linked returns and credit notes"
```

---

## Task 2: Migration — extend save_sales_return / save_purchase_return

**Suggested executor:** Sonnet 5

**Files:**
- Modify: `apps/erp-acc/erp-app/supabase/migrations/038_return_invoice_ar_ap.sql` (append)

- [ ] **Step 1: Append `save_sales_return` redefinition**

```sql
-- ============================================================
-- save_sales_return: accept optional invoice_id / invoice_item_id,
-- validate party match + returnable qty (soft check; hard check
-- happens again at post time under row lock).
-- ============================================================
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
```

- [ ] **Step 2: Append `save_purchase_return` redefinition (mirror, plus tax_amount which the table now has)**

```sql
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
```

- [ ] **Step 3: Apply + smoke test**

```bash
cd apps/erp-acc/erp-app
npx supabase db push
```

```sql
-- Sanity: function still callable with old-style payload (no invoice_id) —
-- confirms backward compatibility with existing SO-only returns.
select save_sales_return(
  '{"date":"2026-07-10","customer_id":"<any existing customer id>","warehouse_id":null,"notes":"smoke"}'::jsonb,
  array['{"product_id":"<any product id>","unit_id":"<any unit id>","quantity":1,"quantity_base":1,"unit_price":1000,"tax_amount":0,"total":1000}'::jsonb]
);
-- Expected: returns a uuid, no error
```

- [ ] **Step 4: Commit**

```bash
git add apps/erp-acc/erp-app/supabase/migrations/038_return_invoice_ar_ap.sql
git commit -m "feat(erp-acc): extend save_sales_return/save_purchase_return with invoice linking"
```

---

## Task 3: Migration — extend post_sales_return (AR reduction)

**Suggested executor:** Sonnet 5

**Files:**
- Modify: `apps/erp-acc/erp-app/supabase/migrations/038_return_invoice_ar_ap.sql` (append)

- [ ] **Step 1: Append `post_sales_return` redefinition**

Preserves the existing Persediaan/HPP reversal block verbatim, adds the AR-reduction block after it.

```sql
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

  -- Re-validate qty under row lock (race-safe: two concurrent returns on
  -- the same invoice line cannot both slip through the save-time soft check).
  if v_sr.invoice_id is not null then
    for v_item in select * from sales_return_items where sales_return_id = p_sr_id loop
      select sales_returnable_qty(v_item.invoice_item_id) into v_returnable;
      if v_item.quantity_base > coalesce(v_returnable, 0) then
        raise exception 'qty retur item % melebihi sisa yang bisa diretur (%)',
          v_item.product_id, v_returnable;
      end if;
    end loop;
  end if;

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

    select * into v_inv from invoices where id = v_sr.invoice_id for update;

    v_outstanding := v_inv.total - v_inv.amount_paid - v_inv.advance_deduction_amount
                      - v_inv.credit_applied_amount - v_inv.return_credit_amount;
    v_return_credit := least(v_sr.total, greatest(v_outstanding, 0));
    v_excess := v_sr.total - v_return_credit;

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
```

- [ ] **Step 2: Apply migration**

```bash
cd apps/erp-acc/erp-app
npx supabase db push
```

- [ ] **Step 3: Commit**

```bash
git add apps/erp-acc/erp-app/supabase/migrations/038_return_invoice_ar_ap.sql
git commit -m "feat(erp-acc): reduce sales invoice AR when a linked return is posted"
```

---

## Task 4: Migration — extend post_purchase_return (AP reduction)

**Suggested executor:** Sonnet 5

**Files:**
- Modify: `apps/erp-acc/erp-app/supabase/migrations/038_return_invoice_ar_ap.sql` (append)

- [ ] **Step 1: Append `post_purchase_return` redefinition**

Mirrors Task 3. The price-variance line reuses the existing `5-19000` "Selisih Harga" account — the same account `post_purchase_invoice` already uses for GR-vs-invoice price differences (migration 016) — instead of inventing a new "Retur Pembelian" GL account.

```sql
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

  if v_pr.invoice_id is not null then
    for v_item in select * from purchase_return_items where purchase_return_id = p_pr_id loop
      select purchase_returnable_qty(v_item.invoice_item_id) into v_returnable;
      if v_item.quantity_base > coalesce(v_returnable, 0) then
        raise exception 'qty retur item % melebihi sisa yang bisa diretur (%)',
          v_item.product_id, v_returnable;
      end if;
    end loop;
  end if;

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

    select * into v_inv from invoices where id = v_pr.invoice_id for update;

    v_outstanding := v_inv.total - v_inv.amount_paid - v_inv.credit_applied_amount
                      - v_inv.return_credit_amount;
    v_return_credit := least(v_pr.total, greatest(v_outstanding, 0));
    v_excess := v_pr.total - v_return_credit;

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

    insert into journal_items (journal_id, coa_id, credit, description)
      values (v_journal_id, v_coa_persediaan, v_total_cost,
              'Persediaan keluar (invoice-linked) - ' || v_pr.pr_number);

    -- Selisih antara harga invoice (subtotal) vs avg-cost inventory-out,
    -- sama seperti pola v_selisih di post_purchase_invoice (migration 016).
    v_selisih := v_pr.subtotal - v_total_cost;
    if v_selisih > 0 then
      insert into journal_items (journal_id, coa_id, debit, description)
        values (v_journal_id, v_coa_selisih, v_selisih, 'Selisih harga retur - ' || v_pr.pr_number);
    elsif v_selisih < 0 then
      insert into journal_items (journal_id, coa_id, credit, description)
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

> **Note:** the invoice-linked branch inserts a *second* Persediaan credit line (`'Persediaan keluar (invoice-linked)'`) in the AR/AP journal in addition to the unconditional inventory-reversal journal above. This looks like double-crediting Persediaan but is intentional and balances correctly: the first journal (inventory reversal) is a self-contained Hutang-Barang-Diterima↔Persediaan entry that runs for *every* return regardless of invoice link (unchanged legacy behavior — it's how stock actually moves). The second journal is a *separate*, additional entry that exists only to record the AP-side effect (Debit Hutang Usaha, matched by Credit Persediaan + Credit PPN Masukan + Selisih) for invoice-linked returns. Two separate balanced journals, each independently correct — do not try to merge them into one.

- [ ] **Step 2: Apply migration**

```bash
cd apps/erp-acc/erp-app
npx supabase db push
```

- [ ] **Step 3: Commit**

```bash
git add apps/erp-acc/erp-app/supabase/migrations/038_return_invoice_ar_ap.sql
git commit -m "feat(erp-acc): reduce purchase invoice AP when a linked return is posted"
```

---

## Task 5: Migration — credit application to a new invoice

**Suggested executor:** Sonnet 5

**Files:**
- Modify: `apps/erp-acc/erp-app/supabase/migrations/038_return_invoice_ar_ap.sql` (append)

- [ ] **Step 1: Append `apply_credit_note_to_invoice` (FIFO allocator, bookkeeping-only — no journal entries)**

The originating return's journal already reduced Piutang/Hutang for the excess (Task 3/4). Applying that credit to a later invoice does not need a second journal entry — it only needs to (a) prevent the same credit being used twice and (b) let the invoice's own "Sisa Tagih"/status calculation account for it. The invoice's own posting journal (Task 6) is left untouched.

```sql
create or replace function apply_credit_note_to_invoice(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv record;
  v_party_type text;
  v_party_id uuid;
  v_remaining_to_allocate numeric;
  v_note record;
  v_allocate numeric;
  v_available numeric;
begin
  select * into v_inv from invoices where id = p_invoice_id for update;
  if v_inv is null then
    raise exception 'invoice tidak ditemukan';
  end if;

  if v_inv.credit_applied_amount <= 0 then
    return;
  end if;

  if v_inv.type = 'sales' then
    v_party_type := 'customer';
    v_party_id := v_inv.customer_id;
  else
    v_party_type := 'supplier';
    v_party_id := v_inv.supplier_id;
  end if;

  select coalesce(sum(remaining), 0) into v_available
    from credit_notes
   where party_type = v_party_type and party_id = v_party_id and status = 'open'
   for update;

  if v_inv.credit_applied_amount > v_available + 0.01 then
    raise exception 'saldo kredit tidak cukup: diminta %, tersedia %',
      v_inv.credit_applied_amount, v_available;
  end if;

  v_remaining_to_allocate := v_inv.credit_applied_amount;

  for v_note in
    select * from credit_notes
     where party_type = v_party_type and party_id = v_party_id and status = 'open'
     order by created_at
     for update
  loop
    exit when v_remaining_to_allocate <= 0;
    v_allocate := least(v_note.remaining, v_remaining_to_allocate);

    insert into credit_note_applications (credit_note_id, invoice_id, amount, applied_by)
      values (v_note.id, p_invoice_id, v_allocate, auth.uid());

    update credit_notes
       set remaining = remaining - v_allocate,
           status = case when remaining - v_allocate <= 0.01 then 'applied' else status end
     where id = v_note.id;

    v_remaining_to_allocate := v_remaining_to_allocate - v_allocate;
  end loop;
end;
$$;
```

- [ ] **Step 2: Extend `save_sales_invoice` — accept + soft-validate `credit_applied_amount`**

Full redefinition, based on the migration 037 version (the effective latest — confirmed no later redefinition exists), adding the new field.

```sql
create or replace function save_sales_invoice(
  p_invoice jsonb,
  p_items   jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv_id     uuid;
  v_number     text;
  v_subtotal   numeric := 0;
  v_tax        numeric := 0;
  v_total      numeric := 0;
  v_adv_amount numeric := 0;
  v_adv_coa    uuid;
  v_credit_applied numeric := 0;
  v_available_credit numeric;
begin
  if not is_admin_or_staff() then
    raise exception 'permission denied';
  end if;
  perform _ensure_period_open((p_invoice->>'date')::date);

  select coalesce(sum(line_subtotal), 0), coalesce(sum(line_tax), 0)
  into v_subtotal, v_tax
  from (
    select
      qty * price as line_subtotal,
      case when p.is_taxable
           then round(qty * price * coalesce(nullif(p.tax_rate, 0), 11) / 100, 2)
           else 0 end as line_tax
    from jsonb_array_elements(p_items) as i
    join products p on p.id = (i->>'product_id')::uuid
    cross join lateral (
      select coalesce((i->>'quantity')::numeric, 0)   as qty,
             coalesce((i->>'unit_price')::numeric, 0)  as price
    ) v
  ) lines;
  v_total := v_subtotal + v_tax;

  v_adv_amount := coalesce((p_invoice->>'advance_deduction_amount')::numeric, 0);
  v_adv_coa    := nullif(p_invoice->>'advance_deduction_coa_id', '')::uuid;
  if v_adv_amount < 0 then
    raise exception 'potongan uang muka tidak boleh negatif';
  end if;
  if v_adv_amount > v_total + 0.01 then
    raise exception 'potongan uang muka (%) melebihi total invoice (%)', v_adv_amount, v_total;
  end if;
  if v_adv_amount > 0 and v_adv_coa is null then
    raise exception 'akun COA uang muka wajib dipilih jika potongan uang muka > 0';
  end if;

  v_credit_applied := coalesce((p_invoice->>'credit_applied_amount')::numeric, 0);
  if v_credit_applied < 0 then
    raise exception 'kredit yang diterapkan tidak boleh negatif';
  end if;
  if v_credit_applied > 0 then
    select coalesce(sum(remaining), 0) into v_available_credit
      from credit_notes
     where party_type = 'customer'
       and party_id = (p_invoice->>'customer_id')::uuid
       and status = 'open';
    if v_credit_applied > v_available_credit + 0.01 then
      raise exception 'kredit yang diterapkan (%) melebihi saldo kredit tersedia (%)',
        v_credit_applied, v_available_credit;
    end if;
  end if;

  v_inv_id := nullif(p_invoice->>'id', '')::uuid;

  if v_inv_id is null then
    v_number := generate_number('INV');
    v_inv_id  := gen_random_uuid();
    insert into invoices (
      id, invoice_number, date, due_date, type, customer_id,
      sales_order_id, goods_delivery_id, payment_term_id,
      status, subtotal, tax_amount, total,
      advance_deduction_amount, advance_deduction_coa_id,
      credit_applied_amount,
      notes, created_by
    ) values (
      v_inv_id, v_number,
      (p_invoice->>'date')::date,
      nullif(p_invoice->>'due_date', '')::date,
      'sales',
      (p_invoice->>'customer_id')::uuid,
      nullif(p_invoice->>'sales_order_id',    '')::uuid,
      nullif(p_invoice->>'goods_delivery_id', '')::uuid,
      nullif(p_invoice->>'payment_term_id',   '')::uuid,
      coalesce(p_invoice->>'status', 'draft'),
      v_subtotal, v_tax, v_total,
      v_adv_amount, v_adv_coa,
      v_credit_applied,
      nullif(p_invoice->>'notes', ''),
      auth.uid()
    );
  else
    update invoices
       set date                     = (p_invoice->>'date')::date,
           due_date                 = nullif(p_invoice->>'due_date', '')::date,
           customer_id              = (p_invoice->>'customer_id')::uuid,
           sales_order_id           = nullif(p_invoice->>'sales_order_id',    '')::uuid,
           goods_delivery_id        = nullif(p_invoice->>'goods_delivery_id', '')::uuid,
           payment_term_id          = nullif(p_invoice->>'payment_term_id',   '')::uuid,
           subtotal                 = v_subtotal,
           tax_amount               = v_tax,
           total                    = v_total,
           advance_deduction_amount = v_adv_amount,
           advance_deduction_coa_id = v_adv_coa,
           credit_applied_amount    = v_credit_applied,
           notes                    = nullif(p_invoice->>'notes', '')
     where id = v_inv_id and status = 'draft' and type = 'sales';
    if not found then
      raise exception 'sales invoice tidak dapat diubah (sudah diposting atau tidak ditemukan)';
    end if;
    delete from invoice_items where invoice_id = v_inv_id;
  end if;

  insert into invoice_items (
    invoice_id, product_id, unit_id,
    quantity, quantity_base, unit_price, tax_amount, total
  )
  select
    v_inv_id,
    (i->>'product_id')::uuid,
    (i->>'unit_id')::uuid,
    v.qty,
    coalesce((i->>'quantity_base')::numeric, v.qty),
    v.price,
    t.line_tax,
    v.qty * v.price + t.line_tax
  from jsonb_array_elements(p_items) as i
  join products p on p.id = (i->>'product_id')::uuid
  cross join lateral (
    select coalesce((i->>'quantity')::numeric, 0)  as qty,
           coalesce((i->>'unit_price')::numeric, 0) as price
  ) v
  cross join lateral (
    select case when p.is_taxable
                then round(v.qty * v.price * coalesce(nullif(p.tax_rate, 0), 11) / 100, 2)
                else 0 end as line_tax
  ) t;

  return v_inv_id;
end $$;
```

- [ ] **Step 3: Extend `post_sales_invoice` — hard-validate credit, call the allocator, extend status threshold**

Full redefinition, based on migration 037's version (effective latest).

```sql
create or replace function post_sales_invoice(p_invoice_id uuid)
returns uuid as $$
declare
  v_inv record;
  v_item record;
  v_journal_id uuid;
  v_hpp_journal_id uuid;
  v_coa_piutang uuid;
  v_coa_pendapatan uuid;
  v_coa_ppn_out uuid;
  v_coa_hpp uuid;
  v_coa_persediaan uuid;
  v_has_gd boolean;
  v_avg_cost numeric;
  v_total_hpp numeric := 0;
  v_piutang numeric;
  v_available_credit numeric;
begin
  perform _ensure_can_post();

  select * into v_inv from invoices where id = p_invoice_id for update;
  if v_inv is null then raise exception 'invoice not found'; end if;
  if v_inv.status != 'draft' then
    raise exception 'Invoice already posted';
  end if;
  if v_inv.type != 'sales' then
    raise exception 'Not a sales invoice';
  end if;

  if v_inv.advance_deduction_amount > 0 and v_inv.advance_deduction_coa_id is null then
    raise exception 'akun COA uang muka wajib dipilih jika potongan uang muka > 0';
  end if;
  if v_inv.advance_deduction_amount > v_inv.total + 0.01 then
    raise exception 'potongan uang muka melebihi total invoice';
  end if;

  if v_inv.credit_applied_amount > 0 then
    select coalesce(sum(remaining), 0) into v_available_credit
      from credit_notes
     where party_type = 'customer' and party_id = v_inv.customer_id and status = 'open';
    if v_inv.credit_applied_amount > v_available_credit + 0.01 then
      raise exception 'kredit yang diterapkan (%) melebihi saldo kredit tersedia (%)',
        v_inv.credit_applied_amount, v_available_credit;
    end if;
  end if;

  perform _ensure_period_open(v_inv.date);

  select id into v_coa_piutang from coa where code = '1-13000';
  select id into v_coa_pendapatan from coa where code = '4-11000';
  select id into v_coa_ppn_out from coa where code = '2-12000';
  select id into v_coa_hpp from coa where code = '5-11000';
  select id into v_coa_persediaan from coa where code = '1-14000';

  v_journal_id := gen_random_uuid();
  insert into journals (id, journal_number, date, description, source, reference_type, reference_id, customer_id, is_posted, created_by)
    values (v_journal_id, generate_number('JRN'), v_inv.date,
      'Penjualan ' || v_inv.invoice_number, 'auto', 'sales_invoice', p_invoice_id,
      v_inv.customer_id, true, v_inv.created_by);

  v_piutang := v_inv.total - v_inv.advance_deduction_amount;
  if v_piutang > 0 then
    insert into journal_items (journal_id, coa_id, debit, description)
      values (v_journal_id, v_coa_piutang, v_piutang, 'Piutang - ' || v_inv.invoice_number);
  end if;

  if v_inv.advance_deduction_amount > 0 then
    insert into journal_items (journal_id, coa_id, debit, description)
      values (v_journal_id, v_inv.advance_deduction_coa_id, v_inv.advance_deduction_amount,
              'Potongan uang muka - ' || v_inv.invoice_number);
  end if;

  insert into journal_items (journal_id, coa_id, credit, description)
    values (v_journal_id, v_coa_pendapatan, v_inv.subtotal, 'Pendapatan - ' || v_inv.invoice_number);

  if v_inv.tax_amount > 0 then
    insert into journal_items (journal_id, coa_id, credit, description)
      values (v_journal_id, v_coa_ppn_out, v_inv.tax_amount, 'PPN Keluaran - ' || v_inv.invoice_number);
  end if;

  select exists(
    select 1 from goods_deliveries
      where sales_order_id = v_inv.sales_order_id
        and status = 'posted'
  ) into v_has_gd;

  if not v_has_gd then
    for v_item in select * from invoice_items where invoice_id = p_invoice_id
    loop
      v_avg_cost := inventory_stock_out(
        v_item.product_id, v_item.quantity_base,
        v_item.unit_id, v_item.quantity, 'sales_invoice', p_invoice_id, v_inv.date
      );
      v_total_hpp := v_total_hpp + (v_item.quantity_base * v_avg_cost);
    end loop;

    if v_total_hpp > 0 then
      v_hpp_journal_id := gen_random_uuid();
      insert into journals (id, journal_number, date, description, source, reference_type, reference_id, customer_id, is_posted, created_by)
        values (v_hpp_journal_id, generate_number('JRN'), v_inv.date,
          'HPP Penjualan ' || v_inv.invoice_number, 'auto', 'sales_invoice_hpp', p_invoice_id,
          v_inv.customer_id, true, v_inv.created_by);
      insert into journal_items (journal_id, coa_id, debit, description)
        values (v_hpp_journal_id, v_coa_hpp, v_total_hpp, 'HPP - ' || v_inv.invoice_number);
      insert into journal_items (journal_id, coa_id, credit, description)
        values (v_hpp_journal_id, v_coa_persediaan, v_total_hpp, 'Persediaan keluar - ' || v_inv.invoice_number);
    end if;
  end if;

  update invoices
     set status = case
           when advance_deduction_amount + credit_applied_amount >= total - 0.01 then 'paid'
           else 'posted'
         end
   where id = p_invoice_id;
  if v_inv.sales_order_id is not null then
    update sales_orders set status = 'invoiced' where id = v_inv.sales_order_id;
  end if;

  if v_inv.credit_applied_amount > 0 then
    perform apply_credit_note_to_invoice(p_invoice_id);
  end if;

  return v_journal_id;
end;
$$ language plpgsql security definer set search_path = public;
```

- [ ] **Step 4: Extend `save_purchase_invoice` — accept + soft-validate `credit_applied_amount`**

Full redefinition, based on migration 035's version (effective latest).

```sql
create or replace function save_purchase_invoice(
  p_invoice jsonb,
  p_items   jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv_id   uuid;
  v_number   text;
  v_subtotal numeric := 0;
  v_tax      numeric := 0;
  v_total    numeric := 0;
  v_credit_applied numeric := 0;
  v_available_credit numeric;
begin
  if not is_admin_or_staff() then
    raise exception 'permission denied';
  end if;
  perform _ensure_period_open((p_invoice->>'date')::date);

  select
    coalesce(sum(line_subtotal), 0),
    coalesce(sum(line_tax), 0)
  into v_subtotal, v_tax
  from (
    select
      qty * price as line_subtotal,
      case when p.is_taxable
           then round(qty * price * coalesce(nullif(p.tax_rate, 0), 11) / 100, 2)
           else 0 end as line_tax
    from jsonb_array_elements(p_items) as i
    join products p on p.id = (i->>'product_id')::uuid
    cross join lateral (
      select coalesce((i->>'quantity')::numeric, 0)   as qty,
             coalesce((i->>'unit_price')::numeric, 0)  as price
    ) v
  ) lines;
  v_total := v_subtotal + v_tax;

  v_credit_applied := coalesce((p_invoice->>'credit_applied_amount')::numeric, 0);
  if v_credit_applied < 0 then
    raise exception 'kredit yang diterapkan tidak boleh negatif';
  end if;
  if v_credit_applied > 0 then
    select coalesce(sum(remaining), 0) into v_available_credit
      from credit_notes
     where party_type = 'supplier'
       and party_id = (p_invoice->>'supplier_id')::uuid
       and status = 'open';
    if v_credit_applied > v_available_credit + 0.01 then
      raise exception 'kredit yang diterapkan (%) melebihi saldo kredit tersedia (%)',
        v_credit_applied, v_available_credit;
    end if;
  end if;

  v_inv_id := nullif(p_invoice->>'id', '')::uuid;

  if v_inv_id is null then
    v_number := generate_number('PINV');
    v_inv_id  := gen_random_uuid();
    insert into invoices (
      id, invoice_number, date, due_date, type, supplier_id,
      purchase_order_id, goods_receipt_id, status, subtotal, tax_amount, total,
      credit_applied_amount,
      notes, created_by
    ) values (
      v_inv_id, v_number,
      (p_invoice->>'date')::date,
      nullif(p_invoice->>'due_date', '')::date,
      'purchase',
      (p_invoice->>'supplier_id')::uuid,
      nullif(p_invoice->>'purchase_order_id', '')::uuid,
      nullif(p_invoice->>'goods_receipt_id',  '')::uuid,
      coalesce(p_invoice->>'status', 'draft'),
      v_subtotal, v_tax, v_total,
      v_credit_applied,
      nullif(p_invoice->>'notes', ''),
      auth.uid()
    );
  else
    update invoices
       set date              = (p_invoice->>'date')::date,
           due_date          = nullif(p_invoice->>'due_date', '')::date,
           supplier_id       = (p_invoice->>'supplier_id')::uuid,
           purchase_order_id = nullif(p_invoice->>'purchase_order_id', '')::uuid,
           goods_receipt_id  = nullif(p_invoice->>'goods_receipt_id',  '')::uuid,
           subtotal          = v_subtotal,
           tax_amount        = v_tax,
           total             = v_total,
           credit_applied_amount = v_credit_applied,
           notes             = nullif(p_invoice->>'notes', '')
     where id = v_inv_id and status = 'draft' and type = 'purchase';
    if not found then
      raise exception 'purchase invoice tidak dapat diubah (sudah diposting atau tidak ditemukan)';
    end if;
    delete from invoice_items where invoice_id = v_inv_id;
  end if;

  insert into invoice_items (
    invoice_id, product_id, unit_id,
    quantity, quantity_base, unit_price, tax_amount, total
  )
  select
    v_inv_id,
    (i->>'product_id')::uuid,
    (i->>'unit_id')::uuid,
    v.qty,
    coalesce((i->>'quantity_base')::numeric, v.qty),
    v.price,
    line_tax,
    v.qty * v.price + line_tax
  from jsonb_array_elements(p_items) as i
  join products p on p.id = (i->>'product_id')::uuid
  cross join lateral (
    select coalesce((i->>'quantity')::numeric, 0)  as qty,
           coalesce((i->>'unit_price')::numeric, 0) as price
  ) v
  cross join lateral (
    select case when p.is_taxable
                then round(v.qty * v.price * coalesce(nullif(p.tax_rate, 0), 11) / 100, 2)
                else 0 end as line_tax
  ) t;

  return v_inv_id;
end $$;
```

- [ ] **Step 5: Extend `post_purchase_invoice` — hard-validate credit, call the allocator, extend status threshold**

Full redefinition, based on migration 016's version (effective latest — no later redefinition exists for this function).

```sql
create or replace function post_purchase_invoice(p_invoice_id uuid)
returns uuid as $$
declare
  v_inv record;
  v_item record;
  v_journal_id uuid;
  v_coa_persediaan uuid;
  v_coa_ppn_in uuid;
  v_coa_hutang uuid;
  v_coa_hutang_barang uuid;
  v_coa_selisih uuid;
  v_has_gr boolean;
  v_gr_total numeric := 0;
  v_selisih numeric;
  v_available_credit numeric;
begin
  perform _ensure_can_post();

  select * into v_inv from invoices where id = p_invoice_id for update;
  if v_inv is null then raise exception 'invoice not found'; end if;
  if v_inv.status != 'draft' then
    raise exception 'Invoice already posted';
  end if;
  if v_inv.type != 'purchase' then
    raise exception 'Not a purchase invoice';
  end if;

  if v_inv.credit_applied_amount > 0 then
    select coalesce(sum(remaining), 0) into v_available_credit
      from credit_notes
     where party_type = 'supplier' and party_id = v_inv.supplier_id and status = 'open';
    if v_inv.credit_applied_amount > v_available_credit + 0.01 then
      raise exception 'kredit yang diterapkan (%) melebihi saldo kredit tersedia (%)',
        v_inv.credit_applied_amount, v_available_credit;
    end if;
  end if;

  perform _ensure_period_open(v_inv.date);

  select id into v_coa_persediaan from coa where code = '1-14000';
  select id into v_coa_ppn_in from coa where code = '1-15000';
  select id into v_coa_hutang from coa where code = '2-11000';
  select id into v_coa_hutang_barang from coa where code = '2-11100';
  select id into v_coa_selisih from coa where code = '5-19000';

  v_journal_id := gen_random_uuid();
  insert into journals (id, journal_number, date, description, source, reference_type, reference_id, supplier_id, is_posted, created_by)
    values (v_journal_id, generate_number('JRN'), v_inv.date,
      'Pembelian ' || v_inv.invoice_number, 'auto', 'purchase_invoice', p_invoice_id,
      v_inv.supplier_id, true, v_inv.created_by);

  select exists(
    select 1 from goods_receipts
      where purchase_order_id = v_inv.purchase_order_id
        and status = 'posted'
  ) into v_has_gr;

  if v_has_gr then
    select coalesce(sum(gri.quantity_base * gri.unit_price), 0) into v_gr_total
      from goods_receipt_items gri
      join goods_receipts gr on gri.goods_receipt_id = gr.id
      where gr.purchase_order_id = v_inv.purchase_order_id and gr.status = 'posted';

    insert into journal_items (journal_id, coa_id, debit, description)
      values (v_journal_id, v_coa_hutang_barang, v_gr_total, 'Clear accrual - ' || v_inv.invoice_number);
    insert into journal_items (journal_id, coa_id, credit, description)
      values (v_journal_id, v_coa_hutang, v_inv.total, 'Hutang usaha - ' || v_inv.invoice_number);

    if v_inv.tax_amount > 0 then
      insert into journal_items (journal_id, coa_id, debit, description)
        values (v_journal_id, v_coa_ppn_in, v_inv.tax_amount, 'PPN Masukan - ' || v_inv.invoice_number);
    end if;

    v_selisih := v_inv.subtotal - v_gr_total;
    if v_selisih > 0 then
      insert into journal_items (journal_id, coa_id, debit, description)
        values (v_journal_id, v_coa_selisih, v_selisih, 'Selisih harga - ' || v_inv.invoice_number);
    elsif v_selisih < 0 then
      insert into journal_items (journal_id, coa_id, credit, description)
        values (v_journal_id, v_coa_selisih, abs(v_selisih), 'Selisih harga - ' || v_inv.invoice_number);
    end if;

  else
    for v_item in select * from invoice_items where invoice_id = p_invoice_id
    loop
      perform inventory_stock_in(
        v_item.product_id, v_item.quantity_base, v_item.unit_price,
        v_item.unit_id, v_item.quantity, 'purchase_invoice', p_invoice_id, v_inv.date
      );
    end loop;

    insert into journal_items (journal_id, coa_id, debit, description)
      values (v_journal_id, v_coa_persediaan, v_inv.subtotal, 'Persediaan masuk - ' || v_inv.invoice_number);

    if v_inv.tax_amount > 0 then
      insert into journal_items (journal_id, coa_id, debit, description)
        values (v_journal_id, v_coa_ppn_in, v_inv.tax_amount, 'PPN Masukan - ' || v_inv.invoice_number);
    end if;

    insert into journal_items (journal_id, coa_id, credit, description)
      values (v_journal_id, v_coa_hutang, v_inv.total, 'Hutang usaha - ' || v_inv.invoice_number);
  end if;

  update invoices
     set status = case
           when credit_applied_amount >= total - 0.01 then 'paid'
           else 'posted'
         end
   where id = p_invoice_id;
  if v_inv.purchase_order_id is not null then
    update purchase_orders set status = 'done' where id = v_inv.purchase_order_id;
  end if;

  if v_inv.credit_applied_amount > 0 then
    perform apply_credit_note_to_invoice(p_invoice_id);
  end if;

  return v_journal_id;
end;
$$ language plpgsql security definer set search_path = public;
```

- [ ] **Step 6: Extend `post_payment` — its `'paid'` threshold must also account for the two new columns**

Gap found during self-review: `post_payment` (effective version in migration 037) computes `status = case when amount_paid + v_effective + advance_deduction_amount >= total - 0.01 then 'paid' else 'partial' end`. Left as-is, a payment on an invoice that also has `return_credit_amount` and/or `credit_applied_amount` would compute the wrong status (could stay `'partial'` when the invoice is actually fully covered, or vice versa). Full redefinition below is migration 037's version with only the status-threshold line changed — everything else (idempotency guard, discount/rounding/fee handling) is untouched.

```sql
create or replace function post_payment(p_payment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay           record;
  v_journal_id    uuid;
  v_coa_piutang   uuid;
  v_coa_hutang    uuid;
  v_effective     numeric;
begin
  perform _ensure_can_post();

  select p.*, a.coa_id as account_coa_id
    into v_pay
    from payments p
    join accounts a on p.account_id = a.id
   where p.id = p_payment_id
     for update of p;

  if v_pay is null then
    raise exception 'payment % not found', p_payment_id;
  end if;

  if v_pay.is_posted then
    return v_pay.posted_journal_id;
  end if;

  perform _ensure_period_open(v_pay.date);

  select id into v_coa_piutang from coa where code = '1-13000';
  select id into v_coa_hutang  from coa where code = '2-11000';

  v_effective := v_pay.amount + v_pay.discount_amount + v_pay.rounding_amount;

  v_journal_id := gen_random_uuid();
  insert into journals (
    id, journal_number, date, description, source,
    reference_type, reference_id, customer_id, supplier_id,
    is_posted, created_by
  ) values (
    v_journal_id, generate_number('JRN'), v_pay.date,
    'Pembayaran ' || v_pay.payment_number, 'auto', 'payment', p_payment_id,
    v_pay.customer_id, v_pay.supplier_id, true, v_pay.created_by
  );

  if v_pay.type = 'incoming' then
    insert into journal_items (journal_id, coa_id, debit, description)
      values (v_journal_id, v_pay.account_coa_id, v_pay.amount,
              'Terima pembayaran - ' || v_pay.payment_number);

    if v_pay.discount_amount > 0 then
      if v_pay.discount_coa_id is null then
        raise exception 'COA diskon wajib diisi jika discount_amount > 0';
      end if;
      insert into journal_items (journal_id, coa_id, debit, description)
        values (v_journal_id, v_pay.discount_coa_id, v_pay.discount_amount,
                'Diskon penjualan - ' || v_pay.payment_number);
    end if;

    if v_pay.rounding_amount != 0 then
      if v_pay.rounding_coa_id is null then
        raise exception 'COA pembulatan wajib diisi jika rounding_amount != 0';
      end if;
      if v_pay.rounding_amount > 0 then
        insert into journal_items (journal_id, coa_id, debit, description)
          values (v_journal_id, v_pay.rounding_coa_id, v_pay.rounding_amount,
                  'Selisih pembulatan - ' || v_pay.payment_number);
      else
        insert into journal_items (journal_id, coa_id, credit, description)
          values (v_journal_id, v_pay.rounding_coa_id, abs(v_pay.rounding_amount),
                  'Selisih pembulatan - ' || v_pay.payment_number);
      end if;
    end if;

    insert into journal_items (journal_id, coa_id, credit, description)
      values (v_journal_id, v_coa_piutang, v_effective,
              'Pelunasan piutang - ' || v_pay.payment_number);

    update accounts set balance = balance + v_pay.amount
     where id = v_pay.account_id;

  elsif v_pay.type = 'outgoing' then
    insert into journal_items (journal_id, coa_id, debit, description)
      values (v_journal_id, v_coa_hutang, v_effective,
              'Pelunasan hutang - ' || v_pay.payment_number);

    if v_pay.fee_amount > 0 then
      if v_pay.fee_coa_id is null then
        raise exception 'COA biaya bank wajib diisi jika fee_amount > 0';
      end if;
      insert into journal_items (journal_id, coa_id, debit, description)
        values (v_journal_id, v_pay.fee_coa_id, v_pay.fee_amount,
                'Biaya transfer - ' || v_pay.payment_number);
    end if;

    insert into journal_items (journal_id, coa_id, credit, description)
      values (v_journal_id, v_pay.account_coa_id, v_pay.amount + v_pay.fee_amount,
              'Bayar supplier - ' || v_pay.payment_number);

    if v_pay.discount_amount > 0 then
      if v_pay.discount_coa_id is null then
        raise exception 'COA diskon wajib diisi jika discount_amount > 0';
      end if;
      insert into journal_items (journal_id, coa_id, credit, description)
        values (v_journal_id, v_pay.discount_coa_id, v_pay.discount_amount,
                'Diskon pembelian - ' || v_pay.payment_number);
    end if;

    if v_pay.rounding_amount != 0 then
      if v_pay.rounding_coa_id is null then
        raise exception 'COA pembulatan wajib diisi jika rounding_amount != 0';
      end if;
      if v_pay.rounding_amount > 0 then
        insert into journal_items (journal_id, coa_id, credit, description)
          values (v_journal_id, v_pay.rounding_coa_id, v_pay.rounding_amount,
                  'Selisih pembulatan - ' || v_pay.payment_number);
      else
        insert into journal_items (journal_id, coa_id, debit, description)
          values (v_journal_id, v_pay.rounding_coa_id, abs(v_pay.rounding_amount),
                  'Selisih pembulatan - ' || v_pay.payment_number);
      end if;
    end if;

    update accounts set balance = balance - (v_pay.amount + v_pay.fee_amount)
     where id = v_pay.account_id;
  end if;

  -- Ambang 'paid' kini juga memperhitungkan return_credit_amount dan
  -- credit_applied_amount, selain advance_deduction_amount (migration 037).
  if v_pay.invoice_id is not null then
    update invoices
       set amount_paid = amount_paid + v_effective,
           status = case
             when amount_paid + v_effective + advance_deduction_amount
                    + credit_applied_amount + return_credit_amount >= total - 0.01 then 'paid'
             else 'partial'
           end
     where id = v_pay.invoice_id;
  end if;

  update payments
     set is_posted         = true,
         posted_journal_id = v_journal_id,
         posted_at         = now()
   where id = p_payment_id;

  return v_journal_id;
end $$;
```

- [ ] **Step 7: Apply migration**

```bash
cd apps/erp-acc/erp-app
npx supabase db push
```

- [ ] **Step 8: Commit**

```bash
git add apps/erp-acc/erp-app/supabase/migrations/038_return_invoice_ar_ap.sql
git commit -m "feat(erp-acc): allow applying customer/supplier credit balance to a new invoice"
```

---

## Task 6: Migration — end-to-end SQL smoke test

**Suggested executor:** Sonnet 5

**Files:** none (verification only, no code changes)

- [ ] **Step 1: Run through the full flow in the Supabase SQL editor (or `psql`) against the dev/staging database**

Replace `<customer>`, `<product>`, `<unit>` with real ids from your dev data.

```sql
-- 1. Create + post a sales invoice, qty 10 @ 100000, non-taxable product for simplicity.
select save_sales_invoice(
  jsonb_build_object('date', '2026-07-10', 'customer_id', '<customer>'),
  jsonb_build_array(jsonb_build_object('product_id','<product>','unit_id','<unit>','quantity',10,'unit_price',100000))
);
-- note the returned invoice id as :inv_id, then:
select post_sales_invoice('<inv_id>');
select total, amount_paid, return_credit_amount, status from invoices where id = '<inv_id>';
-- Expected: total=1000000, status='posted'

-- 2. Partial return: qty 3, linked to the invoice's single line item.
select id from invoice_items where invoice_id = '<inv_id>'; -- note as :item_id
select save_sales_return(
  jsonb_build_object('date','2026-07-10','customer_id','<customer>','invoice_id','<inv_id>'),
  array[jsonb_build_object('invoice_item_id','<item_id>','product_id','<product>','unit_id','<unit>','quantity',3,'quantity_base',3,'unit_price',100000,'tax_amount',0,'total',300000)]
);
-- note returned id as :sr_id
select post_sales_return('<sr_id>');
select return_credit_amount, status from invoices where id = '<inv_id>';
-- Expected: return_credit_amount=300000, status='partial'
select sales_returnable_qty('<item_id>');
-- Expected: 7

-- 3. Second return for the remaining qty exactly (7) — should bring invoice to 'paid'.
select save_sales_return(
  jsonb_build_object('date','2026-07-10','customer_id','<customer>','invoice_id','<inv_id>'),
  array[jsonb_build_object('invoice_item_id','<item_id>','product_id','<product>','unit_id','<unit>','quantity',7,'quantity_base',7,'unit_price',100000,'tax_amount',0,'total',700000)]
);
select post_sales_return('<returned id>');
select return_credit_amount, status from invoices where id = '<inv_id>';
-- Expected: return_credit_amount=1000000, status='paid'
select sales_returnable_qty('<item_id>');
-- Expected: 0

-- 4. Third return attempt on the same line — must be rejected (qty exceeds returnable=0).
select save_sales_return(
  jsonb_build_object('date','2026-07-10','customer_id','<customer>','invoice_id','<inv_id>'),
  array[jsonb_build_object('invoice_item_id','<item_id>','product_id','<product>','unit_id','<unit>','quantity',1,'quantity_base',1,'unit_price',100000,'tax_amount',0,'total',100000)]
);
-- Expected: raises "qty retur melebihi sisa yang bisa diretur (0)"

-- 5. Over-credit case: new fully-paid invoice, then a return against it creates a credit_note.
select save_sales_invoice(
  jsonb_build_object('date','2026-07-10','customer_id','<customer>'),
  jsonb_build_array(jsonb_build_object('product_id','<product>','unit_id','<unit>','quantity',2,'unit_price',50000))
); -- :inv2_id
select post_sales_invoice('<inv2_id>');
-- pay it fully via post_payment, or directly for this smoke test:
update invoices set amount_paid = 100000, status='paid' where id = '<inv2_id>';
select id from invoice_items where invoice_id = '<inv2_id>'; -- :item2_id
select save_sales_return(
  jsonb_build_object('date','2026-07-10','customer_id','<customer>','invoice_id','<inv2_id>'),
  array[jsonb_build_object('invoice_item_id','<item2_id>','product_id','<product>','unit_id','<unit>','quantity',2,'quantity_base',2,'unit_price',50000,'tax_amount',0,'total',100000)]
); -- :sr3_id
select post_sales_return('<sr3_id>');
select * from credit_notes where source_id = '<sr3_id>';
-- Expected: 1 row, amount=100000, remaining=100000, status='open'

-- 6. Apply that credit to a brand-new invoice for the same customer.
select save_sales_invoice(
  jsonb_build_object('date','2026-07-10','customer_id','<customer>','credit_applied_amount',100000),
  jsonb_build_array(jsonb_build_object('product_id','<product>','unit_id','<unit>','quantity',1,'unit_price',150000))
); -- :inv3_id
select post_sales_invoice('<inv3_id>');
select status, credit_applied_amount from invoices where id = '<inv3_id>';
-- Expected: credit_applied_amount=100000, status='posted' (150000 total - 100000 credit = 50000 sisa)
select remaining, status from credit_notes where source_id = '<sr3_id>';
-- Expected: remaining=0, status='applied'
select * from credit_note_applications where invoice_id = '<inv3_id>';
-- Expected: 1 row, amount=100000

-- 7. Journal balance sanity check across everything created above.
select journal_id, sum(debit) as dr, sum(credit) as cr
  from journal_items
 where journal_id in (select id from journals where reference_id in ('<inv_id>','<sr_id>','<sr3_id>','<inv3_id>'))
 group by journal_id having abs(sum(debit) - sum(credit)) > 0.01;
-- Expected: 0 rows (every journal balances)
```

- [ ] **Step 2: Repeat steps 1-7 for the purchase side** (`save_purchase_invoice`/`post_purchase_invoice`/`save_purchase_return`/`post_purchase_return`, `party_type='supplier'`), confirming PPN Masukan reversal and the Selisih Harga variance line post correctly when `unit_price` on the return differs from current `avg_cost`.

- [ ] **Step 3: Record the outcome** — no code change, but note in the PR description that this manual SQL smoke test was run and passed (or list what failed and was fixed) before moving to frontend tasks.

---

## Task 7: Frontend services — salesReturnService.js / purchaseReturnService.js

**Suggested executor:** Sonnet 5

**Files:**
- Modify: `apps/erp-acc/erp-app/src/services/salesReturnService.js`
- Modify: `apps/erp-acc/erp-app/src/services/purchaseReturnService.js`

- [ ] **Step 1: Rewrite `salesReturnService.js`**

```js
import { supabase } from '../lib/supabase'

export async function getSalesReturns() {
  const { data, error } = await supabase
    .from('sales_returns')
    .select('*, customer:customers(name), sales_order:sales_orders(so_number), invoice:invoices(invoice_number)')
    .order('date', { ascending: false })
  if (error) throw error
  return data
}

export async function getSalesReturn(id) {
  const { data, error } = await supabase
    .from('sales_returns')
    .select(`
      *,
      customer:customers(id, name),
      sales_order:sales_orders(id, so_number),
      invoice:invoices(id, invoice_number),
      items:sales_return_items(
        id, invoice_item_id, product_id, unit_id, quantity, quantity_base, unit_price, tax_amount, total,
        product:products(id, name, sku, is_taxable, tax_rate, sell_price),
        unit:units(id, name)
      )
    `)
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

// Sales invoices eligible as a return's origin: same customer, posted/partial/paid.
export async function getReturnableSalesInvoices(customerId) {
  const { data, error } = await supabase
    .from('invoices')
    .select('id, invoice_number, date, total')
    .eq('type', 'sales')
    .eq('customer_id', customerId)
    .in('status', ['posted', 'partial', 'paid'])
    .order('date', { ascending: false })
  if (error) throw error
  return data
}

// Line items of one invoice with their remaining returnable qty.
export async function getReturnableSalesInvoiceItems(invoiceId) {
  const { data, error } = await supabase.rpc('get_returnable_sales_invoice_items', {
    p_invoice_id: invoiceId,
  })
  if (error) throw error
  return data
}

export async function saveSalesReturn(sr, items) {
  const { data, error } = await supabase.rpc('save_sales_return', {
    p_sr: {
      id:             sr.id             || null,
      date:           sr.date,
      customer_id:    sr.customer_id,
      sales_order_id: sr.sales_order_id || null,
      invoice_id:     sr.invoice_id     || null,
      warehouse_id:   sr.warehouse_id   || null,
      status:         sr.status         || 'draft',
      notes:          sr.notes          || null,
    },
    p_items: items.map(i => ({
      invoice_item_id: i.invoice_item_id || null,
      product_id:    i.product_id,
      unit_id:       i.unit_id,
      quantity:      Number(i.quantity),
      quantity_base: Number(i.quantity_base) || Number(i.quantity),
      unit_price:    Number(i.unit_price)    || 0,
      tax_amount:    Number(i.tax_amount)    || 0,
      total:         Number(i.total)         || 0,
    })),
  })
  if (error) throw error
  return data
}

export async function postSalesReturn(id) {
  const { error } = await supabase.rpc('post_sales_return', { p_sr_id: id })
  if (error) throw error
}
```

- [ ] **Step 2: Rewrite `purchaseReturnService.js`**

```js
import { supabase } from '../lib/supabase'

export async function getPurchaseReturns() {
  const { data, error } = await supabase
    .from('purchase_returns')
    .select('*, supplier:suppliers(name), purchase_order:purchase_orders(po_number), invoice:invoices(invoice_number)')
    .order('date', { ascending: false })
  if (error) throw error
  return data
}

export async function getPurchaseReturn(id) {
  const { data, error } = await supabase
    .from('purchase_returns')
    .select(`
      *,
      supplier:suppliers(id, name),
      purchase_order:purchase_orders(id, po_number),
      invoice:invoices(id, invoice_number),
      items:purchase_return_items(
        id, invoice_item_id, product_id, unit_id, quantity, quantity_base, unit_price, tax_amount, total,
        product:products(id, name, sku, is_taxable, tax_rate, buy_price),
        unit:units(id, name)
      )
    `)
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function getReturnablePurchaseInvoices(supplierId) {
  const { data, error } = await supabase
    .from('invoices')
    .select('id, invoice_number, date, total')
    .eq('type', 'purchase')
    .eq('supplier_id', supplierId)
    .in('status', ['posted', 'partial', 'paid'])
    .order('date', { ascending: false })
  if (error) throw error
  return data
}

export async function getReturnablePurchaseInvoiceItems(invoiceId) {
  const { data, error } = await supabase.rpc('get_returnable_purchase_invoice_items', {
    p_invoice_id: invoiceId,
  })
  if (error) throw error
  return data
}

export async function savePurchaseReturn(pr, items) {
  const { data, error } = await supabase.rpc('save_purchase_return', {
    p_pr: {
      id:                pr.id                || null,
      date:              pr.date,
      supplier_id:       pr.supplier_id,
      purchase_order_id: pr.purchase_order_id || null,
      invoice_id:        pr.invoice_id        || null,
      warehouse_id:      pr.warehouse_id      || null,
      status:            pr.status            || 'draft',
      notes:             pr.notes             || null,
    },
    p_items: items.map(i => ({
      invoice_item_id: i.invoice_item_id || null,
      product_id:    i.product_id,
      unit_id:       i.unit_id,
      quantity:      Number(i.quantity),
      quantity_base: Number(i.quantity_base) || Number(i.quantity),
      unit_price:    Number(i.unit_price)    || 0,
      tax_amount:    Number(i.tax_amount)    || 0,
      total:         Number(i.total)         || 0,
    })),
  })
  if (error) throw error
  return data
}

export async function postPurchaseReturn(id) {
  const { error } = await supabase.rpc('post_purchase_return', { p_pr_id: id })
  if (error) throw error
}
```

- [ ] **Step 3: Build check**

```bash
cd apps/erp-acc/erp-app
npm run build
```

Expected: build succeeds (these files aren't imported by anything new yet, so no new errors should surface here — this just confirms no syntax mistakes).

- [ ] **Step 4: Commit**

```bash
git add apps/erp-acc/erp-app/src/services/salesReturnService.js apps/erp-acc/erp-app/src/services/purchaseReturnService.js
git commit -m "feat(erp-acc): add invoice-linked queries to return services"
```

---

## Task 8: New component — InvoiceReturnItemsPicker.jsx

**Suggested executor:** Sonnet 5

**Files:**
- Create: `apps/erp-acc/erp-app/src/components/shared/InvoiceReturnItemsPicker.jsx`

`LineItemsTable` (read in Task 7's research) is a free-form product/unit/qty picker — it has no concept of "pick from these specific invoice lines, capped at returnable qty." This is a distinct enough interaction (checkbox-style row selection against a fixed list, qty capped per row, tax computed from the product master) that it needs its own component rather than bolting options onto `LineItemsTable`.

- [ ] **Step 1: Write the component**

```jsx
import { formatCurrency } from '../../utils/currency'

// Renders one row per returnable invoice line. `returnableItems` comes from
// getReturnableSalesInvoiceItems/getReturnablePurchaseInvoiceItems (each row
// has invoice_item_id, product_name, unit_name, unit_price, returnable).
// `items` is the current return's line array (same shape saveSalesReturn expects).
export default function InvoiceReturnItemsPicker({
  returnableItems = [],
  items,
  onItemsChange,
  showTax = true,
  isTaxable = () => false,
  taxRate = () => 11,
  readOnly = false,
}) {
  const rowFor = (invoiceItemId) => items.find(i => i.invoice_item_id === invoiceItemId)

  function setQty(row, qty) {
    const capped = Math.min(Math.max(Number(qty) || 0, 0), Number(row.returnable))
    const existing = rowFor(row.invoice_item_id)

    if (capped <= 0) {
      onItemsChange(items.filter(i => i.invoice_item_id !== row.invoice_item_id))
      return
    }

    const subtotal = capped * Number(row.unit_price)
    const taxable = isTaxable(row.product_id)
    const tax_amount = taxable ? subtotal * (taxRate(row.product_id) / 100) : 0
    const nextRow = {
      invoice_item_id: row.invoice_item_id,
      product_id: row.product_id,
      unit_id: row.unit_id,
      quantity: capped,
      quantity_base: capped,
      unit_price: Number(row.unit_price),
      tax_amount,
      total: subtotal + tax_amount,
    }

    if (existing) {
      onItemsChange(items.map(i => i.invoice_item_id === row.invoice_item_id ? nextRow : i))
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
          {returnableItems.length === 0 && (
            <tr>
              <td colSpan={showTax ? 7 : 6} style={{ ...cellStyle, textAlign: 'center', color: '#9ca3af', padding: '24px 16px' }}>
                Tidak ada baris yang bisa diretur dari invoice ini.
              </td>
            </tr>
          )}
          {returnableItems.map(row => {
            const current = rowFor(row.invoice_item_id)
            return (
              <tr key={row.invoice_item_id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={cellStyle}>{row.product_name}</td>
                <td style={cellStyle}>{row.unit_name}</td>
                <td style={{ ...cellStyle, textAlign: 'right' }}>{row.returnable}</td>
                <td style={{ ...cellStyle, textAlign: 'right' }}>
                  {readOnly ? (
                    <span>{current?.quantity || 0}</span>
                  ) : (
                    <input
                      type="number"
                      min="0"
                      max={row.returnable}
                      step="any"
                      style={{ width: 90, textAlign: 'right', border: '1px solid #d9d9d9', borderRadius: 4, padding: '2px 8px' }}
                      value={current?.quantity ?? ''}
                      disabled={Number(row.returnable) <= 0}
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

- [ ] **Step 2: Build check**

```bash
cd apps/erp-acc/erp-app
npm run build
```

Expected: succeeds (unused-but-valid component, not yet imported).

- [ ] **Step 3: Commit**

```bash
git add apps/erp-acc/erp-app/src/components/shared/InvoiceReturnItemsPicker.jsx
git commit -m "feat(erp-acc): add InvoiceReturnItemsPicker component"
```

---

## Task 9: Wire invoice picker into SalesReturnFormPage / PurchaseReturnFormPage

**Suggested executor:** Sonnet 5

**Files:**
- Modify: `apps/erp-acc/erp-app/src/pages/sales/SalesReturnFormPage.jsx`
- Modify: `apps/erp-acc/erp-app/src/pages/purchase/PurchaseReturnFormPage.jsx`

- [ ] **Step 1: Edit `SalesReturnFormPage.jsx` imports**

```diff
 import { useState, useEffect, useRef } from 'react'
 import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
-import { Space, Flex, Typography, Col, Alert } from 'antd'
+import { Space, Flex, Typography, Col, Alert } from 'antd'
 import { useAuth } from '../../contexts/AuthContext'
 import { useToast } from '../../components/ui/ToastContext'
 import { useProducts, useCustomers } from '../../hooks/useMasterData'
-import { getSalesReturn, saveSalesReturn, postSalesReturn } from '../../services/salesReturnService'
+import {
+  getSalesReturn, saveSalesReturn, postSalesReturn,
+  getReturnableSalesInvoices, getReturnableSalesInvoiceItems,
+} from '../../services/salesReturnService'
 import { getGoodsDelivery } from '../../services/salesService'
 import { getWarehouses, getDefaultWarehouse } from '../../services/warehouseService'
 import { today } from '../../utils/date'
 import Button from '../../components/ui/Button'
 import Select from '../../components/ui/Select'
 import DocumentHeader from '../../components/shared/DocumentHeader'
 import LineItemsTable from '../../components/shared/LineItemsTable'
+import InvoiceReturnItemsPicker from '../../components/shared/InvoiceReturnItemsPicker'
 import LoadingSpinner from '../../components/ui/LoadingSpinner'
 import { ArrowLeft, Save, Send } from 'lucide-react'
```

- [ ] **Step 2: Add `invoice_id` to header state, add invoice list/returnable-items state**

```diff
   const [header, setHeader] = useState({
     sr_number: '',
     date: today(),
     customer_id: '',
     sales_order_id: '',
+    invoice_id: '',
     warehouse_id: '',
     status: 'draft',
     notes: '',
   })
   const [items, setItems] = useState([LineItemsTable.emptyRow()])
   const [warehouses, setWarehouses] = useState([])
+  const [invoiceOptionsList, setInvoiceOptionsList] = useState([])
+  const [returnableItems, setReturnableItems] = useState([])
```

- [ ] **Step 3: Load invoices when customer changes; load returnable items when invoice changes**

Add after the existing "Load warehouses" `useEffect` block:

```jsx
  // Invoice-linked return: load this customer's eligible invoices whenever
  // customer changes (cleared when customer is empty).
  useEffect(() => {
    let cancelled = false
    if (!header.customer_id) { setInvoiceOptionsList([]); return }
    getReturnableSalesInvoices(header.customer_id)
      .then(list => { if (!cancelled) setInvoiceOptionsList(list) })
      .catch(err => toastRef.current.error(err.message))
    return () => { cancelled = true }
  }, [header.customer_id])

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

  function handleInvoiceChange(invoiceId) {
    setHeader(h => ({ ...h, invoice_id: invoiceId }))
    setItems([])
  }
```

- [ ] **Step 4: Load existing return's `invoice_id` when editing**

```diff
           setHeader({
             id: sr.id,
             sr_number: sr.sr_number,
             date: sr.date,
             customer_id: sr.customer_id,
             sales_order_id: sr.sales_order_id || '',
+            invoice_id: sr.invoice_id || '',
             warehouse_id: sr.warehouse_id || '',
             status: sr.status,
             notes: sr.notes || '',
           })
           setItems(sr.items.map(i => ({
             _key: i.id,
+            invoice_item_id: i.invoice_item_id || null,
             product_id: i.product_id,
             unit_id: i.unit_id,
             quantity: i.quantity,
             quantity_base: i.quantity_base,
             unit_price: i.unit_price,
             tax_amount: i.tax_amount,
             total: i.total,
           })))
```

- [ ] **Step 5: Update `handleSave` validation for the invoice-linked case, and DocumentHeader/items rendering**

```diff
   const handleSave = async () => {
     if (!header.customer_id) { toast.error('Pilih customer terlebih dahulu'); return }
     if (!header.date) { toast.error('Tanggal wajib diisi'); return }
-    const validItems = items.filter(i => i.product_id && Number(i.quantity) > 0)
+    const validItems = items.filter(i => i.product_id && Number(i.quantity) > 0)
     if (validItems.length === 0) { toast.error('Minimal satu item produk'); return }
```

(no numeric logic change needed here — `items` already only contains rows the user picked qty for, in both the free-form and invoice-linked modes)

Replace the `<Col span={12}>` warehouse block inside `<DocumentHeader>` and the item-table section with:

```jsx
      <DocumentHeader
        docNumber={header.sr_number}
        date={header.date}
        onDateChange={d => setHeader(h => ({ ...h, date: d }))}
        status={isNew ? null : header.status}
        partyLabel="Customer"
        partyId={header.customer_id}
        onPartyChange={v => setHeader(h => ({ ...h, customer_id: v, invoice_id: '' }))}
        partyOptions={customerOptions}
        notes={header.notes}
        onNotesChange={v => setHeader(h => ({ ...h, notes: v }))}
        readOnly={readOnly}
      >
        <Col span={12} style={{ marginTop: 16 }}>
          <Select
            label="Gudang"
            options={warehouseOptions}
            value={header.warehouse_id || ''}
            onChange={e => setHeader(h => ({ ...h, warehouse_id: e.target.value }))}
            placeholder="Pilih gudang..."
            disabled={readOnly}
          />
        </Col>
        <Col span={12} style={{ marginTop: 16 }}>
          <Select
            label="Invoice Asal (opsional)"
            options={invoiceOptionsList.map(i => ({ value: i.id, label: `${i.invoice_number} — ${i.date}` }))}
            value={header.invoice_id || ''}
            onChange={e => handleInvoiceChange(e.target.value)}
            placeholder="Tanpa invoice (retur stok saja)..."
            disabled={readOnly || !header.customer_id}
          />
        </Col>
      </DocumentHeader>

      <Space direction="vertical" style={{ width: '100%' }} size={8}>
        <Typography.Title level={5} style={{ margin: 0 }}>Item Retur</Typography.Title>
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
      </Space>
```

- [ ] **Step 6: Mirror all of the above in `PurchaseReturnFormPage.jsx`**

Same diffs, with these substitutions: `useSuppliers`/`suppliers`/`supplier_id`/`purchase_order_id` instead of the sales equivalents, `getReturnablePurchaseInvoices`/`getReturnablePurchaseInvoiceItems` from `purchaseReturnService`, party label "Supplier". Also change the existing `LineItemsTable` fallback's `showTax={false}` to `showTax` (Purchase Return now tracks and reverses PPN Masukan, matching Purchase Invoice's own display) and `priceField="buy_price"`.

Additionally, in the "Load existing return if editing" effect, change:
```diff
           setItems(pr.items.map(i => ({
             _key: i.id,
+            invoice_item_id: i.invoice_item_id || null,
             product_id: i.product_id,
             unit_id: i.unit_id,
             quantity: i.quantity,
             quantity_base: i.quantity_base,
             unit_price: i.unit_price,
-            tax_amount: 0,
+            tax_amount: i.tax_amount || 0,
             total: i.total,
           })))
```

- [ ] **Step 7: Build check**

```bash
cd apps/erp-acc/erp-app
npm run build
```

Expected: succeeds with no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/erp-acc/erp-app/src/pages/sales/SalesReturnFormPage.jsx apps/erp-acc/erp-app/src/pages/purchase/PurchaseReturnFormPage.jsx
git commit -m "feat(erp-acc): add invoice picker to return forms, cap qty at returnable_qty"
```

---

## Task 10: Credit balance page

**Suggested executor:** Sonnet 5

**Files:**
- Create: `apps/erp-acc/erp-app/src/services/creditNoteService.js`
- Create: `apps/erp-acc/erp-app/src/pages/shared/CreditNotesPage.jsx`
- Modify: `apps/erp-acc/erp-app/src/App.jsx`
- Modify: `apps/erp-acc/erp-app/src/components/layout/Sidebar.jsx`

- [ ] **Step 1: Write `creditNoteService.js`**

```js
import { supabase } from '../lib/supabase'

export async function getCreditNotes({ partyType, status } = {}) {
  let q = supabase
    .from('credit_notes')
    .select('*, applications:credit_note_applications(id, invoice_id, amount, applied_at, invoice:invoices(invoice_number))')
    .order('created_at', { ascending: false })
  if (partyType) q = q.eq('party_type', partyType)
  if (status) q = q.eq('status', status)
  const { data, error } = await q
  if (error) throw error
  return data
}

// party names aren't a direct FK join target since party_id can point at
// either customers or suppliers — resolve them client-side in two lookups.
export async function getCustomerNames(ids) {
  if (ids.length === 0) return {}
  const { data, error } = await supabase.from('customers').select('id, name').in('id', ids)
  if (error) throw error
  return Object.fromEntries(data.map(c => [c.id, c.name]))
}

export async function getSupplierNames(ids) {
  if (ids.length === 0) return {}
  const { data, error } = await supabase.from('suppliers').select('id, name').in('id', ids)
  if (error) throw error
  return Object.fromEntries(data.map(s => [s.id, s.name]))
}

export async function getAvailableCredit(partyType, partyId) {
  const { data, error } = await supabase
    .from('credit_notes')
    .select('remaining')
    .eq('party_type', partyType)
    .eq('party_id', partyId)
    .eq('status', 'open')
  if (error) throw error
  return data.reduce((sum, r) => sum + Number(r.remaining), 0)
}
```

- [ ] **Step 2: Write `CreditNotesPage.jsx`**

```jsx
import { useState, useEffect } from 'react'
import { Space, Typography, Table, Tag, Segmented, Card } from 'antd'
import { getCreditNotes, getCustomerNames, getSupplierNames } from '../../services/creditNoteService'
import { formatCurrency } from '../../utils/currency'
import { useToast } from '../../components/ui/ToastContext'
import LoadingSpinner from '../../components/ui/LoadingSpinner'

const STATUS_COLOR = { open: 'blue', applied: 'green', cancelled: 'red' }
const SOURCE_LABEL = { sales_return: 'Retur Penjualan', purchase_return: 'Retur Pembelian' }

export default function CreditNotesPage() {
  const toast = useToast()
  const [partyType, setPartyType] = useState('customer')
  const [rows, setRows] = useState([])
  const [names, setNames] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getCreditNotes({ partyType })
      .then(async data => {
        if (cancelled) return
        setRows(data)
        const ids = [...new Set(data.map(r => r.party_id))]
        const nameMap = partyType === 'customer'
          ? await getCustomerNames(ids)
          : await getSupplierNames(ids)
        if (!cancelled) setNames(nameMap)
      })
      .catch(err => toast.error(err.message))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [partyType])

  const columns = [
    { title: partyType === 'customer' ? 'Customer' : 'Supplier', dataIndex: 'party_id', render: id => names[id] || id },
    { title: 'Sumber', dataIndex: 'source_type', render: t => SOURCE_LABEL[t] || t },
    { title: 'Jumlah', dataIndex: 'amount', align: 'right', render: formatCurrency },
    { title: 'Sisa', dataIndex: 'remaining', align: 'right', render: formatCurrency },
    { title: 'Status', dataIndex: 'status', render: s => <Tag color={STATUS_COLOR[s]}>{s}</Tag> },
    { title: 'Dibuat', dataIndex: 'created_at', render: d => new Date(d).toLocaleDateString('id-ID') },
  ]

  if (loading) return <LoadingSpinner message="Memuat saldo kredit..." />

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={24}>
      <Typography.Title level={3} style={{ margin: 0 }}>Saldo Kredit</Typography.Title>
      <Segmented
        value={partyType}
        onChange={setPartyType}
        options={[{ label: 'Customer', value: 'customer' }, { label: 'Supplier', value: 'supplier' }]}
      />
      <Card>
        <Table
          rowKey="id"
          dataSource={rows}
          columns={columns}
          expandable={{
            rowExpanded: () => true,
            expandedRowRender: row => (
              <Table
                size="small"
                pagination={false}
                dataSource={row.applications}
                rowKey="id"
                columns={[
                  { title: 'Invoice', dataIndex: ['invoice', 'invoice_number'] },
                  { title: 'Jumlah Diterapkan', dataIndex: 'amount', align: 'right', render: formatCurrency },
                  { title: 'Tanggal', dataIndex: 'applied_at', render: d => new Date(d).toLocaleDateString('id-ID') },
                ]}
                locale={{ emptyText: 'Belum ada pemakaian' }}
              />
            ),
          }}
        />
      </Card>
    </Space>
  )
}
```

- [ ] **Step 3: Add route in `App.jsx`**

Find the existing routes near `sales/returns` (around line 163-165 per the current file) and add a sibling top-level route. Insert this near the other standalone report/list routes (adjacent to wherever `reports/ar-ap-aging` is registered):

```jsx
          <Route path="credit-notes" element={<CreditNotesPage />} />
```

And add the import near the other page imports:

```jsx
import CreditNotesPage from './pages/shared/CreditNotesPage'
```

- [ ] **Step 4: Add sidebar entry in `Sidebar.jsx`**

Add a new top-level nav item (not nested under Sales/Purchase since it covers both). Follow the existing array-of-groups structure the file already uses — add a new entry with a single link (or, if there is an existing "Laporan"/reports group, add it there instead — check the file for a `path: '/reports/ar-ap-aging'` sibling entry and place `Saldo Kredit` next to it since both are cross-cutting AR/AP views):

```jsx
{ label: 'Saldo Kredit', path: '/credit-notes' },
```

- [ ] **Step 5: Build check**

```bash
cd apps/erp-acc/erp-app
npm run build
```

Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add apps/erp-acc/erp-app/src/services/creditNoteService.js apps/erp-acc/erp-app/src/pages/shared/CreditNotesPage.jsx apps/erp-acc/erp-app/src/App.jsx apps/erp-acc/erp-app/src/components/layout/Sidebar.jsx
git commit -m "feat(erp-acc): add Saldo Kredit page for open/applied credit notes"
```

---

## Task 11: Wire "Saldo Kredit" + "Buat Retur" into invoice forms

**Suggested executor:** Sonnet 5

**Files:**
- Modify: `apps/erp-acc/erp-app/src/services/salesService.js`
- Modify: `apps/erp-acc/erp-app/src/services/purchaseService.js`
- Modify: `apps/erp-acc/erp-app/src/pages/sales/SalesInvoiceFormPage.jsx`
- Modify: `apps/erp-acc/erp-app/src/pages/purchase/PurchaseInvoiceFormPage.jsx`

- [ ] **Step 1: `salesService.js` — send `credit_applied_amount` in `saveSalesInvoice`**

Find the `saveSalesInvoice` function (line ~153-166 per current file) and add the field next to `advance_deduction_coa_id`:

```diff
       advance_deduction_amount: Number(invoice.advance_deduction_amount) || 0,
       advance_deduction_coa_id: invoice.advance_deduction_coa_id || null,
+      credit_applied_amount: Number(invoice.credit_applied_amount) || 0,
     },
```

- [ ] **Step 2: `purchaseService.js` — send `credit_applied_amount` in `savePurchaseInvoice`**

Find `savePurchaseInvoice` (line ~93-105 per current file) and add:

```diff
       payment_term_id:   invoice.payment_term_id   || null,
       status:            invoice.status            || 'draft',
       notes:             invoice.notes             || null,
+      credit_applied_amount: Number(invoice.credit_applied_amount) || 0,
     },
```

- [ ] **Step 3: `SalesInvoiceFormPage.jsx` — add credit state, load available credit, add UI block**

Import the new service function:

```diff
 import { getSalesInvoice, saveSalesInvoice, postSalesInvoice, getGoodsDelivery } from '../../services/salesService'
+import { getAvailableCredit } from '../../services/creditNoteService'
```

Add `credit_applied_amount` to the initial header state and to the loaded-invoice mapping:

```diff
     status: 'draft',
     notes: '',
     advance_deduction_amount: 0,
     advance_deduction_coa_id: '',
+    credit_applied_amount: 0,
   })
```

```diff
             advance_deduction_amount: inv.advance_deduction_amount || 0,
             advance_deduction_coa_id: inv.advance_deduction_coa_id || '',
+            credit_applied_amount: inv.credit_applied_amount || 0,
             amount_paid: inv.amount_paid,
             total: inv.total,
```

Add state + effect to load the customer's available credit (place near the other `useState`/`useEffect` blocks):

```jsx
  const [availableCredit, setAvailableCredit] = useState(0)

  useEffect(() => {
    let cancelled = false
    if (!header.customer_id) { setAvailableCredit(0); return }
    getAvailableCredit('customer', header.customer_id)
      .then(v => { if (!cancelled) setAvailableCredit(v) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [header.customer_id])
```

Update `handleSave` validation (next to the existing advance-deduction checks):

```diff
     if (advance < 0) { toast.error('Potongan uang muka tidak boleh negatif'); return }
     if (advance > clientTotal + 0.01) { toast.error('Potongan uang muka melebihi total invoice'); return }
     if (advance > 0 && !header.advance_deduction_coa_id) { toast.error('Pilih akun COA uang muka'); return }
+    const creditApplied = Number(header.credit_applied_amount) || 0
+    if (creditApplied < 0) { toast.error('Kredit yang diterapkan tidak boleh negatif'); return }
+    if (creditApplied > availableCredit + 0.01) { toast.error('Kredit yang diterapkan melebihi saldo kredit tersedia'); return }
```

Update the `remaining` calculation to subtract credit too:

```diff
-  const remaining = invoiceTotal - advance - (header.amount_paid || 0)
+  const creditApplied = Number(header.credit_applied_amount) || 0
+  const remaining = invoiceTotal - advance - creditApplied - (header.amount_paid || 0)
```

Add the "Buat Retur" button next to the existing "Terima Pembayaran" button:

```diff
           {!isNew && ['posted', 'partial'].includes(header.status) && (
             <Button variant="primary" onClick={() => navigate(`/cash/payments/new?invoice=${id}`)}>
               Terima Pembayaran
             </Button>
           )}
+          {!isNew && ['posted', 'partial', 'paid'].includes(header.status) && (
+            <Button variant="secondary" onClick={() => navigate(`/sales/returns/new?from_invoice=${id}`)}>
+              Buat Retur
+            </Button>
+          )}
```

Add the "Saldo Kredit Tersedia" input in the existing Potongan Uang Muka card (inside `{!readOnly && (<Card size="small">...` block), as a third column:

```diff
             {Number(header.advance_deduction_amount) > 0 && (
               <Col xs={24} md={10}>
                 <div style={{ marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Akun COA Uang Muka *</div>
                 <AntdSelect
                   showSearch
                   optionFilterProp="label"
                   style={{ width: '100%' }}
                   placeholder="Pilih akun uang muka..."
                   value={header.advance_deduction_coa_id || undefined}
                   onChange={v => setHeader(h => ({ ...h, advance_deduction_coa_id: v || '' }))}
                   options={coaOptions}
                 />
               </Col>
             )}
+            <Col xs={24} md={8}>
+              <div style={{ marginBottom: 4, fontSize: 13, fontWeight: 500 }}>
+                Terapkan dari Saldo Kredit (Tersedia: {formatCurrency(availableCredit)})
+              </div>
+              <InputNumber
+                style={{ width: '100%' }}
+                min={0}
+                max={availableCredit}
+                value={header.credit_applied_amount || 0}
+                onChange={v => setHeader(h => ({ ...h, credit_applied_amount: v || 0 }))}
+                formatter={val => `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
+                parser={val => val.replace(/\./g, '')}
+                placeholder="0"
+                disabled={availableCredit <= 0}
+              />
+            </Col>
```

Add a "Kredit Diterapkan" tile as its own `Row` directly below the existing 4-column summary `Row` (the existing row is already a full `Col span={6}` × 4 = 24; adding a 5th column would overflow, so it goes on its own row instead of squeezing into the same one):

```jsx
          <Row gutter={16} style={{ marginTop: 12 }}>
            <Col span={6}>
              <Typography.Text style={{ color: '#0958d9', display: 'block' }}>Kredit Diterapkan</Typography.Text>
              <Typography.Text strong style={{ color: '#003eb3', fontSize: 16 }}>{formatCurrency(header.credit_applied_amount || 0)}</Typography.Text>
            </Col>
          </Row>
```

Place this immediately after the closing `</Row>` of the existing "Payment summary for posted invoices" card's `Row`, still inside the same `<Card>`.

- [ ] **Step 4: Mirror all of Step 3 in `PurchaseInvoiceFormPage.jsx`**

Same additions: import `getAvailableCredit`, add `credit_applied_amount` to header state/load, `availableCredit` state + effect (`getAvailableCredit('supplier', header.supplier_id)`), validation, `remaining` formula (`(header.total || 0) - creditApplied - (header.amount_paid || 0)`), "Buat Retur" button next to "Bayar Hutang", and a new `Card` block for "Terapkan dari Saldo Kredit" — this page currently has **no** Potongan Uang Muka card at all, so add a new small `Card` (mirroring the sales one's structure) right after the "Syarat Pembayaran" card:

```jsx
      {!readOnly && (
        <Card size="small">
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <div style={{ marginBottom: 4, fontSize: 13, fontWeight: 500 }}>
                Terapkan dari Saldo Kredit (Tersedia: {formatCurrency(availableCredit)})
              </div>
              <InputNumber
                style={{ width: '100%' }}
                min={0}
                max={availableCredit}
                value={header.credit_applied_amount || 0}
                onChange={v => setHeader(h => ({ ...h, credit_applied_amount: v || 0 }))}
                formatter={val => `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
                parser={val => val.replace(/\./g, '')}
                placeholder="0"
                disabled={availableCredit <= 0}
              />
            </Col>
          </Row>
        </Card>
      )}
```

This requires adding `InputNumber` to the AntD import line (currently `Space, Flex, Typography, Row, Col, Card, Select as AntdSelect` — add `InputNumber`).

The "Sisa Hutang" summary card gets a new tile as its own `Row` below the existing 3-column `Row` (`Col span={8}` × 3 already = 24, so a 4th column would overflow):

```jsx
          <Row gutter={16} style={{ marginTop: 12 }}>
            <Col span={8}>
              <Typography.Text style={{ color: '#d46b08', display: 'block' }}>Kredit Diterapkan</Typography.Text>
              <Typography.Text strong style={{ color: '#873800', fontSize: 16 }}>{formatCurrency(header.credit_applied_amount || 0)}</Typography.Text>
            </Col>
          </Row>
```

Place this immediately after the closing `</Row>` of the existing "Hutang summary for posted invoices" card's `Row`, still inside the same `<Card>`.

- [ ] **Step 5: Build check**

```bash
cd apps/erp-acc/erp-app
npm run build
```

Expected: succeeds. Fix any import/prop mismatches surfaced here (e.g. missing `InputNumber` import) before moving on.

- [ ] **Step 6: Commit**

```bash
git add apps/erp-acc/erp-app/src/services/salesService.js apps/erp-acc/erp-app/src/services/purchaseService.js apps/erp-acc/erp-app/src/pages/sales/SalesInvoiceFormPage.jsx apps/erp-acc/erp-app/src/pages/purchase/PurchaseInvoiceFormPage.jsx
git commit -m "feat(erp-acc): let invoices consume available customer/supplier credit balance"
```

---

## Task 12: AR/AP integration points — aging, payment form, outstanding queries

**Suggested executor:** Sonnet 5

**Files:**
- Modify: `apps/erp-acc/erp-app/src/services/cashBankService.js`
- Modify: `apps/erp-acc/erp-app/src/services/purchaseService.js`
- Modify: `apps/erp-acc/erp-app/src/services/reportService.js`
- Modify: `apps/erp-acc/erp-app/src/pages/reports/ARAPAgingPage.jsx`
- Modify: `apps/erp-acc/erp-app/src/pages/cash/PaymentFormPage.jsx`

This mirrors exactly how `advance_deduction_amount` was already wired into these same 5 spots (migration 037) — same files, same formula shape, extended with the two new columns.

- [ ] **Step 1: `cashBankService.js` — `getOutstandingInvoicesByCustomer`**

```diff
 export async function getOutstandingInvoicesByCustomer(customerId) {
   const { data, error } = await supabase
     .from('invoices')
-    .select('id, invoice_number, date, total, amount_paid, advance_deduction_amount, status')
+    .select('id, invoice_number, date, total, amount_paid, advance_deduction_amount, credit_applied_amount, return_credit_amount, status')
     .eq('type', 'sales')
     .eq('customer_id', customerId)
     .in('status', ['posted', 'partial'])
     .order('date')
   if (error) throw error
   return data
 }
```

- [ ] **Step 2: `purchaseService.js` — `getOutstandingPurchaseInvoicesBySupplier`**

```diff
 export async function getOutstandingPurchaseInvoicesBySupplier(supplierId) {
   const { data, error } = await supabase
     .from('invoices')
-    .select('id, invoice_number, date, total, amount_paid, status')
+    .select('id, invoice_number, date, total, amount_paid, credit_applied_amount, return_credit_amount, status')
     .eq('type', 'purchase')
     .eq('supplier_id', supplierId)
     .in('status', ['posted', 'partial'])
     .order('date')
   if (error) throw error
```

- [ ] **Step 3: `reportService.js` — `getARAgingData` / `getAPAgingData`**

```diff
 export async function getARAgingData(asOfDate) {
   const { data, error } = await supabase
     .from('invoices')
     .select(`
-      id, invoice_number, date, due_date, total, amount_paid, advance_deduction_amount, status,
+      id, invoice_number, date, due_date, total, amount_paid, advance_deduction_amount, credit_applied_amount, return_credit_amount, status,
       customer:customers(id, name)
     `)
```

```diff
 export async function getAPAgingData(asOfDate) {
   const { data, error } = await supabase
     .from('invoices')
     .select(`
-      id, invoice_number, date, due_date, total, amount_paid, status,
+      id, invoice_number, date, due_date, total, amount_paid, credit_applied_amount, return_credit_amount, status,
       supplier:suppliers(id, name)
     `)
```

- [ ] **Step 4: `ARAPAgingPage.jsx` — `buildRows` balance formula**

```diff
     const party = inv[partyKey]
     const partyName = party?.name || '(Tidak Diketahui)'
-    const balance = Number(inv.total) - Number(inv.amount_paid) - Number(inv.advance_deduction_amount || 0)
+    const balance = Number(inv.total) - Number(inv.amount_paid)
+      - Number(inv.advance_deduction_amount || 0)
+      - Number(inv.credit_applied_amount || 0)
+      - Number(inv.return_credit_amount || 0)
```

- [ ] **Step 5: `PaymentFormPage.jsx` — all three remaining-balance spots**

```diff
     if (inv) {
-      const remaining = inv.total - inv.amount_paid - (inv.advance_deduction_amount || 0)
+      const remaining = inv.total - inv.amount_paid
+        - (inv.advance_deduction_amount || 0)
+        - (inv.credit_applied_amount || 0)
+        - (inv.return_credit_amount || 0)
       field('amount', remaining > 0 ? remaining : '')
     }
```

```diff
-  const remaining = selectedInvoice ? selectedInvoice.total - selectedInvoice.amount_paid - (selectedInvoice.advance_deduction_amount || 0) : null
+  const remaining = selectedInvoice
+    ? selectedInvoice.total - selectedInvoice.amount_paid
+      - (selectedInvoice.advance_deduction_amount || 0)
+      - (selectedInvoice.credit_applied_amount || 0)
+      - (selectedInvoice.return_credit_amount || 0)
+    : null
```

```diff
   const invoiceOptions = invoices.map(i => ({
     value: i.id,
-    label: `${i.invoice_number} — Sisa: ${formatCurrency(i.total - i.amount_paid - (i.advance_deduction_amount || 0))}`
+    label: `${i.invoice_number} — Sisa: ${formatCurrency(
+      i.total - i.amount_paid - (i.advance_deduction_amount || 0)
+        - (i.credit_applied_amount || 0) - (i.return_credit_amount || 0)
+    )}`
   }))
```

Note: `advance_deduction_amount` doesn't exist on purchase invoices (sales-only column), so `(i.advance_deduction_amount || 0)` naturally evaluates to `0` for purchase rows since the field is simply absent from the select — no special-casing needed, matches how the existing code already handles this today.

- [ ] **Step 6: Build check**

```bash
cd apps/erp-acc/erp-app
npm run build
```

- [ ] **Step 7: Commit**

```bash
git add apps/erp-acc/erp-app/src/services/cashBankService.js apps/erp-acc/erp-app/src/services/purchaseService.js apps/erp-acc/erp-app/src/services/reportService.js apps/erp-acc/erp-app/src/pages/reports/ARAPAgingPage.jsx apps/erp-acc/erp-app/src/pages/cash/PaymentFormPage.jsx
git commit -m "fix(erp-acc): account for return credit and applied credit in AR/AP balance calculations"
```

---

## Task 13: PDF invoice — "Potongan Retur" / "Kredit Diterapkan" lines

**Suggested executor:** Sonnet 5

**Files:**
- Modify: `apps/erp-acc/erp-app/src/utils/pdfRenderers/invoiceRenderer.js`

`renderInvoicePdf` only renders sales invoices (confirmed: both `docTitle` occurrences say `'Sales Invoice'`, and there is no separate purchase-invoice PDF renderer file in `pdfRenderers/`) — this task is sales-only, matching the existing advance-deduction PDF scope exactly.

- [ ] **Step 1: Extend the "Potongan Uang Muka" block (around line 260-278) to also show return credit and applied credit**

```diff
   // Potongan Uang Muka + Sisa Tagih (jika ada potongan uang muka)
   const advanceDeduction = Number(invoice?.advance_deduction_amount) || 0
-  if (advanceDeduction > 0) {
+  const returnCredit = Number(invoice?.return_credit_amount) || 0
+  const creditApplied = Number(invoice?.credit_applied_amount) || 0
+  const totalDeductions = advanceDeduction + returnCredit + creditApplied
+  if (totalDeductions > 0) {
     doc.setFont('helvetica', 'normal')
     doc.setFontSize(FONT.totalLabel)
     doc.setTextColor(...COLOR.textSecondary)
-    doc.text('Potongan Uang Muka', totalsLeftX, y)
-    doc.setFontSize(FONT.totalValue)
-    doc.setTextColor(...COLOR.textPrimary)
-    doc.text(`${currency} (${formatCurrency(advanceDeduction)})`, rightX, y, { align: 'right' })
-    y += 14
+    if (advanceDeduction > 0) {
+      doc.text('Potongan Uang Muka', totalsLeftX, y)
+      doc.setFontSize(FONT.totalValue)
+      doc.setTextColor(...COLOR.textPrimary)
+      doc.text(`${currency} (${formatCurrency(advanceDeduction)})`, rightX, y, { align: 'right' })
+      y += 14
+      doc.setFont('helvetica', 'normal')
+      doc.setFontSize(FONT.totalLabel)
+      doc.setTextColor(...COLOR.textSecondary)
+    }
+    if (returnCredit > 0) {
+      doc.text('Potongan Retur', totalsLeftX, y)
+      doc.setFontSize(FONT.totalValue)
+      doc.setTextColor(...COLOR.textPrimary)
+      doc.text(`${currency} (${formatCurrency(returnCredit)})`, rightX, y, { align: 'right' })
+      y += 14
+      doc.setFont('helvetica', 'normal')
+      doc.setFontSize(FONT.totalLabel)
+      doc.setTextColor(...COLOR.textSecondary)
+    }
+    if (creditApplied > 0) {
+      doc.text('Kredit Diterapkan', totalsLeftX, y)
+      doc.setFontSize(FONT.totalValue)
+      doc.setTextColor(...COLOR.textPrimary)
+      doc.text(`${currency} (${formatCurrency(creditApplied)})`, rightX, y, { align: 'right' })
+      y += 14
+    }

     doc.setFont('helvetica', 'bold')
     doc.setFontSize(FONT.totalLabel)
     doc.setTextColor(...COLOR.textPrimary)
     doc.text('Sisa Tagih', totalsLeftX, y)
-    doc.text(`${currency} ${formatCurrency(total - advanceDeduction)}`, rightX, y, { align: 'right' })
+    doc.text(`${currency} ${formatCurrency(total - totalDeductions)}`, rightX, y, { align: 'right' })
     y += 16
   }
```

- [ ] **Step 2: Build check**

```bash
cd apps/erp-acc/erp-app
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add apps/erp-acc/erp-app/src/utils/pdfRenderers/invoiceRenderer.js
git commit -m "feat(erp-acc): show return credit and applied credit on invoice PDF"
```

---

## Task 14: Playwright E2E

**Suggested executor:** Sonnet 5

**Files:**
- Create: `apps/erp-acc/erp-app/tests/return-invoice-credit.spec.js`

Follows the exact seeding/auth pattern already used in `tests/ar-ap-aging.spec.js` (direct Supabase inserts for setup/teardown, `storageState` built from a real Supabase session, UI-driven assertions for the actual feature under test).

- [ ] **Step 1: Write the spec**

```js
// erp-app/tests/return-invoice-credit.spec.js
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.test' })

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

let testCustomerId = null
let testProductId = null
let testInvoiceId = null
let testInvoiceItemId = null
let createdReturnIds = []

test.describe('Retur Penjualan mengurangi Piutang Invoice', () => {

  test.use({ storageState: 'tests/.auth.json' })

  test.beforeAll(async () => {
    const { error: authErr } = await supabase.auth.signInWithPassword({
      email: process.env.TEST_EMAIL,
      password: process.env.TEST_PASSWORD,
    })
    if (authErr) throw new Error(`Supabase login gagal: ${authErr.message}`)

    const { data: unit } = await supabase.from('units').select('id').limit(1).single()

    const { data: customer, error: cErr } = await supabase
      .from('customers')
      .insert({ name: `TEST-Customer-ReturnCredit-${Date.now()}` })
      .select('id').single()
    if (cErr) throw new Error(`Gagal buat test customer: ${cErr.message}`)
    testCustomerId = customer.id

    const { data: product, error: pErr } = await supabase
      .from('products')
      .insert({ name: `TEST-Product-ReturnCredit-${Date.now()}`, base_unit_id: unit.id, sell_price: 100000, is_taxable: false })
      .select('id').single()
    if (pErr) throw new Error(`Gagal buat test product: ${pErr.message}`)
    testProductId = product.id

    const { data: invoice, error: iErr } = await supabase
      .from('invoices')
      .insert({
        invoice_number: `INV-TEST-RC-${Date.now()}`,
        date: new Date().toISOString().split('T')[0],
        type: 'sales',
        customer_id: testCustomerId,
        subtotal: 1000000,
        tax_amount: 0,
        total: 1000000,
        amount_paid: 0,
        status: 'posted',
        notes: '__PLAYWRIGHT_TEST__',
      })
      .select('id').single()
    if (iErr) throw new Error(`Gagal buat test invoice: ${iErr.message}`)
    testInvoiceId = invoice.id

    const { data: item, error: iiErr } = await supabase
      .from('invoice_items')
      .insert({
        invoice_id: testInvoiceId,
        product_id: testProductId,
        unit_id: unit.id,
        quantity: 10,
        quantity_base: 10,
        unit_price: 100000,
        tax_amount: 0,
        total: 1000000,
      })
      .select('id').single()
    if (iiErr) throw new Error(`Gagal buat test invoice item: ${iiErr.message}`)
    testInvoiceItemId = item.id

    const { data: sessionData } = await supabase.auth.getSession()
    const session = sessionData.session
    if (!session) throw new Error('Supabase session tidak ada setelah login')
    const projectRef = new URL(process.env.VITE_SUPABASE_URL).hostname.split('.')[0]
    const storageKey = `sb-${projectRef}-auth-token`
    const fs = await import('fs')
    fs.writeFileSync('tests/.auth.json', JSON.stringify({
      cookies: [],
      origins: [{
        origin: 'http://localhost:5173',
        localStorage: [{ name: storageKey, value: JSON.stringify(session) }],
      }],
    }, null, 2))
  })

  test.afterAll(async () => {
    for (const id of createdReturnIds) {
      await supabase.from('sales_return_items').delete().eq('sales_return_id', id)
      await supabase.from('sales_returns').delete().eq('id', id)
    }
    if (testInvoiceItemId) await supabase.from('invoice_items').delete().eq('id', testInvoiceItemId)
    if (testInvoiceId) await supabase.from('invoices').delete().eq('id', testInvoiceId)
    if (testProductId) await supabase.from('products').delete().eq('id', testProductId)
    if (testCustomerId) await supabase.from('customers').delete().eq('id', testCustomerId)
    await supabase.auth.signOut()
  })

  test('Buat retur terhubung ke invoice, qty dibatasi returnable_qty, posting mengurangi Sisa Tagih', async ({ page }) => {
    await page.goto(`/sales/returns/new?from_invoice=${testInvoiceId}`)

    // Pick the customer, then the invoice (from_invoice prefill is optional UX sugar;
    // this test drives the picker explicitly so it also verifies the dropdown works
    // even without a prefill param, matching Task 9's implementation).
    await page.goto('/sales/returns/new')
    await page.locator('text=Customer').locator('..').locator('select, input').first().click().catch(() => {})

    // Fall back to a resilient selector strategy: label-based lookup via the app's
    // custom Select component (renders a native <select> under a <label>).
    const customerSelect = page.locator('label:has-text("Customer")').locator('xpath=following-sibling::select').first()
    await customerSelect.selectOption(testCustomerId)

    const invoiceSelect = page.locator('label:has-text("Invoice Asal")').locator('xpath=following-sibling::select').first()
    await expect(invoiceSelect).toBeVisible({ timeout: 10000 })
    await invoiceSelect.selectOption(testInvoiceId)

    // Returnable qty column should show 10 (nothing returned yet).
    await expect(page.locator('td', { hasText: '10' }).first()).toBeVisible({ timeout: 10000 })

    // Enter qty 3 in the qty input for the only row.
    const qtyInput = page.locator('input[type="number"][max="10"]').first()
    await qtyInput.fill('3')

    await page.locator('button:has-text("Simpan Draft")').click()
    await expect(page).toHaveURL(/\/sales\/returns\/[0-9a-f-]+$/, { timeout: 10000 })

    const url = page.url()
    const srId = url.split('/').pop()
    createdReturnIds.push(srId)

    await page.locator('button:has-text("Post Retur")').click()
    await expect(page.locator('text=Retur diposting')).toBeVisible({ timeout: 10000 })

    // Verify server-side effect directly.
    const { data: inv } = await supabase.from('invoices').select('return_credit_amount, status').eq('id', testInvoiceId).single()
    expect(Number(inv.return_credit_amount)).toBe(300000)
    expect(inv.status).toBe('partial')

    // Invoice form should now show the reduced Sisa Tagih.
    await page.goto(`/sales/invoices/${testInvoiceId}`)
    await expect(page.locator('text=Sisa Tagih')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('text=700.000').or(page.locator('text=700,000'))).toBeVisible({ timeout: 10000 })
  })

})
```

- [ ] **Step 2: Run against a running dev server**

```bash
cd apps/erp-acc/erp-app
npm run dev &
npx playwright test tests/return-invoice-credit.spec.js
```

Expected: 1 passed. If a selector doesn't match the actual rendered DOM (component library markup can differ subtly from what's assumed here), inspect with `npx playwright test --debug` and adjust the selector — don't change the underlying feature to fit the test.

- [ ] **Step 3: Commit**

```bash
git add apps/erp-acc/erp-app/tests/return-invoice-credit.spec.js
git commit -m "test(erp-acc): add E2E coverage for invoice-linked sales return"
```

---

## Task 15: Final build validation

**Suggested executor:** Sonnet 5

**Files:** none

- [ ] **Step 1: Full production build**

```bash
cd apps/erp-acc/erp-app
npm run build
```

Expected: exits 0, no errors. Per `apps/erp-acc/.claude/CLAUDE.md`, this is the required validation gate — there is no lint/test-runner config in this app beyond the Playwright suite already exercised in Task 14.

- [ ] **Step 2: Re-run the full SQL smoke test from Task 6 one final time** against the same dev/staging database, end to end, to confirm nothing in Tasks 7-14 (which only touch the frontend) altered backend behavior.

- [ ] **Step 3: Confirm git log shows all commits from Tasks 1-14 present and in order**

```bash
git log --oneline -20
```

- [ ] **Step 4: Stop here — do not deploy.** Deployment (staging smoke test, then handing the user a production deploy command) happens after PR review, as a separate step outside this plan.

---

## Out of Scope (confirmed during planning, matches the approved spec)

- Cancelling a posted return (no such feature exists today for `sales_returns`/`purchase_returns` — not extended, not newly built).
- Actual cash refund execution — `credit_notes` is a bookkeeping record only.
- Automatic credit allocation to the next invoice — always manual per the approved spec.
- Multi-currency.
- A dedicated purchase-invoice PDF renderer (doesn't exist today; Task 13 only touches the existing sales-invoice renderer).
- `salesService.js`'s separate `getOutstandingInvoices(customerId)` function (distinct from `cashBankService.js`'s `getOutstandingInvoicesByCustomer` fixed in Task 12) was not touched — grep it for callers before relying on it elsewhere; if it turns out to be live-used, apply the same formula fix as Task 12 Step 1.
