# Desain Kolaborasi Manual Terstruktur Codex–Claude

**Tanggal:** 2026-07-13
**Status:** Spesifikasi tertulis menunggu review pengguna; implementasi belum dimulai
**Repository:** `C:\Project`
**Ruang lingkup:** kebijakan agen, permission Claude, workflow manual Codex–Claude, dan lifecycle Git worktree

## 1. Ringkasan

Repository akan memakai kolaborasi manual terstruktur dengan satu agen sebagai implementer dan agen lain sebagai reviewer read-only. Setiap task implementasi dikerjakan pada satu branch dan satu worktree terisolasi. User tetap menjadi approval gate untuk perubahan finansial, schema, autentikasi, security rules, audit trail, data bisnis, deployment, dan tindakan destruktif.

Kebijakan disampaikan melalui pasangan `AGENTS.md` dan `CLAUDE.md`. Kedua file boleh berbeda dalam instruksi khusus tool, tetapi harus konsisten mengenai fakta repository, batas keamanan, validation matrix, dan lifecycle worktree. Permission Claude menggunakan allowlist minimum dan tidak memberi deployment permission secara default.

Implementasi kebijakan dibagi menjadi dua fase:

1. Konsolidasi dokumentasi kebijakan dan permission.
2. Audit, karantina, serta cleanup worktree lama tanpa penghapusan paksa.

## 2. Tujuan

- Memungkinkan Codex dan Claude berkolaborasi tanpa menulis bersamaan pada file yang sama.
- Menetapkan satu implementer dan satu reviewer untuk setiap task.
- Menyamakan fakta bisnis dan guardrail pada instruksi Codex dan Claude.
- Mencegah production deployment dan perubahan berisiko tinggi tanpa persetujuan user.
- Menjadikan test, lint, build, dan review sebagai bukti penyelesaian task.
- Menjadikan worktree dapat ditemukan, diaudit, dikarantina, dan dibersihkan secara konsisten.
- Melindungi perubahan lokal yang sudah ada di checkout utama dan worktree lama.

## 3. Bukan Tujuan

- Tidak membuat orchestrator otomatis pada fase ini.
- Tidak membuat pipeline multi-agent GitHub baru.
- Tidak mengaktifkan auto-merge atau auto-deploy.
- Tidak mengubah logika finansial, schema database, auth, security rules, atau aplikasi bisnis.
- Tidak menghapus worktree atau branch lama hanya berdasarkan umur.
- Tidak menyatukan empat aplikasi menjadi satu runtime atau satu backend.

## 4. Konteks Repository Saat Ini

`C:\Project\apps` berada di dalam satu repository Git dengan root `C:\Project`. Repository memuat empat aplikasi:

| Aplikasi | Stack utama | Hosting/backend |
|---|---|---|
| `apps/sj-monitor` | React, Vite, Tailwind, Firebase, Vitest | Firebase |
| `apps/bul-monitor` | React, Vite, Tailwind, Firebase | Firebase |
| `apps/bul-accounting` | React, Vite, Tailwind, Firebase, Vitest, Recharts | Firebase |
| `apps/erp-acc/erp-app` | React, Vite, Ant Design, Supabase, Playwright | Vercel/Supabase |

Instruksi saat ini belum konsisten:

- Root `AGENTS.md` masih menggambarkan tiga aplikasi dan menggeneralisasi Firebase.
- Root `CLAUDE.md` lebih mutakhir, tetapi masih menyatakan setiap aplikasi memiliki Firebase sendiri.
- `apps/erp-acc/CLAUDE.md` masih template berbasis asumsi Firebase.
- Instruksi reviewer JSON bercampur dengan instruksi implementer pada beberapa `CLAUDE.md` aplikasi.
- `apps/bul-accounting/.claude/settings.local.json` memiliki permission deployment yang terlalu luas.
- Worktree tersebar pada beberapa lokasi dan sebagian masih dirty atau detached.

## 5. Arsitektur Kebijakan

### 5.1 Kebijakan root berpasangan

Repository mempertahankan:

- `C:\Project\AGENTS.md` sebagai entrypoint Codex.
- `C:\Project\CLAUDE.md` sebagai entrypoint Claude.

Kedua file harus memuat invariant yang sama:

1. Peta empat aplikasi dan stack aktual.
2. Bahasa komunikasi Bahasa Indonesia.
3. Conventional commit berbahasa Inggris.
4. Production deployment dilarang bagi agen.
5. Area sensitif memerlukan persetujuan user.
6. Satu task memiliki satu implementer, satu branch, dan satu worktree.
7. Reviewer bersifat read-only.
8. Validasi harus sesuai aplikasi dan scope.
9. Perubahan user yang sudah ada tidak boleh ditimpa atau dibersihkan tanpa izin.

Instruksi khusus platform tetap berada pada file masing-masing. Perbedaan platform tidak boleh mengubah fakta bisnis atau batas keamanan.

### 5.2 Kebijakan aplikasi berpasangan

Setiap root aplikasi akan memiliki `AGENTS.md` dan `CLAUDE.md` dengan isi semantik yang sama mengenai:

- tujuan dan domain aplikasi;
- stack dan deployment target;
- modul kritis;
- invariant bisnis;
- protected paths dan protected behavior;
- perintah validasi;
- manual test yang relevan;
- pola yang disengaja dan bukan bug.

Lokasi yang ditetapkan:

```text
apps/sj-monitor/AGENTS.md
apps/sj-monitor/CLAUDE.md
apps/bul-monitor/AGENTS.md
apps/bul-monitor/CLAUDE.md
apps/bul-accounting/AGENTS.md
apps/bul-accounting/CLAUDE.md
apps/erp-acc/erp-app/AGENTS.md
apps/erp-acc/erp-app/CLAUDE.md
```

Dokumen `apps/erp-acc/CLAUDE.md` yang berada satu tingkat di atas root aplikasi akan diganti dengan pointer singkat atau dipindahkan setelah dipastikan tidak ada workflow yang bergantung padanya.

### 5.3 Dokumentasi rinci bersama

Detail yang terlalu panjang untuk entrypoint agen ditempatkan di:

```text
docs/agent-policy/repository-map.md
docs/agent-policy/shared-safety.md
docs/agent-policy/validation-matrix.md
docs/agent-policy/worktree-lifecycle.md
docs/agent-policy/manual-collaboration.md
```

Aturan kritis tetap ditulis langsung pada kedua entrypoint root. Dokumen referensi tidak boleh menjadi satu-satunya tempat larangan production deployment atau approval gate.

### 5.4 Instruksi peran dipisahkan dari instruksi aplikasi

Profile reviewer Claude ditempatkan terpisah, misalnya:

```text
.claude/agents/code-reviewer.md
.claude/agents/security-reviewer.md
.claude/agents/accounting-reviewer.md
```

Format JSON review hanya berlaku ketika Claude dipanggil sebagai reviewer. Implementer tidak dipaksa menghasilkan format review.

## 6. Perubahan yang Direncanakan pada CLAUDE.md

### 6.1 Root CLAUDE.md

- Memperbaiki deskripsi empat aplikasi dan backend ERP-ACC.
- Menambahkan operating model manual terstruktur.
- Menambahkan lifecycle worktree dan aturan satu penulis.
- Memisahkan validasi lokal wajib dari deployment staging.
- Menetapkan staging deployment hanya jika task contract atau user memintanya.
- Menetapkan reviewer sebagai read-only.

### 6.2 bul-accounting

- Memperbaiki path lama `C:\Project\apps\bul-acc`.
- Mempertahankan invariant debit sama dengan kredit serta fokus accounting/RBAC.
- Menghapus deployment sebagai perintah umum.
- Memindahkan format JSON review ke reviewer profile.

### 6.3 bul-monitor

- Mempertahankan invariant prefix koleksi `bul_*`, long-polling, RBAC, dan listener cleanup.
- Menjelaskan hubungan data dengan `bul-accounting`.
- Memisahkan build/test dari deployment.
- Memindahkan format JSON review ke reviewer profile.

### 6.4 sj-monitor

- Mempertahankan ringkasan design system dan Firestore write safety pada bagian kritis.
- Memindahkan detail visual yang panjang ke dokumen UI design system.
- Menggunakan `docs/FIRESTORE-WRITE-SAFETY.md` sebagai referensi rinci write safety.
- Menetapkan test, lint sesuai scope, dan build sebagai validasi lokal wajib.
- Menetapkan `npm run smoketest` sebagai staging deployment yang hanya dijalankan jika diminta oleh task contract atau user.
- Memindahkan instruksi bug reviewer ke reviewer profile.

### 6.5 erp-acc

