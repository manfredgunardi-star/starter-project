# Shared Safety and Approval Gates

## External State

Production deployment dilarang bagi workflow agen standar. Staging deployment hanya boleh dilakukan ketika user memintanya atau task contract menetapkan `staging_deploy: true`. Build, test, lint, browser check lokal, dan code review tidak memberikan izin deployment.

Permission Claude memblokir seluruh CLI Firebase, Vercel, dan Supabase untuk mencegah variasi command atau version-pinned executable melewati guardrail. Larangan ini juga mencakup command local-development seperti `supabase start`, `supabase status`, dan `supabase functions serve`.

Persistent deny tidak dilonggarkan untuk staging. Setelah user mengotorisasi exact command dan target staging, Claude menyerahkannya kepada Codex atau user untuk dieksekusi. Claude yang berperan sebagai reviewer tidak pernah mengeksekusi staging.

Jangan menjalankan remote migration, database push, edge-function deployment, production hosting command, atau operasi external data tanpa otorisasi eksplisit yang sesuai.

## Persetujuan User Wajib

Minta persetujuan user sebelum mengubah:

- financial logic, debit/kredit, COA, tax, invoice pricing, uang muka, reconciliation, posting, stock valuation, atau formula uang;
- Firestore/Postgres schema, migration, RPC, RLS, Firestore security rules, role definition, auth flow, atau initialization;
- approval flow, audit trail, history log, posted transaction behavior, soft-delete behavior, bulk import, seed data, atau master data;
- production/staging configuration atau external integration contract.

Approval berlaku hanya untuk scope yang dinyatakan dan tidak otomatis memperluas izin ke production deployment.

## Data Safety

- Gunakan soft delete untuk business data; hard delete dilarang kecuali user secara eksplisit menetapkan operasi khusus dan risikonya sudah ditinjau.
- Catat perubahan status signifikan melalui audit trail/history log sesuai pola aplikasi.
- Sanitasi object sebelum Firestore write dan pastikan auth context sebelum operasi tulis.
- Jangan mengubah, membersihkan, stash, atau commit perubahan user yang berada di luar task.
- Jangan menampilkan secret, token, `.env`, credential, atau data produksi ke prompt, log, atau commit.

## Destructive Local Operations

- Hard reset, force push, force branch deletion, dan recursive filesystem deletion tidak tersedia dalam workflow standar.
- Seluruh varian `git reset` diblokir pada profil Claude; gunakan `git restore --staged <path>` jika hanya perlu membatalkan staging file.
- Dirty atau ambiguous worktree selalu dikarantina.
- Jika operasi aman tidak dapat dilanjutkan tanpa tindakan paksa, berhenti dan minta keputusan user.
