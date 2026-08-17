# Verifikasi Manual — Invoice CSV Import (bul-monitor)

**Tanggal:** 2026-08-17
**Branch:** `claude/surat-jalan-kwitansi-analysis-18ec03` @ `9f1c376`
**Lingkungan:** dev server lokal Vite di `http://localhost:5175`, terhubung ke Firestore produksi (login superadmin dilakukan sendiri oleh user).
**Task:** Task 7 dari `2026-08-17-bul-monitor-invoice-csv-import.md`

> **Tidak ada satu pun invoice yang disimpan selama verifikasi ini.** Seluruh pengujian berhenti di layar pratinjau, lalu modal ditutup lewat tombol Batal. Angka pada kartu Invoicing dicatat sebelum dan sesudah, dan keduanya identik (lihat Langkah 5).

## Angka Awal (sebelum pengujian)

| Kartu | Nilai |
|---|---|
| Total Invoice | 24 |
| Belum Terinvoice | 371 |
| Sudah Terinvoice | 497 |

Jumlah checkbox Surat Jalan yang tersedia di form: **371** (cocok dengan kartu "Belum Terinvoice").

## Data Surat Jalan yang Dipakai

Diambil apa adanya dari daftar "Belum Terinvoice" di layar:

| Nomor SJ | Rute | Material | Qty Bongkar |
|---|---|---|---|
| 08801 | Kasablanka (Pasir KT-PT. Pionirbeton Industri) | Pasir | 27.736 m3 |
| 08802 | Kasablanka (Pasir KT-PT. Pionirbeton Industri) | Pasir | 27.66 m3 |
| 08803 | Kasablanka (Pasir KT-PT. Pionirbeton Industri) | Pasir | 26.247 m3 |
| 08873 | Tanah Abang (Pasir KT-PT. PionirBeton Industri) | Pasir | 27.66 m3 |
| 08820 | Tanah Abang (Pasir KT-PT. PionirBeton Industri) | Pasir | 26.66 m3 |

## Langkah 1 — Dev server

Dijalankan lewat `preview_start` dengan entri `bul-monitor` di `.claude/launch.json` (port 5175). File `.env` disalin dari checkout utama ke worktree agar konfigurasi Firebase terbaca; file itu gitignored dan tidak ikut ter-commit.

## Langkah 2 — Jalur sukses satu rute — **LULUS**

File: `uji1_satu_rute.csv`

```
Nomor SJ;Harga Jual per Satuan
08801;50000
08802;50000
```

Yang terlihat di layar:

- Banner panel: `2 Surat Jalan terpilih dari CSV · 1 rute`
- Rincian grup: `Pasir — Kasablanka (Pasir KT-PT. Pionirbeton Industri): 2 SJ · 55.40 m3 × Rp 50.000 = Rp 2.769.800`
- `Total dari CSV: Rp 2.769.800`
- Bagian bawah form: `2 Surat Jalan dipilih untuk invoice`, `Total Qty: 55.40 m3`, `Nilai Invoice: Rp 2.769.800`
- Input "Harga Jual per Satuan (Rp/m3)" terisi otomatis `50000`
- Checkbox tercentang: **2 dari 371**

Kecocokan angka: `(27.736 + 27.66) × 50.000 = 2.769.800`. **Nilai Invoice form = Total dari CSV.**

## Langkah 3 — Jalur banyak rute — **LULUS**

File: `uji2_dua_rute.csv`

```
Nomor SJ;Harga Jual per Satuan
08801;50000
08802;50000
08873;60000
08820;60000
```

Yang terlihat di layar:

- Banner panel: `4 Surat Jalan terpilih dari CSV · 2 rute`
- `Pasir — Kasablanka (...): 2 SJ · 55.40 m3 × Rp 50.000 = Rp 2.769.800`
- `Pasir — Tanah Abang (...): 2 SJ · 54.32 m3 × Rp 60.000 = Rp 3.259.200`
- `Total dari CSV: Rp 6.029.000`
- Kotak harga berubah menjadi input per grup: `Harga Jual per Satuan *(Material/rute berbeda — isi per grup)`, dengan nilai input `60000` (Tanah Abang) dan `50000` (Kasablanka)
- `Nilai: Rp 3.259.200` dan `Nilai: Rp 2.769.800` per grup
- `Total Nilai Invoice: Rp 6.029.000`
- Checkbox tercentang: **4**

Kecocokan angka: `2.769.800 + 3.259.200 = 6.029.000`. **Total Nilai Invoice = Total dari CSV.**

## Langkah 4a — Penolakan per baris (SJ palsu) — **LULUS**

File: `uji3_sj_palsu.csv`

```
Nomor SJ;Harga Jual per Satuan
08803;50000
99999;50000
```

Yang terlihat di layar:

- `1 Surat Jalan terpilih dari CSV · 1 rute`
- `Pasir — Kasablanka (...): 1 SJ · 26.25 m3 × Rp 50.000 = Rp 1.312.350`
- `Total dari CSV: Rp 1.312.350`
- Banner penolakan: `1 baris ditolak` → `Baris 3 (99999): Nomor SJ tidak ditemukan di daftar Surat Jalan yang bisa di-invoice. Kemungkinan sudah terinvoice, belum berstatus terkirim, atau salah ketik.`
- Checkbox tercentang: **1**; input harga terisi `50000`

Nomor baris **3** memang benar (baris 1 = header, baris 2 = 08803, baris 3 = 99999) — perbaikan penomoran baris dari Task 3 terbukti bekerja pada file nyata. Kecocokan angka: `26.247 × 50.000 = 1.312.350`.

## Langkah 4b — Harga tidak konsisten (batal seluruh file) — **LULUS**

File: `uji4_harga_konflik.csv`

```
Nomor SJ;Harga Jual per Satuan
08801;50000
08802;55000
```

Alert yang muncul, apa adanya:

> ⛔ Import dibatalkan.
>
> Harga tidak konsisten untuk Pasir — Kasablanka (Pasir KT-PT. Pionirbeton Industri).
>
> SJ 08801: Rp 50.000
> SJ 08802: Rp 55.000
>
> Satu rute hanya boleh punya satu harga per invoice. Perbaiki file lalu import ulang.

Selain itu, yang penting: **nol kebocoran.** Banner hasil di panel kosong kembali, dan pilihan dari import sebelumnya tetap utuh (1 checkbox tercentang, tidak berubah menjadi 2). Tidak ada satu pun baris dari file cacat yang masuk ke form.

## Langkah 5 — Tutup tanpa menyimpan — **LULUS**

Alert ditutup lewat OK, lalu modal ditutup lewat **Batal**. Modal hilang dari DOM (`div.fixed.inset-0` tidak lagi ada).

Angka kartu setelah pengujian:

| Kartu | Sebelum | Sesudah |
|---|---|---|
| Total Invoice | 24 | **24** |
| Belum Terinvoice | 371 | **371** |
| Sudah Terinvoice | 497 | **497** |

Identik. **Nol invoice tersimpan, nol Surat Jalan berubah status.**

## Catatan Tambahan

- Console browser bersih selama seluruh pengujian: tidak ada peringatan React controlled/uncontrolled input, tidak ada error. Ini mengonfirmasi keputusan mengisi `hargaSatuan` dengan string kosong (bukan `null`) saat mode banyak grup.
- Pemilihan file disimulasikan lewat `DataTransfer` + event `change` bawaan browser (dialog file OS tidak bisa dioperasikan dari sisi otomasi). Jalur kode yang dieksekusi setelah itu — `FileReader`, `parseInvoiceCsv`, `onImported`, `setFormData` — sama persis dengan yang berjalan saat operator memilih file secara manual.
- Empat file CSV uji dibuat di direktori scratchpad sesi, di luar repository.