- Menulis ulang instruksi berdasarkan Supabase, Vercel, Ant Design, dan Playwright.
- Menambahkan guardrail RLS, RPC, migration, journal, stock, returns, dan payment.
- Menetapkan lint, build, serta Playwright sesuai scope sebagai validasi.
- Melarang remote migration dan production deploy tanpa instruksi eksplisit user yang terpisah dari workflow agen standar.

## 7. Model Permission Claude

### 7.1 Prinsip

- Default deny untuk tindakan yang mengubah sistem eksternal.
- Allowlist minimum sesuai peran.
- Tidak menggunakan bypass permission.
- Permission staging diberikan sementara per task, bukan permanen.
- Task contract tetap menjadi lapisan kebijakan meskipun tool permission sudah dibatasi.

### 7.2 Permission implementer

Implementer boleh:

- membaca dan mencari file;
- mengedit file yang termasuk scope;
- menjalankan `git status`, `git diff`, `git log`, dan `git show`;
- menjalankan test, lint, build, serta local dev server yang relevan;
- membuat commit task setelah validasi berhasil.

Implementer tidak memiliki permission default untuk:

- `firebase deploy` atau wrapper-nya;
- `vercel deploy --prod`;
- remote database migration atau `supabase db push`;
- mengubah `.env` atau secret;
- force-push;
- penghapusan worktree paksa;
- melewati permission prompt.

### 7.3 Permission reviewer

Reviewer hanya boleh:

- membaca dan mencari file;
- membaca Git diff, commit, dan history;
- menjalankan test, lint, dan build jika diperlukan untuk memverifikasi klaim;
- menghasilkan laporan review terstruktur.

Reviewer tidak boleh mengedit, commit, push, deploy, atau menjalankan migration.

### 7.4 Lapisan perlindungan

1. Project settings tidak mengizinkan deployment secara default.
2. Pemanggilan sesi membatasi tool berdasarkan peran.
3. Task contract menyatakan protected areas dan deployment policy.
4. User menjadi approval gate untuk perubahan sensitif.

Allowlist diprioritaskan dibanding mengandalkan pola deny, karena deployment dapat dibungkus melalui command atau script lain.

## 8. Workflow Manual Terstruktur

### 8.1 Task contract

Setiap task memiliki kontrak minimum:

```yaml
task_id: APP-123
project: sj-monitor
objective: Ringkasan tujuan yang terukur
implementer: codex
reviewer: claude
allowed_paths:
  - apps/sj-monitor/src/...
protected_paths:
  - apps/sj-monitor/firestore.rules
financial_logic: false
schema_change: false
auth_change: false
production_deploy: false
staging_deploy: false
required_checks:
  - npm test
  - npm run lint
  - npm run build
acceptance_criteria:
  - Perilaku yang harus terbukti
```

Jika implementasi membutuhkan perluasan scope atau menyentuh protected area, pekerjaan berhenti dan meminta persetujuan user.

### 8.2 Urutan kerja

1. User dan implementer menyepakati task contract.
2. Implementer membuat branch dan worktree dari base commit yang dicatat.
3. Implementer mengubah hanya allowed paths.
4. Implementer menjalankan required checks.
5. Implementer membuat commit yang terfokus.
6. Reviewer memeriksa commit/diff secara read-only.
7. Implementer mengklasifikasikan setiap temuan sebagai accepted, rejected with evidence, needs user decision, atau out of scope.
8. Jika ada perbaikan, validasi dan review diulang maksimal dua siklus sebelum eskalasi.
9. User menyetujui handoff/PR dan setiap tindakan sensitif.
10. Setelah task merged atau ditutup, lifecycle cleanup dijalankan.

### 8.3 Format review

```json
{
  "verdict": "approve|changes_required|needs_user_decision",
  "findings": [
    {
      "severity": "high|medium|low",
      "file": "path",
      "line": 123,
      "claim": "Masalah yang ditemukan",
      "evidence": "Bukti konkret",
      "suggested_fix": "Perbaikan yang disarankan",
      "blocking": true
    }
  ]
}
```

## 9. Lifecycle Worktree

### 9.1 Lokasi terpusat

Worktree baru ditempatkan di:

```text
C:\Project\.worktrees\sj-monitor\<task-id>-<slug>
C:\Project\.worktrees\bul-monitor\<task-id>-<slug>
C:\Project\.worktrees\bul-accounting\<task-id>-<slug>
C:\Project\.worktrees\erp-acc\<task-id>-<slug>
```

