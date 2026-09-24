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

## 2. Persiapan worktree (dijalankan user)

Branch implementer dibuat dari tip branch Claude yang memuat spec dan plan ini. Perintah aman untuk cmd.exe maupun PowerShell, satu baris:

```bash
git -C C:/Project worktree add -b codex/bul/bonus C:/Project/.worktrees/bul/bonus claude/import-data-bonus-calculation-37432a
```

Pastikan Docker dan Supabase lokal `bul` menyala (port 54321–54324, 54327). **Agen tidak boleh** menjalankan `npx supabase start`/`stop`.

---

## 3. Gortex: cara agar tidak memblokir lagi

Ada tiga kegagalan berbeda yang pernah terjadi, dan penting untuk tidak salah mendiagnosis mana yang sedang dihadapi:

| Babak | Gejala | Sebab | Obat |
|---|---|---|---|
| 1 (2026-09-22) | tool `read`/`change`/`edit` tidak tersedia | preset tool salah | `GORTEX_TOOLS = 'facade-v1'` di `[mcp_servers.gortex.env]` pada `C:/Users/m3m31/.codex/config.toml` |
| 2 (2026-09-23) | idem, padahal preset sudah benar | preset `facade-v1` memang cuma punya 6 tool; 7 verb yang diwajibkan `AGENTS.md` belum dirilis Gortex | blok `gortex:rules` di `~/.codex/AGENTS.md` sudah di-trim ke 6 tool yang ada |
| 3 (2026-09-22) | Codex kehilangan **seluruh** tool MCP individual, 6 putaran gagal | tidak pernah terpecahkan; satu petunjuk yang belum dikejar: peringatan Codex sendiri "Skill descriptions were shortened to fit the skills context budget" saat plugin superpowers dimuat penuh | — |

Babak 3 tidak punya obat yang terbukti. Karena itu **mitigasi utamanya bukan memperbaiki Gortex, melainkan menghapus ketergantungan padanya**:

1. **Plan ini tidak membutuhkan Gortex sama sekali.** Setiap berkas disebut dengan path lengkap, setiap blok kode ditulis utuh, setiap perintah verifikasi eksplisit. Tidak ada langkah yang menyuruh "cari fungsi X" atau "telusuri pemanggil Y".
2. **Prompt di §5 memuat instruksi eksplisit** agar Codex mengabaikan Gortex bila tidak tersedia dan melanjutkan dengan baca/tulis berkas biasa — tidak berhenti, tidak mendiagnosis.

Pemeriksaan opsional sebelum mulai (read-only, tidak mengubah apa pun):

```bash
gortex tools list --preset facade-v1 --format json
```

Kalau tool yang dikeluhkan Codex memang tidak ada di keluaran itu, ini babak 2 — jangan buang waktu mengutak-atik preset. Kalau Codex melaporkan **nol** tool MCP individual sekaligus memunculkan peringatan "skills context budget", ini babak 3: kurangi plugin/skill yang dimuat sesi Codex, lalu jalankan ulang. Jangan menghabiskan lebih dari satu putaran untuk ini — plan sudah dirancang jalan tanpanya.

---

## 4. Pembagian batch, model, dan effort

`terra` = `gpt-5.6-terra`, `astra` = `gpt-6-astra`. Alasan pemilihan mengikuti pengalaman fase 1a: batch dengan kepadatan logika uang dinaikkan effort-nya, batch yang sebagian besar menyalin blok deklaratif diturunkan.

| Batch | Task | Isi | Model | Effort | Alasan |
|---|---|---|---|---|---|
| **A** | 1 | Dimensi pengurus di modul kas | `gpt-6-astra` | `high` | Mengganti fungsi uang yang sudah hidup; salah sedikit merusak seluruh modul kas |
| **B** | 2 | Skema, akun, RPC master | `gpt-6-astra` | `high` | Perubahan constraint dan drop/create fungsi; gerbang katalog tidak memaafkan |
| **C** | 3 | Mesin perhitungan | `gpt-6-astra` | `xhigh` | SQL CTE berlapis dengan lateral join; ini inti rumus uangnya |
| **D** | 4 | Posting, pembalikan, trigger, view | `gpt-6-astra` | `xhigh` | Jurnal, idempotensi, dan penjagaan lintas fungsi sekaligus |
| **E** | 5–6 | Master bonus + halaman Bonus | `gpt-5.6-terra` | `high` | Komponen baru dengan state dan mutasi, bukan sekadar konfigurasi |
| **F** | 7 | Form Kas + Beranda | `gpt-5.6-terra` | `medium` | Tiga sisipan kecil pada berkas yang sudah ada |

Peluncuran (satu baris, aman di cmd.exe):

```bash
codex -C "C:/Project/.worktrees/bul/bonus" -m gpt-6-astra -c model_reasoning_effort="high" --sandbox workspace-write -c sandbox_workspace_write.network_access=true
```

Ganti `-m` dan `model_reasoning_effort` sesuai tabel. Review Claude dijalankan **di antara batch**, bukan di akhir semuanya.

---

## 5. Prompt per batch

Prompt di bawah ditulis untuk ditempel apa adanya ke sesi Codex yang sudah berjalan di worktree yang benar. Blok pembuka yang sama dipakai semua batch.

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

TENTANG GORTEX: kalau tool MCP Gortex (read/explore/change/edit/search/...) tidak tersedia, error, atau
hilang sama sekali — ABAIKAN SEPENUHNYA dan lanjutkan memakai baca/tulis berkas biasa. Plan ini sudah
ditulis supaya bisa dikerjakan tanpa Gortex: semua path lengkap dan semua kode ada di dalam plan.
JANGAN berhenti untuk mendiagnosis Gortex. JANGAN melaporkannya sebagai blocker.

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
