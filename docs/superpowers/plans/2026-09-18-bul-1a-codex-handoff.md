# BUL 1a — Handoff ke Codex (batch, model, effort, prompt)

**Implementer:** Codex. **Reviewer:** Claude, read-only, setelah setiap batch.
**Plan:**
- `docs/superpowers/plans/2026-09-18-bul-1a-database.md` (Task 1–10)
- `docs/superpowers/plans/2026-09-18-bul-1a-web.md` (Task 11–18)

**Spec:** `docs/superpowers/specs/2026-09-18-bul-aplikasi-baru-design.md`

## Lokasi kerja

| | |
|---|---|
| Worktree Codex (satu-satunya tempat menulis) | `C:\Project\.worktrees\bul\fase-1a` |
| Branch | `codex/bul/fase-1a` |
| Root aplikasi | `C:\Project\.worktrees\bul\fase-1a\apps\bul` |
| Root frontend | `C:\Project\.worktrees\bul\fase-1a\apps\bul\web` |
| DB lokal | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |

## Prasyarat (user, sekali saja)

1. Docker Desktop menyala.
2. Setelah Batch A membuat `apps/bul/supabase/config.toml`: bila Codex gagal menjalankan `npx supabase start` (sandbox tidak bisa menyentuh Docker), jalankan sendiri di PowerShell:
   ```powershell
   cd C:\Project\.worktrees\bul\fase-1a\apps\bul
   npx supabase start
   ```
   Container tetap hidup antar-batch. Hentikan dengan `npx supabase stop` bila sudah selesai semua.

## Cara meluncurkan Codex

Satu sesi Codex per batch. Dari PowerShell:

```powershell
codex -C "C:/Project/.worktrees/bul/fase-1a" -m <MODEL> -c model_reasoning_effort="<EFFORT>" --sandbox workspace-write -c sandbox_workspace_write.network_access=true
```

Lalu tempel prompt batch. `network_access=true` diperlukan untuk `npm install` dan akses ke port DB lokal.

## Pembagian batch

| Batch | Task | Isi | Model | Effort | Alasan |
|---|---|---|---|---|---|
| A | 1–2 | Kerangka, harness tes, fondasi, master data | `gpt-5.6-terra` | `high` | Banyak file tetapi pola jelas; harness tes harus benar dari awal |
| B | 3 | COA, mesin jurnal, jurnal manual | `gpt-6-astra` | `high` | Inti akuntansi: trigger tertunda, kekekalan jurnal |
| C | 4–5 | Surat jalan + invoice | `gpt-6-astra` | `xhigh` | Posting upah/UJ/pendapatan, penguncian baris, pembalik |
| D | 6–7 | Pembayaran + saldo awal | `gpt-6-astra` | `high` | Alokasi multi-invoice, PPh, invoice saldo awal |
| E | 8–9 | Kas/bank + laporan | `gpt-6-astra` | `high` | Laporan neraca/laba harus seimbang dengan angka tes |
| F | 10 | Gerbang keamanan katalog | `gpt-6-astra` | `high` | Temuan harus diperbaiki di migrasi asal |
| G | 11–12 | Scaffold web, auth, master | `gpt-5.6-terra` | `medium` | Kode sudah lengkap di plan |
| H | 13–14 | SJ + invoice + kwitansi | `gpt-5.6-terra` | `high` | Alur operasional utama, pratinjau server |
| I | 15–16 | Pembayaran, kas, akuntansi | `gpt-5.6-terra` | `medium` | Kode lengkap di plan |
| J | 17–18 | Laporan, backup, runbook | `gpt-5.6-terra` | `medium` | Kode lengkap di plan |

Bila sebuah batch gagal dua kali di langkah yang sama, naikkan satu tingkat (`terra`→`astra`, atau effort +1) sebelum mencoba lagi. `gpt-5.6-luna`/`sol` tidak dipakai di 1a karena setiap task menyentuh logika uang atau hak akses.

## Siklus per batch

