# Nilai Kwitansi Net (Sub Total − Uang Jalan) — Design

**Tanggal:** 2026-08-26
**Aplikasi:** `apps/bul-monitor`
**Status:** disetujui user (pendekatan A)

## Masalah

Kwitansi fisik yang dipakai di lapangan memakai format
`SUB Total − Pengurangan UJ = Total Akhir` (net). Web app menampilkan **bruto**
(`Σ qtyBongkar × hargaSatuan`) tanpa potongan uang jalan, sehingga angka di layar
tidak pernah cocok dengan kwitansi yang dipegang pelanggan.

### Lokasi bruto di bul-monitor

| Tempat | Rumus sekarang | Referensi |
|---|---|---|
| Simpan invoice baru | `totalNilai = Σ(qtyBongkar × harga)` | `src/App.jsx:842-850` |
| Simpan invoice edit | idem | `src/App.jsx:960-968` |
| Kartu invoice, "Nilai Invoice" | `invoice.totalNilai` | `src/components/InvoiceManagement.jsx:377` |
| Preview modal, grup tunggal | `totalQty × harga` | `src/components/Modal.jsx:758,776` |
| Preview modal, multi grup | `Σ nilai per grup` | `src/components/Modal.jsx:784,828` |
| Export Excel, baris TOTAL | `invoice.totalNilai` | `src/components/InvoiceManagement.jsx:118-119` |

### Yang sudah benar

Bridge ke bul-accounting sudah net: `piutangNet = totalNilai − totalUJ` dengan
`totalUJ = Σ sj.uangJalan` diambil dari **SJ live**
(`src/integrationService.js:352-355`). Jurnal GL sudah benar
(Dr 1121 net, Dr 2141 UJ, Cr 4100 bruto).

### Akar masalah

Tidak ada satu pun field "nilai net" di dokumen invoice bul-monitor.
`uangJalan` hanya hidup di dokumen Surat Jalan dan tidak pernah diagregasi
kecuali pada saat kirim ke accounting.

## Keputusan

Pendekatan **A — Live-first, snapshot sebagai fallback**.

1. **Tidak mengubah schema.** `totalNilai` tetap tersimpan bruto. Ia adalah dasar
   pengakuan pendapatan `Cr 4100` di bridge; mengubahnya akan merusak jurnal dan
   44 dokumen invoice lama.
2. **Tidak ada migrasi data.** Nilai net dihitung saat render.
3. **Satu util terpusat**, `src/utils/invoiceTotals.js`, dipakai ketiga layar.
   Mengikuti pola `invoiceEligibility.js` yang sudah ada di repo.
4. **Sumber uang jalan: SJ live dulu, snapshot `invoice.suratJalanList` sebagai
   fallback.** Ini menyamakan angka UI dengan angka bridge. Memakai snapshot
   sebagai sumber utama akan menciptakan divergensi baru antara kwitansi dan
   jurnal GL — kelas bug yang sama yang sedang diperbaiki.

### Di luar cakupan

Bug subledger AR bruto di bul-accounting (`src/utils/integrationUtils.js:117`
memakai `item.totalNilai` alih-alih `item.piutangNet`, selisih Rp 515.001.100)
ditangani spec terpisah yang sudah ada di branch
`claude/bul-accounting-journal-docs-fb16b0`. Perbaikan itu butuh backfill data
Firestore dan tidak boleh dicampur ke sini.

## Kontrak util

```js
// src/utils/invoiceTotals.js

/**
 * Resolusi suratJalanIds sebuah invoice menjadi dokumen SJ, live-first.
 * @returns {{ list: Array<{ sj: object, sumber: 'live'|'snapshot' }>, sjHilang: number }}
 */
export function resolveSJInvoice(invoice, suratJalanList = [])

/** Jumlahkan uangJalan dari sederet dokumen Surat Jalan. */
export function hitungPotonganUJ(sjs = []): number

/**
 * Hitung tiga angka kwitansi untuk satu invoice tersimpan.
 * @returns {{
 *   subTotal: number,     // bruto, dari invoice.totalNilai
 *   potonganUJ: number,   // Σ uangJalan
 *   totalAkhir: number,   // subTotal − potonganUJ
 *   sumberUJ: 'live'|'campuran'|'snapshot',
 *   sjHilang: number      // id yang tak ada di live maupun snapshot
 * }}
 */
export function hitungTotalInvoice(invoice, suratJalanList = [])
```

Resolusi per `suratJalanIds`:
1. cari di `suratJalanList` (live) → pakai
2. kalau tidak ada, cari di `invoice.suratJalanList` (snapshot) → pakai
3. kalau tidak ada di keduanya → hitung sebagai `sjHilang`, kontribusi UJ 0

`sumberUJ` bernilai `live` bila tidak ada yang jatuh ke fallback, `snapshot` bila
semuanya jatuh ke fallback, `campuran` bila sebagian. Invoice tanpa SJ menghasilkan
`live`.

## Tampilan

Tiga baris bertingkat, meniru istilah kwitansi fisik:

```
Sub Total              Rp 11.127.245
Potongan Uang Jalan  − Rp  2.400.000
Total Akhir            Rp  8.727.245   ← tebal, warna biru
```

- **Kartu invoice** (`InvoiceManagement.jsx`): blok "Nilai Invoice" yang sekarang
  satu baris diganti tiga baris di atas.
- **Modal buat/edit** (`Modal.jsx`): ringkasan di bawah input harga, untuk grup
  tunggal maupun multi grup. Multi grup memakai total UJ dari seluruh SJ terpilih,
  bukan dipecah per grup.
- **Export Excel**: baris `TOTAL` diganti tiga baris `SUB TOTAL`,
  `POTONGAN UANG JALAN`, `TOTAL AKHIR`. Kolom `Nilai` per SJ tetap bruto; kolom
  `Uang Jalan` ditambahkan per baris SJ.

Bila `sumberUJ !== 'live'` atau `sjHilang > 0`, kartu invoice menampilkan
peringatan kecil bahwa sebagian uang jalan diambil dari data arsip.

## Pengujian

Unit test murni dengan vitest, colocated (`src/utils/invoiceTotals.test.js`),
mengikuti gaya `invoiceEligibility.test.js`. Tidak ada test UI — repo bul-monitor
belum punya harness render komponen.

Validasi wajib: `npm run test` dan `npm run build` dari `apps/bul-monitor`.

## Risiko

- Angka kwitansi yang sudah dicetak bisa berubah bila `uangJalan` sebuah SJ diedit
  setelah invoice dibuat. Ini disengaja: jurnal GL juga ikut berubah, sehingga
  kwitansi tetap konsisten dengan pembukuan.
- Tidak menyentuh financial logic, schema, jurnal, maupun bridge. Tidak ada
  approval gate CLAUDE.md yang terpicu.
