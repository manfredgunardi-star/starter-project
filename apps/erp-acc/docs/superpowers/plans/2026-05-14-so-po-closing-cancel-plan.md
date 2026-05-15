# SO/PO Closing + Document Cancel — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambah quantity tracking partial fulfillment di SO/PO, auto‑close + manual short‑close, dan cancel periode‑aware untuk semua dokumen posted (SO/PO/GD/GR/SI/PI).

**Architecture:** Migrasi 027 menambah kolom `quantity_delivered/received/invoiced` ke line items + status enum baru (`closed`, `cancelled`) + audit columns. RPC baru `recompute_so_status`/`recompute_po_status` dipanggil dari posting RPC existing. RPC `cancel_*` per dokumen membalik jurnal pada tanggal sesuai keputusan periode‑aware (periode buka → tanggal asal; periode tertutup → ditolak). UI menambah tombol Cancel/Close + section Fulfillment Progress.

**Tech Stack:** Supabase Postgres (PL/pgSQL), React 19 + Ant Design 6, Vite, Playwright e2e.

**Spec:** [`apps/erp-acc/docs/superpowers/specs/2026-05-14-master-data-retur-cancel-closing-design.md`](../specs/2026-05-14-master-data-retur-cancel-closing-design.md) §4

**Prerequisites:** Phase 1 plan applied (untuk warehouse_id konsistensi, tapi tidak strict blocker).

**Total estimasi:** 5-7 hari developer.

---

## File Structure

### New Files
| File | Responsibility | Suggested Executor |
|---|---|---|
| `apps/erp-acc/erp-app/supabase/migrations/027_so_po_closing_cancel.sql` | Schema changes + backfill historis + 14 RPC | Claude Opus |
| `apps/erp-acc/erp-app/src/components/shared/CancelDocumentModal.jsx` | Reusable modal: cancel reason input | Codex (Sonnet) |
| `apps/erp-acc/erp-app/src/components/shared/CloseOrderModal.jsx` | Reusable modal: close reason input | Codex (Sonnet) |
| `apps/erp-acc/erp-app/src/components/shared/FulfillmentProgress.jsx` | Tabel ordered/delivered/invoiced/outstanding | Codex (Sonnet) |
| `apps/erp-acc/erp-app/tests/playwright/so-po-closing.spec.js` | E2E auto‑close + manual short‑close | Codex (Sonnet) |
| `apps/erp-acc/erp-app/tests/playwright/document-cancel.spec.js` | E2E cancel posted document | Claude Opus |

### Modified Files
| File | Change | Suggested Executor |
|---|---|---|
| `apps/erp-acc/erp-app/src/services/salesService.js` | + `closeSalesOrder`, `cancelSalesOrder`, `cancelGoodsDelivery`, `cancelSalesInvoice` | Codex (Sonnet) |
| `apps/erp-acc/erp-app/src/services/purchaseService.js` | + close + cancel functions (mirror) | Codex (Sonnet) |
| `apps/erp-acc/erp-app/src/pages/sales/SalesOrderFormPage.jsx` | Tombol Close + Cancel + FulfillmentProgress | Codex (Sonnet) |
| `apps/erp-acc/erp-app/src/pages/sales/SalesOrdersPage.jsx` | Filter status + badge | Codex (Sonnet) |
| `apps/erp-acc/erp-app/src/pages/sales/GoodsDeliveriesPage.jsx` | Tombol Cancel di list | Codex (Sonnet) |
| `apps/erp-acc/erp-app/src/pages/sales/SalesInvoicesPage.jsx` | Tombol Cancel di list | Codex (Sonnet) |
| `apps/erp-acc/erp-app/src/pages/purchase/PurchaseOrderFormPage.jsx` | Tombol Close + Cancel + FulfillmentProgress | Codex (Sonnet) |
| `apps/erp-acc/erp-app/src/pages/purchase/PurchaseOrdersPage.jsx` | Filter status + badge | Codex (Sonnet) |
| `apps/erp-acc/erp-app/src/pages/purchase/GoodsReceiptsPage.jsx` | Tombol Cancel | Codex (Sonnet) |
| `apps/erp-acc/erp-app/src/pages/purchase/PurchaseInvoicesPage.jsx` | Tombol Cancel | Codex (Sonnet) |

---

## Task 1: SQL Migration — Schema (Status, Quantity, Audit Columns)

**Suggested executor:** Claude Opus

**Files:**
- Create: `apps/erp-acc/erp-app/supabase/migrations/027_so_po_closing_cancel.sql`

- [ ] **Step 1: Tulis SECTION A & B (schema only)**

```sql
-- ============================================================
-- Migration 027: SO/PO Closing + Cancel
-- A. Quantity tracking per line item
-- B. Status enum extension (closed, cancelled)
-- C. Audit columns
-- D. Backfill historis (separate task)
-- E. Recompute + Close + Cancel RPCs (separate tasks)
-- ============================================================

-- A. Quantity tracking
alter table sales_order_items
  add column quantity_delivered numeric(15,4) not null default 0 check (quantity_delivered >= 0),
  add column quantity_invoiced  numeric(15,4) not null default 0 check (quantity_invoiced  >= 0);

alter table purchase_order_items
  add column quantity_received numeric(15,4) not null default 0 check (quantity_received >= 0),
  add column quantity_invoiced numeric(15,4) not null default 0 check (quantity_invoiced >= 0);

-- B. Status enum extension
alter table sales_orders drop constraint sales_orders_status_check;
alter table sales_orders add constraint sales_orders_status_check
  check (status in ('draft','confirmed','invoiced','done','closed','cancelled'));

alter table purchase_orders drop constraint purchase_orders_status_check;
alter table purchase_orders add constraint purchase_orders_status_check
  check (status in ('draft','confirmed','received','done','closed','cancelled'));

alter table goods_deliveries drop constraint goods_deliveries_status_check;
alter table goods_deliveries add constraint goods_deliveries_status_check
  check (status in ('draft','posted','cancelled'));

alter table goods_receipts drop constraint goods_receipts_status_check;
alter table goods_receipts add constraint goods_receipts_status_check
  check (status in ('draft','posted','cancelled'));

alter table invoices drop constraint invoices_status_check;
alter table invoices add constraint invoices_status_check
  check (status in ('draft','posted','partial','paid','cancelled'));

-- C. Audit columns: SO/PO get close + cancel; GD/GR/SI/PI get cancel only
alter table sales_orders
  add column closed_at timestamptz,
  add column closed_by uuid references auth.users(id),
  add column close_reason text,
  add column cancelled_at timestamptz,
  add column cancelled_by uuid references auth.users(id),
  add column cancel_reason text;

alter table purchase_orders
  add column closed_at timestamptz,
  add column closed_by uuid references auth.users(id),
  add column close_reason text,
  add column cancelled_at timestamptz,
  add column cancelled_by uuid references auth.users(id),
  add column cancel_reason text;

alter table goods_deliveries
  add column cancelled_at timestamptz,
  add column cancelled_by uuid references auth.users(id),
  add column cancel_reason text,
  add column reversed_journal_id uuid references journals(id);

alter table goods_receipts
  add column cancelled_at timestamptz,
  add column cancelled_by uuid references auth.users(id),
  add column cancel_reason text,
  add column reversed_journal_id uuid references journals(id);

alter table invoices
  add column cancelled_at timestamptz,
  add column cancelled_by uuid references auth.users(id),
  add column cancel_reason text,
  add column reversed_journal_id uuid references journals(id);

-- Indexes
create index idx_so_items_so on sales_order_items(sales_order_id);
create index idx_po_items_po on purchase_order_items(purchase_order_id);
```