Worktree baru tidak dibuat lagi di dalam `.claude/worktrees` aplikasi, `apps/.claude/worktrees`, folder VPS, atau lokasi konfigurasi user.

### 9.2 Penamaan branch

- Codex implementer: `codex/<app>/<task-id>-<slug>`.
- Claude implementer: `claude/<app>/<task-id>-<slug>`.
- Reviewer tidak membuat branch baru untuk review normal.
- Detached HEAD tidak diperbolehkan untuk task aktif.

### 9.3 Status lifecycle

```text
CREATED -> ACTIVE -> REVIEW -> READY -> MERGED/CLOSED -> REMOVED
                         \-> QUARANTINED
```

- `CREATED`: branch, path, base commit, implementer, reviewer, dan scope tercatat.
- `ACTIVE`: hanya implementer yang menulis.
- `REVIEW`: implementasi sudah divalidasi dan reviewer masuk read-only.
- `READY`: temuan sudah diselesaikan dan bukti validasi final tersedia.
- `MERGED/CLOSED`: PR merged atau task secara eksplisit ditutup.
- `REMOVED`: worktree dihapus melalui Git dan branch ditangani terpisah.
- `QUARANTINED`: kepemilikan, status merge, atau perubahan lokal belum aman.

### 9.4 Retention

| Kondisi | Kebijakan |
|---|---|
| Task aktif dan ada pemilik | Pertahankan |
| PR merged dan worktree clean | Hapus maksimal 48 jam |
| Commit clean sudah berada di `main` | Layak dibersihkan setelah verifikasi |
| Dirty atau belum merged | Karantina |
| Tidak aktif 14 hari | Audit kepemilikan dan status |
| Abandoned lebih dari 30 hari | Arsipkan lalu minta approval penghapusan |
| Detached dengan commit unik | Buat safety branch sebelum cleanup |

### 9.5 Cleanup aman

Urutan cleanup:

1. Audit `git status`, commit terakhir, hubungan branch dengan `main`, dan file untracked.
2. Lindungi commit unik dengan safety branch.
3. Arsipkan tracked diff dan pilih file untracked yang bernilai.
4. Hapus worktree menggunakan `git worktree remove` tanpa `--force`.
5. Jalankan `git worktree prune` setelah removal normal.
6. Hapus branch merged menggunakan `git branch -d`, bukan `-D`.
7. Verifikasi ulang daftar worktree, branch, dan status checkout utama.

Folder worktree tidak boleh dihapus langsung menggunakan filesystem command karena metadata Git dapat tertinggal.

## 10. Strategi untuk Worktree Lama

Audit 2026-07-13 menemukan 18 worktree termasuk checkout utama. Tidak ada worktree yang dinyatakan prunable oleh Git.

### 10.1 Calon cleanup setelah verifikasi akhir

Worktree berikut clean dan commit-nya telah berada di `main`:

- `jovial-mclaren-3371ad`;
- `funny-khayyam-bf4bf9`;
- `project-debug-repair-b06abd`;
- `compassionate-williamson-5fba67`;
- `gl-sync-upsert-consulting`.

Daftar ini adalah kandidat audit, bukan otorisasi penghapusan.

### 10.2 Karantina wajib

- `charming-chandrasekhar-cb0b5f`: branch belum merged dan `App.jsx` berubah.
- `agitated-lalande-e741b4`: detached dengan enam file untracked.
- `infallible-varahamihira-1d276e`: detached dengan sejarah commit berbeda dari `main`.
- `invoice-debt-credit-deletion-353ab5`: branch belum terbukti merged dan memiliki generated changes.
- `goofy-sutherland-4c0da6`: branch memiliki commit yang berbeda dari `main`.
- `interesting-lederberg-13cc6d`: branch merged tetapi `InvoicePage.jsx` berubah lokal.

### 10.3 Dirty tetapi branch sudah merged

Worktree seperti `upbeat-tu-00534c`, `vigilant-bartik-0efc97`, `hardcore-haibt-faa1b6`, `quizzical-ramanujan-402fe5`, `youthful-shockley-2b68c6`, dan `modest-perlman-b79d8b` harus diperiksa file per file. Artefak browser dan test dapat dibuang setelah konfirmasi, sedangkan design plan, source code, `.gitignore`, dan instruksi lokal harus diselamatkan atau dinilai secara eksplisit.

