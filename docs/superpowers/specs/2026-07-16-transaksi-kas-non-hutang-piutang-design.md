# Desain Transaksi Kas/Bank Non-Hutang-Piutang (ERP-ACC)

**Tanggal:** 2026-07-16
**Status:** Spesifikasi tertulis menunggu review pengguna; implementasi belum dimulai
**Repository:** `C:\Project\apps\erp-acc\erp-app`
**Ruang lingkup:** modul Kas & Bank, modul Jurnal Umum, Chart of Accounts, RPC posting Supabase

## 1. Ringkasan

Saat ini erp-acc hanya punya dua jalur pencatatan uang: modul Pembayaran (`payments` — pelunasan piutang dari customer atau hutang ke supplier, mewajibkan `customer_id`/`supplier_id`) dan modul Jurnal Umum (`ManualJournalFormPage.jsx` — multi-baris bebas, tapi hanya bisa diakses dan di-posting oleh role `admin`). Tidak ada jalur untuk transaksi kas/bank yang bukan pelunasan piutang/hutang — misalnya biaya admin bank, biaya dibayar dimuka, atau biaya pajak — sehingga user dan tim accounting (role `staff`) tidak bisa mencatatnya sama sekali hari ini.

Desain ini menambahkan jalur ketiga: **Transaksi Kas/Bank Lainnya**, halaman baru di bawah menu Kas & Bank yang bisa diakses staff maupun admin, mendukung baris jurnal multi-baris dengan pilihan Chart of Account (COA) bebas untuk lawan transaksinya (tidak dibatasi ke akun beban saja), dengan satu syarat: minimal satu baris harus terhubung ke akun kas/bank. Transaksi langsung ter-posting (tanpa alur approval terpisah) begitu staff submit, sesuai keputusan user.

Fitur ini dibangun dengan mengekstrak komponen tabel baris debit/kredit dari Jurnal Umum yang sudah ada menjadi komponen bersama, dan menggeneralisasi RPC `post_expense` (kode mati, satu baris saja) yang sudah ada di database menjadi RPC multi-baris baru `post_general_cash_transaction`. Jurnal Umum lama tidak berubah perilaku dan tetap admin-only untuk entri non-kas (reklasifikasi, koreksi, dll).

## 2. Tujuan

- User dan tim accounting (role `staff`) bisa mencatat transaksi kas/bank yang tidak terkait piutang/hutang: biaya admin bank, biaya dibayar dimuka (pencatatan awal), biaya pajak, dan transaksi kas/bank non-AP/AR lain di masa depan (mis. pendapatan bunga bank).
- Lawan transaksi (baris non-kas) bisa memilih akun COA apa saja (aset, liabilitas, ekuitas, pendapatan, atau beban) — tidak dibatasi ke daftar akun tertentu.
- Transaksi langsung ter-posting ke buku besar begitu staff submit (tanpa approval terpisah) — konsisten dengan keputusan user.
- Tidak menambah beban maintenance ganda: logika tabel baris + validasi saldo dipakai bersama oleh Jurnal Umum lama dan fitur baru ini.
- Tidak mengubah izin atau perilaku Jurnal Umum lama untuk entri non-kas — tetap admin-only.

## 3. Bukan Tujuan

- Tidak membangun mesin amortisasi otomatis untuk biaya dibayar dimuka (pengakuan bertahap tiap periode). Ini didesain terpisah setelah fitur pencatatan dasar ini berjalan — lihat Bagian 9.
- Tidak mengubah modul Pembayaran (`payments`/`post_payment`) atau alur AP/AR sama sekali.
- Tidak membuat alur approval/persetujuan bertingkat untuk transaksi ini — staff posting langsung.
- Tidak mengubah `journals.source` enum atau struktur tabel `journals`/`journal_items` yang sudah ada — hanya menambah cara baru mengisinya.

## 4. Konteks Arsitektur Saat Ini

