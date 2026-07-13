# CLAUDE.md

Panduan root untuk Claude Code di repository `C:\Project`.

## Communication

- Gunakan Bahasa Indonesia untuk diskusi, penjelasan, status, dan handoff.
- Gunakan English conventional commit style, misalnya `feat:`, `fix:`, `docs:`, `test:`, atau `chore:`.
- Laporkan bukti konkret: file yang berubah, perintah validasi, hasil, branch, dan worktree.

## Repository Map — Empat Aplikasi

Repository ini memuat empat aplikasi React independen:

| Aplikasi | Root | Backend/hosting |
|---|---|---|
| Surat Jalan Monitor | `apps/sj-monitor` | Firebase Auth, Firestore, Firebase Hosting |
| BUL Monitor | `apps/bul-monitor` | Firebase Auth, Firestore, Firebase Hosting |
| BUL Accounting | `apps/bul-accounting` | Firebase Auth, Firestore, Firebase Hosting |
| ERP-ACC | `apps/erp-acc/erp-app` | Supabase Auth/Postgres/RLS/RPC, Vercel |

`bul-monitor` dan `bul-accounting` bertukar data melalui kontrak di `shared/bul-bridge`.
Detail: [Repository Map](docs/agent-policy/repository-map.md).

## Manual Codex–Claude Operating Model

- Satu task memiliki satu implementer, satu branch, dan satu worktree.
- Implementer adalah satu-satunya agen yang boleh menulis pada task tersebut.
- Reviewer read-only: boleh membaca diff dan menjalankan validasi lokal yang aman, tetapi tidak boleh edit, commit, push, deploy, atau migration.
- Codex dan Claude tidak boleh menulis bersamaan pada file atau worktree yang sama.
- Maksimal dua siklus implementasi-review sebelum temuan blocking dieskalasikan kepada user.
- Task contract harus menetapkan scope, protected paths, risk flags, validation, dan deployment flags sebelum implementasi.

Detail: [Manual Collaboration](docs/agent-policy/manual-collaboration.md).

## Global Safety and Approval Gates

Production deployment dilarang bagi workflow agen standar. Staging deployment hanya boleh dijalankan ketika task contract menetapkan `staging_deploy: true` atau user memintanya secara eksplisit.

Minta persetujuan user sebelum mengubah:

- financial logic, formula uang, debit/kredit, COA, pajak, invoice pricing, uang muka, rekonsiliasi, posting, atau stock valuation;
- schema Firestore/Postgres, migration, RPC, RLS, Firestore security rules, role, auth, atau Firebase/Supabase initialization;
- approval flow, audit trail, history log, soft-delete behavior, seed/master data, atau bulk import;
- deployment settings, production environment, atau external data.

Untuk aplikasi Firebase, gunakan soft delete, audit trail, sanitasi data, dan auth context sesuai pola aplikasi. Jangan hard-delete business data.

Detail: [Shared Safety](docs/agent-policy/shared-safety.md).

## Worktree Policy

- Semua implementasi dimulai dari isolated worktree di `C:\Project\.worktrees\<app>\<task>`.
- Branch implementer memakai `codex/<app>/<task>` atau `claude/<app>/<task>`.
- Detached HEAD tidak digunakan untuk task aktif.
- Dirty, unmerged, atau unique detached worktree masuk status QUARANTINED dan tidak boleh dibersihkan tanpa keputusan user.
- Worktree hanya dihapus melalui Git setelah clean, merged/closed, dan disetujui sesuai lifecycle.
- Jangan membersihkan checkout utama atau perubahan user sebagai bagian implisit dari task lain.

Detail: [Worktree Lifecycle](docs/agent-policy/worktree-lifecycle.md).

## Validation Matrix

- Jalankan validasi dari root aplikasi yang benar.
- `npm run build` wajib untuk setiap aplikasi yang terkena perubahan.
- Jalankan test, lint, Playwright, atau manual scenario sesuai aplikasi dan scope.
- Build/test lokal tidak memberikan izin deployment.
- Jangan mengklaim selesai tanpa bukti fresh dari validasi yang disyaratkan.

Detail: [Validation Matrix](docs/agent-policy/validation-matrix.md).

## Autonomous Bug-Hunter Boundary

Pipeline pada `.github/workflows/bug-hunter.yml`, `scripts/bug-hunter.sh`, dan `.agents/skills/bug-hunter/SKILL.md` adalah workflow terpisah. Pipeline itu tidak memperluas izin manual workflow, tidak boleh deploy, dan tetap memerlukan human review sebelum merge.

## Coding Conventions

- React functional components dan hooks; ikuti pola aplikasi yang sudah ada.
- Domain Indonesia tetap memakai nama seperti `suratJalan`, `nomorSJ`, `supir`, `rute`, `armada`, `uangMuka`, `pelanggan`, `jurnal`, `debit`, dan `kredit`.
- Firestore document ID berupa string dan tanggal disimpan dalam bentuk ISO sesuai pola aplikasi.
- Jangan melakukan refactor di luar scope, terutama pada file monolitik.
- Jangan memperkenalkan breaking change pada shared utilities tanpa persetujuan user.

## Instruction Precedence

1. Instruksi langsung user pada task aktif.
2. `CLAUDE.md` terdekat pada root aplikasi.
3. Root `CLAUDE.md` ini.
4. Dokumen referensi di `docs/agent-policy`.
5. Task contract yang telah disetujui.

Task contract tidak boleh meniadakan larangan production deployment atau approval gates kecuali user memberikan otorisasi baru yang eksplisit dan terpisah.

## Handling Ambiguity

Jika scope tidak jelas atau dapat menyentuh financial logic, data integrity, security, schema, audit behavior, atau external state:

1. Berhenti sebelum mengubah file sensitif.
2. Jelaskan pemahaman, bagian ambigu, dan risikonya.
3. Berikan opsi terukur dan minta keputusan user.
