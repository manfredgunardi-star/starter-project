# Multi-Invoice Payment (AR) — Design Spec

- **Tanggal:** 2026-08-20
- **Aplikasi:** `apps/bul-accounting` (bul-accounting.web.app)
- **Branch:** `claude/multi-payment-invoices-3fbac3`
- **Status:** disetujui user, siap masuk tahap rencana implementasi

## 1. Masalah

Satu transfer masuk dari pelanggan sering melunasi beberapa invoice sekaligus. Hari
ini akuntan harus membuka modal Catat Pembayaran satu per satu, sehingga satu mutasi
bank pecah menjadi beberapa jurnal terpisah dan tidak bisa dicocokkan dengan rekening
koran.

## 2. Scope

**Termasuk:** penerimaan pembayaran dari pelanggan (Piutang / AR) atas lebih dari satu
invoice dalam satu transaksi.

**Tidak termasuk:**

- Pembayaran ke supplier (Hutang / AP). Sisi ini masih basis kas dan tidak mengenal
  akun Hutang Usaha sama sekali; multi-payment parsial tidak bisa didesain benar di
  atasnya. Keputusan akrual AP diambil sebagai pekerjaan terpisah.
- Bug `journalId: journal.id` di `BiayaPage.jsx:168` (sisi AP, ditangani task terpisah).
- Refactor `getInvoices()` global yang menarik seluruh koleksi.
- Perubahan `firestore.rules`. Fitur tetap **superadmin-only**, sama seperti modal
  pembayaran tunggal yang sudah ada.
- Uang muka / titipan pelanggan (kelebihan bayar yang belum dialokasikan).

**Asumsi:** satu pembayaran menyangkut satu pelanggan.

## 3. Keadaan saat ini

### Alur AR

Invoice masuk lewat dua jalur:

1. Manual di `InvoiceForm` (`src/pages/PenjualanPage.jsx:30`).
2. Otomatis dari bul-monitor lewat koleksi `integration_queue`, disetujui akuntan di
   `IntegrationReviewPage`, diproses `approveIntegrationItem`
   (`src/utils/integrationUtils.js:95`) yang memposting jurnal lalu memanggil
   `saveInvoice()`.

Pembayaran lewat `PembayaranModal` (`src/pages/PenjualanPage.jsx:144`):

1. `saveJournal()` memposting Dr kas/bank + Dr `1172` PPh 23 Dibayar Muka, Cr `1121`
   Piutang.
2. `addInvoicePayment()` (`src/utils/accounting.js:540`) mem-push entri ke array
   `invoices.payments[]`, lalu menghitung ulang `totalPaid` dan `status`.

Cicilan parsial sudah didukung, tetapi hanya untuk satu invoice per transaksi.

### Temuan yang membentuk desain ini

| Kode | Temuan | Lokasi |
|---|---|---|
| P0-3 | `saveJournal()` lalu `addInvoicePayment()` adalah dua write tidak atomik. Crash di antaranya menyisakan jurnal yatim atau status invoice salah. Multi-payment mengubah ini menjadi 1+N write. | `PenjualanPage.jsx:184-202` |
| P1-4 | `addInvoicePayment()` adalah read-modify-write pada array tanpa transaction. Dua user bersamaan menyebabkan lost update. | `accounting.js:540` |
| P1-5 | `getInvoices()` menarik seluruh koleksi lalu memfilter di klien. Multi-payment justru membutuhkan query "semua invoice open milik pelanggan X". | `accounting.js:516` |
| P1-6 | Daftar akun kas/bank di-hardcode di tiga tempat berbeda. | `PenjualanPage.jsx:17,155`; `BiayaPage.jsx:143`; `AsetPage.jsx:45` |
| P1-7 | `firestore.rules` mensyaratkan superadmin untuk `update` pada `invoices`. Mencatat pembayaran adalah `updateDoc`, jadi role admin tidak bisa mencatat pembayaran. Perilaku ini dipertahankan apa adanya. | `firestore.rules` |

Daftar invoice di halaman Penjualan difilter tanggal dengan default bulan berjalan
(`PenjualanPage.jsx:284`), padahal invoice yang belum lunas sering lebih tua dari
rentang itu. Karena itu pemilih invoice pada fitur baru harus melakukan query sendiri
dan mengabaikan filter tanggal halaman.

