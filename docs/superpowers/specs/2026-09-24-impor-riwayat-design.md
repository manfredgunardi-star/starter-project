# Impor Riwayat 2026 — Design Spec

**Tanggal:** 2026-09-24
**Aplikasi:** `apps/bul` (Supabase + React)
**Sub-proyek:** 2 dari rencana BUL Rebuild — menyusul fase 1a, Komisi Pengurus, dan Bonus.

## Masalah

Pembukuan BUL tertinggal. Seluruh transaksi di `bul-monitor`/`bul-accounting` diketik ulang dari berkas Google Drive, dan hasil ketik ulang itu terbukti cacat: invoice ganda SJP-022, jurnal yatim di halaman Biaya, selisih Rp 515.001.100 antara subledger AR dan buku besar, serta 54 surat jalan yang tidak pernah diinput sama sekali.

Aplikasi baru di `apps/bul` sudah berdiri dengan jurnal yang tidak bisa dihapus dan seluruh tulisan lewat RPC bersertifikat peran. Yang belum ada: cara memasukkan riwayat 2026 ke dalamnya.

## Keputusan yang sudah diambil

| Pertanyaan | Keputusan | Alasan |
|---|---|---|
| Periode | **2026 ke atas saja** | Akuntan punya tutup buku 2025. Saldo awal 31-12-2025 dipakai apa adanya. K11 fase 1a tetap berlaku. |
| Sumber data | **Diisi sendiri oleh user** ke templat yang ditetapkan | Tidak mewarisi cacat Firestore; setiap baris yang masuk sudah diakui benar oleh user. |
| Angka uang | **Diambil apa adanya dari dokumen lama** | Yang ditagih dan dibayar pelanggan adalah fakta sejarah. Menghitung ulang dari tarif akan memproduksi angka yang tidak pernah terjadi. |
| Wadah | **Unggah berkas CSV**, ratusan baris sekali angkat | Mengetik ratusan baris ke form web adalah sumber salah ketik. |
| Cakupan | Master data, surat jalan, kas & biaya | Pilihan user. |
| Invoice & pembayaran | **DI LUAR CAKUPAN** | Keputusan user setelah risikonya dijelaskan: akan ditagih ulang lewat layar Invoice. |
| Arsitektur | **RPC impor atomik** per jenis | Jurnal tidak bisa dihapus. Gagal di tengah tanpa atomisitas meninggalkan jurnal permanen yang hanya bisa dibalik. |

### Akibat dari mengecualikan invoice

Karena invoice 2026 akan diterbitkan ulang lewat `public.terbitkan_invoice` — yang menghitung total dari tabel `tarif` — maka **ketepatan `tarif.csv` menentukan apakah invoice baru menghasilkan angka yang sama dengan yang dulu dikirim ke pelanggan.** Impor tarif bukan kemudahan, melainkan penentu. User sudah diberi tahu dan menegaskan pilihannya.

## Arsitektur

Browser membaca CSV, memeriksa **bentuk** (kolom, tanggal, angka, nilai pilihan) dan mencocokkan nama sebagai peringatan dini, lalu mengirim **seluruh batch tervalidasi** sebagai satu panggilan per jenis:

```
berkas CSV -> dariCsv() -> skema.js (periksa bentuk) -> pratinjau + ringkasan
           -> impor_master()       \
           -> impor_surat_jalan()   >  masing-masing SATU transaksi Postgres
           -> impor_kas()          /
```

Ketiga RPC `security definer set search_path = ''`, dibuka `internal.wajib_peran('owner')`, dan isinya **hanya perulangan tipis di atas fungsi yang sudah ada** — `public.buat_sj`, `public.selesaikan_sj`, `public.catat_kas`, `public.simpan_*`. Tidak ada rumus uang yang ditulis ulang, sehingga jurnal hasil impor identik dengan jurnal dari layar harian.

**Terjemahan nama menjadi UUID terjadi di dalam RPC**, bukan di browser, supaya master yang baru dibuat beberapa baris sebelumnya langsung terlihat dalam transaksi yang sama.

## Format berkas

CSV UTF-8, pemisah `;`, BOM di awal, akhir baris CRLF, koma desimal — mengikuti konvensi `keCsv` di `web/src/lib/csv.js` yang sudah dipakai seluruh ekspor aplikasi, dan sekaligus konvensi bawaan Excel Indonesia.

Nama berkas menentukan jenisnya; urutan unggah tidak penting. Berkas tidak memuat satu pun UUID — semua rujukan memakai nama.

