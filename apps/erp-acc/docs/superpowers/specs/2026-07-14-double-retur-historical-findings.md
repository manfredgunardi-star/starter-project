# Temuan Historis — Retur Ganda (Sales & Purchase Return)

**Tanggal analisis:** 2026-07-14
**Sumber data:** Supabase project `ERP-MG` (`cjnszzfbxgyszoskfgva`), query `SELECT` read-only terhadap seluruh 9 `sales_returns` dan 8 `purchase_returns` yang ada per tanggal analisis.
**Sifat dokumen:** Temuan audit + usulan koreksi. **Belum ada perubahan data yang dieksekusi** — semua rekomendasi di bawah perlu diverifikasi manual oleh Anda (accountant) terhadap bukti fisik sebelum diposting.

## Ringkasan Eksekutif

Modul Retur (`SalesReturnFormPage.jsx` / `PurchaseReturnFormPage.jsx`) punya opsi "Tanpa invoice (retur stok saja)" yang **tidak punya validasi qty apa pun** terhadap dokumen asal (Goods Delivery / Goods Received / invoice). Akibatnya, retur yang sama secara fisik bisa (dan sudah) diinput lebih dari sekali. Ditemukan 2 kasus terkonfirmasi (retur identik ter-posting 2x dan 3x) plus beberapa kasus yang perlu verifikasi manual. Total nilai jurnal yang berpotensi dobel: **± Rp 525,8 juta** (Persediaan/HPP) di kasus paling besar, plus satu kasus di mana **dua invoice berbeda kemungkinan keliru tercatat lunas** untuk retur fisik yang sama.

Tidak ada RPC `cancel_sales_return`/`cancel_purchase_return` di database saat ini — retur yang sudah `posted` tidak bisa dibatalkan lewat aplikasi. Koreksi harus via jurnal penyesuaian manual (atau menunggu fitur cancel dibangun).

---

## Kasus 1 — Screening (SCRALS), customer `70e5796e-62d5-4737-b333-cbc2259270ee` — 🔴 Terkonfirmasi Dobel

| Retur | Tanggal | Invoice Link | Jurnal | Debit Persediaan | Kredit HPP |
|---|---|---|---|---|---|
| `SRN-2026-00003` | 2026-07-10 | — (tanpa invoice) | `JRN-2026-00140` | Rp 525.821.344,34 | Rp 525.821.344,34 |
| `SRN-2026-00016` | 2026-06-01 (input 07-14) | `INV-2026-00006` | `JRN-2026-00195` | Rp 525.821.344,34 | Rp 525.821.344,34 |

Qty identik: **2.161,71** unit di kedua retur. `INV-2026-00006` (total Rp 1.223.744.031) sudah `return_credit_amount = total`, `status = 'paid'` — sisi AR **benar** (hanya `SRN-00016` yang mengurangi piutang). Tapi **Persediaan & HPP dobel catat** karena `SRN-00003` juga posting stock-in + reversal HPP untuk qty yang sama, tanpa terhubung ke invoice manapun.

**Usulan koreksi:** Verifikasi dulu — apakah barang secara fisik benar-benar diretur customer ini (qty 2.161,71 Screening)? Jika ya (kemungkinan besar, karena `SRN-00016` sudah benar menutup invoice), maka `SRN-00003` adalah entri duplikat yang harus dibalik:
```
Jurnal penyesuaian (tanggal sesuai kebijakan Anda, cek periode masih terbuka):
  Dr HPP (5-11000)         525.821.344,34
    Cr Persediaan (1-14000)   525.821.344,34
  Deskripsi: "Koreksi duplikasi SRN-2026-00003 (duplikat dari SRN-2026-00016)"
```
Juga perlu turunkan `inventory_stock.quantity_on_hand` produk Screening sebesar 2.161,71 (via jurnal + adjustment stok, bukan cuma jurnal GL, karena `inventory_stock` adalah tabel terpisah yang di-update langsung oleh `inventory_stock_in`).

---

## Kasus 2 — BATU BELAH (BTBLH), customer `687976ff-7e9a-4f55-9465-d6a7dc89f213` — 🔴 PALING BERISIKO

