# Handoff: ERP-ACC — Current State (2026-04-17)

**Status**: ✅ Production Live

**Branch**: `main`

**Production URL**: https://erp-app-umber.vercel.app

**Commit terbaru**: `f433dd1` test: fix Playwright PO print spec

---

## State Saat Ini

Project ERP-ACC dalam kondisi stabil di `main`. Tiga fitur besar telah selesai:
1. **AntD Migration** (2026-04-15) — full Tailwind → Ant Design 6 migration
2. **Print Sales Invoice** (2026-04-17) — fitur cetak & PDF invoice penjualan + Company Settings
3. **Print Purchase Order** (2026-04-17) — fitur cetak & PDF purchase order + Playwright E2E tests

---

## Fitur Terakhir: Print Purchase Order

### Yang Diimplementasikan

| File Baru | Tujuan |
|-----------|--------|
| `erp-app/src/components/shared/POPrintTemplate.jsx` | Template HTML PO (reuse InvoicePrintTemplate.css) |
| `erp-app/src/hooks/usePrintPO.js` | Hook: triggerPrint, triggerPDF, loadingIds |
| `erp-app/tests/po-print.spec.js` | 7 Playwright E2E tests — semua passing |

| File Dimodifikasi | Perubahan |
|-------------------|-----------|
| `erp-app/src/pages/purchase/PurchaseOrderFormPage.jsx` | Tombol Print + PDF di toolbar (hanya untuk PO yang sudah tersimpan) |
| `erp-app/src/pages/purchase/PurchaseOrdersPage.jsx` | Kolom Aksi (icon print/PDF per baris) |
| `erp-app/.gitignore` | Tambah `.env.test`, `tests/.auth.json` |

### Arsitektur Print PO

Identik dengan Sales Invoice print — reuse container + CSS yang sama:

```
Company Settings (Supabase) ──► getCompanySettings()
                                        │
                              usePrintPO hook
                             ┌──────────┴──────────┐
                       triggerPrint()         triggerPDF()
                             │                     │
                   Render ke #invoice-print-root   │
                             │                     │
                      window.print()     jsPDF.html() + html2canvas
                                               doc.save(`po-{nomor}-{tanggal}.pdf`)
```

**Perbedaan dari Sales Invoice:**
- Tidak ada baris PPN di totals
- Menampilkan Supplier (bukan Customer)
- Filename PDF: `po-{po_number}-{date}.pdf`
- Print button hanya muncul saat edit PO existing (`{id}` ada) — tidak di form new

### Playwright E2E Tests (`po-print.spec.js`)

7 tests, 100% pass, run time ~17 detik:

| Test | Verifikasi |
|------|------------|
| 1 | PO list loads dengan kolom Aksi |
| 2 | Print icon di list → `window.print` dipanggil |
| 3 | PDF icon di list → file `po-*.pdf` terdownload |
| 4 | PO form existing → tombol Print + PDF terlihat |
| 5 | Print button di form → `window.print` dipanggil |
| 6 | PDF button di form → file `po-*.pdf` terdownload |
| 7 | Form PO baru → tombol Print/PDF tidak muncul |

**Test setup**: `beforeAll` create test supplier + product + PO via Supabase client, `afterAll` hard-delete semua. Test data tidak pernah tampil di UI.

**Auth**: storageState dibangun manual dari Supabase session token (bukan browser login) — lebih reliable dengan AntD controlled inputs.

```bash
# Jalankan PO print tests
cd C:\Project\ERP-ACC\erp-app
npm run dev          # Terminal 1
npx playwright test tests/po-print.spec.js --reporter=list  # Terminal 2
```

### Manual Test Steps

Verifikasi di production:
1. Buka `/purchase/orders` → kolom Aksi muncul di tabel
2. Klik icon Print per baris → dialog print terbuka, layout A4, tampilkan "Purchase Order"
3. Klik icon PDF per baris → file `po-*.pdf` terunduh
4. Buka PO existing → toolbar ada tombol Print + Download PDF
5. Form PO baru (`/purchase/orders/new`) → tidak ada tombol Print/PDF
6. Data supplier, tanggal, items, subtotal, total muncul benar di template
7. Logo & info perusahaan dari Company Settings muncul di header

---

## Fitur Sebelumnya: Print Sales Invoice

### Yang Diimplementasikan

