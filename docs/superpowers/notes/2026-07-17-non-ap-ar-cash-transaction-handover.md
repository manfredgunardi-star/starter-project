# Handover — Fitur Transaksi Kas Non-Hutang/Piutang (erp-acc)

Status per **2026-07-17**. Dokumen ini untuk melanjutkan sesi setelah sesi chat lama dihapus.

## Ringkasan Task

User (accountant/tax professional) butuh cara mencatat transaksi kas/bank yang **tidak** punya lawan AP/AR (biaya admin bank, beban dibayar dimuka, beban pajak). Sudah brainstorming (skill `brainstorming`) dan **Opsi C disetujui**: halaman baru di bawah Kas & Bank + RPC baru `post_general_cash_transaction`, reuse komponen line-editor yang diekstrak dari halaman Manual Journal.

Rencana implementasi dibuat via skill `/writing-plans`, khusus disesuaikan untuk **dieksekusi oleh Codex GPT-5.6**, bukan Claude langsung. Codex adalah satu-satunya implementer (menulis kode/migration di worktree-nya sendiri); Claude berperan sebagai reviewer/analis rencana dan penyusun prompt per task, **lockstep** (user secara eksplisit memilih ini, bukan memberi Codex otonomi penuh).

## Artefak Kunci

- **Spec**: `docs/superpowers/specs/2026-07-16-transaksi-kas-non-hutang-piutang-design.md`
- **Plan** (dokumen utama, terus diedit sepanjang sesi): `docs/superpowers/plans/2026-07-16-transaksi-kas-non-hutang-piutang.md`
  - Berisi Global Constraints (~18 poin, akumulasi pelajaran dari setiap insiden Codex) dan Self-Review dengan 10 "Revision note" — log insiden otoritatif. **Baca file ini dulu** sebelum lanjut, isinya terlalu besar untuk disalin ulang di sini.
- **Worktree Codex**: `C:\Project\.worktrees\erp-acc\non-ap-ar-cash-transaction`
- **Branch**: `codex/erp-acc/non-ap-ar-cash-transaction`

## Skema Penamaan Model Codex (custom, tidak ada di config manapun)

- **Sol** = setara Opus (effort tinggi, task kompleks/berisiko — migration, RPC, security logic)
- **Terra** = setara Sonnet (effort medium — ekstraksi komponen, halaman form)
- **Luna** = setara Haiku (effort rendah — task mekanis: service function, routing, sidebar)

Setiap prompt Codex harus: (1) menyebut model/effort ini secara eksplisit di awal, (2) menginstruksikan Codex memakai skill `/subagent-driven-development` miliknya, (3) menyuruh Codex **STOP** dan lapor balik dengan format tetap begitu task berikutnya butuh model/effort berbeda.

## STATUS TERKINI — SUDAH TERVERIFIKASI LANGSUNG DARI GIT (2026-07-17)

Saya cek langsung `git -C` ke worktree Codex (bukan cuma dari laporan chat) dan konfirmasi:

```
branch codex/erp-acc/non-ap-ar-cash-transaction, working tree BERSIH
6532da6 feat(erp-acc): add post_general_cash_transaction RPC and prepaid/tax COA accounts
c7d46ca fix(erp-acc): restore missing guards and add idempotency to post_manual_journal
741c29d docs: add implementation plan for non-AP/AR cash transaction feature (erp-acc)
...
```

Migration files ada dan lengkap:
- `apps/erp-acc/erp-app/supabase/migrations/043_fix_post_manual_journal_guards.sql` ✅ committed
- `apps/erp-acc/erp-app/supabase/migrations/044_general_cash_transaction.sql` ✅ committed

