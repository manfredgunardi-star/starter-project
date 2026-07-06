# Laporan Audit Bug — 4 Aplikasi ERP/Monitor

**Tanggal:** 2026-06-11
**Cakupan:** sj-monitor, bul-monitor, bul-accounting, erp-acc (fokus & dalam: uang/akuntansi, auth, integritas data)
**Catatan:** Audit read-only. **Tidak ada kode yang diubah.** Laporan ini hanya temuan + rekomendasi. Semua perbaikan yang menyentuh logika uang/jurnal **wajib minta persetujuan** sesuai guardrail proyek.

---

## Status Implementasi (update 2026-06-11)

Perbaikan dijalankan atas instruksi user. Validasi: sj-monitor `test` 35/35 ✅ + `lint` 0 error ✅ + `build` ✅ + smoke test staging ✅ (https://sj-monitor-staging.web.app); bul-monitor/bul-accounting/erp-acc `build` ✅. **Belum di-commit & belum deploy production.**

| # | Status | Catatan |
|---|---|---|
| 1 | ✅ Diperbaiki (TDD) | `sjCascadeService.js`: impact UJ kini membawa `txData` kanonik penuh; create & revive ditulis via set+merge (set `tipe/suratJalanId/source/isActive:true/deletedAt:null`). 3 test baru. |
| 2 | ✅ Diperbaiki | `generateArusKasData`: saldo awal kini eksklusif (`date < startDate`). **Perlu review akuntansi.** |
| 3 | ✅ Diperbaiki | `upsertQueueDoc`: tolak kirim ulang bila `status === 'approved'`. |
| 5 | ✅ Mitigasi | `saveManualJournal`: hapus header yatim bila insert baris gagal. Fix penuh (RPC transaksional) masih disarankan. |
| 7 | ✅ Diperbaiki | `addInvoicePayment`: pembulatan status disamakan dengan `removeInvoicePayment`. |
| 8 | ✅ Diperbaiki | `hardDeleteJournal` dihapus. |
| 9 | ✅ Diperbaiki | `terbilang`: dukung s/d 999 triliun; nilai lama tetap akurat (diverifikasi). |
| 10 | ✅ Diperbaiki | Komentar jurnal usang (2122→2141) di `integrationService.js`. |
| 6 | ❌ Ditarik | Bukan bug. Server (migrasi 035/036) memakai `coalesce(nullif(tax_rate,0),11)` → `0`=11% **by-design**; client sudah konsisten. |
| 4 | ⏸️ Ditunda | Fix benar butuh dokumen counter atomik (= penambahan skema) → masuk guardrail "minta persetujuan". |

---

## Ringkasan Prioritas

| # | Severity | App | Lokasi | Inti masalah |
|---|---|---|---|---|
| 1 | 🔴 Tinggi | sj-monitor | `services/sjCascadeService.js` | Cascade *create* transaksi Uang Jalan menghasilkan dokumen cacat (tanpa `tipe`/`suratJalanId`/`source`/`isActive`) & gagal mengaktifkan kembali UJ yang ter-soft-delete |
| 2 | 🟠 Sedang | bul-accounting | `utils/accounting.js` `generateArusKasData` | Saldo awal arus kas double-count transaksi bertanggal = `startDate` → laporan tidak rekonsiliasi |
| 3 | 🟠 Sedang | bul-monitor | `integrationService.js` `upsertQueueDoc` | Kirim ulang item yang sudah `approved` me-reset ke `pending` & null `journalId` tanpa guard → risiko jurnal ganda |
| 4 | 🟡 Rendah-Sedang | bul-accounting | `utils/accounting.js` numbering | `getNextCustomerNo`/`getNextSupplierNo` race condition → nomor duplikat |
| 5 | 🟡 Rendah-Sedang | erp-acc | `services/journalService.js` `saveManualJournal` | Insert header + items non-atomik (tanpa RPC/transaksi) → header yatim jika item gagal |
| 6 | 🟡 Rendah | erp-acc | `utils/lineItemTotals.js:8` | `(product.tax_rate \|\| 11)` menelan produk taxable bertarif 0% → dikenai 11% |
| 7 | 🟡 Rendah | bul-accounting | `utils/accounting.js` `add/removeInvoicePayment` | Inkonsistensi pembulatan saat tentukan status `paid` |
| 8 | 🟡 Rendah | bul-accounting | `utils/accounting.js` `hardDeleteJournal` | Fungsi hard-delete ada (dead code) — melanggar aturan soft-delete |
| 9 | 🟡 Rendah | erp-acc | `utils/terbilang.js` | Salah/`undefined` untuk nilai ≥ 1 triliun |
| 10 | ⚪ Info | sj-monitor / bul-monitor | komentar `integrationService.js`, koleksi `invoice`/`invoices` | Komentar jurnal usang & dua koleksi invoice (primary+legacy) |

---

## Temuan Detail

### 🔴 #1 — Cascade edit SJ membuat transaksi Uang Jalan yang cacat
**File:** [apps/sj-monitor/src/services/sjCascadeService.js](apps/sj-monitor/src/services/sjCascadeService.js)
**Baris kunci:** `computeCascadePlan` baris 37–53 + `executeCascadePlan` baris 110–114.

Saat sebuah edit SJ menyebabkan transaksi UJ harus **dibuat baru** (`existingUJ` tidak ada di `transaksiList`), `impacts` hanya berisi field yang *berubah* (`nominal`, `keterangan`, `tanggal`). Pada eksekusi, op `create` melakukan:

```js
const patch = { updatedAt: nowIso, updatedBy: who };
(imp.changes || []).forEach((c) => { patch[c.field] = c.after; });
batch.set(ref, sanitizeForFirestore(patch), { merge: true });
```

Sehingga dokumen yang dibuat hanya `{ updatedAt, updatedBy, nominal, keterangan, tanggal }`. **Hilang** field wajib yang dibuat jalur normal (`App.jsx` baris ~175–185): `tipe: "pengeluaran"`, `suratJalanId`, `pt`, `source: "auto_sj"`, dan `isActive: true`.

Dampak:
- Transaksi tidak punya `tipe` → tidak terhitung sebagai pengeluaran di Laporan Kas / agregasi by-tipe.
- Tanpa `suratJalanId` → linkage ke SJ putus.

**Varian kedua (lebih berbahaya):** subscription `transaksi` di App.jsx memfilter `.filter((x) => !x?.deletedAt && x?.isActive !== false)`. Artinya transaksi UJ yang sudah **soft-delete** (mis. SJ pernah `gagal`) **tidak** ada di `transaksiList`, sehingga `existingUJ` `undefined` dan cascade menganggapnya `create`. Karena `batch.set(..., {merge:true})` dan patch **tidak** menyetel `isActive: true`, dokumen lama tetap `isActive:false` + `deletedAt` → **UJ tidak pernah aktif kembali** padahal SJ sudah dikembalikan ke status terkirim.

**Rekomendasi:** pada jalur `create`/reaktivasi, tulis ulang dokumen UJ secara penuh dari `recomputeDenormalizedSJ` (set `tipe`, `suratJalanId`, `pt`, `source`, `isActive:true`, dan eksplisit kosongkan `deletedAt`). Karena menyentuh data keuangan, **minta persetujuan** dulu.

---

### 🟠 #2 — Saldo awal arus kas double-count transaksi tanggal = startDate
**File:** [apps/bul-accounting/src/utils/accounting.js](apps/bul-accounting/src/utils/accounting.js) — `generateArusKasData` (baris 241–291).

- Arus periode pakai `getJournals({ startDate, endDate })` → filter `date >= startDate` (inklusif).
- Saldo awal pakai `getAccountBalances(startDate, null, truckId)` → `endDate = startDate`, filter `date <= startDate` (inklusif).

Transaksi yang **bertanggal tepat `startDate`** ikut terhitung **dua kali**: masuk `saldoAwal` *dan* masuk `operasional/investasi/pendanaan`. Akibatnya `saldoAwal + totalPerubahanKas ≠ saldoAkhir` (selisih = transaksi kas di hari `startDate`).

**Rekomendasi:** saldo awal harus dihitung **eksklusif** (`date < startDate`), mis. `getAccountBalances(hariSebelum(startDate), ...)`. Logika uang → **minta persetujuan**.

---

### 🟠 #3 — Kirim ulang item bridge yang sudah approved bisa jadi jurnal ganda
**File:** [apps/bul-monitor/src/integrationService.js](apps/bul-monitor/src/integrationService.js) — `upsertQueueDoc` (baris 73–111).

Saat dokumen `integration_queue` sudah ada, fungsi tanpa syarat me-reset:
```js
status: 'pending', journalId: null, reviewedBy: null, ...
```
`rejectionHistory` hanya merekam status `rejected`/`cancelled`. **Tidak ada guard** terhadap status `approved`. Jika sebuah item yang sudah di-approve (jurnal sudah diposting di bul-accounting, `journalId` terisi) dikirim ulang dari bul-monitor, referensi `journalId` di sisi queue dihapus dan status balik `pending` — saat di-approve lagi berisiko **membuat jurnal kedua** untuk transaksi yang sama.

**Rekomendasi:** tolak/short-circuit kirim ulang jika `prev.status === 'approved'` (atau wajibkan unapprove dulu). Verifikasi juga apakah UI bul-monitor sudah mencegah re-send item approved. Sentuh integrasi keuangan → **minta persetujuan**.

---

### 🟡 #4 — Race condition penomoran customer/supplier
**File:** [apps/bul-accounting/src/utils/accounting.js](apps/bul-accounting/src/utils/accounting.js) — `getNextCustomerNo` (554), `getNextSupplierNo` (584); dipakai di `PelangganPage.jsx`, `SupplierPage.jsx`, `integrationUtils.js`.

Pola read-max-lalu-+1 tanpa transaksi/counter atomik. Dua pembuatan paralel (mis. auto-create dari bridge + input manual) bisa menghasilkan `CUST-00X` duplikat. Probabilitas rendah pada single-user, tapi nyata.

**Rekomendasi:** gunakan counter dokumen atomik (`runTransaction`/`increment`) atau toleransi unik di sisi penyimpanan.

---

### 🟡 #5 — `saveManualJournal` non-atomik (header + items terpisah)
**File:** [apps/erp-acc/erp-app/src/services/journalService.js](apps/erp-acc/erp-app/src/services/journalService.js) (baris 35–68).

Berbeda dengan `savePayment`/`saveTransfer` yang memakai RPC atomik, jurnal manual melakukan dua operasi terpisah: insert `journals` lalu insert `journal_items`. Jika insert items gagal, **header jurnal yatim** (tanpa baris) tertinggal. Saldo debit=kredit memang divalidasi server saat `post_manual_journal`, jadi draft yatim tidak langsung merusak buku besar, tapi mengotori data & bisa membingungkan.

**Rekomendasi:** pindahkan ke satu RPC transaksional (mirip `save_and_post_payment`).

---

### 🟡 #6 — `tax_rate || 11` menelan tarif 0% pada produk taxable
**File:** [apps/erp-acc/erp-app/src/utils/lineItemTotals.js:8](apps/erp-acc/erp-app/src/utils/lineItemTotals.js)

```js
const tax_amount = product?.is_taxable ? subtotal * ((product.tax_rate || 11) / 100) : 0
```
Jika sebuah produk `is_taxable = true` tetapi `tax_rate = 0` (mis. barang/jasa tertentu bertarif 0%), `0 || 11` → dikenai **11%**. Saat ini server (migrasi 036) juga recompute dari master sehingga konsisten, namun keduanya sama-sama salah jika ada produk 0% bertanda taxable.

**Rekomendasi:** bedakan "tidak ada nilai" vs "0" — `product.tax_rate ?? 11` (nullish), dan pertimbangkan default hanya saat `null/undefined`. Sentuh pajak → **minta persetujuan**.

---

### 🟡 #7 — Inkonsistensi pembulatan status pembayaran invoice
**File:** [apps/bul-accounting/src/utils/accounting.js](apps/bul-accounting/src/utils/accounting.js)

- `addInvoicePayment` (525): `const status = totalPaid >= inv.amount ? 'paid' : 'partial'` (tanpa pembulatan).
- `removeInvoicePayment` (540): `Math.round(totalPaid) >= Math.round(inv.amount) ? 'paid' : ...` (dengan pembulatan).

Selisih floating-point kecil bisa membuat satu jalur menilai `paid` dan jalur lain `partial` untuk nilai yang sama. `addInvoicePayment` juga tidak pernah menghasilkan status `unpaid`.

**Rekomendasi:** samakan toleransi pembulatan di kedua fungsi.

---

### 🟡 #8 — `hardDeleteJournal` (dead code) melanggar aturan soft-delete
**File:** [apps/bul-accounting/src/utils/accounting.js:95](apps/bul-accounting/src/utils/accounting.js)

`hardDeleteJournal` melakukan `deleteDoc` permanen. Hasil grep: **tidak dipanggil di mana pun**. Risikonya: tersedia sebagai jebakan yang melanggar Data Safety Rule #1 (always soft delete).

**Rekomendasi:** hapus fungsi atau beri penjaga eksplisit; minimal dokumentasikan agar tidak dipakai.

---

### 🟡 #9 — `terbilang` salah untuk nilai ≥ 1 triliun
**File:** [apps/erp-acc/erp-app/src/utils/terbilang.js](apps/erp-acc/erp-app/src/utils/terbilang.js)

`milyar = Math.floor(n / 1e9)`; untuk `n ≥ 1e12`, `milyar ≥ 1000` lalu `ratusan(1000+)` mengakses `SATUAN[ratus]` di luar indeks → menghasilkan teks salah/`undefined` ("Sepuluh Ratus ...", dst). Komentar di file mengklaim dukungan hanya s/d ratusan milyar, jadi ini batas yang diketahui — namun tidak ada guard.

**Rekomendasi:** tambah cabang triliun atau fallback aman bila `n` melebihi batas. Severitas rendah (jarang ada invoice ≥ 1 triliun).

---

### ⚪ #10 — Catatan kebersihan (bukan bug runtime)
- **Komentar jurnal usang** di `bul-monitor/src/integrationService.js` baris 138: tertulis "Cr 2122 (Hutang UJ Sopir)" padahal kode meng-kredit **2141 (Uang Muka Pelanggan)**. Berpotensi menyesatkan reviewer akuntansi. (Jurnal yang dihasilkan sendiri **balance** — sudah diverifikasi.)
- **Dua koleksi invoice** di sj-monitor (`invoice` primary + `invoices` legacy, di-merge via `normalizeInv`). `sjCascadeService` menulis hasil cascade ke koleksi `invoice` memakai `inv.id`; bila invoice terkait berasal dari koleksi `invoices` (legacy), `batch.set(doc(db,'invoice', inv.id), …, {merge:true})` akan menulis ke koleksi yang **berbeda** dari sumbernya. Edge case (hanya invoice legacy), perlu dikonfirmasi apakah masih ada data legacy aktif.

---

## Area yang TIDAK diaudit mendalam (butuh akses/konteks lain)
- **RPC SQL Supabase erp-acc** (`save_*`, `post_*`, migrasi tax authority 035/036, arus kas server-side): logika uang inti ada di server; audit memerlukan baca file migrasi/SQL secara terpisah.
- **firestore.rules** untuk semua app (guardrail keamanan — tidak disentuh).
- **Pengujian runtime**: tidak menjalankan build/test/app (read-only). Disarankan menjalankan `npm test` (sj-monitor) dan menulis test regresi untuk temuan #1 & #2 sebelum perbaikan.

---

## Rekomendasi langkah berikut (urutan)
1. **#1** (cascade UJ) — paling berdampak ke integritas data keuangan sj-monitor; buat test dulu, lalu perbaiki dengan persetujuan.
2. **#2** (arus kas) & **#3** (jurnal ganda bridge) — akurasi laporan & risiko posting ganda.
3. **#5/#6/#7** — perbaikan kebersihan/akurasi setelah persetujuan logika uang.
4. **#4/#8/#9/#10** — perbaikan low-risk / housekeeping.
