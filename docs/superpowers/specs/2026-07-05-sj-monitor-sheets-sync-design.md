# SJ-Monitor → Google Sheets Daily Sync — Design

**Tanggal:** 2026-07-05
**Status:** Disetujui user (brainstorming session)
**Referensi pola:** `scripts/bul-monitor-sync/` (full refresh) dan `scripts/gl-sync/` (test-before-sync)

## 1. Tujuan

Update harian otomatis data operasional sj-monitor (Firebase project `surat-jalan-monitor`) ke satu Google Spreadsheet baru yang didedikasikan untuk sj-monitor, meniru mekanisme yang sudah berjalan untuk BUL-Monitor.

## 2. Keputusan Desain

| Keputusan | Pilihan | Alasan |
|---|---|---|
| Pola sync | **Full refresh nightly** (ala bul-monitor-sync) | Idempoten, tidak ada state yang bisa korup, terbukti berjalan. Upsert incremental (ala gl-sync) ditolak: kompleksitas 5× tanpa kebutuhan nyata (YAGNI). |
| Target | **Spreadsheet baru khusus sj-monitor** | Satu perusahaan = satu spreadsheet. Tidak mencampur data antar-perusahaan. |
| Auth | **Reuse WIF + service account existing** | Kedua workflow BUL sudah berbagi satu identitas; SA baru hanya menambah kerja setup tanpa isolasi nyata (satu repo, satu owner). |
| Runtime | Node.js 20, `@google-cloud/firestore` + `googleapis` | Sama persis dengan kedua sync existing. |
| Test | Row builders dipisah ke modul pure + unit test (`node --test`), dijalankan di workflow sebelum sync | Perbaikan dari bul-monitor-sync yang tanpa test; meniru pola gl-sync. |
| Duplikasi sheet-ops | **Diterima secara sadar** (salinan ke-3, ~150 baris) | gl-sync sudah divergen (upsert); script per-perusahaan berevolusi independen. Ekstraksi shared lib ditunda sampai ada konsumen ke-4. |
| Formula injection | String di-escape sebelum ditulis (`escapeCell`) | `valueInputOption: USER_ENTERED` mengevaluasi string berawalan `=`/`+`/`-`/`@` sebagai formula. Data bebas-teks (keterangan, nama) bisa memicu injeksi. bul-monitor-sync punya kelemahan laten ini; tidak diulang di sini. |

## 3. Struktur File Baru

```
scripts/sj-monitor-sync/
├── index.js                  # Orkestrasi: config, Firestore fetch, sheet ops, main()
├── lib/row-builders.js       # Fungsi pure: normalisasi + doc → baris sheet (testable)
├── test/row-builders.test.js # Unit test (node --test)
├── package.json              # start + test scripts; deps sama dengan bul-monitor-sync
├── package-lock.json
└── README.md                 # Cara run, dry-run, setup manual
.github/workflows/sj-monitor-sync.yml
```

Tidak ada satu pun file di `apps/sj-monitor/` yang berubah — nol risiko ke aplikasi, tidak perlu deploy Firebase Hosting.

## 4. Tab & Pemetaan Kolom

Semua tab bisnis: full refresh (clear `A2:Z100000` → tulis ulang). Filter `isActive !== false && !deletedAt`, tanpa jendela tanggal (spreadsheet memuat semua histori). Angka ditulis sebagai number murni. Timestamp WIB.

| Tab | Koleksi | Kolom |
|---|---|---|
| Surat Jalan | `surat_jalan` | Tanggal SJ, Tanggal Terkirim, Nomor SJ, PT, Supir, Nomor Polisi, Rute, Material, Qty Isi, Qty Bongkar, Qty Loss, Satuan, Uang Jalan (Rp), Status, Status Invoice, Waktu Sync (WIB) |
| Invoice | `invoice` + legacy `invoices` | No. Invoice, Tanggal Invoice, Jumlah SJ, Total Qty, Total Harga (Rp), Total UM (Rp), Total Setelah UM (Rp), Waktu Sync (WIB) |
| Biaya Tambahan | `biaya` | Nomor SJ, Tanggal SJ, PT, Jenis Biaya, Nominal (Rp), Keterangan, Waktu Sync (WIB) |
| Uang Muka | `uang_muka` | Tanggal, Nomor SJ, Jumlah (Rp), Keterangan, Dibuat Oleh, Waktu Sync (WIB) |
| Transaksi | `transaksi` | Tanggal, Tipe, Nominal (Rp), Keterangan, Nomor SJ, PT, Sumber, Waktu Sync (WIB) |
| Armada | `trucks` | Nomor Polisi |
| Supir | `supir` | Nama Supir, PT |
| Rute | `rute` | Nama Rute, Uang Jalan (Rp) |
| Material | `material` | Material, Satuan |
| Tarif Rute | `tarif_rute` | Rute, Uang Jalan (Rp), Berlaku Mulai, Dibuat Pada |
| `_sync_log` | — | Tanggal Run (WIB), Status, jumlah baris per tab, Selesai Pada (WIB). Append-only, tidak pernah di-clear. |

