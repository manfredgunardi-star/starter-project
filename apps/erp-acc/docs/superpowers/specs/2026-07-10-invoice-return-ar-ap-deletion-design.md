# Penghapusan Piutang/Hutang Invoice via Dokumen Retur — Design

**Status:** Approved for planning
**Date:** 2026-07-10
**App:** apps/erp-acc

## Goal

Saat Retur Penjualan diposting terhadap Sales Invoice tertentu, sisa piutang invoice itu berkurang. Saat Retur Pembelian diposting terhadap Purchase Invoice tertentu, sisa hutang invoice itu berkurang. Jika nilai retur melebihi sisa piutang/hutang invoice (misal invoice sudah lunas), selisihnya dicatat sebagai saldo kredit customer/supplier yang bisa diterapkan manual ke invoice berikutnya.

## Context / Existing State

- Modul Retur sudah live (`apps/erp-acc/migrations/007_sales_purchase_returns.sql` — bukan di `supabase/migrations/`) tapi hanya link ke `sales_order_id`/`purchase_order_id`, tidak ke invoice. `post_sales_return` hanya menjurnal Persediaan/HPP (tidak menyentuh piutang sama sekali). `post_purchase_return` menjurnal Hutang Usaha secara generik (tidak terkait invoice tertentu).
- Ada rencana lama (`apps/erp-acc/docs/superpowers/plans/2026-05-14-sales-purchase-returns-plan.md`) yang merancang pola serupa tapi **tidak pernah diterapkan** — nomor migrasi 028 sudah dipakai fitur lain, dan asumsinya (tabel `tax_codes` per baris) tidak sesuai sistem PPN yang live sekarang. Dijadikan referensi konsep saja, bukan diambil langsung.
- Precedent pola "dokumen lain mengurangi piutang invoice": `post_payment` (`supabase/migrations/033_payment_adjustments.sql`, redefined di `037`) meng-update `invoices.amount_paid`. `advance_deduction_amount`/`advance_deduction_coa_id` (`037_sales_invoice_advance_deduction.sql`) mengurangi piutang yang dibukukan saat posting tanpa mengubah `invoices.total`.
- PPN live dihitung server-side dari `products.is_taxable`/`products.tax_rate` (default 11%, lihat `035_purchase_invoice_tax_authority.sql`), bukan dari tabel `tax_codes`. Akun tetap: Piutang Usaha `1-13000`, PPN Keluaran `2-12000`, Pendapatan Penjualan `4-11000`, Persediaan `1-14000`, HPP `5-11000`, Hutang Usaha `2-11000`, Hutang Barang Diterima `2-11100`, PPN Masukan `1-15000`.
- `customers.ar_account_id` / `suppliers.ap_account_id` sudah ada (`002_master_data.sql`) untuk jurnal per-party, tapi seluruh posting invoice/retur yang live justru pakai akun tetap (`1-13000`/`2-11000`) — desain ini mengikuti pola live (akun tetap), bukan per-party account.

## Approach

Perluas modul Retur yang sudah live (bukan bikin dokumen baru). `invoice_id` bersifat **opsional** pada `sales_returns`/`purchase_returns`:
- Kalau kosong: retur berperilaku persis seperti sekarang (hanya urus stok, tidak menyentuh piutang/hutang) — backward compatible dengan retur lama (SRN-2026-00002, PRN-2026-00001, dll).
- Kalau diisi: retur wajib link ke baris item invoice (`invoice_item_id`), qty divalidasi ketat, dan posting-nya mengurangi piutang/hutang invoice tersebut.

## Data Model

Migrasi baru: `apps/erp-acc/erp-app/supabase/migrations/038_return_invoice_ar_ap.sql`.

### Perluas `sales_returns` / `purchase_returns` (via `ALTER TABLE`, tabel ini live di `apps/erp-acc/migrations/007_sales_purchase_returns.sql`)
```sql
alter table sales_returns
  add column invoice_id uuid references invoices(id),
  add column return_credit_amount numeric not null default 0,   -- porsi yang mengurangi sisa tagih invoice ini
  add column excess_credit_amount numeric not null default 0;   -- porsi lebih -> jadi saldo kredit mengambang

-- mirror untuk purchase_returns
```

