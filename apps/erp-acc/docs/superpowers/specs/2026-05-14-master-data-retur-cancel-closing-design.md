# Master Data Enhancement, Retur, Cancel & Closing PRD

**Date:** 2026-05-14
**Project:** ERP-ACC (`apps/erp-acc/erp-app/`)
**Status:** Draft (pending user review)
**Sequencing:** Opsi A — 3 phases sequential

---

## 1. Context

ERP-ACC adalah full‑featured accounting ERP (React 19 + Supabase/PostgreSQL) dengan 23 migrasi yang sudah live: Sales (SO/GD/Invoice), Purchase (PO/GR/Invoice), Inventory (avg cost), Cash/Bank, Fixed Assets, Closing Period, Recurring Transactions, dll.

Audit terhadap baseline saat ini (lihat `apps/erp-acc/erp-app/supabase/migrations/002_master_data.sql`, `003_sales_tables.sql`, `004_purchase_tables.sql`, `005_invoice_payment.sql`) menemukan beberapa gap besar yang menghambat kelengkapan operasional:

1. **Master Data masih minimal** — `products.category` hanya `text` bebas; tidak ada `tax_codes`, `payment_terms`, `warehouses` master.
2. **Tidak ada mekanisme retur** (Sales Return / Purchase Return) — bisnis terpaksa menjurnal manual.
3. **Tidak ada cancel** untuk dokumen yang sudah posted; hanya bisa hard‑edit atau biarkan.
4. **SO/PO tidak punya tracking partial fulfillment** (`quantity_delivered`, `quantity_received`, `quantity_invoiced`); tidak ada cara tahu mana yang sudah/belum/sebagian dipenuhi → tidak bisa close.

Spec ini menutup keempat gap tersebut dalam 3 phase sequential supaya scope tiap phase manageable, tiap phase ship‑able sendiri, dan infrastruktur reverse‑journal yang dibangun di Phase 2 reusable di Phase 3.

### ERP Reference Comparison

| Pattern | SAP B1 / BC | Accurate / Zahir | Jurnal.id / Xero / QB | ERP-ACC sekarang |
|---|---|---|---|---|
| `tax_codes` master | ✅ | ✅ | ✅ | ❌ (inline `tax_rate`) |
| `warehouses` master | ✅ | ✅ | ✅ (gudang) | ❌ |
| `payment_terms` | ✅ | ✅ | ✅ | ❌ (inline `due_date`) |
| Product category sebagai tabel | ✅ | ✅ | ✅ | ❌ (text bebas) |
| Sales Return / Credit Memo | ✅ | ✅ Retur Penjualan | ✅ Credit Note | ❌ |
| Purchase Return / Vendor Credit | ✅ | ✅ Retur Pembelian | ✅ Debit Note | ❌ |
| Document Cancel/Void | ✅ | ✅ (soft cancel) | ✅ | ❌ |
| SO/PO Auto‑close | ✅ | ✅ | ✅ | ❌ |
| Manual short‑close | ✅ | ✅ | ✅ | ❌ |
| Period‑aware reversal | ✅ | ✅ | ⚠️ partial | ✅ (period lock ada) |

---

## 2. Scope & Out of Scope

### In Scope (3 Phases)
- **Phase 1:** Master Data Enhancement Tier 1 — `product_categories`, `payment_terms`, `tax_codes`, `warehouses` + migrasi backfill default + UI master settings + dropdown integrasi di form transaksi.
- **Phase 2:** SO/PO Closing + Cancel — quantity tracking per line, auto‑close + manual short‑close, cancel periode‑aware untuk semua dokumen posted (SO, PO, GD, GR, SI, PI), reverse journal + reverse inventory.
- **Phase 3:** Retur Penjualan & Pembelian — `sales_returns` + `purchase_returns` + items, wajib link ke invoice asal, partial qty, PPN ikut dibalik, inventory in/out pakai avg cost saat retur, credit note + manual refund.

### Out of Scope (Tier 2/3 Master Data — bukan di PRD ini)
- `salesperson`, `contact_persons`, `customer_groups`/`supplier_groups`, `credit_limit`, `bank_accounts` master, billing vs shipping address terpisah
- `price_lists`, product variants/attributes, lot/serial tracking, barcode/EAN, brand, reorder point, min/max stock
- Multi‑warehouse di tabel inventory (Phase 1 hanya menambah master `warehouses` + default link; multi‑warehouse logic = Phase berikutnya)
- Approval workflow untuk retur/cancel
- Email notifikasi otomatis saat cancel/retur (akan reuse Phase 2 roadmap email)
- Refund otomatis dari Credit Note ke Cash/Bank (refund tetap manual via Cash Disbursement)
- Retur tanpa link invoice asal (di‑disallow per keputusan brainstorming)

### Cross-cutting Constraints
- **Period lock honor:** semua operasi menulis ke GL wajib lewat `_ensure_period_open()` (existing helper, lihat `migrations/016_period_lock_enforcement.sql`).
- **RLS:** setiap tabel baru wajib RLS sesuai pattern existing (`get_my_role()`, `is_admin_or_staff()`).
- **Audit trail:** state change penting wajib via `audit_logs` (existing trigger pattern).
- **Soft delete:** field `is_active`, `deleted_at`, `deleted_by` untuk master data; transaksi tidak di‑hard‑delete.
- **Atomic save:** dokumen multi‑line tetap pakai pattern `save_*` RPC (existing).
- **Build must pass:** `npm run build` di `apps/erp-acc/erp-app/` sebelum claim selesai.

