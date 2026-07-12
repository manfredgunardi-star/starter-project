# Edit SJ + Cascade (Superadmin-Only) — Design Spec

**Tanggal:** 2026-06-05
**Project:** sj-monitor (`apps/sj-monitor/`)
**Status:** Approved (brainstorming) → siap di-plan

---

## 1. Tujuan

Memberi user role **`superadmin`** kemampuan mengedit **semua field** sebuah dokumen `surat_jalan`, dan **mencascade** perubahan tersebut secara konsisten ke semua data terkait di Firestore (transaksi uang jalan, invoice, uang muka, biaya, dan secara implisit payslip).

Eksekusi mengikuti pola **Preview dampak → Konfirmasi → Tulis (atomic)**, dengan audit trail before/after, dan penegakan superadmin baik di UI maupun `firestore.rules`.

## 2. Keputusan dari Brainstorming

| Topik | Keputusan |
|---|---|
| Cakupan field | **Semua field** termasuk `nomorSJ`, `tanggalSJ`, `ruteId`, `supirId`, `truckId`, `materialId`, `qtyIsi`, `qtyBongkar`, `status`. |
| SJ yang sudah matang (terinvoice/dibayar) | **Boleh diedit**, tapi dengan peringatan keras + daftar dokumen terdampak + konfirmasi ekstra. |
| Model eksekusi | **Preview → confirm → write** (atomic via `writeBatch`). |
| Penegakan akses | Sembunyikan UI dari non-superadmin **+ enforce di `firestore.rules`**. |
| Audit | `addHistoryLog()` before/after untuk setiap edit + cascade. |
| Rollback | Tidak diimplementasikan (out of scope). Audit trail jadi jaring pengaman. |
| Pendekatan teknis | **Pendekatan A** — Cascade Service terpusat (preview engine + executor). |

## 3. Peta Relasi Data (sumber kebenaran cascade)

`surat_jalan` adalah sumber **denormalisasi**. Field yang disalin & dihitung ulang ke tempat lain:

| Target | Lokasi kode | Ketergantungan pada field SJ |
|---|---|---|
| Denormalisasi master di SJ sendiri | [App.jsx:1413-1436](../../../apps/sj-monitor/src/App.jsx) | `nomorPolisi`←truck, `namaSupir`/`pt`←supir, `rute`/`uangJalan`←rute, `material`/`satuan`←material |
| Transaksi Uang Jalan `TX-UJ-<sjId>` | [App.jsx:160-184](../../../apps/sj-monitor/src/App.jsx) | `nominal`=`uangJalan`, `keterangan`=`Uang Jalan - {nomorSJ} ({rute})`, `tanggal`=`tanggalSJ`, `pt`. Tidak ada jika status `gagal`/`isActive:false`/`uangJalan<=0`. |
| Invoice (snapshot + total) | [App.jsx:542-581](../../../apps/sj-monitor/src/App.jsx) | Invoice menyimpan **objek SJ utuh** di `suratJalanList[]`, plus `totalQty` (Σ`qtyBongkar`), `totalHarga`/`totalHargaAfterUM` (grup by `sj.rute` × `ruteHarga`), `totalUM` (Σ uang muka by `sjId`). |
| Uang Muka | [App.jsx:562,577](../../../apps/sj-monitor/src/App.jsx) | Difilter `um.sjId === sj.id`. Nilai UM tidak berubah oleh edit SJ, tapi menentukan total invoice. |
| Biaya | [App.jsx:1626](../../../apps/sj-monitor/src/App.jsx) | Difilter `b.suratJalanId === id`. |
| Payslip | [payslipService.js:44-120](../../../apps/sj-monitor/src/services/payslipService.js) | **Dihitung on-the-fly** dari SJ. Tidak ada dokumen tersimpan (kecuali `bonusAdjustment` di SJ). Edit SJ otomatis mengubah angka gaji pada pembacaan berikutnya. |

**Implikasi kunci:** invoice menyimpan snapshot statis, jadi **wajib di-recompute & ditulis ulang** saat SJ di dalamnya diedit. Payslip tidak butuh cascade write tapi angkanya berubah → harus muncul di peringatan preview.

