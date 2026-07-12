# bul-monitor → Google Sheets Sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sync data operasional bul-monitor (Surat Jalan, Invoice, Biaya Tambahan, Master Data) ke Google Sheets setiap tengah malam WIB secara otomatis via GitHub Actions.

**Architecture:** Node.js script baru di `scripts/bul-monitor-sync/` menggunakan Full Refresh pattern — setiap run menghapus isi semua sheet lalu menulis ulang seluruh data aktif dari Firestore bul-monitor. Dijalankan tiap 17:00 UTC (= 00:00 WIB) via GitHub Actions cron. Identik secara teknis dengan `scripts/gl-sync/` (bul-accounting) yang sudah ada, perbedaannya: Full Refresh (bukan incremental append), multiple collections, Firebase project berbeda.

**Tech Stack:** Node.js 20, `@google-cloud/firestore` ^7.x, `googleapis` ^140.x, GitHub Actions, Workload Identity Federation (WIF) via `google-github-actions/auth@v2`

**Model Allocation:**
- **Task 1, 3, 4, 5**: Claude (Sonnet) — config files, workflow YAML, manual setup guide
- **Task 2**: Codex (GPT 5.5) — `index.js` main script (~400 baris, repetitive pattern-following)

**Reference:** Design doc di `docs/superpowers/specs/2026-05-30-bul-monitor-sheets-sync-design.md`

---

## File Map

| File | Action | Model |
|---|---|---|
| `scripts/bul-monitor-sync/package.json` | Create | Claude |
| `scripts/bul-monitor-sync/package-lock.json` | Generate via `npm install` | Claude |
| `scripts/bul-monitor-sync/index.js` | Create | Codex |
| `.github/workflows/bul-monitor-sync.yml` | Create | Claude |

---

### Task 1: Setup Project Structure

**Model: Claude**

**Files:**
- Create: `scripts/bul-monitor-sync/package.json`
- Generate: `scripts/bul-monitor-sync/package-lock.json`

- [ ] **Step 1: Buat package.json**

Buat file `scripts/bul-monitor-sync/package.json` dengan isi berikut (dependencies identik dengan `scripts/gl-sync/package.json`):

```json
{
  "name": "bul-monitor-sync",
  "version": "1.0.0",
  "description": "BUL-Monitor Firestore → Google Sheets daily full-refresh sync",
  "main": "index.js",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "@google-cloud/firestore": "^7.10.0",
    "googleapis": "^140.0.1"
  },
  "engines": {
    "node": ">=20"
  }
}
```

- [ ] **Step 2: Install dependencies untuk generate lock file**

```bash
cd scripts/bul-monitor-sync
npm install
```

Expected: `node_modules/` dibuat, `package-lock.json` dihasilkan. Tidak ada error.

- [ ] **Step 3: Commit**

```bash
git add scripts/bul-monitor-sync/package.json scripts/bul-monitor-sync/package-lock.json
git commit -m "feat(bul-monitor-sync): scaffold project with package.json"
```

---

### Task 2: Implement Sync Script — CODEX TASK

**Model: Codex (GPT 5.5)**

**Files:**
- Create: `scripts/bul-monitor-sync/index.js`

**⚠️ SEBELUM MEMBERIKAN PROMPT KE CODEX:**
Pastikan Codex dapat membaca file `scripts/gl-sync/index.js` (referensi utama) dan memahami struktur project di `C:\Project\scripts\`.

---

**CODEX HANDOFF PROMPT (copy-paste seluruh blok ini ke Codex):**

```
Implement the file `scripts/bul-monitor-sync/index.js`.

STEP 0: Read the reference file `scripts/gl-sync/index.js` first. Your implementation MUST follow its exact code style, error handling, and structural patterns.

---

WHAT TO BUILD:
A Node.js script that reads data from Firebase Firestore (bul-monitor project) and writes it to Google Sheets using a Full Refresh strategy: for each sheet, clear all rows except the header, then write all current active data.

This is different from the reference (gl-sync) which does incremental daily append. Do NOT copy the incremental/date-filter logic. Use Full Refresh instead.

---

ENVIRONMENT VARIABLES:
- FIREBASE_PROJECT_ID — Firebase project ID for bul-monitor
- GOOGLE_SPREADSHEET_ID — Target Google Spreadsheet ID
- DRY_RUN — if 'true', skip all Sheets write/clear operations (just log what would happen)