## 4. Keputusan yang diambil

| Keputusan | Pilihan | Alasan |
|---|---|---|
| Scope | AR saja | Sisi AP butuh keputusan akrual lebih dulu. |
| Cara alokasi | Pilih invoice dulu, sistem menjumlahkan | Total selalu pas, tidak ada konsep sisa, memakai ulang `addInvoicePayment` apa adanya. |
| PPh 23 | Per baris invoice | Cocok dengan bukti potong yang diterbitkan per invoice; struktur `payments[]` tidak berubah. |
| Bentuk jurnal | Satu jurnal gabungan | Satu jurnal = satu mutasi bank riil, sehingga rekonsiliasi bank cocok satu-lawan-satu. |
| Tempat fitur | Tombol + modal pilih pelanggan | Satu-satunya opsi yang tidak menyembunyikan tunggakan lama di balik filter tanggal. |

## 5. Arsitektur

Tiga file baru, tiga file sumber disentuh minimal, satu file konfigurasi ditambah index.

| File | Peran |
|---|---|
| `src/utils/payments.js` (baru) | Logika alokasi murni. Tanpa Firestore, tanpa React. Diuji penuh dengan Vitest. |
| `src/components/MultiPaymentModal.jsx` (baru) | UI saja. Tidak memuat aturan akuntansi. |
| `src/data/kasAccounts.js` (baru) | Sumber tunggal daftar akun kas/bank. Menghapus duplikasi P1-6 tanpa mengubah perilaku. |
| `src/utils/accounting.js` | Tambah `getOpenInvoicesByCustomer()` dan `recordMultiInvoicePayment()`. Fungsi lama tidak diubah. |
| `src/pages/PenjualanPage.jsx` | Tambah satu tombol dan satu state modal. Tabel invoice tidak disentuh. |
| `src/pages/JurnalPage.jsx` | Pembalikan jurnal multi-invoice (lihat bagian 10). |
| `firestore.indexes.json` | Tambah satu composite index (lihat bagian 9). Tidak ada perubahan pada `firestore.rules`. |

Aturan pemisahan: `payments.js` tahu cara menghitung tetapi tidak tahu Firestore ada;
`accounting.js` tahu Firestore tetapi tidak menghitung; modal tidak tahu keduanya.

### Antarmuka `src/utils/payments.js`

Semua fungsi murni, tanpa efek samping.

```js
// Satu baris alokasi yang dipilih user.
// { invoiceId, invoiceNo, customerName, truckId, amount, totalPaid,
//   jumlahBayar, pph }

validateAllocations(rows) -> { valid: boolean, errors: { [invoiceId]: string } }
summarizeAllocations(rows) -> { totalGross, totalPph, totalNet, count }
buildPaymentJournalLines({ rows, account, keterangan })
  -> [{ accountCode, debit, credit, keterangan, truckId }]
computeInvoiceStatus(amount, totalPaid) -> 'unpaid' | 'partial' | 'paid'
```

`computeInvoiceStatus()` mengangkat aturan pembulatan yang saat ini diduplikasi di
`accounting.js:548` dan `accounting.js:563` menjadi satu fungsi. Kedua fungsi lama
memanggilnya, sehingga perilakunya identik dan tidak ada perubahan hasil.

### Antarmuka `src/data/kasAccounts.js`

```js
export const KAS_ACCOUNTS = [
  { code: '1111', name: 'Kas Kecil',                 type: 'kas'  },
  { code: '1112', name: 'Bank BCA Operasional',      type: 'bank' },
  { code: '1113', name: 'Bank Mandiri Operasional',  type: 'bank' },
]
export const getKasAccountName = (code) => ...
export const getJournalType = (code) => ...   // 'kas' | 'bank'
```

Isi daftar disalin persis dari `PenjualanPage.jsx:155`. `getJournalType()`
menggantikan ekspresi `account.startsWith('1111') ? 'kas' : 'bank'` di
`PenjualanPage.jsx:187` dan `account === '1111' ? 'kas' : 'bank'` di
`BiayaPage.jsx:157`, yang hasilnya sama untuk ketiga kode yang ada.

