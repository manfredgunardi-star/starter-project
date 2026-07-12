# Design: BUL-Accounting General Ledger Upsert and Consultant Sheets

## Objective

Perbaiki sinkronisasi BUL-Accounting ke Google Sheets agar:

- `Nama Akun` menampilkan nama akun, bukan kode akun.
- `Deskripsi` sepenuhnya menggunakan `line.keterangan` atau field **Keterangan \*** per baris jurnal.
- data General Ledger lama diperbaiki melalui satu kali `FULL_SYNC`.
- sinkronisasi harian melakukan upsert jurnal baru, diedit, dan dihapus.
- jurnal soft delete tetap terlihat dengan status `Dihapus`.
- seluruh informasi jurnal diulang pada setiap baris agar mudah difilter dan digunakan dalam pivot table.
- tersedia tab analisis tambahan untuk pekerjaan konsultan akuntansi.

## Scope

Perubahan berada pada sinkronisasi server-side di `scripts/gl-sync/` dan workflow GitHub Actions terkait. Web app dan struktur dokumen Firestore tidak diubah.

Tidak ada perubahan terhadap:

- logika debit/kredit atau formula uang pada web app;
- struktur Chart of Accounts;
- aturan pajak;
- Firestore rules, autentikasi, atau approval flow;
- data transaksi yang tersimpan di Firestore.

## General Ledger Schema

General Ledger menjadi tabel datar tanpa baris separator. Setiap baris jurnal memuat:

| Kolom | Sumber |
|---|---|
| Tanggal | `journal.date` |
| Journal ID | ID Firestore lengkap |
| No. Jurnal | 8 karakter pertama ID untuk tampilan |
| Urutan Baris | indeks baris jurnal mulai dari 1 |
| Jenis Jurnal | `journal.type` |
| Deskripsi | `line.keterangan` |
| Truck | `line.truckId`, fallback `journal.truckId`, fallback `-` |
| Kode Akun | `line.accountCode` |
| Nama Akun | lookup gabungan COA bawaan dan collection `coa` |
| Debit (Rp) | `line.debit` |
| Kredit (Rp) | `line.credit` |
| Status | `Aktif` atau `Dihapus` |
| Dibuat Oleh | `journal.createdBy` |
| Dibuat Pada | `journal.createdAt` dalam WIB |
| Terakhir Diubah | `journal.updatedAt` atau `journal.deletedAt` dalam WIB |
| Waktu Sync (WIB) | waktu sinkronisasi |

Jika kode akun tidak ditemukan, `Nama Akun` menjadi `[Akun tidak ditemukan: <kode>]` agar masalah master data mudah terlihat.

## Account Lookup

Nama akun dibangun dari dua sumber:

1. COA bawaan pada `apps/bul-accounting/src/data/chartOfAccounts.js`.
2. Collection Firestore `coa` untuk akun custom yang tidak berstatus `deleted`.

COA custom mengambil prioritas jika kode yang sama ditemukan. Akun yang inactive tetap dapat dikenali namanya karena jurnal historis mungkin menggunakannya.

## Incremental Upsert

Sinkronisasi harian menentukan jurnal terdampak dari:

- jurnal yang `createdAt` berada pada rentang kemarin WIB;
- `audit_log` action `update` atau `delete` pada rentang kemarin WIB.

ID jurnal dideduplikasi, lalu dokumen jurnal terbaru diambil dari Firestore. Upsert membaca kolom `Journal ID` pada General Ledger, menghapus seluruh baris lama milik jurnal terdampak menggunakan Google Sheets row deletion, kemudian menambahkan representasi terbaru jurnal tersebut.

Posisi baris tidak disimpan pada sheet indeks sehingga proses tetap benar walaupun pengguna mengurutkan General Ledger. Penghapusan baris dilakukan dari indeks terbesar ke terkecil untuk mencegah pergeseran posisi.

`FULL_SYNC` tetap tersedia untuk migrasi awal dan pemulihan. Mode ini membersihkan General Ledger lalu menulis ulang seluruh jurnal historis menggunakan schema baru.

Jika sinkronisasi harian menemukan header General Ledger versi lama, proses berhenti dengan pesan yang meminta operator menjalankan `FULL_SYNC`. Ini mencegah campuran schema lama dan baru.

## Soft Delete