Cleanup checkout utama merupakan task terpisah karena checkout `main` juga dirty. Worktree cleanup tidak boleh sekaligus membersihkan atau memasukkan perubahan checkout utama.

## 11. Validation Matrix

| Aplikasi | Validasi minimum | Validasi tambahan berdasarkan scope |
|---|---|---|
| `sj-monitor` | test, lint sesuai scope, build | staging smoke test jika task contract mengizinkan |
| `bul-accounting` | test dan build | manual finance regression untuk alur finansial |
| `bul-monitor` | build | manual scenario; test baru untuk pure logic yang disentuh bila layak |
| `erp-acc` | lint dan build | Playwright, migration review, RLS/RPC review sesuai scope |

Validasi harus dijalankan dari root aplikasi yang benar. Kegagalan baseline harus dibedakan dari regresi yang dibuat task.

## 12. Error Handling dan Eskalasi

Pekerjaan berhenti dan meminta keputusan user jika:

- scope perlu diperluas ke protected path atau protected behavior;
- financial formula, schema, auth, security rules, migration remote, atau audit behavior perlu berubah;
- worktree dirty tidak memiliki pemilik atau tujuan yang jelas;
- reviewer dan implementer tidak sepakat setelah bukti diperiksa;
- dua siklus implementasi-review tidak menyelesaikan finding blocking;
- validasi tidak dapat dijalankan karena kredensial, environment, atau dependency eksternal;
- cleanup memerlukan `--force`, branch deletion paksa, atau pembuangan file yang mungkin bernilai.

## 13. Acceptance Criteria Implementasi Kebijakan

Implementasi kebijakan dianggap selesai ketika:

- root `AGENTS.md` dan `CLAUDE.md` menggambarkan empat aplikasi secara konsisten;
- setiap aplikasi memiliki instruksi Codex dan Claude pada root aplikasi yang benar;
- ERP-ACC tidak lagi didokumentasikan sebagai Firebase app;
- reviewer profile terpisah dari instruksi implementer;
- permission deployment wildcard dihapus dari setting Claude terkait;
- production deployment tidak tersedia dalam default workflow agen;
- dokumentasi task contract, review, validation matrix, dan lifecycle worktree tersedia;
- audit worktree menghasilkan daftar `remove candidate`, `quarantine`, dan `needs user decision`;
- tidak ada worktree atau branch yang dihapus paksa;
- seluruh perubahan dokumentasi lolos `git diff --check`;
- hanya file yang termasuk scope kebijakan yang masuk commit implementasi.

## 14. Urutan Implementasi yang Direkomendasikan

### Fase 1 — Konsolidasi kebijakan dan permission

1. Membuat dokumentasi `docs/agent-policy`.
2. Menyelaraskan root `AGENTS.md` dan `CLAUDE.md`.
3. Membuat pasangan instruksi per aplikasi.
4. Menulis ulang instruksi ERP-ACC.
5. Memisahkan reviewer profile.
6. Mengetatkan Claude settings dan menghapus permission deployment wildcard.
7. Memvalidasi dokumentasi dan permission secara read-only/dry-run.

### Fase 2 — Audit dan cleanup worktree

1. Menghasilkan registry audit semua worktree.
2. Menetapkan owner/status setiap worktree yang tidak jelas.
3. Membuat safety branch atau arsip untuk perubahan unik.
4. Meminta approval user atas daftar penghapusan final.
5. Menghapus hanya worktree clean yang disetujui melalui Git.
6. Menjalankan prune dan verifikasi akhir.
7. Mulai menggunakan lokasi worktree terpusat untuk task berikutnya.

## 15. Trade-off yang Diterima

- Ada duplikasi terbatas antara `AGENTS.md` dan `CLAUDE.md` demi memastikan aturan kritis selalu terbaca.
- Permission minimum dapat menambah approval prompt, tetapi menurunkan risiko external mutation.
- Reviewer read-only tidak dapat langsung memperbaiki finding, tetapi menjaga independensi review.
- Worktree per task menggunakan ruang disk tambahan, tetapi mencegah perubahan lintas task bercampur.
- Retention dan karantina memperlambat cleanup awal, tetapi melindungi pekerjaan lama yang belum terinventarisasi.
- Workflow manual lebih lambat daripada orchestrator, tetapi menjadi baseline yang dapat diamati sebelum semi-otomasi dibangun.
