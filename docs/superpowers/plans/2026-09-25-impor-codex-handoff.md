# Impor Riwayat 2026 — Handoff Eksekusi Codex Desktop

**Tanggal:** 2026-09-24
**Spec:** [`2026-09-24-impor-riwayat-design.md`](../specs/2026-09-24-impor-riwayat-design.md)
**Plan:** [`2026-09-25-impor-database.md`](2026-09-25-impor-database.md) (Task 1–5) · [`2026-09-25-impor-web.md`](2026-09-25-impor-web.md) (Task 6–10)
**Implementer:** Codex (satu-satunya penulis). **Reviewer:** Claude (read-only).

---

## 1. Arsitektur

### Alur data

```
Browser (React 19 + antd 6 + TanStack Query)
   berkas CSV → dariCsv() → skema.js: periksa bentuk + cocokkan nama → pratinjau + total uang
   kirim: supabase.rpc('impor_master' | 'impor_surat_jalan' | 'impor_kas', { ... })
        ▼
Supabase Postgres — SATU transaksi per panggilan
   public.impor_*  : perulangan tipis, security definer, wajib_peran('owner'), statement_timeout 600s
        ▼ memanggil apa adanya
   public.buat_sj · public.selesaikan_sj · public.catat_kas · public.simpan_*
        ▼
   internal.posting_jurnal  → jurnal yang identik dengan jurnal dari layar harian
```

Impor **tidak** menambah lapisan akuntansi baru dan **tidak** menulis rumus uang baru. Itu properti desain yang disengaja: kalau importir menghitung sendiri, angka riwayat bisa berbeda dari angka yang dihasilkan aplikasi, dan perbedaannya baru ketahuan berbulan-bulan kemudian.

### Batas komponen

| Unit | Tanggung jawab | Dipakai oleh |
|---|---|---|
| `dariCsv(teks)` | membaca CSV konvensi rumah (`;`, BOM, CRLF, kutip) | `bacaBerkas` |
| `BERKAS` | definisi kolom sebelas berkas — satu-satunya sumber kebenaran format | `bacaBerkas`, `templatCsv` |
| `bacaBerkas(nama, teks)` | memeriksa **bentuk**: kolom, angka, tanggal, pilihan | halaman Impor |
| `namaTakDikenal(kiriman, master)` | peringatan dini seluruh nama asing sekaligus | halaman Impor |
| `internal.wajib_ketemu` | menerjemahkan nama→id, atau mengangkat galat bernomor baris | ketiga RPC impor |
| `internal.cari_rute` | rute dikunci `(nama, asal, tujuan)`, menolak yang ambigu | `impor_master`, `impor_surat_jalan` |
| `internal.periksa_kiriman` | penjaga bentuk dan batas 5000 baris | ketiga RPC impor |
| `public.impor_master/_surat_jalan/_kas` | efek samping, atomik | halaman Impor |

Templat unduhan dan pemeriksaan bentuk sama-sama dibangkitkan dari `BERKAS`, sehingga templat yang diunduh user tidak mungkin berbeda dari yang diterima pemeriksa.

### Desain API (tanda tangan lengkap)

```
internal.wajib_ketemu(p_id uuid, p_jenis text, p_nilai text, p_no int) -> uuid
internal.cari_rute(p_nama text, p_asal text, p_tujuan text, p_no int) -> uuid
internal.periksa_kiriman(p_baris jsonb, p_berkas text) -> void

public.impor_master(p_data jsonb) -> jsonb   -- {"rute":3,"material":2,...}
public.impor_surat_jalan(p_baris jsonb) -> int
public.impor_kas(p_baris jsonb) -> int       -- jumlah TRANSAKSI, bukan baris rincian
```

Kode error tetap yang sudah baku: `42501` akses, `P0001` aturan bisnis, `P0002` tidak ditemukan, `23505` duplikat, `23514` constraint.

### Keputusan yang paling mudah dilanggar tanpa sadar

