# Bonus Supir & Pengurus — Handoff Eksekusi Codex

**Tanggal:** 2026-09-24
**Spec:** [`2026-09-24-perhitungan-bonus-design.md`](../specs/2026-09-24-perhitungan-bonus-design.md)
**Plan:** [`2026-09-24-bonus-database.md`](2026-09-24-bonus-database.md) (Task 1–4) · [`2026-09-24-bonus-web.md`](2026-09-24-bonus-web.md) (Task 5–7)
**Implementer:** Codex (satu-satunya penulis). **Reviewer:** Claude (read-only).

---

## 1. Arsitektur

### Alur data

```
Browser (React 19 + antd 6 + TanStack Query)  ──  Cloudflare Pages
   baca : supabase.from('<tabel/view>').select()      → RLS: hanya pengguna aktif
   tulis: supabase.rpc('<nama>', {...})               → tidak ada hak tulis tabel sama sekali
        ▼
Supabase Postgres
   public   : tabel, view (security_invoker), RPC (security definer, search_path='')
   internal : hitung_bonus_baris, bonus_terposting, jaga_bonus_periode, posting_jurnal, balik_jurnal
```

Bonus tidak menambah lapisan baru. Ia memakai jalur yang sama dengan seluruh modul lain: satu RPC atomik per aksi, satu jurnal per peristiwa, tidak ada antrean, tidak ada job.

### Batas komponen

| Unit | Tanggung jawab | Dipakai oleh |
|---|---|---|
| `public.bonus_berlaku(jenis, tanggal)` | mencari satu aturan yang berlaku; nol baris = tidak ada | `internal.hitung_bonus_baris` |
| `internal.hitung_bonus_baris(periode)` | **satu-satunya** rumus bonus | `pratinjau_bonus`, `hitung_bonus` |
| `internal.bonus_terposting(tanggal)` | apakah bulan itu punya jurnal bonus aktif | `hitung_bonus`, `batalkan_bonus`, trigger SJ |
| `public.hitung_bonus` / `batalkan_bonus` | efek samping akuntansi | halaman Bonus |
| `public.v_hutang_bonus` | saldo hutang per penerima | Beranda |

Pratinjau dan posting membaca fungsi yang sama, jadi angka di layar tidak mungkin berbeda dari angka yang masuk jurnal. Itu properti desain yang disengaja, bukan kebetulan.

### Desain API (tanda tangan lengkap)

```
public.simpan_aturan_bonus(p_id uuid, p_nama text, p_jenis text, p_ambang int,
                           p_nominal numeric, p_berlaku_mulai date, p_aktif boolean default true) -> uuid
public.simpan_material(p_id uuid, p_lini_kode text, p_nama text, p_satuan text,
                       p_aktif boolean default true, p_standar_bongkar numeric default null) -> uuid
public.bonus_berlaku(p_jenis text, p_tanggal date) -> table (ambang int, nominal numeric)
public.pratinjau_bonus(p_periode date) -> table (jenis text, penerima_jenis text, penerima_id uuid,
                                                 penerima_nama text, dasar numeric, jumlah numeric)
public.hitung_bonus(p_periode date) -> uuid            -- id jurnal bonus
public.batalkan_bonus(p_periode date, p_alasan text, p_tanggal date default current_date) -> uuid
public.catat_kas(...)                                  -- p_baris kini menerima kunci pengurus_id
```

Kode error tetap yang sudah baku: `42501` akses, `P0001` aturan bisnis, `P0002` tidak ditemukan, `23505` duplikat, `23514` constraint/jurnal tidak seimbang.

### Strategi caching

Tidak ada lapisan cache baru. Yang ada adalah TanStack Query di klien, dengan kunci yang sudah dipakai seluruh aplikasi:

- `['tabel', <nama tabel/view>, select, order, filter]` untuk `useDaftar`
- `['fungsi', <nama rpc>, args]` untuk `useFungsi`

