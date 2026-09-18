# BUL — Aplikasi Operasional + Akuntansi Baru (Supabase)

**Tanggal:** 2026-09-18
**Status:** Disetujui user (brainstorming 2026-09-17/18). Bagian yang tidak ditanyakan satu per satu ditandai **[default]**. User boleh mengoreksinya sebelum eksekusi.
**Menggantikan:** `apps/bul-monitor` + `apps/bul-accounting` (Firebase), setelah sub-proyek 3 (cutover).

---

## 1. Latar belakang

Semua transaksi di bul-monitor dan bul-accounting diketik ulang dari file Google Drive (rekap Excel, kwitansi).
Masalah yang berulang punya tiga akar:
- tulisan non-atomik dari browser;
- dua project Firebase yang dijembatani antrean;
- input ganda dari Drive.

Contoh masalahnya: invoice ganda SJP/022A, jurnal yatim di halaman Biaya, selisih piutang bruto/net Rp 515 juta, dan 54 SJ yang tidak pernah diinput.

## 2. Keputusan user (mengikat)

| # | Keputusan |
|---|---|
| K1 | Aplikasi baru **menggantikan Excel** sebagai tempat input. Drive diimpor sekali sebagai riwayat. |
| K2 | Pengguna: owner + 1–3 staf kantor, pembagian akses sederhana. |
| K3 | **Satu aplikasi, dua modul** (Operasional + Akuntansi), **satu database**. Setiap aksi operasional memposting jurnalnya di transaksi database yang sama. Tidak ada antrean/approval yang menahan posting. Koreksi = batal + jurnal pembalik. |
| K4 | Semua lini: **SJP** (pasir), **SJT** (tanah/clay), **SJS** (sodium). Model sama (jasa angkut per rute); beda hanya satuan. |
| K5 | Harga dari **tarif master** per pelanggan × rute × material dengan **tanggal berlaku**; tarif dipilih menurut tanggal SJ. |
| K6 | Field "PT" di supir lama **dibuang**. |
| K7 | Uang jalan (UJ) diberikan pelanggan langsung ke supir — **tidak ada mutasi kas**. UJ **diakui sebagai biaya saat invoice terbit**. Piutang = Sub Total bruto − UJ. Pendapatan = bruto. |
| K8 | Upah supir **per ritase**, aturan menjadi master data yang diisi user. Upah **diakui biaya + hutang saat SJ selesai**. |
| K9 | Pajak: **PPh final UMKM PP 55, 0,5% dari Sub Total bruto**, dipotong pelanggan saat membayar. Tarif/status disimpan sebagai pengaturan bertanggal; ada pemantau omzet vs batas Rp 4,8 miliar. |
| K10 | Semua biaya perusahaan dicatat. |
| K11 | Saldo awal 31-12-2025 diambil dari laporan akuntan/sistem sebelum 2026. Riwayat 2026 diimpor penuh (sub-proyek 2). |
| K12 | COA dasar = COA bul-accounting (`apps/bul-accounting/src/data/chartOfAccounts.js`) + akun kustom Firestore (diekspor user). Ditambah 6251 Beban PPh Final UMKM. |
| K13 | Stack: **Supabase Free** (project baru "bul", org "Manfred's Organization") + frontend **Cloudflare Pages**. Logika tulis = **Postgres RPC atomik**; browser tidak punya hak tulis tabel. |
| K14 | erp-acc-control ditinggalkan; dihapus user sendiri. |

## 3. Dekomposisi

| Sub-proyek | Isi | Rencana |
|---|---|---|
| **1a** | Fondasi, master data, COA + aturan posting, SJ, invoice, pembayaran, kas/bank, mesin jurnal + jurnal manual dasar, saldo awal, laporan dasar, frontend, backup | `plans/2026-09-18-bul-1a-database.md` + `plans/2026-09-18-bul-1a-web.md` |
| 1b | Jurnal berulang/template, tutup buku tahunan, rekonsiliasi bank, hutang supplier, aset & penyusutan truk | spec terpisah |
| 2 | Importir riwayat Drive 2026 — memakai RPC yang sama | spec terpisah |
| 3 | Cutover & pensiun Firebase (dieksekusi user) | spec terpisah |

## 4. Arsitektur

```
Browser (React 19 + Vite 8 + antd 6)  ── Cloudflare Pages
  baca: select tabel/view (RLS: hanya pengguna aktif)
  tulis: HANYA supabase.rpc(...)
        ▼
Supabase project "bul"
  schema public   : tabel, view (security_invoker), RPC publik (security definer, search_path='')
  schema internal : helper (wajib_peran, posting_jurnal, balik_jurnal, nomor_berikut, catat_audit) — tidak terekspos
        ▲
GitHub Actions malam: pg_dump → enkripsi → Google Drive (backup + cegah auto-pause 7 hari)
```

Aturan teknis:
- `internal.terapkan_hak_akses()` dipanggil di akhir setiap migrasi. Efeknya:
  - RLS aktif di semua tabel;
  - `authenticated` hanya punya `SELECT`;
  - `anon` tidak punya akses apa pun;
  - fungsi di `public` hanya bisa dieksekusi `authenticated`.
- Setiap RPC tulis memanggil `internal.wajib_peran(...)`. Fungsi ini secara eksplisit menolak `auth.uid()` yang NULL dan profil nonaktif (pelajaran dari celah NULL-bypass di ERP-ACC).
- Uang disimpan sebagai `numeric(18,2)`, qty sebagai `numeric(12,3)`. Tidak ada float.
- Jurnal **tidak bisa diubah atau dihapus** (dijaga trigger). Keseimbangan debit/kredit dijaga constraint trigger yang ditunda sampai commit.
- Nomor dokumen dibuat oleh `internal.nomor_berikut(kunci)` secara atomik.

