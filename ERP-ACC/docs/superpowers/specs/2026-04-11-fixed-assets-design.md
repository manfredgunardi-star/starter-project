# Design Spec — Modul Aset Tetap (Fixed Assets) ERP-ACC

**Tanggal:** 2026-04-11
**Status:** Draft (post-brainstorm, siap review)
**Target Project:** `ERP-ACC/erp-app/` (Supabase + React)
**Scope:** MVP solid — register aset, auto-journal perolehan, auto-generate schedule penyusutan, bulk posting, disposal (sale & writeoff), 5 laporan, bulk import Excel. Arsitektur siap upgrade ke fitur lanjutan (multi-method, proporsional hari, revaluasi, dsb).

---

## 1. Ringkasan Keputusan

| # | Area | Keputusan |
|---|---|---|
| 1 | Scope | MVP solid dengan arsitektur siap upgrade |
| 2 | Mulai penyusutan | Bulan berikutnya setelah tanggal perolehan (konvensi Indonesia) |
| 3 | Sumber perolehan | Kas/Bank + Hutang + Uang Muka (mendukung pembayaran campuran) |
| 4 | Disposal | Penjualan (sale) + Penghapusan (writeoff) |
| 5 | Struktur kategori | Per-kategori: tiap kategori punya akun aset, akumulasi, dan beban sendiri |
| 6 | Kategori awal | Peralatan (48), Kendaraan (96), Mesin (96), Bangunan (240), Inventaris Kantor (48) |
| 7 | Nilai residu | Opsional, default 0 |
| 8 | Posting penyusutan | Hybrid — auto-generate full schedule + bulk-post per periode |
| 9 | Laporan MVP | 5 laporan (daftar, kartu, per periode, disposal, summary per kategori) |
| 10 | Bulk import | Excel dengan template, validasi, preview |
| 11 | Kode aset | Auto per kategori: `EQP-YYYY-NNNN`, `VHC-YYYY-NNNN`, dll |
| 12 | Edit setelah posting | Field finansial terkunci; nama/keterangan/lokasi tetap editable |

---

## 2. Data Model

Migration baru: **`014_fixed_assets.sql`** (menambah tabel), dan tambahan di **`seed.sql`** (COA baru + seed kategori).

### 2.1 Tabel `asset_categories`

```
id                                   uuid pk
code                                 text unique         -- 'EQP', 'VHC', 'MCH', 'BLD', 'OFI'
name                                 text
default_useful_life_months           int
asset_account_id                     uuid → coa(id)
accumulated_depreciation_account_id  uuid → coa(id)
depreciation_expense_account_id      uuid → coa(id)
is_active                            boolean default true
created_at, created_by
updated_at, updated_by
deleted_at, deleted_by
```

### 2.2 Tabel `assets`

```
id                        uuid pk
code                      text unique              -- 'EQP-2026-0001'
name                      text
category_id               uuid → asset_categories
acquisition_date          date
acquisition_cost          numeric(18,2)
salvage_value             numeric(18,2) default 0
useful_life_months        int                      -- override atau default dari kategori
depreciation_method       text default 'straight_line'
depreciation_start_date   date                     -- = awal bulan berikutnya setelah acquisition_date
location                  text nullable
description               text nullable

-- perolehan
acquisition_journal_id    uuid → journals(id)
payment_method            text                     -- 'cash_bank' | 'hutang' | 'uang_muka' | 'mixed'
supplier_id               uuid → suppliers nullable

-- status
status                    text default 'active'    -- 'active' | 'disposed' | 'fully_depreciated'
disposed_at               date nullable
disposal_type             text nullable            -- 'sale' | 'writeoff'
disposal_journal_id       uuid → journals nullable

is_active                 boolean default true
created_at, created_by
updated_at, updated_by
deleted_at, deleted_by
```

### 2.3 Tabel `depreciation_schedules`

```
id                   uuid pk
asset_id             uuid → assets
period               text                          -- 'YYYY-MM'
period_date          date                          -- akhir bulan
sequence_no          int                           -- 1..useful_life_months
amount               numeric(18,2)
accumulated_amount   numeric(18,2)
book_value_end       numeric(18,2)
status               text default 'pending'        -- 'pending' | 'posted' | 'cancelled'
journal_id           uuid → journals nullable
posted_at            timestamptz nullable
posted_by            uuid nullable
unique(asset_id, period)
```

