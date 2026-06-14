# Finance Audit Agent (`finance-auditor`) — Design Spec

**Tanggal:** 2026-06-14
**Status:** Disetujui (brainstorming) — siap masuk writing-plans
**Rekomendasi asal:** #1 dari sesi "rekomendasi pembuatan AI Agent"
**Backlog terkait:** [2026-06-14-ai-agent-recommendations-backlog.md](2026-06-14-ai-agent-recommendations-backlog.md)

---

## 1. Tujuan & Latar Belakang

Memformalkan pekerjaan audit keuangan yang selama ini dilakukan manual (lihat
`LAPORAN_AUDIT_BUG_2026-06-11.md` di root repo, dan 2 commit terakhir
"resolve audit findings across 4 apps") menjadi **subagent** yang bisa di-dispatch
kapan saja, fokus pada akurasi uang/akuntansi, auth, dan integritas data di
4 aplikasi: `sj-monitor`, `bul-monitor`, `bul-accounting`, `erp-acc`.

**Bukan duplikat** dari yang sudah ada:
- `bug-hunter` = fix **satu** bug per GitHub issue, **sj-monitor saja**, alur TDD.
- `finance-auditor` = sapuan **proaktif multi-app** yang fokus ke logika uang,
  menghasilkan laporan terstruktur, dan (opsional) draft fix berlabel.

## 2. Keputusan Desain (disetujui)

| Aspek | Keputusan |
|---|---|
| Bentuk | **Subagent** (`.claude/agents/finance-auditor.md`) — subagent pertama di repo |
| Versioning | **Di-commit** ke git (lebih baik dari skill yang sekarang untracked) agar tersedia di semua worktree |
| Perilaku | **Laporan + draft semua fix** (termasuk finansial), berlabel "BUTUH PERSETUJUAN", **tanpa merge** |
| Cakupan | **Berparameter** (pilih app/domain); default semua |
| Lokasi laporan | `docs/audits/LAPORAN_AUDIT_<scope>_YYYY-MM-DD.md` |
| Fase fix | Lewat **draft PR**, bukan apply langsung di working tree |

## 3. Bentuk & Lokasi

- File baru: `.claude/agents/finance-auditor.md` (repo root `.claude/`, bersama `skills/`).
- Frontmatter: `name: finance-auditor`, `description:` (kapan dipakai), `tools: Read, Grep, Glob, Bash, Edit, Write`.
- Tools mencakup write/bash agar fase `draft-fix` bisa membuat branch + PR; namun
  **perilaku dibatasi per fase** lewat instruksi (audit = read-only kecuali menulis laporan).

## 4. Invokasi & Parameter

Dikirim lewat prompt saat subagent di-dispatch (atau diketik user):

- `scope`: `sj-monitor | bul-monitor | bul-accounting | erp-acc | all` (default `all`)
- `domain`: `jurnal | uang-muka | arus-kas | pajak | invoice-payment | audit-trail | all` (default `all`)
- `mode`: `audit` (default — laporan read-only) | `draft-fix` (eksplisit — branch + draft PR, tak pernah merge)

Agent men-default ke `scope=all`, `domain=all`, `mode=audit` jika tidak disebut.

## 5. Katalog Pemeriksaan (inti nilai)

Ditulis sebagai daftar **dapat-diperluas**. Tiap aturan punya: `nama`, `app/file target`,
`pola deteksi`, `severity`, `finansial?` (boolean — menentukan butuh-persetujuan).
Katalog awal dikodifikasi dari temuan audit 2026-06-11:

| # | Aturan | Pola deteksi | Severity | Finansial |
|---|---|---|---|---|
| 1 | Balance jurnal | total debit == kredit tiap entry | 🔴 | ya |
| 2 | Saldo awal arus kas | batas eksklusif vs inklusif (`date < startDate`) | 🟠 | ya |
| 3 | Guard double-posting bridge | re-send item `approved` tanpa guard | 🟠 | ya |
| 4 | Soft-delete enforcement | larang `hardDelete*`/`deleteDoc` pada data bisnis | 🟡 | tidak |
| 5 | Audit-trail | perubahan status memanggil `addHistoryLog` | 🟡 | tidak |
| 6 | Default tarif pajak | `tax_rate \|\| 11` menelan 0% → sarankan `??` | 🟡 | ya |
| 7 | Konsistensi pembulatan | status `paid`/`partial` add vs remove | 🟡 | ya |
| 8 | Atomicity | header+items non-atomik / header yatim | 🟡 | ya |
| 9 | Alokasi uang muka | terpakai ≤ tersedia; `Sisa = tagihan − bayar − potongan` | 🟠 | ya |
| 10 | Race penomoran | `getNext*No` read-max+1 tanpa transaksi | 🟡 | tidak |
| 11 | Batas format angka | `terbilang` ≥ 1 triliun | 🟡 | tidak |
| 12 | Housekeeping | komentar jurnal usang, tulis ke koleksi ganda | ⚪ | tidak |