## 5. Peran **[default]**

| Peran | Hak |
|---|---|
| `owner` | Semua, termasuk pengguna, COA, pengaturan posting/pajak, kunci periode, saldo awal |
| `keuangan` | Pelanggan, tarif, aturan upah, invoice, pembayaran, kas/bank, jurnal manual, laporan |
| `operasional` | Master operasional (pelanggan, rute, uang jalan rute, material, truk, supir), surat jalan |
| `viewer` | Baca saja |

Alur pengguna baru:
1. Owner membuat pengguna di dashboard Supabase Auth.
2. Trigger membuat profil `viewer` dalam keadaan nonaktif.
3. Owner mengaktifkan dan memberi peran lewat layar Pengguna.

Owner pertama di-bootstrap dengan satu perintah SQL (lihat runbook).

## 6. Model data (ringkas)

- **Master:**
  - `lini` (seed SJP/SJT/SJS);
  - `material` (per lini, dengan satuan);
  - `pelanggan` (dengan flag `pemotong_pph`);
  - `rute` dan `uang_jalan_rute` (bertanggal);
  - `truk`, `supir`;
  - `tarif` (bertanggal);
  - `aturan_upah`: rute/material opsional, basis `per_sj` atau `per_satuan`, bertanggal; aturan paling spesifik yang menang.
- **Akuntansi:** `akun`, `pengaturan_posting` (kunci → akun), `pengaturan_pajak` (bertanggal), `kunci_periode`, `jurnal`, `jurnal_baris` (dimensi: lini, truk, supir, pelanggan, rute).
- **Operasional:**
  - `surat_jalan`: status `berangkat` → `selesai` atau `batal`; nomor unik per lini di antara SJ yang tidak batal;
  - `invoice` + `invoice_baris`: satu SJ hanya boleh ada di satu invoice aktif; nomor unik di antara invoice yang terbit;
  - `pembayaran` + `pembayaran_alokasi`;
  - `transaksi_kas` + `transaksi_kas_baris`.
- `audit_log` mencatat setiap RPC tulis.

## 7. Aturan posting

Akun diambil dari `pengaturan_posting`. Kode dalam kurung adalah default.

| Peristiwa | Jurnal |
|---|---|
| SJ selesai (upah > 0) | Dr Beban Upah Sopir (5130) / Cr Hutang Upah Sopir (2121, dimensi supir) |
| Invoice terbit | Dr Piutang (1121) = total akhir; per SJ: Dr Beban Uang Jalan (5150) = UJ, Cr Pendapatan (4100) = qty × harga |
| Pembayaran | Dr Kas/Bank = diterima; Dr Beban PPh Final (6251) = PPh dipotong; Cr Piutang per invoice = alokasi |
| Kas keluar | Dr akun baris / Cr kas. Kas masuk kebalikannya. Transfer: Dr tujuan / Cr asal |
| Bayar upah supir | Kas keluar dengan baris akun Hutang Upah (wajib dimensi supir) |
| Saldo awal | Satu jurnal `saldo_awal` bertanggal 31-12-2025. Piutang lama per invoice dicatat sebagai invoice `saldo_awal` tanpa jurnal |
| Batal dokumen apa pun | Jurnal pembalik (debit↔kredit), dengan tanggal batal ≥ tanggal dokumen |

**[default]** Pembulatan:
- Jumlah per baris invoice = `round(qty × harga, 2)`.
- Saran PPh = `round(subtotal × tarif, 0)`, hanya bila PP 55 aktif dan pelanggan adalah pemotong.
- Kesesuaian pembulatan ini dengan kwitansi historis diverifikasi di sub-proyek 2.

## 8. Laporan (1a)

- Saldo akun dan buku besar.
- Neraca per tanggal. Laba berjalan dan laba belum ditutup ikut dihitung supaya neraca seimbang tanpa proses closing.
- Laba-rugi per periode.
- Laba per dimensi (truk/supir/pelanggan/rute/lini).
- Umur piutang.
- Hutang upah per supir.
- Omzet tahunan vs batas PP 55.

## 9. Penanganan error & pengujian

- **Kode error RPC:**
  - `42501` akses ditolak;
  - `P0001` aturan bisnis;
  - `P0002` data tidak ditemukan;
  - `23505` duplikat;
  - `23514` jurnal tidak seimbang atau cek gagal.

  Frontend memetakan kode-kode ini ke pesan Indonesia; pesan `P0001` ditampilkan apa adanya.
- **Uji database:** Vitest + `pg` terhadap Supabase lokal (`127.0.0.1:54322`). RPC dipanggil sebagai pengguna berperan tertentu (`set local role authenticated` + `request.jwt.claims`). Constraint tertunda dipaksa dijalankan dengan `set constraints all immediate`.
- **Uji frontend:** Vitest + Testing Library untuk helper dan komponen kunci; `npm run build` wajib lulus.
- **Uji gerbang keamanan:** berbasis katalog (memeriksa semua tabel dan fungsi), dijalankan di akhir fase DB.

## 10. Batas & larangan

- Tidak ada deploy produksi oleh agen. Migrasi ke project Supabase produksi hanya dijalankan setelah user menyetujui per batch.
- Aplikasi lama tidak disentuh sampai sub-proyek 3.
- Tidak ada Edge Functions, upload file, akses mobile supir, maupun notifikasi di 1a.