### 2.4 Tabel `asset_disposals`

```
id                        uuid pk
asset_id                  uuid → assets
disposal_date             date
disposal_type             text                     -- 'sale' | 'writeoff'
sale_price                numeric(18,2) nullable   -- null jika writeoff
payment_account_id        uuid → coa nullable      -- kas/bank penerima (jika sale)
book_value_at_disposal    numeric(18,2)            -- snapshot
accumulated_at_disposal   numeric(18,2)
gain_loss                 numeric(18,2)            -- +gain / -loss
journal_id                uuid → journals
notes                     text nullable
created_at, created_by
```

### 2.5 Relasi

```
asset_categories ─┐
                  ↓
               assets ──┬── depreciation_schedules (1:N)
                        └── asset_disposals (1:1)

assets.acquisition_journal_id ─→ journals
assets.disposal_journal_id    ─→ journals
depreciation_schedules.journal_id ─→ journals
asset_disposals.journal_id    ─→ journals
```

### 2.6 Catatan Desain

- Schedule dihitung saat create aset (idempotent function). Edit field finansial → regenerate HANYA jika belum ada row `posted`.
- Disposal flow: auto-catch-up post penyusutan sampai bulan sebelum disposal → buat jurnal disposal → cancel schedule sisa → set status `disposed`.
- Semua tabel ikut pola soft delete + audit trail.

---

## 3. Modifikasi Chart of Accounts & Seed

### 3.1 Aset Tetap (anak `1-20000`)

| Kode | Nama | Status |
|---|---|---|
| `1-21000` | Peralatan | existing |
| `1-22000` | Kendaraan | existing |
| `1-23000` | Mesin | **BARU** |
| `1-24000` | Bangunan | **BARU** |
| `1-25000` | Inventaris Kantor | **BARU** |

### 3.2 Akumulasi Penyusutan per Kategori (anak `1-29000` yang jadi parent grouping)

| Kode | Nama |
|---|---|
| `1-29100` | Akum. Penyusutan Peralatan |
| `1-29200` | Akum. Penyusutan Kendaraan |
| `1-29300` | Akum. Penyusutan Mesin |
| `1-29400` | Akum. Penyusutan Bangunan |
| `1-29500` | Akum. Penyusutan Inventaris Kantor |

`type = 'asset'`, `normal_balance = 'debit'` (konsisten dengan `1-29000` existing walau saldonya kontra).

### 3.3 Beban Penyusutan per Kategori (anak `5-17000` yang jadi parent grouping)

| Kode | Nama |
|---|---|
| `5-17100` | Beban Penyusutan Peralatan |
| `5-17200` | Beban Penyusutan Kendaraan |
| `5-17300` | Beban Penyusutan Mesin |
| `5-17400` | Beban Penyusutan Bangunan |
| `5-17500` | Beban Penyusutan Inventaris Kantor |

### 3.4 Gain/Loss on Disposal

| Kode | Nama | Parent |
|---|---|---|
| `4-19100` | Keuntungan Penjualan Aset Tetap | `4-19000` Pendapatan Lainnya |
| `5-99100` | Kerugian Pelepasan Aset Tetap | `5-99000` Beban Lainnya |

### 3.5 Seed `asset_categories`

| code | name | default_useful_life_months | asset_account | accumulated_dep_account | depreciation_expense_account |
|---|---|---|---|---|---|
| EQP | Peralatan | 48 | 1-21000 | 1-29100 | 5-17100 |
| VHC | Kendaraan | 96 | 1-22000 | 1-29200 | 5-17200 |
| MCH | Mesin | 96 | 1-23000 | 1-29300 | 5-17300 |
| BLD | Bangunan | 240 | 1-24000 | 1-29400 | 5-17400 |
| OFI | Inventaris Kantor | 48 | 1-25000 | 1-29500 | 5-17500 |

Semua penambahan di atas masuk ke `seed.sql` (project masih Phase 1, belum ada data produksi).

---

## 4. Services Layer

### 4.1 File Structure

