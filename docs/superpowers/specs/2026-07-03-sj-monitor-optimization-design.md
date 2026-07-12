# Design: Optimasi sj-monitor — Quick Wins → Jaring Pengaman → Refactor Layer Data

**Tanggal:** 2026-07-03
**Status:** Disetujui user (urutan Fase A → B → C; diet data Firestore ditunda)
**Prinsip:** Tanpa perubahan fungsionalitas. Tanpa menyentuh logika finansial, firestore.rules, atau auth.

## 1. Konteks & Tujuan

Audit arsitektur proaktif atas `apps/sj-monitor`. Gejala nyata yang dilaporkan user:
**pengembangan makin sulit** — setiap perubahan berisiko merusak fitur lain. Performa
dan kuota Firestore belum jadi masalah hari ini, tapi dipetakan sebagai risiko masa depan.

**Tujuan:** menurunkan risiko dan biaya setiap perubahan kode (maintainability), plus
memetik quick wins performa yang murah — tanpa mengubah perilaku aplikasi.

**Non-goals (ditunda, keputusan terpisah):**
- Diet data Firestore (window query 12→3 bulan, lazy subscription per tab, offline
  persistence) — mengubah perilaku data yang tampil; butuh keputusan produk. Ditunda
  sampai ada sinyal kuota nyata.
- Konsolidasi koleksi invoice ganda (`invoice` + `invoices`) — butuh migrasi data
  production; guardrail ASK.
- Persistensi/pembacaan balik `historyLog` dari Firestore (saat ini append lokal saja,
  App.jsx:159) — perubahan perilaku, bukan refactor.

## 2. Arsitektur Saat Ini (hasil reverse-engineering)

- `SuratJalanMonitor` di `src/App.jsx` (4.198 baris) merangkap 5 peran: gerbang auth,
  layer data, router tab (rantai ternary `activeTab`, App.jsx:1912–2052), ±35 handler
  CRUD, dan 3 komponen besar inline (`SettingsManagement` :2534, `UsersManagement`
  :2937, `Modal` :3067 ±1.100 baris).
- **11 listener Firestore aktif serentak sejak login**, terlepas dari tab yang dibuka:
  6 koleksi transaksional window 12 bulan (App.jsx:1691–1792: `surat_jalan`, `biaya`,
  `invoice`, `invoices` legacy, `uang_muka`, `transaksi`) + 5 master data tanpa window
  (`src/hooks/useMasterData.js`: `trucks`, `supir`, `rute`, `material`, `tarif_rute`).
- Alur data satu arah: `onSnapshot` → `useState` di App.jsx → props drilling ke
  pages/components. Tidak ada context/store. Pages sudah code-split `React.lazy`.
- Jalur tulis: handler di App.jsx → `firestoreService.js` (`upsertItemToFirestore`,
  `softDeleteItemInFirestore`) + mutasi state lokal manual.

## 3. Temuan Kritis

