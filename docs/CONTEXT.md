# CONTEXT.md — Peta Aplikasi

Monorepo ini berisi 4 SPA React yang independen, masing-masing untuk perusahaan berbeda dengan Firebase project terpisah (kecuali erp-acc yang pakai Supabase).

---

## 1. sj-monitor — Surat Jalan Monitor

**Tujuan:** Tracking surat jalan (delivery note), penagihan invoice, pembayaran, dan laporan kas/truk untuk satu perusahaan.

**Backend:** Firebase Auth + Cloud Firestore

**Key files / modul:**

| Modul | File utama | Fungsi |
|---|---|---|
| Surat Jalan (SJ) | `src/App.jsx` | Buat, edit, lacak surat jalan |
| Invoice | `src/App.jsx` | Generate invoice dengan Harga Per Rute |
| Uang Muka | `src/App.jsx` | Tracking uang muka per rute/pelanggan |
| Kas / Laporan Kas | `src/LaporanKasPage.jsx` | Laporan arus kas |
| Laporan Truk | `src/LaporanTrukPage.jsx` | Laporan aktivitas armada |
| Payslip | `src/PayslipExport/Report/Table.jsx` | Cetak slip gaji supir |
| Ritasi | `src/RitasiBulkUpload.jsx` | Import data perjalanan bulk (CSV/Excel) |
| Master Data | `src/firestoreService.js`, `src/App.jsx` | Rute, Material, Armada, Supir |

**Cara menjalankan:**
```bash
cd apps/sj-monitor
npm install          # pertama kali / setelah clone
npm run dev          # dev server lokal
npm run build        # production build (harus sukses sebelum deploy)
npm test             # unit test Vitest (khusus src/utils/ & src/services/)
npm run lint         # ESLint pada src/utils/ + src/services/
npm run smoketest    # build + deploy ke staging (wajib sebelum production)
```

---

## 2. bul-monitor — BUL Monitor

**Tujuan:** Varian sj-monitor untuk perusahaan BUL. Selain tracking surat jalan, mengirim data ke bul-accounting via Firestore (lihat `shared/bul-bridge/`).

**Backend:** Firebase Auth + Cloud Firestore

**Key files / modul:**

Logika utama terpusat di `src/App.jsx` (~7.000+ baris, monolith yang sedang di-refactor bertahap). Modul yang sudah diekstrak ke `src/components/`:

- `StatCard.jsx` — kartu ringkasan statistik
- `SearchableSelect.jsx` — dropdown dengan pencarian
- `UsersManagement.jsx` — manajemen pengguna
- `SettingsManagement.jsx` — pengaturan aplikasi
- `LoginScreen.jsx` — halaman login
- `MasterDataManagement.jsx` — data master (rute, armada, dll.)
- `LaporanKas.jsx` — laporan kas (read-only)
- `KeuanganManagement.jsx` — tampilan keuangan
- `InvoiceManagement.jsx` — manajemen invoice
- `SuratJalanCard.jsx` — kartu surat jalan
- `Modal.jsx` + `modals/*FormFields.jsx` — form-form master data
- `src/services/firestoreWrites.js` — helper tulis Firestore
- `src/utils/formatters.js` — helper format (pure functions)

**Cara menjalankan:**
```bash
cd apps/bul-monitor
npm install
npm run dev
npm run build
```

---

## 3. bul-accounting — Pembukuan Truck (BUL)

**Tujuan:** Sistem akuntansi penuh untuk perusahaan BUL: COA, jurnal double-entry, kas/bank, penjualan, biaya, aset, dan laporan keuangan. Menerima data dari bul-monitor via Firestore.

**Backend:** Firebase Auth + Cloud Firestore

**Key files / modul:**

| Modul | File utama | Fungsi |
|---|---|---|
| COA | `src/COAPage.jsx` | Kelola Chart of Accounts |
| Jurnal | `src/JurnalPage.jsx`, `src/JournalEntryForm.jsx` | Entri jurnal double-entry |
| Kas/Bank | `src/KasBankPage.jsx` | Transaksi kas dan bank |
| Penjualan | `src/PenjualanPage.jsx` | Catatan penjualan |
| Biaya | `src/BiayaPage.jsx` | Tracking pengeluaran |
| Aset | `src/AsetPage.jsx` | Manajemen aset |
| Laporan | `src/LaporanPage.jsx` | Laporan keuangan |
| Pelanggan/Supplier | `src/PelangganPage.jsx`, `src/SupplierPage.jsx` | Master data pelanggan/vendor |
| Armada | `src/ArmadaPage.jsx` | Manajemen armada |

**Cara menjalankan:**
```bash
cd apps/bul-accounting
npm install
npm run dev
npm run build
```

---

## 4. erp-acc — ERP ACC

**Tujuan:** Sistem ERP penuh (lebih enterprise dibanding 3 app lainnya): pembelian (PO/GR/PI), penjualan (SO/GD/SI), jurnal, bank, laporan keuangan, aset tetap, cost center, dan multi-user RBAC.

**Backend:** Supabase (PostgreSQL + Auth + RPC) — **berbeda dari 3 app lainnya yang memakai Firebase.**

**Frontend tambahan:** Ant Design (bukan Tailwind CSS murni seperti app lain)

**Cara menjalankan:**
```bash
cd apps/erp-acc/erp-app
npm install
npm run dev
npm run build
```

> Catatan: entry point ada di `apps/erp-acc/erp-app/`, bukan langsung `apps/erp-acc/`.

---

## Relasi antar-app

```
bul-monitor ──(Firestore write)──► bul-accounting
```

Kontrak data exchange didokumentasikan di `shared/bul-bridge/`.

---

## Memori: auto-memory vs in-repo docs

- **Auto-memory Claude Code**: `~/.claude/projects/C--Project/memory/` — konteks lintas-sesi personal (handoff, keputusan, gotcha), TIDAK ikut repo, harus dibawa manual ke laptop baru.
- **docs/ in-repo** (`CONTEXT.md`, `CLAUDE.md`): fakta arsitektur dan konvensi yang IKUT repo & portable ke laptop baru. Ini sumber kebenaran untuk onboarding.