```
src/services/
├── assetCategoryService.js      -- ~80 baris
├── assetService.js              -- ~250 baris
├── depreciationService.js       -- ~200 baris
└── assetDisposalService.js      -- ~150 baris
```

Empat file — tiap service fokus satu tanggung jawab. `assetService` memanggil `depreciationService.generateSchedule()` tapi tidak tahu soal bulk posting atau disposal.

### 4.2 `assetCategoryService.js`

```js
listCategories()                 // aktif saja
getCategory(id)
createCategory(input)
updateCategory(id, patch)        // block kalau sudah dipakai aset aktif
softDeleteCategory(id)           // block kalau sudah dipakai
```

### 4.3 `assetService.js`

```js
listAssets({ categoryId, status, q })
getAsset(id)
getAssetWithSchedule(id)         // untuk Kartu Aset

createAsset(input)
  input: {
    name, category_id,
    acquisition_date, acquisition_cost, salvage_value,
    useful_life_months, location, description,
    payment: {
      method: 'cash_bank' | 'hutang' | 'uang_muka' | 'mixed',
      cash_bank_account_id?, cash_bank_amount?,
      supplier_id?, hutang_amount?,
      uang_muka_account_id?, uang_muka_amount?,
    }
  }
  flow:
    1. Generate code via RPC generate_asset_code(category_code)
    2. Validasi sum(payment.*_amount) === acquisition_cost
    3. Hitung depreciation_start_date = awal bulan berikutnya
    4. Insert assets row
    5. Panggil RPC create_asset_acquisition_journal → simpan acquisition_journal_id
    6. Panggil RPC generate_depreciation_schedule
    7. Audit log
  semua transaksional

updateAsset(id, patch)
  - field terkunci jika ada schedule 'posted':
    acquisition_cost, acquisition_date, useful_life_months,
    salvage_value, depreciation_method, category_id
  - field editable: name, description, location
  - jika field finansial berubah DAN belum ada posted → regenerate schedule

softDeleteAsset(id)
  - block jika punya schedule 'posted' atau disposal_journal
  - arahkan ke disposal flow
```

### 4.4 `depreciationService.js`

```js
generateSchedule(assetId)
  // idempotent: delete semua schedule 'pending', re-insert dari sequence 1..N
  // preserve row 'posted' / 'cancelled'
  // formula straight-line:
  //   total_depreciable = acquisition_cost - salvage_value
  //   monthly_amount    = round(total_depreciable / useful_life_months, 2)
  //   last_amount       = total_depreciable - (monthly_amount * (N-1))
  // period pertama = bulan dari depreciation_start_date

regenerateSchedule(assetId)      // alias semantik

previewPeriod({ period_from, period_to })
  // return [{ asset, schedule_rows_pending, total_amount }]
  // skip disposed & yang sudah posted

postPeriod({ period_from, period_to, posting_date, description_template })
  // via RPC post_depreciation_batch (atomic)
  // 1 journal per aset per bulan:
  //   Dr depreciation_expense_account (dari kategori)
  //   Cr accumulated_depreciation_account (dari kategori)
  // set schedule.status='posted', journal_id, posted_at, posted_by
  // return { posted_count, skipped_count, errors[] }

reverseSchedule(scheduleId)      // skeleton, tidak exposed di MVP
```

**Pilihan desain:** 1 journal per aset per bulan (bukan gabungan) supaya traceability per aset di Kartu Aset mudah.

### 4.5 `assetDisposalService.js`

```js
previewDisposal({ asset_id, disposal_date, disposal_type, sale_price? })
  // hitung:
  //   periods_to_post_first (schedule pending dengan period_date < disposal_date)
  //   book_value_at_disposal = acquisition_cost - accumulated_at_disposal
  //   gain_loss = (sale_price || 0) - book_value_at_disposal
  // TIDAK menulis apapun

executeDisposal({ asset_id, disposal_date, disposal_type,
                  sale_price?, payment_account_id?, notes })
  // via RPC execute_asset_disposal (atomic)
  // flow:
  //   1. Auto-post schedule pending dengan period_date < disposal_date
  //   2. Snapshot accumulated & book value
  //   3. Buat disposal journal
  //   4. Insert asset_disposals
  //   5. Set schedule pending sesudah disposal_date → 'cancelled'
  //   6. Update assets: status='disposed', disposed_at, disposal_journal_id
  //   7. Audit log
```

