# Komisi Pengurus, Tipe Rute, dan Format Tampilan Rute — Desain

**Tanggal:** 2026-09-23
**Status:** Disetujui user (brainstorming 2026-09-23). Bagian yang tidak ditanyakan satu per satu ditandai **[default]**.
**Konteks:** Lanjutan fase-1a BUL (`docs/superpowers/specs/2026-09-18-bul-aplikasi-baru-design.md`), setelah user melakukan uji manual dan menemukan 4 kebutuhan tambahan. Spec ini menangani 3 dari 4 (format tampilan rute, aturan komisi pengurus + tipe rute); butir bulk import dan Aset Tetap/Pembelian sudah tercakup di sub-proyek 1b/2 yang sudah direncanakan. Perhitungan Bonus disepakati satu spec dengan dokumen ini tapi **fase implementasi terpisah** (lihat §6).

## 1. Latar belakang

Setelah mengisi master data dan menerbitkan invoice pertama secara manual, user melaporkan 4 hal. Tiga di antaranya dicakup di sini:

1. Tampilan rute di semua layar (MasterData, SJ, Invoice) hanya menampilkan `Nama`, padahal nama rute saja tidak cukup informatif — perlu menampilkan `[Nama], [Asal] - [Tujuan]`.
2. Belum ada mekanisme untuk menghitung komisi **Pengurus** — staf koordinator supir yang bukan supir itu sendiri — berdasarkan **Tipe Rute** (pengelompokan rute berdasarkan jarak: Dekat/Sedang/Jauh) dan **Tarif** per Tipe Rute.
3. Belum ada mekanisme perhitungan **Bonus** (mis. 3 rit dalam 1 hari → bonus Rp 30.000) untuk Supir maupun Pengurus.

## 2. Keputusan user (mengikat)

| # | Keputusan |
|---|---|
| D1 | Pengurus adalah master data baru, terpisah dari Supir — satu staf yang mengoordinasikan supir, bukan supir itu sendiri. |
| D2 | Saat ini hanya ada 1 Pengurus aktif. Semua SJ dihitung untuk Pengurus itu. Kalau tepat 1 Pengurus aktif, `pengurus_id` pada SJ **diisi otomatis oleh RPC** — tidak ada field yang perlu diisi user di form SJ. |
| D3 | Tipe Rute dikelompokkan berdasarkan **jarak** (Dekat/Sedang/Jauh) — nilai bebas diisi user, bukan enum tetap. |
| D4 | Komisi Pengurus dihitung berdasarkan Tipe Rute dari rute SJ: nominal flat per SJ, ditentukan oleh Tipe Rute rute tersebut. |
| D5 | Komisi diakui sebagai biaya + hutang **saat SJ selesai** — sama seperti upah supir (K8 di spec fase-1a). |
| D6 | Kalau rute SJ belum punya Tipe Rute, atau Tipe Rute-nya belum punya Aturan Komisi yang berlaku pada tanggal SJ selesai — **komisi dilewati (skip), SJ tetap bisa diselesaikan seperti biasa**. Ini beda dari upah supir yang memblokir penyelesaian SJ kalau tidak ada aturan; alasannya: rute-rute lama yang sudah dipakai hari-hari ini belum punya Tipe Rute, dan menyalakan fitur ini tidak boleh mengganggu alur kerja operasional yang sudah berjalan. |
| D7 | Tidak ada input manual komisi per SJ (beda dari upah yang punya `p_upah` override) — user tidak meminta kapabilitas ini; kalau dibutuhkan nanti, itu perubahan kecil terpisah. |
| D8 | Bonus (Supir & Pengurus, berbasis rit harian) dipicu otomatis setiap SJ selesai. Satu spec dengan dokumen ini, tapi **fase implementasi terpisah** — semantik tier (menumpuk vs mengganti) dan perilaku pembalikan belum diputuskan, akan dibahas di brainstorming sendiri sebelum plan fase Bonus ditulis. |

## 3. Skema data (Bagian A)

Tabel baru (skema `public`, mengikuti pola `supir`/`aturan_upah` yang sudah ada):