---

## 3. Phase 1 — Master Data Enhancement (Tier 1)

### 3.1 Tujuan
Tambahkan 4 tabel master yang menjadi prasyarat operasional standar ERP: kategori produk, syarat pembayaran, kode pajak, gudang. Migrasi data lama secara non‑breaking dengan backfill default.

### 3.2 Database Schema

**Migration:** `apps/erp-acc/erp-app/supabase/migrations/026_master_data_tier1.sql`

```sql
-- Product Categories (hierarki single-level untuk MVP; parent_id nullable untuk extensibility)
create table product_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  parent_id uuid references product_categories(id),
  is_active boolean not null default true,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Payment Terms (NET 30, COD, 2/10 N/30, dll)
create table payment_terms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  net_days int not null default 0,            -- jatuh tempo H+net_days
  discount_percent numeric(5,2) not null default 0,
  discount_days int not null default 0,        -- early-payment discount window
  is_active boolean not null default true,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Tax Codes (PPN 11%, PPN 0%, Non-PPN, dll)
create table tax_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,                   -- "PPN11", "PPN0", "NON"
  name text not null,
  rate numeric(5,2) not null default 0,
  is_inclusive boolean not null default false, -- harga sudah include PPN?
  -- COA mapping: dipakai posting_functions waktu jurnal pajak
  output_account_id uuid references coa(id),   -- PPN Keluaran (sales)
  input_account_id  uuid references coa(id),   -- PPN Masukan (purchase)
  is_active boolean not null default true,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Warehouses (gudang)
create table warehouses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  address text,
  is_default boolean not null default false,   -- exactly 1 default per company
  is_active boolean not null default true,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index uq_warehouse_one_default on warehouses (is_default) where is_default = true;

-- Add FK kolom ke tabel transaksi/master (semua nullable untuk backward compat)
alter table products
  add column category_id uuid references product_categories(id),
  add column default_tax_code_id uuid references tax_codes(id);

alter table customers
  add column default_payment_term_id uuid references payment_terms(id),
  add column default_tax_code_id uuid references tax_codes(id);

alter table suppliers
  add column default_payment_term_id uuid references payment_terms(id),
  add column default_tax_code_id uuid references tax_codes(id);

alter table sales_orders
  add column payment_term_id uuid references payment_terms(id),
  add column warehouse_id uuid references warehouses(id);

alter table purchase_orders
  add column payment_term_id uuid references payment_terms(id),
  add column warehouse_id uuid references warehouses(id);

alter table goods_deliveries  add column warehouse_id uuid references warehouses(id);
alter table goods_receipts    add column warehouse_id uuid references warehouses(id);
alter table invoices          add column payment_term_id uuid references payment_terms(id);

alter table sales_order_items     add column tax_code_id uuid references tax_codes(id);
alter table purchase_order_items  add column tax_code_id uuid references tax_codes(id);
alter table invoice_items         add column tax_code_id uuid references tax_codes(id);
```

### 3.3 Migration Strategy — Backfill Defaults

Disertakan dalam migrasi yang sama, idempotent:

```sql
-- 1) Seed default records
insert into product_categories (code, name) values ('UNCAT', 'Uncategorized')
  on conflict (code) do nothing;
insert into payment_terms (code, name, net_days) values
  ('CASH','Cash / COD',0), ('NET30','Net 30',30), ('NET14','Net 14',14)
  on conflict (code) do nothing;
insert into tax_codes (code, name, rate) values
  ('PPN11','PPN 11%',11), ('PPN0','PPN 0%',0), ('NON','Non-PPN',0)
  on conflict (code) do nothing;
insert into warehouses (code, name, is_default) values ('WH-MAIN','Gudang Utama',true)
  on conflict (code) do nothing;

-- 2) Backfill FK ke default record
update products set category_id = (select id from product_categories where code='UNCAT')
  where category_id is null;
update products set default_tax_code_id =
  case when is_taxable then (select id from tax_codes where code='PPN11')
       else (select id from tax_codes where code='NON') end
  where default_tax_code_id is null;

update customers set default_payment_term_id = (select id from payment_terms where code='NET30')
  where default_payment_term_id is null;
update suppliers set default_payment_term_id = (select id from payment_terms where code='NET30')
  where default_payment_term_id is null;

update sales_orders     set warehouse_id = (select id from warehouses where is_default) where warehouse_id is null;
update purchase_orders  set warehouse_id = (select id from warehouses where is_default) where warehouse_id is null;
update goods_deliveries set warehouse_id = (select id from warehouses where is_default) where warehouse_id is null;
update goods_receipts   set warehouse_id = (select id from warehouses where is_default) where warehouse_id is null;

-- 3) RLS policies (mirror master_data pattern)
alter table product_categories enable row level security;
alter table payment_terms      enable row level security;
alter table tax_codes          enable row level security;
alter table warehouses         enable row level security;

-- Read for authenticated, manage for admin/staff (4 tables × 2 policies = 8 policies)
-- (full SQL ditulis lengkap di plan executor)

-- 4) Trigger updated_at untuk 4 tabel baru
create trigger set_updated_at before update on product_categories for each row execute function update_updated_at();
create trigger set_updated_at before update on payment_terms      for each row execute function update_updated_at();
create trigger set_updated_at before update on tax_codes          for each row execute function update_updated_at();
create trigger set_updated_at before update on warehouses         for each row execute function update_updated_at();
```