| Retur | Tanggal | Invoice Link | Jurnal | Nilai |
|---|---|---|---|---|
| `SRN-2026-00017` | 2026-06-02 | `INV-2026-00007` (total Rp 5.615.379, **paid**) | `JRN-2026-00199` | Rp 10.854,71 |
| `SRN-2026-00020` | 2026-06-08 | `INV-2026-00010` (total Rp 5.615.379, **paid**) | `JRN-2026-00205` | Rp 10.854,71 |
| `SRN-2026-00021` | 2026-06-02 | — (tanpa invoice) | `JRN-2026-00208` | Rp 10.854,71 |

Qty identik **24,09** unit di ketiga retur. Dua invoice **berbeda** (`INV-2026-00007` dan `INV-2026-00010`) **masing-masing** sudah `return_credit_amount = total`, `status = 'paid'`.

**Ini yang paling perlu perhatian Anda:** kalau secara fisik customer ini cuma meretur 24,09 unit BATU BELAH **satu kali**, maka salah satu dari `INV-2026-00007` atau `INV-2026-00010` **seharusnya masih berstatus piutang terbuka Rp 5.615.379**, bukan lunas. Sistem saat ini menutup keduanya sebagai lunas — berarti ada kemungkinan **piutang riil ~Rp 5,6 juta yang belum ditagih tapi sudah dianggap selesai**.

**Usulan koreksi:**
1. Cek bukti fisik (surat retur/SO/invoice) — invoice mana (`INV-00007` atau `INV-00010`) yang benar-benar terkait retur fisik ini.
2. Untuk invoice yang **salah** ditutup: reverse `return_credit_amount`-nya (set kembali ke 0, status invoice kembali ke `posted`/`partial` sesuai `amount_paid`), dan batalkan retur yang salah tersebut (reverse jurnalnya).
3. `SRN-00021` (tanpa invoice) hampir pasti murni duplikat tambahan (tidak ada invoice yang terkait) — kandidat kuat untuk dibalik jurnalnya juga.
4. Setelah investigasi, kemungkinan hanya **satu dari tiga retur ini yang valid** — dua sisanya dibalik.

---

## Kasus 3 — "Split 10-25 Ex Bojonegara" (SEB1025), customer `af00839c-20eb-4cc6-910d-d747c882ee76` — 🟡 Perlu Verifikasi (bukan duplikat pasti)

| Retur | Qty | Invoice | Total |
|---|---|---|---|
| `SRN-2026-00018` | 5.000 | `INV-2026-00008` (Rp 1.665.000.000, paid) | Rp 1.665.000.000 |
| `SRN-2026-00019` | 5.813,97 | `INV-2026-00013` (Rp 1.903.784.476,5, paid) | Rp 1.903.784.476,5 |

Qty & invoice berbeda — **kemungkinan besar dua retur yang sah** dari dua invoice terpisah, bukan duplikat. Masuk daftar ini hanya karena pola waktu (sama customer, sama produk, hari berdekatan) dan layak dicek sekali lagi agar yakin bukan bagian dari kebingungan yang sama seperti Kasus 1 & 2.

---

## Kasus 4 — Purchase Return, supplier `ca633f37-58e7-4452-822f-4cb06137ced8` — 🔴 Terkonfirmasi Dobel (nilai kecil)

| Retur | Tanggal | PO Link | Jurnal | Nilai |
|---|---|---|---|---|
| `PRN-2026-00003` | 2026-07-10 | — | `JRN-2026-00143` | Rp 10.854,71 |
| `PRN-2026-00007` | 2026-06-04 | — | `JRN-2026-00148` | Rp 10.854,71 |

Qty/harga identik (24,09 @ Rp 180.000). Tidak ada invoice link jadi AP tidak terdampak, tapi Persediaan (keluar) & Hutang Barang dobel catat sebesar Rp 10.854,71 (nilai kecil, tapi pola sama).

**Catatan lain:** `PRN-2026-00002` (status `draft`, qty/harga sama, PO sama dengan `PRN-2026-00006`) tampaknya draft yang ditinggalkan — aman karena belum di-post, tapi sebaiknya dihapus/dibatalkan agar tidak tertekan-post di kemudian hari.

