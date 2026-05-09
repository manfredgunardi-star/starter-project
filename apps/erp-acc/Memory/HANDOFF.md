# Handoff: ERP-ACC — Current State (2026-04-27)

**Status**: ✅ Production Live

**Branch**: `main`

**Production URL**: https://erp-app-bay.vercel.app

**Commit terbaru**: `8fad192` Merge branch 'claude/stoic-cannon-d02b87'

---

## State Saat Ini

Project ERP-ACC dalam kondisi stabil. Empat milestone besar telah selesai:
1. **AntD Migration** (2026-04-15) — full Tailwind → Ant Design 6 migration
2. **Print Sales Invoice** (2026-04-17) — fitur cetak & PDF invoice penjualan + Company Settings
3. **Print Purchase Order** (2026-04-17) — fitur cetak & PDF purchase order + Playwright E2E tests
4. **Critical Bug Fix — Semua Form Tidak Bisa Submit** (2026-04-27) — fix Button component + error visibility

---

## Sesi Terakhir: Bug Fix — Form Submit Tidak Berfungsi (2026-04-27)

### Root Cause

**Bug kritis di `erp-app/src/components/ui/Button.jsx`** — semua form di seluruh aplikasi tidak pernah bisa di-submit sejak AntD migration.

**Penyebab**: Ant Design `<Button>` menggunakan prop `type` untuk visual style (`"primary"`, `"default"`, dll) dan prop `htmlType` untuk HTML button type (`"submit"`, dll). Wrapper `Button` komponen meneruskan `type="submit"` dari caller sebagai visual style, bukan sebagai `htmlType`. Akibatnya, semua `<button>` di DOM tetap `type="button"` (default), sehingga form `onSubmit` tidak pernah dipanggil saat tombol diklik.

**Gejala yang dilaporkan**: Tombol "Tambah" diklik berkali-kali — modal tidak menutup, tidak ada network request ke Supabase, tidak ada toast, tidak ada error message.

### File yang Diubah

| File | Perubahan |
|------|-----------|
| `erp-app/src/components/ui/Button.jsx` | **Fix utama**: destructure `type`, map ke `htmlType` jika submit/reset/button |
| `erp-app/src/hooks/useMasterData.js` | Jangan clear `data` saat refetch gagal — data lama tetap tampil |
| `erp-app/src/pages/master/UnitsPage.jsx` | Tampilkan `error` state + tombol "Coba Lagi" |
| `erp-app/src/pages/master/ProductsPage.jsx` | Tampilkan `error` state + tombol "Coba Lagi" |
| `erp-app/src/pages/master/CustomersPage.jsx` | Tampilkan `error` state + tombol "Coba Lagi" |
| `erp-app/src/pages/master/SuppliersPage.jsx` | Tampilkan `error` state + tombol "Coba Lagi" |
| `erp-app/src/pages/master/COAPage.jsx` | Tampilkan `error` state + tombol "Coba Lagi" |
| `erp-app/src/contexts/AuthContext.jsx` | Tambah try/catch di `fetchProfile()` + console.error |
| `erp-app/src/lib/supabase.js` | Tambah `console.error` jika env vars tidak ditemukan |
| `erp-app/src/components/layout/RoleGuard.jsx` | Ganti silent redirect ke "/" dengan halaman "Akses Ditolak" informatif |

### Detail Fix Button.jsx

```jsx
// Sebelum (BROKEN) — type="submit" jadi visual style, bukan HTML type
<AntdButton
  type={variantToType[variant] || 'default'}  // → "primary"
  {...props}  // → type="submit" override visual, tapi bukan htmlType
>

// Sesudah (FIXED)
export default function Button({ variant, type, ...props }) {
  const htmlType = ['submit', 'reset', 'button'].includes(type) ? type : undefined
  return (
    <AntdButton
      type={variantToType[variant] || 'default'}  // visual style
      htmlType={htmlType}  // ← HTML button type yang benar
      {...props}
    >
```

### Deployment

✅ **DONE**: Branch `claude/stoic-cannon-d02b87` merged ke `main` dan deployed ke `erp-app-bay.vercel.app`.

### Manual Test Steps

1. Buka `erp-app-bay.vercel.app/master/units`
2. Klik "+ Tambah Satuan" → isi nama → klik "Tambah"
3. ✅ Modal menutup, toast hijau muncul, data baru tampil di list
4. Klik ikon Edit → ubah nama → klik "Simpan"
5. ✅ Data terupdate di list
6. Coba halaman lain: Customer, Supplier, Produk, COA — semua form harus berfungsi

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
| URL | https://erp-app-bay.vercel.app |
| Cara deploy | `vercel --prod` dari dalam `C:\Project\ERP-ACC\erp-app\` |

```bash
# Deploy ke erp-app-bay
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
- **AntdButton `type` vs `htmlType`**: Wrapper `Button` di `src/components/ui/Button.jsx` sekarang sudah handle ini dengan benar. Jangan pernah pass `type="submit"` langsung ke `<AntdButton>` — selalu gunakan wrapper `<Button type="submit">` atau `<AntdButton htmlType="submit">`.
- **Role default baru pengguna**: Trigger Supabase membuat profil dengan `role = 'viewer'`. Untuk memberikan akses write/admin, ubah manual di Supabase dashboard: `UPDATE profiles SET role = 'admin' WHERE id = '...'`.

---

## Next Steps (Opsional)


**Opsional**:
- Print untuk Purchase Invoice
- Print untuk Goods Receipt
- Print preview in-app sebelum dialog print
- Fitur ERP berikutnya sesuai kebutuhan bisnis

---

**Documented**: 2026-04-27  
**Status**: ✅ Production Live — https://erp-app-bay.vercel.app