**Catatan:** Field lama `products.category` (text), `products.is_taxable`, `products.tax_rate` **TIDAK dihapus** di Phase 1 — biarkan untuk backward‑compat. Penghapusan field lama di phase pembersihan terpisah setelah semua kode konsumen sudah migrasi ke `category_id` / `default_tax_code_id`.

### 3.4 Service Layer

File baru:
- `apps/erp-acc/erp-app/src/services/productCategoryService.js`
- `apps/erp-acc/erp-app/src/services/paymentTermService.js`
- `apps/erp-acc/erp-app/src/services/taxCodeService.js`
- `apps/erp-acc/erp-app/src/services/warehouseService.js`

Semua mengikuti pattern `masterDataService.js`: `get/create/update/delete` (soft delete), select dengan `is_active=true` filter. Update `masterDataService.js` untuk `getProducts()` join `product_categories(name)` dan `tax_codes(code, rate)`.

### 3.5 UI/UX

File baru di `apps/erp-acc/erp-app/src/pages/master/`:
- `ProductCategoriesPage.jsx`
- `PaymentTermsPage.jsx`
- `TaxCodesPage.jsx`
- `WarehousesPage.jsx`

Semua reuse Ant Design table + form pattern dari `UnitsPage.jsx`. Ditambahkan ke menu Master Data di `App.jsx` (Settings group atau Master group sesuai navigasi existing).

**Form transaksi yang di‑update (dropdown opsional, default = backfill):**
- `SalesOrderFormPage.jsx`, `PurchaseOrderFormPage.jsx` → dropdown Payment Term + Warehouse
- `SalesInvoiceFormPage.jsx`, `PurchaseInvoiceFormPage.jsx` → dropdown Payment Term (auto due_date dari net_days)
- `GoodsDeliveryFormPage.jsx`, `GoodsReceiptFormPage.jsx` → dropdown Warehouse (read‑only jika ditarik dari SO/PO)
- `ProductsPage.jsx` form → dropdown Category + Tax Code
- Item line di SO/PO/Invoice → dropdown Tax Code (default ambil dari product.default_tax_code_id)

### 3.6 Acceptance Criteria
- [ ] Migrasi 026 jalan tanpa error di staging Supabase; tidak ada FK violation; semua row existing punya FK ke default record.
- [ ] CRUD 4 master data baru jalan dari UI; soft delete bekerja.
- [ ] Form SO/PO/Invoice/GD/GR menampilkan dropdown baru dengan default value yang masuk akal.
- [ ] `npm run build` pass; existing tests masih hijau.
- [ ] Tidak ada regresi di posting RPC (jurnal masih balanced).
- [ ] Audit log tercatat untuk insert/update/delete master baru.

### 3.7 Effort Estimate
**3-4 hari developer.** Distribusi tugas (lihat detail di plan):

| Tugas | Owner ideal | Estimasi |
|---|---|---|
| SQL migration + seed + RLS | Claude (Opus, schema reasoning + SQL) | 0.5 hari |
| Service layer (4 file × ~30 LoC) | Codex (mekanis, pattern‑repetitive) | 0.5 hari |
| 4 Pages master CRUD | Codex (Ant Design boilerplate) | 1 hari |
| Integrasi dropdown ke 6 form transaksi | Claude (cross‑file reasoning + risk to financial logic) | 1 hari |
| Smoke test + build verification | Claude (verification skill) | 0.5 hari |

---

## 4. Phase 2 — SO/PO Closing + Cancel

### 4.1 Tujuan
1. Tambah quantity tracking per line item di SO/PO supaya partial fulfillment bisa diukur.
2. Auto‑close SO/PO saat semua line fulfilled = ordered.
3. Manual short‑close untuk SO/PO partial yang tidak akan dipenuhi.
4. Cancel periode‑aware untuk dokumen yang sudah posted (SO confirmed, PO confirmed, GD posted, GR posted, SI posted, PI posted).

### 4.2 Schema Changes — Quantity Tracking & Status

**Migration:** `apps/erp-acc/erp-app/supabase/migrations/027_so_po_closing_cancel.sql`