> Catatan: section D (backfill historis) ada di Task 2. Section E (RPC) di Tasks 3-9.

- [ ] **Step 2: Apply migrasi (schema only — section A-C)**

```bash
cd apps/erp-acc/erp-app
npx supabase db push
```

- [ ] **Step 3: Verify schema**

```sql
select column_name from information_schema.columns
  where table_name='sales_order_items' and column_name like 'quantity_%';
-- Expected: quantity, quantity_base, quantity_delivered, quantity_invoiced

select column_name from information_schema.columns
  where table_name='purchase_order_items' and column_name like 'quantity_%';
-- Expected: quantity, quantity_base, quantity_received, quantity_invoiced

select column_name from information_schema.columns
  where table_name='sales_orders' and column_name in
    ('closed_at','closed_by','close_reason','cancelled_at','cancelled_by','cancel_reason');
-- Expected: 6 rows
```

- [ ] **Step 4: Commit**

```bash
git add apps/erp-acc/erp-app/supabase/migrations/027_so_po_closing_cancel.sql
git commit -m "feat(erp-acc): add quantity tracking + cancel/close columns to SO/PO/GD/GR/Invoice"
```

---

## Task 2: SQL — Backfill Historis quantity_delivered/received/invoiced

**Suggested executor:** Claude Opus — data correctness critical, idempotent + ordering reasoning.

**Files:**
- Modify: `apps/erp-acc/erp-app/supabase/migrations/027_so_po_closing_cancel.sql` (append SECTION D)

- [ ] **Step 1: Append backfill SQL**

```sql
-- D. BACKFILL HISTORIS
-- Strategy: untuk setiap SO line, sum qty_base dari semua GD posted yang link ke SO ini
-- WITH product matching (first-match by product_id).
-- Asumsi: dalam 1 SO, tidak ada 2 line dengan product_id sama (typical).

-- D1. quantity_delivered untuk SO line items
update sales_order_items soi
   set quantity_delivered = coalesce(sub.delivered, 0)
  from (
    select
      gdi.product_id,
      gd.sales_order_id,
      sum(gdi.quantity_base) as delivered
    from goods_delivery_items gdi
    join goods_deliveries gd on gd.id = gdi.goods_delivery_id
    where gd.status = 'posted' and gd.sales_order_id is not null
    group by gdi.product_id, gd.sales_order_id
  ) sub
 where soi.sales_order_id = sub.sales_order_id
   and soi.product_id = sub.product_id
   and soi.quantity_delivered = 0;  -- idempotent: skip yang sudah ada nilai

-- D2. quantity_invoiced untuk SO line items
update sales_order_items soi
   set quantity_invoiced = coalesce(sub.invoiced, 0)
  from (
    select
      ii.product_id,
      i.sales_order_id,
      sum(ii.quantity_base) as invoiced
    from invoice_items ii
    join invoices i on i.id = ii.invoice_id
    where i.type = 'sales' and i.status in ('posted','partial','paid')
      and i.sales_order_id is not null
    group by ii.product_id, i.sales_order_id
  ) sub
 where soi.sales_order_id = sub.sales_order_id
   and soi.product_id = sub.product_id
   and soi.quantity_invoiced = 0;

-- D3. quantity_received untuk PO line items (mirror D1)
update purchase_order_items poi
   set quantity_received = coalesce(sub.received, 0)
  from (
    select
      gri.product_id,
      gr.purchase_order_id,
      sum(gri.quantity_base) as received
    from goods_receipt_items gri
    join goods_receipts gr on gr.id = gri.goods_receipt_id
    where gr.status = 'posted' and gr.purchase_order_id is not null
    group by gri.product_id, gr.purchase_order_id
  ) sub
 where poi.purchase_order_id = sub.purchase_order_id
   and poi.product_id = sub.product_id
   and poi.quantity_received = 0;

-- D4. quantity_invoiced untuk PO line items (mirror D2)
update purchase_order_items poi
   set quantity_invoiced = coalesce(sub.invoiced, 0)
  from (
    select
      ii.product_id,
      i.purchase_order_id,
      sum(ii.quantity_base) as invoiced
    from invoice_items ii
    join invoices i on i.id = ii.invoice_id
    where i.type = 'purchase' and i.status in ('posted','partial','paid')
      and i.purchase_order_id is not null
    group by ii.product_id, i.purchase_order_id
  ) sub
 where poi.purchase_order_id = sub.purchase_order_id
   and poi.product_id = sub.product_id
   and poi.quantity_invoiced = 0;
```

- [ ] **Step 2: Apply + verify dengan 5 sample SO**

```sql
-- Pilih 5 SO yang punya GD posted
select so.id, so.so_number,
       sum(soi.quantity_base) as ordered,
       sum(soi.quantity_delivered) as delivered,
       sum(soi.quantity_invoiced) as invoiced
  from sales_orders so
  join sales_order_items soi on soi.sales_order_id = so.id
 where so.status in ('confirmed','invoiced','done')
 group by so.id, so.so_number
 limit 5;

-- Cross-check: jumlah delivered vs sum dari GD asli
-- (manual spot check, bandingkan 2-3 SO)
```

- [ ] **Step 3: Commit**

```bash
git add apps/erp-acc/erp-app/supabase/migrations/027_so_po_closing_cancel.sql
git commit -m "feat(erp-acc): backfill SO/PO quantity_delivered/received/invoiced from history"
```

---

## Task 3: SQL RPC — recompute_so_status & recompute_po_status

**Suggested executor:** Claude Opus

**Files:**
- Modify: `apps/erp-acc/erp-app/supabase/migrations/027_so_po_closing_cancel.sql` (append SECTION E1)

- [ ] **Step 1: Append RPC**

