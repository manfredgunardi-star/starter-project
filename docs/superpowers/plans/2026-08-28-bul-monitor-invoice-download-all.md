# bul-monitor: Download Semua Invoice (Excel) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Download Semua Invoice" button to `InvoiceManagement.jsx` that exports every invoice
already loaded in the "Sudah Terinvoice" tab into one real `.xlsx` workbook with two sheets (a
per-invoice summary and a flat per-Surat-Jalan detail table).

**Architecture:** A new pure utility function `buildInvoiceWorkbookData(invoiceList, suratJalanList)`
in `src/utils/invoiceWorkbook.js` transforms already-in-memory data into two plain-object arrays
(`rekap`, `detail`), reusing `hitungTotalInvoice`/`resolveSJInvoice` from `invoiceTotals.js` for all
money figures. `InvoiceManagement.jsx` gets a new button + click handler that lazy-loads the `xlsx`
package (`await import('xlsx')`), calls the utility, and writes the workbook via
`XLSX.writeFile`. No new Firestore reads, no new props, no schema change.

**Tech Stack:** React (existing component), `xlsx` (SheetJS, already a dependency and already used in
bul-monitor by `downloadSJRecapToExcel` in `src/utils/formatters.js:55-127` — this feature is its
second call site, not its first), Vitest (existing test runner, `environment: 'node'`, no
component-testing library installed — this app tests utilities, not components, so this plan follows
that convention).

## Global Constraints

- Money figures (Sub Total / Potongan Uang Jalan / Total Akhir) MUST come from `hitungTotalInvoice()`
  in `src/utils/invoiceTotals.js` — never recomputed independently.
- Per-SJ Harga Satuan MUST use the `hargaPerGroup` resolution pattern from
  `src/integrationService.js:415-423` (`hargaMap[material|rute]`) for multi-group invoices — NOT the
  flat `invoice.hargaSatuan` that the existing per-invoice CSV export incorrectly uses for that case.
- `xlsx` MUST be imported dynamically (`await import('xlsx')`) inside the click handler, not as a
  static top-level import — keeps it out of the main bundle for users who never click the button.
  This mirrors the existing precedent in `downloadSJRecapToExcel`
  (`src/utils/formatters.js:55-127`), which already lazy-loads `xlsx` the same way for its own
  "Download Excel" button.
- No new Firestore queries, no new component props, no role/permission gate beyond what already
  exists on this component.
- No changes to the existing per-invoice "Export Excel" (CSV) button or its `exportInvoiceToExcel`
  function.
- Filename format: `Invoice_Semua_<YYYY-MM-DD>.xlsx`.
- Full spec: [docs/superpowers/specs/2026-08-28-bul-monitor-invoice-download-all-design.md](../specs/2026-08-28-bul-monitor-invoice-download-all-design.md)

---

### Task 1: `buildInvoiceWorkbookData` utility

**Files:**
- Create: `src/utils/invoiceWorkbook.js`
- Test: `src/utils/invoiceWorkbook.test.js`

**Interfaces:**
- Consumes: `hitungTotalInvoice(invoice, suratJalanList)` and `resolveSJInvoice(invoice, suratJalanList)`
  from `src/utils/invoiceTotals.js` (existing, signatures unchanged).
- Produces: `buildInvoiceWorkbookData(invoiceList = [], suratJalanList = [])` →
  `{ rekap: Array<object>, detail: Array<object> }`, both arrays of plain objects keyed by the exact
  column-header strings (ready to pass straight into `XLSX.utils.json_to_sheet`). Consumed by Task 2.

- [ ] **Step 1: Write the failing tests**