| File Baru | Tujuan |
|-----------|--------|
| `erp-app/migrations/001_company_settings.sql` | SQL migration tabel company_settings + storage bucket |
| `erp-app/src/services/companySettingsService.js` | CRUD Supabase (get, update, uploadLogo) |
| `erp-app/src/hooks/useCompanySettings.js` | React hook fetch company settings |
| `erp-app/src/pages/settings/CompanySettingsPage.jsx` | Form edit info perusahaan |
| `erp-app/src/components/shared/InvoicePrintTemplate.jsx` | Template HTML invoice (pure HTML) |
| `erp-app/src/components/shared/InvoicePrintTemplate.css` | CSS print styles (@media print, A4) |
| `erp-app/src/hooks/usePrintInvoice.js` | Hook: triggerPrint, triggerPDF, loadingIds |
| `erp-app/playwright.config.js` | Playwright test configuration |
| `erp-app/tests/invoice-print.spec.js` | 8 test cases — semua passing |

| File Dimodifikasi | Perubahan |
|-------------------|-----------|
| `erp-app/src/App.jsx` | Route `/settings/company`, div `#invoice-print-root`, fix Spin tip→description |
| `erp-app/src/components/layout/Sidebar.jsx` | Menu "Pengaturan Perusahaan" (minRole: write) |
| `erp-app/src/pages/sales/SalesInvoiceFormPage.jsx` | Tombol Print + PDF di toolbar |
| `erp-app/src/pages/sales/SalesInvoicesPage.jsx` | Kolom Aksi (icon print/PDF per baris) |

---

## Infrastructure

### Deployment

| Setting | Value |
|---------|-------|
| Platform | Vercel |
| Project | `manfred-gunardis-projects/erp-app` |
| URL | https://erp-app-umber.vercel.app |
| Cara deploy | `vercel --prod` dari dalam `erp-app/` |

```bash
cd C:\Project\ERP-ACC\erp-app
vercel --prod
```

### Supabase

| Setting | Value |
|---------|-------|
| Project ID | `cjnszzfbxgyszoskfgva` |
| URL | `https://cjnszzfbxgyszoskfgva.supabase.co` |
| Env vars | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |

Env vars sudah dikonfigurasi di Vercel dashboard (Production + Preview + Development).

### Testing (Playwright)

```bash
cd C:\Project\ERP-ACC\erp-app

# Dev server harus running
npm run dev

# Jalankan semua tests (terminal lain)
npx playwright test

# Hasil terakhir: 15 passing (8 invoice + 7 PO)

# Credentials test di .env.test (gitignored)
# Units harus ada di database (pcs/dus/kg) — selalu ada
```

**Catatan**: `.env.test` berisi credentials asli — jangan pernah di-commit.

---

## Tech Stack Saat Ini

```
Frontend:  React 18 + Vite 8 + Ant Design 6.3.5
Icons:     Lucide React (bukan @ant-design/icons)
PDF:       jsPDF 4.2.1 + html2canvas
Backend:   Supabase (PostgreSQL + Auth + Storage)
Deploy:    Vercel
Testing:   Playwright 1.59.1 + @supabase/supabase-js + dotenv
```

### Konvensi yang Harus Diikuti

- **Jangan pakai Tailwind** — sudah dihapus dari build pipeline
- **Gunakan wrapper components** (`src/components/ui/`) untuk Button, Input, Select, Modal, dll
- **Date input**: gunakan `DateInput` wrapper (ISO string I/O)
- **Toast**: gunakan `useToast()` hook
- **Styling**: inline `style={{}}` atau AntD props
- **Print template**: pure HTML + inline styles (tanpa AntD/Tailwind) — intentional agar reliabel dengan jsPDF

---

## Setup Lokal

```bash
cd C:\Project\ERP-ACC\erp-app
npm install
npm run dev          # Dev server → localhost:5173
npm run build        # Production build (harus passing sebelum deploy)
```

---

## Known Issues / Catatan

- **Chunk size warning** saat build: normal (html2canvas 199KB + AntD bundle). Bukan blocking.
- **Company Settings** hanya untuk `canWrite`. Viewer tidak bisa akses halaman, tapi tetap bisa print.
- **Logo**: satu file aktif — upload baru overwrite yang lama.
- **Print template visibility**: container `#invoice-print-root` pakai `display: none` by default, hanya visible via `@media print` atau saat PDF rendering. Test pakai `state: 'attached'` bukan `state: 'visible'`.

---

## Next Steps (Opsional)

Tidak ada task wajib. Kemungkinan next:
- Print untuk Purchase Invoice
- Print untuk Goods Receipt
- Print preview in-app sebelum dialog print
- Fitur ERP berikutnya sesuai kebutuhan bisnis

---

**Documented**: 2026-04-17  
**Status**: ✅ Production Live — https://erp-app-umber.vercel.app