1. User meluncurkan Codex dengan model/effort tabel di atas dan menempel prompt batch.
2. Codex mengerjakan, menjalankan validasi, commit per task, dan melaporkan hasil.
3. User meminta Claude: "review batch X di `C:\Project\.worktrees\bul\fase-1a`".
4. Claude membaca diff dan menjalankan tes (read-only). Temuan blocking → prompt perbaikan untuk Codex. Maksimal dua siklus; setelah itu eskalasi ke user.
5. Lanjut batch berikutnya.

---

## Blok aturan bersama (sudah termasuk di setiap prompt)

```
ATURAN TETAP
- Kerja HANYA di C:\Project\.worktrees\bul\fase-1a, branch codex/bul/fase-1a. Jangan pindah branch, jangan buat worktree lain.
- Jangan menyentuh apps/bul-monitor, apps/bul-accounting, apps/sj-monitor, apps/erp-acc, shared/.
- Ikuti plan PERSIS: nama file, nama fungsi, parameter, kode error, dan isi tes. Bila plan tampak salah, BERHENTI dan laporkan (kutip langkahnya), jangan improvisasi pada logika uang/jurnal/hak akses.
- TDD: tulis tes → jalankan & lihat gagal → implementasi → jalankan & lihat lulus → commit. Satu commit per task, pesan conventional commit bahasa Inggris seperti di plan.
- DILARANG: supabase link, supabase db push, deploy apa pun, mengubah project Supabase produksi, git push, git push --force, git reset --hard, menghapus data di luar DB lokal, mengedit migrasi task sebelumnya kecuali plan/tes keamanan memintanya.
- Tes DB hanya ke 127.0.0.1:54322. Jika Docker/Supabase lokal tidak bisa dijalankan dari sandbox, BERHENTI dan minta user menjalankan `npx supabase start` dari C:\Project\.worktrees\bul\fase-1a\apps\bul.
- Laporan akhir dalam Bahasa Indonesia: daftar commit (hash + pesan), perintah validasi + ringkasan hasil (jumlah tes lulus/gagal), file yang dibuat/diubah, dan hal yang menyimpang dari plan (atau "tidak ada").
```

---

## Prompt Batch A — model `gpt-5.6-terra`, effort `high`

```
Anda mengimplementasikan aplikasi BUL baru (Supabase + React) mengikuti plan tertulis.

Baca dulu seluruhnya:
- docs/superpowers/specs/2026-09-18-bul-aplikasi-baru-design.md
- docs/superpowers/plans/2026-09-18-bul-1a-database.md

Kerjakan HANYA Task 1 dan Task 2 dari plan database, langkah demi langkah sesuai checkbox.

Catatan khusus:
- Task 1 Step 4 (`npx supabase start`) butuh Docker. Coba sekali. Jika gagal karena izin/pipe Docker, berhenti di situ dan minta user menjalankannya; lanjutkan setelah user bilang sudah jalan (cek dengan `npx supabase status`).
- Semua tes DB dijalankan dari apps/bul dengan `npm run test:db`.
- Selesai Task 2, jalankan `npm run test:db` penuh sekali lagi.

ATURAN TETAP
- Kerja HANYA di C:\Project\.worktrees\bul\fase-1a, branch codex/bul/fase-1a. Jangan pindah branch, jangan buat worktree lain.
- Jangan menyentuh apps/bul-monitor, apps/bul-accounting, apps/sj-monitor, apps/erp-acc, shared/.
- Ikuti plan PERSIS: nama file, nama fungsi, parameter, kode error, dan isi tes. Bila plan tampak salah, BERHENTI dan laporkan (kutip langkahnya), jangan improvisasi pada logika uang/jurnal/hak akses.
- TDD: tulis tes → jalankan & lihat gagal → implementasi → jalankan & lihat lulus → commit. Satu commit per task, pesan conventional commit bahasa Inggris seperti di plan.
- DILARANG: supabase link, supabase db push, deploy apa pun, mengubah project Supabase produksi, git push, git push --force, git reset --hard, menghapus data di luar DB lokal, mengedit migrasi task sebelumnya kecuali plan/tes keamanan memintanya.
- Tes DB hanya ke 127.0.0.1:54322. Jika Docker/Supabase lokal tidak bisa dijalankan dari sandbox, BERHENTI dan minta user menjalankan `npx supabase start` dari C:\Project\.worktrees\bul\fase-1a\apps\bul.
- Laporan akhir dalam Bahasa Indonesia: daftar commit (hash + pesan), perintah validasi + ringkasan hasil (jumlah tes lulus/gagal), file yang dibuat/diubah, dan hal yang menyimpang dari plan (atau "tidak ada").
```

