# Design: bul-monitor → Google Sheets Sync

**Date**: 2026-05-30  
**Author**: Claude (brainstorming session)  
**Status**: Approved

---

## Problem

Data operasional bul-monitor tersimpan di Firebase Firestore. Pemilik usaha dan akuntan tidak memiliki akses langsung ke Firebase, sehingga analisis bisnis dan koordinasi data harus dilakukan secara manual. Perlu mekanisme otomatis yang menyajikan data Firestore dalam format yang mudah diakses di Google Sheets.

---

## Goals

1. **Analisis bisnis owner** — pivot table, grafik trend, monitoring volume SJ per PT/supir/rute
2. **Koordinasi eksternal** — akuntan dan pihak lain dapat melihat data operasional terkini tanpa akses ke Firebase

---

## Non-Goals

- Real-time sync (bukan live/streaming)
- Sinkronisasi dua arah (Sheets → Firebase) — hanya satu arah
- Sinkronisasi koleksi `bul_transaksi` (Transaksi Kas) — tidak termasuk scope ini
- Modifikasi script gl-sync yang sudah ada (bul-accounting)

---

## Solution: Full Refresh Scheduled Sync

### Pendekatan

Setiap tengah malam WIB (17:00 UTC), GitHub Actions menjalankan Node.js script yang:
1. Mengambil semua data aktif dari Firestore bul-monitor
2. Menghapus isi setiap sheet (kecuali header row)
3. Menulis ulang seluruh data terkini

**Alasan Full Refresh (bukan Incremental Append seperti gl-sync):**
Data bul-monitor bersifat operasional — status SJ berubah terus (pending → terkirim → invoiced). Incremental append tidak akan mencerminkan perubahan status. Full Refresh memastikan Sheets selalu akurat.

---

## Architecture

```
C:\Project/
├── scripts/
│   ├── gl-sync/                     ← EXISTING (bul-accounting, tidak diubah)
│   └── bul-monitor-sync/            ← NEW
│       ├── index.js                 ← Main sync script
│       └── package.json
└── .github/workflows/
    ├── gl-sync.yml                  ← EXISTING (tidak diubah)
    └── bul-monitor-sync.yml         ← NEW
```

### Dependencies (sama dengan gl-sync)
- `@google-cloud/firestore` ^7.x — Firestore Admin SDK
- `googleapis` ^140.x — Google Sheets API v4

### Auth
Workload Identity Federation (WIF) — sama persis dengan gl-sync. Tidak ada service account key hardcoded. GitHub OIDC token di-exchange ke Google ADC via `google-github-actions/auth@v2`.

**GitHub Secrets yang dibutuhkan:**
| Secret | Keterangan |
|---|---|
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Sudah ada (reuse dari gl-sync) |
| `GCP_SERVICE_ACCOUNT` | Sudah ada (perlu ditambahkan IAM role ke project bul-monitor) |
| `BUL_MONITOR_SPREADSHEET_ID` | ID Google Spreadsheet baru untuk bul-monitor |
| `BUL_MONITOR_FIREBASE_PROJECT_ID` | Firebase Project ID bul-monitor (dari .env atau Firebase Console) |

---

## Google Spreadsheet Structure

Satu spreadsheet dengan 8 tab/sheet:

### Sheet 1: Surat Jalan
Data semua SJ aktif (isActive !== false, tidak deletedAt).

| Kolom | Sumber Field Firestore |
|---|---|
| Tanggal SJ | `tanggalSJ` |
| Tanggal Terkirim | `tglTerkirim` |
| Nomor SJ | `nomorSJ` |
| PT | `pt` |
| Supir | `namaSupir` |
| Nomor Polisi | `nomorPolisi` |
| Rute | `rute` |
| Material | `material` |
| Qty Bongkar | `qtyBongkar` |
| Satuan | `satuan` |
| Uang Jalan (Rp) | `uangJalan` |
| Status | `status` |
| Status Invoice | `statusInvoice` |
| Waktu Sync (WIB) | generated |

### Sheet 2: Invoice
Data semua invoice aktif.

| Kolom | Sumber Field Firestore |
|---|---|
| No. Invoice | `noInvoice` |
| Tanggal Invoice | `tglInvoice` |
| PT | `pt` |
| Total Qty | `totalQty` |
| Total Nilai (Rp) | `totalNilai` |
| Status | `status` |
| Jumlah SJ | `suratJalanIds.length` |
| Waktu Sync (WIB) | generated |

### Sheet 3: Biaya Tambahan
Data semua biaya aktif, di-join dengan data SJ untuk menyertakan PT dan tanggal.

| Kolom | Sumber |
|---|---|
| Nomor SJ | lookup dari `suratJalanId` |
| Tanggal SJ | lookup dari SJ |
| PT | lookup dari SJ |
| Jenis Biaya | `jenisBiaya` |
| Nominal (Rp) | `nominal` |
| Keterangan | `keteranganBiaya` |
| Waktu Sync (WIB) | generated |