## 4. Arsitektur (Pendekatan A)

Pisahkan **perhitungan dampak (pure, testable)** dari **eksekusi (Firestore write)**.

```
EditSJModal (UI, superadmin-only)
   │  (1) user ubah field
   ▼
computeCascadePlan(oldSJ, changes, context)   ──►  CascadePlan (preview, NO write)
   │                                                 { sjAfter, impacts:[{collection,docId,label,before,after,severity}], warnings:[] }
   │  (2) tampilkan preview + warning, user konfirmasi
   ▼
executeCascadePlan(plan, { db, currentUser })  ──►  writeBatch atomic + addHistoryLog
```

### 4.1 Unit & tanggung jawab

| File | Tipe | Tanggung jawab |
|---|---|---|
| `src/utils/invoiceTotals.js` (NEW) | pure util | Ekstraksi formula total invoice dari App.jsx (DRY). `computeInvoiceTotals(sjList, ruteHarga, uangMukaList)` → `{ totalQty, totalHarga, totalUM, totalHargaAfterUM }`. **Tidak mengubah formula** — copy persis. |
| `src/utils/sjCascadeHelpers.js` (NEW) | pure util | `diffSJFields(oldSJ, newSJ)`, `recomputeDenormalizedSJ(sj, masters)`, `buildUangJalanImpact(sjAfter)`, `classifySeverity(...)`. |
| `src/services/sjCascadeService.js` (NEW) | service | `computeCascadePlan(...)` (pure-ish, baca state in-memory, no write) + `executeCascadePlan(...)` (writeBatch + audit). |
| `src/components/EditSJModal.jsx` (NEW) | UI | Form edit semua field + render preview `CascadePlan` + konfirmasi. Glass design system. |
| `src/App.jsx` (MODIFY) | wiring | Tombol Edit (superadmin only), state modal, dispatch ke service, update state lokal setelah sukses. Ekstrak formula invoice lama agar pakai `invoiceTotals.js`. |
| `firestore.rules` (MODIFY) | security | Batasi edit broad SJ ke superadmin; admin_sj dibatasi field operasional. |

### 4.2 Struktur `CascadePlan`

```js
{
  sjId: 'SJ-...',
  sjBefore: { ...SJ lama },
  sjAfter:  { ...SJ baru, denormalisasi sudah dihitung ulang },
  fieldChanges: [ { field: 'rute', before: 'A-B', after: 'A-C' }, ... ],
  impacts: [
    {
      collection: 'transaksi', docId: 'TX-UJ-SJ-123',
      label: 'Transaksi Uang Jalan',
      changes: [ { field: 'nominal', before: 150000, after: 200000 }, ... ],
      severity: 'finance',      // 'finance' | 'info'
      op: 'update' | 'create' | 'softDelete'
    },
    { collection: 'invoice', docId: 'INV-9', label: 'Invoice INV-9 (terinvoice)',
      changes: [...], severity: 'finance', op: 'update' }
  ],
  warnings: [
    'SJ ini sudah masuk Invoice INV-9. Mengedit akan mengubah total tagihan.',
    'Gaji supir untuk periode ini akan ikut berubah.'
  ]
}
```

## 5. Aturan Cascade per kategori field

**A. Identity** (`nomorSJ`, `tanggalSJ`):
- `nomorSJ` → update `keterangan` transaksi UJ; refresh snapshot SJ di invoice.
- `tanggalSJ` → update `tanggal` transaksi UJ; refresh snapshot SJ di invoice (mempengaruhi rentang tanggal Laporan Kas).

**B. Master-linked** (`ruteId`, `supirId`, `truckId`, `materialId`):
- Recompute denormalisasi (`rute`,`uangJalan`,`namaSupir`,`pt`,`nomorPolisi`,`material`,`satuan`) dari master saat ini.
- `ruteId`/`uangJalan` berubah → update `nominal`+`keterangan` transaksi UJ; recompute total invoice (grup rute berubah!); payslip berubah.
- `supirId` → payslip pindah supir (warning).