1. **Angka uang diambil dari berkas, tidak dihitung ulang.** `buat_sj` dan `selesaikan_sj` memang sudah punya parameter penimpa (`p_uang_jalan`, `p_upah`); importir wajib mengisinya. Membiarkannya `null` berarti sistem menghitung dari tarif — dan angkanya akan berbeda dari kwitansi lama.
2. **`buat_sj` tidak menerima pengurus.** Ia menebak sendiri kalau pengurus aktif hanya satu ([`20260923000100:300`](../../apps/bul/supabase/migrations/20260923000100_komisi_pengurus.sql)). Importir memasang `pengurus_id` lewat `update` **setelah** `buat_sj` dan **sebelum** `selesaikan_sj`, karena jurnal komisi baru dibentuk saat penyelesaian.
3. **`rute.nama` tidak unik.** Migrasi `20260923000200` menghapus `rute_nama_key` dan menggantinya dengan `unique (nama, asal, tujuan)`. Mencari rute hanya dengan nama bisa mengembalikan baris yang salah diam-diam.
4. **`statement_timeout`.** Tanpa `set statement_timeout = '600s'` pada deklarasi fungsi, impor ratusan baris akan mati di tengah dengan galat yang terlihat seperti kerusakan, padahal hanya kehabisan waktu.

### Skalabilitas

Beban terberat adalah satu `impor_surat_jalan` berisi ratusan baris: tiap baris memicu `buat_sj` + `selesaikan_sj` + dua posting jurnal. Untuk skala BUL (beberapa ribu SJ per tahun, dipecah per bulan) ini selesai dalam hitungan detik sampai puluhan detik, jauh di bawah batas 600 detik.

Kalau kelak dirasa lambat, yang pertama diperiksa adalah jumlah `internal.wajib_ketemu` per baris (enam subkueri titik per SJ). Bentuknya sengaja dibuat subkueri terpisah supaya bisa diganti dengan satu CTE pemetaan nama→id tanpa mengubah alur pemanggilannya. Jangan optimalkan sebelum ada angka yang membuktikan perlunya.

### Kemudahan pemeliharaan

- Format berkas adalah data (`BERKAS`), bukan kode bercabang. Menambah kolom = menambah satu entri, dan templat serta pemeriksa ikut berubah sendiri.
- Ketiga RPC impor berdiri terpisah dari fungsi harian. Mengubah importir tidak bisa merusak jalur input harian, dan sebaliknya.
- Pemeriksaan nama di browser adalah kenyamanan, bukan penjaga. Penjaga sebenarnya ada di RPC. Kalau keduanya berbeda pendapat, yang benar adalah RPC.

---

## 2. Persiapan dari kondisi laptop mati total

Kerjakan berurutan. Baru buka Codex Desktop setelah Langkah 6 hijau.

> ⚠️ **`apps/bul` TIDAK ADA di `C:\Project`.** Aplikasi BUL yang baru belum pernah di-merge ke `main` — PR #83 masih terbuka. Isi `C:\Project\apps\` hanya `bul-monitor`, `bul-accounting`, `erp-acc`, `sj-monitor`. Karena itu **worktree harus dibuat lebih dulu**, dan semua perintah `npm`/`supabase` dijalankan dari dalam worktree, bukan dari checkout utama.

**Langkah 1 — nyalakan Docker Desktop**, tunggu sampai statusnya *Engine running*.

**Langkah 2 — buat worktree implementer.** Dicabangkan dari tip fase Bonus, **bukan** dari `main`, supaya `apps/bul` ada sama sekali dan katalog RPC di `keamanan.test.mjs` sudah memuat fungsi-fungsi bonus.

```bash
git -C C:/Project worktree add -b codex/bul/impor C:/Project/.worktrees/bul/impor codex/bul/bonus
```

**Langkah 3 — pasang dependensi.** Worktree baru tidak mewarisi `node_modules`. Dua tempat, dan pakai `npm ci` bukan `npm install`.

```bash
cd C:/Project/.worktrees/bul/impor/apps/bul && npm ci
```

