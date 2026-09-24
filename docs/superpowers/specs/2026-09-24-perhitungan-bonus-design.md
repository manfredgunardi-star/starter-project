# Perhitungan Bonus Supir & Pengurus — Desain

**Tanggal:** 2026-09-24
**Status:** Disetujui user (brainstorming 2026-09-24). Bagian yang tidak ditanyakan satu per satu ditandai **[default]**.
**Konteks:** Fase 3 dari [spec Komisi Pengurus](2026-09-23-komisi-pengurus-tipe-rute-design.md) §6, yang sengaja menunda semantik tier dan perilaku pembalikan (keputusan D8) ke brainstorming tersendiri. Dokumen ini adalah hasil brainstorming itu.
**Aplikasi:** `apps/bul` (Supabase + React), bukan `apps/bul-monitor`/`apps/bul-accounting` yang Firebase.

---

## 1. Latar belakang

User meminta dua hal dalam satu percakapan: **importir data riwayat** (untuk mengejar ketertinggalan pembukuan) dan **perhitungan bonus**. Keduanya sudah tercatat sebagai pekerjaan terencana — importir sebagai sub-proyek 2 di [spec fase-1a](2026-09-18-bul-aplikasi-baru-design.md) §3, bonus sebagai Fase 3 di spec komisi pengurus §6.

Keduanya **tidak independen**. Bonus diposting dari peristiwa SJ selesai, dan importir riwayat memanggil RPC yang sama. Kalau importir dijalankan lebih dulu, ~10 bulan SJ masuk tanpa jurnal bonus, dan memperbaikinya kemudian berarti posting susulan menembus jurnal yang sengaja dibuat immutable. Karena itu urutannya ditetapkan: **Bonus dulu, Import menyusul** (keputusan user, 2026-09-24). Importir mendapat spec tersendiri.

Empat konsep bonus yang diminta user:

1. Bonus supir berdasarkan jumlah ritasi per hari.
2. Bonus supir berdasarkan muatan bongkar yang melebihi standar (tonase).
3. Bonus supir berdasarkan jumlah ritasi per bulan.
4. Bonus pengurus berdasarkan jumlah ritasi per bulan.

## 2. Keputusan user (mengikat)

| # | Keputusan |
|---|---|
| B1 | **Urutan pekerjaan: Bonus dulu, Import menyusul.** SJ historis yang diimpor kemudian tidak menghasilkan jurnal bonus otomatis (bonus dihitung periodik — lihat B2); importir menjalankan `hitung_bonus` per bulan setelah impor selesai. Tidak ada skrip backfill. |
| B2 | **Bonus dihitung periodik per bulan, bukan dipicu per SJ selesai.** Ini mencabut D8 pada spec komisi pengurus, yang ditulis sebelum bonus bulanan diketahui. Alasan: bonus bulanan tidak diketahui nilainya sampai bulan berakhir, dan impor riwayat bertanggal mundur akan menghasilkan badai jurnal delta bila posting dilakukan per SJ. |
| B3 | **Tanpa tier.** Hanya boleh ada satu aturan aktif per jenis bonus pada satu tanggal berlaku. Ambang 3 rit dengan nominal Rp 30.000: 3 rit → Rp 30.000, 5 rit → tetap Rp 30.000. Tidak ada penumpukan tier, tidak ada kelipatan. |
| B4 | **Standar tonase melekat pada material** — kolom baru `material.standar_bongkar`, nullable. Material tanpa standar → bonus tonase dilewati untuk SJ material itu. |
| B5 | **Bonus tonase flat per SJ**, bukan per ton kelebihan. Standar 20 ton, bongkar 23 ton → nominal penuh; bongkar 25 ton → nominal yang sama. Konsekuensinya kolom `basis` (`per_sj`/`per_satuan` seperti di `aturan_upah`) **tidak diperlukan** — keempat jenis bonus flat. |
| B6 | **Rit dikelompokkan berdasarkan `tanggal_selesai`**, bukan `tanggal` (berangkat). Keanggotaan periode terkunci saat SJ diselesaikan, sehingga bulan yang bonusnya sudah diposting tidak bisa "tumbuh" lagi; tonase pun memang baru diketahui saat bongkar. |
| B7 | **Bonus harian dan bonus bulanan menumpuk penuh.** Supir yang mencapai ambang harian di 10 hari (10 × Rp 30.000) dan juga melewati ambang bulanan (Rp 500.000) menerima Rp 800.000. Tidak ada plafon, tidak ada pengurangan. |
| B8 | **COA: satu pasang akun** — `5135 Bonus Sopir & Pengurus` (grup 5100) dan `2126 Hutang Bonus` (grup 2120). Supir dan pengurus dibedakan lewat dimensi `supir_id` / `pengurus_id` yang sudah ada di `jurnal_baris`, bukan lewat akun terpisah. |