### Perluas item tables
```sql
alter table sales_return_items
  add column invoice_item_id uuid references invoice_items(id);   -- wajib diisi kalau header punya invoice_id

alter table purchase_return_items
  add column invoice_item_id uuid references invoice_items(id),
  add column tax_amount numeric not null default 0;   -- kolom baru, purchase_return_items saat ini tidak punya tax_amount
```

### Helper function
```sql
create or replace function returnable_qty(p_invoice_item_id uuid, p_return_type text)
returns numeric
-- p_return_type: 'sales' | 'purchase'
-- = invoice_items.quantity_base - sum(quantity_base) dari *_return_items yang sales_return/purchase_return-nya status='posted'
--   untuk invoice_item_id yang sama
```

### Ledger saldo kredit (tabel baru, untuk audit trail — bukan kolom saldo mentah)
```sql
create table credit_notes (
  id uuid primary key default gen_random_uuid(),
  party_type text not null check (party_type in ('customer','supplier')),
  party_id uuid not null,               -- customer_id atau supplier_id (tanpa FK gabungan, divalidasi di RPC)
  source_type text not null check (source_type in ('sales_return','purchase_return')),
  source_id uuid not null,              -- sales_returns.id / purchase_returns.id
  amount numeric not null check (amount > 0),
  remaining numeric not null,
  status text not null default 'open' check (status in ('open','applied','cancelled')),
  created_at timestamptz not null default now()
);

create table credit_note_applications (
  id uuid primary key default gen_random_uuid(),
  credit_note_id uuid not null references credit_notes(id),
  invoice_id uuid not null references invoices(id),
  amount numeric not null check (amount > 0),
  applied_at timestamptz not null default now(),
  applied_by uuid references auth.users(id)
);
```

### Perluas `invoices`
```sql
alter table invoices
  add column credit_applied_amount numeric not null default 0;   -- pola sama seperti advance_deduction_amount
```

### COA baru (ditentukan saat implementasi)
Perlu akun kontra-pendapatan "Retur Penjualan" dan kontra-beban/penyesuaian "Retur Pembelian" untuk jurnal revenue-side (lihat bagian Jurnal di bawah). Task pertama implementasi: cek seed COA yang ada, tambahkan 2 akun baru mengikuti pola penomoran yang sudah dipakai (`4-1xxxx` untuk kontra-pendapatan, `5-1xxxx`/`2-1xxxx` untuk kontra-beban/hutang) jika belum ada.

## Business Rules & RPC

### `save_sales_return` / `save_purchase_return` (extend)
- Terima `invoice_id` opsional di header.
- Kalau `invoice_id` diisi: setiap item **wajib** `invoice_item_id`, dan `customer_id`/`supplier_id` pada retur harus sama dengan invoice tsb (validasi keras, `raise exception` jika beda).
- Tax amount per baris dihitung ulang server-side dari `products.is_taxable`/`tax_rate` (pola sama seperti `035_purchase_invoice_tax_authority.sql`), mengabaikan tax_amount kiriman client.
- Validasi `quantity_base <= returnable_qty(invoice_item_id, type)` di save time (soft check, UX cepat) — validasi keras tetap di post time.