```bash
cd C:/Project/.worktrees/bul/impor/apps/bul/web && npm ci
```

**Langkah 4 — nyalakan Supabase lokal `bul`.** Wajib dari `apps/bul` **di dalam worktree**, karena di situlah `supabase/config.toml` berisi `project_id = "bul"` berada. Dari akar worktree, CLI memakai nama folder dan mencari container `supabase_db_impor` yang tidak ada.

```bash
cd C:/Project/.worktrees/bul/impor/apps/bul && npx supabase start
```

Isi `config.toml` identik di semua worktree BUL, jadi container yang dihasilkan sama (`supabase_*_bul`) — kalau sudah menyala dari worktree lain, perintah ini hanya memakainya kembali. `supabase_vector_bul` yang restart-loop sudah diketahui dan tidak mengganggu. **Agen tidak boleh** menjalankan `supabase start`/`stop`; ini memang tugas Anda.

**Langkah 5 — daftarkan worktree ke Gortex.** Bukan langkah opsional; alasannya di §3.

```bash
"C:/Users/m3m31/AppData/Local/Programs/gortex/gortex.exe" track C:/Project/.worktrees/bul/impor --as-worktree --name bul-impor --wait
```

**Langkah 6 — pastikan indeksnya siap.** Cari baris `bul-impor`; kalau `files`/`nodes` masih 0, tunggu sampai `state ready`.

```bash
"C:/Users/m3m31/AppData/Local/Programs/gortex/gortex.exe" daemon status
```

**Langkah 7 — siapkan `.env.local` untuk web** (baru diperlukan pada Batch F, boleh ditunda). Isi `VITE_SUPABASE_ANON_KEY` dengan kunci **Publishable** dari keluaran `npx supabase status`. **Jangan pakai kunci Secret** — semua variabel `VITE_` ikut ke bundel browser dan kunci itu melewati seluruh RLS.

**Langkah 8 — setel model dan effort** kalau build Desktop Anda belum menyediakannya per percakapan. Saat ini `C:/Users/m3m31/.codex/config.toml` berisi `model = "gpt-5.6-terra"` dan `model_reasoning_effort = "medium"`; ubah **sebelum** membuka percakapan, sesuai tabel §4.

### Catatan: dokumen plan belum ada di dalam worktree baru

Spec dan kedua plan hidup di worktree Claude (`C:/Project/.claude/worktrees/import-data-bonus-calculation-37432a`), yang punya riwayat berbeda dari `codex/bul/bonus`. Karena itu **Batch A dimulai dengan menyalin ketiga dokumen itu ke dalam worktree implementer dan mem-commit-nya** — perintahnya sudah ada di prompt Batch A, tidak perlu Anda jalankan sendiri.

---

## 3. Gortex: kenapa pernah memblokir, dan apa yang sudah ditutup

| Babak | Gejala | Sebab | Status |
|---|---|---|---|
| 1 (2026-09-22) | tool `read`/`change`/`edit` tidak tersedia | preset tool salah | **Tertutup.** `GORTEX_TOOLS = 'facade-v1'` sudah terpasang di `[mcp_servers.gortex.env]`. |
| 2 (2026-09-23) | idem, padahal preset benar | `facade-v1` hanya punya 6 tool; `AGENTS.md` mewajibkan 7 | **Tertutup.** Blok `gortex:rules` di `~/.codex/AGENTS.md` sudah di-trim ke 6 tool. |
| 3 (2026-09-22) | Codex berhenti, melapor "Gortex MCP integration failure" | `~/.codex/AGENTS.md` memang **memerintahkan** berhenti ketika tool Gortex hilang, dan "cwd not covered by any tracked repo" adalah pemicunya | **Ditangani dua lapis.** Lihat di bawah. |

Kalimat yang jadi biang babak 3, apa adanya dari `~/.codex/AGENTS.md`:

> "If the Gortex server is configured but `analyze`, `ask`, `capabilities`, `change`, `edit`, and `explore` are missing from the callable MCP tools, **report a Gortex MCP integration failure and stop. Do not start a daemon or switch to a CLI/shell fallback.**"