## 3. Temuan: cacat pembayaran komisi pengurus

Ditemukan saat menelusuri jalur pembayaran bonus, dan **wajib diperbaiki sebagai prasyarat** karena bonus punya kebutuhan yang sama persis.

Spec komisi pengurus §8 menyatakan pelunasan `2125 Hutang Komisi Pengurus` cukup memakai RPC kas yang sudah ada dengan `pengurus_id` wajib. Itu tidak pernah terjadi: migrasi `20260923000100_komisi_pengurus.sql` tidak menyentuh modul kas sama sekali. `transaksi_kas_baris` hanya punya dimensi `lini_kode`, `truk_id`, `supir_id` (`20260918000800_kas.sql:31`), dan `catat_kas` hanya meneruskan ketiganya ke jurnal (`:93`).

Akibatnya pembayaran komisi lewat Kas menghasilkan baris jurnal tanpa `pengurus_id`. View `v_hutang_komisi_pengurus` mengelompokkan per `pengurus_id`, jadi pelunasan itu muncul sebagai baris NULL dan **saldo hutang pengurus yang bersangkutan tidak pernah berkurang**.

Perbaikannya masuk sebagai migrasi tersendiri (Fase B0) supaya bisa ditinjau dan dibalik tanpa menyeret fitur Bonus.

## 4. Skema data

**Tabel baru `public.aturan_bonus`** — mengikuti bentuk `aturan_komisi`:

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | `uuid pk` | |
| `nama` | `text not null` | tidak boleh kosong |
| `jenis` | `text not null` | `rit_harian_supir` \| `rit_bulanan_supir` \| `tonase_supir` \| `rit_bulanan_pengurus` |
| `ambang` | `int` | jumlah rit minimum; **wajib NULL** untuk `tonase_supir`, **wajib ≥ 1** untuk jenis lain |
| `nominal` | `numeric(18,2) not null` | ≥ 0, flat |
| `berlaku_mulai` | `date not null` | |
| `aktif` | `boolean not null default true` | |

Index unik parsial `(jenis, berlaku_mulai) where aktif` — inilah yang menegakkan B3 di level database, bukan hanya di UI.

**Perubahan tabel yang sudah ada:**

- `material` + `standar_bongkar numeric(12,3)` nullable, `check (standar_bongkar > 0)` (B4).
- `transaksi_kas_baris` + `pengurus_id uuid references public.pengurus (id)` (§3).
- `jurnal.sumber_tipe` CHECK ditambah nilai `'bonus'`.
- `pengaturan_posting.kunci` CHECK ditambah `'beban_bonus'` dan `'hutang_bonus'`.
- Index baru `surat_jalan (tanggal_selesai, supir_id) where status = 'selesai'` — jalur baca utama `hitung_bonus`; index yang ada hanya menutup `tanggal` (berangkat).

**Akun baru** (B8): `5135 Bonus Sopir & Pengurus` induk `5100`, dan `2126 Hutang Bonus` induk `2120`. Grup 5100 sudah terisi penuh di kelipatan sepuluh (5110–5190), jadi 5135 mengambil celah antara `5130 Upah Sopir` dan `5140 Upah Kernet/Helper`. `2126` adalah slot bebas berikutnya setelah `2125`.

**Pengaturan posting baru:** `beban_bonus` → `5135`, `hutang_bonus` → `2126`.

## 5. Perhitungan

Satu sumber kebenaran: `internal.hitung_bonus_baris(p_periode date)` mengembalikan `(jenis, penerima_jenis, penerima_id, penerima_nama, dasar, jumlah)`. `pratinjau_bonus()` menampilkannya apa adanya; `hitung_bonus()` memposting baris yang sama. Tidak ada dua rumus yang bisa berbeda diam-diam.

Himpunan dasar untuk semua jenis: SJ dengan `status = 'selesai'` dan `tanggal_selesai` di dalam bulan periode. SJ batal tidak pernah ikut terhitung.

