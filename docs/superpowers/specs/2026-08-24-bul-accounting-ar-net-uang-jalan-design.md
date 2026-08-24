# Design Spec — Piutang Bersih Setelah Potongan Uang Jalan (bul-accounting)

**Tanggal:** 2026-08-24
**App:** `apps/bul-accounting`
**Status:** menunggu persetujuan user (menyentuh formula uang + data produksi)

## 1. Masalah

Jurnal bridge dari bul-monitor sudah benar mengakui piutang **bersih**:

```
Dr 1121 Piutang            (totalNilai − totalUJ)   ← NET
Dr 2141 Uang Muka Plgn      totalUJ                 ← clearing
   Cr 4100 Pendapatan          totalNilai           ← BRUTO
Dr 5150 HPP / Cr 1151 WIP   totalUJ + biaya non-upah
```

Sumber: `apps/bul-monitor/src/integrationService.js:437-465`.

Tetapi saat item antrian di-approve, invoice yang dibuat di modul Penjualan memakai
angka **bruto**:

`apps/bul-accounting/src/utils/integrationUtils.js:117`
```js
amount: item.totalNilai || 0,   // ← bruto, bukan item.piutangNet
```

Padahal `piutangNet` dan `totalUJ` sudah ikut terkirim dalam dokumen
`integration_queue` (`integrationService.js:411-413`) — hanya tidak dipakai.

## 2. Dampak terukur (per sync 2026-08-23 17:15 WIB)

Sumber data: spreadsheet "BUL-Accounting General Ledger Sync", tab `Aging Piutang`
(lengkap, 40 baris = isi collection `invoices`) dan `Trial Balance Bulanan` (lengkap).

| | Rp |
|---|---:|
| Subledger AR (`invoices`, 40 dokumen, seluruhnya `unpaid`) | 1.194.781.543 |
| GL 1121 Piutang Pelanggan – Proyek, saldo Ags 2026 | 679.780.443 |
| **Selisih** | **515.001.100** |

Selisih terurai tepat sampai rupiah terakhir:

| Komponen | Rp |
|---|---:|
| Akumulasi debit 2141 (clearing UJ → invoice) Jan–Ags 2026 | 511.505.000 |
| Invoice uji coba yang jurnalnya sudah dihapus tapi dokumen invoice-nya masih hidup | 3.496.100 |
| **Total** | **515.001.100** |

Debit 2141 per bulan: Jan 29.475.000 · Feb 71.640.000 · Mar 115.355.000 ·
Apr 141.630.000 · Mei 10.755.000 · Jun 50.565.000 · Jul 55.635.000 · Ags 36.450.000.

Sisa saldo 2141 Rp 81.460.000 = UJ untuk SJ yang belum diinvoice (normal / WIP).

**Belum ada pembayaran yang diposting.** Kolom Kredit akun 1121 kosong di setiap bulan
Trial Balance, dan `Total Pembayaran` nol untuk seluruh 40 invoice. Artinya belum ada
1121 yang ter-kredit bruto. Perbaikan masih bisa dilakukan sebagai koreksi data murni,
tanpa membalik jurnal pembayaran.

## 3. Keputusan desain

### D1 — `amount` menyimpan nilai bersih, bruto disimpan terpisah

Dokumen `invoices` yang lahir dari bridge menyimpan:

| Field | Isi |
|---|---|
| `amount` | piutang bersih (`totalNilai − totalUJ`) — basis seluruh perhitungan sisa tagihan & status |
| `amountGross` | nilai invoice bruto (`totalNilai`) |
| `totalUJ` | total uang jalan yang dipotong |

Alasan `amount` yang diubah (bukan menambah `amountNet`): seluruh konsumen yang sudah ada
— `computeInvoiceStatus`, `addInvoicePayment`, `removeInvoicePayment`,
`recordMultiInvoicePayment`, `PenjualanPage`, `buildAgingReceivableRows` di `scripts/gl-sync`
— membaca `amount`. Mengubah satu field membuat semuanya konsisten dengan GL 1121 sekaligus;
menambah field baru berarti menyentuh setiap konsumen satu per satu dan meninggalkan jalur
lama yang salah tetap hidup.

### D2 — Fallback untuk dokumen lama

Konsumen tidak boleh mengasumsikan `piutangNet` selalu ada. Urutan resolusi:

```
piutangNet bila berupa angka berhingga
  → selain itu totalNilai − totalUJ
  → selain itu totalNilai
```

### D3 — Nilai bersih negatif tidak diblokir

Bila `totalUJ > totalNilai`, `amount` menjadi negatif. Tidak dilempar error saat approve:
jurnalnya sendiri sudah memposting Dr 1121 negatif dan akuntan menyetujuinya secara sadar
lewat modal Review Integrasi yang menampilkan rincian "Bruto − UJ = Piutang Bersih"
(`IntegrationReviewPage.jsx:405-423`). Tujuannya konsistensi subledger dengan GL, bukan
menahan transaksi. Kasus ini dicatat di laporan backfill agar terlihat.

### D4 — Invoice manual tidak berubah

Invoice yang dibuat lewat form Penjualan tidak punya `totalUJ`. Perilakunya tidak berubah:
`amount` tetap nilai yang diketik akuntan, `amountGross` dan `totalUJ` tidak ditulis.
Tampilan rincian bruto/UJ hanya muncul bila `totalUJ > 0`.

### D5 — Backfill dipisah: modul murni + runner

Logika backfill hidup di modul murni tanpa I/O (`src/utils/invoiceAmountBackfill.js`)
sehingga bisa diuji penuh dengan vitest. Runner Firestore (`scripts/bul-accounting-backfill/`)
hanya membaca, memanggil modul murni, lalu menulis. Default `DRY_RUN=true`.

Alasan: Claude tidak punya kredensial Firestore dan seluruh CLI Firebase diblokir profil
permission. Memisahkan logika murni membuat bagian yang bisa divalidasi Claude tervalidasi
penuh, dan bagian yang tidak bisa dijalankan Claude menjadi setipis mungkin.

### D6 — Backfill idempoten dan menolak invoice yang sudah dibayar

Satu invoice dilewati bila:

- `amountGross` sudah ada (sudah pernah di-backfill), atau
- `totalPaid > 0` atau `payments` tidak kosong (butuh keputusan akuntan, bukan otomatis), atau
- `status` bernilai `cancelled`, atau
- item antrian tidak `approved`, atau
- `totalUJ` bernilai 0 (tidak ada yang perlu dikoreksi).

Setiap invoice yang dilewati masuk laporan beserta alasannya.

## 4. Prasyarat data (di luar scope kode)

Tujuh dokumen berikut harus dibereskan lebih dulu oleh user lewat UI aplikasi,
karena angka verifikasi akhir tidak akan cocok selama dokumen ini hidup:

**Lima dokumen uji coba** (Rp 3.496.100):
`INV/2026/001-TEST` ×2 (Rp 1.745.050 masing-masing, jurnal sudah berstatus Dihapus),
`UJI-001` (Rp 1.000), `UJI-002` (Rp 2.000), `UJI-003` (Rp 3.000) — pelanggan
"ZZ-TEST MULTIPAYMENT".

**Dua duplikat** `SJT/001/01/2026`: dua jurnal ter-posting identik,
`O8l43EJeeIv0uEry7vlY` dan `PObsH8GMMLaO0Lnjmkpk`, masing-masing
Dr 1121 7.844.060 / Cr 1151 4.480.000 / Dr 2141 4.480.000 / Cr 4100 12.324.060 /
Dr 5150 4.480.000. Subledger juga memuat dua dokumen invoice untuk nomor yang sama.

## 5. Verifikasi akhir

Setelah cleanup + backfill, tiga angka ini harus konsisten:

```
Σ invoices.amount (aktif, non-cancelled)  ==  saldo GL 1121
Σ invoices.amountGross                    ==  saldo GL 4100 (untuk invoice bridge)
Σ invoices.totalUJ                        ==  Σ debit 2141
```

Diverifikasi lewat tab `Aging Piutang` + `Trial Balance Bulanan` pada spreadsheet
GL Sync setelah sync harian berikutnya.

## 6. Di luar scope

- Saldo negatif akun 1112 Bank BCA Operasional (Rp −741.773.521) dan tidak adanya
  kredit di 1121 sama sekali. Pola ini konsisten dengan penerimaan pembayaran pelanggan
  yang belum masuk pembukuan, tetapi belum ditelusuri dan butuh verifikasi user sendiri.
- Perubahan pada `apps/bul-monitor` — sisi pengirim sudah benar.