Jadi "Codex berhenti" bukan bug misterius, melainkan perilaku yang diperintahkan — dan pemicunya bisa sesederhana cwd yang belum dilacak, persis keadaan worktree yang baru dibuat. Ini juga berarti menulis "abaikan Gortex" di prompt **tidak cukup**: yang perlu dicabut adalah kalimat "stop"-nya.

Mitigasinya tiga lapis:

1. **Hilangkan pemicunya** — Langkah 5 di §2 mendaftarkan worktree, sehingga tool Gortex benar-benar berfungsi.
2. **Cabut perintah berhentinya secara eksplisit** — blok pembuka prompt di §5 menyebut `AGENTS.md` dengan nama dan menyatakan instruksi user pada task ini mengesampingkannya.
3. **Plan ini tidak membutuhkan Gortex sama sekali** — setiap berkas disebut dengan path lengkap, setiap blok kode ditulis utuh, tidak ada langkah "cari fungsi X" atau "telusuri pemanggil Y".

Fase Bonus berjalan mulus dengan tiga lapis yang sama. Belum terbukti menyembuhkan babak 3 secara mutlak, tapi sudah sekali lulus.

**Catatan terpisah, bukan soal Gortex:** `C:/Users/m3m31/.codex/config.toml` masih menyimpan **Personal Access Token GitHub dalam teks polos** di `[mcp_servers.github.http_headers]`, dan token itu ditolak `HTTP 401` lagi pada sesi hari ini. Rotasi dan pindahkan ke variabel lingkungan. Tidak memblokir pekerjaan impor.

---

## 4. Pembagian batch, model, dan effort

`terra` = `gpt-5.6-terra`, `astra` = `gpt-6-astra`.

| Batch | Task | Isi | Model | Effort | Alasan |
|---|---|---|---|---|---|
| **A** | 1 | Salin dokumen + kunci alami + tiga penolong | `gpt-6-astra` | `high` | Menambah `unique` pada tabel hidup dan fungsi `internal` yang diawasi gerbang keamanan |
| **B** | 2 | `impor_master` | `gpt-6-astra` | `high` | SQL panjang, sembilan blok berurutan, satu urutan salah merusak resolusi nama |
| **C** | 3 | `impor_surat_jalan` | `gpt-6-astra` | `xhigh` | Penimpa uang, tambalan `pengurus_id`, dan atomisitas — inti fitur ini |
| **D** | 4–5 | `impor_kas` + penjagaan lintas-RPC | `gpt-6-astra` | `xhigh` | CTE pengelompokan `ref` adalah SQL paling berliku di seluruh rencana |
| **E** | 6–7 | `dariCsv` + skema berkas | `gpt-5.6-terra` | `high` | Parser dengan state mesin kutip; benar atau tidak sama sekali |
| **F** | 8–9 | Templat, pemeriksaan nama, halaman Impor | `gpt-5.6-terra` | `high` | Komponen baru dengan state, unggah berkas, dan tiga mutasi |
| **G** | 10 | Verifikasi manual di browser | `gpt-5.6-terra` | `medium` | Menjalankan dan mengamati, bukan menulis kode |

### Memetakan flag CLI ke Desktop

| Yang di CLI | Di Desktop |
|---|---|
| `-C "C:/Project/.worktrees/bul/impor"` | Buka folder itu sebagai workspace percakapan. **Jangan** membuka `C:\Project` — Codex harus melihat worktree-nya sendiri. |
| `-m gpt-6-astra` | Pemilih model di percakapan itu. |
| `-c model_reasoning_effort="xhigh"` | Pemilih effort di percakapan itu; kalau belum tersedia per percakapan, ubah `config.toml` sebelum membuka percakapan. |
| `--sandbox workspace-write` | Mode persetujuan yang mengizinkan tulis di dalam workspace tanpa bertanya tiap berkas. |
| `-c sandbox_workspace_write.network_access=true` | Izinkan akses jaringan. **Wajib** — uji DB menyambung ke `127.0.0.1:54322` dan `npm` perlu registry. Tanpa ini seluruh `test:db` gagal dengan galat koneksi yang menyesatkan. |

