# Rekonsiliasi Kas Kecil & Bank BCA Operasional — Maret-Juli 2026

Dokumentasi hasil rekonsiliasi kas/bank PT. Bangun Usaha Lancar (BUL) periode Maret-Juli 2026,
termasuk investigasi dan perbaikan dobel-input jurnal di bul-accounting.web.app. Disusun oleh
Claude (agen AI), diverifikasi manual oleh Manfred Gunardi (direktur).

## Ringkasan

- **Sumber data**: Excel laporan kas kecil bulanan + mutasi rekening BCA (5599 & 7800) dari
  Google Drive, dicocokkan ke ledger yang sudah ada di `data/kas_kecil_ledger.csv` dan
  `data/bank_bca_ledger.csv`.
- **Masalah utama**: 578 transaksi hasil rekonsiliasi diimport ke bul-accounting.web.app, tapi
  aplikasi tidak punya proteksi anti-duplikat pada fitur import CSV — sehingga seluruh batch
  sempat terposting **dua kali** (~567 jurnal dobel, ~Rp1,09 miliar).
- **Temuan tambahan**: dua pola dobel-sumber independen dari masalah di atas, sudah ada sejak
  rekonsiliasi awal:
  1. Penarikan ATM untuk top-up Kas Kecil tercatat dari **dua sisi** (catatan Bank + catatan Kas
     Kecil) → 18 jurnal dobel, Rp75.300.000.
  2. Transfer internal rekening 5599 ↔ 7800 tercatat dari **dua sisi** (rekening pengirim +
     rekening penerima) → 6 jurnal dobel, Rp151.090.000.
  3. 3 duplikat sisa yang lolos dari pemeriksaan otomatis awal karena selisih tanggal/rentang
     tanggal legacy → Rp1.455.778 (lihat `audit-log/03_hapus_duplikat_sisa.csv`).
- **Total jurnal dihapus**: 594 (567 + 18 + 6 + 3).
- **Status final**: 1111 (Kas Kecil) dan 1115 (BCA Operasional 2) terverifikasi sudah sesuai
  target. 1112 (Bank BCA Operasional) terverifikasi cocok 100% terhadap PDF mutasi rekening BCA
  asli (Feb-Jul 2026) setelah mengeluarkan penerimaan CV Tunas Maju yang memang belum diimport
  (di luar cakupan pekerjaan ini — lihat catatan di bawah).

## Metodologi verifikasi

1. Tarik export jurnal lengkap dari bul-accounting.web.app (`jurnal-YYYY-MM-DD-YYYY-MM-DD.xlsx`).
2. Bangun "universe sumber" — daftar transaksi yang seharusnya ada persis satu kali di web app,
   dari `data/kas_kecil_ledger.csv` + `data/bank_bca_ledger.csv`, termasuk baris "akun lawan" saat
   akun lawannya juga akun kas/bank (transfer internal).
3. Cocokkan fingerprint `(tanggal, deskripsi, nominal, kode akun, arah debit/kredit)` antara
   sumber dan web app → kategori: cocok persis / dobel / belum terinput / asing.
4. Untuk verifikasi saldo, bandingkan saldo kumulatif per akun terhadap **PDF mutasi rekening BCA
   asli** (bukan hanya total agregat bulanan dari Google Sheet sync, yang ternyata capped/stale
   untuk data volume besar).

## Pengecualian yang disengaja (bukan bug)

- **Penerimaan CV Tunas Maju** (piutang pelanggan, total Rp777.356.100 Feb-Jul 2026) sengaja
  **belum diimport** — masih menunggu pencocokan kwitansi manual dengan asumsi potongan PPh Final
  0,5%. Karena itu saldo Bank BCA Operasional (1112) di web app akan tetap jauh dari saldo riil
  rekening sampai proses tersebut selesai. Ini SESUAI DESAIN, bukan kesalahan.
- Data 1-6 Maret 2026 di Kas Kecil memakai skema bulk-import lama (1 jurnal per hari, deskripsi
  generik "Transaksi Import dari Excel") — sudah diverifikasi nominal cocok dengan sumber.

## Follow-up / belum selesai

- **13 transaksi "Penambahan Uang Kas Masuk" dkk** di Kas Kecil (~Rp74,5 juta, Maret-Juli) saat
  ini punya akun lawan "Bank BCA Operasional (1112)" yang kemungkinan besar **salah klasifikasi**
  — tidak ada transaksi bank yang cocok di PDF mutasi rekening asli untuk sebagian besar item ini.
  Satu di antaranya (04/05/2026, Rp15.000.000) kemungkinan besar adalah penarikan
  "TRSF E-BANKING DB — ANTONIUS ARI WIBOW" yang saat ini malah tercatat sebagai Piutang Karyawan
  (1181) di `data/bank_bca_ledger.csv`. Perlu direview & direklasifikasi terpisah — **belum
  dieksekusi**, sengaja ditunda per keputusan user (2026-08-22) supaya PR ini bisa fokus ke
  masalah duplikat-import yang sudah tuntas.

## Isi folder

- `data/kas_kecil_ledger.csv` — ledger Kas Kecil hasil rekonsiliasi (sumber kebenaran untuk akun 1111).
- `data/bank_bca_ledger.csv` — ledger Bank BCA (rek 5599 & 7800) hasil rekonsiliasi (sumber kebenaran untuk akun 1112/1115).
- `audit-log/01_hapus_dobel_atm.csv` — 18 jurnal dobel-sumber ATM yang dihapus dari web app.
- `audit-log/02_hapus_dobel_transfer_5599_7800.csv` — 6 jurnal dobel-sumber transfer internal yang dihapus.
- `audit-log/03_hapus_duplikat_sisa.csv` — 3 duplikat sisa (lolos dari filter tanggal awal) yang dihapus.
