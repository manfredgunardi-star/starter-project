# Spec: Performance Overhaul bul-monitor (Bulk Import & Kirim ke Accounting)

**Tanggal:** 2026-07-08
**Scope:** `apps/bul-monitor/` — Opsi C (full: bulk path + listener hygiene + rendering + server-side scoping)
**Prinsip:** Nol perubahan fungsionalitas. Payload Firestore (termasuk `suggestedJournal`) byte-identik. Tidak menyentuh formula uang, firestore.rules, atau auth flow.

## Latar Belakang

Keluhan: saat aksi bulk (import Excel/CSV, bulk kirim SJ/invoice ke bul-accounting), perangkat (laptop/HP) terasa sangat berat.

Skala data production: ±500–2.000 dokumen `bul_surat_jalan`.

### Akar masalah (hasil analisa 2026-07-08)

Empat masalah yang saling menggandakan menghasilkan perilaku O(N²) saat bulk N item:

1. **Hot loop boros round-trip** — `handleBulkKirimSJKeAccounting` (App.jsx:1758) memanggil `kirimUangJalanKeAccounting` per SJ, yang di dalamnya `fetchAccountingTrucks()` + `fetchAccountingKaryawan()` men-download **seluruh** dua koleksi accounting **per item** (integrationService.js:157–160). Kirim 100 SJ = 200 download koleksi penuh. Semua sekuensial (`for...await`).
2. **N tulisan = N render penuh** — tiap `updateSuratJalan` memicu listener full-collection `surat_jalan` (App.jsx:2429) yang merge + normalisasi + sort seluruh koleksi lalu `setState` di root App → render ulang seluruh pohon, per item.
3. **Badai & kebocoran listener** — tiga `useEffect` (App.jsx:2508, 2550, 2596) memasang **satu listener per dokumen** `integration_queue` untuk tiap SJ/invoice/transaksi berstatus `menunggu_review` **atau `terkunci`**, dengan dependency `suratJalanList`/`invoiceList`/`transaksiList` — sehingga tiap update state membongkar-pasang ulang semua listener. SJ `terkunci` diawasi **selamanya** → jumlah listener permanen tumbuh tanpa batas seiring umur aplikasi (sumber "berat" bahkan saat idle).
4. **Rendering mahal** — daftar SJ dirender tanpa pagination (App.jsx:3212); `biayaList.filter()` + `getTotalBiaya()` per kartu per render (App.jsx:3216–3217); callback inline → `React.memo` tak mungkin efektif; listener dobel `surat_jalan` + legacy `suratJalan`; `history_log` full-collection tanpa limit.

### Bug laten yang ikut diperbaiki

- **Import >500 baris gagal total**: `writeBatch` Firestore ber-limit 500 operasi; App.jsx:1278 memasukkan semua baris ke satu batch.
- **Stale closure** pada callback `subscribeIntegrationStatusSJ` (App.jsx:2515): guard `sj.status !== 'terkunci'` membaca nilai saat subscribe, bukan state terkini.
- `fetchPelangganByName` (integrationService.js:126) men-download seluruh `bul_pelanggan` per invoice yang dikirim, padahal data sudah ada di state.

## Desain

### Fase 1 — Jalur Bulk (hot path)

**1a. Prefetch master accounting.** `kirimUangJalanKeAccounting(sj, currentUser, allInvoices, biayaList, prefetched?)` menerima parameter opsional `prefetched: { accountingTrucks, accountingKaryawan }`. Handler bulk fetch sekali sebelum loop dan mengoper hasilnya. Jalur kirim tunggal tidak berubah (fetch sendiri bila `prefetched` tak dioper). Loop kirim antrian tetap per-item (butuh error per SJ) dengan **concurrency terbatas 5** (helper pool sederhana, tanpa dependency baru).

**1b. Update status lokal via writeBatch chunked.** Setelah seluruh kirim antrian selesai, field status (`menunggu_review`, `integrationQueueId`, `sentToAccountingAt/By`) untuk SJ yang **berhasil** ditulis dalam `writeBatch` chunked ≤450 ops. Isi field identik dengan sekarang. Pola sama untuk **bulk batalkan** (update status + deaktivasi transaksi UJ + dokumen history log dalam batch yang sama; konten log per-SJ tidak berubah).