### Sheet 4: Armada
Master data truck aktif.

| Kolom | Sumber |
|---|---|
| Plat Nomor | `platNomor` atau `nomorPolisi` |
| Nama | `name` atau `namaTruck` |

### Sheet 5: Supir
Master data supir aktif.

| Kolom | Sumber |
|---|---|
| Nama Supir | `namaSupir` atau `name` |

### Sheet 6: Rute
Master data rute aktif.

| Kolom | Sumber |
|---|---|
| Nama Rute | `rute` atau `name` |

### Sheet 7: Pelanggan
Master data pelanggan aktif.

| Kolom | Sumber |
|---|---|
| Nama PT | `name` |
| Alamat | `address` |
| NPWP | `npwp` |

### Sheet 8: _sync_log
Append-only, satu baris per run.

| Kolom | Keterangan |
|---|---|
| Tanggal Run (WIB) | Tanggal saat sync dijalankan |
| Status | `success` / `failed` / `dry-run` |
| SJ | Jumlah record SJ yang ditulis |
| Invoice | Jumlah record invoice |
| Biaya | Jumlah record biaya |
| Armada | Jumlah record armada |
| Supir | Jumlah record supir |
| Rute | Jumlah record rute |
| Pelanggan | Jumlah record pelanggan |
| Selesai Pada (WIB) | Timestamp selesai |

---

## GitHub Actions Workflow

File: `.github/workflows/bul-monitor-sync.yml`

```yaml
name: BUL-Monitor Sheets Sync
on:
  schedule:
    - cron: '0 17 * * *'   # 00:00 WIB
  workflow_dispatch:
    inputs:
      dry_run:
        description: 'Dry run (tidak menulis ke Sheets)'
        type: boolean
        default: false
      full_sync:
        description: 'Paksa full sync (tidak ada perbedaan behavior karena ini sudah full refresh)'
        type: boolean
        default: false
concurrency:
  group: bul-monitor-sync
  cancel-in-progress: false
jobs:
  sync:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: scripts/bul-monitor-sync/package-lock.json
      - uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ secrets.GCP_WORKLOAD_IDENTITY_PROVIDER }}
          service_account: ${{ secrets.GCP_SERVICE_ACCOUNT }}
      - run: npm ci
        working-directory: scripts/bul-monitor-sync
      - run: node index.js
        working-directory: scripts/bul-monitor-sync
        env:
          FIREBASE_PROJECT_ID: ${{ secrets.BUL_MONITOR_FIREBASE_PROJECT_ID }}
          GOOGLE_SPREADSHEET_ID: ${{ secrets.BUL_MONITOR_SPREADSHEET_ID }}
          DRY_RUN: ${{ github.event.inputs.dry_run || 'false' }}
```

---

## Script Logic (index.js)

```
main()
  ├── init Firestore + Sheets API
  ├── ensureHeaders() — tulis header ke semua sheet jika belum ada
  ├── fetchAllData()
  │   ├── getDocs(bul_surat_jalan) + getDocs(bul_suratJalan) — merge legacy
  │   ├── getDocs(bul_invoices)
  │   ├── getDocs(bul_biaya)
  │   ├── getDocs(bul_trucks)
  │   ├── getDocs(bul_supir)
  │   ├── getDocs(bul_rute)
  │   └── getDocs(bul_pelanggan)
  ├── refreshSheet("Surat Jalan", buildSJRows(data.sj))
  ├── refreshSheet("Invoice", buildInvoiceRows(data.invoices))
  ├── refreshSheet("Biaya Tambahan", buildBiayaRows(data.biaya, data.sj))
  ├── refreshSheet("Armada", buildMasterRows(data.trucks))
  ├── refreshSheet("Supir", buildMasterRows(data.supir))
  ├── refreshSheet("Rute", buildMasterRows(data.rute))
  ├── refreshSheet("Pelanggan", buildPelangganRows(data.pelanggan))
  └── logSyncRun(counts)

refreshSheet(name, rows):
  ├── clearSheet(name)  ← hapus A2:Z100000
  └── appendRows(name, rows)
```

---

## Model Allocation

| Task | Model | Alasan |
|---|---|---|
| `package.json` | Claude | Trivial config |
| `bul-monitor-sync.yml` (GitHub Actions) | Claude | Security-sensitive, butuh konteks project |
| `index.js` (main script ~400 baris) | Codex | Repetitive pattern-following, cocok untuk code generation |
| Dokumentasi secrets + IAM setup | Claude | Butuh penjelasan kontekstual |

---

## Codex Handoff Prompt

Prompt untuk Codex saat handoff implementasi `index.js`:

```
Implement `scripts/bul-monitor-sync/index.js` — a Node.js script that syncs Firebase Firestore data 
from the bul-monitor project to Google Sheets using full refresh.

Reference implementation to follow exactly: `scripts/gl-sync/index.js` (read this file first).

Key differences from the reference:
1. FULL REFRESH (not incremental): for each sheet, call clearSheet() then appendRows() 
   — no date filtering, no dedup check
2. Multiple collections to sync (not just journals)
3. Different Firebase collections (all prefixed with `bul_`)

Config (from environment variables):
- FIREBASE_PROJECT_ID — bul-monitor's Firebase project ID
- GOOGLE_SPREADSHEET_ID — target spreadsheet
- DRY_RUN — if 'true', skip all writes

Collections to read from Firestore:
- `bul_surat_jalan` + legacy `bul_suratJalan` (merge by id, keep latest updatedAt)
  Filter: isActive !== false AND !deletedAt
- `bul_invoices` — Filter: isActive !== false
- `bul_biaya` — Filter: isActive !== false AND !deletedAt
- `bul_trucks` — Filter: isActive !== false AND !deletedAt
- `bul_supir` — Filter: isActive !== false AND !deletedAt
- `bul_rute` — Filter: isActive !== false AND !deletedAt
- `bul_pelanggan` — Filter: isActive !== false AND !deletedAt

Sheet structure (8 tabs):

"Surat Jalan" headers: ['Tanggal SJ','Tanggal Terkirim','Nomor SJ','PT','Supir','Nomor Polisi','Rute','Material','Qty Bongkar','Satuan','Uang Jalan (Rp)','Status','Status Invoice','Waktu Sync (WIB)']
Row: [toDateStr(sj.tanggalSJ), toDateStr(sj.tglTerkirim), sj.nomorSJ||'', sj.pt||'', sj.namaSupir||'', sj.nomorPolisi||'', sj.rute||'', sj.material||'', Number(sj.qtyBongkar)||0, sj.satuan||'', Number(sj.uangJalan)||0, sj.status||'', sj.statusInvoice||'', syncTimestamp]
Sort: tanggalSJ desc

"Invoice" headers: ['No. Invoice','Tanggal Invoice','PT','Total Qty','Total Nilai (Rp)','Status','Jumlah SJ','Waktu Sync (WIB)']
Row: [inv.noInvoice||'', toDateStr(inv.tglInvoice), inv.pt||'', Number(inv.totalQty)||0, Number(inv.totalNilai)||0, inv.status||'', (inv.suratJalanIds||[]).length, syncTimestamp]
Sort: tglInvoice desc

"Biaya Tambahan" headers: ['Nomor SJ','Tanggal SJ','PT','Jenis Biaya','Nominal (Rp)','Keterangan','Waktu Sync (WIB)']
Row: build by joining biaya with sjMap (Map keyed by sj.id) to get nomorSJ, tanggalSJ, pt
Sort: tanggalSJ desc

"Armada" headers: ['Plat Nomor','Nama']
Row: [t.platNomor||t.nomorPolisi||t.name||'', t.name||t.namaTruck||'']
Sort: platNomor asc

"Supir" headers: ['Nama Supir']
Row: [s.namaSupir||s.name||'']
Sort: name asc

"Rute" headers: ['Nama Rute']
Row: [r.rute||r.name||'']
Sort: name asc

"Pelanggan" headers: ['Nama PT','Alamat','NPWP']
Row: [p.name||'', p.address||'', p.npwp||'']
Sort: name asc

"_sync_log" headers: ['Tanggal Run (WIB)','Status','SJ','Invoice','Biaya','Armada','Supir','Rute','Pelanggan','Selesai Pada (WIB)']
Row: append only (never cleared)

Helper functions needed:
- toDateStr(isoStr) — convert ISO string to 'DD/MM/YYYY' format in WIB timezone
- toWIBString(isoStr) — convert ISO to locale datetime string WIB (same as gl-sync)
- refreshSheet(sheetName, rows) — clearSheet then appendRows
- ensureHeaders() — check A1:X1 for each sheet, write headers if empty
- All async, await-based

Error handling: wrap main() in try/catch, log error and process.exit(1) on failure.
DRY_RUN: skip clearSheet and appendRows calls, just log what would happen.
```

---

## Testing Plan

1. **Dry run** (`DRY_RUN=true`) — jalankan manual via `workflow_dispatch`, verifikasi output log menunjukkan jumlah record yang benar
2. **Verifikasi header** — cek semua 8 sheet memiliki header yang tepat
3. **Verifikasi data sampel** — bandingkan 5 record SJ di Sheets dengan data di Firebase Console
4. **Verifikasi full refresh** — ubah satu data di Firebase, jalankan sync lagi, verifikasi Sheets ikut berubah