## 6. Model data

Perubahan bersifat aditif. Tidak ada field yang dihapus atau diubah artinya.

### Dokumen `journals`

```js
{
  date, description,
  type: 'kas' | 'bank',
  truckId: null,                       // ambigu untuk multi-invoice, lihat bagian 7
  lines: [ ... ],
  invoiceIds: ['inv1', 'inv2', 'inv3'], // BARU, plural
  paymentGroupId: '<uuid>',             // BARU, pengikat lintas dokumen
  createdBy, createdAt,
  status: 'posted',
}
```

`invoiceId` (tunggal) tetap ada pada jurnal lama dan tidak diisi oleh jalur baru.
Semua pembaca menormalkan dengan:

```js
const ids = journal.invoiceIds ?? (journal.invoiceId ? [journal.invoiceId] : [])
```

### Entri `invoices[].payments[]`

Bentuknya **tidak berubah**, hanya ditambah satu field opsional:

```js
{
  journalId, paymentGroupId,   // paymentGroupId BARU, opsional
  date, jumlahBayar, pph, netDiterima,
  account, keterangan, createdAt,
}
```

Karena bentuknya tetap, expander Riwayat Pembayaran di `PenjualanPage.jsx:477`
merender entri baru apa adanya tanpa perubahan kode.

## 7. Bentuk jurnal

Contoh: 5 invoice, total tagihan Rp 50.000.000, total PPh Rp 1.000.000, masuk BCA.

```
Dr  1112 Bank BCA Operasional          49.000.000
Dr  1172 PPh 23 Dibayar Muka            1.000.000
    Cr 1121 Piutang — INV-001                       10.000.000  [truckId: T1]
    Cr 1121 Piutang — INV-002                       12.000.000  [truckId: T2]
    Cr 1121 Piutang — INV-003                        9.000.000  [truckId: null]
    Cr 1121 Piutang — INV-004                       11.000.000  [truckId: T1]
    Cr 1121 Piutang — INV-005                        8.000.000  [truckId: T3]
```

Aturan:

- Baris kas/bank digabung menjadi **satu** baris debit sebesar total net. Inilah yang
  membuat jurnal cocok satu-lawan-satu dengan mutasi rekening.
- Kredit `1121` dipecah **per invoice**, keterangan memuat nomor invoice, sehingga buku
  besar Piutang tetap menampilkan detail per invoice.
- `truckId` diletakkan **per baris** diambil dari `invoice.truckId`, bukan di header.
  Cost center tetap akurat walau invoice berasal dari truk berbeda. Header `truckId`
  di-set `null` karena ambigu — pola yang sama dipakai jurnal tipe `umum` di
  `IntegrationReviewPage`.
- Baris `1172` hanya muncul bila total PPh > 0, konsisten dengan percabangan yang ada
  di `PenjualanPage.jsx:173`.
- `type` jurnal ditentukan `getJournalType(account)`.

Invarian: `totalDebit === totalCredit`. Ini divalidasi dua kali — di
`buildPaymentJournalLines()` lewat unit test, dan lagi oleh `saveJournal()` yang sudah
menolak jurnal tidak balance (`accounting.js:54`).

## 8. Atomicity

`recordMultiInvoicePayment()` dijalankan sebagai **satu `runTransaction`** Firestore:

1. READ seluruh N dokumen invoice.
2. Validasi ulang **di dalam** transaksi:
   - invoice ada dan `status` masih `unpaid` atau `partial`;
   - `jumlahBayar <= amount - totalPaid` (toleransi 0,5 seperti kode yang ada);
   - `0 <= pph <= jumlahBayar`.
3. WRITE dokumen jurnal baru. Referensinya dibuat lebih dulu dengan
   `doc(collection(db, 'journals'))` agar `journalId` sudah diketahui sebelum commit
   dan bisa ditulis ke setiap entri `payments[]`.
4. WRITE update tiap invoice: append ke `payments[]`, hitung ulang `totalPaid`,
   `status` lewat `computeInvoiceStatus()`, dan `paidDate` bila menjadi `paid`.