**Kesimpulan: Task 0 (hotfix) dan Task 1 (RPC + COA) SUDAH SELESAI dan ter-commit.** Masalah `git commit` yang gagal dengan error Windows IO (`code 267, NotADirectory`) yang jadi topik terakhir sebelum sesi lama ditutup **sudah teratasi** — commit `6532da6` berhasil (kemungkinan besar mitigasi `git -C "<path>" <command>` yang ditambahkan ke plan berhasil, atau errornya memang transient). Root cause pastinya tidak pernah terkonfirmasi 100% — sudah dicatat apa adanya di plan (Revision note 10), jangan diklaim lebih pasti dari itu kalau ditanya user.

**PENTING**: Laporan resmi dari Codex ke user dengan format baku ("Task 0 dan Task 1 selesai...") **belum pernah diterima/di-relay ke chat** — sesi lama ditutup sebelum itu terjadi. Tapi berdasarkan bukti git langsung, faktanya sudah selesai. Kalau lanjut sesi baru, sampaikan status ini ke user berdasarkan bukti git, bukan menunggu laporan Codex yang mungkin tidak akan pernah datang (sesi Codex sebelumnya mungkin juga sudah berakhir).

## Migrasi ke Supabase — BELUM DIAPPROVE

`043_fix_post_manual_journal_guards.sql` dan `044_general_cash_transaction.sql` **belum diterapkan** ke Supabase manapun (dev/staging/prod). User belum memberi approval eksplisit untuk apply. Jangan sarankan/jalankan apply command sampai user menyetujui secara eksplisit, dan urutannya harus 043 dulu baru 044.

## Task yang Tersisa (belum dikerjakan Codex)

- **Task 2** (Terra/medium): Ekstrak `src/components/journal/JournalLinesEditor.jsx` dari `src/pages/accounting/ManualJournalFormPage.jsx` (default export komponen + named export `emptyJournalLine()`, `computeJournalTotals(items)`).
- **Task 3** (Luna/low): Tambah `saveGeneralCashTransaction({ date, description, lines })` di `src/services/cashBankService.js`, panggil RPC `post_general_cash_transaction`.
- **Task 4** (Terra/medium): Halaman baru `src/pages/cash/GeneralCashTransactionFormPage.jsx` — create-only, pakai `JournalLinesEditor`, validasi min 2 baris + minimal satu `account_id` + balance sebelum submit.
- **Task 5** (Luna/low): Edit `src/App.jsx` (route baru `cash/general-transactions/new`, `RoleGuard require="canWrite"`), `src/components/layout/Sidebar.jsx` (item baru "Transaksi Lainnya" di grup Kas & Bank), `src/services/journalService.js` (tambah `reference_type` ke select `getJournals()`), `src/pages/accounting/JournalsPage.jsx` (Tag baru "Kas Lainnya" untuk `reference_type === 'general_cash_transaction'`).
- **Task 6** (Luna/low): `playwright/general-cash-transaction.spec.js` — smoke test non-mutating terhadap `LIVE_URL = 'https://erp-app-bay.vercel.app'`, ikuti pola `playwright/bank-journal-payment-adjustments.spec.js`.

Kode lengkap tiap task sudah ada di dalam file plan (`docs/superpowers/plans/2026-07-16-transaksi-kas-non-hutang-piutang.md`) — jangan menulis ulang dari nol, baca dulu isi plan-nya karena sudah sangat detail dan sudah melalui banyak koreksi.

## Setelah Task 6

Sesuai step terakhir di plan: Codex melapor semua task selesai tapi migration 043/044 masih menunggu approval user untuk diterapkan ke Supabase. Full end-to-end manual testing + re-run Playwright baru dilakukan setelah migration diterapkan (di dev/staging dulu, tidak pernah production).

## Cara Berinteraksi (WAJIB dipatuhi — pilihan eksplisit user)