Create `src/utils/invoiceWorkbook.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { buildInvoiceWorkbookData } from './invoiceWorkbook.js';

const sjA = {
  id: 'sj-a', nomorSJ: '330002', tanggalSJ: '2026-08-01', nomorPolisi: 'B 1234 CD',
  namaSupir: 'Budi', rute: 'Jakarta-Bandung', material: 'Pasir', qtyBongkar: 10,
  satuan: 'M3', uangJalan: 500000,
};
const sjB = {
  id: 'sj-b', nomorSJ: '330015', tanggalSJ: '2026-08-02', nomorPolisi: 'B 5678 EF',
  namaSupir: 'Andi', rute: 'Jakarta-Bogor', material: 'Batu', qtyBongkar: 5,
  satuan: 'M3', uangJalan: 300000,
};

const invoiceFlat = {
  id: 'INV-1', noInvoice: 'INV/2026/001', tglInvoice: '2026-08-05',
  totalNilai: 2000000, hargaSatuan: 100000, hargaPerGroup: null,
  suratJalanIds: ['sj-a', 'sj-b'], suratJalanList: [sjA, sjB],
  integrationStatus: null, createdBy: 'admin1', createdAt: '2026-08-05T10:00:00.000Z',
};

const invoiceGroup = {
  id: 'INV-2', noInvoice: 'INV/2026/002', tglInvoice: '2026-08-06',
  totalNilai: 1500000, hargaSatuan: null,
  hargaPerGroup: [
    { material: 'Pasir', rute: 'Jakarta-Bandung', hargaSatuan: 90000 },
    { material: 'Batu', rute: 'Jakarta-Bogor', hargaSatuan: 70000 },
  ],
  suratJalanIds: ['sj-a', 'sj-b'], suratJalanList: [sjA, sjB],
  integrationStatus: 'menunggu_review', createdBy: 'admin2', createdAt: '2026-08-06T10:00:00.000Z',
};

describe('buildInvoiceWorkbookData', () => {
  it('mengembalikan rekap dan detail kosong untuk invoiceList kosong', () => {
    expect(buildInvoiceWorkbookData([], [])).toEqual({ rekap: [], detail: [] });
  });

  it('aman dipanggil tanpa argumen', () => {
    expect(buildInvoiceWorkbookData()).toEqual({ rekap: [], detail: [] });
  });

  it('menghasilkan satu baris rekap per invoice dengan total dari hitungTotalInvoice', () => {
    const { rekap } = buildInvoiceWorkbookData([invoiceFlat], [sjA, sjB]);
    expect(rekap).toEqual([{
      'No Invoice': 'INV/2026/001',
      'Tanggal Invoice': '2026-08-05',
      'Jumlah SJ': 2,
      'Sub Total': 2000000,
      'Potongan Uang Jalan': 800000,
      'Total Akhir': 1200000,
      'Status Integrasi': 'Belum Dikirim',
      'Dibuat Oleh': 'admin1',
      'Tanggal Dibuat': '2026-08-05T10:00:00.000Z',
    }]);
  });

  it('memetakan integrationStatus ke label yang benar', () => {
    const { rekap } = buildInvoiceWorkbookData([invoiceGroup], [sjA, sjB]);
    expect(rekap[0]['Status Integrasi']).toBe('Menunggu Review Akuntan');

    const terkunci = { ...invoiceFlat, integrationStatus: 'terkunci' };
    expect(buildInvoiceWorkbookData([terkunci], [sjA, sjB]).rekap[0]['Status Integrasi'])
      .toBe('Sudah Masuk Accounting');
  });

  it('menghasilkan satu baris detail per SJ dengan harga flat', () => {
    const { detail } = buildInvoiceWorkbookData([invoiceFlat], [sjA, sjB]);
    expect(detail).toHaveLength(2);
    expect(detail[0]).toEqual({
      'No Invoice': 'INV/2026/001',
      'No SJ': '330002',
      'Tgl SJ': '2026-08-01',
      'No Polisi': 'B 1234 CD',
      'Nama Supir': 'Budi',
      'Rute': 'Jakarta-Bandung',
      'Material': 'Pasir',
      'Qty Bongkar': 10,
      'Satuan': 'M3',
      'Harga Satuan': 100000,
      'Nilai': 1000000,
      'Uang Jalan': 500000,
      'Sumber Data': 'live',
    });
  });

  it('menyelesaikan harga per-grup lewat material+rute, bukan invoice.hargaSatuan mentah', () => {
    const { detail } = buildInvoiceWorkbookData([invoiceGroup], [sjA, sjB]);
    const barisPasir = detail.find(d => d.Material === 'Pasir');
    const barisBatu = detail.find(d => d.Material === 'Batu');
    expect(barisPasir['Harga Satuan']).toBe(90000);
    expect(barisPasir['Nilai']).toBe(900000);
    expect(barisBatu['Harga Satuan']).toBe(70000);
    expect(barisBatu['Nilai']).toBe(350000);
  });

  it('menandai Sumber Data snapshot saat SJ tidak ada di live', () => {
    const { detail } = buildInvoiceWorkbookData([invoiceFlat], [sjA]);
    const barisB = detail.find(d => d['No SJ'] === '330015');
    expect(barisB['Sumber Data']).toBe('snapshot');
  });

  it('melewati SJ yang hilang di live maupun snapshot tanpa membuat baris', () => {
    const invoiceHilang = { ...invoiceFlat, suratJalanIds: ['sj-a', 'sj-hantu'], suratJalanList: [sjA] };
    const { detail } = buildInvoiceWorkbookData([invoiceHilang], [sjA]);
    expect(detail).toHaveLength(1);
    expect(detail[0]['No SJ']).toBe('330002');
  });

  it('menggabungkan detail dari banyak invoice jadi satu array', () => {
    const { detail } = buildInvoiceWorkbookData([invoiceFlat, invoiceGroup], [sjA, sjB]);
    expect(detail).toHaveLength(4);
    expect(detail.filter(d => d['No Invoice'] === 'INV/2026/001')).toHaveLength(2);
    expect(detail.filter(d => d['No Invoice'] === 'INV/2026/002')).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/utils/invoiceWorkbook.test.js`