Implementasi: katalog disimpan sebagai bagian dari file agent (atau file pendamping
`references/audit-catalog.md`) sehingga mudah ditambah aturan baru tanpa mengubah alur.

## 6. Output Laporan

Format mengikuti `LAPORAN_AUDIT_BUG_2026-06-11.md` yang sudah terbukti dipakai:

- **Lokasi:** `docs/audits/LAPORAN_AUDIT_<scope>_YYYY-MM-DD.md`
- **Bagian:**
  1. Header — tanggal, cakupan, catatan "Audit read-only. Tidak ada kode diubah."
  2. **Ringkasan Prioritas** — tabel: `#`, severity, app, `file:line`, inti masalah
  3. **Temuan Detail** — per temuan: file:line, snippet kode, dampak, rekomendasi,
     tanda **"minta persetujuan"** bila finansial
  4. **Area yang TIDAK diaudit** — keterbatasan (mis. RPC SQL Supabase, `firestore.rules`)
  5. **Rekomendasi langkah berikut** — urutan prioritas
- **Skala severity:** 🔴 Tinggi / 🟠 Sedang / 🟡 Rendah / ⚪ Info

## 7. Fase Draft-Fix (`mode=draft-fix`, hanya bila diminta)

1. Buat worktree/branch terisolasi `claude/audit-fix-YYYY-MM-DD`.
2. Satu commit per temuan; conventional commit (English).
3. Temuan **finansial**: perubahan tetap dibuat, tapi commit + deskripsi PR diberi
   label jelas `[BUTUH PERSETUJUAN — FINANCIAL]`. **Tidak di-merge, tidak deploy.**
4. Validasi per app terdampak: `npm run build`; sj-monitor juga `npm test && npm run lint`.
5. Buka **draft PR** (`gh`) berisi peta temuan → fix; tanpa auto-merge.

## 8. Safety Rules (ditaruh paling atas file agent, meniru `bug-hunter`)

1. NEVER `firebase deploy` (staging maupun production, semua varian).
2. NEVER commit/push ke `main` — semua lewat branch + draft PR.
3. NEVER modifikasi `firestore.rules`, `firebase-config.js`/`firebase.js`, atau file auth.
4. NEVER hard-delete data bisnis Firestore.
5. Mode `audit`: tidak menulis file apa pun kecuali laporan di `docs/audits/`.
6. Fix finansial: draft + label persetujuan saja, tidak pernah merge/deploy.
7. NEVER modifikasi `CLAUDE.md`, `.claude/settings.json`, atau file workflow.

## 9. Hubungan dengan Agent/Skill Lain

- **`bug-hunter`** — reaktif, issue-driven, sj-monitor, TDD. `finance-auditor` proaktif & multi-app.
- **#3 Data Anomaly Monitor** (backlog) — akan **memakai ulang katalog** di Bagian 5,
  tapi memeriksa DATA di Firestore (runtime), bukan LOGIKA di kode (statik).
- **gl-sync** — sumber data laporan akuntansi; relevan untuk #3, bukan untuk #1.

## 10. Di Luar Cakupan (YAGNI)

- Penjadwalan otomatis (itu domain #3).
- Eksekusi runtime / menjalankan app (audit bersifat statik atas kode).
- Audit `firestore.rules` & RPC SQL Supabase secara mendalam (dicatat sebagai
  "area tidak diaudit", butuh konteks/akses terpisah).
- Auto-merge atau deploy apa pun.

## 11. Kriteria Keberhasilan

- Dijalankan `mode=audit scope=all` → menghasilkan laporan setara kualitas
  `LAPORAN_AUDIT_BUG_2026-06-11.md` tanpa mengubah satu pun file sumber.
- Dijalankan `scope=sj-monitor domain=uang-muka` → laporan terbatas & relevan.
- `mode=draft-fix` → draft PR terbuka, build/test lulus, temuan finansial berlabel,
  `main` tidak tersentuh.