| Komponen | Lokasi | Catatan |
|---|---|---|
| Modul Pembayaran (AR/AP) | `src/pages/cash/PaymentFormPage.jsx`, RPC `save_and_post_payment` | Mewajibkan `customer_id` atau `supplier_id`; tidak ada jalur non-AP/AR. |
| Modul Jurnal Umum | `src/pages/accounting/ManualJournalFormPage.jsx` (452 baris) | Multi-baris, COA bebas per baris, opsional `account_id` per baris untuk sinkron saldo kas/bank (migration `032_journal_items_account_id.sql`). Akses dibatasi `canPost` (=`isAdmin` saja) di level route DAN di level RLS `journal_items` insert (`015_fix_rls_security.sql`). |
| RPC `post_expense` | `supabase/migrations/011_posting_functions.sql:512-542` | `D Beban / C Kas-Bank`, satu baris beban saja. Tidak dipakai frontend manapun — kode mati. |
| Tabel `journals` | `007_cashbank_accounting.sql:34-46` | `source` in `('auto','manual')`, `reference_type`, `reference_id`, `is_posted`. |
| Tabel `journal_items` | `007_cashbank_accounting.sql:48-60`, `+account_id` di `032_journal_items_account_id.sql` | CHECK: tepat satu dari debit/kredit > 0 per baris. `account_id` opsional, menyinkronkan `accounts.balance`. |
| Role & permission | `src/contexts/AuthContext.jsx:61-64` | `isAdmin`, `isStaff`, `canWrite = isAdmin \|\| isStaff`, `canPost = isAdmin`. |
| Guard RPC posting | `_ensure_can_post()`, `_ensure_period_open(date)` | Dipanggil di awal semua RPC posting finansial (`post_transfer`, `post_manual_journal`, dll). |
| COA | `coa` table, seed di `supabase/seed.sql:16-122` | Cabang `5-00000 BEBAN` (termasuk `5-18000 Beban Administrasi`, `5-19000 Selisih Harga`, `5-99000 Beban Lainnya`), `1-15000 PPN Masukan`, `1-16000 Uang Muka`, `2-12000 PPN Keluaran`, `2-13000 Hutang Pajak`. Belum ada akun khusus "Biaya Admin Bank", "Biaya Dibayar Dimuka" (beda dari Uang Muka umum), atau "Beban Pajak". |

## 5. Arsitektur Solusi

### 5.1 Komponen bersama — ekstraksi `JournalLinesEditor`

Ekstrak logika tabel baris (tambah/hapus baris, pilih COA, pilih `account_id` opsional, input debit/kredit, validasi saldo real-time) dari `ManualJournalFormPage.jsx` menjadi `src/components/journal/JournalLinesEditor.jsx`. Komponen menerima props: `lines`, `onChange`, `coaOptions` (tidak difilter tipe — semua tipe COA tetap tersedia), `accountOptions` (daftar kas/bank), `minLines`. `ManualJournalFormPage.jsx` diganti untuk memakai komponen ini (perilaku harus identik — ini murni pemindahan struktural, bukan perubahan logika).

### 5.2 Halaman baru — `GeneralCashTransactionFormPage`

`src/pages/cash/GeneralCashTransactionFormPage.jsx`: header (tanggal, keterangan) + `JournalLinesEditor` (minimal 2 baris) + indikator saldo debit=kredit + tombol submit (disabled saat pending, mencegah double-submit). Validasi client-side sebelum submit: saldo balance, dan **minimal satu baris punya `account_id` terisi** (harus akun kas/bank) — pesan error: "Minimal satu baris harus terhubung ke akun kas/bank."

**Koreksi setelah baca kode aktual**: tidak perlu list page baru. `JournalsPage.jsx` (`accounting/journals`) tidak digerbang `RoleGuard` sama sekali — semua role sudah bisa mengaksesnya, dan menu "Jurnal" di sidebar (`Sidebar.jsx`) juga tanpa `minRole`, jadi staff sudah melihatnya. Baris dengan `source === 'manual'` sudah otomatis bisa diklik untuk membuka `ManualJournalFormPage` (read-only karena `is_posted = true`). Karena RPC baru tetap menulis `source = 'manual'`, transaksi baru ini otomatis muncul dan bisa dibuka di list yang sudah ada tanpa kode tambahan. Satu polesan kecil opsional: ubah label `Tag` di `JournalsPage.jsx` supaya baris dengan `reference_type = 'general_cash_transaction'` menampilkan "Kas Lainnya" alih-alih "Manual" generik.