Pencarian aturan: `public.bonus_berlaku(p_jenis, p_tanggal)` mengembalikan `(ambang, nominal)` dari aturan aktif dengan `berlaku_mulai <= p_tanggal` terbaru. Fungsi ini **set-returning**: nol baris kalau tidak ada aturan yang cocok, sehingga jenis itu otomatis tidak menyumbang apa pun — tanpa error. Ini pola *skip* yang sama dengan komisi pengurus (D6 pada spec sebelumnya).

| Jenis | Dikelompokkan | Aturan dievaluasi pada | Nilai | `dasar` |
|---|---|---|---|---|
| `rit_harian_supir` | (supir, `tanggal_selesai`) | hari itu | tiap hari dengan rit ≥ ambang → +nominal | jumlah hari |
| `tonase_supir` | per SJ | `tanggal_selesai` SJ itu | tiap SJ dengan `qty_bongkar > material.standar_bongkar` → +nominal | jumlah SJ |
| `rit_bulanan_supir` | supir, sebulan | akhir bulan | total rit ≥ ambang → +nominal sekali | total rit |
| `rit_bulanan_pengurus` | pengurus, sebulan | akhir bulan | total rit ≥ ambang → +nominal sekali | total rit |

Yang harian dan tonase dievaluasi pada tanggal kejadiannya, bukan pada akhir bulan: kalau nominal dinaikkan di tengah bulan, hari sebelum dan sesudah dibayar dengan angkanya masing-masing.

SJ dengan `pengurus_id` NULL (dibuat saat tidak ada tepat satu pengurus aktif — lihat D2 pada spec komisi) tidak ikut dalam hitungan bonus pengurus.

## 6. Posting dan pembalikan

**`public.hitung_bonus(p_periode date) returns uuid`** — peran `owner`/`keuangan`:

1. Tolak `P0001` kalau bulan belum berakhir (`akhir_bulan >= current_date`).
2. Tolak `P0001` kalau bulan itu sudah punya jurnal bonus aktif. Idempotensi dibaca langsung dari `jurnal` (`sumber_tipe = 'bonus'` dan `dibalik_oleh_id is null`) lewat `internal.bonus_terposting(tanggal)` — tidak ada tabel periode tersendiri.
3. Tolak `P0001` kalau totalnya nol. Tidak pernah ada jurnal kosong.
4. Posting **satu jurnal** bertanggal akhir bulan, `sumber_tipe = 'bonus'`, `sumber_id` NULL. Per (penerima × jenis) sepasang baris:
   `Dr 5135 Bonus Sopir & Pengurus / Cr 2126 Hutang Bonus`, dengan dimensi `supir_id` atau `pengurus_id`, dan keterangan yang menyebut jenis, periode, nama penerima, serta dasar hitungnya.

Penguncian periode sudah dijaga `internal.posting_jurnal`, jadi bonus otomatis tertolak di bulan yang sudah dikunci lewat `kunci_periode`. Konsekuensi kerjanya: **hitung bonus sebelum mengunci bulan.**

**`public.batalkan_bonus(p_periode date, p_alasan text, p_tanggal date default current_date) returns uuid`** — cari jurnal bonus aktif bulan itu, panggil `internal.balik_jurnal` yang sudah ada, lalu `hitung_bonus` boleh dijalankan lagi. Alasan wajib diisi. Tidak ada mekanisme pembalikan baru.

**Penjagaan konsistensi** lewat trigger `before update on public.surat_jalan` yang memanggil `internal.bonus_terposting`:

- SJ diselesaikan dengan `tanggal_selesai` di bulan yang bonusnya sudah diposting → `P0001`, supaya SJ yang telat diselesaikan tidak diam-diam kehilangan haknya atas bonus.
- SJ yang sudah selesai dibatalkan, sementara bulan `tanggal_selesai`-nya sudah punya bonus aktif → `P0001`, sejajar dengan penjagaan yang sudah ada ("SJ sudah masuk invoice; batalkan invoice dulu").

Trigger dipilih daripada menyunting `selesaikan_sj`/`batalkan_sj`: keduanya fungsi panjang yang baru saja ditulis ulang di migrasi komisi, dan penjagaan ini tidak butuh apa pun dari badan fungsi itu. **[default]**

**Pembayaran bonus** memakai modul Kas yang sudah ada, tanpa RPC baru: kas keluar dengan baris akun `2126`, wajib `supir_id` **atau** `pengurus_id`. Guard-nya meniru guard `2121` di `20260918000800_kas.sql:80`.

## 7. Laporan dan UI

**View `public.v_hutang_bonus`** — `(penerima_jenis, penerima_id, penerima_nama, saldo)`, satu view untuk supir dan pengurus karena akun hutangnya memang satu. Dipakai kartu Beranda.