```sql
-- 1. Quantity tracking per line item
alter table sales_order_items
  add column quantity_delivered numeric(15,4) not null default 0 check (quantity_delivered >= 0),
  add column quantity_invoiced  numeric(15,4) not null default 0 check (quantity_invoiced  >= 0);

alter table purchase_order_items
  add column quantity_received numeric(15,4) not null default 0 check (quantity_received >= 0),
  add column quantity_invoiced numeric(15,4) not null default 0 check (quantity_invoiced >= 0);

-- 2. Tambah 'closed' & 'cancelled' di SO/PO status
alter table sales_orders drop constraint sales_orders_status_check;
alter table sales_orders add constraint sales_orders_status_check
  check (status in ('draft','confirmed','invoiced','done','closed','cancelled'));

alter table purchase_orders drop constraint purchase_orders_status_check;
alter table purchase_orders add constraint purchase_orders_status_check
  check (status in ('draft','confirmed','received','done','closed','cancelled'));

-- 3. Tambah 'cancelled' di GD, GR, Invoice
alter table goods_deliveries drop constraint goods_deliveries_status_check;
alter table goods_deliveries add constraint goods_deliveries_status_check
  check (status in ('draft','posted','cancelled'));

alter table goods_receipts drop constraint goods_receipts_status_check;
alter table goods_receipts add constraint goods_receipts_status_check
  check (status in ('draft','posted','cancelled'));

alter table invoices drop constraint invoices_status_check;
alter table invoices add constraint invoices_status_check
  check (status in ('draft','posted','partial','paid','cancelled'));

-- 4. Audit columns untuk close/cancel
alter table sales_orders
  add column closed_at timestamptz, add column closed_by uuid references auth.users(id),
  add column close_reason text,
  add column cancelled_at timestamptz, add column cancelled_by uuid references auth.users(id),
  add column cancel_reason text;

alter table purchase_orders  -- (same 6 columns)
  add column closed_at timestamptz, add column closed_by uuid references auth.users(id),
  add column close_reason text,
  add column cancelled_at timestamptz, add column cancelled_by uuid references auth.users(id),
  add column cancel_reason text;

-- GD, GR, Invoice hanya butuh cancel columns (bukan close)
alter table goods_deliveries
  add column cancelled_at timestamptz, add column cancelled_by uuid references auth.users(id),
  add column cancel_reason text, add column reversed_journal_id uuid references journals(id);

alter table goods_receipts   -- (same 4 columns)
  add column cancelled_at timestamptz, add column cancelled_by uuid references auth.users(id),
  add column cancel_reason text, add column reversed_journal_id uuid references journals(id);

alter table invoices         -- (same 4 columns)
  add column cancelled_at timestamptz, add column cancelled_by uuid references auth.users(id),
  add column cancel_reason text, add column reversed_journal_id uuid references journals(id);

-- 5. Backfill quantity_delivered/received/invoiced untuk historis
-- Walk goods_delivery_items group by sales_order_id for SO; goods_receipt_items for PO;
-- invoice_items for SO/PO via invoices.sales_order_id/purchase_order_id.
-- Update masing-masing line by matching product_id + first-match strategy.
-- (Detail di plan; idempotent dengan WHERE quantity_delivered = 0 to retry-safe)
```

### 4.3 Auto‑Close + Manual Short‑Close Logic

**RPC baru:** `recompute_so_status(p_so_id uuid)` dan `recompute_po_status(p_po_id uuid)`.

Dipanggil dari:
- `post_goods_delivery()` (existing) → setelah inventory_stock_out
- `post_goods_receipt()` (existing) → setelah inventory_stock_in
- `save_sales_invoice()` / `save_purchase_invoice()` → saat invoice posted
- Cancel RPC (di section 4.4)
- Manual close RPC (`close_sales_order(p_so_id, p_reason)` / `close_purchase_order`)

**Pseudo‑code `recompute_so_status`:**
```text
1. Hitung total ordered, delivered, invoiced (sum semua line item).
2. Status saat ini ≠ 'cancelled' DAN ≠ 'closed' (manual short-close protected).
3. Jika delivered >= ordered AND invoiced >= ordered → status = 'done'
   else if invoiced > 0 → status = 'invoiced'
   else if confirmed → status = 'confirmed'
4. Update sales_orders.status.
```

**Manual short-close RPC:**
```sql
create or replace function close_sales_order(p_so_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin_or_staff() then raise exception 'permission denied'; end if;
  update sales_orders
     set status='closed', closed_at=now(), closed_by=auth.uid(), close_reason=p_reason
   where id=p_so_id and status in ('confirmed','invoiced');
  if not found then raise exception 'SO tidak dapat ditutup (status tidak valid)'; end if;
  -- audit log via existing trigger
end $$;
-- Mirror untuk close_purchase_order
```

Status `closed` adalah final → tidak boleh ditambah GD/GR/Invoice baru. Validasi ini ditambahkan di `save_goods_delivery`, `save_goods_receipt`, `save_*_invoice`: tolak jika SO/PO referensi `status in ('closed','cancelled')`.

### 4.4 Cancel — Periode‑Aware

**Aturan keputusan:**

| Kondisi dokumen | Tindakan |
|---|---|
| `status = 'draft'` | Boleh hard‑delete (existing flow tidak berubah) |
| `status = 'posted'` AND periode dokumen masih buka | Cancel dijalankan → reverse journal di **tanggal dokumen asal**, status → `cancelled` |
| `status = 'posted'` AND periode dokumen sudah ditutup | Cancel **ditolak** → user diarahkan buat retur (Phase 3) yang akan bertanggal periode berjalan |
| Dokumen punya child belum ‑cancelled (mis. SI yang ada Payment) | Cancel ditolak → user wajib cancel child dulu |

**RPC baru per dokumen:** `cancel_goods_delivery(p_id, p_reason)`, `cancel_goods_receipt(p_id, p_reason)`, `cancel_sales_invoice(p_id, p_reason)`, `cancel_purchase_invoice(p_id, p_reason)`, `cancel_sales_order(p_id, p_reason)`, `cancel_purchase_order(p_id, p_reason)`.

**Pseudo‑code `cancel_goods_delivery`:**
```text
1. Permission check.
2. Lock row (SELECT ... FOR UPDATE).
3. Validasi: status='posted', tidak ada SI ber‑goods_delivery_id yang bukan cancelled.
4. Ambil journal_id asli, ambil tanggal dokumen.
5. _ensure_period_open(tanggal_dokumen)  -- enforce keputusan periode-aware
6. Insert reverse journal (tanggal sama dgn dokumen asal, semua line debit↔kredit dibalik,
   description='REVERSE: <gd_number> - <reason>').
7. Reverse inventory: untuk setiap goods_delivery_items, panggil inventory_stock_in
   dengan unit_cost = avg_cost saat itu (refund stock).
8. Set status='cancelled', simpan reversed_journal_id, cancelled_at, cancelled_by, cancel_reason.
9. Recompute SO status (panggil recompute_so_status).
```