- **`pengurus`**: `id uuid pk`, `nama text not null`, `telepon text not null default ''`, `aktif boolean not null default true`. Identik struktur dengan `supir`.
- **`tipe_rute`**: `id uuid pk`, `nama text not null unique`, `aktif boolean not null default true`.
- **`rute`**: tambah kolom `tipe_rute_id uuid references public.tipe_rute (id)` — **nullable**, supaya rute lama tidak wajib diisi langsung (selaras D6).
- **`aturan_komisi`**: `id uuid pk`, `nama text not null`, `tipe_rute_id uuid not null references public.tipe_rute (id)` (**wajib**, beda dari `aturan_upah.rute_id` yang opsional — karena komisi memang didefinisikan per Tipe Rute, bukan "kosong = semua"), `berlaku_mulai date not null`, `nominal numeric(18,2) not null check (nominal >= 0)`, `aktif boolean not null default true`. Index unik partial `(tipe_rute_id, berlaku_mulai) where aktif`, meniru `aturan_upah_unik`.
- **`surat_jalan`**: tambah kolom `pengurus_id uuid references public.pengurus (id)` — nullable, diisi otomatis oleh `buat_sj` kalau tepat 1 pengurus aktif (D2).
- **`jurnal_baris`**: tambah kolom `pengurus_id uuid references public.pengurus (id)` — dimensi baru sejajar `supir_id`/`truk_id`/dst.
- **`akun`**: `5180 Komisi Ritase/Dispatcher` **sudah ada** (seed lama, `apps/bul-accounting/src/data/chartOfAccounts.js:109` dan sudah di-porting ke `20260918000300_akuntansi_inti.sql`) — dipakai langsung, tidak perlu insert baru. `2125 Hutang Komisi Pengurus` — akun **baru**, kode kosong pertama setelah `2124` (grup `2120 Hutang Operasional`).
- **`pengaturan_posting`**: constraint `kunci in (...)` ditambah dua nilai: `'beban_komisi_pengurus'` (→ `5180`), `'hutang_komisi_pengurus'` (→ `2125`).

## 4. Perilaku & posting (Bagian B)

**Lookup**: fungsi baru `public.komisi_berlaku(p_tipe_rute_id uuid, p_tanggal date) returns numeric`, meniru persis `upah_berlaku` — cari `aturan_komisi` aktif dengan `tipe_rute_id` cocok dan `berlaku_mulai <= tanggal`, ambil yang `berlaku_mulai` paling baru. `null` kalau tidak ada yang cocok atau `p_tipe_rute_id` itu sendiri `null`.

**Integrasi di `selesaikan_sj`**: setelah blok upah, tambahkan:
```
v_tipe_rute_id := (select tipe_rute_id from public.rute where id = v_sj.rute_id);
v_komisi := public.komisi_berlaku(v_tipe_rute_id, v_sj.tanggal);
```
Kalau `v_komisi` bernilai `null` atau `0` → **dilewati**, tidak ada baris jurnal komisi, tidak ada error (D6). Kalau `v_komisi > 0` → ditambahkan sebagai **baris tambahan pada jurnal yang sama** dengan upah (satu dokumen `jurnal`, bukan dokumen terpisah — lebih natural karena lahir dari peristiwa yang sama dan tetap seimbang sebagai satu kesatuan):
```
Dr Beban Komisi Pengurus (5180) / Cr Hutang Komisi Pengurus (2125)
```
dengan dimensi `lini_kode, truk_id, pelanggan_id, rute_id` sama seperti baris upah, ditambah `pengurus_id = v_sj.pengurus_id`.

**Perubahan pada infrastruktur posting yang sudah ada** (dampak penting, bukan penambahan murni):
- `internal.posting_jurnal` membangun `insert into jurnal_baris (...)` dengan **daftar kolom eksplisit** (bukan generik dari jsonb) — harus ditambah `pengurus_id` ke daftar kolom INSERT dan `nullif(v_b ->> 'pengurus_id', '')::uuid` ke daftar VALUES.
- `internal.balik_jurnal` membangun jsonb baris pembalik dengan `jsonb_build_object(...)` yang juga eksplisit per kolom — harus ditambah `'pengurus_id', b.pengurus_id` supaya jurnal pembalik tetap membawa dimensi pengurus (penting untuk `v_hutang_komisi_pengurus` tetap akurat setelah SJ dibatalkan).

**Auto-isi `pengurus_id` di `buat_sj`**: tidak ada parameter baru dari frontend. Di dalam RPC:
```
select id into v_pengurus_id from public.pengurus where aktif;
-- assign hanya kalau query di atas mengembalikan TEPAT SATU baris (bukan 0, bukan >1)
```
Kalau 0 atau >1 pengurus aktif, `pengurus_id` dibiarkan `null` pada SJ tersebut — komisi untuk SJ itu otomatis dilewati saat selesai (konsisten dengan D6, tidak butuh logika terpisah).

**Laporan baru**: view `v_hutang_komisi_pengurus`, struktur identik `v_hutang_upah_supir` tapi dikelompokkan per `pengurus_id`/`pengurus.nama`, filter `pp.kunci = 'hutang_komisi_pengurus'`. Kartu baru di Beranda, sejajar kartu "Hutang upah supir".

**Pembatalan SJ**: `batalkan_sj` **tidak perlu logika baru** — sudah memanggil `internal.balik_jurnal(v_sj.jurnal_upah_id, ...)` yang otomatis membalik SEMUA baris di jurnal itu, termasuk baris komisi (setelah `balik_jurnal` diperbarui membawa `pengurus_id`).