**Satu percakapan per batch.** Itu yang membuat riwayat Desktop berguna. Jangan menumpuk tujuh batch dalam satu utas — konteksnya membengkak dan batch berikutnya mulai "mengingat" keputusan batch sebelumnya secara keliru.

Review Claude dijalankan **di antara batch**, bukan di akhir semuanya.

---

## 5. Prompt per batch

Tempel apa adanya ke percakapan Codex Desktop yang sudah dibuka pada folder `C:/Project/.worktrees/bul/impor`.

### Blok pembuka (tempel di awal SETIAP prompt)

```
Kamu implementer tunggal untuk task ini. Worktree: C:/Project/.worktrees/bul/impor, branch codex/bul/impor.

ATURAN MUTLAK:
- Kerjakan HANYA task yang disebut di bawah. Jangan menyentuh task lain, jangan refactor di luar scope.
- Blok kode di plan adalah sumber kebenaran. SALIN SECARA PROGRAMATIK dari berkas plan, jangan ketik ulang,
  jangan merapikan format, jangan menggabungkan baris, jangan menghapus komentar. Komentar di plan ada
  alasannya dan ikut masuk ke kode.
- Jangan mengubah angka atau assertion yang diharapkan tes supaya hijau. Kalau tes gagal dan kamu yakin
  plan-nya yang salah: BERHENTI dan LAPOR, jangan menambal.
- DILARANG mengubah public.buat_sj, public.selesaikan_sj, public.catat_kas, public.terbitkan_invoice,
  public.catat_pembayaran, dan seluruh public.simpan_* yang sudah ada. Impor hanya MEMANGGIL fungsi-fungsi
  itu. Kalau kamu merasa salah satunya perlu diubah: BERHENTI dan LAPOR.
- Dilarang: git push, deploy, npx supabase start/stop, migrasi ke Supabase produksi, mengubah berkas
  di luar daftar Files pada task. `npx supabase status` dan `npm run db:reset` boleh.
- Setiap berkas migrasi WAJIB diakhiri baris `select internal.terapkan_hak_akses();`. Tanpa itu,
  keamanan.test.mjs langsung merah.
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
LANGKAH 0 (sebelum apa pun): spec dan plan belum ada di worktree ini karena riwayatnya berbeda.
Salin ketiga berkas ini dari worktree Claude, lalu commit:

  C:/Project/.claude/worktrees/import-data-bonus-calculation-37432a/docs/superpowers/specs/2026-09-24-impor-riwayat-design.md
  C:/Project/.claude/worktrees/import-data-bonus-calculation-37432a/docs/superpowers/plans/2026-09-25-impor-database.md
  C:/Project/.claude/worktrees/import-data-bonus-calculation-37432a/docs/superpowers/plans/2026-09-25-impor-web.md

ke path yang sama relatif terhadap worktree ini (docs/superpowers/specs/ dan docs/superpowers/plans/),
lalu `git add` ketiganya dan commit dengan pesan:
  docs(bul): spec dan rencana impor riwayat 2026

Sesudah itu baca docs/superpowers/plans/2026-09-25-impor-database.md dan kerjakan
"Task 1: Fondasi impor — kunci alami dan penolong bersama" — Step 1 s.d. Step 5, berurutan.

Konteks: importir menerjemahkan nama menjadi id. public.supir dan public.pengurus belum punya
unique(nama), jadi terjemahan itu belum deterministik. Task ini memasang unique-nya dan tiga fungsi
penolong yang dipakai ketiga RPC impor.

Dua hal yang gampang salah:
1. internal.cari_rute memakai kunci (nama, asal, tujuan), BUKAN nama saja — rute_nama_key sudah dihapus
   migrasi 20260923000200. Argumen asal/tujuan yang kosong berarti "jangan disaring", bukan "cocokkan
   dengan string kosong". Salin persis.
2. Berkas migrasi WAJIB diakhiri `select internal.terapkan_hak_akses();` — itulah yang mencabut EXECUTE
   dari anon/authenticated untuk fungsi internal yang baru. Tanpa itu keamanan.test.mjs merah.

Sebelum mulai, jalankan `npm run test:db` dari apps/bul dan catat jumlah tes + berkas baseline
(seharusnya 165 tes / 13 berkas). Di Step 4, harapannya baseline + 4 tes dan + 1 berkas.
```