```sql
-- E1. Recompute helpers — dipanggil setelah perubahan qty_delivered/received/invoiced.
--     Idempotent. Tidak menyentuh status 'closed' (manual short-close protected) atau 'cancelled'.

create or replace function recompute_so_status(p_so_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status   text;
  v_ordered  numeric := 0;
  v_delivered numeric := 0;
  v_invoiced numeric := 0;
begin
  select status into v_status from sales_orders where id = p_so_id for update;
  if v_status in ('closed','cancelled','draft') then return; end if;

  select coalesce(sum(quantity_base),0),
         coalesce(sum(quantity_delivered),0),
         coalesce(sum(quantity_invoiced),0)
    into v_ordered, v_delivered, v_invoiced
    from sales_order_items where sales_order_id = p_so_id;

  if v_ordered > 0 and v_delivered >= v_ordered and v_invoiced >= v_ordered then
    update sales_orders set status='done' where id=p_so_id;
  elsif v_invoiced > 0 then
    update sales_orders set status='invoiced' where id=p_so_id;
  else
    update sales_orders set status='confirmed' where id=p_so_id;
  end if;
end $$;

create or replace function recompute_po_status(p_po_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status   text;
  v_ordered  numeric := 0;
  v_received numeric := 0;
  v_invoiced numeric := 0;
begin
  select status into v_status from purchase_orders where id = p_po_id for update;
  if v_status in ('closed','cancelled','draft') then return; end if;

  select coalesce(sum(quantity_base),0),
         coalesce(sum(quantity_received),0),
         coalesce(sum(quantity_invoiced),0)
    into v_ordered, v_received, v_invoiced
    from purchase_order_items where purchase_order_id = p_po_id;

  if v_ordered > 0 and v_received >= v_ordered and v_invoiced >= v_ordered then
    update purchase_orders set status='done' where id=p_po_id;
  elsif v_invoiced > 0 then
    update purchase_orders set status='invoiced' where id=p_po_id;
  else
    update purchase_orders set status='confirmed' where id=p_po_id;
  end if;
end $$;
```

> **Catatan:** PO existing punya status 'received' di constraint asli — kita ganti dengan 'confirmed' (sebelum invoiced) + 'invoiced' (mid) + 'done' (full). Status 'received' di‑deprecate. Dokumentasikan di migration comment kalau perlu transisi data.

Tambahkan migrasi cleanup status 'received' lama ke 'confirmed':

```sql
-- D5. Cleanup: status 'received' lama → 'confirmed' (akan recompute setelahnya)
update purchase_orders set status='confirmed'
  where status='received';
```

Letakkan di akhir SECTION D, sebelum E1.

- [ ] **Step 2: Test RPC manual**

```sql
-- Pilih 1 SO + 1 PO existing, panggil recompute, verifikasi status update
select recompute_so_status('<so_id>');
select status from sales_orders where id='<so_id>';

select recompute_po_status('<po_id>');
select status from purchase_orders where id='<po_id>';
```

- [ ] **Step 3: Commit**

```bash
git add apps/erp-acc/erp-app/supabase/migrations/027_so_po_closing_cancel.sql
git commit -m "feat(erp-acc): add recompute_so_status & recompute_po_status RPCs"
```

---

## Task 4: SQL — Integrate recompute into post_goods_delivery & post_goods_receipt

**Suggested executor:** Claude Opus — modifies financial RPC, must remain balanced.

**Files:**
- Modify: `apps/erp-acc/erp-app/supabase/migrations/027_so_po_closing_cancel.sql` (append SECTION E2)
- Reference: `apps/erp-acc/erp-app/supabase/migrations/011_posting_functions.sql` (existing post_goods_delivery & post_goods_receipt)

- [ ] **Step 1: Read existing post_goods_delivery & post_goods_receipt**

Cek struktur RPC, identifikasi tempat akhir setelah loop items.

- [ ] **Step 2: Re-create kedua RPC dengan increment + recompute**

Append ke migration 027:

```sql
-- E2. Update posting RPC untuk maintain qty_delivered/received di SO/PO line items.

create or replace function post_goods_delivery(p_gd_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gd record;
  v_item record;
begin
  if not is_admin_or_staff() then raise exception 'permission denied'; end if;

  select * into v_gd from goods_deliveries where id=p_gd_id for update;
  if v_gd is null then raise exception 'GD tidak ditemukan'; end if;
  if v_gd.status <> 'draft' then raise exception 'GD bukan draft'; end if;

  perform _ensure_period_open(v_gd.date);

  -- (existing inventory_stock_out + journal logic — copy from migration 011)
  -- ... (omitted for brevity; copy verbatim, then add the delta below)

  -- NEW: Increment qty_delivered di SO line items (matched by product_id)
  if v_gd.sales_order_id is not null then
    for v_item in select * from goods_delivery_items where goods_delivery_id = p_gd_id
    loop
      update sales_order_items
         set quantity_delivered = quantity_delivered + v_item.quantity_base
       where sales_order_id = v_gd.sales_order_id
         and product_id = v_item.product_id;
    end loop;

    perform recompute_so_status(v_gd.sales_order_id);
  end if;

  update goods_deliveries set status='posted' where id=p_gd_id;
  return p_gd_id;
end $$;
```

Mirror untuk `post_goods_receipt`:

```sql
create or replace function post_goods_receipt(p_gr_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gr record;
  v_item record;
begin
  if not is_admin_or_staff() then raise exception 'permission denied'; end if;

  select * into v_gr from goods_receipts where id=p_gr_id for update;
  if v_gr is null then raise exception 'GR tidak ditemukan'; end if;
  if v_gr.status <> 'draft' then raise exception 'GR bukan draft'; end if;

  perform _ensure_period_open(v_gr.date);

  -- (existing inventory_stock_in + journal logic — copy verbatim from 011)

  -- NEW: Increment qty_received
  if v_gr.purchase_order_id is not null then
    for v_item in select * from goods_receipt_items where goods_receipt_id = p_gr_id
    loop
      update purchase_order_items
         set quantity_received = quantity_received + v_item.quantity_base
       where purchase_order_id = v_gr.purchase_order_id
         and product_id = v_item.product_id;
    end loop;

    perform recompute_po_status(v_gr.purchase_order_id);
  end if;

  update goods_receipts set status='posted' where id=p_gr_id;
  return p_gr_id;
end $$;
```

> **Catatan implementer:** Salin body lengkap RPC existing dari migration 011 — JANGAN drop & recreate dengan body kosong. Check juga apakah ada migration setelah 011 yang sudah override RPC ini (mis. 016, 018) — gunakan versi terakhir sebagai baseline.

- [ ] **Step 3: Apply + smoke test**

```sql
-- Buat SO 100, posting GD 60 → qty_delivered = 60, status = 'confirmed'
-- Posting GD 40 lagi → qty_delivered = 100, status = 'confirmed' (belum invoiced)
```

