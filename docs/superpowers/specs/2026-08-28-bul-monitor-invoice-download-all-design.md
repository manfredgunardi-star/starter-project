# bul-monitor: Download Semua Invoice (Excel)

**Tanggal:** 2026-08-28
**App:** `apps/bul-monitor`
**Status:** Disetujui untuk implementasi

## Latar Belakang

`InvoiceManagement.jsx` sudah punya tombol export per-invoice (`exportInvoiceToExcel`,
[InvoiceManagement.jsx:144](../../../src/components/InvoiceManagement.jsx#L144)) yang menghasilkan
satu file CSV per klik. Tidak ada cara mengekspor seluruh invoice sekaligus. User perlu satu file
gabungan untuk rekap/audit tanpa harus mengklik satu-satu.

Fitur analog sudah ada dan sudah live di `bul-accounting` ("Download Semua Laporan", PR #50) — desain
ini meniru pola yang sama: lazy-load `xlsx` (SheetJS), tidak menambah query Firestore baru, tidak
menghitung ulang angka uang di luar util yang sudah ada.

## Scope

**Termasuk:**
- Satu tombol "Download Semua Invoice" di tab "Sudah Terinvoice" pada `InvoiceManagement.jsx`.
- Menghasilkan satu file `.xlsx` asli (bukan CSV) berisi 2 sheet.
- Mencakup seluruh `invoiceList` yang sudah di-load ke state (tidak ada filter tanggal, tidak
  mengikuti kotak pencarian yang sedang aktif).

**Tidak termasuk (out of scope):**
- Tidak mengubah tombol export CSV per-invoice yang sudah ada.
- Tidak menambah filter tanggal / pemilihan invoice untuk fitur ini.
- Tidak menyatukan duplikasi boilerplate download-file di `App.jsx` (lihat Catatan Arsitektur).
- Tidak ada perubahan schema Firestore, security rules, atau kontrak `shared/bul-bridge`.

## Keputusan Desain

### 1. Sumber data — tidak ada query baru
`invoiceList` dan `suratJalanList` sudah di-subscribe penuh ke memory client lewat `onSnapshot`
tanpa `limit()` ([App.jsx:2511](../../../src/App.jsx#L2511)) dan sudah menjadi prop
`InvoiceManagement`. Fitur ini murni memformat ulang data yang sudah ada di state React — nol
Firestore read tambahan.

### 2. Sumber angka uang — wajib reuse `invoiceTotals.js`
Perhitungan Sub Total / Potongan Uang Jalan / Total Akhir **wajib** memakai
`hitungTotalInvoice()` dan `resolveSJInvoice()` dari
[`invoiceTotals.js`](../../../src/utils/invoiceTotals.js) — satu-satunya sumber kebenaran yang
sudah dilindungi test dan baru diperbaiki di PR #77 (nilai kwitansi net). Fungsi baru **tidak
boleh** menghitung ulang total dengan cara lain, untuk mencegah kelas bug yang sama seperti
selisih AR-bruto-vs-GL-net di `bul-accounting`.

### 3. Struktur workbook — 2 sheet

**Sheet "Rekap Invoice"** — satu baris per invoice:

| Kolom | Sumber |
|---|---|
| No Invoice | `invoice.noInvoice` |
| Tanggal Invoice | `invoice.tglInvoice` |
| Jumlah SJ | `invoice.suratJalanIds.length` |
| Sub Total | `hitungTotalInvoice(...).subTotal` |
| Potongan Uang Jalan | `hitungTotalInvoice(...).potonganUJ` |
| Total Akhir | `hitungTotalInvoice(...).totalAkhir` |
| Status Integrasi | `invoice.integrationStatus` (map ke label: kosong→"Belum Dikirim", `menunggu_review`→"Menunggu Review Akuntan", `terkunci`→"Sudah Masuk Accounting") |
| Dibuat Oleh | `invoice.createdBy` |
| Tanggal Dibuat | `invoice.createdAt` |

**Sheet "Detail SJ"** — semua baris SJ dari semua invoice digabung jadi satu tabel panjang (untuk
difilter/pivot di Excel), diresolusi lewat `resolveSJInvoice()`:

| Kolom | Sumber |
|---|---|
| No Invoice | invoice induk |
| No SJ | `sj.nomorSJ` |
| Tgl SJ | `sj.tanggalSJ` |
| No Polisi | `sj.nomorPolisi` |
| Nama Supir | `sj.namaSupir` |
| Rute | `sj.rute` |
| Material | `sj.material` |
| Qty Bongkar | `sj.qtyBongkar` |
| Satuan | `sj.satuan` |
| Harga Satuan | Resolusi per-SJ: kalau `invoice.hargaPerGroup` ada, cari lewat `hargaMap[material\|rute]` (pola yang sama dengan `integrationService.js:417-421`, sumber kebenaran yang sudah dipakai untuk kirim ke accounting); kalau tidak, pakai `invoice.hargaSatuan` flat. **Tidak** memakai `invoice.hargaSatuan` mentah-mentah untuk invoice multi-grup — lihat Catatan Arsitektur #4. |
| Nilai | `qtyBongkar * hargaSatuan` (hasil resolusi di atas) |
| Uang Jalan | `sj.uangJalan` |
| Sumber Data | `'live'` atau `'snapshot'` (dari `resolveSJInvoice`, transparansi kalau SJ sudah tidak aktif) |

Kalau `resolveSJInvoice` melaporkan `sjHilang > 0` untuk suatu invoice, baris ringkasan tetap
ditulis apa adanya (total tetap dari `hitungTotalInvoice`, yang sudah menangani kasus ini) — tidak
ada baris khusus tambahan untuk SJ yang hilang di sheet Detail SJ, karena memang tidak ada data SJ
untuk ditulis.

### 4. Cakupan data
Semua invoice di `invoiceList` (tab "Sudah Terinvoice"), tanpa filter tanggal, tanpa mengikuti
kotak pencarian yang sedang aktif. Ini pilihan yang sengaja paling sederhana — user memilih opsi
ini secara eksplisit saat brainstorming.

### 5. Library & bundle size
Pakai `xlsx` (SheetJS) — sudah terdaftar di `package.json` DAN sudah dipakai di `bul-monitor`:
`downloadSJRecapToExcel` di [`src/utils/formatters.js:55-127`](../../../src/utils/formatters.js#L55)
sudah meng-`await import('xlsx')` dan sudah terhubung ke tombol "Download Excel" yang sudah ada di
area rekap Surat Jalan (`App.jsx`). Fitur ini jadi call-site kedua `xlsx` di aplikasi ini, bukan yang
pertama.

Tetap wajib di-import secara **dinamis** (`await import('xlsx')`) di dalam handler klik tombol, bukan
static import di top-level file — kalau di-static-import, `xlsx` tetap akan masuk ke bundle utama
untuk semua user, terlepas dari apakah mereka pernah memakai fitur ini. Keputusan lazy-load ini tetap
benar terlepas dari precedent yang sudah ada. Namun angka bundle-size spesifik dari precedent
`bul-accounting` (`handoff_laporan_export_suite`, 1.734KB→902KB setelah lazy-load) TIDAK berlaku di
sini — chunk `xlsx` di `bul-monitor` sudah ter-split keluar dari bundle utama sejak
`downloadSJRecapToExcel` ada, sebelum task ini dikerjakan.

### 6. Permission / role gate
Tidak ada role gate baru. Tombol export per-invoice yang sudah ada tidak dibatasi role; tombol baru
ini konsisten — tersedia untuk siapa pun yang bisa melihat tab "Sudah Terinvoice".

### 7. Filename & empty state
- Nama file: `Invoice_Semua_<YYYY-MM-DD>.xlsx` (tanggal saat file dibuat).
- Tombol disembunyikan/disable kalau `invoiceList.length === 0`, konsisten dengan pola tombol lain
  di komponen ini (mis. "Buat Invoice Baru" yang juga bersyarat).

## Arsitektur

```
InvoiceManagement.jsx (tombol "Download Semua Invoice")
        │  onClick
        ▼
handleDownloadSemuaInvoice()
        │  1. await import('xlsx')          — lazy load, hanya saat diklik
        │  2. buildInvoiceWorkbookData(invoiceList, suratJalanList)
        │       → { rekap: [...rows], detail: [...rows] }
        │       (utils/invoiceWorkbook.js — fungsi murni, reuse invoiceTotals.js)
        │  3. XLSX.utils.book_new() + 2 sheet + XLSX.writeFile(...)
        ▼
Browser download: Invoice_Semua_2026-08-28.xlsx
```

## File yang Berubah

| File | Perubahan |
|---|---|
| `src/utils/invoiceWorkbook.js` (baru) | `buildInvoiceWorkbookData(invoiceList, suratJalanList)` — fungsi murni, testable tanpa DOM/browser, mengembalikan `{ rekap, detail }` sebagai array of objects siap ditulis ke sheet. |
| `src/utils/invoiceWorkbook.test.js` (baru) | Vitest — cakupan: invoice normal, invoice dengan `hargaPerGroup`, SJ hilang (`sjHilang > 0`), invoice kosong (`invoiceList = []`), format tanggal/label status. |
| `src/components/InvoiceManagement.jsx` | Tambah tombol + handler `handleDownloadSemuaInvoice` yang lazy-load `xlsx`, panggil util, tulis file lewat `XLSX.writeFile`. |

Tidak ada perubahan pada `App.jsx` (props yang dibutuhkan — `invoiceList`, `suratJalanList` —
sudah dikirim ke `InvoiceManagement` saat ini).

## Error Handling

- Kalau `import('xlsx')` gagal (mis. network issue saat lazy chunk di-fetch): tangkap error, tampilkan
  alert/toast sederhana "Gagal memuat modul export, coba lagi" — jangan biarkan unhandled rejection.
- Kalau `buildInvoiceWorkbookData` menerima `invoiceList` kosong: kembalikan `{ rekap: [], detail: [] }`
  tanpa throw (tombol pemanggilnya sudah disable di kondisi ini, tapi util tetap harus aman dipanggil
  langsung dari test).

## Testing

- **Unit (Vitest):** `invoiceWorkbook.test.js` — verifikasi isi `rekap` dan `detail` untuk berbagai
  bentuk invoice (single harga, multi `hargaPerGroup`, SJ hilang, snapshot vs live), mengikuti pola
  `invoiceTotals.test.js` yang sudah ada.
- **Manual (browser):** buka tab Invoice → "Sudah Terinvoice", klik "Download Semua Invoice", buka
  file `.xlsx` yang dihasilkan, verifikasi 2 sheet, verifikasi total di sheet Rekap sama persis
  dengan angka yang tampil di kartu invoice pada layar.
- **Build:** `npm run build` wajib lolos (validasi standar root CLAUDE.md).

## Catatan Arsitektur (di luar scope, tidak dikerjakan di task ini)

Ditemukan saat eksplorasi codebase untuk task ini — dicatat untuk task terpisah di masa depan:

1. **Duplikasi boilerplate download-file** — pola `Blob → createElement('a') → click → cleanup`
   di-copy-paste identik minimal 3× (`InvoiceManagement.jsx:173`, `App.jsx:1134`, `App.jsx:1620`).
   Fitur ini menambah cara ke-4 (lewat `XLSX.writeFile`, sedikit berbeda API-nya). Kandidat baik
   untuk helper bersama `downloadBlob(blob, filename)`, tapi migrasi 3 tempat lama di luar scope
   task ini.
2. **Penamaan menyesatkan** — tombol "Export Excel" yang sudah ada sebenarnya menghasilkan `.csv`
   (delimiter `;`), bukan `.xlsx` asli. Setelah fitur ini masuk, aplikasi punya dua istilah "Excel"
   berbeda perilaku. Tidak blocking, worth diselaraskan nanti.
3. **`onSnapshot` invoice tanpa `limit()`** ([App.jsx:2511](../../../src/App.jsx#L2511)) — seluruh
   koleksi invoice ditarik ke browser pada setiap perubahan. Bukan masalah untuk fitur ini (dia
   manfaatkan data yang sudah di memory), tapi titik pertumbuhan risiko independen kalau volume
   invoice historis terus bertambah tanpa arsip/pagination.
4. **Bug ditemukan di export per-invoice yang sudah ada** — `exportInvoiceToExcel`
   ([InvoiceManagement.jsx:144-160](../../../src/components/InvoiceManagement.jsx#L144)) memakai
   `invoice.hargaSatuan` mentah untuk kolom Harga/Nilai di SEMUA baris SJ. Untuk invoice multi-grup
   (`hargaPerGroup`), `invoice.hargaSatuan` sengaja disimpan `null` (lihat `Modal.jsx:194`), jadi
   `Number(null) || 0` membuat kolom Harga/Satuan dan Nilai tampil **0** di CSV yang dihasilkan
   tombol lama untuk invoice jenis ini. `integrationService.js:417-421` sudah punya pola resolusi
   yang benar (`hargaMap[material|rute]`) yang dipakai untuk kirim ke accounting — sheet "Detail SJ"
   di fitur baru ini memakai pola yang benar tersebut, sehingga TIDAK mewarisi bug ini. Perbaikan
   tombol CSV lama di luar scope task ini karena menyentuh output finansial yang sudah berjalan —
   perlu keputusan/izin user terpisah sebelum diubah.
5. **Dua pemanggil `XLSX.writeFile` independen** — `downloadSJRecapToExcel`
   (`src/utils/formatters.js:55-127`) dan `handleDownloadSemuaInvoice` baru
   (`src/components/InvoiceManagement.jsx`) sekarang sama-sama meng-`await import('xlsx')` dan
   memanggil `XLSX.writeFile` sendiri-sendiri, dengan boilerplate `book_new()`/`book_append_sheet()`
   yang mirip. Kandidat baik untuk satu helper kecil "workbook writer" bersama di task terpisah di
   masa depan — tidak dikonsolidasikan di task ini.