---

AUTH (identical to reference):
- Firestore: const db = new Firestore({ projectId: FIREBASE_PROJECT_ID })
- Sheets: google.auth.GoogleAuth with scope 'https://www.googleapis.com/auth/spreadsheets'
- Both use Application Default Credentials (ADC), set externally by GitHub Actions WIF

---

FIRESTORE COLLECTIONS TO READ (all prefixed with `bul_`):

1. Surat Jalan (two collections — merge them):
   - Primary: `bul_surat_jalan`
   - Legacy: `bul_suratJalan`
   - Merge by field `id` (keep doc with latest `updatedAt`; if both are equal keep primary)
   - Normalize: tanggalSJ = row.tanggalSJ || row.tglSJ || row.tgl_sj || row.tanggal || ''
   - Filter: isActive !== false AND !deletedAt

2. Invoices: `bul_invoices`
   - Filter: isActive !== false

3. Biaya: `bul_biaya`
   - Filter: isActive !== false AND !deletedAt

4. Trucks: `bul_trucks`
   - Filter: isActive !== false AND !deletedAt

5. Supir: `bul_supir`
   - Filter: isActive !== false AND !deletedAt

6. Rute: `bul_rute`
   - Filter: isActive !== false AND !deletedAt

7. Pelanggan: `bul_pelanggan`
   - Filter: isActive !== false AND !deletedAt

---

SHEET STRUCTURE (8 tabs in the Google Spreadsheet):

Each sheet must have a header row in row 1. refreshSheet() = clearSheet() then appendRows().

**Sheet "Surat Jalan"**
Headers (row 1): ['Tanggal SJ','Tanggal Terkirim','Nomor SJ','PT','Supir','Nomor Polisi','Rute','Material','Qty Bongkar','Satuan','Uang Jalan (Rp)','Status','Status Invoice','Waktu Sync (WIB)']
Data rows (one row per SJ, sorted by tanggalSJ descending):
[
  toDateStr(sj.tanggalSJ),
  toDateStr(sj.tglTerkirim),
  sj.nomorSJ || '',
  sj.pt || '',
  sj.namaSupir || '',
  sj.nomorPolisi || '',
  sj.rute || '',
  sj.material || '',
  Number(sj.qtyBongkar) || 0,
  sj.satuan || '',
  Number(sj.uangJalan) || 0,
  sj.status || '',
  sj.statusInvoice || '',
  syncTimestamp
]

**Sheet "Invoice"**
Headers: ['No. Invoice','Tanggal Invoice','PT','Total Qty','Total Nilai (Rp)','Status','Jumlah SJ','Waktu Sync (WIB)']
Data rows (sorted by tglInvoice descending):
[
  inv.noInvoice || '',
  toDateStr(inv.tglInvoice),
  inv.pt || '',
  Number(inv.totalQty) || 0,
  Number(inv.totalNilai) || 0,
  inv.status || '',
  (inv.suratJalanIds || []).length,
  syncTimestamp
]

**Sheet "Biaya Tambahan"**
Headers: ['Nomor SJ','Tanggal SJ','PT','Jenis Biaya','Nominal (Rp)','Keterangan','Waktu Sync (WIB)']
Data rows: join biaya with sjMap (Map keyed by sj.id built from Surat Jalan array):
[
  sjMap.get(b.suratJalanId)?.nomorSJ || b.suratJalanId || '',
  toDateStr(sjMap.get(b.suratJalanId)?.tanggalSJ),
  sjMap.get(b.suratJalanId)?.pt || '',
  b.jenisBiaya || '',
  Number(b.nominal) || 0,
  b.keteranganBiaya || '',
  syncTimestamp
]
Sort by tanggalSJ descending (from sjMap lookup).

**Sheet "Armada"**
Headers: ['Plat Nomor','Nama']
Data rows (sorted by platNomor ascending):
[
  t.platNomor || t.nomorPolisi || t.name || '',
  t.name || t.namaTruck || ''
]

**Sheet "Supir"**
Headers: ['Nama Supir']
Data rows (sorted ascending):
[ s.namaSupir || s.name || '' ]