`useRpc(nama, { invalidate: [...] })` membatalkan **kedua** prefix untuk setiap nama yang disebut. Halaman Bonus menyebut `['jurnal', 'v_hutang_bonus', 'pratinjau_bonus']`, sehingga setelah posting/pembatalan: status jurnal, kartu Beranda, dan tabel pratinjau semuanya ikut segar.

Yang **tidak** di-cache di server: tidak ada materialized view, tidak ada tabel ringkasan. Bonus dihitung ulang dari `surat_jalan` tiap kali pratinjau dibuka. Itu pilihan sadar — hasilnya selalu konsisten dengan data sumber, dan volumenya kecil.

### Skalabilitas

Beban terberat adalah `hitung_bonus_baris`: satu pemindaian SJ selesai dalam satu bulan, dikelompokkan empat cara. Untuk itu ditambahkan index parsial `surat_jalan (tanggal_selesai, supir_id) where status = 'selesai'`; index yang sudah ada hanya menutup `tanggal` (berangkat), yang tidak menolong sama sekali untuk jalur ini.

Skala nyata BUL beberapa ribu SJ per tahun, jadi kueri ini akan selesai dalam milidetik. Kalau kelak volumenya naik satu-dua orde, yang pertama perlu diperiksa adalah `cross join lateral public.bonus_berlaku(...)` pada agregat harian — ia dipanggil sekali per (supir × hari). Bentuk pemanggilannya sengaja dibuat lateral supaya bisa diganti dengan satu join ke `aturan_bonus` tanpa mengubah rumusnya. Jangan optimalkan sebelum ada angka yang membuktikan perlunya.

### Kemudahan pemeliharaan

- Ambang dan nominal adalah data, bukan kode. Mengubah kebijakan bonus = menambah baris `aturan_bonus` dengan `berlaku_mulai` baru; riwayat lama tetap bisa dihitung ulang dengan angka yang berlaku saat itu.
- Penjagaan periode dipasang sebagai trigger, bukan suntingan pada `selesaikan_sj`/`batalkan_sj`. Dua fungsi panjang itu tidak perlu disentuh, dan penjagaannya tidak bisa bocor lewat jalur tulis lain.
- Idempotensi dibaca dari `jurnal` sendiri. Tidak ada tabel status yang bisa melenceng dari kenyataan.

---

## 2. Persiapan (dijalankan user, sebelum membuka Codex Desktop)

**Langkah 1 — buat worktree implementer.** Dibuat dari tip branch Claude yang memuat spec dan plan ini. Satu baris, aman di cmd.exe maupun PowerShell:

```bash
git -C C:/Project worktree add -b codex/bul/bonus C:/Project/.worktrees/bul/bonus claude/import-data-bonus-calculation-37432a
```

**Langkah 2 — daftarkan worktree itu ke Gortex.** Ini bukan langkah opsional. Daemon melacak repo satu per satu, dan `C:\Project` sendiri **tidak** dilacak; setiap worktree BUL sebelumnya didaftarkan sendiri-sendiri (`C:\Project\.worktrees\bul\fase-1a` ada di daftar, misalnya). Tanpa langkah ini setiap panggilan tool Gortex dari worktree baru balik dengan `repo_not_tracked`, dan `~/.codex/AGENTS.md` memerintahkan Codex **berhenti** begitu tool Gortex tidak bisa dipakai (lihat §3).

```bash
"C:/Users/m3m31/AppData/Local/Programs/gortex/gortex.exe" track C:/Project/.worktrees/bul/bonus --as-worktree --name bul-bonus --wait
```

**Langkah 3 — pastikan indeksnya benar-benar siap.** Cari baris `bul-bonus` pada tabel `tracked repos`; kalau `files`/`nodes` masih 0, tunggu sampai `state ready`.

```bash
"C:/Users/m3m31/AppData/Local/Programs/gortex/gortex.exe" daemon status
```

**Langkah 4 — Docker dan Supabase lokal `bul` menyala** (port 54321–54324, 54327). **Agen tidak boleh** menjalankan `npx supabase start`/`stop`; ini tugas user.