**Untuk Invoice (SI/PI):** validasi tambahan — tidak ada `payments.amount > 0` yang menunjuk invoice ini. Jika ada, cancel ditolak; user wajib void payment dulu (di luar scope spec ini, akan ditangani di phase berikutnya atau workaround manual).

**Untuk SO/PO:** cancel hanya memerlukan validasi tidak ada child posted yang aktif. Cancel SO/PO tidak punya jurnal untuk direverse (SO/PO tidak posted ke GL); cuma update status.

### 4.5 UI/UX

**Tombol baru** di detail page (dengan permission guard `admin/staff`):
- SO/PO detail: tombol **"Tutup PO/SO"** (manual short‑close) — modal minta reason
- SO/PO detail: tombol **"Cancel SO/PO"** — disabled kalau ada child posted; modal minta reason
- GD/GR/SI/PI detail: tombol **"Cancel"** — modal warning + reason

**Status badge & filter:** Tambah `closed`, `cancelled` ke status badge di list pages dan filter dropdown.

**SO/PO detail page baru section:** "Fulfillment Progress" — tabel per line: ordered / delivered / invoiced / outstanding, dengan progress bar.

### 4.6 Acceptance Criteria
- [ ] Backfill `quantity_delivered/received/invoiced` benar untuk historis (cek 5 SO + 5 PO sample).
- [ ] Posting GD baru → SO line item `quantity_delivered` bertambah; SO status auto‑update.
- [ ] Posting GD untuk semua line → status SO `done` (jika SI sudah complete) atau tetap `confirmed/invoiced`.
- [ ] Manual short‑close PO → status `closed`, tombol "Receive Goods" hilang.
- [ ] Cancel GD posted (periode buka) → reverse journal muncul di GL, stock kembali, SO line `quantity_delivered` berkurang.
- [ ] Cancel GD posted (periode tertutup) → ditolak dengan pesan "Periode sudah ditutup, gunakan Retur".
- [ ] Cancel SI yang sudah ada payment → ditolak.
- [ ] Build pass; existing posting tests hijau.

### 4.7 Effort Estimate
**5-7 hari developer.** Distribusi:

| Tugas | Owner ideal | Estimasi |
|---|---|---|
| SQL migration + status enum + audit cols | Claude (Opus, schema + constraint reasoning) | 0.5 hari |
| Backfill script `quantity_*` historis | Claude (data correctness critical) | 1 hari |
| `recompute_so_status` / `recompute_po_status` RPC | Claude (financial logic) | 0.5 hari |
| `close_*` RPC + integrasi ke save RPCs | Codex (pattern repetitive setelah template ada) | 0.5 hari |
| `cancel_*` RPC × 6 (reverse journal + inventory) | Claude (financial logic, period guard) | 1.5 hari |
| Service layer `purchaseService.js`/`salesService.js` extends | Codex | 0.5 hari |
| UI tombol cancel + close + fulfillment progress | Codex (UI mekanis dengan template detail page) | 1 hari |
| Test + smoke verification | Claude (verification skill) | 0.5 hari |

---

## 5. Phase 3 — Retur Penjualan & Pembelian

### 5.1 Tujuan
Implementasikan dokumen Sales Return (Credit Note) dan Purchase Return (Debit Note), wajib link ke invoice asal, partial qty, PPN ikut dibalik, inventory pakai avg cost saat retur, refund manual.

### 5.2 Database Schema

**Migration:** `apps/erp-acc/erp-app/supabase/migrations/028_sales_purchase_returns.sql`