### Batch B — Task 2 (`gpt-6-astra`, effort `high`)

```
Baca docs/superpowers/plans/2026-09-25-impor-database.md. Kerjakan "Task 2: impor_master"
— Step 1 s.d. Step 6, berurutan. Task 1 sudah selesai dan ter-commit.

Blok SQL-nya panjang (± 170 baris) dan berisi sembilan blok berurutan. URUTANNYA BAGIAN DARI DESAIN,
bukan selera: rute dan material harus diproses sebelum tarif/uang_jalan/aturan_upah, karena ketiganya
merujuk master yang mungkin baru dibuat di kiriman yang sama. Jangan menyusun ulang, jangan
menggabungkan blok.

Tiga hal yang paling gampang salah:
1. Setiap simpan_* dipanggil dengan id hasil pencarian kunci alami lebih dulu (v_id), supaya impor yang
   diulang MEMPERBARUI, bukan menggandakan. Kalau v_id dibiarkan null, impor kedua akan melanggar unique.
2. simpan_rute punya parameter keenam p_tipe_rute_id, dan simpan_material punya keenam p_standar_bongkar.
   Keduanya ditambahkan migrasi fase sebelumnya. Pakai pemanggilan bernama (p_nama => ...) seperti di plan.
3. Step 4 menambah 'impor_master' ke daftar tertutup RPC_TULIS di db/tests/keamanan.test.mjs. Kalau daftar
   itu tidak diperbarui di commit yang sama, seluruh suite langsung merah.

Di Step 5, harapannya akhir Task 1 + 4 tes, jumlah berkas sama.
```

### Batch C — Task 3 (`gpt-6-astra`, effort `xhigh`)

```
Baca docs/superpowers/plans/2026-09-25-impor-database.md. Kerjakan "Task 3: impor_surat_jalan"
— Step 1 s.d. Step 6, berurutan. Task 1–2 sudah selesai dan ter-commit.

Ini inti fitur. Tiga hal yang kalau salah TIDAK akan ketahuan dari tes lain, jadi pahami sebelum menyalin:

1. p_uang_jalan dan p_upah WAJIB diisi dari berkas. Keduanya adalah parameter penimpa yang memang sudah
   disediakan buat_sj/selesaikan_sj. Kalau dibiarkan null, sistem menghitung dari tabel tarif/aturan_upah —
   dan hasilnya akan berbeda dari kwitansi lama yang sedang kita impor. Seluruh alasan fitur ini ada adalah
   supaya angka sejarah masuk apa adanya.

2. buat_sj TIDAK punya parameter pengurus; ia menebak sendiri kalau pengurus aktif cuma satu. Karena itu
   plan memasang pengurus_id lewat `update public.surat_jalan` SETELAH buat_sj dan SEBELUM selesaikan_sj.
   Urutan itu wajib: jurnal komisi dibentuk di dalam selesaikan_sj dan membaca kolom tersebut. Kalau
   update-nya dipindah ke setelah selesaikan_sj, SJ-nya benar tapi jurnal komisinya kehilangan dimensi —
   dan itu persis cacat yang baru saja kita perbaiki di fase sebelumnya.

3. Rute dicari lewat internal.cari_rute(nama, asal, tujuan), bukan pencarian nama langsung.

Uji "gagal di tengah tidak meninggalkan satu pun SJ atau jurnal" adalah alasan utama arsitektur ini dipilih.
Uji itu membandingkan cacah SEBELUM dan SESUDAH dari koneksi terpisah. Kalau gagal, jangan melonggarkan
tesnya — laporkan.

Di Step 5, harapannya akhir Task 2 + 5 tes, jumlah berkas sama.
```