Expected: FAIL — `Cannot find module './invoiceWorkbook.js'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/utils/invoiceWorkbook.js`:

```javascript
import { hitungTotalInvoice, resolveSJInvoice } from './invoiceTotals.js';

/**
 * Label status integrasi untuk sheet Rekap Invoice. Sama dengan label yang
 * dipakai di badge InvoiceManagement.jsx, di luar 'menunggu_review'/'terkunci'
 * dianggap belum pernah dikirim.
 */
function labelStatusIntegrasi(status) {
  if (status === 'menunggu_review') return 'Menunggu Review Akuntan';
  if (status === 'terkunci') return 'Sudah Masuk Accounting';
  return 'Belum Dikirim';
}

/**
 * Resolusi harga per-SJ. Untuk invoice multi-grup (hargaPerGroup), harga
 * dicari lewat material+rute — pola yang sama dengan integrationService.js
 * (kirim ke accounting), BUKAN invoice.hargaSatuan mentah yang bernilai null
 * untuk invoice jenis ini.
 */
function resolveHargaSatuan(invoice, sj) {
  const useGroup = invoice?.hargaPerGroup && invoice.hargaPerGroup.length > 0;
  if (!useGroup) {
    return Number(invoice?.hargaSatuan) || 0;
  }
  const hargaMap = {};
  invoice.hargaPerGroup.forEach((g) => { hargaMap[`${g.material}|${g.rute}`] = g.hargaSatuan; });
  return Number(hargaMap[`${sj.material}|${sj.rute}`]) || 0;
}

/**
 * Bangun data mentah untuk workbook "Download Semua Invoice": satu baris
 * rekap per invoice, dan satu baris detail per Surat Jalan digabung dari
 * semua invoice. Fungsi murni — tidak menyentuh DOM atau library xlsx,
 * supaya bisa ditest tanpa browser.
 *
 * @param {object[]} [invoiceList]
 * @param {object[]} [suratJalanList]
 * @returns {{ rekap: object[], detail: object[] }}
 */
export function buildInvoiceWorkbookData(invoiceList = [], suratJalanList = []) {
  const rekap = invoiceList.map((invoice) => {
    const t = hitungTotalInvoice(invoice, suratJalanList);
    return {
      'No Invoice': invoice.noInvoice || '',
      'Tanggal Invoice': invoice.tglInvoice || '',
      'Jumlah SJ': (invoice.suratJalanIds || []).length,
      'Sub Total': t.subTotal,
      'Potongan Uang Jalan': t.potonganUJ,
      'Total Akhir': t.totalAkhir,
      'Status Integrasi': labelStatusIntegrasi(invoice.integrationStatus),
      'Dibuat Oleh': invoice.createdBy || '',
      'Tanggal Dibuat': invoice.createdAt || '',
    };
  });

  const detail = [];
  invoiceList.forEach((invoice) => {
    const { list } = resolveSJInvoice(invoice, suratJalanList);
    list.forEach(({ sj, sumber }) => {
      const harga = resolveHargaSatuan(invoice, sj);
      detail.push({
        'No Invoice': invoice.noInvoice || '',
        'No SJ': sj.nomorSJ || '',
        'Tgl SJ': sj.tanggalSJ || '',
        'No Polisi': sj.nomorPolisi || '',
        'Nama Supir': sj.namaSupir || '',
        'Rute': sj.rute || '',
        'Material': sj.material || '',
        'Qty Bongkar': Number(sj.qtyBongkar) || 0,
        'Satuan': sj.satuan || '',
        'Harga Satuan': harga,
        'Nilai': (Number(sj.qtyBongkar) || 0) * harga,
        'Uang Jalan': Number(sj.uangJalan) || 0,
        'Sumber Data': sumber,
      });
    });
  });

  return { rekap, detail };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/utils/invoiceWorkbook.test.js`