## Prompt Batch B — model `gpt-6-astra`, effort `high`

```
Lanjutkan implementasi BUL. Task 1–2 plan database sudah selesai dan di-review.

Baca:
- docs/superpowers/specs/2026-09-18-bul-aplikasi-baru-design.md (bagian 4, 7, 9)
- docs/superpowers/plans/2026-09-18-bul-1a-database.md — Global Constraints dan Task 3

Kerjakan HANYA Task 3 (COA, pengaturan posting & pajak, kunci periode, mesin jurnal, jurnal manual).

Catatan khusus:
- Blok 160 baris VALUES COA di Task 3 harus disalin PERSIS ke migrasi (menggantikan baris komentar). Jangan mengetik ulang atau mengurutkan ulang. Setelah migrasi diterapkan, pastikan `select count(*) from public.akun` = 160.
- Jurnal harus tetap tidak bisa diubah/dihapus bahkan oleh superuser (trigger), dan keseimbangan dicek saat COMMIT (constraint trigger deferrable).
- Mulai dengan `npm run test:db` untuk memastikan baseline hijau. Akhiri dengan `npm run test:db` penuh.

ATURAN TETAP
- Kerja HANYA di C:\Project\.worktrees\bul\fase-1a, branch codex/bul/fase-1a. Jangan pindah branch, jangan buat worktree lain.
- Jangan menyentuh apps/bul-monitor, apps/bul-accounting, apps/sj-monitor, apps/erp-acc, shared/.
- Ikuti plan PERSIS: nama file, nama fungsi, parameter, kode error, dan isi tes. Bila plan tampak salah, BERHENTI dan laporkan (kutip langkahnya), jangan improvisasi pada logika uang/jurnal/hak akses.
- TDD: tulis tes → jalankan & lihat gagal → implementasi → jalankan & lihat lulus → commit. Satu commit per task, pesan conventional commit bahasa Inggris seperti di plan.
- DILARANG: supabase link, supabase db push, deploy apa pun, mengubah project Supabase produksi, git push, git push --force, git reset --hard, menghapus data di luar DB lokal, mengedit migrasi task sebelumnya kecuali plan/tes keamanan memintanya.
- Tes DB hanya ke 127.0.0.1:54322. Jika Docker/Supabase lokal tidak bisa dijalankan dari sandbox, BERHENTI dan minta user menjalankan `npx supabase start` dari C:\Project\.worktrees\bul\fase-1a\apps\bul.
- Laporan akhir dalam Bahasa Indonesia: daftar commit (hash + pesan), perintah validasi + ringkasan hasil (jumlah tes lulus/gagal), file yang dibuat/diubah, dan hal yang menyimpang dari plan (atau "tidak ada").
```

## Prompt Batch C — model `gpt-6-astra`, effort `xhigh`