### Batch D — Task 4 dan 5 (`gpt-6-astra`, effort `xhigh`)

```
Baca docs/superpowers/plans/2026-09-25-impor-database.md. Kerjakan "Task 4: impor_kas" LALU
"Task 5: Penjagaan lintas-RPC" — seluruh Step keduanya, berurutan, dengan commit terpisah per task.
Task 1–3 sudah selesai dan ter-commit.

Task 4 memuat SQL paling berliku di seluruh rencana: satu CTE yang mengelompokkan baris berdasarkan kolom
ref, sambil memanggil internal.wajib_ketemu di dalam jsonb_agg untuk menerjemahkan nopol/supir/pengurus
per baris rincian. Salin utuh dan jangan menyederhanakannya. Dua hal yang disengaja:
- ref kosong diberi kunci sintetis '#' || ordinality supaya setiap baris tanpa ref berdiri sendiri.
- count(distinct ...) dipakai untuk membuktikan jenis/tanggal/akun_kas/keterangan seragam dalam satu ref.
  Tanpa itu, catat_kas akan menerima gabungan yang salah tanpa mengeluh.

Task 5 adalah task uji-saja. Tesnya diharapkan LANGSUNG LULUS karena penjagaannya sudah ditulis di Task 1-4.
Kalau ada yang gagal, itu temuan asli: perbaiki migrasi yang bersangkutan, jangan melonggarkan tesnya.
Satu pengecualian yang sudah diantisipasi: kalau uji statement_timeout gagal karena Postgres menormalkan
satuannya (mis. tersimpan sebagai '10min'), sesuaikan nilai harapan di tes agar cocok dengan yang benar-benar
tersimpan — JANGAN mengubah deklarasi fungsinya.

Perhatikan blok try/finally pada uji kunci periode: kunci WAJIB dilepas, karena berkas uji ini berbagi satu
database dan describe berikutnya akan ikut gagal kalau kunci dibiarkan menyala.

Di akhir Task 5, jalankan `npm run test:db` penuh. Harapannya sekitar 183 tes / 14 berkas.
```

### Batch E — Task 6 dan 7 (`gpt-5.6-terra`, effort `high`)

```
Baca docs/superpowers/plans/2026-09-25-impor-web.md. Kerjakan "Task 6: Pembaca CSV dariCsv" LALU
"Task 7: Skema berkas dan pemeriksaan bentuk" — seluruh Step keduanya, dengan commit terpisah per task.
Rencana database Task 1-5 sudah selesai dan ter-commit.

Semua perintah web dijalankan dari apps/bul/web. Baseline sebelum mulai: 49 tes / 15 berkas.

DILARANG menambah dependensi apa pun. package.json tidak boleh berubah. Pembaca CSV ditulis sendiri
justru karena penulisnya (keCsv) pun hanya 8 baris.

JEBAKAN YANG SUDAH DIANTISIPASI: Vitest di proyek ini berjalan TANPA globals, jadi describe/it/expect harus
diimpor — tetapi lib/csv.test.js SUDAH mengimpornya, dan sudah mengimpor keCsv. Plan menyuruh MENGUBAH baris
import yang ada, bukan menambah baris import baru. Menambah akan menghasilkan SyntaxError duplikat.

Task 6: dariCsv adalah mesin state kutip. Yang gampang salah: kutip hanya membuka field ketika sel masih
kosong (c === '"' && sel === ''), dan dua kutip berturut-turut di dalam field berarti satu kutip literal.
Salin persis; jangan "merapikan" percabangannya.

Task 7: definisi BERKAS adalah satu-satunya sumber kebenaran format, dipakai pemeriksa DAN pembuat templat
nanti. Urutan sebelas berkas dan nama kunci-nya diuji secara harfiah — dan nama kunci itu harus cocok dengan
yang diterima impor_master (rute, material, pelanggan, truk, supir, pengurus, uang_jalan, tarif, aturan_upah).
Perhatikan: keAngka HANYA menerima koma desimal, dan keTanggal menolak tanggal yang tidak ada di kalender
seperti 2026-06-31. Keduanya disengaja.
```