Expected: PASS — all 9 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/utils/invoiceWorkbook.js src/utils/invoiceWorkbook.test.js
git commit -m "feat(bul-monitor): add buildInvoiceWorkbookData utility for invoice export"
```

---

### Task 2: Wire "Download Semua Invoice" button into `InvoiceManagement.jsx`

**Files:**
- Modify: `src/components/InvoiceManagement.jsx:1-6` (imports), `:369-382` (search row in the
  "terinvoice" branch — add button here)

**Interfaces:**
- Consumes: `buildInvoiceWorkbookData(invoiceList, suratJalanList)` from Task 1
  (`src/utils/invoiceWorkbook.js`), returns `{ rekap, detail }`.
- Consumes: `import('xlsx')` dynamic import — package already in `package.json` dependencies.
- Produces: nothing consumed by later tasks (this is the last task).

- [ ] **Step 1: Add the import**

In `src/components/InvoiceManagement.jsx`, change line 3-6 from:

```javascript
import { hitungTotalInvoice, resolveSJInvoice } from '../utils/invoiceTotals.js';
import SearchInput from './SearchInput.jsx';
import { useSearchFilter } from '../hooks/useSearchFilter.js';
import { filterInvoicesBySearch } from '../utils/invoiceSearch.js';
```

to:

```javascript
import { hitungTotalInvoice, resolveSJInvoice } from '../utils/invoiceTotals.js';
import { buildInvoiceWorkbookData } from '../utils/invoiceWorkbook.js';
import SearchInput from './SearchInput.jsx';
import { useSearchFilter } from '../hooks/useSearchFilter.js';
import { filterInvoicesBySearch } from '../utils/invoiceSearch.js';
```

- [ ] **Step 2: Add the download-all handler**

In `src/components/InvoiceManagement.jsx`, right after the existing `exportInvoiceToExcel` function
(it ends at line 182 with the closing `};` before the `return (` on line 184), add:

```javascript

  // Download Semua Invoice: satu workbook .xlsx, 2 sheet (Rekap + Detail SJ),
  // dari data yang sudah ada di memory — tidak ada query Firestore baru.
  const handleDownloadSemuaInvoice = async () => {
    try {
      const XLSX = await import('xlsx');
      const { rekap, detail } = buildInvoiceWorkbookData(invoiceList, suratJalanList);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rekap), 'Rekap Invoice');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detail), 'Detail SJ');
      const tanggal = new Date().toISOString().split('T')[0];
      XLSX.writeFile(wb, `Invoice_Semua_${tanggal}.xlsx`);
    } catch (err) {
      console.error('Gagal membuat file Download Semua Invoice:', err);
      alert('Gagal memuat modul export, coba lagi.');
    }
  };