```
Lanjutkan implementasi BUL. Task 1–3 plan database sudah selesai dan di-review.

Baca:
- docs/superpowers/specs/2026-09-18-bul-aplikasi-baru-design.md (bagian 2 K5, K7, K8 dan bagian 7)
- docs/superpowers/plans/2026-09-18-bul-1a-database.md — Global Constraints, Task 4, Task 5

Kerjakan Task 4 (surat jalan) lalu Task 5 (invoice), berurutan, satu commit per task.

Aturan bisnis yang WAJIB tetap benar (tes plan menjaganya):
- Upah diakui saat SJ selesai: Dr beban upah / Cr hutang upah, dimensi supir-truk-pelanggan-rute-lini. Upah dicari menurut TANGGAL SJ.
- Invoice: Dr piutang = total akhir (bruto − uang jalan); per SJ Dr beban uang jalan dan Cr pendapatan = round(qty_bongkar × tarif, 2). Tarif dipilih menurut TANGGAL SJ.
- SJ yang sudah diinvoice tidak bisa dibatalkan; batal invoice melepas SJ dan membuat jurnal pembalik.
- `internal.total_alokasi_invoice` di Task 5 sengaja stub (mengembalikan 0); diganti di Task 6. Jangan membuat tabel pembayaran sekarang.
- Penerbitan harus mengunci baris SJ (`for update`) sebelum validasi.

Mulai dengan `npm run test:db` (baseline). Akhiri dengan `npm run test:db` penuh.

ATURAN TETAP
- Kerja HANYA di C:\Project\.worktrees\bul\fase-1a, branch codex/bul/fase-1a. Jangan pindah branch, jangan buat worktree lain.
- Jangan menyentuh apps/bul-monitor, apps/bul-accounting, apps/sj-monitor, apps/erp-acc, shared/.
- Ikuti plan PERSIS: nama file, nama fungsi, parameter, kode error, dan isi tes. Bila plan tampak salah, BERHENTI dan laporkan (kutip langkahnya), jangan improvisasi pada logika uang/jurnal/hak akses.
- TDD: tulis tes → jalankan & lihat gagal → implementasi → jalankan & lihat lulus → commit. Satu commit per task, pesan conventional commit bahasa Inggris seperti di plan.
- DILARANG: supabase link, supabase db push, deploy apa pun, mengubah project Supabase produksi, git push, git push --force, git reset --hard, menghapus data di luar DB lokal, mengedit migrasi task sebelumnya kecuali plan/tes keamanan memintanya.
- Tes DB hanya ke 127.0.0.1:54322. Jika Docker/Supabase lokal tidak bisa dijalankan dari sandbox, BERHENTI dan minta user menjalankan `npx supabase start` dari C:\Project\.worktrees\bul\fase-1a\apps\bul.
- Laporan akhir dalam Bahasa Indonesia: daftar commit (hash + pesan), perintah validasi + ringkasan hasil (jumlah tes lulus/gagal), file yang dibuat/diubah, dan hal yang menyimpang dari plan (atau "tidak ada").
```

## Prompt Batch D — model `gpt-6-astra`, effort `high`

```
Lanjutkan implementasi BUL. Task 1–5 plan database sudah selesai dan di-review.

Baca:
- docs/superpowers/specs/2026-09-18-bul-aplikasi-baru-design.md (K9, K11, bagian 7)
- docs/superpowers/plans/2026-09-18-bul-1a-database.md — Global Constraints, Task 6, Task 7

Kerjakan Task 6 (pembayaran pelanggan) lalu Task 7 (saldo awal), satu commit per task.

Aturan bisnis yang WAJIB tetap benar:
- Pembayaran: Dr kas/bank = diterima, Dr beban PPh final = PPh dipotong, Cr piutang per invoice = alokasi. Σ alokasi = diterima + PPh. Alokasi tidak boleh melebihi sisa invoice.
- Saran PPh = round(subtotal BRUTO × tarif, 0), hanya jika PP 55 aktif, pelanggan pemotong, dan bukan invoice saldo awal.
- Task 6 MENGGANTI `internal.total_alokasi_invoice` dengan `create or replace` di migrasi 0600. Jangan mengedit migrasi 0500.
- Hanya satu jurnal saldo awal aktif. Piutang lama dicatat sebagai invoice `saldo_awal` TANPA jurnal.

Mulai dengan `npm run test:db` (baseline). Akhiri dengan `npm run test:db` penuh (tes invoice Task 5 harus tetap lulus).

ATURAN TETAP
- Kerja HANYA di C:\Project\.worktrees\bul\fase-1a, branch codex/bul/fase-1a. Jangan pindah branch, jangan buat worktree lain.
- Jangan menyentuh apps/bul-monitor, apps/bul-accounting, apps/sj-monitor, apps/erp-acc, shared/.
- Ikuti plan PERSIS: nama file, nama fungsi, parameter, kode error, dan isi tes. Bila plan tampak salah, BERHENTI dan laporkan (kutip langkahnya), jangan improvisasi pada logika uang/jurnal/hak akses.
- TDD: tulis tes → jalankan & lihat gagal → implementasi → jalankan & lihat lulus → commit. Satu commit per task, pesan conventional commit bahasa Inggris seperti di plan.
- DILARANG: supabase link, supabase db push, deploy apa pun, mengubah project Supabase produksi, git push, git push --force, git reset --hard, menghapus data di luar DB lokal, mengedit migrasi task sebelumnya kecuali plan/tes keamanan memintanya.
- Tes DB hanya ke 127.0.0.1:54322. Jika Docker/Supabase lokal tidak bisa dijalankan dari sandbox, BERHENTI dan minta user menjalankan `npx supabase start` dari C:\Project\.worktrees\bul\fase-1a\apps\bul.
- Laporan akhir dalam Bahasa Indonesia: daftar commit (hash + pesan), perintah validasi + ringkasan hasil (jumlah tes lulus/gagal), file yang dibuat/diubah, dan hal yang menyimpang dari plan (atau "tidak ada").
```