**1c. Bulk kirim invoice.** `kirimInvoiceKeAccounting` menerima `pelangganList` dari state (dioper dari App) sebagai sumber `pelangganData`, menggantikan `getDocs` per invoice. Fallback fetch tetap ada bila list kosong.

**1d. Import Excel/CSV.** `writeBatch` di-chunk per 450 baris untuk semua tipe import (SJ, truck, supir, rute, material, biaya). Transaksi uang jalan hasil import SJ ditulis via batch chunked (bukan `await` per baris). Bila `upsertUangJalanTransaksiForSJ` melakukan read-before-write, data pendukung di-prefetch sekali sebelum menyusun batch. Payload dokumen identik.

### Fase 2 — Higiene Listener

**2a. Satu query listener menggantikan N listener per-dokumen.** Ketiga effect diganti satu `onSnapshot` pada:
```js
query(collection(dbAccounting, 'integration_queue'),
  where('sourceProject', '==', 'bul-monitor'),
  where('status', 'in', ['approved', 'rejected', 'cancelled']))
```
Callback memetakan `docId` (prefix `IQ-UJ-` / `IQ-INV-` / `IQ-TRX-`) ke entitas lokal dan menjalankan rekonsiliasi idempoten yang sama seperti sekarang. State lokal terkini dibaca via `useRef` yang di-sync dari state (bukan closure) — memperbaiki bug stale closure. Effect hanya depend pada `authReady`/`firebaseUser`; tidak pernah resubscribe karena perubahan list. SJ `terkunci` tidak lagi punya listener sendiri.