- [ ] **Step 4: Commit**
```bash
git add apps/erp-acc/erp-app/supabase/migrations/027_so_po_closing_cancel.sql
git commit -m "feat(erp-acc): integrate quantity tracking & recompute into post_goods_delivery/receipt"
```

---

## Task 5: SQL — Integrate recompute into save_sales_invoice & save_purchase_invoice

**Suggested executor:** Claude Opus

**Files:**
- Modify: `apps/erp-acc/erp-app/supabase/migrations/027_so_po_closing_cancel.sql` (append SECTION E3)
- Reference: `apps/erp-acc/erp-app/supabase/migrations/023_document_linkage.sql`

- [ ] **Step 1: Re-create kedua save_*_invoice dengan increment qty_invoiced di status='posted'**

Pola: existing `save_sales_invoice` di 023 hanya save (status=draft). Posting yang ubah status ke 'posted' kemungkinan ada di RPC `post_invoice` atau di update status manual. **Investigasi terlebih dulu** — cari `update invoices set status='posted'` di migrations 005-025.

Jika posting via RPC `post_sales_invoice(p_inv_id)` exists, modifikasi RPC ini:

```sql
create or replace function post_sales_invoice(p_inv_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_inv record;
  v_item record;
begin
  -- (existing logic: ensure_can_post, period_open, journal post, etc — copy verbatim)

  -- NEW: increment qty_invoiced di SO
  select * into v_inv from invoices where id=p_inv_id;
  if v_inv.sales_order_id is not null then
    for v_item in select * from invoice_items where invoice_id = p_inv_id
    loop
      update sales_order_items
         set quantity_invoiced = quantity_invoiced + v_item.quantity_base
       where sales_order_id = v_inv.sales_order_id
         and product_id = v_item.product_id;
    end loop;
    perform recompute_so_status(v_inv.sales_order_id);
  end if;

  return p_inv_id;
end $$;
```

Mirror untuk `post_purchase_invoice`.

> **Catatan:** Jika invoice posting tidak punya dedicated RPC dan langsung pakai update di service layer — refactor jadi RPC. Ini perlu confirmation dari implementer dengan baca repo.

- [ ] **Step 2: Apply + smoke test**

```sql
-- Posting SI yang link ke SO → qty_invoiced di SO line bertambah, recompute jalan.
```

- [ ] **Step 3: Commit**
```bash
git add apps/erp-acc/erp-app/supabase/migrations/027_so_po_closing_cancel.sql
git commit -m "feat(erp-acc): integrate qty_invoiced tracking into invoice posting"
```

---

## Task 6: SQL RPC — close_sales_order & close_purchase_order (Manual Short-Close)

**Suggested executor:** Codex (Sonnet) — pattern setelah Task 3 sudah ada.

**Files:**
- Modify: `apps/erp-acc/erp-app/supabase/migrations/027_so_po_closing_cancel.sql` (append SECTION E4)

- [ ] **Step 1: Append RPCs**

```sql
-- E4. Manual short-close
create or replace function close_sales_order(p_so_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_admin_or_staff() then raise exception 'permission denied'; end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'alasan close wajib diisi';
  end if;
  update sales_orders
     set status='closed',
         closed_at=now(),
         closed_by=auth.uid(),
         close_reason=p_reason
   where id=p_so_id and status in ('confirmed','invoiced');
  if not found then
    raise exception 'SO tidak dapat ditutup (status saat ini bukan confirmed/invoiced)';
  end if;
end $$;

create or replace function close_purchase_order(p_po_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_admin_or_staff() then raise exception 'permission denied'; end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'alasan close wajib diisi';
  end if;
  update purchase_orders
     set status='closed',
         closed_at=now(),
         closed_by=auth.uid(),
         close_reason=p_reason
   where id=p_po_id and status in ('confirmed','invoiced');
  if not found then
    raise exception 'PO tidak dapat ditutup (status saat ini bukan confirmed/invoiced)';
  end if;
end $$;
```

- [ ] **Step 2: Tambah validasi di save_goods_delivery/receipt — tolak jika SO/PO closed/cancelled**

Cari `save_goods_delivery` dan `save_goods_receipt` di migrations existing. Tambah guard:

```sql
-- Di save_goods_delivery (re-create):
if p_invoice->>'sales_order_id' is not null then
  declare v_so_status text;
  begin
    select status into v_so_status from sales_orders
      where id = (p_invoice->>'sales_order_id')::uuid;
    if v_so_status in ('closed','cancelled') then
      raise exception 'SO sudah ditutup/dibatalkan, tidak boleh tambah pengiriman';
    end if;
  end;
end if;
```

Mirror untuk save_goods_receipt + save_sales_invoice + save_purchase_invoice.

- [ ] **Step 3: Smoke test**

```sql
select close_sales_order('<so_id>', 'sisa qty tidak akan dipenuhi');
-- Expected: status='closed'

-- Coba buat GD untuk SO ini:
-- Expected: error "SO sudah ditutup/dibatalkan"
```

- [ ] **Step 4: Commit**
```bash
git add apps/erp-acc/erp-app/supabase/migrations/027_so_po_closing_cancel.sql
git commit -m "feat(erp-acc): add manual short-close RPCs + downstream document guards"
```

---

## Task 7: SQL RPC — cancel_goods_delivery & cancel_goods_receipt

**Suggested executor:** Claude Opus — financial logic, period guard, reverse journal + inventory.

**Files:**
- Modify: `apps/erp-acc/erp-app/supabase/migrations/027_so_po_closing_cancel.sql` (append SECTION E5)
- Reference: `apps/erp-acc/erp-app/supabase/migrations/011_posting_functions.sql` (lihat struktur jurnal post_goods_delivery)
- Reference: `apps/erp-acc/erp-app/supabase/migrations/007_cashbank_accounting.sql` (struktur tabel `journals` & `journal_items`)

- [ ] **Step 1: Append cancel_goods_delivery RPC**