## Prompt Batch E — model `gpt-6-astra`, effort `high`

```
Lanjutkan implementasi BUL. Task 1–7 plan database sudah selesai dan di-review.

Baca:
- docs/superpowers/specs/2026-09-18-bul-aplikasi-baru-design.md (bagian 7 dan 8)
- docs/superpowers/plans/2026-09-18-bul-1a-database.md — Global Constraints, Task 8, Task 9

Kerjakan Task 8 (kas & bank) lalu Task 9 (laporan), satu commit per task.

Catatan khusus:
- Baris kas tidak boleh berupa akun kas/bank (pakai transfer) atau piutang usaha (pakai pembayaran). Baris hutang upah wajib supir.
- Semua fungsi laporan adalah fungsi baca `security invoker` (tanpa `security definer`), sehingga tunduk pada RLS.
- Skenario tes laporan memakai angka pasti (laba Februari 110.412; kas 10.110.412; neraca seimbang). Jika angka tidak cocok, cari penyebab di SQL laporan; JANGAN mengubah angka yang diharapkan tes.

Mulai dengan `npm run test:db` (baseline). Akhiri dengan `npm run test:db` penuh.

ATURAN TETAP
- Kerja HANYA di C:\Project\.worktrees\bul\fase-1a, branch codex/bul/fase-1a. Jangan pindah branch, jangan buat worktree lain.
- Jangan menyentuh apps/bul-monitor, apps/bul-accounting, apps/sj-monitor, apps/erp-acc, shared/.
- Ikuti plan PERSIS: nama file, nama fungsi, parameter, kode error, dan isi tes. Bila plan tampak salah, BERHENTI dan laporkan (kutip langkahnya), jangan improvisasi pada logika uang/jurnal/hak akses.
- TDD: tulis tes → jalankan & lihat gagal → implementasi → jalankan & lihat lulus → commit. Satu commit per task, pesan conventional commit bahasa Inggris seperti di plan.
- DILARANG: supabase link, supabase db push, deploy apa pun, mengubah project Supabase produksi, git push, git push --force, git reset --hard, menghapus data di luar DB lokal, mengedit migrasi task sebelumnya kecuali plan/tes keamanan memintanya.
- Tes DB hanya ke 127.0.0.1:54322. Jika Docker/Supabase lokal tidak bisa dijalankan dari sandbox, BERHENTI dan minta user menjalankan `npx supabase start` dari C:\Project\.worktrees\bul\fase-1a\apps\bul.
- Laporan akhir dalam Bahasa Indonesia: daftar commit (hash + pesan), perintah validasi + ringkasan hasil (jumlah tes lulus/gagal), file yang dibuat/diubah, dan hal yang menyimpang dari plan (atau "tidak ada").
```

## Prompt Batch F — model `gpt-6-astra`, effort `high`