Aturan normalisasi (meniru perilaku aplikasi agar angka spreadsheet = angka di layar):

- **Tanggal SJ**: fallback `tanggalSJ || tglSJ || tgl_sj || tanggal || date` (App.jsx:1675).
- **Invoice merge**: gabung `invoice` + `invoices` per `noInvoice` (trim), versi dengan `updatedAt`/`createdAt` terbaru menang (App.jsx:1726-1744). Fallback `tglInvoice || tanggalInvoice || tgl_invoice`.
- **Biaya → Nomor SJ**: join via `suratJalanId` ke map SJ; fallback tampilkan `suratJalanId` mentah jika SJ tidak ditemukan.
- **Sort**: tab transaksional descending by tanggal; master data ascending by nama (locale `id-ID`).

## 5. Workflow GitHub Actions

- Nama: `SJ-Monitor Sheets Sync`, file `.github/workflows/sj-monitor-sync.yml`.
- Trigger: cron `0 17 * * *` (= 00:00 WIB) + `workflow_dispatch` dengan input boolean `dry_run`.
- `concurrency: group: sj-monitor-sync, cancel-in-progress: false`.
- Steps: checkout → setup Node 20 (cache npm) → auth WIF (`google-github-actions/auth@v2`) → `npm ci` → `npm test` → `node index.js`.
- Env: `FIREBASE_PROJECT_ID` ← secret `SJ_MONITOR_FIREBASE_PROJECT_ID`; `GOOGLE_SPREADSHEET_ID` ← secret `SJ_MONITOR_SPREADSHEET_ID`; `DRY_RUN` ← input dispatch.

## 6. Error Handling & Monitoring

- Kegagalan apa pun → exit 1 → workflow merah → notifikasi email GitHub ke owner repo.
- Idempoten: run berikutnya memperbaiki sendiri; tidak ada recovery state.
- `_sync_log` berfungsi sebagai monitoring in-band: user melihat langsung di spreadsheet kapan sync terakhir sukses dan berapa baris per tab.
- `DRY_RUN=true` membaca Firestore + Sheets tanpa menulis apa pun.

## 7. Keamanan

- **Tanpa key tersimpan**: WIF (OIDC) — GitHub Actions bertukar token, tidak ada service account key di secrets.
- **Least privilege**: SA hanya butuh `roles/datastore.viewer` di `surat-jalan-monitor` + akses Editor pada satu spreadsheet (via share, bukan role project).
- **Formula injection**: semua nilai string melewati `escapeCell` (prefix `'` untuk string berawalan `=`, `+`, `-`, `@`).
- **Read-only terhadap Firestore**: aman terhadap kuota write Spark plan (20k/hari); satu full-read nightly jauh di bawah kuota read 50k/hari.
- **Eksposur data**: spreadsheet berisi data bisnis; kontrol akses = sharing settings spreadsheet (tanggung jawab user, jangan "anyone with link").

## 8. Setup Manual Satu Kali (dilakukan user)

1. Buat Google Spreadsheet baru, catat ID-nya (bagian URL antara `/d/` dan `/edit`).
2. Share spreadsheet ke email service account (sama dengan yang dipakai BUL sync) sebagai **Editor**.
3. Grant `roles/datastore.viewer` ke SA di project `surat-jalan-monitor`:
   `gcloud projects add-iam-policy-binding surat-jalan-monitor --member="serviceAccount:<SA_EMAIL>" --role="roles/datastore.viewer"`
4. Tambah GitHub secrets: `SJ_MONITOR_FIREBASE_PROJECT_ID` = `surat-jalan-monitor`, `SJ_MONITOR_SPREADSHEET_ID` = ID dari langkah 1.
5. Merge PR, lalu jalankan manual dispatch dengan `dry_run=true` untuk verifikasi sebelum run nyata pertama.

## 9. Konsekuensi yang Disadari

- Full refresh menimpa isi tab data tiap malam — **jangan edit manual di dalam tab data**; catatan manual taruh di tab terpisah.
- Data yang di-soft-delete hilang dari spreadsheet pada run berikutnya (konsisten dengan tampilan aplikasi).
- Verifikasi end-to-end (Firestore + Sheets nyata) baru bisa dilakukan setelah setup manual & merge — unit test dan `node --check` memverifikasi logika, dry-run pertama memverifikasi integrasi.