### 4.6 Struktur Jurnal Otomatis

**Acquisition** (`source = 'asset_acquisition'`):
```
Dr asset_account (kategori)                acquisition_cost
  Cr cash_bank_account                      cash_bank_amount   (opt)
  Cr 2-11000 Hutang Usaha                   hutang_amount      (opt, link supplier)
  Cr 1-16000 Uang Muka (atau sub)           uang_muka_amount   (opt)
is_posted: true
```

**Depreciation** (`source = 'asset_depreciation'`):
```
Dr depreciation_expense_account (kategori)  monthly_amount
  Cr accumulated_depreciation_account       monthly_amount
is_posted: true
```

**Disposal — Sale** (`source = 'asset_disposal'`):
```
Dr cash/bank (payment_account)              sale_price
Dr accumulated_depreciation_account         accumulated_at_disposal
  Cr asset_account                          acquisition_cost
  Cr 4-19100 Keuntungan                     gain     (jika gain_loss > 0)
-- atau:
Dr 5-99100 Kerugian                         |loss|   (jika gain_loss < 0)
```

**Disposal — Writeoff** (`source = 'asset_disposal'`):
```
Dr accumulated_depreciation_account         accumulated_at_disposal
Dr 5-99100 Kerugian Pelepasan               book_value_at_disposal
  Cr asset_account                          acquisition_cost
```

### 4.7 Nilai `journals.source` Baru

- `'asset_acquisition'`
- `'asset_depreciation'`
- `'asset_disposal'`

Perlu ALTER check constraint (jika ada) saat migration 014.

### 4.8 Audit Trail

- `asset.create` / `asset.update` / `asset.softdelete`
- `asset.schedule_regenerate`
- `asset.depreciation_post` (1 log per batch, bukan per row)
- `asset.dispose`
- `asset_category.create` / `asset_category.update`

### 4.9 Edge Cases

| Kasus | Penanganan |
|---|---|
| `acquisition_date` di masa lalu | Schedule mulai bulan berikutnya; user bisa catch-up post |
| `useful_life_months < 1` | Ditolak di validasi |
| `acquisition_cost <= salvage_value` | Ditolak |
| Fully depreciated | Trigger set `status='fully_depreciated'` saat schedule terakhir posted |
| Post periode sebelum asset start | Skip aset, masuk `skipped_count` |
| Post setelah disposed | Skip — schedule sudah cancelled |
| Pembulatan | Selisih dilempar ke bulan terakhir |
| Ubah kategori aset setelah posting | Block |

---

## 5. Pages, Components & Routing

### 5.1 Folder Structure

```
src/pages/assets/
├── AssetCategoriesPage.jsx
├── AssetsPage.jsx
├── AssetFormPage.jsx
├── AssetDetailPage.jsx
├── AssetBulkImportPage.jsx
├── DepreciationRunPage.jsx
└── AssetDisposalFormPage.jsx

src/pages/reports/
├── AssetsListReportPage.jsx
├── DepreciationPeriodReportPage.jsx
├── AssetDisposalsReportPage.jsx
└── AssetsSummaryReportPage.jsx

src/components/assets/
├── AssetCategoryFormModal.jsx
├── AssetPaymentFields.jsx
├── DepreciationPreviewTable.jsx
├── DepreciationScheduleTable.jsx
└── DisposalPreviewCard.jsx
```

### 5.2 Routing Tambahan (`App.jsx`)

```jsx
{/* Aset Tetap */}
<Route path="assets/categories" element={<AssetCategoriesPage />} />
<Route path="assets" element={<AssetsPage />} />
<Route path="assets/new" element={<AssetFormPage />} />
<Route path="assets/:id" element={<AssetDetailPage />} />
<Route path="assets/:id/edit" element={<AssetFormPage />} />
<Route path="assets/:id/dispose" element={<AssetDisposalFormPage />} />
<Route path="assets/bulk-import" element={<AssetBulkImportPage />} />
<Route path="assets/depreciation" element={<DepreciationRunPage />} />

{/* Laporan */}
<Route path="reports/assets-list" element={<AssetsListReportPage />} />
<Route path="reports/depreciation-period" element={<DepreciationPeriodReportPage />} />
<Route path="reports/asset-disposals" element={<AssetDisposalsReportPage />} />
<Route path="reports/assets-summary" element={<AssetsSummaryReportPage />} />
```