---

## 3. Gortex: kenapa sebelumnya memblokir, dan apa yang berubah

Tiga kegagalan berbeda pernah terjadi. Dua sudah tertutup di konfigurasi; yang ketiga punya penjelasan baru.

| Babak | Gejala | Sebab | Status |
|---|---|---|---|
| 1 (2026-09-22) | tool `read`/`change`/`edit` tidak tersedia | preset tool salah | **Sudah tertutup.** `GORTEX_TOOLS = 'facade-v1'` sudah terpasang di `[mcp_servers.gortex.env]` pada `C:/Users/m3m31/.codex/config.toml`. |
| 2 (2026-09-23) | idem, padahal preset sudah benar | preset `facade-v1` cuma punya 6 tool; 7 verb yang diwajibkan `AGENTS.md` belum dirilis | **Sudah tertutup.** Blok `gortex:rules` di `~/.codex/AGENTS.md` sudah di-trim ke 6 tool yang ada. |
| 3 (2026-09-22) | Codex berhenti dan melapor "Gortex MCP integration failure", 6 putaran gagal | lihat di bawah | **Punya penjelasan, belum terbukti sembuh.** |

### Apa yang baru ditemukan tentang babak 3

`~/.codex/AGENTS.md` memuat dua kalimat yang selama ini tidak pernah dibaca sebagai penyebab:

> "If the Gortex server is configured but `analyze`, `ask`, `capabilities`, `change`, `edit`, and `explore` are missing from the callable MCP tools, **report a Gortex MCP integration failure and stop. Do not start a daemon or switch to a CLI/shell fallback.**"

> "*cwd is not covered by any tracked repo* means graph tools are unavailable there."

Jadi "Codex berhenti" bukan bug misterius — itu **perilaku yang diperintahkan**. Dan pemicunya bisa sesederhana cwd yang belum dilacak, persis keadaan worktree baru yang belum di-`gortex track`. Ini juga berarti kalimat "abaikan Gortex dan lanjutkan" pada prompt lama **bertabrakan langsung** dengan `AGENTS.md`, dan bukti historis menunjukkan `AGENTS.md` yang menang.

Karena itu mitigasinya sekarang dua lapis:

1. **Hilangkan pemicunya** — Langkah 2 di §2 mendaftarkan worktree, sehingga tool Gortex benar-benar berfungsi dan tidak ada kegagalan untuk dilaporkan.
2. **Cabut perintah berhentinya secara eksplisit** — blok pembuka prompt di §5 menyebut `AGENTS.md` dengan nama dan menyatakan bahwa instruksi user pada task ini mengesampingkannya. Menulis "abaikan Gortex" saja tidak cukup; yang perlu dicabut adalah kalimat "stop".

Lapis ketiga tetap berlaku seperti sebelumnya: **plan ini tidak membutuhkan Gortex sama sekali.** Setiap berkas disebut dengan path lengkap, setiap blok kode ditulis utuh, tidak ada langkah "cari fungsi X" atau "telusuri pemanggil Y".

Catatan terpisah, bukan soal Gortex: `C:/Users/m3m31/.codex/config.toml` menyimpan **Personal Access Token GitHub dalam teks polos** pada `[mcp_servers.github.http_headers]`. Token itu juga sedang ditolak (HTTP 401) di sesi Claude hari ini, jadi kemungkinan besar sudah mati. Rotasi dan pindahkan ke variabel lingkungan; tidak memblokir pekerjaan bonus.

---

## 4. Pembagian batch, model, dan effort — pengaturan Codex Desktop

`terra` = `gpt-5.6-terra`, `astra` = `gpt-6-astra`. Alasan pemilihan mengikuti pengalaman fase 1a: batch dengan kepadatan logika uang dinaikkan effort-nya, batch yang sebagian besar menyalin blok deklaratif diturunkan.