```sql
-- Sales Returns (Credit Note) — referensi ke invoices type='sales'
create table sales_returns (
  id uuid primary key default gen_random_uuid(),
  return_number text not null unique,           -- "CN-202605-0001"
  date date not null,
  customer_id uuid not null references customers(id),
  invoice_id uuid not null references invoices(id),  -- WAJIB link
  warehouse_id uuid references warehouses(id),
  reason text,
  subtotal numeric(15,2) not null default 0,
  tax_amount numeric(15,2) not null default 0,
  total numeric(15,2) not null default 0,
  status text not null default 'draft' check (status in ('draft','posted','cancelled')),
  -- Credit Note balance tracking (untuk apply ke invoice masa depan / refund manual)
  credit_balance numeric(15,2) not null default 0,  -- = total saat posted, dikurangi saat applied/refunded
  journal_id uuid references journals(id),
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id),
  cancel_reason text,
  reversed_journal_id uuid references journals(id)
);

create table sales_return_items (
  id uuid primary key default gen_random_uuid(),
  sales_return_id uuid not null references sales_returns(id) on delete cascade,
  invoice_item_id uuid not null references invoice_items(id),  -- traceability ke baris invoice asal
  product_id uuid not null references products(id),
  unit_id uuid not null references units(id),
  quantity numeric(15,4) not null check (quantity > 0),
  quantity_base numeric(15,4) not null check (quantity_base > 0),
  unit_price numeric(15,2) not null check (unit_price >= 0),  -- harga dari invoice asal (locked)
  tax_code_id uuid references tax_codes(id),
  tax_amount numeric(15,2) not null default 0,
  total numeric(15,2) not null default 0
);

-- Purchase Returns (Debit Note) — mirror struktur
create table purchase_returns (
  id uuid primary key default gen_random_uuid(),
  return_number text not null unique,           -- "DN-202605-0001"
  date date not null,
  supplier_id uuid not null references suppliers(id),
  invoice_id uuid not null references invoices(id),
  warehouse_id uuid references warehouses(id),
  reason text,
  subtotal numeric(15,2) not null default 0,
  tax_amount numeric(15,2) not null default 0,
  total numeric(15,2) not null default 0,
  status text not null default 'draft' check (status in ('draft','posted','cancelled')),
  debit_balance numeric(15,2) not null default 0,
  journal_id uuid references journals(id),
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id),
  cancel_reason text,
  reversed_journal_id uuid references journals(id)
);

create table purchase_return_items (  -- mirror sales_return_items
  id uuid primary key default gen_random_uuid(),
  purchase_return_id uuid not null references purchase_returns(id) on delete cascade,
  invoice_item_id uuid not null references invoice_items(id),
  product_id uuid not null references products(id),
  unit_id uuid not null references units(id),
  quantity numeric(15,4) not null check (quantity > 0),
  quantity_base numeric(15,4) not null check (quantity_base > 0),
  unit_price numeric(15,2) not null check (unit_price >= 0),
  tax_code_id uuid references tax_codes(id),
  tax_amount numeric(15,2) not null default 0,
  total numeric(15,2) not null default 0
);

-- Helper: hitung sisa qty yang boleh diretur per invoice_item
-- (qty_invoiced - sum(qty di sales_return_items posted untuk invoice_item ini))
create or replace function returnable_qty(p_invoice_item_id uuid)
returns numeric language sql stable as $$
  select i.quantity_base
       - coalesce((
           select sum(sri.quantity_base)
             from sales_return_items sri
             join sales_returns sr on sr.id = sri.sales_return_id
            where sri.invoice_item_id = p_invoice_item_id
              and sr.status = 'posted'
         ), 0)
       - coalesce((
           select sum(pri.quantity_base)
             from purchase_return_items pri
             join purchase_returns pr on pr.id = pri.purchase_return_id
            where pri.invoice_item_id = p_invoice_item_id
              and pr.status = 'posted'
         ), 0)
    from invoice_items i where i.id = p_invoice_item_id;
$$;

-- RLS pattern sama dengan sales/purchase
-- Trigger updated_at
-- Indexes: invoice_id, customer_id/supplier_id, date, status
```

### 5.3 Workflow Posting

**RPC: `post_sales_return(p_return_id)`** (idempotent, FOR UPDATE locking):

```text
1. Permission + period_open check (tanggal retur).
2. Lock row, validasi status='draft'.
3. Untuk setiap line:
     - Validasi quantity_base <= returnable_qty(invoice_item_id) → else raise.
     - Inventory IN: panggil inventory_stock_in(product_id, qty_base, AVG_COST_SEKARANG, ...)
       → reference_type='sales_return', reference_id=return_id.
     - Hitung COGS reverse pakai AVG_COST_SEKARANG × qty_base (KEPUTUSAN brainstorming Q3-d).
4. Generate journal entries:
   - DR Persediaan         (avg_cost_sekarang × qty)
   - CR HPP                (avg_cost_sekarang × qty)
   - DR Sales Return / Penjualan  (subtotal, kontra-revenue)
   - DR PPN Keluaran      (tax_amount, kontra-liability)
   - CR Piutang Usaha (AR) (subtotal + tax_amount)  ← balance side
   ATAU jika customer minta refund cash langsung di periode yang sama:
   - CR Kas/Bank ditangani SEPARATE via Cash Disbursement (manual, di luar RPC ini).
5. Set status='posted', journal_id, credit_balance = total.
6. Audit log.
```

**RPC: `post_purchase_return(p_return_id)`** — mirror dengan tanda terbalik:
```text
- Inventory OUT (kembalikan barang ke supplier): inventory_stock_out, reference_type='purchase_return'.
- Journal:
  - DR Hutang Usaha (AP)         (total)
  - CR Persediaan               (avg_cost_sekarang × qty)
  - CR Pajak Masukan (PPN)      (tax_amount)
  - CR Adjustment/Discount Cost (selisih jika unit_price ≠ avg_cost)
  Note: untuk purchase return, inventory yang keluar valued at avg_cost saat retur,
  tapi AP yang dikurangi = harga di invoice asal (locked unit_price).
  Selisih masuk akun "Penyesuaian Persediaan" yang dipilih di company_settings.
```

### 5.4 Faktur Pajak Retur (PPN Indonesia)

Per keputusan brainstorming (Q3‑c), PPN ikut dibalik. Implementasi:
- `tax_amount` per line di‑hitung dari `tax_code.rate` (bisa berbeda dari invoice asal jika tax_code di‑override).
- Jurnal otomatis sudah handle reversal via DR PPN Keluaran (sales) / CR Pajak Masukan (purchase).
- **Field tambahan di sales_returns/purchase_returns:** `tax_invoice_number text` (Nota Retur Faktur Pajak) — manual input sesuai NPWP supplier/customer.
- Print template Credit Note menampilkan field ini.
- Detail compliance e‑Faktur DJP XML export → di luar scope (sudah di Phase 4 roadmap existing).

### 5.5 Service Layer & UI