```sql
-- E5. Cancel posted documents (period-aware)

create or replace function cancel_goods_delivery(p_gd_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_gd record;
  v_item record;
  v_orig_journal record;
  v_orig_item record;
  v_rev_journal_id uuid;
  v_si_count int;
begin
  if not is_admin_or_staff() then raise exception 'permission denied'; end if;
  if p_reason is null or length(trim(p_reason))=0 then
    raise exception 'alasan cancel wajib diisi';
  end if;

  select * into v_gd from goods_deliveries where id=p_gd_id for update;
  if v_gd is null then raise exception 'GD tidak ditemukan'; end if;
  if v_gd.status <> 'posted' then raise exception 'GD bukan status posted'; end if;

  -- Validasi: tidak ada SI active yang link ke GD ini
  select count(*) into v_si_count from invoices
    where goods_delivery_id = p_gd_id
      and status not in ('cancelled');
  if v_si_count > 0 then
    raise exception 'GD tidak dapat dicancel: masih ada Sales Invoice aktif yang merefer ke GD ini. Cancel SI dulu.';
  end if;

  -- Period guard (pakai tanggal asli dokumen)
  perform _ensure_period_open(v_gd.date);

  -- Cari jurnal asli (ambil 1 yang paling baru by reference_type='goods_delivery')
  select * into v_orig_journal from journals
    where reference_type='goods_delivery' and reference_id=p_gd_id
    order by created_at desc limit 1;
  if v_orig_journal is null then
    raise exception 'Jurnal asli untuk GD ini tidak ditemukan';
  end if;

  -- Buat reverse journal di TANGGAL DOKUMEN ASAL (keputusan brainstorming)
  v_rev_journal_id := gen_random_uuid();
  insert into journals (id, journal_number, date, description, reference_type, reference_id, created_by)
  values (
    v_rev_journal_id,
    generate_number('JR'),
    v_gd.date,
    format('REVERSE: %s — %s', v_gd.gd_number, p_reason),
    'goods_delivery_cancel',
    p_gd_id,
    auth.uid()
  );

  -- Salin journal_items dengan debit/credit dibalik
  insert into journal_items (journal_id, account_id, debit, credit, description)
  select v_rev_journal_id, account_id, credit, debit,  -- swap!
         coalesce(description,'') || ' (reverse)'
    from journal_items where journal_id = v_orig_journal.id;

  -- Reverse inventory: untuk tiap item, panggil inventory_stock_in dengan
  -- avg_cost SAAT INI (akan di-weight in lagi)
  for v_item in select * from goods_delivery_items where goods_delivery_id = p_gd_id
  loop
    perform inventory_stock_in(
      v_item.product_id,
      v_item.quantity_base,
      (select coalesce(avg_cost,0) from inventory_stock where product_id=v_item.product_id),
      v_item.unit_id,
      v_item.quantity,
      'goods_delivery_cancel',
      p_gd_id,
      v_gd.date
    );
  end loop;

  -- Decrement qty_delivered di SO + recompute
  if v_gd.sales_order_id is not null then
    for v_item in select * from goods_delivery_items where goods_delivery_id = p_gd_id
    loop
      update sales_order_items
         set quantity_delivered = greatest(0, quantity_delivered - v_item.quantity_base)
       where sales_order_id = v_gd.sales_order_id
         and product_id = v_item.product_id;
    end loop;
    perform recompute_so_status(v_gd.sales_order_id);
  end if;

  -- Set status='cancelled', simpan audit cols
  update goods_deliveries
     set status='cancelled',
         cancelled_at=now(),
         cancelled_by=auth.uid(),
         cancel_reason=p_reason,
         reversed_journal_id=v_rev_journal_id
   where id=p_gd_id;
end $$;
```

- [ ] **Step 2: Mirror cancel_goods_receipt RPC**

Tambahkan dengan perubahan: reverse `inventory_stock_out` (mengeluarkan stock yg sebelumnya masuk), reference_type='goods_receipt', decrement `quantity_received`.

- [ ] **Step 3: Apply + smoke**

```sql
-- Buat SO 100, posting GD 100 → SO status='confirmed', stock - 100
-- Cancel GD: select cancel_goods_delivery('<gd_id>','salah pengiriman');
-- Verify:
--   - GD status='cancelled', reversed_journal_id terisi
--   - journals: reverse journal di tanggal sama
--   - inventory_stock: kembali +100
--   - sales_order_items: quantity_delivered turun 100
--   - sales_orders.status: kembali 'confirmed' (atau 'invoiced' jika ada SI)
```

- [ ] **Step 4: Smoke negative — periode tertutup**

```sql
-- Tutup periode yang berisi GD:
update company_settings
  set closed_periods = closed_periods || jsonb_build_array(to_char(<v_gd.date>,'YYYY-MM'));
-- Coba cancel:
select cancel_goods_delivery('<gd_id>','test');
-- Expected: error "periode YYYY-MM sudah ditutup"
```

- [ ] **Step 5: Commit**
```bash
git add apps/erp-acc/erp-app/supabase/migrations/027_so_po_closing_cancel.sql
git commit -m "feat(erp-acc): add cancel_goods_delivery & cancel_goods_receipt RPCs (period-aware)"
```

---

## Task 8: SQL RPC — cancel_sales_invoice & cancel_purchase_invoice

**Suggested executor:** Claude Opus

**Files:**
- Modify: `apps/erp-acc/erp-app/supabase/migrations/027_so_po_closing_cancel.sql` (append SECTION E6)

- [ ] **Step 1: Append cancel_sales_invoice RPC**

```sql
create or replace function cancel_sales_invoice(p_inv_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_inv record;
  v_item record;
  v_orig_journal record;
  v_rev_journal_id uuid;
  v_paid numeric;
begin
  if not is_admin_or_staff() then raise exception 'permission denied'; end if;
  if p_reason is null or length(trim(p_reason))=0 then
    raise exception 'alasan cancel wajib diisi';
  end if;

  select * into v_inv from invoices where id=p_inv_id for update;
  if v_inv is null then raise exception 'Invoice tidak ditemukan'; end if;
  if v_inv.type <> 'sales' then raise exception 'Bukan sales invoice'; end if;
  if v_inv.status not in ('posted','partial','paid') then
    raise exception 'Invoice status saat ini tidak bisa dicancel (% / draft / cancelled)', v_inv.status;
  end if;

  -- Validasi: tidak ada payment yang masih aktif
  select coalesce(sum(amount),0) into v_paid from payments
    where invoice_id = p_inv_id and (cancelled_at is null);
  if v_paid > 0 then
    raise exception 'Invoice tidak dapat dicancel: ada % pembayaran aktif. Void payment dulu.', v_paid;
  end if;

  perform _ensure_period_open(v_inv.date);

  -- Reverse journal
  select * into v_orig_journal from journals
    where reference_type='sales_invoice' and reference_id=p_inv_id
    order by created_at desc limit 1;
  if v_orig_journal is null then
    raise exception 'Jurnal asli SI tidak ditemukan';
  end if;

  v_rev_journal_id := gen_random_uuid();
  insert into journals (id, journal_number, date, description, reference_type, reference_id, created_by)
  values (
    v_rev_journal_id, generate_number('JR'), v_inv.date,
    format('REVERSE: %s — %s', v_inv.invoice_number, p_reason),
    'sales_invoice_cancel', p_inv_id, auth.uid()
  );
  insert into journal_items (journal_id, account_id, debit, credit, description)
  select v_rev_journal_id, account_id, credit, debit,
         coalesce(description,'') || ' (reverse)'
    from journal_items where journal_id = v_orig_journal.id;

  -- Decrement qty_invoiced di SO + recompute
  if v_inv.sales_order_id is not null then
    for v_item in select * from invoice_items where invoice_id = p_inv_id
    loop
      update sales_order_items
         set quantity_invoiced = greatest(0, quantity_invoiced - v_item.quantity_base)
       where sales_order_id = v_inv.sales_order_id
         and product_id = v_item.product_id;
    end loop;
    perform recompute_so_status(v_inv.sales_order_id);
  end if;

  update invoices
     set status='cancelled',
         cancelled_at=now(),
         cancelled_by=auth.uid(),
         cancel_reason=p_reason,
         reversed_journal_id=v_rev_journal_id
   where id=p_inv_id;
end $$;
```