### `post_sales_return` (extend)
Selain jurnal Persediaan/HPP yang sudah ada:
1. Jika `invoice_id` kosong → selesai (perilaku lama, tidak berubah).
2. Jika `invoice_id` ada:
   - Re-validate tiap item: `quantity_base <= returnable_qty(...)` dengan row lock (`for update`), tolak jika melebihi.
   - Validasi invoice berstatus `posted`/`partial`/`paid` (tidak boleh retur ke invoice `draft`).
   - Hitung `outstanding = invoice.total - invoice.amount_paid - invoice.advance_deduction_amount - invoice.credit_applied_amount - invoice.return_credit_amount`.
   - `return_credit_amount_this = LEAST(retur.total, GREATEST(outstanding, 0))`
   - `excess = retur.total - return_credit_amount_this`
   - Jurnal tambahan (di journal yang sama dengan reversal Persediaan/HPP yang sudah ada):
     - Debit "Retur Penjualan" (kontra pendapatan) = subtotal retur
     - Debit PPN Keluaran (`2-12000`) = tax_amount retur (jika > 0)
     - Credit Piutang Usaha (`1-13000`) = subtotal + tax_amount (= `retur.total`, mencakup baik `return_credit_amount_this` maupun `excess` — keduanya sama-sama pengurang saldo Piutang di GL)
   - `update sales_returns set return_credit_amount = return_credit_amount_this, excess_credit_amount = excess where id = ...`
   - `update invoices set return_credit_amount = return_credit_amount + return_credit_amount_this, status = case when amount_paid + advance_deduction_amount + credit_applied_amount + return_credit_amount + return_credit_amount_this >= total - 0.01 then 'paid' else 'partial' end where id = invoice_id`

     (catatan: `invoices.return_credit_amount` adalah kolom running total baru, mirror `amount_paid` — ditambahkan di migrasi yang sama)
   - Jika `excess > 0`: `insert into credit_notes (party_type, party_id, source_type, source_id, amount, remaining, status) values ('customer', v_customer_id, 'sales_return', p_sr_id, excess, excess, 'open')`

### `post_purchase_return` (extend)
Mirror simetris — Debit Hutang Usaha (`2-11000`), Credit "Retur Pembelian" (kontra beban/penyesuaian persediaan — mengikuti pola jurnal purchase return yang sudah ada: Persediaan keluar dicatat terpisah dari sisi hutang), Credit PPN Masukan (`1-15000`) jika ada. `party_type = 'supplier'`.

### `apply_credit_note_to_invoice` (RPC baru, dipanggil di dalam `post_sales_invoice`/`post_purchase_invoice`)
- Dipicu jika `invoices.credit_applied_amount > 0` saat posting invoice baru.
- Validasi `credit_applied_amount <= sum(remaining)` dari `credit_notes` yang `status='open'` milik party yang sama.
- Alokasi FIFO (berdasar `created_at`): kurangi `remaining` tiap `credit_notes` yang kena alokasi, insert `credit_note_applications`, set `status='applied'` kalau `remaining` jadi 0.
- Jurnal invoice baru: debit Piutang/Hutang dikurangi `credit_applied_amount` (pola identik dengan `advance_deduction_amount` di `post_sales_invoice`).

### `cancel_sales_return` / `cancel_purchase_return` (extend validasi)
- Tolak jika `excess_credit_amount > 0` DAN `credit_notes.remaining < credit_notes.amount` untuk `source_id` retur ini (artinya kreditnya sudah terpakai sebagian/seluruhnya di invoice lain) — user harus unwind pemakaian kredit itu dulu (batalkan/edit invoice yang memakainya) sebelum retur ini bisa dibatalkan.
- Jika lolos validasi: reverse jurnal seperti biasa, set `credit_notes.status='cancelled'`, `invoices.return_credit_amount -= return_credit_amount` pada invoice asal.

## UI Changes

