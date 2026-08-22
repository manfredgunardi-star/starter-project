# Design: No. Jurnal Display — Jurnal Umum (bul-accounting)

**Date:** 2026-08-22
**App:** `apps/bul-accounting`
**Status:** Approved

## Problem

`JurnalPage` (tampilan Jurnal Umum) tidak menampilkan identifier per-jurnal di layar. Export Excel (`exportUtils.js:10`) sudah menampilkan kolom "No. Jurnal" berisi `j.id.slice(0, 8)` (potongan Firestore document ID), tapi nilai yang sama tidak pernah muncul di UI on-screen, sehingga user tidak bisa mencocokkan baris di layar dengan baris di file Excel yang mereka export.

## Non-Goals

- Tidak membuat skema penomoran jurnal baru (mis. sequential `JU-2026-08-0001`). Firestore doc ID tetap satu-satunya sumber identitas.
- Tidak mengubah `saveJournal`, `updateJournal`, `batchImportJournals`, atau titik penulisan jurnal lain (`PenjualanPage.jsx`, `AsetPage.jsx`, `integrationUtils.js`, `JournalEntryForm.jsx`). Tidak ada field Firestore baru.
- Tidak memperbaiki `importRef` yang saat ini direkam saat import CSV tapi tidak pernah ditampilkan (temuan terpisah, di luar scope — kandidat task lain jika diperlukan).

## Design

### 1. Badge "No. Jurnal" — `JournalList.jsx`

Di header card tiap jurnal (sebaris dengan badge tanggal & jenis jurnal, sekitar baris 67-75), tambah badge baru:

- Teks: `#{j.id.slice(0, 8)}`, font monospace, style badge netral (rounded-full, text-xs, warna gray — beda dari badge jenis jurnal yang pakai brand color, supaya tidak bersaing visual).
- `onClick`: `navigator.clipboard.writeText(j.id)` — menyalin ID **penuh** (20 karakter), bukan potongannya.
- Feedback salin: state lokal `copiedId` di komponen, tampilkan teks kecil "✓ Disalin" di sebelah badge selama ~1.5 detik lalu hilang otomatis (`setTimeout`). Tidak pakai library toast baru — tidak ada sistem toast yang sudah ada di app ini.

### 2. Searchable — `JurnalPage.jsx`

Di kondisi filter pencarian (baris 280-287), tambahkan `j.id?.toLowerCase().includes(q)` ke kondisi `||` yang sudah ada (description, keterangan, accountCode). User bisa ketik potongan ID dari file Excel untuk langsung menemukan jurnal itu di layar.

### 3. Konsistensi format

Format badge (`id.slice(0,8)`) harus identik dengan kolom "No. Jurnal" di `exportUtils.js:10` — tidak diubah, hanya dicerminkan ke UI.

## Data Flow

`getJournals()` (`accounting.js:112`) sudah mengembalikan `{ id: d.id, ...d.data() }` untuk setiap jurnal — `j.id` sudah tersedia di state `journals` tanpa fetch tambahan.

## Testing

- Manual smoke test di dev server: tambah/edit jurnal manual → badge No. Jurnal muncul di list, cocok dengan ID di Firestore console; ketik potongan ID di kotak cari → jurnal yang sesuai muncul; klik badge → clipboard berisi ID 20 karakter penuh, indikator "✓ Disalin" muncul lalu hilang.
- Tidak ada test otomatis existing untuk `JournalList.jsx` — tidak perlu update test suite (tidak ada file test untuk komponen ini saat ini).

## Risk

Sangat rendah. Perubahan murni presentational + satu kondisi filter tambahan. Tidak menyentuh financial logic, schema Firestore, RBAC, atau audit trail.
