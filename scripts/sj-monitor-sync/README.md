# SJ-Monitor Sheets Sync

Sinkronisasi harian membaca Firestore `surat-jalan-monitor` dan menulis ke Google Spreadsheet khusus sj-monitor. Pola full refresh, meniru `scripts/bul-monitor-sync/`.

Spec desain: `docs/superpowers/specs/2026-07-05-sj-monitor-sheets-sync-design.md`

## Tab yang dikelola

`Surat Jalan`, `Invoice`, `Biaya Tambahan`, `Uang Muka`, `Transaksi`, `Armada`, `Supir`, `Rute`, `Material`, `Tarif Rute`, dan `_sync_log` (append-only, tidak pernah di-clear).

Semua tab bisnis ditulis ulang penuh setiap run (clear di bawah header → tulis ulang). **Jangan edit manual isi tab data** — akan tertimpa; taruh catatan/analisis di tab terpisah buatan sendiri.

## Perilaku penting

- Hanya data aktif (`isActive !== false && !deletedAt`), tanpa jendela tanggal.
- Invoice: koleksi `invoice` + legacy `invoices` di-merge per `noInvoice`, versi terbaru menang (meniru aplikasi).
- `tanggalSJ` fallback dari field legacy (`tglSJ`/`tgl_sj`/`tanggal`/`date`).
- Semua string di-escape terhadap formula injection (prefix `'` untuk `=`, `+`, `-`, `@`).
- Firestore hanya dibaca — aman untuk kuota Spark plan.

## Mode run

Dry run (baca saja, tanpa menulis Sheets):

```bash
DRY_RUN=true FIREBASE_PROJECT_ID=surat-jalan-monitor GOOGLE_SPREADSHEET_ID=<ID> npm start
```

Sync nyata:

```bash
FIREBASE_PROJECT_ID=surat-jalan-monitor GOOGLE_SPREADSHEET_ID=<ID> npm start
```

Auth memakai Application Default Credentials — di GitHub Actions di-set oleh `google-github-actions/auth@v2` (WIF); lokal bisa via `gcloud auth application-default login`.

## Validasi lokal

```bash
npm test
node --check index.js
```

GitHub Actions (`.github/workflows/sj-monitor-sync.yml`) menjalankan `npm test` sebelum sync nyata. Jadwal: 00:00 WIB setiap hari; manual dispatch tersedia dengan opsi `dry_run`.

## Setup satu kali (manual)

1. Buat Google Spreadsheet baru, catat ID-nya.
2. Share spreadsheet ke email service account (yang sama dengan BUL sync) sebagai **Editor**.
3. Grant akses baca Firestore ke service account di project sj-monitor:
   ```bash
   gcloud projects add-iam-policy-binding surat-jalan-monitor \
     --member="serviceAccount:<SA_EMAIL>" --role="roles/datastore.viewer"
   ```
4. Tambah GitHub secrets: `SJ_MONITOR_FIREBASE_PROJECT_ID` dan `SJ_MONITOR_SPREADSHEET_ID`.
5. Jalankan workflow manual dengan `dry_run=true` untuk verifikasi, lalu run nyata.