| Batch | Task | Isi | Model | Effort | Alasan |
|---|---|---|---|---|---|
| **A** | 1 | Dimensi pengurus di modul kas | `gpt-6-astra` | `high` | Mengganti fungsi uang yang sudah hidup; salah sedikit merusak seluruh modul kas |
| **B** | 2 | Skema, akun, RPC master | `gpt-6-astra` | `high` | Perubahan constraint dan drop/create fungsi; gerbang katalog tidak memaafkan |
| **C** | 3 | Mesin perhitungan | `gpt-6-astra` | `xhigh` | SQL CTE berlapis dengan lateral join; ini inti rumus uangnya |
| **D** | 4 | Posting, pembalikan, trigger, view | `gpt-6-astra` | `xhigh` | Jurnal, idempotensi, dan penjagaan lintas fungsi sekaligus |
| **E** | 5–6 | Master bonus + halaman Bonus | `gpt-5.6-terra` | `high` | Komponen baru dengan state dan mutasi, bukan sekadar konfigurasi |
| **F** | 7 | Form Kas + Beranda | `gpt-5.6-terra` | `medium` | Tiga sisipan kecil pada berkas yang sudah ada |

### Cara menjalankannya di Desktop

Desktop tidak punya flag `-C`, `-m`, atau `-c model_reasoning_effort` seperti CLI. Yang setara:

| Yang di CLI dulu | Di Desktop |
|---|---|
| `-C "C:/Project/.worktrees/bul/bonus"` | Buka folder itu sebagai workspace percakapan. **Jangan** membuka `C:\Project` — Codex harus melihat worktree-nya sendiri, bukan checkout utama. |
| `-m gpt-6-astra` | Pemilih model di percakapan itu. |
| `-c model_reasoning_effort="xhigh"` | Pemilih effort di percakapan itu. Kalau build Anda belum menampilkannya per percakapan, ubah `model_reasoning_effort` di `C:/Users/m3m31/.codex/config.toml` **sebelum** membuka percakapan (sekarang nilainya `"medium"`, dan `model = "gpt-5.6-terra"`). |
| `--sandbox workspace-write` | Mode persetujuan yang mengizinkan tulis di dalam workspace tanpa bertanya tiap berkas. |
| `-c sandbox_workspace_write.network_access=true` | Izinkan akses jaringan. **Wajib** — uji DB menyambung ke `127.0.0.1:54322` dan `npm` perlu registry; tanpa ini seluruh `test:db` gagal dengan error koneksi yang menyesatkan. |

**Satu percakapan per batch.** Itu yang membuat riwayat Desktop berguna: satu batch = satu utas yang bisa dibuka lagi. Jangan menumpuk enam batch dalam satu percakapan — konteksnya membengkak dan batch berikutnya mulai "mengingat" keputusan batch sebelumnya secara keliru.

Review Claude dijalankan **di antara batch**, bukan di akhir semuanya.

---

## 5. Prompt per batch

Prompt di bawah ditulis untuk ditempel apa adanya ke percakapan Codex Desktop yang sudah dibuka pada folder `C:/Project/.worktrees/bul/bonus`. Blok pembuka yang sama dipakai semua batch.

### Blok pembuka (tempel di awal setiap prompt)