### 5.3 Routing & akses

Route baru `cash/general-transactions/new` (form) di `src/App.jsx`, digerbang `RoleGuard require="canWrite"` (staff+admin) — berbeda dari Jurnal Umum lama yang tetap `canPost` (admin-only). Tidak perlu route list baru (lihat koreksi di Bagian 5.2 — reuse `accounting/journals`). Menu item baru ditambahkan ke grup "Kas & Bank" di `Sidebar.jsx` dengan `minRole: 'write'`, label kerja: "Transaksi Lainnya" (nama final dikonfirmasi saat implementasi).

### 5.4 Service layer

`src/services/cashBankService.js` — tambah fungsi `saveGeneralCashTransaction({ date, description, lines })` yang memanggil RPC baru, mengikuti pola `savePayment()` yang sudah ada.

### 5.5 RPC baru — `post_general_cash_transaction`

```sql
post_general_cash_transaction(
  p_date date,
  p_description text,
  p_lines jsonb,  -- array of {coa_id, account_id (nullable), debit, credit, description}
  p_user_id uuid
) returns uuid
```

Langkah validasi & eksekusi (mengikuti pola RPC posting yang sudah ada):

1. `_ensure_can_post()` — **koreksi setelah baca kode aktual**: fungsi ini (`015_fix_rls_security.sql:73-82`) sudah memeriksa `is_admin_or_staff()`, BUKAN admin-only seperti dugaan awal. RPC baru cukup reuse guard ini langsung, tidak perlu guard baru. (Pembatasan admin-only yang ada sekarang murni di frontend: `AuthContext.canPost = isAdmin` dan RLS `journal_items` insert langsung — keduanya tidak menghalangi RPC security-definer baru ini.)
2. `_ensure_period_open(p_date)` — reuse fungsi yang sudah ada.
3. Validasi `p_lines`: minimal 2 baris; `sum(debit) = sum(credit)` dan `> 0`; setiap baris tepat satu dari debit/kredit > 0; **minimal satu baris punya `account_id` tidak null** dan `account_id` tersebut menunjuk baris di tabel `accounts` (kas/bank) — jika tidak, raise exception (defense in depth, client sudah validasi juga).
4. Insert `journals` header: `source = 'manual'`, `reference_type = 'general_cash_transaction'`, `is_posted = true`, `created_by = p_user_id`.
5. Insert `journal_items` per baris.
6. Update `accounts.balance` untuk setiap baris yang punya `account_id` (debit menambah/kurangi sesuai arah normal_balance akun tsb — pola sama seperti RPC posting lain).
7. Return `journal_id`.

RPC ini didesain mendukung dua arah transaksi (kas keluar seperti biaya bank, ATAU kas masuk seperti bunga bank) karena baris debit/kredit sepenuhnya bebas dipilih user — tidak menambah biaya desain, sudah otomatis tercakup oleh aturan "minimal satu baris = akun kas/bank".

### 5.6 Chart of Accounts — akun baru yang diperlukan

Keputusan user: biaya admin bank **reuse akun `5-18000 Beban Administrasi` yang sudah ada** — tidak perlu akun baru untuk kasus ini.

Migration baru hanya perlu menambah dua akun (nama diusulkan, kode final mengikuti urutan yang sudah ada di `seed.sql` saat implementasi):

- **Biaya Dibayar Dimuka** (tipe `asset`) — terpisah dari `1-16000 Uang Muka` (yang dipakai untuk uang muka pelanggan/supplier, konteks berbeda). Menyimpan saldo aset sampai nanti diamortisasi (lihat Bagian 9).
- **Beban Pajak** (tipe `expense`) — untuk biaya pajak yang bukan PPN Masukan/Keluaran atau Hutang Pajak yang sudah ada.