Bila ada invoice yang statusnya berubah sejak modal dibuka, seluruh transaksi gagal
dengan pesan yang menyebut invoice mana — **tidak ada partial write**. Ini menutup
P0-3 dan P1-4 untuk jalur baru.

Audit log ditulis setelah transaksi commit, mengikuti pola `writeAuditLog()` yang ada
(kegagalan audit tidak boleh membatalkan operasi utama, `accounting.js:25`).

Batas Firestore adalah 500 write per transaksi. UI membatasi 50 invoice per
pembayaran — jauh di bawah limit dan di atas ambang yang masuk akal secara
operasional.

## 9. Query pemilih invoice

```js
export async function getOpenInvoicesByCustomer(customerId) {
  const q = query(
    collection(db, 'invoices'),
    where('customerId', '==', customerId),
    where('status', 'in', ['unpaid', 'partial']),
  )
  // urutkan menaik berdasarkan date di klien (hasilnya kecil, satu pelanggan)
}
```

Perlu composite index baru pada `firestore.indexes.json`: `invoices` atas
(`customerId` ASC, `status` ASC).

Query ini mengabaikan filter tanggal halaman Penjualan, sesuai keputusan di bagian 4.

**Risiko data:** invoice tanpa `customerId` tidak akan muncul. Jalur manual
(`PenjualanPage.jsx:47`) mewajibkan pelanggan dipilih, dan jalur bridge
(`integrationUtils.js:110`) selalu memanggil `findOrCreateCustomer`. Sebelum
implementasi, jalankan satu query pengecekan atas koleksi `invoices` untuk menghitung
dokumen berstatus `unpaid`/`partial` dengan `customerId` kosong. Bila jumlahnya bukan
nol, laporkan ke user dan minta keputusan sebelum melanjutkan.

## 10. Pembalikan jurnal

`JurnalPage.jsx:299` saat ini memanggil `removeInvoicePayment(journal.invoiceId, deleteId)`
— hanya meng-unapply satu invoice. Tanpa perubahan, menghapus jurnal multi-payment
akan meninggalkan empat invoice bertanda lunas padahal jurnalnya sudah dihapus.

Diubah menjadi:

```js
const ids = journal.invoiceIds ?? (journal.invoiceId ? [journal.invoiceId] : [])
for (const id of ids) await removeInvoicePayment(id, deleteId)
```

Dialog konfirmasi hapus menampilkan jumlah invoice terdampak, misalnya: *"Jurnal ini
melunasi 5 invoice. Semuanya akan dikembalikan ke status sebelumnya."*

Penghapusan jurnal tetap **soft delete** (`deleteJournal()` menyetel `status: 'deleted'`,
`accounting.js:87`). Tidak ada hard delete.

## 11. UI modal

Alur: klik **Terima Pembayaran** di header Penjualan → pilih pelanggan → sistem
menarik seluruh invoice open pelanggan tersebut → centang baris dan isi nominal.

Kolom tabel: centang · Tanggal · No. Invoice · Total Tagihan · Sudah Dibayar ·
**Sisa** · **Jumlah Bayar** (input) · **PPh** (input).

Perilaku:

- Mencentang baris mengisi `jumlahBayar` dengan nilai sisa tagihan (default lunas
  penuh), `pph` diisi 0. Keduanya bisa diubah.
- Field tingkat pembayaran: Tanggal Bayar, Diterima di Akun (dari `KAS_ACCOUNTS`),
  Keterangan Jurnal.
- Ringkasan di bawah tabel menampilkan tiga angka: **Total Tagihan**, **Total PPh**,
  dan **Net Masuk ke Bank**. Angka terakhir adalah yang harus dicocokkan dengan mutasi
  rekening.
- Tombol simpan nonaktif sampai seluruh validasi lolos dan minimal satu baris
  tercentang.
- Bila pelanggan tidak punya invoice open, tampilkan pesan kosong yang jelas.

Validasi (dari `validateAllocations()`):

| Aturan | Pesan |
|---|---|
| Minimal satu baris tercentang | "Pilih minimal satu invoice" |
| `jumlahBayar > 0` | "Jumlah bayar harus lebih dari 0" |
| `jumlahBayar <= sisa + 0,5` | "Jumlah bayar melebihi sisa tagihan (Rp ...)" |
| `0 <= pph <= jumlahBayar` | "PPh tidak valid" |