```
Kamu implementer tunggal untuk task ini. Worktree: C:/Project/.worktrees/bul/bonus, branch codex/bul/bonus.

ATURAN MUTLAK:
- Kerjakan HANYA task yang disebut di bawah. Jangan menyentuh task lain, jangan refactor di luar scope.
- Blok kode di plan adalah sumber kebenaran. SALIN SECARA PROGRAMATIK dari berkas plan, jangan ketik ulang,
  jangan merapikan format, jangan menggabungkan baris, jangan menghapus komentar. Komentar di plan ada
  alasannya dan ikut masuk ke kode.
- Jangan mengubah angka atau assertion yang diharapkan tes supaya hijau. Kalau tes gagal dan kamu yakin
  plan-nya yang salah: BERHENTI dan LAPOR, jangan menambal.
- Dilarang: git push, deploy, npx supabase start/stop, migrasi ke Supabase produksi, mengubah berkas
  di luar daftar Files pada task. `npx supabase status` dan `npm run db:reset` boleh.
- Selesai task, jalankan `git status --short --untracked-files=all` dan TEMPELKAN KELUARAN MENTAHNYA
  ke laporan. Jangan diringkas, jangan ditulis "bersih" tanpa bukti.
- Laporkan setiap penyimpangan dari plan, sekecil apa pun, termasuk perbedaan format.

TENTANG GORTEX — BACA SAMPAI HABIS, INI MENCABUT SEBAGIAN AGENTS.md:
Worktree ini sudah didaftarkan ke daemon Gortex, jadi tool graph seharusnya berfungsi. Pakai kalau jalan.
Tetapi kalau tool Gortex (analyze/ask/capabilities/change/edit/explore) TIDAK tersedia, error, mengembalikan
repo_not_tracked, atau hilang sama sekali: ~/.codex/AGENTS.md menyuruhmu "report a Gortex MCP integration
failure and stop". Untuk task ini, instruksi user MENCABUT kalimat itu. Jangan berhenti. Jangan melaporkannya
sebagai blocker. Lanjutkan memakai baca/tulis berkas biasa dan shell — plan ini memang ditulis supaya bisa
dikerjakan tanpa Gortex: semua path lengkap dan semua kode ada di dalam plan. Sebutkan sekali saja di laporan
akhir bahwa Gortex tidak tersedia, lalu teruskan pekerjaannya.

KEGAGALAN TRANSIEN YANG SUDAH DIKENAL: kalau `npm run test:db` gagal serempak di semua berkas dengan
"Error: Vitest failed to find the runner" dan 0 tes jalan, itu transien. Jalankan ulang perintah yang
sama sekali lagi sebelum mendiagnosis apa pun. Jangan menambal konfigurasi karena ini.
```

### Batch A — Task 1 (`gpt-6-astra`, effort `high`)

```
Baca docs/superpowers/plans/2026-09-24-bonus-database.md. Kerjakan bagian "Verifikasi awal" lalu
"Task 1: Dimensi pengurus di modul kas" — seluruh Step 1 s.d. Step 5, berurutan.

Konteks singkat: fungsi public.catat_kas tidak pernah membawa dimensi pengurus, sehingga pelunasan akun
2125 Hutang Komisi Pengurus tidak pernah mengurangi saldo pengurus di view v_hutang_komisi_pengurus.
Task ini menambahkan kolom pengurus_id ke transaksi_kas_baris dan mengganti catat_kas.

Blok SQL di Step 1 panjang (± 115 baris) dan merupakan penggantian UTUH fungsi catat_kas, bukan tambalan.
Salin utuh. Perhatikan: dua guard baru memakai pencarian lunak (plain select ke pengaturan_posting), BUKAN
internal.akun_posting, justru supaya kunci 'hutang_bonus' yang belum ada tidak mematikan catat_kas.
Komentar yang menjelaskan itu wajib ikut.

Sebelum mulai, jalankan `npm run test:db` dari apps/bul dan catat jumlah tes + berkas baseline. Di Step 4,
harapannya adalah baseline + 4 tes dan + 1 berkas. Hitung sendiri, jangan pakai angka dari dokumen lain.
```

### Batch B — Task 2 (`gpt-6-astra`, effort `high`)