- [ ] **Step 2: Mirror cancel_purchase_invoice**

Mirror dengan perubahan: type='purchase', purchase_order_id, reference_type='purchase_invoice'.

> **Catatan:** SI cancel TIDAK reverse inventory karena sales invoice tidak ubah inventory (GD yang ubah). PI cancel juga tidak reverse inventory (GR yang ubah). Cancel hanya reverse jurnal AR/AP + tax.

- [ ] **Step 3: Smoke test**

```sql
-- Posting SI 1jt → cancel → AR turun, status='cancelled'
-- Posting SI 1jt + bayar 500rb (partial) → cancel: HARUS DITOLAK (ada payment)
```

- [ ] **Step 4: Commit**
```bash
git add apps/erp-acc/erp-app/supabase/migrations/027_so_po_closing_cancel.sql
git commit -m "feat(erp-acc): add cancel_sales_invoice & cancel_purchase_invoice RPCs"
```

---

## Task 9: SQL RPC — cancel_sales_order & cancel_purchase_order

**Suggested executor:** Codex (Sonnet) — pattern setelah Task 7-8 ada.

**Files:**
- Modify: `apps/erp-acc/erp-app/supabase/migrations/027_so_po_closing_cancel.sql` (append SECTION E7)

- [ ] **Step 1: Append RPCs (no journal reversal — SO/PO tidak posted ke GL)**

```sql
create or replace function cancel_sales_order(p_so_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_child_count int;
begin
  if not is_admin_or_staff() then raise exception 'permission denied'; end if;
  if p_reason is null or length(trim(p_reason))=0 then
    raise exception 'alasan cancel wajib diisi';
  end if;

  -- Validasi: tidak ada child posted aktif (GD posted, SI posted)
  select count(*) into v_child_count from goods_deliveries
    where sales_order_id = p_so_id and status = 'posted';
  if v_child_count > 0 then
    raise exception 'SO tidak dapat dicancel: ada % goods delivery posted. Cancel GD dulu.', v_child_count;
  end if;

  select count(*) into v_child_count from invoices
    where sales_order_id = p_so_id and status in ('posted','partial','paid');
  if v_child_count > 0 then
    raise exception 'SO tidak dapat dicancel: ada % invoice aktif. Cancel invoice dulu.', v_child_count;
  end if;

  update sales_orders
     set status='cancelled',
         cancelled_at=now(),
         cancelled_by=auth.uid(),
         cancel_reason=p_reason
   where id=p_so_id and status in ('draft','confirmed','invoiced');
  if not found then raise exception 'SO sudah cancelled/closed/done atau tidak ditemukan'; end if;
end $$;

create or replace function cancel_purchase_order(p_po_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_child_count int;
begin
  if not is_admin_or_staff() then raise exception 'permission denied'; end if;
  if p_reason is null or length(trim(p_reason))=0 then
    raise exception 'alasan cancel wajib diisi';
  end if;

  select count(*) into v_child_count from goods_receipts
    where purchase_order_id = p_po_id and status = 'posted';
  if v_child_count > 0 then
    raise exception 'PO tidak dapat dicancel: ada % goods receipt posted. Cancel GR dulu.', v_child_count;
  end if;

  select count(*) into v_child_count from invoices
    where purchase_order_id = p_po_id and status in ('posted','partial','paid');
  if v_child_count > 0 then
    raise exception 'PO tidak dapat dicancel: ada % invoice aktif.', v_child_count;
  end if;

  update purchase_orders
     set status='cancelled',
         cancelled_at=now(),
         cancelled_by=auth.uid(),
         cancel_reason=p_reason
   where id=p_po_id and status in ('draft','confirmed','invoiced');
  if not found then raise exception 'PO sudah cancelled/closed/done atau tidak ditemukan'; end if;
end $$;
```

- [ ] **Step 2: Final apply + smoke**

```bash
npx supabase db push
```

```sql
select cancel_sales_order('<so_id>', 'customer batal pesanan');
-- Verify status='cancelled'
```

- [ ] **Step 3: Commit**
```bash
git add apps/erp-acc/erp-app/supabase/migrations/027_so_po_closing_cancel.sql
git commit -m "feat(erp-acc): add cancel_sales_order & cancel_purchase_order RPCs"
```

---

## Task 10: Service Layer — salesService.js & purchaseService.js Extensions

**Suggested executor:** Codex (Sonnet)

**Files:**
- Modify: `apps/erp-acc/erp-app/src/services/salesService.js`
- Modify: `apps/erp-acc/erp-app/src/services/purchaseService.js`

- [ ] **Step 1: Append functions di salesService.js**

```js
export async function closeSalesOrder(soId, reason) {
  const { error } = await supabase.rpc('close_sales_order', { p_so_id: soId, p_reason: reason })
  if (error) throw error
}

export async function cancelSalesOrder(soId, reason) {
  const { error } = await supabase.rpc('cancel_sales_order', { p_so_id: soId, p_reason: reason })
  if (error) throw error
}

export async function cancelGoodsDelivery(gdId, reason) {
  const { error } = await supabase.rpc('cancel_goods_delivery', { p_gd_id: gdId, p_reason: reason })
  if (error) throw error
}

export async function cancelSalesInvoice(invId, reason) {
  const { error } = await supabase.rpc('cancel_sales_invoice', { p_inv_id: invId, p_reason: reason })
  if (error) throw error
}
```

- [ ] **Step 2: Mirror untuk purchaseService.js**

Functions: `closePurchaseOrder`, `cancelPurchaseOrder`, `cancelGoodsReceipt`, `cancelPurchaseInvoice`.

- [ ] **Step 3: Build + commit**
```bash
git add apps/erp-acc/erp-app/src/services/salesService.js apps/erp-acc/erp-app/src/services/purchaseService.js
git commit -m "feat(erp-acc): add cancel & close service layer wrappers"
```

---

## Task 11: Reusable Component — CancelDocumentModal & CloseOrderModal