User memilih **tetap lockstep lewat Claude**, bukan memberi Codex otonomi luas untuk Task 2-6. Pola per putaran:
1. User paste laporan/STOP dari Codex.
2. Claude analisa (root cause, apakah ini bug rencana atau temuan valid Codex).
3. Kalau perlu, Claude edit `plan.md` untuk perbaikan (Global Constraints atau task detail), commit perubahan plan dengan pesan conventional commit + `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
4. Claude susun prompt Codex berikutnya: sebutkan model (Sol/Terra/Luna) + effort eksplisit, instruksikan pakai `/subagent-driven-development`, instruksikan STOP kalau task berikutnya butuh model beda, sertakan format laporan balik yang konsisten.
5. Ulangi.

**Codex adalah satu-satunya penulis kode/migration.** Claude tidak pernah mengedit file aplikasi/migration langsung — hanya mengedit dokumen plan/spec.

## Insiden yang Sudah Terjadi (ringkas — detail lengkap ada di Self-Review plan)

1. Bug lama: `post_manual_journal` (migration 032) kehilangan guard `_ensure_can_post()`/`_ensure_period_open()` dari migration 016 → jadi Task 0 hotfix (043).
2. Plan ditulis dengan sintaks bash (`&&`) padahal environment PowerShell — diperbaiki di Global Constraints.
3. Draft Task 0 awal tidak idempotent (tidak ada row lock/cek `is_posted`) → ditambah `for update` + guard, mengikuti pola `execute_asset_disposal`.
4. Salah kutip lokasi kode (011 vs 014/016) — diperbaiki, ditambah disiplin verifikasi sitasi.
5. `rg` dengan glob bentrok dengan PowerShell (`os error 123`) → pakai path direktori eksplisit.
6. Self-referential search bug — checklist COA-uniqueness ikut match file yang baru saja ditulis sendiri → pakai `-g "!044_general_cash_transaction.sql"`.
7. Klaim kesamaan `security definer` antara migration 011 dan 016 salah — diperbaiki, ditambah aturan bedakan klaim terverifikasi vs hint navigasi "around line N".
8. False positive: Codex stop karena warning `LF will be replaced by CRLF` (padahal exit 0, `core.autocrlf=true`, normal) — ditambah catatan eksplisit ini bukan error.
9. **Temuan keamanan valid dari Codex sendiri** (bukan bug rencana): (a) Postgres `numeric` menerima `'NaN'` dan semantik perbandingan NaN membuatnya lolos validasi balance, merusak `accounts.balance`; (b) tidak ada cross-check `coa_id` vs `account_id` yang sebenarnya → fix ditambahkan langsung ke SQL RPC (reject NaN/Infinity, exists-check coa_id/account_id).
10. Error IO Windows saat `git commit` (`code 267, NotADirectory`) pada path yang sebelumnya berhasil dipakai berkali-kali — root cause tidak terkonfirmasi, mitigasi: pakai `git -C "<path>" <command>` alih-alih `cd` + baris terpisah. **Mitigasi ini yang kemungkinan berhasil** (commit 6532da6 sekarang ada).

## File Referensi Kode yang Sudah Dibaca (untuk konteks, tidak diubah)

`ManualJournalFormPage.jsx`, `journalService.js`, `cashBankService.js`, `AuthContext.jsx`, `RoleGuard.jsx`, `JournalsPage.jsx`, `Sidebar.jsx`, `App.jsx`, `useCashBank.js`, migrations `002`, `007`, `009`, `011`, `014`, `015`, `016`, `032`, `seed.sql`, `package.json`, `playwright/bank-journal-payment-adjustments.spec.js`, `docs/agent-policy/worktree-lifecycle.md`.

## Langkah Berikutnya (paling langsung)

1. Baca ulang `docs/superpowers/plans/2026-07-16-transaksi-kas-non-hutang-piutang.md` penuh (terutama Task 2 dan Global Constraints) untuk merefresh detail exact.
2. Sampaikan ke user: Task 0 dan Task 1 sudah selesai dan ter-commit (bukti: `git log` di worktree), migration 043/044 masih menunggu approval untuk diterapkan ke Supabase.
3. Susun prompt Codex untuk **Task 2** (model **Terra**, effort **medium**) sesuai pola 5 langkah di atas.
