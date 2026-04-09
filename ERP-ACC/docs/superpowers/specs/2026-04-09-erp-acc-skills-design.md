# ERP-ACC Skills Design

## Overview

13 skills untuk ERP-ACC project, diorganisir dengan Pendekatan C (Core + Reference Split):
- **10 actionable skills** — workflow dan review yang bisa di-invoke user atau auto-consult Claude
- **3 reference skills** — aturan pembukuan dan pajak, auto-consult only, berisi template yang bisa diisi user

Semua skill disimpan di `ERP-ACC/.claude/skills/` (flat structure), hanya tersedia di ERP-ACC worktree.

## Structure

```
ERP-ACC/.claude/skills/
├── verify/SKILL.md              # user-invoke
├── deploy-dev/SKILL.md          # user-invoke only (side effects)
├── audit-check/SKILL.md         # user-invoke + auto-consult
├── schema-review/SKILL.md       # user-invoke + auto-consult
├── finance-review/SKILL.md      # user-invoke + auto-consult
├── refactor-module/SKILL.md     # user-invoke
├── bulk-import-test/SKILL.md    # user-invoke
├── export-check/SKILL.md        # user-invoke
├── security-review/SKILL.md     # user-invoke + auto-consult
├── new-module/SKILL.md          # user-invoke only (side effects)
├── accounting-rules/SKILL.md    # reference (auto-consult only)
├── journal-workflow/SKILL.md    # reference (auto-consult only)
└── tax-compliance/SKILL.md      # reference (auto-consult only)
```

## Invoke Conventions

| Type | Who triggers | When |
|---|---|---|
| user-invoke | User `/skill-name`, Claude juga bisa | On demand |
| user-invoke only | User saja (`disable-model-invocation: true`) | Side effects: deploy, scaffold |
| auto-consult | Claude otomatis saat menyentuh area terkait, user juga bisa invoke | Saat edit kode terkait |
| reference | Claude auto-consult saja | Saat menyentuh area pembukuan/pajak |

## Actionable Skills

### 1. `/verify`
- **Type:** user-invoke
- **Trigger:** User invoke atau sebelum klaim selesai
- **Aksi:** Deteksi project yang berubah → `npm run build` + `npm run lint` di project tersebut → laporan pass/fail
- **Output:** Summary hasil build + lint, daftar error/warning jika ada

### 2. `/deploy-dev`
- **Type:** user-invoke only (`disable-model-invocation: true`)
- **Trigger:** User only
- **Aksi:** Cek branch saat ini → `npm run build` → `firebase deploy --only hosting` di project yang dipilih
- **Guardrail:** Tolak jika target = production. Minta konfirmasi sebelum deploy. Tampilkan project + target sebelum eksekusi.
- **Input:** `$ARGUMENTS` = nama project (sj-monitor, BUL-accounting, BUL-monitor)

### 3. `/audit-check`
- **Type:** user-invoke + auto-consult
- **Trigger:** User invoke atau saat Claude menulis kode Firestore write/delete
- **Aksi:** Scan kode yang berubah, verifikasi:
  - Pakai `softDeleteItemInFirestore()` (bukan hard delete)
  - `addHistoryLog()` untuk state changes
  - `sanitizeForFirestore()` sebelum write
  - `ensureAuthed()` sebelum operasi
- **Output:** Checklist pass/fail per aturan data safety

### 4. `/schema-review`
- **Type:** user-invoke + auto-consult
- **Trigger:** User invoke atau saat Claude menambah/mengubah field Firestore
- **Aksi:** Identifikasi field baru/berubah → cek backward compatibility → cek dampak ke `firestore.rules` → cek apakah query existing masih valid
- **Output:** Daftar perubahan schema + risk assessment + rekomendasi

### 5. `/finance-review`
- **Type:** user-invoke + auto-consult
- **Trigger:** User invoke atau saat Claude menyentuh kode keuangan
- **Aksi:** Deteksi apakah perubahan menyentuh: double-entry logic, COA, tax, invoice pricing, uang muka, kas/bank → cross-reference dengan `/accounting-rules` dan `/tax-compliance` → flagging jika melanggar aturan
- **Output:** Review dengan flag per guardrail yang tersentuh