**C. Operasional** (`qtyIsi`, `qtyBongkar`, `status`, `tglTerkirim`, `quantityLoss`, `abolishPenalty`):
- `qtyBongkar` → recompute `totalQty`/`totalHarga` invoice.
- `status` → `gagal` mengikuti DATA-SIDE LOCK lama ([App.jsx:1471-1500](../../../apps/sj-monitor/src/App.jsx)): uang jalan dianggap 0, transaksi UJ di-soft-delete, `deletedUangJalan` disimpan. Restore kebalikannya.

**Invariant penting:** semua recompute invoice **memanggil `computeInvoiceTotals()` yang sama** dengan jalur pembuatan invoice. Tidak ada formula uang baru ditulis (guardrail keuangan).

## 6. Penegakan Akses & `firestore.rules`

**UI:** Tombol Edit hanya render jika `effectiveRole === 'superadmin'` (pola sama dengan [App.jsx:1994-2019](../../../apps/sj-monitor/src/App.jsx)).

**Rules:** Saat ini `surat_jalan` update diizinkan untuk `isSuperAdmin() || isAdminSJ()` ([firestore.rules:115](../../../apps/sj-monitor/firestore.rules)) — artinya admin_sj bisa mengedit semua field via API. Untuk benar-benar superadmin-only pada full-edit:
- Tambah fungsi `sjOperationalFieldsOnly()` (whitelist: `status`, `tglTerkirim`, `qtyBongkar`, `quantityLoss`, `abolishPenalty`, `bonusAdjustment`, `isActive`, `deletedUangJalan`, `updatedAt`, `updatedBy`, `invoice*`).
- `allow update: if isSuperAdmin() || (isAdminSJ() && sjOperationalFieldsOnly()) || (isAdminInv() && sjInvoiceFieldsOnly())`.
- Konsekuensi: edit field identity/master (`nomorSJ`,`ruteId`,dll) **hanya** superadmin di server.

> ⚠️ **Risiko regresi:** flow `addSJ`/`markTerkirim`/`mark gagal` milik admin_sj harus tetap lolos whitelist. Wajib diverifikasi sebelum deploy. Termasuk dalam Security Guardrails — sudah disetujui user.

Collection cascade lain (`transaksi`,`invoice`,`uang_muka`,`biaya`) sudah mengizinkan superadmin penuh — tidak perlu diubah.

## 7. Konsistensi & Kuota

- **Atomic:** `executeCascadePlan` pakai satu `writeBatch` (maks 500 op; SJ + ~1 transaksi + ≤N invoice + 1 history log → jauh di bawah batas). All-or-nothing → tidak ada state setengah jadi.
- **Kuota write (Spark 20.000/hari):** satu edit ≈ 2–5 write. Aman untuk pemakaian manual superadmin. Tidak ada loop bulk. Sesuai `sj-monitor/CLAUDE.md` write-budget.
- **Sanitasi:** `sanitizeForFirestore()` sebelum semua write.

## 8. Out of Scope (YAGNI)

- Rollback/undo otomatis (audit trail cukup).
- Edit massal banyak SJ sekaligus.
- Mengubah formula harga/uang jalan (hanya menghitung ulang dengan formula eksisting).
- Migrasi data historis.

## 9. Strategi Test

- Unit (Vitest) untuk `invoiceTotals.js`, `sjCascadeHelpers.js`, `computeCascadePlan` — ini inti finansial, wajib bertest.
- `executeCascadePlan` diuji dengan mock `writeBatch`.
- Manual smoke test di staging (`npm run smoketest`) untuk UI & rules.
- Verifikasi regresi rules admin_sj (addSJ/markTerkirim) manual di staging.
```

## 10. Kriteria Selesai

1. `npm test` hijau (termasuk test baru).
2. `npm run lint` 0 error.
3. `npm run build` 0 error.
4. `npm run smoketest` → staging, edit SJ + cascade terverifikasi manual.
5. Edit field identity/master oleh non-superadmin ditolak server (rules).
6. Flow admin_sj lama (buat SJ, mark terkirim, mark gagal) tetap berfungsi.