```
Lanjutkan implementasi BUL. Task 1–9 plan database sudah selesai dan di-review.

Baca:
- docs/superpowers/plans/2026-09-18-bul-1a-database.md — Global Constraints dan Task 10

Kerjakan Task 10 (gerbang keamanan berbasis katalog).

Catatan khusus:
- Tes ini memeriksa SELURUH tabel, view, dan fungsi. Bila ada yang gagal, perbaiki di MIGRASI ASAL objek tersebut (bukan migrasi tambalan baru), karena belum ada yang di-push ke produksi. Laporkan setiap perbaikan: objek, migrasi, alasan.
- Jangan melonggarkan tes agar lulus (misalnya menghapus fungsi dari pemeriksaan). Jika menurut Anda tes salah, BERHENTI dan jelaskan.
- Akhiri dengan `npm run test:db && npm run test:db` (dua kali, membuktikan reset idempoten).

ATURAN TETAP
- Kerja HANYA di C:\Project\.worktrees\bul\fase-1a, branch codex/bul/fase-1a. Jangan pindah branch, jangan buat worktree lain.
- Jangan menyentuh apps/bul-monitor, apps/bul-accounting, apps/sj-monitor, apps/erp-acc, shared/.
- Ikuti plan PERSIS: nama file, nama fungsi, parameter, kode error, dan isi tes. Bila plan tampak salah, BERHENTI dan laporkan (kutip langkahnya), jangan improvisasi pada logika uang/jurnal/hak akses.
- TDD: tulis tes → jalankan & lihat gagal → implementasi → jalankan & lihat lulus → commit. Satu commit per task, pesan conventional commit bahasa Inggris seperti di plan.
- DILARANG: supabase link, supabase db push, deploy apa pun, mengubah project Supabase produksi, git push, git push --force, git reset --hard, menghapus data di luar DB lokal, mengedit migrasi task sebelumnya kecuali plan/tes keamanan memintanya.
- Tes DB hanya ke 127.0.0.1:54322. Jika Docker/Supabase lokal tidak bisa dijalankan dari sandbox, BERHENTI dan minta user menjalankan `npx supabase start` dari C:\Project\.worktrees\bul\fase-1a\apps\bul.
- Laporan akhir dalam Bahasa Indonesia: daftar commit (hash + pesan), perintah validasi + ringkasan hasil (jumlah tes lulus/gagal), file yang dibuat/diubah, dan hal yang menyimpang dari plan (atau "tidak ada").
```

## Prompt Batch G — model `gpt-5.6-terra`, effort `medium`

```
Lanjutkan implementasi BUL: sekarang frontend. Database (Task 1–10) sudah selesai dan di-review.

Baca:
- docs/superpowers/plans/2026-09-18-bul-1a-web.md — header, Global Constraints, File Structure, Task 11, Task 12

Kerjakan Task 11 (scaffold, library inti, auth, layout) lalu Task 12 (TabelMaster, halaman master, Pengguna), satu commit per task.

Catatan khusus:
- Semua perintah npm untuk frontend dijalankan dari apps/bul/web. Validasi tiap task: `npm test` dan `npm run build`.
- Jika react@19 / antd@6 / vite@8 tidak tersedia, BERHENTI dan laporkan versi yang ada.
- Langkah "Uji manual" butuh Supabase lokal dan login. Jika Anda tidak bisa membuka browser, lewati langkah itu dan tulis di laporan bahwa uji manual belum dilakukan (jangan mengklaim sudah).
- Jangan commit `.env.local`.

ATURAN TETAP
- Kerja HANYA di C:\Project\.worktrees\bul\fase-1a, branch codex/bul/fase-1a. Jangan pindah branch, jangan buat worktree lain.
- Jangan menyentuh apps/bul-monitor, apps/bul-accounting, apps/sj-monitor, apps/erp-acc, shared/.
- Ikuti plan PERSIS: nama file, nama fungsi, parameter, kode error, dan isi tes. Bila plan tampak salah, BERHENTI dan laporkan (kutip langkahnya), jangan improvisasi pada logika uang/jurnal/hak akses.
- TDD: tulis tes → jalankan & lihat gagal → implementasi → jalankan & lihat lulus → commit. Satu commit per task, pesan conventional commit bahasa Inggris seperti di plan.
- DILARANG: supabase link, supabase db push, deploy apa pun, mengubah project Supabase produksi, git push, git push --force, git reset --hard, menghapus data di luar DB lokal, mengedit migrasi task sebelumnya kecuali plan/tes keamanan memintanya.
- Tes DB hanya ke 127.0.0.1:54322. Jika Docker/Supabase lokal tidak bisa dijalankan dari sandbox, BERHENTI dan minta user menjalankan `npx supabase start` dari C:\Project\.worktrees\bul\fase-1a\apps\bul.
- Laporan akhir dalam Bahasa Indonesia: daftar commit (hash + pesan), perintah validasi + ringkasan hasil (jumlah tes lulus/gagal), file yang dibuat/diubah, dan hal yang menyimpang dari plan (atau "tidak ada").
```