**Bonus** (garis besar struktural, detail di fase terpisah): dipicu otomatis tiap SJ selesai, menghitung agregat rit harian milik supir/pengurus terkait. Kemungkinan akun baru `5135` (Beban Bonus, slot kosong antara `5130`/`5140`) dan `2126` (Hutang Bonus). Semantik tier dan pembalikan belum diputuskan (D8).

## 5. UI, hak akses (Bagian C)

Layar master data baru, mengikuti pola `KONFIG_MASTER` di `apps/bul/web/src/halaman/master/konfigurasi.js`:

| Menu | Field | Hak | RPC |
|---|---|---|---|
| Pengurus | nama, telepon, aktif | `master.operasional` (`owner`, `operasional`) | `simpan_pengurus` |
| Tipe Rute | nama, aktif | `master.operasional` | `simpan_tipe_rute` |
| Aturan Komisi Pengurus | nama, tipe_rute_id (wajib), berlaku_mulai, nominal, aktif | `tarif.simpan` (`owner`, `keuangan`) — sejajar Aturan Upah karena ini pengaturan tarif | `simpan_aturan_komisi` |

Perubahan layar existing:
- Form **Rute** (`konfigurasi.js`): tambah field `tipe_rute_id` (dropdown, opsional).
- Form **Buat SJ / Ubah SJ**: **tidak ada perubahan field** — `pengurus_id` sepenuhnya diisi otomatis di RPC (lihat §4).
- **Format tampilan rute**: helper baru `formatRute(r)` di `lib/format.js`, menghasilkan `"Nama, Asal - Tujuan"` (atau cuma `"Nama"` kalau asal/tujuan kosong). Dipakai di: kolom "Rute" pada MasterData Rute, Uang Jalan Rute, Tarif, Aturan Upah (`konfigurasi.js`), dropdown pemilihan rute di form SJ (`OPSI_RUTE`/`OPSI.rute`), tabel Surat Jalan (`SuratJalanPage.jsx`), tabel & form Invoice Baru (`InvoiceBaruPage.jsx`), Invoice Detail (`InvoiceDetailPage.jsx`), dan Kwitansi (`Kwitansi.jsx`).

## 6. Pembagian fase

| Fase | Isi | Risiko | Rencana |
|---|---|---|---|
| **Fase 1** | Format tampilan rute (`[Nama], [Asal] - [Tujuan]`) di semua layar. Murni frontend, tanpa migrasi, tanpa RPC baru. | Sangat rendah | `docs/superpowers/plans/2026-09-23-komisi-pengurus-tipe-rute.md` §Fase 1 |
| **Fase 2** | Pengurus + Tipe Rute + Aturan Komisi + posting `selesaikan_sj` + `v_hutang_komisi_pengurus` + Beranda | Sedang — migrasi baru, `internal.posting_jurnal`/`internal.balik_jurnal`/`buat_sj`/`selesaikan_sj` diubah, tapi seluruhnya additive (kolom baru nullable, perilaku lama tidak berubah untuk SJ tanpa Tipe Rute) | `docs/superpowers/plans/2026-09-23-komisi-pengurus-tipe-rute.md` §Fase 2 |
| **Fase 3** (nanti, spec+plan terpisah) | Perhitungan Bonus (Supir & Pengurus, rit harian) | Perlu brainstorming sendiri untuk semantik tier sebelum plan ditulis | belum ditulis |

## 7. Penanganan error

Mengikuti kode error yang sudah baku di spec fase-1a (§9): `P0001` untuk validasi bisnis (mis. nama Pengurus/Tipe Rute kosong), `P0002` untuk data tidak ditemukan (update Pengurus/Tipe Rute/Aturan Komisi dengan id yang tidak ada), `42501` untuk akses ditolak (peran yang salah memanggil RPC), `23505` untuk duplikat (nama Tipe Rute, index unik Aturan Komisi). Tidak ada error baru untuk kasus "aturan komisi tidak ditemukan" — itu sengaja **bukan error** (D6), berbeda dari upah supir.

## 8. Batas & larangan

- Tidak ada input manual komisi per SJ di fase ini (D7).
- Tidak ada perubahan pada alur Pembayaran/Kas — pembayaran hutang komisi pengurus memakai RPC kas/bank yang sudah ada (`akun_kode = '2125'` wajib `pengurus_id`, meniru guard hutang upah di `20260918000800_kas.sql`), tidak butuh RPC baru.
- Fase Bonus (D8) tidak diimplementasikan di plan ini — hanya dicatat sebagai komitmen struktural.
- Tidak ada deploy — semua migrasi dijalankan di Supabase lokal oleh Codex, diverifikasi Claude, dan hanya di-push/di-migrasikan ke produksi setelah persetujuan user (mengikuti aturan fase-1a §10).