### Batch F — Task 8 dan 9 (`gpt-5.6-terra`, effort `high`)

```
Baca docs/superpowers/plans/2026-09-25-impor-web.md. Kerjakan "Task 8: Templat, pemeriksaan nama, dan
ringkasan" LALU "Task 9: Halaman Impor" — seluruh Step keduanya, dengan commit terpisah per task.
Task 6-7 sudah selesai dan ter-commit.

Task 8 punya satu baris yang gampang terlewat: impor paling atas skema.js berubah dari
`import { dariCsv } from '../../lib/csv.js';` menjadi dua baris (menambah keCsv dan uang.js).
Plan menyebutnya eksplisit. Kalau terlewat, tesnya gagal dengan galat yang membingungkan.

namaTakDikenal harus menganggap nama yang akan DIBUAT oleh berkas master dalam kiriman yang sama sebagai
sudah ada — itulah yang membuat user tidak perlu mengimpor dua kali. Material dicocokkan sebagai
`${lini}|${nama}`, bukan namanya saja.

Ringkasan memakai jumlahkan/dariSen dari lib/uang.js. DILARANG memakai aritmetika float untuk uang.

JEBAKAN YANG SAMA DI TASK 9: layout/menu.test.js SUDAH mengimpor describe/it/expect/boleh/menuUntukPeran.
Tambahkan blok describe-nya saja, tanpa baris import apa pun.

Task 9: halaman Impor memanggil ketiga RPC yang sudah ada sejak rencana database. Nama argumennya
p_data untuk impor_master dan p_baris untuk dua lainnya. Perhatikan urutan pemanggilan: master dulu,
baru SJ, baru kas.

Di Step 7 jalankan `npm test && npm run build`. Harapannya sekitar 73 tes / 16 berkas dan build sukses.
```

### Batch G — Task 10 (`gpt-5.6-terra`, effort `medium`)

```
Baca docs/superpowers/plans/2026-09-25-impor-web.md. Kerjakan "Task 10: Verifikasi manual di browser"
— Step 1 s.d. Step 5. Tidak ada commit kode di task ini; keluarannya laporan.

Kalau Supabase lokal belum menyala, MINTA USER menyalakannya. Jangan menjalankan npx supabase start sendiri.
`npx supabase status` dijalankan dari apps/bul, bukan dari akar worktree.

Ini bukan formalitas. Di fase 1a langkah ini dilewat dan menyesal; di fase Bonus dijalankan dan menemukan
hal yang tidak terlihat dari tes mana pun. Enam pembuktian di Step 3 semuanya wajib, terutama nomor 4:
uang jalan dan upah pada SJ hasil impor harus sama dengan BERKAS, bukan dengan master data.

Laporkan apa adanya, termasuk yang gagal. Jangan menyatakan selesai tanpa bukti segar.
```

---

## 6. Setelah semua batch selesai

Yang menunggu keputusan user, bukan keputusan agen:

1. **Push dan PR.** Claude diblokir permanen dari `git push`. Cabang `codex/bul/impor` bertumpu di atas `codex/bul/bonus` yang **juga belum di-push**, jadi keduanya masuk bersamaan.
2. **Nama supir/pengurus kembar di produksi.** Migrasi `unique` akan gagal kalau ada. Periksa dulu sebelum menerapkan migrasi ke Supabase produksi.
3. **Membuka `kunci_periode`** sebelum mengimpor riwayat 2026, lalu menutupnya kembali sesudahnya.
4. **Menagih ulang invoice 2026** lewat layar Invoice, sesuai keputusan mengecualikan invoice dari cakupan importir.