*Prasyarat (dikerjakan user secara manual sebelum implementasi Fase 2a — Opsi B, 2026-07-08):*
- **Rules: sudah cukup, tidak perlu diubah.** `firestore.rules` bul-accounting baris 123, `match /integration_queue/{docId}`, sudah punya `allow read: if isAdminOrAbove() || isBridgeAccount();`. Di Firestore Rules, `read` adalah singkatan dari `get` + `list` — jadi akun bridge sudah diizinkan melakukan query koleksi, bukan cuma baca per-dokumen. Poin ini semula salah diasumsikan butuh perubahan rules; setelah membaca file aslinya, tidak ada perubahan yang diperlukan.
- **Index: mungkin dibutuhkan, dibuat manual oleh user via Firebase Console** (bukan oleh Claude, karena ini perubahan infra production tanpa staging untuk bul-accounting):
  1. Buka [Firebase Console](https://console.firebase.google.com/) → pilih project bul-accounting → **Firestore Database** → tab **Indexes** → **Composite** → **Add index**.
  2. Collection ID: `integration_queue`.
  3. Fields to index: `sourceProject` — Ascending, lalu `status` — Ascending.
  4. Query scope: **Collection**.
  5. Klik **Create**. Status akan "Building" selama beberapa menit lalu berubah jadi "Enabled".
  - Index bersifat aditif dan tidak mengubah keamanan/data — aman dibuat kapan saja, termasuk sebelum kode yang memakainya di-deploy.
  - Alternatif tanpa langkah manual di atas: jalankan dulu kode fase 2a di lingkungan dev/staging; jika Firestore memang butuh index ini, akan muncul error `FAILED_PRECONDITION` di console browser yang menyertakan **link langsung** untuk auto-membuat index persis yang dibutuhkan — tinggal klik link tersebut. Kedua jalur menghasilkan index yang sama.
- Fallback bila index/rules ternyata bermasalah di lapangan: pertahankan listener per-dokumen TETAPI (i) hanya untuk status `menunggu_review` (bukan `terkunci`), (ii) key resubscribe berupa string ID ter-join yang stabil, bukan referensi array. Ini saja sudah menghapus kebocoran listener permanen dan churn resubscribe.

**2b. Listener legacy `suratJalan` kondisional.** Saat pemasangan subscription, satu kali `getDocs(query(collection(db, C('suratJalan')), limit(1)))`; jika kosong → listener legacy tidak dipasang (log info). Jika berisi → tetap dipasang seperti sekarang; migrasi data menjadi tugas terpisah di luar spec ini. Tidak ada data dihapus.

**2c. `history_log` dibatasi server-side.** Listener menjadi `query(orderBy('timestamp','desc'), limit(300))` + tombol "Muat lebih banyak" (fetch `getDocs` dengan `startAfter`, append ke state). Penulisan audit trail tidak berubah. Catatan: dokumen tanpa field `timestamp` tidak akan muncul di query ber-`orderBy` — verifikasi dulu bahwa semua dokumen history_log punya `timestamp`; bila ada yang tidak, gunakan fallback limit tanpa orderBy + sort klien.

**2d. Listener lain tetap full-collection** (`transaksi`, `biaya`, `invoices`, master data, `users`): dibutuhkan untuk agregasi keuangan dan ukurannya wajar pada skala ini. Didokumentasikan sebagai keputusan sadar, bukan kelalaian.

### Fase 3 — Rendering

- **Pagination daftar SJ** 10 item/halaman, mengikuti pola sj-monitor; reset ke halaman 1 saat `filter` berubah. Perhitungan agregat (StatCard, `pendingReviewCount`, eligible bulk) tetap dari list penuh — hanya render kartu yang dipaginasi.
- **`biayaBySJ`**: `useMemo` group-by `suratJalanId` atas `biayaList`; kartu menerima `biayaBySJ[sj.id] ?? EMPTY_ARRAY` (konstanta modul) dan total dari peta yang sama. Menghapus filter O(kartu×biaya) per render.
- **`React.memo(SuratJalanCard)`** + semua handler kartu via `useCallback`; `getStatusColor`/`getStatusIcon` dipindah ke module scope (pure).
- **Derived state → `useMemo`**: `filteredSuratJalan`, `eligibleInView`, `selectedInView`, `eligibleBatalInView`, dst.
- **`xlsx` dynamic import**: `await import('xlsx')` di handler import/export; keluar dari bundle utama. (Web Worker untuk parsing ditunda — YAGNI pada ukuran file saat ini.)

### Ketentuan lintas fase — Error handling & edge case

(Berlaku untuk Fase 1–3, bukan fase implementasi terpisah.)

- Partial failure bulk kirim: daftar nomor SJ gagal tetap dilaporkan; batch status hanya memuat yang sukses; bila commit batch status gagal, laporkan bahwa antrian terkirim tapi status lokal belum diperbarui (idempoten: kirim ulang aman karena `upsertQueueDoc` menolak dokumen `approved`).
- Bridge auth putus di tengah bulk: hentikan sisa antrian, laporkan hitungan berhasil/gagal.
- Race approve-akuntan saat bulk berjalan: rekonsiliasi idempoten dengan guard state terkini (ref).
- Import: chunk gagal dilaporkan per rentang baris; chunk lain tetap ter-commit (perilaku partial import didokumentasikan di pesan hasil).

## Validasi

1. `cd apps/bul-monitor && npm run build` — wajib lolos, nol error.
2. E2E render-fingerprint (teknik baseline==after yang dipakai pada dekomposisi U1–U11): view read-only (daftar SJ halaman 1, Keuangan, Invoice) harus identik sebelum vs sesudah, dengan catatan daftar SJ kini terpaginasi (fingerprint diambil per halaman).
3. Review diff memastikan payload dokumen Firestore identik (field & nilai) — khususnya `suggestedJournal`, transaksi uang jalan, history log.
4. Smoke test manual oleh user: import kecil (<20 baris), bulk kirim 2–3 SJ dummy, verifikasi transisi status setelah approve/reject dari bul-accounting.

## Urutan Implementasi & PR

| Fase | Isi | PR |
|---|---|---|
| 1 | Bulk path (1a–1d) | PR terpisah |
| 2 | Listener hygiene (2a–2c) | PR terpisah (2a bergantung verifikasi rules/index) |
| 3 | Rendering (pagination, memo, dynamic import) | PR terpisah |

Tiap PR: build pass + fingerprint check + review user. Tidak ada auto-merge, tidak ada deploy oleh Claude (bul-monitor tidak punya staging; deploy production oleh user).

## Di Luar Scope

- Migrasi/penghapusan data koleksi legacy `bul_suratJalan`.
- Perubahan `firestore.rules` (perlu persetujuan terpisah bila 2a membutuhkannya).
- Web Worker untuk parsing XLSX.
- Dekomposisi lanjutan App.jsx (jalur terpisah via monolith-refactor).
- Perubahan apa pun pada logika jurnal/COA/nominal.

## Implementation Status

Diimplementasikan 2026-07-08 via 14 task (lihat `docs/superpowers/plans/2026-07-08-bul-monitor-performance-overhaul.md`), dieksekusi dengan subagent-driven-development (implementer + spec-compliance review + code-quality review per task, semua di branch `claude/jolly-poitras-324c15`). Ketiga fase (bulk path, listener hygiene, rendering) selesai:

- **Fase 1** (Task 1–7): prefetch master data sebelum loop bulk kirim, concurrency-limited pool (max 5), chunked batch write untuk status update bulk kirim SJ, extract `buildSJStatusPatch` + batch penuh untuk bulk batalkan (status + transaksi + history log dalam satu commit, dengan `onChunkCommitted` callback agar state lokal ter-update per-chunk bukan hanya di akhir), `pelangganList` dari state untuk bulk kirim invoice, chunking semua 6 writeBatch import, dan batch auto-transaksi uang jalan saat import SJ.
- **Fase 2** (Task 8–10): satu query listener (`subscribeIntegrationQueueUpdates`) menggantikan N listener per-dokumen, dengan idempotency guard baru di cabang `rejected` (wajib karena listener persisten me-replay histori saat attach). Fase 2a prerequisite (index composite) via **Opsi B** — user membuat manual via Firebase Console, tidak ada perubahan `firestore.rules` (rule `allow read` sudah mencakup `list`). Listener legacy `bul_suratJalan` kini kondisional (probe sekali, skip jika kosong). Listener `history_log` dibatasi 300 terbaru + `loadMoreHistoryLog` (infrastruktur siap, belum ada UI yang memakainya — dicatat sebagai tracked follow-up).
- **Fase 3** (Task 11–14): pagination SJ list 10/halaman (dengan bulk-select tetap beroperasi di seluruh filtered set, bukan hanya halaman aktif), memoisasi lookup biaya per SJ + hoist status helper ke module scope, `React.memo` pada `SuratJalanCard` (dicatat sebagai belum efektif — parent masih mengoper handler yang bukan `useCallback`, didokumentasikan inline, bukan blocker karena halaman dibatasi 10 kartu), `useMemo`/`useCallback` pada derived eligibility/selection list, dynamic import `xlsx` (mengurangi main bundle ~277KB) dengan error handling untuk kegagalan load chunk.

Setiap task melalui audit dua-tahap (spec-compliance lalu code-quality) sebelum lanjut; tiga bug nyata ditemukan & diperbaiki selama proses (stale closure di `updateSuratJalan` yang bisa membalikkan state SJ live ke snapshot lama, history_log ID dobel-hitung yang bisa divergen antar 3 lokasi, tombol pagination "Sebelumnya" yang membaca `sjPage` mentah alih-alih nilai clamped). Dua item follow-up berseverity rendah dicatat sebagai task terpisah (bukan blocker): staleness `currentUser` di `updateSuratJalan` (hanya mempengaruhi atribusi audit, bukan data), dan listener `history_log` yang menimpa halaman "load more" saat ada tulisan baru (belum berefek karena belum ada UI konsumen).

Build (`npm run build`) hijau di setiap task. Verifikasi manual end-to-end (login staging + approve/reject sungguhan dari bul-accounting) belum dilakukan dalam sesi ini — deployment/smoke test staging tetap tanggung jawab user sesuai CLAUDE.md.