```
Baca docs/superpowers/plans/2026-09-24-bonus-database.md. Kerjakan "Task 2: Skema bonus dan master data"
— Step 1 s.d. Step 6, berurutan. Task 1 sudah selesai dan ter-commit.

Tiga hal yang paling gampang salah di task ini, perhatikan baik-baik:
1. simpan_material TIDAK bisa dipakai `create or replace` karena daftar parameternya berubah — itu akan
   membuat overload kedua, dan gerbang katalog di keamanan.test.mjs akan melihat dua fungsi bernama sama.
   Plan sudah menyuruh `drop function public.simpan_material(uuid, text, text, text, boolean);` lebih dulu.
   Jangan hilangkan baris itu.
2. Dua constraint diganti dengan drop + add (pengaturan_posting_kunci_check dan jurnal_sumber_tipe_check).
   Salin daftar nilainya persis; menghilangkan satu nilai lama akan merusak data yang sudah ada.
3. Step 4 memperbarui daftar tertutup di db/tests/keamanan.test.mjs. Kalau daftar itu tidak diperbarui di
   commit yang sama, seluruh suite langsung merah. Salin kedua daftar persis seperti di plan.

Di Step 5, harapannya akhir Task 1 + 10 tes, + 1 berkas.
```

### Batch C — Task 3 (`gpt-6-astra`, effort `xhigh`)

```
Baca docs/superpowers/plans/2026-09-24-bonus-database.md. Kerjakan "Task 3: Mesin perhitungan bonus"
— Step 1 s.d. Step 6, berurutan. Task 1 dan 2 sudah selesai dan ter-commit.

Ini inti rumus uang seluruh fitur. Blok SQL internal.hitung_bonus_baris (± 70 baris) ditambahkan di AKHIR
berkas migrasi 20260924000200_bonus.sql yang sudah ada — jangan menulis ulang berkasnya, jangan menyisipkan
di tengah.

Hal yang harus kamu pahami sebelum menyalin, karena kalau salah tidak akan ketahuan dari tes:
- public.bonus_berlaku adalah fungsi SET-RETURNING. Nol baris berarti "tidak ada aturan", dan karena
  dipanggil lewat `cross join lateral`, grup yang bersangkutan otomatis hilang. Itulah mekanisme skip-nya.
  Jangan mengubahnya jadi scalar atau menambahkan coalesce.
- Aturan harian dievaluasi pada TANGGAL HARI ITU (h.hari), tonase pada tanggal_selesai SJ-nya, dan yang
  bulanan pada AKHIR BULAN (b.akhir). Ketiganya berbeda dan itu disengaja.
- Nama kolom keluaran (jenis, penerima_jenis, penerima_id, penerima_nama, dasar, jumlah) sengaja TIDAK
  dipakai sebagai alias di dalam badan kueri — alias internalnya j/pj/pid/d/n — untuk menghindari bentrok
  nama antara kolom keluaran dan kolom tabel. Jangan "merapikan" ini.

Di Step 5, harapannya akhir Task 2 + 7 tes, jumlah berkas sama.
```

### Batch D — Task 4 (`gpt-6-astra`, effort `xhigh`)

```
Baca docs/superpowers/plans/2026-09-24-bonus-database.md. Kerjakan "Task 4: Posting, pembalikan,
penjagaan periode, dan laporan hutang" — Step 1 s.d. Step 7, berurutan. Task 1–3 sudah ter-commit.

Semua SQL ditambahkan di AKHIR berkas 20260924000200_bonus.sql yang sudah ada.

Hal yang harus dipahami:
- Idempotensi TIDAK memakai tabel status. internal.bonus_terposting membacanya langsung dari tabel jurnal:
  sumber_tipe = 'bonus' dan dibalik_oleh_id is null, dicocokkan per bulan. Jangan menambah tabel.
- Penjagaan SJ dipasang sebagai TRIGGER before update pada surat_jalan, bukan sebagai suntingan pada
  selesaikan_sj atau batalkan_sj. Jangan menyentuh kedua fungsi itu.
- hitung_bonus memposting SATU jurnal untuk seluruh periode, dengan sepasang baris per (penerima × jenis).
  posting_jurnal sudah menegakkan keseimbangan; jangan menambah pemeriksaan sendiri.

Step 6 menyuruh menjalankan pemeriksaan independen terhadap DB (bukan lewat tes) untuk memastikan total
debit = total kredit pada jurnal bonus dan pembalik. Jalankan benar-benar dan tempelkan keluarannya.

Di Step 5, harapannya akhir Task 3 + 15 tes, jumlah berkas sama.

Uji TERAKHIR di berkas mengunci periode lewat atur_kunci_periode. Ia harus tetap paling akhir; kalau kamu
memindahkannya, uji-uji sesudahnya akan gagal karena periodenya terkunci.

Tanggal pada uji Task 4 SENGAJA di masa lalu (Juni 2026 dan Agustus 2026). hitung_bonus menolak bulan yang
belum berakhir, jadi jangan memajukan tanggal-tanggal itu ke tahun depan "supaya terlihat baru". Satu-satunya
uji yang memakai tanggal relatif terhadap hari ini adalah yang menguji penolakan bulan berjalan.
```