### 5.3 Detail Halaman

**AssetCategoriesPage** — list + modal CRUD, 3 dropdown akun COA (asset, accumulated, expense), default umur bulan.

**AssetsPage** — filter (kategori, status, search), kolom: Kode, Nama, Kategori, Tgl Perolehan, Harga, Akum s/d hari ini, Nilai Buku, Status. Tombol: Tambah, Bulk Import, Post Penyusutan.

**AssetFormPage** (create & edit):
- Section Informasi: kategori (auto-fill default umur), nama, kode (editable), lokasi, keterangan
- Section Keuangan: tanggal, harga, residu, umur bulan, depreciation_start_date (read-only)
- Section Pembayaran (`AssetPaymentFields`): radio Tunai/Kredit/Uang Muka/Campuran dengan field kondisional
- Section Preview Penyusutan (read-only)
- Edit mode: field finansial disabled dengan tooltip jika ada schedule posted

**AssetDetailPage** (Kartu Aset) — read-only:
- Header: info umum + nilai buku kini
- Tab Schedule Penyusutan: full table dengan status badge, row posted klik → jurnal
- Tab Riwayat Jurnal: acquisition + depreciation + disposal
- Tab Audit Log
- Tombol: Edit, Dispose

**DepreciationRunPage** — 3 step:
1. Pilih periode from/to, tanggal posting, template deskripsi
2. Preview table per periode × aset, total per periode
3. Post → progress → summary `{ posted, skipped, errors }`

**AssetDisposalFormPage**:
- Info aset read-only
- Input: tanggal, tipe (sale/writeoff), harga jual, akun penerima
- Preview box: catch-up info, nilai buku, gain/loss
- Konfirmasi → eksekusi → redirect ke AssetDetailPage

**AssetBulkImportPage**:
- Download template Excel
- Upload → parse → preview dengan validasi row-by-row (kategori resolve by code)
- Import satu-satu via `createAsset()` dengan `payment.method = 'cash_bank'` ke akun default header
- Template kolom: `name, category_code, acquisition_date, acquisition_cost, salvage_value, useful_life_months, location, description`
- Untuk migrasi data awal — tidak support mixed payment per row

### 5.4 Laporan

| Page | Filter | Kolom | Export |
|---|---|---|---|
| AssetsListReportPage | cut-off date, kategori, status | Kode, Nama, Kategori, Tgl Perolehan, Harga, Akum, Nilai Buku | PDF, Excel |
| DepreciationPeriodReportPage | rentang periode, kategori | Periode, Kategori, Jumlah Aset, Total | PDF, Excel |
| AssetDisposalsReportPage | rentang tanggal, tipe | Tgl, Kode, Nama, Tipe, Harga Jual, Nilai Buku, Gain/Loss | PDF, Excel |
| AssetsSummaryReportPage | cut-off date | Kategori, Jumlah, Total Harga, Total Akum, Total Nilai Buku | PDF, Excel |

### 5.5 Ubah Halaman Existing

- **BalanceSheetPage.jsx** — verifikasi section Aset Tetap menampilkan breakdown per kategori. Karena generated dari COA hierarchy, seharusnya otomatis muncul; patch jika perlu.
- **Sidebar/Navigation** — tambah section "Aset Tetap": Daftar Aset, Kategori Aset, Post Penyusutan, Import Aset. Section Laporan: tambah 4 menu baru.

---

## 6. RLS, Permissions & Audit Triggers

### 6.1 RLS

```sql
alter table asset_categories         enable row level security;
alter table assets                   enable row level security;
alter table depreciation_schedules   enable row level security;
alter table asset_disposals          enable row level security;
```

### 6.2 Policies

