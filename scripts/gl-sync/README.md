# BUL Accounting GL Sync

Sinkronisasi ini membaca Firestore `bul-accounting` dan menulis ke Google Sheets operasional akuntansi.

## Perubahan utama

- `General Ledger` memakai 16 kolom datar, satu baris per baris jurnal.
- `Nama Akun` diambil dari COA aplikasi, bukan dari `Kode Akun`.
- `Deskripsi` diambil penuh dari `Keterangan *` per baris jurnal.
- Sync harian memakai upsert per `Journal ID`: baris lama jurnal terdampak dihapus, lalu versi terbaru ditulis ulang.
- Jurnal soft deleted tetap muncul di `General Ledger` dengan `Status = Dihapus`.
- Metadata jurnal diulang di setiap baris agar mudah dipakai untuk filter dan pivot.

## Tab yang dikelola

- `General Ledger`
- `Audit Log`
- `_sync_log`
- `Review Jurnal`
- `Trial Balance Bulanan`
- `Laba Rugi Bulanan`
- `Neraca Bulanan`
- `Aging Piutang`
- `Profitabilitas Truck`
- `Daftar Aset`
- `Rekonsiliasi Kas Bank`

## Mode run

Dry run:

```bash
DRY_RUN=true npm start
```

Dry run hanya membaca Firestore dan Google Sheets. Tidak membuat sheet, tidak mengubah header, tidak menghapus baris, tidak append data, dan tidak menulis `_sync_log`.

Full sync:

```bash
FULL_SYNC=true npm start
```

Full sync wajib dipakai saat pertama migrasi dari format `General Ledger` lama 10 kolom ke format baru 16 kolom. Mode ini mengganti seluruh isi `General Ledger`, `Audit Log`, dan tab laporan konsultan, tetapi tidak menghapus histori `_sync_log`.

Sync harian:

```bash
npm start
```

Sync harian mengambil jurnal yang dibuat pada hari WIB sebelumnya dan audit `update/delete` pada hari yang sama. ID jurnal dari dua sumber itu digabung, lalu data jurnal terkini diambil kembali dari Firestore sebelum ditulis ke `General Ledger`.

## Validasi lokal

```bash
npm test
node --check index.js
```

GitHub Actions menjalankan `npm test` sebelum sync nyata. Jika header `General Ledger` masih format lama dan `FULL_SYNC` tidak aktif, sync harian akan berhenti sebelum menulis data.