Tombol muncul hanya untuk superadmin, mengikuti pola `isSuperadmin()` yang sudah
dipakai di `PenjualanPage.jsx:448`.

## 12. Pengujian

Unit test Vitest atas `src/utils/payments.js` (fungsi murni, tanpa mock Firestore):

1. `buildPaymentJournalLines()` selalu menghasilkan `totalDebit === totalCredit` untuk
   berbagai kombinasi jumlah invoice dan nilai PPh.
2. PPh nol pada semua baris → tidak ada baris `1172` di jurnal.
3. PPh sebagian (hanya sebagian baris punya PPh) → satu baris `1172` berisi total.
4. PPh sama dengan jumlah bayar pada satu baris → tetap valid, baris bank berkurang
   sesuai.
5. `validateAllocations()` menolak overpayment per baris, `jumlahBayar` nol/negatif,
   dan PPh di luar rentang.
6. `computeInvoiceStatus()`: transisi `unpaid → partial → paid`, termasuk kasus batas
   pembulatan yang saat ini ditangani `Math.round` di `accounting.js:548`.
7. Kasus satu invoice menghasilkan baris jurnal yang identik dengan yang dihasilkan
   `PembayaranModal` lama — jaminan tidak ada regresi perilaku.
8. `truckId` per baris diteruskan dari invoice, dan header jurnal `truckId` bernilai
   `null`.

Regresi: `src/utils/__tests__/accounting.test.js` yang ada harus tetap lulus setelah
`addInvoicePayment` dan `removeInvoicePayment` dialihkan ke `computeInvoiceStatus()`.

Perintah validasi:

```
cd apps/bul-accounting
npm test
npm run build
```

Manual smoke test (setelah deploy staging, bila diotorisasi terpisah):

1. Pelanggan dengan 3 invoice unpaid → bayar penuh ketiganya → status ketiganya `paid`,
   satu jurnal terbentuk, buku besar `1121` menampilkan 3 baris kredit.
2. Bayar sebagian pada 2 dari 3 invoice → status `partial`, sisa terhitung benar.
3. Salah satu baris diberi PPh → baris `1172` muncul, net bank berkurang sesuai.
4. Hapus jurnal multi-payment di halaman Jurnal → seluruh invoice terkait kembali ke
   status sebelumnya.

## 13. Risiko dan mitigasi

| Risiko | Mitigasi |
|---|---|
| Composite index belum ter-deploy saat kode live | Index ditambahkan ke `firestore.indexes.json` dan di-deploy oleh user/Codex sebelum fitur dipakai. Modal menampilkan error yang jelas bila query gagal. |
| Invoice legacy tanpa `customerId` tidak muncul di pemilih | Pengecekan data dilakukan sebelum implementasi (bagian 9); temuan bukan-nol dieskalasi ke user. |
| Jurnal multi-payment dihapus oleh versi JurnalPage lama | Perubahan bagian 10 dan fitur baru dirilis bersamaan dalam satu PR. |
| Pembulatan menyebabkan invoice lunas tampil `partial` | Aturan `Math.round` yang ada dipertahankan persis lewat `computeInvoiceStatus()`, dan diuji pada kasus batas. |
| Role admin tidak bisa memakai fitur | Perilaku ini disengaja dan sama dengan modal pembayaran yang ada. Perubahan `firestore.rules` di luar scope. |

## 14. Utang teknis yang sengaja ditinggalkan

Dicatat agar tidak hilang, tidak dikerjakan di sini:

- `getInvoices()` dan `getPurchaseInvoices()` menarik seluruh koleksi lalu memfilter di
  klien (`accounting.js:516`, `accounting.js:640`).
- Sisi AP masih basis kas; akun `2111`–`2114` Hutang Supplier tidak pernah dipakai.
- Bug `journalId: journal.id` di `BiayaPage.jsx:168` (task terpisah, prioritas P0).
- `BiayaPage` belum mendukung pembayaran parsial maupun `payments[]`.