| Tabel | Read | Insert | Update | Delete |
|---|---|---|---|---|
| `asset_categories` | authenticated | `is_admin_or_staff()` | `is_admin_or_staff()` | `is_admin()` |
| `assets` | authenticated | `is_admin_or_staff()` | `is_admin_or_staff()` | `is_admin()` (soft) |
| `depreciation_schedules` | authenticated | **via RPC only** | **via RPC only** | admin darurat |
| `asset_disposals` | authenticated | **via RPC only** | ❌ immutable | admin darurat |

`depreciation_schedules` dan `asset_disposals` tidak punya policy client insert/update langsung — semua via RPC `security definer` untuk mencegah bypass logic bisnis.

### 6.3 RPC Functions

Semua `security definer` dengan role check `get_my_role() in ('admin', 'staff')` di body:

- `generate_asset_code(p_category_code text) returns text`
- `generate_depreciation_schedule(p_asset_id uuid) returns void`
- `create_asset_acquisition_journal(p_asset_id uuid, p_payment jsonb) returns uuid`
- `post_depreciation_batch(p_period_from text, p_period_to text, p_posting_date date, p_description_template text) returns jsonb`
- `execute_asset_disposal(p_asset_id uuid, p_disposal_date date, p_disposal_type text, p_sale_price numeric, p_payment_account_id uuid, p_notes text) returns uuid`

### 6.4 Audit Triggers

```sql
create trigger audit_assets_trigger
  after insert or update or delete on assets
  for each row execute function audit_log_trigger();

create trigger audit_asset_categories_trigger
  after insert or update or delete on asset_categories
  for each row execute function audit_log_trigger();
```

Untuk `depreciation_schedules` & `asset_disposals`: audit dicatat eksplisit di dalam RPC (1 entry per batch operasi, bukan per row).

### 6.5 Soft Delete

Semua tabel punya `deleted_at`, `deleted_by`, `is_active`. Query default filter `is_active = true`. Hard delete hanya via admin RPC darurat (tidak di MVP).

---

## 7. Validasi & Urutan Implementasi

### 7.1 Strategi Testing

Tidak ada test framework — manual smoke test + SQL verification. Akan dieksekusi saat implementasi.

**Area kritis yang wajib divalidasi:**

1. **Double-entry balance** — semua jurnal `sum(debit) = sum(credit)`:
   ```sql
   select journal_id, sum(debit) - sum(credit) as diff
   from journal_items group by journal_id having sum(debit) <> sum(credit);
   ```
2. **Schedule math** — total schedule amount = `acquisition_cost - salvage_value` (toleransi pembulatan di row terakhir).
3. **Nilai buku sanity** — setelah N bulan posting: nilai buku = `acquisition_cost - accumulated_posted`.
4. **Disposal gain/loss** — journal balanced, schedule sisa cancelled.
5. **Idempotensi** — post periode yang sama 2x → run kedua semua skip.

### 7.2 Smoke Test Scenarios

| # | Skenario | Expected |
|---|---|---|
| 1 | Buat kategori "Laptop Kerja" dengan 3 akun COA | Masuk list, bisa dipilih di form |
| 2 | Buat aset Mobil Avanza: harga 250jt, umur 96 bulan, residu 50jt, tunai dari Bank BCA | Code auto `VHC-2026-0001`, acquisition journal Dr 1-22000 / Cr Bank BCA, schedule 96 row @ 2.083.333 |
| 3 | Buat aset tgl 15-Jan, post Jan-Apr | Jan skip (start Feb), Feb-Apr posted |
| 4 | Post periode sama 2x | Run kedua semua skip, tidak duplikat |
| 5 | Pembayaran campuran: 100jt cash + 50jt hutang + 30jt uang muka (total 180jt) | 1 journal dengan 4 items, balanced |
| 6 | Campuran tapi sum ≠ harga | Ditolak dengan error jelas |
| 7 | Disposal Sale setelah 24 bulan dengan harga 200jt | Catch-up posting, nilai buku benar, gain/loss benar, schedule sisa cancelled |
| 8 | Disposal Writeoff aset 6 bulan | Journal: Dr akum + Dr Loss / Cr aset |
| 9 | Edit harga perolehan setelah posting | Field disabled, tooltip |
| 10 | Edit nama/lokasi setelah posting | Berhasil |
| 11 | Bulk import 10 row (1 invalid) | Preview tandai invalid, import 9 valid |
| 12 | Kartu Aset fully depreciated | Status `fully_depreciated`, nilai buku = residu |
| 13 | Neraca setelah posting | Breakdown aset tetap per kategori, total benar |
| 14 | User non-admin/staff coba post depreciation | RPC error "permission denied" |