| # | Temuan | Bukti | Dampak |
|---|---|---|---|
| K1 | God component App.jsx — semua domain bertetangga di satu file, tanpa test | App.jsx:86–4197 | Akar "pengembangan makin sulit"; blast radius tiap edit besar |
| K2 | Pola state ganda tak konsisten: mutasi manual + timpaan onSnapshot; `addTruck` optimistic+rollback (:265) vs `addSupir` persist-first (:328) | App.jsx:265–384 | Pabrik bug halus — bug isActive ter-revert (PR #53, #55) lahir dari pola ini |
| K3 | Duplikasi: CRUD master data 4× hampir identik (±350 baris); normalisasi+filter `isActive/deletedAt`+sort disalin di tiap subscription; merge invoice ganda di setiap snapshot | App.jsx:265–530, :1671–1792 | Perbaikan harus diulang 4×; mudah lupa satu salinan |
| K4 | Setiap login membaca 12 bulan × 6 koleksi + seluruh master data; tanpa offline persistence | App.jsx:66 (`getQueryStartISO`), useMasterData.js | Biaya baca tumbuh linear dgn volume data; risiko jebol kuota Spark (50rb read/hari) di masa depan |
| K5a | `xlsx` (±400KB) masuk bundle utama: App.jsx → `RejectionReport.jsx:4` → `rejectionReportExport.js:1` static import | src/utils/rejectionReportExport.js | Bundle awal membengkak padahal xlsx hanya perlu saat klik export |
| K5b | PWA service worker mati (`selfDestroying: true`) sejak investigasi kuota write Mei 2026; root cause (auto-reconcile) sudah di-disable tapi SW tak dinyalakan lagi | vite.config.js:12 | Offline capability yang sudah dibangun tidak aktif |

## 4. Desain Solusi — Tiga Fase

### Fase A — Quick Wins (risiko kecil, hasil cepat)

1. **Lazy-load xlsx di rejectionReportExport.js**: ubah `import * as XLSX from 'xlsx'`
   menjadi `await import('xlsx')` di dalam fungsi export (pola yang sama sudah dipakai
   `src/utils/excel.js:6`). Verifikasi: `npm run build`, cek `dist/` bahwa chunk xlsx
   terpisah dari bundle utama.
2. **Nyalakan kembali PWA service worker**: set `selfDestroying: false` di
   vite.config.js. Prasyarat: konfirmasi eksplisit user bahwa investigasi kuota write
   selesai (auto-reconcile tetap `false`). Jika user ragu, item ini di-skip.
3. **Audit ukuran chunk**: laporkan ukuran per-chunk hasil build sebagai baseline.

### Fase B — Jaring Pengaman (prasyarat Fase C)

1. **Perluas ESLint** dari `src/utils/ + src/services/` ke seluruh `src/`
   (eslint.config.js + script `lint` di package.json). Perbaiki hanya error yang
   trivial/mekanis; error yang butuh perubahan perilaku dicatat, tidak diperbaiki diam-diam.
2. **E2E golden-flow fingerprint**: skrip render-only terhadap emulator
   (`npm run emulator` + data `emulator-data/`) yang meng-capture fingerprint halaman
   utama (jumlah kartu SJ, teks StatSummary, hash HTML) sebelum/sesudah refactor —
   teknik yang sama yang berhasil dipakai pada dekomposisi bul-monitor U1–U11.
   Baseline di-capture SEBELUM Fase C dimulai.

### Fase C — Refactor Layer Data & Dekomposisi App.jsx (inti)

Prinsip per langkah: **satu unit per PR**, ekstraksi byte-identik bila memungkinkan,
validasi build + test + fingerprint E2E + smoke test staging, lalu review user.

Urutan ekstraksi (dari risiko terendah):

1. **C1 — Komponen inline keluar dari App.jsx** (murni pemindahan kode):
   `SettingsManagement` → `src/components/SettingsManagement.jsx`,
   `UsersManagement` → `src/components/UsersManagement.jsx`,
   `Modal` → `src/components/Modal.jsx`. Tidak mengubah props/perilaku.
2. **C2 — Factory CRUD master data**: satu `createMasterDataHandlers(entity)`
   menggantikan 4 salinan add/update/delete/activate (truck/supir/rute/material).
   Pola state diseragamkan ke **snapshot-as-source-of-truth**: handler menulis ke
   Firestore saja; state list diperbarui oleh `onSnapshot` di `useMasterData`
   (menghilangkan mutasi ganda K2). Catatan: ini perubahan perilaku *internal timing*
   (UI update menunggu echo snapshot, biasanya <1 detik) — disepakati bukan perubahan
   fungsionalitas, tapi diverifikasi manual di staging.
3. **C3 — Hooks data per domain**: pindahkan 6 subscription + normalisasi dari App.jsx
   ke `src/hooks/useSuratJalanData.js`, `useInvoiceData.js` (termasuk merge legacy),
   `useTransaksiData.js`, `useBiayaData.js`, `useUangMukaData.js`. Helper normalisasi
   + filter aktif dipusatkan di `src/utils/firestoreNormalize.js` dengan unit test.
   Window query 12 bulan TIDAK diubah.
4. **C4 — Handler domain keluar dari App.jsx**: kelompokkan handler SJ/invoice/uang
   muka/transaksi ke modul per domain (mis. `src/services/sjActions.js`) — hanya
   pemindahan; logika finansial (perhitungan uang muka, invoice, penalty) dipindah
   verbatim, tidak diedit. Target akhir: App.jsx ≈ shell routing + wiring ±300–500 baris.

**Yang secara eksplisit TIDAK dilakukan di Fase C:** mengubah formula finansial,
mengubah skema/field Firestore, mengubah window query, mengubah firestore.rules,
menghapus koleksi legacy.

## 5. Verifikasi & Kriteria Sukses

Setiap PR: `npm test` (semua pass) + `npm run lint` (0 error) + `npm run build`
(0 error) + fingerprint E2E match baseline + `npm run smoketest` ke staging
(https://sj-monitor-staging.web.app), lalu user review sebelum merge. Tidak ada
deploy production oleh Claude.

Kriteria sukses keseluruhan:
- App.jsx < 600 baris; tidak ada komponen inline; tidak ada subscription langsung di App.jsx.
- Nol duplikasi CRUD master data; satu pola state (snapshot-as-source-of-truth).
- Bundle utama tidak lagi memuat xlsx.
- Fingerprint E2E identik sebelum vs sesudah untuk semua halaman utama.

## 6. Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| Refactor diam-diam mengubah perilaku tulis | Snapshot-as-source-of-truth diverifikasi manual di staging per entitas; logika finansial dipindah verbatim |
| E2E fingerprint tidak menangkap regresi jalur tulis | Tes tulis manual di staging (data staging terpisah dari production) untuk C2–C4 |
| SW dinyalakan lagi memicu masalah kuota lama | Hanya dengan konfirmasi user; auto-reconcile tetap disabled; monitor usage console |
| Scope creep ke Opsi 2 / migrasi invoice | Dinyatakan non-goal; butuh keputusan user terpisah |