**Sheet "Rute"**
Headers: ['Nama Rute']
Data rows (sorted ascending):
[ r.rute || r.name || '' ]

**Sheet "Pelanggan"**
Headers: ['Nama PT','Alamat','NPWP']
Data rows (sorted by name ascending):
[ p.name || '', p.address || '', p.npwp || '' ]

**Sheet "_sync_log"**
Headers: ['Tanggal Run (WIB)','Status','SJ','Invoice','Biaya','Armada','Supir','Rute','Pelanggan','Selesai Pada (WIB)']
NEVER cleared — append only. One row per run:
[ dateStr, status, counts.sj, counts.invoice, counts.biaya, counts.armada, counts.supir, counts.rute, counts.pelanggan, syncTimestamp ]

---

HELPER FUNCTIONS REQUIRED:

toDateStr(isoStr): convert ISO string to 'DD/MM/YYYY' in WIB timezone (Asia/Jakarta).
Return '' if falsy. Example: '2026-05-29T17:00:00.000Z' → '30/05/2026'

toWIBString(isoStr): convert ISO to locale datetime string in WIB (same as gl-sync reference).

ensureHeaders(): for each of the 8 sheets, call sheets.spreadsheets.values.get on A1:Z1.
If the row is empty or missing, call sheets.spreadsheets.values.update to write the headers.
valueInputOption: 'USER_ENTERED'

clearSheet(sheetName): clear range `${sheetName}!A2:Z100000` using sheets.spreadsheets.values.clear.
If DRY_RUN, log "[DRY RUN] Akan clear data di '${sheetName}'" and return.

appendRows(sheetName, rows): use sheets.spreadsheets.values.append with:
  range: `${sheetName}!A1`
  valueInputOption: 'USER_ENTERED'
  insertDataOption: 'INSERT_ROWS'
If rows.length === 0, return early.
If DRY_RUN, log "[DRY RUN] Akan tulis ${rows.length} baris ke '${sheetName}'" and return.

refreshSheet(sheetName, rows): call clearSheet then appendRows.
Log: `  📊 Refresh "${sheetName}": ${rows.length} baris`

---

MAIN FUNCTION FLOW:

async function main() {
  1. Print header banner (like gl-sync)
  2. await ensureHeaders()
  3. Fetch all collections in parallel using Promise.all
  4. Build sjMap = new Map(sjList.map(s => [s.id, s]))
  5. refreshSheet("Surat Jalan", buildSJRows(sjList, syncTimestamp))
  6. refreshSheet("Invoice", buildInvoiceRows(invoiceList, syncTimestamp))
  7. refreshSheet("Biaya Tambahan", buildBiayaRows(biayaList, sjMap, syncTimestamp))
  8. refreshSheet("Armada", buildArmadaRows(truckList))
  9. refreshSheet("Supir", buildSupirRows(supirList))
  10. refreshSheet("Rute", buildRuteRows(ruteList))
  11. refreshSheet("Pelanggan", buildPelangganRows(pelangganList))
  12. appendRows("_sync_log", [logRow])
  13. Print success summary with counts
}

main().catch(err => { console.error(err); process.exit(1) })

---