```

- [ ] **Step 3: Add the button next to the invoice search box**

In `src/components/InvoiceManagement.jsx`, the "terinvoice" branch currently has (around line 369-382):

```javascript
          {invoiceList.length > 0 && (
            <div className="mb-4">
              <SearchInput
                value={search}
                onChange={handleSearchChange}
                placeholder="Cari nomor invoice atau nomor SJ di dalamnya..."
              />
              {search && (
                <p className="mt-2 text-sm text-gray-600">
                  {searchedInvoices.length} dari {invoiceList.length} invoice cocok
                </p>
              )}
            </div>
          )}
```

Replace it with:

```javascript
          {invoiceList.length > 0 && (
            <div className="mb-4 flex flex-col sm:flex-row sm:items-start gap-3">
              <div className="flex-1">
                <SearchInput
                  value={search}
                  onChange={handleSearchChange}
                  placeholder="Cari nomor invoice atau nomor SJ di dalamnya..."
                />
                {search && (
                  <p className="mt-2 text-sm text-gray-600">
                    {searchedInvoices.length} dari {invoiceList.length} invoice cocok
                  </p>
                )}
              </div>
              <button
                onClick={handleDownloadSemuaInvoice}
                className="bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition shrink-0"
              >
                <FileText className="w-4 h-4" />
                <span>Download Semua Invoice</span>
              </button>
            </div>
          )}
```

- [ ] **Step 4: Run the build**

Run: `npm run build`
Expected: build succeeds with no errors. Check the output for a separate lazy chunk containing `xlsx`
(confirms the dynamic import is being code-split rather than inlined into the main bundle).

- [ ] **Step 5: Manual browser verification**

This app has no component-testing library installed (`vitest.config.js` uses `environment: 'node'`,
no `.test.jsx` files exist anywhere in the codebase) — this matches the project's existing testing
convention of unit-testing utilities and manually verifying UI wiring. Verify manually:

1. Start the dev server (`npm run dev`), open the app, log in, go to the Invoice tab.
2. Switch to "Sudah Terinvoice". Confirm the new "Download Semua Invoice" button appears next to the
   search box (only when there is at least one invoice).
3. Click it. Confirm a file named `Invoice_Semua_<today's date>.xlsx` downloads.
4. Open the file. Confirm it has exactly two sheets: "Rekap Invoice" and "Detail SJ".
5. Pick any one invoice visible on screen. Confirm its "Total Akhir" in the "Rekap Invoice" sheet
   matches the "Total Akhir" shown on its card in the UI exactly.
6. If any invoice on screen uses per-material/rute pricing (shows multiple "Harga Jual per Satuan"
   lines on its card), confirm the corresponding rows in "Detail SJ" show non-zero "Harga Satuan" and
   "Nilai" values matching those group prices (not 0 — this is the bug the old CSV export has for
   this case, which this new sheet must not repeat).
7. Type something in the invoice search box. Confirm the button is unaffected by the search (still
   exports everything — cakupan data is intentionally not filtered by search per the spec).

- [ ] **Step 6: Commit**

```bash
git add src/components/InvoiceManagement.jsx
git commit -m "feat(bul-monitor): add Download Semua Invoice button (Excel export)"
```

---

## Post-Implementation

After both tasks are committed, run the project's standard validation from the app root:

```bash
npm run build
npm test
```

Both must pass before this branch is considered done. Per root `CLAUDE.md`, this is a feature that
does not touch financial *logic* (no formula changes — it only reads existing computed totals), does
not touch Firestore schema/rules, and stays within `apps/bul-monitor` — no additional user approval
gate applies beyond the design review already completed in the spec.