---

## Kasus 5 — Purchase Return, supplier `37040b85-50f0-4037-961e-81d9d30adcc1` — 🟡 Perlu Verifikasi

`PRN-2026-00004` (qty 2.161,71, Rp 525.821.344,34) dan `PRN-2026-00005` (qty 3.078,3, Rp 748.775.665,69) — produk sama (Screening), qty berbeda, tanpa PO link. Qty `PRN-00004` **persis sama** dengan qty duplikat di Kasus 1 (2.161,71) — indikasi kuat ini bagian dari rangkaian upaya koreksi manual yang sama (kemungkinan orang yang mengoreksi mencoba beberapa cara: retur ke customer dan retur ke supplier untuk qty yang sama), tapi tidak bisa dipastikan tanpa cek dokumen sumber.

---

## Sinyal Tambahan — Stok Negatif

Kelima produk yang terlibat retur di atas saat ini punya `quantity_on_hand` **negatif**:

| Produk | SKU | Qty saat ini |
|---|---|---|
| Screening | SCRALS | **-916,59** |
| BATU BELAH | BTBLH | **-24,09** |
| Split 10-25 Ex Bojonegara | SEB1025 | **-3.100,19** |

Ini indikasi ada masalah rekonsiliasi stok yang lebih luas dari sekadar retur ganda (kemungkinan terkait GD/GR yang errornya Anda sebut sebelumnya). Di luar scope retur, tapi perlu direkonsiliasi terpisah sebelum stok ini dipakai untuk laporan/avg_cost yang akurat.

---

## Data Uji Coba yang Tercampur di Production

`SRN-2026-00001`, `SRN-2026-00002`, `PRN-2026-00001` menyentuh produk `SMOKE-RET-1779933382053 Product` dan `SMOKE-RET-1779933492072 Product` — nama ini adalah pola dari Playwright E2E test (`sales-return.spec.js` disebut di rencana lama). Ini sisa data uji coba yang ter-posting ke database production (nilai kecil, Rp 20.000–30.000 masing-masing), bukan transaksi bisnis riil. Perlu dibersihkan terpisah (idealnya E2E test punya database/project terpisah dari production — rekomendasi proses, bukan bagian dari fitur ini).

---

## Ringkasan Tindakan yang Perlu Anda Ambil

1. **Prioritas tinggi:** Verifikasi Kasus 2 (BATU BELAH) — tentukan invoice mana yang benar-benar lunas, karena berpotensi ada piutang ~Rp 5,6 juta yang belum tertagih.
2. **Prioritas sedang:** Verifikasi & balik jurnal duplikat Kasus 1 (Rp 525,8 juta Persediaan/HPP) dan Kasus 4 (Rp 10.854,71).
3. **Perlu cek manual:** Kasus 3 & 5 — kemungkinan legitimate, tapi masuk pola yang sama.
4. **Terpisah dari retur:** rekonsiliasi stok negatif untuk 3 produk di atas.
5. **Housekeeping:** hapus/reverse data `SMOKE-RET-*` dari production, pastikan test suite pakai project Supabase terpisah ke depannya.

Karena tidak ada RPC `cancel_sales_return`/`cancel_purchase_return`, koreksi di atas untuk saat ini harus berupa jurnal penyesuaian manual + adjustment `inventory_stock` langsung (hati-hati, dengan backup/verifikasi ganda) — atau tunggu sampai fitur cancel dibangun (lihat `apps/erp-acc/docs/superpowers/specs/2026-05-14-master-data-retur-cancel-closing-design.md` Phase 2, yang belum pernah diimplementasikan).

---

## Root Cause (untuk desain fitur pencegahan selanjutnya)

Semua kasus di atas mengalir dari satu celah yang sama: opsi **"Tanpa invoice (retur stok saja)"** di form retur (termasuk tombol pintasan "Buat Retur" dari halaman Goods Delivery/Goods Receipt) tidak divalidasi terhadap qty yang sudah pernah diretur dari GD/GR/invoice yang sama. Desain fitur pencegahan double-retur (dokumen terpisah, menyusul) akan menutup celah ini ke depan.