STYLE REQUIREMENTS:
- 'use strict' at top
- All async/await (no .then())
- console.log with emoji prefix like gl-sync (📡 ✓ 📊 ✅ ❌)
- Guard: if (!SPREADSHEET_ID) { console.error('❌ ...'); process.exit(1) }
- No TypeScript, no classes, just plain functions and module.exports not needed (it's a script)
```

---

Setelah Codex mengembalikan file:

- [ ] **Step 1: Verifikasi file tidak kosong**

```bash
wc -l scripts/bul-monitor-sync/index.js
```
Expected output: angka > 200

- [ ] **Step 2: Jalankan dry run lokal**

Isi dulu nilai di bawah dari Firebase Console dan URL spreadsheet:

```bash
cd scripts/bul-monitor-sync
FIREBASE_PROJECT_ID=<isi-firebase-project-id-bul-monitor> \
GOOGLE_SPREADSHEET_ID=<isi-spreadsheet-id> \
DRY_RUN=true \
node index.js
```

Expected output mengandung:
```
═══════════════════════════════════
  BUL-Monitor Sheets Sync
  DRY RUN : 🧪 YA
═══════════════════════════════════
📡 Mengambil data dari Firestore...
  ✓ Surat Jalan : ... records
  ...
[DRY RUN] Akan clear data di 'Surat Jalan'
[DRY RUN] Akan tulis ... baris ke 'Surat Jalan'
...
✅ Sync selesai!
```

Jika ada error `FIREBASE_PROJECT_ID not set` atau `GOOGLE_SPREADSHEET_ID not set`: pastikan env var sudah di-set dengan benar.

Jika ada error Firebase auth: script ini memerlukan Google ADC. Untuk test lokal, jalankan `gcloud auth application-default login` terlebih dahulu.

- [ ] **Step 3: Commit**

```bash
git add scripts/bul-monitor-sync/index.js
git commit -m "feat(bul-monitor-sync): implement full-refresh Firestore to Sheets sync"
```

---

### Task 3: GitHub Actions Workflow

**Model: Claude**

**Files:**
- Create: `.github/workflows/bul-monitor-sync.yml`

- [ ] **Step 1: Buat workflow file**

Buat `.github/workflows/bul-monitor-sync.yml` dengan isi:

```yaml
name: BUL-Monitor Sheets Sync

on:
  schedule:
    # Jam 17:00 UTC = 00:00 WIB (UTC+7) — full refresh data hari ini
    - cron: '0 17 * * *'

  # Manual trigger untuk testing atau re-sync darurat
  workflow_dispatch:
    inputs:
      dry_run:
        description: 'Dry run — tampilkan data yang akan disync tanpa menulis ke Sheets'
        required: false
        type: boolean
        default: false

# Hanya satu sync berjalan sekaligus; jangan cancel yang sedang berjalan
concurrency:
  group: bul-monitor-sync
  cancel-in-progress: false

jobs:
  sync:
    name: Sync bul-monitor → Google Sheets
    runs-on: ubuntu-latest

    permissions:
      id-token: write   # Wajib untuk OIDC token GitHub (dipakai WIF)
      contents: read

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js 20
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: scripts/bul-monitor-sync/package-lock.json

      - name: Authenticate to Google Cloud (Workload Identity Federation)
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ secrets.GCP_WORKLOAD_IDENTITY_PROVIDER }}
          service_account: ${{ secrets.GCP_SERVICE_ACCOUNT }}

      - name: Install dependencies
        working-directory: scripts/bul-monitor-sync
        run: npm ci

      - name: Run sync
        working-directory: scripts/bul-monitor-sync
        env:
          FIREBASE_PROJECT_ID: ${{ secrets.BUL_MONITOR_FIREBASE_PROJECT_ID }}
          GOOGLE_SPREADSHEET_ID: ${{ secrets.BUL_MONITOR_SPREADSHEET_ID }}
          DRY_RUN: ${{ github.event.inputs.dry_run || 'false' }}
        run: node index.js

      - name: Upload log on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: bul-monitor-sync-log-${{ github.run_id }}
          path: /tmp/bul-monitor-sync-*.log
          retention-days: 7
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/bul-monitor-sync.yml
git commit -m "feat(bul-monitor-sync): add GitHub Actions workflow (daily 00:00 WIB)"
```

---

### Task 4: GitHub Secrets & IAM Setup (Manual — Dikerjakan User)

**Model: Claude (instruksi untuk user)**

Ini adalah langkah manual yang harus dilakukan di luar codebase. Tidak ada kode yang ditulis — hanya konfigurasi di browser.

**A. Tambahkan 2 GitHub Secrets baru**

Buka: GitHub repo → Settings → Secrets and variables → Actions → New repository secret

| Nama Secret | Nilai | Cara mendapatkan |
|---|---|---|
| `BUL_MONITOR_FIREBASE_PROJECT_ID` | Firebase Project ID | Firebase Console → ⚙️ Project Settings → tab General → "Project ID" |
| `BUL_MONITOR_SPREADSHEET_ID` | ID Google Spreadsheet | Buka spreadsheet baru di Google Sheets → ambil ID dari URL: `https://docs.google.com/spreadsheets/d/**{ID_INI}**/edit` |

Dua secret ini melengkapi secret yang sudah ada (`GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT`, `GOOGLE_SPREADSHEET_ID`) yang dipakai bersama dengan gl-sync.