**Suggested executor:** Codex (Sonnet)

**Files:**
- Create: `apps/erp-acc/erp-app/src/components/shared/CancelDocumentModal.jsx`
- Create: `apps/erp-acc/erp-app/src/components/shared/CloseOrderModal.jsx`

- [ ] **Step 1: Create CancelDocumentModal**

```jsx
import { useState } from 'react'
import { Modal, Form, Input, Alert, message } from 'antd'

export default function CancelDocumentModal({ open, onClose, onConfirm, title='Batalkan Dokumen', warningText }) {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)

  async function handleOk() {
    try {
      const v = await form.validateFields()
      setLoading(true)
      await onConfirm(v.reason)
      message.success('Dokumen dibatalkan')
      onClose()
      form.resetFields()
    } catch (e) {
      if (e?.errorFields) return
      message.error(e.message || 'Gagal cancel')
    } finally { setLoading(false) }
  }

  return (
    <Modal open={open} title={title} onOk={handleOk} onCancel={onClose}
           confirmLoading={loading} okButtonProps={{ danger: true }} okText="Cancel Dokumen">
      {warningText && <Alert type="warning" message={warningText} style={{ marginBottom: 16 }} />}
      <Form form={form} layout="vertical">
        <Form.Item name="reason" label="Alasan Cancel"
                   rules={[{ required: true, message: 'Alasan wajib diisi' }, { min: 5, message: 'Minimal 5 karakter' }]}>
          <Input.TextArea rows={3} placeholder="Contoh: salah input kuantitas / customer batal..." />
        </Form.Item>
      </Form>
    </Modal>
  )
}
```

- [ ] **Step 2: Create CloseOrderModal (sama pattern minus warningText, OK button bukan danger)**

- [ ] **Step 3: Commit**
```bash
git add apps/erp-acc/erp-app/src/components/shared/CancelDocumentModal.jsx apps/erp-acc/erp-app/src/components/shared/CloseOrderModal.jsx
git commit -m "feat(erp-acc): add reusable CancelDocumentModal & CloseOrderModal"
```

---

## Task 12: Reusable Component — FulfillmentProgress

**Suggested executor:** Codex (Sonnet)

**Files:**
- Create: `apps/erp-acc/erp-app/src/components/shared/FulfillmentProgress.jsx`

- [ ] **Step 1: Create component**

```jsx
import { Card, Table, Progress } from 'antd'

/**
 * Props:
 *  - items: array of { product_name, unit, ordered, fulfilled, invoiced } (untuk SO: fulfilled=delivered; PO: received)
 *  - mode: 'sales' | 'purchase' (label kolom)
 */
export default function FulfillmentProgress({ items, mode='sales' }) {
  const fulfilledLabel = mode === 'sales' ? 'Terkirim' : 'Diterima'
  const columns = [
    { title: 'Produk', dataIndex: 'product_name' },
    { title: 'Satuan', dataIndex: 'unit', width: 80 },
    { title: 'Dipesan',    dataIndex: 'ordered',   width: 100, align: 'right' },
    { title: fulfilledLabel, dataIndex: 'fulfilled', width: 110, align: 'right' },
    { title: 'Invoiced',   dataIndex: 'invoiced',  width: 100, align: 'right' },
    { title: 'Outstanding', width: 110, align: 'right',
      render: (_, r) => Math.max(0, r.ordered - r.fulfilled) },
    { title: 'Progress', width: 200,
      render: (_, r) => {
        const pct = r.ordered ? Math.round((r.fulfilled / r.ordered) * 100) : 0
        return <Progress percent={Math.min(100, pct)} size="small" />
      } },
  ]
  return (
    <Card title="Progres Pemenuhan" size="small">
      <Table dataSource={items} columns={columns} pagination={false} rowKey={(r,i)=>i} />
    </Card>
  )
}
```

- [ ] **Step 2: Commit**
```bash
git add apps/erp-acc/erp-app/src/components/shared/FulfillmentProgress.jsx
git commit -m "feat(erp-acc): add FulfillmentProgress component"
```

---

## Task 13: SO/PO Form Pages — Tombol Close + Cancel + FulfillmentProgress

**Suggested executor:** Codex (Sonnet)

**Files:**
- Modify: `apps/erp-acc/erp-app/src/pages/sales/SalesOrderFormPage.jsx`
- Modify: `apps/erp-acc/erp-app/src/pages/purchase/PurchaseOrderFormPage.jsx`

- [ ] **Step 1: Pada SO form (edit mode), tambah tombol Close + Cancel di header**

```jsx
import CloseOrderModal from '../../components/shared/CloseOrderModal'
import CancelDocumentModal from '../../components/shared/CancelDocumentModal'
import FulfillmentProgress from '../../components/shared/FulfillmentProgress'
import { closeSalesOrder, cancelSalesOrder } from '../../services/salesService'

const [closeOpen, setCloseOpen] = useState(false)
const [cancelOpen, setCancelOpen] = useState(false)

const canClose = editing && ['confirmed','invoiced'].includes(editing.status)
const canCancel = editing && ['draft','confirmed','invoiced'].includes(editing.status)

// Render di header:
{canClose && <Button onClick={() => setCloseOpen(true)}>Tutup SO</Button>}
{canCancel && <Button danger onClick={() => setCancelOpen(true)}>Cancel SO</Button>}

<CloseOrderModal open={closeOpen} onClose={() => setCloseOpen(false)}
  onConfirm={(reason) => closeSalesOrder(editing.id, reason).then(() => { reload(); setCloseOpen(false) })} />

<CancelDocumentModal open={cancelOpen} onClose={() => setCancelOpen(false)}
  warningText="Cancel SO akan menolak semua dokumen anak baru. Dokumen anak yang sudah posted harus dicancel manual dulu."
  onConfirm={(reason) => cancelSalesOrder(editing.id, reason).then(() => { reload(); setCancelOpen(false) })} />
```

- [ ] **Step 2: Tambah section FulfillmentProgress (hanya jika editing)**

Tarik items dengan join:
```jsx
const fulfillItems = (editing?.items || []).map(i => ({
  product_name: i.product?.name,
  unit: i.unit?.name,
  ordered: i.quantity_base,
  fulfilled: i.quantity_delivered,
  invoiced: i.quantity_invoiced,
}))

{editing && <FulfillmentProgress items={fulfillItems} mode="sales" />}
```

- [ ] **Step 3: Mirror untuk PurchaseOrderFormPage (mode="purchase", fulfilled=quantity_received)**

- [ ] **Step 4: Build + smoke**

- [ ] **Step 5: Commit**
```bash
git add apps/erp-acc/erp-app/src/pages/sales/SalesOrderFormPage.jsx apps/erp-acc/erp-app/src/pages/purchase/PurchaseOrderFormPage.jsx
git commit -m "feat(erp-acc): add close & cancel buttons + fulfillment progress to SO/PO form"
```