## Prompt Batch H — model `gpt-5.6-terra`, effort `high`

```
Lanjutkan frontend BUL. Task 11–12 sudah selesai dan di-review.

Baca:
- docs/superpowers/plans/2026-09-18-bul-1a-web.md — Global Constraints, Task 13, Task 14

Kerjakan Task 13 (surat jalan) lalu Task 14 (invoice, detail, kwitansi cetak), satu commit per task.

Catatan khusus:
- Angka invoice yang ditampilkan saat pratinjau berasal dari `pratinjau_invoice` (server). Klien hanya menjumlah dengan `hitungRingkasan` (BigInt sen). Jangan menghitung harga/tarif di klien.
- Route `/invoice/baru` harus didaftarkan sebelum `/invoice/:id`.
- Tombol simpan/terbit memakai `TombolAksi` agar tidak terkirim dua kali.
- Validasi tiap task dari apps/bul/web: `npm test` dan `npm run build`. Uji manual hanya jika Anda bisa membuka browser; jika tidak, katakan belum dilakukan.

ATURAN TETAP
- Kerja HANYA di C:\Project\.worktrees\bul\fase-1a, branch codex/bul/fase-1a. Jangan pindah branch, jangan buat worktree lain.
- Jangan menyentuh apps/bul-monitor, apps/bul-accounting, apps/sj-monitor, apps/erp-acc, shared/.
- Ikuti plan PERSIS: nama file, nama fungsi, parameter, kode error, dan isi tes. Bila plan tampak salah, BERHENTI dan laporkan (kutip langkahnya), jangan improvisasi pada logika uang/jurnal/hak akses.
- TDD: tulis tes → jalankan & lihat gagal → implementasi → jalankan & lihat lulus → commit. Satu commit per task, pesan conventional commit bahasa Inggris seperti di plan.
- DILARANG: supabase link, supabase db push, deploy apa pun, mengubah project Supabase produksi, git push, git push --force, git reset --hard, menghapus data di luar DB lokal, mengedit migrasi task sebelumnya kecuali plan/tes keamanan memintanya.
- Tes DB hanya ke 127.0.0.1:54322. Jika Docker/Supabase lokal tidak bisa dijalankan dari sandbox, BERHENTI dan minta user menjalankan `npx supabase start` dari C:\Project\.worktrees\bul\fase-1a\apps\bul.
- Laporan akhir dalam Bahasa Indonesia: daftar commit (hash + pesan), perintah validasi + ringkasan hasil (jumlah tes lulus/gagal), file yang dibuat/diubah, dan hal yang menyimpang dari plan (atau "tidak ada").
```

## Prompt Batch I — model `gpt-5.6-terra`, effort `medium`

```
Lanjutkan frontend BUL. Task 11–14 sudah selesai dan di-review.

Baca:
- docs/superpowers/plans/2026-09-18-bul-1a-web.md — Global Constraints, Task 15, Task 16

Kerjakan Task 15 (pembayaran & kas/bank) lalu Task 16 (daftar akun, pengaturan, jurnal, buku besar, saldo awal), satu commit per task.

Catatan khusus:
- Semua penjumlahan uang di klien memakai helper `src/lib/uang.js` (BigInt sen). `parseFloat` dilarang (tes `larangan.test.js` akan gagal).
- `FormJurnalManual` dipakai ulang untuk saldo awal lewat prop `rpc`, `denganKeterangan`, `tanggalAwal`, `info`.
- Validasi tiap task dari apps/bul/web: `npm test` dan `npm run build`. Uji manual hanya jika bisa membuka browser; jika tidak, katakan belum dilakukan.

ATURAN TETAP
- Kerja HANYA di C:\Project\.worktrees\bul\fase-1a, branch codex/bul/fase-1a. Jangan pindah branch, jangan buat worktree lain.
- Jangan menyentuh apps/bul-monitor, apps/bul-accounting, apps/sj-monitor, apps/erp-acc, shared/.
- Ikuti plan PERSIS: nama file, nama fungsi, parameter, kode error, dan isi tes. Bila plan tampak salah, BERHENTI dan laporkan (kutip langkahnya), jangan improvisasi pada logika uang/jurnal/hak akses.
- TDD: tulis tes → jalankan & lihat gagal → implementasi → jalankan & lihat lulus → commit. Satu commit per task, pesan conventional commit bahasa Inggris seperti di plan.
- DILARANG: supabase link, supabase db push, deploy apa pun, mengubah project Supabase produksi, git push, git push --force, git reset --hard, menghapus data di luar DB lokal, mengedit migrasi task sebelumnya kecuali plan/tes keamanan memintanya.
- Tes DB hanya ke 127.0.0.1:54322. Jika Docker/Supabase lokal tidak bisa dijalankan dari sandbox, BERHENTI dan minta user menjalankan `npx supabase start` dari C:\Project\.worktrees\bul\fase-1a\apps\bul.
- Laporan akhir dalam Bahasa Indonesia: daftar commit (hash + pesan), perintah validasi + ringkasan hasil (jumlah tes lulus/gagal), file yang dibuat/diubah, dan hal yang menyimpang dari plan (atau "tidak ada").
```