- **Form Retur** (`SalesReturnFormPage.jsx`/`PurchaseReturnFormPage.jsx`): tambah field "Invoice Asal" (opsional, Select dengan search, difilter ke invoice customer/supplier terpilih berstatus `posted`/`partial`/`paid`). Saat dipilih, tabel item retur diganti jadi picker baris item invoice tsb dengan kolom "Sisa Bisa Diretur" (`returnable_qty`), qty input dibatasi ke nilai itu.
- **Form Invoice** (`SalesInvoiceFormPage.jsx`/`PurchaseInvoiceFormPage.jsx`): tambah section "Saldo Kredit Tersedia: Rp X" (query `sum(remaining)` dari `credit_notes` party terkait) + input "Terapkan dari Saldo Kredit" (0 ≤ x ≤ available) — ditempatkan berdampingan dengan section Potongan Uang Muka yang sudah ada, sama-sama muncul di "Sisa Tagih".
- **Halaman baru "Saldo Kredit"** (`CreditNotesPage.jsx`, satu untuk customer & supplier dengan filter tipe): list `credit_notes` dengan filter status/party, kolom Sumber (link ke retur asal), Jumlah, Sisa, Status, Riwayat Pemakaian (expand ke `credit_note_applications`).
- **AR/AP Aging report** (`ARAPAgingPage.jsx`): outstanding invoice dikurangi juga dengan `return_credit_amount` + `credit_applied_amount` (pola sama seperti `advance_deduction_amount` sudah dikurangi di sana).
- **Form pembayaran** (`PaymentFormPage.jsx` / `getOutstandingInvoicesByCustomer`): outstanding juga dikurangi `return_credit_amount`.
- **PDF invoice** (`invoiceRenderer.js`): tambah baris "Potongan Retur" jika `return_credit_amount > 0` dan "Kredit Diterapkan" jika `credit_applied_amount > 0`.
- **Tombol "Buat Retur" di detail invoice** (`SalesInvoicesPage.jsx`/`PurchaseInvoicesPage.jsx`): navigate ke form retur dengan `invoice_id` ter-prefill (pola sama seperti tombol serupa dari GD/GR yang sudah ada).

## Error Handling

- Retur dengan `invoice_id` tapi item tanpa `invoice_item_id` → ditolak di `save_*_return`.
- `customer_id`/`supplier_id` retur ≠ punya invoice → ditolak.
- Invoice berstatus `draft`/`cancelled` → ditolak sebagai invoice asal retur.
- Qty retur (akumulasi across semua retur posted) melebihi qty invoice → ditolak di post time dengan row lock (`for update`) untuk mencegah race condition dua retur simultan.
- `credit_applied_amount` pada invoice baru melebihi total saldo kredit `open` party tsb → ditolak di posting.
- Cancel retur yang kreditnya sudah terpakai → ditolak, pesan jelas menyebutkan invoice mana yang memakainya.
- Semua RPC tetap pakai `_ensure_period_open` dan `is_admin_or_staff()` guard yang sudah jadi pola standar di codebase ini.

## Testing Plan

SQL smoke test manual (mengikuti pola fitur-fitur sebelumnya, dijalankan sebelum apply ke ERP-MG):
1. SI posted → SR partial (qty < returnable_qty) linked ke SI itu → post → cek `invoices.return_credit_amount`, status jadi `partial`, jurnal balanced (termasuk PPN Keluaran).
2. SR kedua pada baris sama dengan qty tersisa persis → post → cek `returnable_qty` jadi 0, status invoice jadi `paid` jika total match.
3. SR ketiga coba retur qty > 0 pada baris yang `returnable_qty`-nya sudah 0 → harus ditolak.
4. SI sudah `paid` penuh → SR baru linked ke situ → post → cek `credit_notes` baru dengan `remaining = retur.total` (seluruhnya jadi excess karena outstanding = 0).
5. SI baru untuk customer yang sama → isi `credit_applied_amount` = sebagian saldo kredit → post → cek `credit_notes.remaining` berkurang, `credit_note_applications` tercatat, jurnal invoice baru berkurang sesuai.
6. Cancel SR dari langkah 4 setelah kreditnya terpakai di langkah 5 → harus ditolak.
7. Purchase side: ulangi langkah 1-3 untuk PR/PI dengan PPN Masukan.
8. Playwright E2E: extend `tests/playwright/sales-return.spec.js`/buat baru jika belum ada, mengikuti pola `sales-return.spec.js` dari rencana lama — cover alur pilih invoice → pilih baris → post → cek Sisa Tagih di UI.

## Out of Scope / Deferred

- Refund tunai aktual (transfer uang kembali ke customer) — saldo kredit hanya tercatat, pencairannya di luar sistem ini.
- Alokasi otomatis saldo kredit ke invoice berikutnya — tetap manual per keputusan brainstorming.
- Multi-currency.
- Approval workflow untuk retur bernilai besar (belum ada approval flow di codebase ini sama sekali, sesuai `CLAUDE.md`).