---

## Task 14: GD/GR/SI/PI List Pages — Tombol Cancel

**Suggested executor:** Codex (Sonnet)

**Files:**
- Modify: 4 list pages (`GoodsDeliveriesPage.jsx`, `GoodsReceiptsPage.jsx`, `SalesInvoicesPage.jsx`, `PurchaseInvoicesPage.jsx`)

- [ ] **Step 1: Per list page, tambah tombol Cancel di kolom Aksi (hanya untuk row status='posted'/'partial'/'paid')**

Pattern (untuk GoodsDeliveriesPage):
```jsx
import { useState } from 'react'
import CancelDocumentModal from '../../components/shared/CancelDocumentModal'
import { cancelGoodsDelivery } from '../../services/salesService'

const [cancelTarget, setCancelTarget] = useState(null)

// Di kolom Aksi:
{row.status === 'posted' && (
  <Button size="small" danger onClick={() => setCancelTarget(row)}>Cancel</Button>
)}

<CancelDocumentModal
  open={!!cancelTarget}
  onClose={() => setCancelTarget(null)}
  warningText={`Cancel GD ${cancelTarget?.gd_number} akan reverse jurnal & kembalikan stock.`}
  onConfirm={async (reason) => {
    await cancelGoodsDelivery(cancelTarget.id, reason)
    setCancelTarget(null); reload()
  }}
/>
```

Replicate untuk GR/SI/PI dengan service function & message yang sesuai.

- [ ] **Step 2: Tambah filter status badge baru ('cancelled')**

Tag color: red untuk cancelled, gray untuk closed, hijau untuk done/paid.

- [ ] **Step 3: Build + commit**
```bash
git add apps/erp-acc/erp-app/src/pages/sales/GoodsDeliveriesPage.jsx apps/erp-acc/erp-app/src/pages/sales/SalesInvoicesPage.jsx apps/erp-acc/erp-app/src/pages/purchase/GoodsReceiptsPage.jsx apps/erp-acc/erp-app/src/pages/purchase/PurchaseInvoicesPage.jsx
git commit -m "feat(erp-acc): add cancel button + status filter to GD/GR/SI/PI list pages"
```

---

## Task 15: Playwright E2E — so-po-closing.spec.js

**Suggested executor:** Codex (Sonnet)

**Files:**
- Create: `apps/erp-acc/erp-app/tests/playwright/so-po-closing.spec.js`

- [ ] **Step 1: Test auto-close + manual short-close**

```js
import { test, expect } from '@playwright/test'

test.describe('SO/PO Auto-close + Short-close', () => {

  test('PO auto-close when fully received & invoiced', async ({ page }) => {
    // Buat PO 100 unit (test product)
    // Posting GR 100 unit
    // Posting PI 100 unit
    // Buka detail PO → status = 'done'
    // Verify FulfillmentProgress shows 100%
  })

  test('PO manual short-close', async ({ page }) => {
    // Buat PO 100 unit
    // Posting GR 60 unit
    // Klik tombol "Tutup PO" → modal → input reason → confirm
    // Status = 'closed'
    // Tombol "Receive Goods" hilang dari halaman detail
  })
})
```

- [ ] **Step 2: Run + commit**

```bash
npx playwright test tests/playwright/so-po-closing.spec.js
```

```bash
git add apps/erp-acc/erp-app/tests/playwright/so-po-closing.spec.js
git commit -m "test(erp-acc): add e2e for SO/PO auto-close & short-close"
```

---

## Task 16: Playwright E2E — document-cancel.spec.js

**Suggested executor:** Claude Opus — financial assertion (jurnal balanced, stock reversed).

**Files:**
- Create: `apps/erp-acc/erp-app/tests/playwright/document-cancel.spec.js`

- [ ] **Step 1: Test cancel GD posted (period open)**

```js
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)

test('cancel GD reverses inventory + creates reverse journal', async ({ page }) => {
  // Pre: stock product X = N
  // Buat SO 50 unit X
  // Posting GD 50 → stock = N - 50
  // Cancel GD → stock kembali N
  // Verify via supabase SQL: journal reverse exists with reference_type='goods_delivery_cancel'
  // Verify SO status kembali 'confirmed'
})

test('cancel GD blocked when period closed', async ({ page }) => {
  // Setup: closed_periods includes <gd.date.YYYY-MM>
  // Klik Cancel → expect error message containing "periode YYYY-MM sudah ditutup"
})

test('cancel SI blocked when payment exists', async ({ page }) => {
  // Posting SI 1jt + Payment 500rb
  // Klik Cancel → expect error "ada pembayaran aktif"
})
```

- [ ] **Step 2: Run + commit**

```bash
npx playwright test tests/playwright/document-cancel.spec.js
```

```bash
git add apps/erp-acc/erp-app/tests/playwright/document-cancel.spec.js
git commit -m "test(erp-acc): add e2e for document cancel (period-aware, payment guard)"
```

---

## Task 17: Final Build + Manual Verification

**Suggested executor:** Claude Opus

- [ ] **Step 1: Full build + lint**
```bash
cd apps/erp-acc/erp-app
npm run build && npm run lint
```

- [ ] **Step 2: Manual smoke checklist** (per spec §4.6 acceptance criteria)
- [ ] Backfill `quantity_*` benar untuk 5 SO + 5 PO sample (SQL verification).
- [ ] Posting GD baru → SO `quantity_delivered` bertambah; status auto‑update.
- [ ] Manual short‑close PO → status `closed`, tombol "Receive Goods" hilang.
- [ ] Cancel GD posted (periode buka) → reverse journal di GL, stock kembali.
- [ ] Cancel GD posted (periode tertutup) → ditolak dengan pesan jelas.
- [ ] Cancel SI yang sudah ada payment → ditolak.
- [ ] Posting GD/GR/Invoice existing tetap jalan (regression).

- [ ] **Step 3: PR ready handover note**

---

## Self-Review Notes

- **Spec coverage:** Task 1 = §4.2 schema, Task 2 = §4.2 backfill, Tasks 3-5 = §4.3 recompute, Task 6 = §4.3 close, Tasks 7-9 = §4.4 cancel, Tasks 10-14 = §4.5 UI, Tasks 15-17 = §4.6 verification.
- **Anti‑pattern:** Tidak hard delete dokumen posted; semua via reverse journal + status='cancelled'.
- **Risk:** Task 4-5 mengubah RPC posting existing yang sudah live. Wajib copy body verbatim dari migrations terakhir + tambah delta. Ada risiko regresi → wajib smoke posting GD/GR/SI/PI baru setelah migrasi.

---

**End of Phase 2 Plan.**