### Batch E — Task 5–6 (`gpt-5.6-terra`, effort `high`)

```
Baca docs/superpowers/plans/2026-09-24-bonus-web.md. Kerjakan "Verifikasi awal", lalu "Task 5: Master data
aturan bonus dan standar bongkar material" dan "Task 6: Halaman Bonus" — seluruh Step berurutan, dua commit
terpisah sesuai plan. Seluruh task database (1–4) sudah selesai dan ter-commit.

Semua perintah dijalankan dari apps/bul/web.

Perhatian:
- DILARANG memakai Number() atau parseFloat pada nilai uang/qty. Nilai ambang, nominal, dan standar bongkar
  dikirim ke RPC sebagai STRING apa adanya dari InputNumber stringMode. keArgs di plan sudah benar; jangan
  "memperbaiki" dengan konversi angka.
- Vite 8 memakai Rolldown, bukan rollup. Kalau ada masalah konfigurasi build, BERHENTI dan LAPOR.
- Task 6 Step 6: jumlah tes TIDAK bertambah dari akhir Task 5, karena empat assertion baru berada di dalam
  dua `it` yang sudah ada. Itu benar, bukan tanda ada yang terlewat.
- BonusPage mengimpor labelJenisBonus dari halaman master/konfigurasi.js. Satu sumber label; jangan
  menyalin daftar jenis bonus ke berkas kedua.
```

### Batch F — Task 7 (`gpt-5.6-terra`, effort `medium`)

```
Baca docs/superpowers/plans/2026-09-24-bonus-web.md. Kerjakan "Task 7: Pembayaran bonus/komisi di Form Kas
dan kartu Beranda" — Step 1 s.d. Step 4. Task 1–6 sudah ter-commit.

Task ini sengaja tanpa uji unit baru: penjagaannya ada di database dan sudah diuji di Task 1 dan Task 4.
Gerbangnya `npm test` (jumlah tes tetap) dan `npm run build`.

Tiga sisipan kecil saja — satu baris useOpsi, satu Form.Item, satu objek payload di FormKas.jsx; satu
useDaftar dan satu Card di Beranda.jsx. Jangan merestrukturisasi berkas-berkas itu.

Setelah commit, JANGAN menyatakan fase selesai. Bagian "Gerbang akhir fase web" memuat daftar verifikasi
manual browser yang wajib dijalankan; kerjakan daftar itu dan laporkan hasil tiap butir apa adanya.
```

---

## 6. Setelah semua batch

- Claude mereview commit demi commit: diff verbatim blok plan → berkas, hitung ulang akuntansi sendiri dari `jurnal_baris` mentah, dan adu angka pratinjau dengan angka jurnal lewat PostgREST.
- Verifikasi manual browser dijalankan user atau Codex sesuai daftar di plan web. **Fase tidak boleh dinyatakan selesai tanpa ini.**
- Push, PR, dan migrasi ke Supabase produksi adalah keputusan user. Claude permanen diblokir dari `git push` dan seluruh CLI Supabase/Vercel/Firebase.
- Setelah fase Bonus disetujui, lanjut ke brainstorming **Importir riwayat** (sub-proyek 2), yang belum punya spec.