| Berkas | Kolom (`*` wajib) |
|---|---|
| `pelanggan.csv` | `nama*`, `alamat`, `npwp`, `pemotong_pph`, `catatan` |
| `rute.csv` | `nama*`, `asal`, `tujuan`, `tipe_rute` |
| `truk.csv` | `nopol*`, `jenis` |
| `supir.csv` | `nama*`, `telepon` |
| `pengurus.csv` | `nama*`, `telepon` |
| `material.csv` | `lini*`, `nama*`, `satuan*`, `standar_bongkar` |
| `tarif.csv` | `pelanggan*`, `rute*`, `rute_asal`, `rute_tujuan`, `lini*`, `material*`, `berlaku_mulai*`, `harga_satuan*` |
| `uang-jalan.csv` | `rute*`, `rute_asal`, `rute_tujuan`, `berlaku_mulai*`, `nominal*` |
| `aturan-upah.csv` | `nama*`, `rute`, `rute_asal`, `rute_tujuan`, `lini`, `material`, `berlaku_mulai*`, `basis*`, `nominal*` |
| `surat-jalan.csv` | `lini*`, `nomor*`, `tanggal*`, `pelanggan*`, `rute*`, `rute_asal`, `rute_tujuan`, `material*`, `nopol*`, `supir*`, `pengurus`, `qty_muat*`, `uang_jalan*`, `qty_bongkar`, `tanggal_selesai`, `upah`, `keterangan` |
| `kas.csv` | `ref`, `jenis*`, `tanggal*`, `akun_kas*`, `keterangan*`, `akun*`, `jumlah*`, `keterangan_baris`, `lini`, `nopol`, `supir`, `pengurus` |

Catatan kunci alami:

- `rute` dikunci oleh **`(nama, asal, tujuan)`**, bukan nama saja — `rute_nama_key` dihapus oleh migrasi `20260923000200`. `rute_asal`/`rute_tujuan` boleh kosong dan hanya wajib bila nama rute muncul lebih dari sekali; RPC menolak dengan pesan yang menyebutkannya.
- `material` dikunci oleh `(lini_kode, nama)`.
- `standar_bongkar` adalah ambang bonus tonase (`20260924000200:3`). Dikosongkan berarti bonus tonase 2026 tidak pernah menyala untuk material itu.
- `surat_jalan` dikunci oleh `(lini_kode, nomor) where status <> 'batal'`.
- SJ yang dulu batal cukup tidak dimasukkan ke berkas. Tidak ada kolom `status`: status ditentukan dari terisi-tidaknya `tanggal_selesai`.
- `transaksi_kas.nomor` dihasilkan sistem; pengelompokan multi-baris memakai kolom `ref` bebas.

## Perubahan database

**Migrasi baru — butuh persetujuan user, sudah diberikan.**

1. `unique (nama)` pada `public.supir` dan `public.pengurus`. Tanpa ini importir tidak bisa menerjemahkan nama menjadi id secara deterministik.
2. Penolong `internal.wajib_ketemu`, `internal.cari_rute`, `internal.periksa_kiriman`.
3. RPC `public.impor_master`, `public.impor_surat_jalan`, `public.impor_kas`.

**Tidak ada fungsi lama yang diubah.** `buat_sj`, `selesaikan_sj`, `catat_kas`, `simpan_*`, `terbitkan_invoice` tetap persis seperti sekarang berikut seluruh tesnya.

### Tiga risiko yang sudah diidentifikasi

**`statement_timeout`.** Satu `impor_surat_jalan` berisi 500 baris berarti 500 `buat_sj` + 500 `selesaikan_sj`, masing-masing memposting jurnal. Peran `authenticated` di Supabase memakai `statement_timeout` pendek (umumnya 8 detik) dan impor sebesar itu akan melewatinya. Ketiga RPC karena itu dideklarasikan dengan `set statement_timeout = '600s'`.

**`unique` pada nama supir/pengurus gagal bila sudah ada nama kembar** di database tujuan. Di lokal aman. Sebelum diterapkan ke Supabase produksi, nama kembar harus dibereskan user.

**Komisi pengurus tidak bisa diimpor apa adanya, dan bisa hilang total tanpa jejak.** `tipe_rute` dan `aturan_komisi` ada di luar cakupan, tetapi akibatnya tidak langsung terlihat. `selesaikan_sj` tidak punya penimpa komisi seperti `p_upah`; ia selalu menghitung ulang lewat `komisi_berlaku(tipe_rute_id, tanggal)`. Karena kolom `tipe_rute` di `rute.csv` opsional, impor yang mengosongkannya **tetap sukses tanpa satu pun galat** sementara komisi sepanjang periode itu tidak pernah terbentuk. Cacat ini tidak akan terlihat dari laporan mana pun, sebab jurnalnya tidak ada sama sekali — bukan salah angka. Sama seperti `material.standar_bongkar`, yang membuatnya berbahaya adalah kesunyiannya.

User menegaskan pengurus memang menerima komisi sepanjang 2026 dan nominalnya seragam per tipe rute, sehingga `aturan_komisi` cukup dan `selesaikan_sj` tidak perlu diubah.

Audit sesudah Task 3 menemukan dua penyimpangan sunyi lain dari keluarga yang sama, keduanya diverifikasi langsung ke database:

- **`upah` yang dikosongkan diambil dari aturan upah yang berlaku sekarang**, bukan dari kwitansi lama. `impor_surat_jalan` menerjemahkan sel kosong menjadi `null`, dan `selesaikan_sj` lalu menghitung sendiri. Angka yang terposting bukan angka sejarah, dan tidak ada yang menandainya.
- **Surat jalan tanpa `pengurus` tidak menghasilkan baris komisi.** Di produksi pengurus aktif lebih dari satu, jadi `buat_sj` tidak menebak, dan kolom `pengurus` di `surat-jalan.csv` opsional.

Satu kasus lagi bukan risiko melainkan kesalahan: **`qty_bongkar` yang diisi tanpa `tanggal_selesai` terbuang tanpa jejak**, sebab `impor_surat_jalan` hanya memanggil `selesaikan_sj` di dalam cabang bertanggal selesai. Itu ditolak sebagai galat keras di `bacaBerkas`, bukan diperingatkan.

Penjagaan untuk yang tiga sisanya: fungsi murni `peringatanImpor(kiriman, master)` di `halaman/impor/skema.js` menghitung lima hal — rute tanpa tipe rute, tipe rute tanpa aturan komisi aktif, surat jalan pada rute lama yang tipenya kosong, surat jalan selesai yang upahnya kosong, dan surat jalan tanpa pengurus — lalu layar impor menampilkannya sebagai peringatan yang harus diakui user sebelum tombol impor bisa ditekan. Logikanya ditaruh di fungsi murni supaya bisa diuji terpisah dari komponen.

## Penanganan galat

Sifat atomik berarti RPC hanya sempat melaporkan **satu** galat sebelum transaksi batal. Agar user tidak memperbaiki satu per satu dalam puluhan putaran, browser melakukan pemeriksaan dini: bentuk berkas **dan** pencocokan seluruh nama terhadap gabungan master yang sudah ada plus nama baru dalam kiriman yang sama. Semua masalah dilaporkan sekaligus di layar pratinjau.

Pemeriksaan di RPC tetap menjadi penentu; browser hanya mengurangi penderitaan.

Semua galat RPC memakai `errcode = 'P0001'` sehingga pesannya diteruskan apa adanya ke layar oleh `web/src/lib/errors.js` — tidak ada penanganan galat baru di browser.

## Hak akses

Impor menyentuh master (`operasional`), SJ (`operasional`), dan kas (`keuangan`). Satu-satunya peran yang memegang ketiganya adalah `owner`, jadi menu dan RPC sama-sama dibatasi ke `owner`. Layar menyembunyikan; RPC menegakkan.

## Pengujian

**Database** (`db/tests/impor.test.mjs`) — pembuktian terpenting:

- Angka berkas menang atas master: tarif/upah/uang jalan master sengaja dipasang berbeda, lalu dibuktikan nilai di `surat_jalan` sama dengan berkas.
- **Atomisitas**: lima baris dengan baris ke-4 cacat ditolak, lalu dari koneksi terpisah dibuktikan `surat_jalan` kosong dan `jurnal` tidak bertambah satu pun.
- Impor master diulang tidak menggandakan.
- Penjagaan `catat_kas` (dimensi wajib untuk hutang upah/komisi) tetap berlaku lewat jalur impor.
- `statement_timeout` benar-benar terpasang — dibaca dari `pg_proc.proconfig`.

**Web** — `dariCsv` diuji terhadap BOM, CRLF, pemisah `;`, field berkutip berisi `;` dan baris baru, kutip ganda berlipat, serta koma desimal. `skema.js` diuji terhadap kolom hilang, nilai tidak valid, pengumpulan seluruh galat sekaligus, pengelompokan `ref`, dan pembuat templat.

**Di luar tes — tidak opsional:** jalankan impor sungguhan di browser dengan berkas kecil berisi data nyata, lalu periksa Beranda dan Buku Besar. Hitung ulang total dari tabel mentah dengan SQL berbentuk berbeda. Periksa keseimbangan **per jurnal**, bukan per `sumber_tipe`.

## Keputusan yang masih terbuka

1. **Nama supir/pengurus kembar di produksi.** Migrasi `unique` akan gagal bila ada. User harus memeriksa dan membereskan sebelum penerapan ke produksi.
2. **Fase Bonus belum di-push, belum PR, belum dimigrasikan ke produksi.** Cabang impor bertumpu di atasnya (`codex/bul/bonus` @ `9e40ccf`), jadi keduanya akan masuk bersamaan.
3. **`batalkan_bonus` masih membolehkan pembatalan bonus yang sudah dilunasi** (warisan fase Bonus). Di luar cakupan sub-proyek ini.

## Di luar cakupan

Impor invoice, impor pembayaran, impor jurnal mentah, impor transfer kas, impor aturan komisi/bonus/tipe rute, impor data sebelum 2026, dan perubahan apa pun pada `terbitkan_invoice`.