**File baru:**
- `apps/erp-acc/erp-app/src/services/salesReturnService.js`
- `apps/erp-acc/erp-app/src/services/purchaseReturnService.js`
- `apps/erp-acc/erp-app/src/pages/sales/SalesReturnsPage.jsx`
- `apps/erp-acc/erp-app/src/pages/sales/SalesReturnFormPage.jsx`
- `apps/erp-acc/erp-app/src/pages/purchase/PurchaseReturnsPage.jsx`
- `apps/erp-acc/erp-app/src/pages/purchase/PurchaseReturnFormPage.jsx`
- `apps/erp-acc/erp-app/src/components/shared/CreditNotePrintTemplate.jsx`

**UI flow Sales Return Form:**
1. Pilih Invoice asal (autocomplete: hanya `type='sales'`, `status in ('posted','partial','paid')`, `customer_id`).
2. Tabel item invoice tampil dengan kolom Returnable Qty (auto‑hitung); user pilih row + isi qty retur.
3. Tax code per line auto‑prefill dari invoice item; bisa override.
4. Total auto‑hitung; field Reason mandatory.
5. Save Draft → Post (RPC).
6. After post: tampilkan link ke jurnal yang dihasilkan + tombol Print Credit Note.

**Sales Invoice detail page** dapat tombol "Buat Retur" (shortcut dengan invoice_id pre‑filled).

### 5.6 Acceptance Criteria
- [ ] Buat sales return partial dari invoice → quantity_base tidak boleh > returnable_qty.
- [ ] Posting sales return → jurnal balanced (DR = CR), inventory_stock kembali sesuai qty, avg_cost ter‑update via stock_in.
- [ ] Tax amount muncul di jurnal sebagai DR PPN Keluaran.
- [ ] credit_balance terisi sebesar total saat posted.
- [ ] Buat sales return melebihi sisa retur → ditolak dengan pesan jelas.
- [ ] Cancel sales return posted → reverse journal + inventory_stock_out kembalikan stock + nullify credit_balance.
- [ ] Print Credit Note PDF tampil benar (gunakan pattern existing `InvoicePrintTemplate.jsx`).
- [ ] Mirror semua di atas untuk purchase return (debit note).
- [ ] Build pass; tidak ada regresi posting RPC existing.

### 5.7 Effort Estimate
**7-10 hari developer.** Distribusi:

| Tugas | Owner ideal | Estimasi |
|---|---|---|
| SQL migration 028 + RLS + helper `returnable_qty` | Claude (Opus, financial logic) | 1 hari |
| `post_sales_return` RPC + reverse RPC | Claude (financial logic, jurnal balanced) | 1.5 hari |
| `post_purchase_return` RPC + reverse RPC | Claude (financial logic) | 1 hari |
| Service layer (2 files × CRUD + post + cancel) | Codex (pattern repetitive) | 1 hari |
| List + Form pages × 4 | Codex (Ant Design boilerplate) | 2 hari |
| `returnable_qty` integration di form (qty validation UI) | Claude (UX correctness) | 0.5 hari |
| Credit/Debit Note print template | Codex (template existing reusable) | 0.5 hari |
| End‑to‑end smoke test (jurnal balanced, stock benar) | Claude (verification skill) | 1 hari |
| Playwright test untuk sales return flow | Codex | 0.5 hari |

---

## 6. Cross‑cutting Concerns

### 6.1 RLS Policies
Setiap tabel baru WAJIB:
```sql
alter table <table> enable row level security;
create policy "<table>_read" on <table> for select to authenticated using (<read_filter>);
create policy "<table>_manage" on <table> for all to authenticated using (is_admin_or_staff());
```

### 6.2 Audit Trail
Triggers dari `migrations/013_audit_triggers.sql` di‑extend untuk 4+2+2 tabel baru. Tindakan kritis (cancel, post, close) wajib audit_logs entry.

### 6.3 Period Lock
Setiap RPC yang menulis ke jurnal → `_ensure_period_open(date)` di awal. Cancel periode‑aware mengandalkan ini untuk tolak operasi di periode tertutup.

### 6.4 Idempotency
RPC posting harus idempotent (cek status = 'draft' sebelum proses, FOR UPDATE locking). Mengikuti pattern `migrations/017_payment_idempotency.sql`.

### 6.5 Service Layer Convention
- Semua RPC dipanggil via `supabase.rpc(...)`, jangan akses tabel langsung untuk operasi yg memerlukan jurnal.
- CRUD master data boleh akses tabel langsung dengan RLS guard.

---

## 7. Tech Stack & New Dependencies

| Komponen | Status |
|---|---|
| React 19 + Ant Design | sudah ada |
| Supabase (PostgreSQL) | sudah ada |
| `npm` package baru | **0** (semua reuse) |
| Migration files baru | 3 (026, 027, 028) |

---

## 8. Verification Plan

### Phase 1
1. Apply migration 026 di Supabase staging branch → cek tidak ada FK violation.
2. Buat product baru dengan category & tax code → save → reload → field tersimpan.
3. Edit product lama (yang baru di‑backfill) → category = "Uncategorized", boleh diganti.
4. Buat SO dengan payment term Net 30 → due_date di SI auto = SO.date + 30 hari.

### Phase 2
1. Apply migration 027 di staging → backfill `quantity_*` historis benar (verify dengan 5 SO sample).
2. Buat SO 100 unit → posting GD 60 unit → SO line `quantity_delivered = 60`, status `confirmed`.
3. Posting GD 40 unit → status `confirmed` (belum invoiced).
4. Posting SI 100 unit → status `done` (auto‑close).
5. Manual short‑close PO 100 unit yang baru terima 80 → status `closed`, tombol Receive hilang.
6. Cancel GD posted di periode terbuka → reverse journal muncul, stock kembali.
7. Cancel GD posted di periode tertutup → ditolak.