**B. Tambahkan IAM permission di GCP (agar service account bisa baca Firestore bul-monitor)**

Service account yang dipakai di `GCP_SERVICE_ACCOUNT` perlu akses ke project Firebase bul-monitor (berbeda dengan bul-accounting yang sudah dikonfigurasi).

1. Buka: https://console.cloud.google.com/iam-admin/iam
2. Pilih project: **bul-monitor** (pastikan bukan bul-accounting)
3. Klik "+ GRANT ACCESS"
4. Di "New principals": paste email service account dari secret `GCP_SERVICE_ACCOUNT`
5. Di "Assign roles": pilih **Cloud Datastore Viewer**
6. Klik Save

**C. Share Google Spreadsheet ke service account (agar bisa menulis)**

1. Buat Google Spreadsheet baru (kosong)
2. Klik tombol Share (pojok kanan atas)
3. Tambahkan email service account
4. Set permission: **Editor**
5. Klik Send

- [ ] **Step 1: Tambahkan secret `BUL_MONITOR_FIREBASE_PROJECT_ID`**
- [ ] **Step 2: Tambahkan secret `BUL_MONITOR_SPREADSHEET_ID`**
- [ ] **Step 3: Tambahkan IAM role Cloud Datastore Viewer di GCP project bul-monitor**
- [ ] **Step 4: Share Google Spreadsheet ke service account sebagai Editor**

---

### Task 5: End-to-End Verification

**Model: Claude**

Jalankan setelah Task 4 selesai (secrets sudah dikonfigurasi).

- [ ] **Step 1: Trigger dry run via GitHub Actions**

Buka: GitHub repo → Actions → "BUL-Monitor Sheets Sync" → Run workflow → centang "Dry run: true" → Run workflow

Tunggu hingga workflow selesai (biasanya 1-2 menit).

Expected: workflow ✅ hijau. Di log, cari baris-baris seperti:
```
✓ Surat Jalan : [angka] records
✓ Invoice      : [angka] records
[DRY RUN] Akan clear data di 'Surat Jalan'
[DRY RUN] Akan tulis [angka] baris ke 'Surat Jalan'
```

Jika workflow ❌ merah dengan error `PERMISSION_DENIED` pada Firestore: periksa kembali IAM permission di Task 4B.

- [ ] **Step 2: Trigger live run**

Run workflow lagi, **tanpa** mencentang dry run.

Expected: workflow ✅ hijau.

- [ ] **Step 3: Verifikasi isi Google Spreadsheet**

Buka spreadsheet, periksa:

| Cek | Expected |
|---|---|
| Tab "Surat Jalan" ada | ✅ |
| Tab "Invoice" ada | ✅ |
| Tab "Biaya Tambahan" ada | ✅ |
| Tab "Armada" ada | ✅ |
| Tab "Supir" ada | ✅ |
| Tab "Rute" ada | ✅ |
| Tab "Pelanggan" ada | ✅ |
| Tab "_sync_log" ada | ✅ |
| "Surat Jalan" baris 1 = header | ✅ |
| "Surat Jalan" ada data (bukan kosong) | ✅ |
| "_sync_log" baris terakhir = status "success" | ✅ |
| Ambil 1 Nomor SJ dari Sheets, cek di Firebase Console ada | ✅ |

- [ ] **Step 4: Verifikasi full refresh bekerja**

1. Ubah status satu SJ di aplikasi bul-monitor
2. Trigger live run lagi via workflow_dispatch
3. Cari SJ tersebut di sheet "Surat Jalan"
4. Pastikan kolom "Status" sudah berubah sesuai perubahan yang dilakukan

---

## Self-Review Checklist

- [x] **Spec coverage**: package.json (Task 1), index.js (Task 2), workflow YAML (Task 3), secrets setup (Task 4), E2E test (Task 5) — semua requirement design doc tercakup
- [x] **Placeholder scan**: semua steps berisi konten aktual, tidak ada TBD/TODO
- [x] **Type consistency**: `refreshSheet`, `clearSheet`, `appendRows`, `ensureHeaders`, `buildSJRows`, `buildInvoiceRows`, `buildBiayaRows` — konsisten di Task 2 dan Codex prompt
- [x] **Model allocation**: Tasks 1/3/4/5 → Claude; Task 2 → Codex dengan handoff prompt lengkap