### 7.3 Urutan Implementasi

**Step 1 — Database Foundation**
1. Migration `014_fixed_assets.sql`: 4 tabel + RLS + audit trigger
2. Update `seed.sql`: COA baru + 5 kategori
3. Smoke: verify tabel & seed masuk

**Step 2 — RPC & Helper Functions**
4. `generate_asset_code()`
5. `generate_depreciation_schedule()`
6. `create_asset_acquisition_journal()`
7. `post_depreciation_batch()`
8. `execute_asset_disposal()`
9. Smoke: call RPC via SQL editor dengan fixtures

**Step 3 — Services Layer**
10. `assetCategoryService.js`
11. `assetService.js`
12. `depreciationService.js`
13. `assetDisposalService.js`

**Step 4 — Master UI**
14. `AssetCategoriesPage`
15. `AssetsPage`
16. `AssetFormPage` create mode + `AssetPaymentFields`
17. `AssetFormPage` edit mode + field locking

**Step 5 — Operasi Lanjutan UI**
18. `AssetDetailPage` + `DepreciationScheduleTable`
19. `DepreciationRunPage`
20. `AssetDisposalFormPage`
21. `AssetBulkImportPage`

**Step 6 — Laporan & Navigasi**
22. 4 report pages
23. Update sidebar navigation
24. Verifikasi `BalanceSheetPage`; patch kalau perlu

**Step 7 — Validasi Akhir**
25. Jalankan 14 smoke test scenario
26. `npm run build` pass
27. No regression modul existing (Jurnal, Neraca, Laba-Rugi)

### 7.4 Scope yang Ditunda (Tidak di MVP)

- Multi-method penyusutan (saldo menurun, SYD)
- Proporsional hari (mid-month convention)
- Revaluasi
- Impairment
- Linked ke Purchase module (PO/GR → auto create asset)
- Asset tagging / barcode / QR
- Riwayat mutasi lokasi/PIC
- Reverse posting depreciation (skeleton saja)
- Trade-in disposal

---

## 8. File yang Akan Dibuat / Diubah

**Dibuat:**
- `erp-app/supabase/migrations/014_fixed_assets.sql`
- `erp-app/src/services/assetCategoryService.js`
- `erp-app/src/services/assetService.js`
- `erp-app/src/services/depreciationService.js`
- `erp-app/src/services/assetDisposalService.js`
- `erp-app/src/pages/assets/*.jsx` (7 file)
- `erp-app/src/pages/reports/AssetsListReportPage.jsx`
- `erp-app/src/pages/reports/DepreciationPeriodReportPage.jsx`
- `erp-app/src/pages/reports/AssetDisposalsReportPage.jsx`
- `erp-app/src/pages/reports/AssetsSummaryReportPage.jsx`
- `erp-app/src/components/assets/*.jsx` (5 file)

**Diubah:**
- `erp-app/supabase/seed.sql` — COA baru + seed kategori
- `erp-app/src/App.jsx` — routing tambahan
- `erp-app/src/components/layout/Sidebar.jsx` (atau yang ekuivalen) — menu tambahan
- `erp-app/src/pages/reports/BalanceSheetPage.jsx` — verifikasi/patch jika perlu

---

## 9. Guardrail Compliance

Sesuai CLAUDE.md:

- ✅ **Finance/Accounting Guardrails** — modifikasi COA, double-entry, jurnal otomatis, formula keuangan — semua sudah didiskusikan dan di-approve di brainstorm.
- ✅ **Security Guardrails** — RLS pakai helper existing, tidak modifikasi auth flow.
- ✅ **Data Safety** — semua tabel soft delete, audit trail, sanitize (via service layer), role check di RPC.
- ✅ **Change Guardrails** — schema baru, approval flow tidak terpengaruh, bulk import pattern baru (diisolasi di halaman sendiri).