### Phase 3
1. Apply migration 028.
2. Pilih SI posted 100 unit → buat sales return 30 unit → save draft.
3. Coba retur 80 unit → ditolak (sisa retur = 70).
4. Post sales return 30 unit → cek jurnal balanced + inventory_stock + 30 unit.
5. Cancel sales return → reverse journal + stock balik − 30.
6. Mirror untuk purchase return.

---

## 9. Implementation Notes

### Soft delete pattern
- Master data: `is_active`, `deleted_at`, `deleted_by` (existing).
- Transaksi (returns): `cancelled_at`, `cancelled_by`, `cancel_reason` + reverse journal — tidak hard delete.

### Number generators
Reuse `generate_number()` existing dengan prefix baru:
- Sales Return: `'CN'` (Credit Note)
- Purchase Return: `'DN'` (Debit Note)

### Account mappings (perlu konfigurasi `company_settings`)
- `default_sales_return_account_id` — kontra‑revenue (default = sub COA "Retur Penjualan")
- `default_purchase_return_account_id` — kontra‑expense / inventory adjustment
- `default_inventory_adjustment_account_id` — selisih saat avg_cost ≠ unit_price
- 4 akun ini di‑bootstrap di Phase 1 seed (jika belum ada di COA).

### Handover Codex‑Claude
Lihat `Effort Estimate` per phase. Pola umum:
- **Claude (Opus):** SQL migration design, financial RPC logic, period guard, cross‑file financial reasoning, verification.
- **Codex (Sonnet/Haiku-fast):** UI pages (Ant Design), service layer wrappers, print templates, repetitive Playwright tests setelah pattern sudah ditetapkan oleh Claude.
- **Handoff artifact:** spec ini + plan (akan dibuat selanjutnya). Plan akan punya Task ID + suggested executor per task.

### Anti‑patterns yang dihindari
- ❌ Jangan hapus field lama (`products.category`, `products.is_taxable`, `products.tax_rate`) di Phase 1.
- ❌ Jangan implementasi multi‑warehouse logic di Phase 1; cuma master + default link.
- ❌ Jangan auto‑refund retur ke Cash/Bank; refund manual.
- ❌ Jangan biarkan jurnal unbalanced; setiap RPC posting wajib assert sum(debit) = sum(credit).
- ❌ Jangan lakukan cancel dokumen yang ada child posted yang masih aktif.
- ❌ Jangan deploy ke production; staging only.

---

## 10. Open Questions (untuk diputuskan saat implementasi)

Tidak ada — semua keputusan kebijakan akuntansi sudah dijawab di brainstorming session 2026-05-14.

---

## Appendix A: File Inventory (untuk handover)

### Database migrations
- `apps/erp-acc/erp-app/supabase/migrations/026_master_data_tier1.sql` (Phase 1)
- `apps/erp-acc/erp-app/supabase/migrations/027_so_po_closing_cancel.sql` (Phase 2)
- `apps/erp-acc/erp-app/supabase/migrations/028_sales_purchase_returns.sql` (Phase 3)

### Service layer (new)
- `src/services/productCategoryService.js`
- `src/services/paymentTermService.js`
- `src/services/taxCodeService.js`
- `src/services/warehouseService.js`
- `src/services/salesReturnService.js`
- `src/services/purchaseReturnService.js`

### Service layer (modified)
- `src/services/masterDataService.js` (joins category + tax_code)
- `src/services/salesService.js` (cancel + close + recompute integrations)
- `src/services/purchaseService.js` (cancel + close + recompute integrations)

### Pages (new)
- `src/pages/master/ProductCategoriesPage.jsx`
- `src/pages/master/PaymentTermsPage.jsx`
- `src/pages/master/TaxCodesPage.jsx`
- `src/pages/master/WarehousesPage.jsx`
- `src/pages/sales/SalesReturnsPage.jsx`
- `src/pages/sales/SalesReturnFormPage.jsx`
- `src/pages/purchase/PurchaseReturnsPage.jsx`
- `src/pages/purchase/PurchaseReturnFormPage.jsx`

### Pages (modified — add dropdown / cancel-close button / fulfillment progress)
- `src/pages/sales/SalesOrderFormPage.jsx`, `SalesOrdersPage.jsx`
- `src/pages/sales/GoodsDeliveryFormPage.jsx`, `GoodsDeliveriesPage.jsx`
- `src/pages/sales/SalesInvoiceFormPage.jsx`, `SalesInvoicesPage.jsx`
- `src/pages/purchase/PurchaseOrderFormPage.jsx`, `PurchaseOrdersPage.jsx`
- `src/pages/purchase/GoodsReceiptFormPage.jsx`, `GoodsReceiptsPage.jsx`
- `src/pages/purchase/PurchaseInvoiceFormPage.jsx`, `PurchaseInvoicesPage.jsx`
- `src/pages/master/ProductsPage.jsx` (add category + tax_code dropdown)
- `src/App.jsx` (routes baru)

### Components (new)
- `src/components/shared/CreditNotePrintTemplate.jsx`

### Tests (new)
- `tests/playwright/sales-return.spec.js`
- `tests/playwright/purchase-return.spec.js`
- `tests/playwright/so-po-closing.spec.js`
- `tests/playwright/document-cancel.spec.js`

---

**End of PRD.**