Jurnal dengan `status === "deleted"` tetap ditulis dengan nilai `Status = Dihapus`. Nilai debit dan kredit dipertahankan sebagai jejak historis, tetapi tab laporan konsultan hanya menghitung jurnal berstatus `posted`.

## Consultant Sheets

Tab berikut dibuat sebagai full refresh setiap run. Full refresh dipilih untuk tab turunan karena seluruh nilainya dihitung ulang dari kondisi Firestore terkini dan volume data saat ini kecil.

### Review Jurnal

Satu baris per jurnal bermasalah, dengan flag:

- jurnal tidak seimbang;
- kode akun tidak ditemukan;
- deskripsi baris kosong;
- tidak memiliki minimal dua baris;
- jurnal berstatus dihapus;
- potensi duplikat berdasarkan tanggal, deskripsi baris, akun, dan nominal.

### Trial Balance Bulanan

Satu baris per bulan dan akun:

- bulan;
- kode dan nama akun;
- saldo normal;
- saldo awal;
- mutasi debit;
- mutasi kredit;
- saldo akhir.

### Laba Rugi Bulanan

Ringkasan bulanan per akun pendapatan dan beban, termasuk kelompok akun dan nilai bulan berjalan.

### Neraca Bulanan

Saldo akhir bulanan per akun aset, kewajiban, dan ekuitas.

### Aging Piutang

Satu baris per invoice dengan:

- nomor dan tanggal invoice;
- pelanggan;
- nilai invoice;
- total pembayaran;
- sisa piutang;
- umur piutang;
- bucket `Belum Jatuh Tempo`, `1-30`, `31-60`, `61-90`, atau `>90 hari`;
- status invoice.

### Profitabilitas Truck

Ringkasan pendapatan, biaya, dan laba/rugi per truck berdasarkan journal line. Jurnal tanpa truck dikelompokkan sebagai `Tanpa Truck`.

### Daftar Aset

Full refresh collection `assets`, termasuk harga perolehan, penyusutan per bulan, estimasi akumulasi penyusutan dari jurnal, dan estimasi nilai buku.

### Rekonsiliasi Kas Bank

Mutasi per akun kas/bank dengan tanggal, Journal ID, deskripsi baris, debit, kredit, dan saldo berjalan. Tab ini membantu pemeriksaan tetapi tidak menandai transaksi sebagai sudah direkonsiliasi karena web app belum memiliki field rekonsiliasi.

## Error Handling and Safety

- `DRY_RUN=true` tidak boleh menulis, membersihkan, menghapus baris, atau memperbarui header pada Google Sheets.
- Header schema lama pada daily sync menghasilkan error yang jelas.
- `FULL_SYNC` adalah satu-satunya mode yang boleh membersihkan seluruh data General Ledger.
- Upsert gagal secara keseluruhan jika penghapusan baris Google Sheets gagal; jurnal baru tidak ditambahkan setelah kegagalan tersebut.
- Tab konsultan hanya menggunakan jurnal `posted` untuk angka laporan.
- Audit Log tetap append-only pada daily sync dan ditulis ulang pada `FULL_SYNC` seperti perilaku saat ini.

## Verification

Pengujian otomatis memakai Node.js built-in test runner dan mock Firestore/Google Sheets:

- lookup nama akun bawaan/custom/fallback;
- row builder General Ledger datar;
- deteksi jurnal baru/diubah/dihapus;
- perhitungan row deletion descending;
- larangan write pada dry run;
- full sync dan daily upsert;
- seluruh builder tab konsultan;
- keseimbangan total debit/kredit General Ledger.

Verifikasi akhir mencakup:

- `npm test` pada `scripts/gl-sync`;
- `node --check` untuk seluruh file JavaScript sinkronisasi;
- dry-run mock end-to-end;
- audit diff terhadap desain dan implementation plan.

## Rollout

1. Merge perubahan script dan workflow tanpa menjalankan production sync secara manual.
2. Jalankan workflow manual dengan `dry_run=true` dan `full_sync=true`.
3. Tinjau jumlah jurnal, baris, akun tak ditemukan, serta total debit/kredit.
4. Jalankan workflow manual dengan `full_sync=true` untuk migrasi schema historis.
5. Biarkan cron harian melanjutkan incremental upsert.

Production full sync tetap merupakan tindakan operator; implementasi ini tidak menjalankan atau men-deploy workflow production.