## Prompt Batch J — model `gpt-5.6-terra`, effort `medium`

```
Selesaikan fase 1a BUL. Task 11–16 sudah selesai dan di-review.

Baca:
- docs/superpowers/plans/2026-09-18-bul-1a-web.md — Global Constraints, Task 17, Task 18

Kerjakan Task 17 (laporan, CSV, beranda) lalu Task 18 (workflow backup + runbook), satu commit per task.

Catatan khusus:
- Workflow `.github/workflows/bul-backup.yml` dibuat di ROOT repo worktree, tetapi JANGAN dijalankan, jangan membuat secret, jangan push.
- Runbook berisi perintah yang dijalankan USER (link/db push/Cloudflare). Anda hanya menulis dokumennya; jangan menjalankan perintah itu.
- Validasi akhir (Task 18 Step 5): `npm run test:db` dari apps/bul, lalu `npm test` dan `npm run build` dari apps/bul/web. Laporkan ringkasan ketiganya.

ATURAN TETAP
- Kerja HANYA di C:\Project\.worktrees\bul\fase-1a, branch codex/bul/fase-1a. Jangan pindah branch, jangan buat worktree lain.
- Jangan menyentuh apps/bul-monitor, apps/bul-accounting, apps/sj-monitor, apps/erp-acc, shared/.
- Ikuti plan PERSIS: nama file, nama fungsi, parameter, kode error, dan isi tes. Bila plan tampak salah, BERHENTI dan laporkan (kutip langkahnya), jangan improvisasi pada logika uang/jurnal/hak akses.
- TDD: tulis tes → jalankan & lihat gagal → implementasi → jalankan & lihat lulus → commit. Satu commit per task, pesan conventional commit bahasa Inggris seperti di plan.
- DILARANG: supabase link, supabase db push, deploy apa pun, mengubah project Supabase produksi, git push, git push --force, git reset --hard, menghapus data di luar DB lokal, mengedit migrasi task sebelumnya kecuali plan/tes keamanan memintanya.
- Tes DB hanya ke 127.0.0.1:54322. Jika Docker/Supabase lokal tidak bisa dijalankan dari sandbox, BERHENTI dan minta user menjalankan `npx supabase start` dari C:\Project\.worktrees\bul\fase-1a\apps\bul.
- Laporan akhir dalam Bahasa Indonesia: daftar commit (hash + pesan), perintah validasi + ringkasan hasil (jumlah tes lulus/gagal), file yang dibuat/diubah, dan hal yang menyimpang dari plan (atau "tidak ada").
```

## Setelah Batch J (keputusan user)

- Review akhir seluruh branch oleh Claude (`accounting-reviewer` + `security-reviewer`).
- User memutuskan: push branch & PR, membuat project Supabase "bul", `db push`, Cloudflare Pages, secret backup (lihat `apps/bul/docs/runbook.md`).
- Sub-proyek 1b, 2 (impor Drive), dan 3 (cutover) dibuat spec terpisah.
