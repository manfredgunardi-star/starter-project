# Laporan Audit — bul-accounting

**Tanggal:** 2026-06-14
**Cakupan:** apps/bul-accounting/src (domain: audit-trail)
**Catatan:** Audit read-only. Tidak ada kode yang diubah. Temuan finansial wajib minta persetujuan.

---

## Ringkasan Prioritas

| # | Severity | App | Lokasi | Inti masalah |
|---|---|---|---|---|
| 1 | 🟡 Rendah | bul-accounting | `apps/bul-accounting/src/utils/accounting.js:474-476` | `deleteTruck()` menggunakan `deleteDoc` (hard-delete) — melanggar aturan soft-delete untuk data master armada |
| 2 | 🟡 Rendah | bul-accounting | `apps/bul-accounting/src/contexts/AuthContext.jsx:69-73` | `deleteUser()` menggunakan `deleteDoc` pada collection `users` — hard-delete record pengguna |
| 3 | 🟡 Rendah | bul-accounting | `apps/bul-accounting/src/utils/accounting.js` (keseluruhan) | `writeAuditLog` hanya mencakup jurnal; status changes pada `trucks`, `customers`, `suppliers`, `karyawan`, `integration_queue`, dan `purchase_invoices` tidak dicatat ke audit trail |

---

## Temuan Detail

### 🟡 #1 — Hard-delete pada collection `trucks` (Armada)

**File:** `apps/bul-accounting/src/utils/accounting.js:474-476`

**Inti:**
```js
export async function deleteTruck(id) {
  await deleteDoc(doc(db, 'trucks', id))  // ← hard-delete, dokumen hilang permanen
}
```

Customers, suppliers, dan karyawan semuanya menggunakan pola soft-delete (`updateDoc` dengan `status: 'deleted'`), tetapi fungsi `deleteTruck` secara inkonsisten menggunakan `deleteDoc` yang menghapus dokumen secara permanen dari Firestore. Data armada (kendaraan + sopir) termasuk data master bisnis yang penting — sesuai Data Safety Rule #1, penghapusan harus selalu via soft-delete.

**Dampak:** Data armada yang terhapus tidak bisa di-recover. Jika ada jurnal, laporan, atau catatan lain yang mereferensikan `truckId` lama, referensi tersebut menjadi yatim (orphan).

**Rekomendasi:** Ubah `deleteTruck` mengikuti pola `deleteCustomer`:
```js
export async function deleteTruck(id) {
  await updateDoc(doc(db, 'trucks', id), { status: 'deleted', deletedAt: new Date().toISOString() })
}
```
Pastikan `getTrucks()` juga memfilter `status !== 'deleted'`. Tidak menyentuh logika uang — tidak butuh persetujuan finansial, tapi perlu diuji integrasi dengan halaman ArmadaPage.

---

### 🟡 #2 — Hard-delete pada collection `users`

**File:** `apps/bul-accounting/src/contexts/AuthContext.jsx:69-73`

**Inti:**
```js
async function deleteUser(uid) {
  await deleteDoc(doc(db, 'users', uid))
  // Note: actual auth user deletion requires admin SDK (server-side)
  // For now we just remove Firestore record; user won't be able to access
}
```

Collection `users` menyimpan record pengguna sistem (email, nama, role, `createdBy`, `createdAt`). Hard-deleting record ini menghilangkan jejak siapa yang pernah memiliki akses ke sistem — ini relevan untuk audit keamanan dan kepatuhan.

**Dampak:** Tidak ada jejak histori pengguna yang pernah ada. Jika dokumen jurnal menyimpan `createdBy: uid`, dan uid tersebut dihapus, traceability terdegradasi.

**Catatan konteks:** Komentar di kode mengakui keterbatasan ini (Firebase Auth user tidak bisa dihapus tanpa Admin SDK). Risiko bersifat sedang karena fungsi ini hanya bisa dipanggil oleh superadmin (via `PengaturanPage.jsx`), bukan end-user biasa.

**Rekomendasi:** Ganti `deleteDoc` dengan soft-delete (tambah field `status: 'deleted'`, `deletedAt`, `deletedBy`) dan filter `status !== 'deleted'` di `getAllUsers()`. Tidak butuh persetujuan finansial.

---

### 🟡 #3 — Audit trail tidak mencakup status changes non-jurnal

**File:** `apps/bul-accounting/src/utils/accounting.js` (fungsi `writeAuditLog`, baris 25-37)

**Inti:**

`writeAuditLog` ada dan digunakan dengan baik untuk operasi jurnal (create, update, delete di baris 66, 84, 92). Namun, fungsi ini menulis ke `audit_log` dengan field `journalId` — artinya by design hanya untuk entitas `journals`.

Berikut operasi status-changing yang **tidak** meninggalkan jejak audit:

| Operasi | Fungsi | File |
|---|---|---|
| Soft-delete customer | `deleteCustomer()` | `accounting.js:584` |
| Soft-delete supplier | `deleteSupplier()` | `accounting.js:614` |
| Soft-delete karyawan | `deleteKaryawan()` | `accounting.js:702` |
| Hard-delete truck | `deleteTruck()` | `accounting.js:475` |
| Approve integration item | `approveIntegrationItem()` | `integrationUtils.js:128` |
| Reject integration item | `rejectIntegrationItem()` | `integrationUtils.js:150` |
| Cancel integration item | `cancelIntegrationItem()` | `integrationUtils.js:186` |
| Cancel purchase invoice | `BiayaPage.jsx:handleDelete` | `BiayaPage.jsx:282` |
| Cancel sales invoice | `PenjualanPage.jsx:handleDelete` | `PenjualanPage.jsx:349` |

**Dampak:** Jika ada pertanyaan "siapa yang menghapus supplier X?" atau "kapan invoice ini dibatalkan dan oleh siapa?", tidak ada catatan sistematis yang bisa ditelusuri selain Firestore audit log bawaan (jika diaktifkan di Firebase Console). Khusus untuk `integration_queue`, approve/reject/cancel adalah operasi penting bisnis yang seharusnya tercatat.

**Rekomendasi:** Perluas mekanisme audit log agar tidak hanya terikat pada `journals`. Opsi:
1. Buat fungsi `writeGenericAuditLog(collection, docId, action, by, extra)` yang lebih generik.
2. Atau tambahkan panggilan ke `writeAuditLog` (dengan adaptasi field) di setiap fungsi delete/status-change di atas.
3. Prioritas tertinggi: `cancelIntegrationItem`, `approveIntegrationItem`, dan `rejectIntegrationItem` karena menyentuh alur data lintas-sistem (bul-monitor ↔ bul-accounting).

Tidak menyentuh logika keuangan secara langsung — tidak butuh persetujuan finansial.

---

## Checked — PASSED (tidak ada temuan)

**Rule #4 — Soft-delete enforcement (hardDeleteJournal):**
Pemeriksaan terhadap pola `hardDelete` dan `deleteDoc` pada `journals` menunjukkan bahwa `hardDeleteJournal` sudah dihapus dan diganti soft-delete. Komentar di baris 95 mengkonfirmasi ini:
```
// Catatan: fungsi hardDeleteJournal dihapus — melanggar aturan soft-delete (Data Safety Rule #1).
```
Semua delete jurnal melalui `deleteJournal()` yang menggunakan `updateDoc` dengan `status: 'deleted'`.

**Rule #5 — Audit-trail presence (journals):**
Jurnal sudah memiliki `writeAuditLog` pada semua operasi create/update/delete. Pola ini konsisten. Temuan #3 di atas bukan kegagalan rule ini untuk jurnal, melainkan ketiadaan coverage yang sama untuk entitas lain.

---

## Area yang TIDAK diaudit

- Firestore Security Rules (`firestore.rules`) — di luar cakupan static analysis
- Firebase Authentication server-side (Admin SDK tidak digunakan)
- Aturan catalog domain lain (`jurnal`, `arus-kas`, `pajak`, `invoice-payment`, `uang-muka`) — tidak dalam scope `audit-trail`
- Supabase RPC / SQL (bul-accounting menggunakan Firestore, bukan Supabase)
- Data yang sudah ada di Firestore production (tidak bisa diperiksa secara statis)
- Batch import (`batchImportJournals`) — tidak memanggil `writeAuditLog` secara per-jurnal (by design, komentar baris 706-709), perlu pertimbangan terpisah

---

## Rekomendasi langkah berikut (urutan)

1. **Fix `deleteTruck` (Finding #1)** — ganti `deleteDoc` dengan `updateDoc` soft-delete. Ubah juga `getTrucks()` agar filter `status !== 'deleted'`. Ini paling mudah dan konsisten dengan pola yang sudah ada di `deleteCustomer`, `deleteSupplier`, `deleteKaryawan`.

2. **Fix `deleteUser` (Finding #2)** — ganti `deleteDoc` dengan soft-delete di `AuthContext.jsx`. Update `getAllUsers()` untuk filter status. Koordinasikan dengan superadmin untuk validasi UX.

3. **Perluas audit trail ke `integration_queue` (Finding #3, prioritas)** — operasi approve/reject/cancel di `integrationUtils.js` adalah titik paling kritis bisnis yang belum dicatat. Tambahkan `writeGenericAuditLog` atau log minimal ke koleksi `audit_log` dengan field `collection`, `docId`, `action`, `by`, `at`.

4. **Perluas audit trail ke customer/supplier/karyawan delete (Finding #3, sekunder)** — lebih mudah karena strukturnya seragam; cukup tambah `addDoc(collection(db, 'audit_log'), ...)` di `deleteCustomer`, `deleteSupplier`, `deleteKaryawan`.

5. **Jalankan audit domain lain** — setelah audit-trail di-fix, rekomendasikan audit `jurnal` dan `invoice-payment` di bul-accounting untuk coverage yang lebih lengkap.