## 6. Data Flow

```
Staff/Admin buka "Transaksi Kas/Bank Lainnya" (menu Kas & Bank)
  → isi tanggal, keterangan, minimal 2 baris (COA + debit/kredit, opsional account_id)
  → client validasi: saldo balance? minimal 1 baris ada account_id kas/bank?
  → saveGeneralCashTransaction() → RPC post_general_cash_transaction
  → RPC validasi ulang (defense in depth) → guard role & periode
  → insert journals header + journal_items → update accounts.balance → is_posted=true
  → return journal_id → redirect ke detail/list, entri langsung terlihat di laporan
    (Neraca, Laba Rugi, Trial Balance) karena semua laporan baca dari journal_items
```

## 7. Error Handling

| Kasus | Penanganan |
|---|---|
| Baris tidak balance (debit ≠ kredit) | Block submit di client; RPC juga raise exception jika lolos ke server (defense in depth). |
| Tidak ada baris dengan `account_id` kas/bank | Block submit di client dengan pesan jelas; RPC raise exception jika lolos. |
| Periode sudah tutup buku | RPC `_ensure_period_open` raise exception → tampil sebagai toast error, tidak ada partial write. |
| Role tidak `canWrite` | Route guard blokir akses halaman; RLS + RPC guard blokir di level backend sebagai lapis kedua. |
| Double-submit | Tombol submit disabled selama request pending. |

## 8. Testing

- Playwright spec baru `playwright/general-cash-transaction.spec.js` (pola mengikuti `bank-journal-payment-adjustments.spec.js`):
  - Staff berhasil membuat transaksi 2 baris (biaya bank) dan 3 baris (split beberapa akun).
  - Submit diblokir saat saldo tidak balance.
  - Submit diblokir saat tidak ada baris kas/bank.
  - Saldo `accounts.balance` ter-update benar setelah posting.
  - Jurnal Umum lama (`ManualJournalFormPage`) tetap berperilaku identik untuk admin — regression check pasca-ekstraksi `JournalLinesEditor`.
- `npm run build` wajib lulus tanpa error di `apps/erp-acc/erp-app`.
- Manual test: staff bisa melihat riwayat transaksinya via menu "Pembukuan > Jurnal" yang sudah ada (list tidak digerbang role) dan membuka detailnya (read-only, karena langsung ter-posting).

## 9. Pekerjaan Lanjutan (Di Luar Scope Sesi Ini)

Amortisasi otomatis biaya dibayar dimuka (pengakuan bertahap `D Beban / C Biaya Dibayar Dimuka` tiap periode, mirip modul depresiasi aset `post_depreciation_batch`) akan didesain sebagai spec terpisah setelah fitur ini berjalan, dibangun di atas data akun "Biaya Dibayar Dimuka" yang dihasilkan fitur ini.

## 10. Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| Ekstraksi `JournalLinesEditor` mengubah perilaku Jurnal Umum lama tanpa sengaja | Testing regresi eksplisit (Bagian 8) sebelum dan sesudah ekstraksi; ekstraksi harus murni struktural. |
| RPC baru disalahgunakan sebagai jalur jurnal manual bebas (bypass admin-only Jurnal Umum) | Constraint "minimal satu baris = akun kas/bank" ditegakkan di RPC (server-side), bukan hanya di client. |
| Staff posting langsung tanpa review — potensi salah entri masuk buku besar tanpa jenjang approval | Keputusan eksplisit dari user (bukan default tim); mitigasi non-teknis: laporan riwayat transaksi (Bagian 5.2) memudahkan admin memantau entri staff setelah fakta. |
| Akun "Biaya Dibayar Dimuka" baru tumpang tindih secara semantik dengan `1-16000 Uang Muka` yang sudah ada | Deskripsi akun di seed/migration harus eksplisit membedakan konteks (Uang Muka = ke/dari pelanggan-supplier; Biaya Dibayar Dimuka = pembayaran biaya operasional di muka). |