### 6. `/refactor-module`
- **Type:** user-invoke
- **Trigger:** User invoke
- **Aksi:** Analisis target code di App.jsx → identifikasi logic yang bisa di-extract → propose extraction plan (komponen, hook, atau service) → generate file baru dengan pattern yang konsisten
- **Checklist:** Preserve existing behavior, update imports, verify build passes

### 7. `/bulk-import-test`
- **Type:** user-invoke
- **Trigger:** User invoke
- **Aksi:** Review bulk import logic (CSV/Excel) → generate test scenarios: happy path, empty file, malformed rows, duplicate IDs, missing required fields, encoding issues
- **Output:** Tabel test scenarios + expected results

### 8. `/export-check`
- **Type:** user-invoke
- **Trigger:** User invoke
- **Aksi:** Review PDF/Excel export code → verifikasi: format currency Indonesia (Rp), format tanggal, column alignment, data completeness, edge cases (empty data, very long strings)
- **Output:** Checklist verifikasi export

### 9. `/security-review`
- **Type:** user-invoke + auto-consult
- **Trigger:** User invoke atau saat Claude menyentuh auth/RBAC/firestore.rules
- **Aksi:** Scan perubahan → cek: apakah role permissions masih benar, apakah ada collection yang terbuka tanpa rule, apakah auth flow terganggu
- **Output:** Security assessment + flags

### 10. `/new-module`
- **Type:** user-invoke only (`disable-model-invocation: true`)
- **Trigger:** User only
- **Aksi:** Tanya nama modul + project target → scaffold: Page component, service file, utils jika perlu → register di App.jsx routing → ikuti pattern existing (Tailwind, hooks, firestoreService)
- **Input:** `$ARGUMENTS` = nama modul
- **Output:** File-file baru yang siap diisi logic

## Reference Skills

### 11. `/accounting-rules` (reference, auto-consult)
- **Kapan Claude konsultasi:** Saat menyentuh kode jurnal, COA, kas/bank, laporan keuangan
- **Isi template:**
  - Prinsip dasar — double-entry (debit = credit), akun normal balance
  - COA hierarchy — struktur level akun (placeholder untuk diisi)
  - Periode akuntansi — aturan tutup buku, kapan jurnal boleh/tidak boleh diedit
  - Posting rules — kapan transaksi dianggap final, aturan jurnal koreksi vs void
  - Mata uang & pembulatan — format Rupiah, aturan pembulatan
- **Format:** Markdown dengan `<!-- FILL: ... -->` placeholders

### 12. `/journal-workflow` (reference, auto-consult)
- **Kapan Claude konsultasi:** Saat membuat/memodifikasi logic pembuatan jurnal entry
- **Isi template:**
  - Step-by-step alur pembuatan jurnal: input → validasi → preview → posting
  - Validasi wajib: debit = credit, akun valid di COA, tanggal dalam periode aktif, deskripsi tidak kosong
  - Tipe jurnal: jurnal umum, jurnal koreksi, jurnal penutup (placeholder per tipe)
  - Mapping transaksi → jurnal: tabel transaksi → debit/credit akun (placeholder)
  - Jurnal koreksi: kapan boleh, metode reverse + re-entry vs edit langsung
- **Format:** Markdown dengan tabel template dan `<!-- FILL: ... -->` placeholders

### 13. `/tax-compliance` (reference, auto-consult)
- **Kapan Claude konsultasi:** Saat menyentuh kode yang menghitung atau mencatat pajak
- **Isi template:**
  - PPN: tarif, dasar pengenaan, kapan dihitung, pencatatan jurnal (PPN Masukan vs PPN Keluaran)
  - PPh: jenis PPh (pasal 21/23/4(2)/dll), tarif, kapan dipotong
  - Faktur pajak: aturan penomoran, format, kapan wajib dibuat
  - Pelaporan: periode, batas waktu
  - Validasi wajib sebelum mengubah logika pajak
- **Format:** Markdown dengan `<!-- FILL: ... -->` placeholders