**Master data**, mengikuti pola `KONFIG_MASTER` di `apps/bul/web/src/halaman/master/konfigurasi.js`:

| Menu | Field | Hak | RPC |
|---|---|---|---|
| Aturan Bonus *(baru)* | nama, jenis, ambang, nominal, berlaku_mulai, aktif | `tarif.simpan` (`owner`, `keuangan`) | `simpan_aturan_bonus` |
| Material *(ubah)* | + `standar_bongkar` (opsional) | tetap `master.operasional` | `simpan_material` + 1 parameter |

Field `standar_bongkar` tetap di form Material dengan hak `master.operasional`, meski memengaruhi uang, karena ia adalah properti material dan memecahnya ke layar lain akan membingungkan. **[default]**

**Halaman baru `/bonus`**, terlihat untuk `owner` dan `keuangan` saja (sejajar Saldo Awal): pilih bulan → tabel dari `pratinjau_bonus(bulan)` → kalau belum diposting, tombol **Posting Bonus**; kalau sudah, nomor jurnalnya plus tombol **Batalkan Bonus** memakai komponen `ModalAlasan` yang sudah ada.

**Form Kas** — tambah pemilih Pengurus di setiap baris, sejajar pemilih Supir yang sudah ada (`FormKas.jsx:65`).

**Beranda** — kartu "Hutang bonus", sejajar kartu hutang upah dan hutang komisi.

## 8. Penanganan error

Mengikuti kode error baku fase-1a §9: `P0001` untuk aturan bisnis (bulan belum berakhir, bonus sudah diposting, tidak ada bonus, ambang tidak sesuai jenis, dimensi pembayaran kosong), `P0002` untuk data tidak ditemukan (`batalkan_bonus` pada periode yang belum diposting, update aturan dengan id yang tidak ada), `42501` untuk peran yang salah, `23505` untuk pelanggaran index unik aturan, `23514` untuk jurnal tidak seimbang.

Tidak ada kode error baru. Tidak adanya aturan bonus untuk suatu jenis sengaja **bukan** error.

## 9. Pengujian

**Database** (`apps/bul/db/tests/bonus.test.mjs`, Vitest + `pg` terhadap Supabase lokal):
ambang belum/persis/melebihi tercapai (termasuk 5 rit → tetap 1× nominal, yang menguncikan B3); rit harian lintas hari; tonase tanpa standar (dilewati), tepat sama dengan standar (nol), melebihi standar (flat); bulanan supir dan pengurus; penumpukan tiga jenis dalam satu bulan menghasilkan satu jurnal; SJ batal tidak terhitung; idempotensi dan hitung ulang setelah pembatalan; bulan belum berakhir; periode terkunci; peran salah; kedua penjagaan trigger pada SJ; pembayaran `2126` tanpa dan dengan dimensi.

**Regresi cacat §3** (`apps/bul/db/tests/kas.test.mjs`): pembayaran `2125` tanpa `pengurus_id` ditolak, dan dengan `pengurus_id` mengurangi saldo di `v_hutang_komisi_pengurus`.

**Gerbang katalog keamanan** (`apps/bul/db/tests/keamanan.test.mjs`) memuat daftar tertutup fungsi dan view; daftar itu wajib diperbarui pada commit yang sama dengan fungsi/view barunya, kalau tidak suite langsung merah.

**Web:** unit test untuk `konfigurasi.js` dan `menu.js`, plus `npm run build` wajib lulus.

**Verifikasi manual browser wajib** sebelum fase dinyatakan selesai. Fase 1a pernah lulus 111 tes DB + 43 tes web + build dengan login mati total karena uji manual tidak pernah dijalankan.

## 10. Batas dan larangan

Mewarisi fase-1a §10:

- Tidak ada deploy oleh agen. Migrasi dijalankan di Supabase lokal; ke produksi hanya setelah persetujuan user per batch.
- Tidak ada override bonus manual per SJ (user tidak memintanya).
- Tidak ada pratinjau bonus bulan berjalan yang bergulir real-time; pratinjau hanya untuk bulan yang sudah berakhir.
- Tidak ada notifikasi, akses mobile supir, maupun Edge Function.
- Aplikasi Firebase lama (`apps/bul-monitor`, `apps/bul-accounting`) tidak disentuh.
- Importir riwayat adalah spec terpisah; tidak ada bagian darinya yang dikerjakan di fase ini.
