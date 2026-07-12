# Laporan & Export Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a unified report-export system to `bul-accounting` so all 6 financial reports can be exported, plus a "Download Semua Laporan" feature producing one multi-sheet Excel and one combined PDF.

**Architecture:** Every report is normalized into a single `ReportModel` shape; shared renderers turn a `ReportModel` into an Excel sheet or a PDF section. A data layer fetches journals once per period. Money-logic functions in `accounting.js` are reused unchanged (only an optional injected-`journals` param is added, locked by characterization tests first).

**Tech Stack:** React 18, Vite, `xlsx`, `jspdf` + `jspdf-autotable`, Vitest + jsdom (new).

**Working dir:** `C:/Project/apps/bul-accounting/.claude/worktrees/zealous-visvesvaraya-f8adea` — all paths below are relative to `apps/bul-accounting/`. Run all `npm` commands after `cd apps/bul-accounting`.

**Spec:** `docs/superpowers/specs/2026-06-30-laporan-export-suite-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `vitest.config.js` (new) | Vitest config (jsdom env) |
| `src/utils/accounting.js` (modify) | Add optional `journals` param to `getAccountBalances` + `generate*Data` (backward compatible) |
| `src/utils/__tests__/accounting.test.js` (new) | Characterization tests locking money-logic + injection equivalence |
| `src/utils/reportSanitize.js` (new) | `escapeCell()` — Excel/CSV formula-injection guard (security S1) |
| `src/utils/reportDataset.js` (new) | `loadReportDataset({startDate,endDate})` → fetch journals+trucks once |
| `src/utils/reportModel.js` (new) | 6 builders + `buildAllReports` → `ReportModel[]` |
| `src/utils/reportRenderers.js` (new) | Excel + PDF renderers, single + all |
| `src/utils/__tests__/reportModel.test.js` (new) | Builder mapping tests |
| `src/utils/__tests__/reportRenderers.test.js` (new) | Renderer smoke + sanitize tests |
| `src/components/ReportToolbar.jsx` (new) | Reusable per-report toolbar (period + generate + export) |
| `src/components/DownloadAllPanel.jsx` (new) | "Download Semua" panel with states |
| `src/pages/LaporanPage.jsx` (modify) | Wire toolbar into 6 tabs + panel into header |
| `src/utils/exportUtils.js` (modify) | Remove bespoke fns after migration |

---

## Task 1: Vitest setup + first money characterization test

**Files:**
- Modify: `package.json`
- Create: `vitest.config.js`
- Create: `src/utils/__tests__/accounting.test.js`

- [ ] **Step 1: Install dev dependencies**

Run:
```bash
cd apps/bul-accounting && npm i -D vitest@^4 jsdom@^25
```
Expected: packages added, no errors.

- [ ] **Step 2: Add test script to package.json**

In `package.json` `"scripts"`, add after `"preview"`:
```json
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 3: Create `vitest.config.js`**

```js
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
```

- [ ] **Step 4: Write the failing characterization test**

`src/utils/__tests__/accounting.test.js`:
```js
import { describe, it, expect, vi } from 'vitest'

// Mock firebase so accounting.js imports do not hit the network.
vi.mock('../../firebase', () => ({ db: {} }))
// Mock getJournals at the firestore layer by mocking the module's getDocs.
vi.mock('firebase/firestore', async () => {
  return {
    collection: vi.fn(), query: vi.fn(), where: vi.fn(), orderBy: vi.fn(),
    getDocs: vi.fn(async () => ({ docs: globalThis.__SEED__.map(j => ({ id: j.id, data: () => j })) })),
    addDoc: vi.fn(), updateDoc: vi.fn(), doc: vi.fn(), getDoc: vi.fn(),
    Timestamp: {}, writeBatch: vi.fn(), limit: vi.fn(), setDoc: vi.fn(),
  }
})

import { generateNeracaData } from '../accounting'

// Minimal balanced seed: cash 10,000 debit; modal 10,000 credit (account codes per COA).
globalThis.__SEED__ = [
  {
    id: 'j1', date: '2026-06-10', status: 'posted', truckId: '',
    lines: [
      { accountCode: '1111', debit: 10000, credit: 0 },
      { accountCode: '3100', debit: 0, credit: 10000 },
    ],
  },
]

describe('generateNeracaData (characterization)', () => {
  it('balances: total aset == total kewajiban + ekuitas', async () => {
    const d = await generateNeracaData('2026-06-30')
    expect(d.totalAset).toBe(10000)
    expect(d.totalAset).toBe(d.totalKewajiban + d.totalEkuitas)
  })
})
```

> NOTE for implementer: verify `'3100'` is a valid equity (`startsWith('3')`) detail account in `src/data/chartOfAccounts.js`. If not, pick any real `type:'detail'` code starting with `3` and update the seed. Same for `'1111'` (cash). Do not invent codes.

- [ ] **Step 5: Run test to verify it fails (or reveals real codes)**

Run: `cd apps/bul-accounting && npx vitest run src/utils/__tests__/accounting.test.js`
Expected: FAIL first if codes wrong (totalEkuitas mismatch) → fix seed codes from real COA → PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/bul-accounting/package.json apps/bul-accounting/vitest.config.js apps/bul-accounting/src/utils/__tests__/accounting.test.js
git commit -m "test(bul-accounting): add vitest + neraca balance characterization test"
```

---

## Task 2: Characterize Laba Rugi, Arus Kas & injection equivalence

**Files:**
- Modify: `src/utils/__tests__/accounting.test.js`

- [ ] **Step 1: Add Laba Rugi + Arus Kas characterization tests**

Append to `accounting.test.js`:
```js
import { generateLabaRugiData, generateArusKasData, getAccountBalances } from '../accounting'

globalThis.__SEED2__ = [
  // Pendapatan usaha 5,000 (kredit 4xxx) against cash debit
  { id: 'p1', date: '2026-06-05', status: 'posted', truckId: '',
    lines: [ { accountCode: '1111', debit: 5000, credit: 0 }, { accountCode: '4100', debit: 0, credit: 5000 } ] },
  // Beban operasional 2,000 (debit 6xxx) paid cash
  { id: 'b1', date: '2026-06-06', status: 'posted', truckId: '',
    lines: [ { accountCode: '6100', debit: 2000, credit: 0 }, { accountCode: '1111', debit: 0, credit: 2000 } ] },
]

describe('generateLabaRugiData (characterization)', () => {
  it('computes laba bersih = pendapatan - beban', async () => {
    globalThis.__SEED__ = globalThis.__SEED2__
    const d = await generateLabaRugiData('2026-06-01', '2026-06-30')
    expect(d.totalPendapatanUsaha).toBe(5000)
    expect(d.totalBebanOperasional).toBe(2000)
    expect(d.labaBersih).toBe(3000)
  })
})

describe('generateArusKasData (characterization)', () => {
  it('saldoAwal + totalPerubahan == saldoAkhir', async () => {
    globalThis.__SEED__ = globalThis.__SEED2__
    const d = await generateArusKasData('2026-06-01', '2026-06-30')
    expect(d.saldoAwal + d.totalPerubahanKas).toBe(d.saldoAkhir)
  })
})
```
> Verify `'4100'` (pendapatan, `startsWith('4')`) and `'6100'` (beban operasional, `startsWith('6')`) are real detail codes; adjust from COA if needed.

- [ ] **Step 2: Run to verify pass**

Run: `cd apps/bul-accounting && npx vitest run src/utils/__tests__/accounting.test.js`
Expected: PASS (3 suites).

- [ ] **Step 3: Commit**

```bash
git add apps/bul-accounting/src/utils/__tests__/accounting.test.js
git commit -m "test(bul-accounting): characterize laba rugi + arus kas money logic"
```

---

## Task 3: Add optional injected-`journals` param to money functions

**Files:**
- Modify: `src/utils/accounting.js:99-161` (getJournals helper + getAccountBalances), `:164,200,240`
- Modify: `src/utils/__tests__/accounting.test.js`

- [ ] **Step 1: Write the equivalence test FIRST (failing)**

Append to `accounting.test.js`:
```js
import { filterJournalsByDate } from '../accounting'

describe('injected journals equivalence', () => {
  it('getAccountBalances(...,journals) equals fetched version', async () => {
    globalThis.__SEED__ = globalThis.__SEED2__
    const fetched = await getAccountBalances('2026-06-30')
    const all = globalThis.__SEED2__
    const injected = await getAccountBalances('2026-06-30', null, 'all', all)
    expect(injected).toEqual(fetched)
  })
})
```
Run: `npx vitest run src/utils/__tests__/accounting.test.js` → FAIL (`filterJournalsByDate` not exported / 4th param ignored).

- [ ] **Step 2: Add `filterJournalsByDate` helper + thread param through (formulas unchanged)**

In `src/utils/accounting.js`, add after `getJournals` (after line 123):
```js
// Pure date/type/truck/account filter mirroring getJournals' client-side logic.
// Used to derive per-report views from a single pre-fetched journal set.
export function filterJournalsByDate(journals, startDate, endDate) {
  let r = journals
  if (startDate) r = r.filter(j => j.date >= startDate)
  if (endDate) r = r.filter(j => j.date <= endDate)
  return r.slice().sort((a, b) => (a.date > b.date ? -1 : 1))
}
```

Change `getAccountBalances` signature + first lines (line 126-131):
```js
export async function getAccountBalances(endDate, startDate = null, truckId = 'all', journals = null) {
  const src = journals
    ? filterJournalsByDate(journals, startDate || '1900-01-01', endDate)
    : await getJournals({ startDate: startDate || '1900-01-01', endDate })
  // rename local var below from `journals` to `src` to avoid shadowing the param:
```
Then in the body replace `journals.forEach` with `src.forEach` (the loop at line 134). **Do not change any arithmetic.**

Thread the param through the generators (add `journals = null` as last arg, pass it down):
```js
export async function generateNeracaData(endDate, truckId = 'all', journals = null) {
  const balances = await getAccountBalances(endDate, null, truckId, journals)
  // ...rest unchanged
```
```js
export async function generateLabaRugiData(startDate, endDate, truckId = 'all', journals = null) {
  const balances = await getAccountBalances(endDate, startDate, truckId, journals)
  // ...rest unchanged
```
```js
export async function generateArusKasData(startDate, endDate, truckId = 'all', journals = null) {
  const src = journals ? filterJournalsByDate(journals, startDate, endDate) : await getJournals({ startDate, endDate })
  // replace the `journals.forEach` flow loop with `src.forEach`
  // ...the two getAccountBalances calls become:
  const beginBalances = await getAccountBalances(startExclusive, null, truckId, journals)
  const endBalances = await getAccountBalances(endDate, null, truckId, journals)
  // ...rest unchanged
```

- [ ] **Step 3: Run all accounting tests**

Run: `cd apps/bul-accounting && npx vitest run src/utils/__tests__/accounting.test.js`
Expected: PASS (all suites incl. equivalence). If any prior test changed value → STOP, you altered a formula; revert.

- [ ] **Step 4: Commit**

```bash
git add apps/bul-accounting/src/utils/accounting.js apps/bul-accounting/src/utils/__tests__/accounting.test.js
git commit -m "refactor(bul-accounting): allow injected journals in money functions (formulas unchanged)"
```

---

## Task 4: `escapeCell` — formula-injection guard (Security S1)

**Files:**
- Create: `src/utils/reportSanitize.js`
- Create: `src/utils/__tests__/reportRenderers.test.js`

- [ ] **Step 1: Write failing test**

`src/utils/__tests__/reportRenderers.test.js`:
```js
import { describe, it, expect } from 'vitest'
import { escapeCell } from '../reportSanitize'

describe('escapeCell', () => {
  it('prefixes dangerous leading chars with apostrophe', () => {
    expect(escapeCell('=1+1')).toBe("'=1+1")
    expect(escapeCell('+cmd')).toBe("'+cmd")
    expect(escapeCell('-2')).toBe("'-2")
    expect(escapeCell('@x')).toBe("'@x")
    expect(escapeCell('\tTAB')).toBe("'\tTAB")
  })
  it('leaves safe strings and numbers untouched', () => {
    expect(escapeCell('1111 - Kas')).toBe('1111 - Kas')
    expect(escapeCell(15000)).toBe(15000)
    expect(escapeCell(null)).toBe(null)
  })
})
```
Run: `npx vitest run src/utils/__tests__/reportRenderers.test.js` → FAIL (module missing).

- [ ] **Step 2: Implement `escapeCell`**

`src/utils/reportSanitize.js`:
```js
// CWE-1236: neutralize Excel/CSV formula injection. Only affects string cells
// whose first char can trigger formula evaluation. Numbers pass through.
const DANGEROUS = ['=', '+', '-', '@', '\t', '\r']

export function escapeCell(value) {
  if (typeof value !== 'string' || value.length === 0) return value
  return DANGEROUS.includes(value[0]) ? `'${value}` : value
}
```

- [ ] **Step 3: Run to verify pass**

Run: `npx vitest run src/utils/__tests__/reportRenderers.test.js`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/bul-accounting/src/utils/reportSanitize.js apps/bul-accounting/src/utils/__tests__/reportRenderers.test.js
git commit -m "feat(bul-accounting): add escapeCell formula-injection guard (CWE-1236)"
```

---

## Task 5: ReportModel builders — statement reports (Neraca, Laba Rugi, Arus Kas)

**Files:**
- Create: `src/utils/reportModel.js`
- Create: `src/utils/__tests__/reportModel.test.js`

ReportModel shape (documented at top of `reportModel.js`):
```
ReportModel { id, title, periodLabel, columns:[{key,label,align,isCurrency}], rows:[{type,cells}] }
row.type: 'heading' | 'detail' | 'subtotal' | 'total' | 'spacer'
```

- [ ] **Step 1: Write failing tests**

`src/utils/__tests__/reportModel.test.js`:
```js
import { describe, it, expect, vi } from 'vitest'
vi.mock('../../firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', async () => ({
  collection: vi.fn(), query: vi.fn(), where: vi.fn(), orderBy: vi.fn(),
  getDocs: vi.fn(async () => ({ docs: [] })), addDoc: vi.fn(), updateDoc: vi.fn(),
  doc: vi.fn(), getDoc: vi.fn(), Timestamp: {}, writeBatch: vi.fn(), limit: vi.fn(), setDoc: vi.fn(),
}))
import { buildNeraca, buildLabaRugi, buildArusKas } from '../reportModel'

const journals = [
  { id: 'j1', date: '2026-06-10', status: 'posted', truckId: '',
    lines: [ { accountCode: '1111', debit: 10000, credit: 0 }, { accountCode: '3100', debit: 0, credit: 10000 } ] },
]
const dataset = { journals, trucks: [], startDate: '2026-06-01', endDate: '2026-06-30' }

describe('statement builders', () => {
  it('buildNeraca returns a ReportModel with TOTAL ASET total row', async () => {
    const m = await buildNeraca(dataset)
    expect(m.id).toBe('neraca')
    expect(m.columns).toHaveLength(2)
    const totalRow = m.rows.find(r => r.type === 'total' && /TOTAL ASET/.test(r.cells.label))
    expect(totalRow.cells.amount).toBe(10000)
  })
  it('buildLabaRugi includes LABA BERSIH', async () => {
    const m = await buildLabaRugi(dataset)
    expect(m.rows.some(r => /LABA BERSIH/.test(r.cells.label))).toBe(true)
  })
  it('buildArusKas includes SALDO KAS AKHIR', async () => {
    const m = await buildArusKas(dataset)
    expect(m.rows.some(r => /SALDO KAS AKHIR/.test(r.cells.label))).toBe(true)
  })
})
```
Run → FAIL (module missing).

- [ ] **Step 2: Implement statement builders**

`src/utils/reportModel.js`:
```js
import {
  generateNeracaData, generateLabaRugiData, generateArusKasData,
  getAccountBalances, filterJournalsByDate, formatDate,
} from './accounting'
import { getAccountName, getDetailAccounts } from '../data/chartOfAccounts'

const STMT_COLUMNS = [
  { key: 'label', label: '', align: 'left', isCurrency: false },
  { key: 'amount', label: '', align: 'right', isCurrency: true },
]
const row = (type, label, amount) => ({ type, cells: { label, amount } })
const fmtRange = (s, e) => `Periode ${formatDate(s)} s/d ${formatDate(e)}`

export async function buildNeraca(ds) {
  const d = await generateNeracaData(ds.endDate, 'all', ds.journals)
  const rows = []
  rows.push(row('heading', 'ASET', ''))
  d.aset.filter(a => a.balance !== 0).forEach(a => rows.push(row('detail', `${a.code} - ${a.name}`, a.balance)))
  rows.push(row('total', 'TOTAL ASET', d.totalAset))
  rows.push(row('spacer', '', ''))
  rows.push(row('heading', 'KEWAJIBAN', ''))
  d.kewajiban.filter(a => a.balance !== 0).forEach(a => rows.push(row('detail', `${a.code} - ${a.name}`, a.balance)))
  rows.push(row('subtotal', 'Total Kewajiban', d.totalKewajiban))
  rows.push(row('heading', 'EKUITAS', ''))
  d.ekuitas.filter(a => a.balance !== 0).forEach(a => rows.push(row('detail', `${a.code} - ${a.name}`, a.balance)))
  rows.push(row('detail', 'Laba Tahun Berjalan', d.labaBerjalan))
  rows.push(row('subtotal', 'Total Ekuitas', d.totalEkuitas))
  rows.push(row('total', 'TOTAL KEWAJIBAN & EKUITAS', d.totalKewajiban + d.totalEkuitas))
  return { id: 'neraca', title: 'LAPORAN NERACA', periodLabel: `Per ${formatDate(ds.endDate)}`, columns: STMT_COLUMNS, rows }
}

export async function buildLabaRugi(ds) {
  const d = await generateLabaRugiData(ds.startDate, ds.endDate, 'all', ds.journals)
  const rows = []
  const section = (label, items, total, totalType = 'subtotal') => {
    rows.push(row('heading', label, ''))
    items.filter(a => a.balance !== 0).forEach(a => rows.push(row('detail', `${a.code} - ${a.name}`, a.balance)))
    rows.push(row(totalType, `Total ${label}`, total))
  }
  section('PENDAPATAN USAHA', d.pendapatanUsaha, d.totalPendapatanUsaha)
  section('BEBAN POKOK PENDAPATAN', d.hpp, d.totalHPP)
  rows.push(row('total', 'LABA KOTOR', d.labaKotor))
  section('BEBAN OPERASIONAL', d.bebanOperasional, d.totalBebanOperasional)
  rows.push(row('total', 'LABA OPERASIONAL', d.labaOperasional))
  section('PENDAPATAN LAIN-LAIN', d.pendapatanLain, d.totalPendapatanLain)
  section('BEBAN LAIN-LAIN', d.bebanLain, d.totalBebanLain)
  rows.push(row('total', 'LABA BERSIH', d.labaBersih))
  return { id: 'labarugi', title: 'LAPORAN LABA RUGI', periodLabel: fmtRange(ds.startDate, ds.endDate), columns: STMT_COLUMNS, rows }
}

export async function buildArusKas(ds) {
  const d = await generateArusKasData(ds.startDate, ds.endDate, 'all', ds.journals)
  const rows = [
    row('heading', 'Aktivitas Operasional', ''), row('subtotal', 'Total Aktivitas Operasional', d.operasional),
    row('heading', 'Aktivitas Investasi', ''), row('subtotal', 'Total Aktivitas Investasi', d.investasi),
    row('heading', 'Aktivitas Pendanaan', ''), row('subtotal', 'Total Aktivitas Pendanaan', d.pendanaan),
    row('total', 'KENAIKAN / PENURUNAN KAS BERSIH', d.totalPerubahanKas),
    row('detail', 'Saldo Kas Awal Periode', d.saldoAwal),
    row('total', 'SALDO KAS AKHIR PERIODE', d.saldoAkhir),
  ]
  return { id: 'aruskas', title: 'LAPORAN ARUS KAS', periodLabel: fmtRange(ds.startDate, ds.endDate), columns: STMT_COLUMNS, rows }
}
```

- [ ] **Step 3: Run to verify pass**

Run: `npx vitest run src/utils/__tests__/reportModel.test.js`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/bul-accounting/src/utils/reportModel.js apps/bul-accounting/src/utils/__tests__/reportModel.test.js
git commit -m "feat(bul-accounting): add ReportModel builders for statement reports"
```

---

## Task 6: ReportModel builders — table reports (Saldo Akun, Buku Besar, GL Armada) + buildAllReports

**Files:**
- Modify: `src/utils/reportModel.js`
- Modify: `src/utils/__tests__/reportModel.test.js`

- [ ] **Step 1: Write failing tests**

Append to `reportModel.test.js`:
```js
import { buildSaldoAkun, buildBukuBesar, buildGLArmada, buildAllReports } from '../reportModel'

describe('table builders', () => {
  it('buildSaldoAkun has 5 columns and one detail row per account', async () => {
    const m = await buildSaldoAkun(dataset)
    expect(m.columns.map(c => c.key)).toEqual(['kode', 'nama', 'debit', 'kredit', 'saldo'])
    expect(m.rows.filter(r => r.type === 'detail').length).toBeGreaterThan(0)
  })
  it('buildBukuBesar groups by account with heading rows', async () => {
    const m = await buildBukuBesar(dataset)
    expect(m.rows.some(r => r.type === 'heading')).toBe(true)
  })
  it('buildGLArmada returns a model', async () => {
    const m = await buildGLArmada(dataset)
    expect(m.id).toBe('gl_armada')
  })
  it('buildAllReports returns 6 models', async () => {
    const models = await buildAllReports(dataset)
    expect(models.map(m => m.id)).toEqual(['neraca','labarugi','aruskas','saldo','buku_besar','gl_armada'])
  })
})
```
Run → FAIL.

- [ ] **Step 2: Implement table builders + buildAllReports**

Append to `src/utils/reportModel.js`:
```js
const trow = (type, cells) => ({ type, cells })

export async function buildSaldoAkun(ds) {
  const balances = await getAccountBalances(ds.endDate, ds.startDate || null, 'all', ds.journals)
  const columns = [
    { key: 'kode', label: 'Kode', align: 'left' }, { key: 'nama', label: 'Nama Akun', align: 'left' },
    { key: 'debit', label: 'Debit', align: 'right', isCurrency: true },
    { key: 'kredit', label: 'Kredit', align: 'right', isCurrency: true },
    { key: 'saldo', label: 'Saldo', align: 'right', isCurrency: true },
  ]
  const rows = Object.entries(balances).sort(([a], [b]) => a.localeCompare(b)).map(([code, b]) =>
    trow('detail', { kode: code, nama: getAccountName(code) || '-', debit: b.debit, kredit: b.credit, saldo: Math.abs(b.net) }))
  return { id: 'saldo', title: 'NERACA SALDO', periodLabel: fmtRange(ds.startDate || ds.endDate, ds.endDate), columns, rows }
}

export async function buildBukuBesar(ds) {
  const js = filterJournalsByDate(ds.journals, ds.startDate, ds.endDate)
  const columns = [
    { key: 'tanggal', label: 'Tanggal', align: 'left' }, { key: 'keterangan', label: 'Keterangan', align: 'left' },
    { key: 'debit', label: 'Debit', align: 'right', isCurrency: true },
    { key: 'kredit', label: 'Kredit', align: 'right', isCurrency: true },
    { key: 'saldo', label: 'Saldo', align: 'right', isCurrency: true },
  ]
  // Group lines by account, chronological (filterJournalsByDate sorts desc → reverse for ledger)
  const chrono = js.slice().reverse()
  const byAccount = {}
  chrono.forEach(j => j.lines?.forEach(l => {
    (byAccount[l.accountCode] ||= []).push({ date: j.date, keterangan: l.keterangan || j.description || '', debit: l.debit || 0, credit: l.credit || 0 })
  }))
  const rows = []
  Object.keys(byAccount).sort().forEach(code => {
    rows.push(trow('heading', { tanggal: `${code} - ${getAccountName(code) || ''}` }))
    let bal = 0
    byAccount[code].forEach(e => {
      bal += e.debit - e.credit
      rows.push(trow('detail', { tanggal: formatDate(e.date), keterangan: e.keterangan, debit: e.debit, kredit: e.credit, saldo: Math.abs(bal) }))
    })
  })
  return { id: 'buku_besar', title: 'BUKU BESAR', periodLabel: fmtRange(ds.startDate, ds.endDate), columns, rows }
}

export async function buildGLArmada(ds) {
  const js = filterJournalsByDate(ds.journals, ds.startDate, ds.endDate)
  const columns = [
    { key: 'tanggal', label: 'Tanggal', align: 'left' }, { key: 'keterangan', label: 'Keterangan', align: 'left' },
    { key: 'akun', label: 'Akun', align: 'left' },
    { key: 'debit', label: 'Debit', align: 'right', isCurrency: true },
    { key: 'kredit', label: 'Kredit', align: 'right', isCurrency: true },
  ]
  const label = (id) => {
    if (!id) return 'Tanpa Armada'
    const t = ds.trucks.find(t => t.id === id)
    return t ? `${t.nopol} — ${t.model || ''}` : id
  }
  const byTruck = {}
  js.forEach(j => { (byTruck[j.truckId || '__none__'] ||= []).push(j) })
  const rows = []
  Object.keys(byTruck).sort().forEach(tid => {
    rows.push(trow('heading', { tanggal: label(tid === '__none__' ? '' : tid) }))
    byTruck[tid].forEach(j => j.lines?.forEach((l, i) => rows.push(trow('detail', {
      tanggal: i === 0 ? formatDate(j.date) : '', keterangan: l.keterangan || '',
      akun: getAccountName(l.accountCode) || l.accountCode, debit: l.debit || 0, kredit: l.credit || 0,
    }))))
  })
  return { id: 'gl_armada', title: 'GENERAL LEDGER PER ARMADA', periodLabel: fmtRange(ds.startDate, ds.endDate), columns, rows }
}

export async function buildAllReports(ds) {
  return Promise.all([
    buildNeraca(ds), buildLabaRugi(ds), buildArusKas(ds),
    buildSaldoAkun(ds), buildBukuBesar(ds), buildGLArmada(ds),
  ])
}
```

- [ ] **Step 3: Run to verify pass**

Run: `npx vitest run src/utils/__tests__/reportModel.test.js`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/bul-accounting/src/utils/reportModel.js apps/bul-accounting/src/utils/__tests__/reportModel.test.js
git commit -m "feat(bul-accounting): add ReportModel builders for table reports + buildAllReports"
```

---

## Task 7: Excel renderers (single sheet + multi-sheet)

**Files:**
- Create: `src/utils/reportRenderers.js`
- Modify: `src/utils/__tests__/reportRenderers.test.js`

- [ ] **Step 1: Write failing tests**

Append to `reportRenderers.test.js`:
```js
import { modelToAoa } from '../reportRenderers'

const model = {
  id: 'x', title: 'T', periodLabel: 'P',
  columns: [{ key: 'label', label: '', align: 'left' }, { key: 'amount', label: '', align: 'right', isCurrency: true }],
  rows: [
    { type: 'heading', cells: { label: '=DANGER', amount: '' } },
    { type: 'detail', cells: { label: 'Kas', amount: 100 } },
  ],
}

describe('modelToAoa', () => {
  it('produces title/period header rows then column + data rows, sanitized', () => {
    const aoa = modelToAoa(model)
    expect(aoa[0][0]).toBe('T')
    expect(aoa[1][0]).toBe('P')
    // dangerous heading cell escaped
    const flat = aoa.flat()
    expect(flat).toContain("'=DANGER")
    expect(flat).toContain(100)
  })
})
```
Run → FAIL.

- [ ] **Step 2: Implement Excel renderers (lazy-load xlsx)**

`src/utils/reportRenderers.js`:
```js
import { escapeCell } from './reportSanitize'

// Build a 2D array-of-arrays from a ReportModel (header + columns + rows), all string/number cells sanitized.
export function modelToAoa(model) {
  const aoa = []
  aoa.push([model.title])
  aoa.push([model.periodLabel])
  aoa.push([])
  // Column header row only for table reports (statement reports use blank column labels)
  const hasLabels = model.columns.some(c => c.label)
  if (hasLabels) aoa.push(model.columns.map(c => c.label))
  model.rows.forEach(r => {
    if (r.type === 'spacer') { aoa.push([]); return }
    aoa.push(model.columns.map(c => escapeCell(r.cells[c.key] ?? '')))
  })
  return aoa
}

async function buildSheet(XLSX, model) {
  const ws = XLSX.utils.aoa_to_sheet(modelToAoa(model))
  ws['!cols'] = model.columns.map((c, i) => ({ wch: i === 0 ? 40 : 18 }))
  return ws
}

const sheetName = (model) => model.title.replace(/[\\/?*[\]:]/g, '').slice(0, 31)

export async function exportReportToExcel(model) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, await buildSheet(XLSX, model), sheetName(model))
  XLSX.writeFile(wb, `${model.title.replace(/\s+/g, '_')}.xlsx`)
}

export async function exportAllToExcel(models, periodLabel = '') {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  for (const m of models) XLSX.utils.book_append_sheet(wb, await buildSheet(XLSX, m), sheetName(m))
  XLSX.writeFile(wb, `Laporan_Keuangan${periodLabel ? '_' + periodLabel : ''}.xlsx`)
}
```

- [ ] **Step 3: Run to verify pass**

Run: `npx vitest run src/utils/__tests__/reportRenderers.test.js`
Expected: PASS (escapeCell + modelToAoa suites).

- [ ] **Step 4: Commit**

```bash
git add apps/bul-accounting/src/utils/reportRenderers.js apps/bul-accounting/src/utils/__tests__/reportRenderers.test.js
git commit -m "feat(bul-accounting): add Excel renderers (single + multi-sheet) with sanitized cells"
```

---

## Task 8: PDF renderers (single + combined)

**Files:**
- Modify: `src/utils/reportRenderers.js`

- [ ] **Step 1: Add PDF helpers (no new test — exercised via smoke in Task 12 manual + build)**

Append to `src/utils/reportRenderers.js`:
```js
import { formatCurrency } from './accounting'

const ROW_STYLE = {
  heading: { fontStyle: 'bold', fillColor: [240, 240, 240] },
  subtotal: { fontStyle: 'bold' },
  total: { fontStyle: 'bold', fillColor: [235, 104, 32], textColor: 255 },
  detail: {},
}

function modelToPdfBody(model) {
  return model.rows.filter(r => r.type !== 'spacer').map(r =>
    model.columns.map(c => {
      const raw = r.cells[c.key]
      const txt = c.isCurrency && typeof raw === 'number' ? formatCurrency(raw) : String(raw ?? '')
      return { content: txt, styles: { halign: c.align, ...(ROW_STYLE[r.type] || {}) } }
    }))
}

async function newDoc() {
  const { default: jsPDF } = await import('jspdf')
  await import('jspdf-autotable')
  return new jsPDF('portrait', 'mm', 'a4')
}

function renderSection(doc, model, startY) {
  doc.setFontSize(12); doc.text(model.title, 105, startY, { align: 'center' })
  doc.setFontSize(9); doc.text(model.periodLabel, 105, startY + 5, { align: 'center' })
  doc.autoTable({ body: modelToPdfBody(model), startY: startY + 9, theme: 'plain', styles: { fontSize: 7, cellPadding: 1.5 } })
  return doc.lastAutoTable.finalY
}

export async function exportReportToPdf(model) {
  const doc = await newDoc()
  renderSection(doc, model, 15)
  doc.save(`${model.title.replace(/\s+/g, '_')}.pdf`)
}

export async function exportAllToPdf(models, periodLabel = '') {
  const doc = await newDoc()
  models.forEach((m, i) => {
    if (i > 0) doc.addPage()
    renderSection(doc, m, 15)
  })
  doc.save(`Laporan_Keuangan${periodLabel ? '_' + periodLabel : ''}.pdf`)
}
```

- [ ] **Step 2: Verify build compiles**

Run: `cd apps/bul-accounting && npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/bul-accounting/src/utils/reportRenderers.js
git commit -m "feat(bul-accounting): add PDF renderers (single + combined, page-break per report)"
```

---

## Task 9: Data layer `loadReportDataset`

**Files:**
- Create: `src/utils/reportDataset.js`

- [ ] **Step 1: Implement (fetch journals once + trucks)**

`src/utils/reportDataset.js`:
```js
import { getJournals, getTrucks } from './accounting'

// Fetch the widest journal set any report needs (all posted journals on/before endDate)
// plus trucks, ONCE. Builders derive per-report views from this without re-fetching.
export async function loadReportDataset({ startDate, endDate }) {
  const [journals, trucks] = await Promise.all([
    getJournals({ endDate }),
    getTrucks(),
  ])
  return { journals, trucks, startDate, endDate }
}
```
> Verify `getTrucks` is exported from `accounting.js` (it is imported by LaporanPage). If it lives elsewhere, import from the correct module.

- [ ] **Step 2: Verify build**

Run: `cd apps/bul-accounting && npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/bul-accounting/src/utils/reportDataset.js
git commit -m "feat(bul-accounting): add loadReportDataset (single-fetch data layer)"
```

---

## Task 10: `ReportToolbar` reusable component

**Files:**
- Create: `src/components/ReportToolbar.jsx`

- [ ] **Step 1: Implement (accessible, responsive, stateful)**

`src/components/ReportToolbar.jsx`:
```jsx
import React from 'react'
import { RefreshCw, FileSpreadsheet, FileDown } from 'lucide-react'

/**
 * Reusable report toolbar.
 * Props:
 *  periodMode: 'range' | 'asOf'
 *  startDate, endDate, onStartDate, onEndDate
 *  onGenerate, loading, canExport, onExportExcel, onExportPdf
 *  extraControls?: ReactNode  generateLabel?: string
 */
export default function ReportToolbar({
  periodMode = 'range', startDate, endDate, onStartDate, onEndDate,
  onGenerate, loading = false, canExport = false, onExportExcel, onExportPdf,
  extraControls = null, generateLabel = 'Generate',
}) {
  return (
    <div className="card flex flex-wrap items-center gap-3" role="region" aria-label="Kontrol laporan">
      {periodMode === 'range' && (
        <div className="flex items-center gap-2">
          <label htmlFor="rpt-start" className="label mb-0 text-xs">Mulai:</label>
          <input id="rpt-start" type="date" value={startDate} onChange={e => onStartDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 outline-none" />
        </div>
      )}
      <div className="flex items-center gap-2">
        <label htmlFor="rpt-end" className="label mb-0 text-xs">{periodMode === 'asOf' ? 'Per Tanggal:' : 'S/D:'}</label>
        <input id="rpt-end" type="date" value={endDate} onChange={e => onEndDate(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 outline-none" />
      </div>
      {extraControls}
      <button onClick={onGenerate} disabled={loading} aria-busy={loading}
        className="btn-primary flex items-center gap-2">
        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
        {generateLabel}
      </button>
      {canExport && (
        <>
          <button onClick={onExportExcel} aria-label="Unduh Excel" className="btn-secondary flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4" aria-hidden="true" /> Excel
          </button>
          <button onClick={onExportPdf} aria-label="Unduh PDF" className="btn-secondary flex items-center gap-2">
            <FileDown className="w-4 h-4" aria-hidden="true" /> PDF
          </button>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `cd apps/bul-accounting && npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/bul-accounting/src/components/ReportToolbar.jsx
git commit -m "feat(bul-accounting): add reusable accessible ReportToolbar"
```

---

## Task 11: `DownloadAllPanel` component

**Files:**
- Create: `src/components/DownloadAllPanel.jsx`

- [ ] **Step 1: Implement (idle/loading/error states, a11y live region)**

`src/components/DownloadAllPanel.jsx`:
```jsx
import React, { useState } from 'react'
import { Download, RefreshCw, AlertCircle } from 'lucide-react'
import { loadReportDataset } from '../utils/reportDataset'
import { buildAllReports } from '../utils/reportModel'
import { exportAllToExcel, exportAllToPdf } from '../utils/reportRenderers'

export default function DownloadAllPanel({ defaultStart, defaultEnd }) {
  const [startDate, setStartDate] = useState(defaultStart)
  const [endDate, setEndDate] = useState(defaultEnd)
  const [status, setStatus] = useState('idle') // idle | loading | error
  const [error, setError] = useState('')

  const run = async (format) => {
    if (endDate < startDate) { setStatus('error'); setError('Tanggal akhir sebelum tanggal mulai.'); return }
    setStatus('loading'); setError('')
    try {
      const ds = await loadReportDataset({ startDate, endDate })
      const models = await buildAllReports(ds)
      const label = `${startDate}_${endDate}`
      if (format === 'excel') await exportAllToExcel(models, label)
      else await exportAllToPdf(models, label)
      setStatus('idle')
    } catch (e) {
      setStatus('error'); setError(e?.message || 'Gagal membuat laporan.')
    }
  }

  const busy = status === 'loading'
  return (
    <div className="card flex flex-wrap items-center gap-3 bg-brand-50/40 border border-brand-100">
      <div className="flex items-center gap-2">
        <Download className="w-4 h-4 text-brand-600" aria-hidden="true" />
        <span className="text-sm font-semibold text-gray-700">Download Semua Laporan</span>
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor="all-start" className="label mb-0 text-xs">Mulai:</label>
        <input id="all-start" type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
          className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 outline-none" />
        <label htmlFor="all-end" className="label mb-0 text-xs">S/D:</label>
        <input id="all-end" type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
          className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 outline-none" />
      </div>
      <button onClick={() => run('excel')} disabled={busy} aria-busy={busy} className="btn-primary flex items-center gap-2">
        {busy ? <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" /> : null} Excel (6 sheet)
      </button>
      <button onClick={() => run('pdf')} disabled={busy} aria-busy={busy} className="btn-secondary flex items-center gap-2">
        PDF gabungan
      </button>
      <span className="sr-only" role="status" aria-live="polite">{busy ? 'Menyiapkan 6 laporan' : ''}</span>
      {status === 'error' && (
        <span className="flex items-center gap-1 text-sm text-red-600" role="alert">
          <AlertCircle className="w-4 h-4" aria-hidden="true" /> {error}
        </span>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `cd apps/bul-accounting && npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/bul-accounting/src/components/DownloadAllPanel.jsx
git commit -m "feat(bul-accounting): add DownloadAllPanel with loading/error states"
```

---

## Task 12: Integrate into `LaporanPage` (export on all 6 tabs + Download-All header)

**Files:**
- Modify: `src/pages/LaporanPage.jsx`

- [ ] **Step 1: Add Download-All panel to page header**

In `LaporanPage.jsx`, import at top:
```jsx
import DownloadAllPanel from '../components/DownloadAllPanel'
import { exportReportToExcel, exportReportToPdf } from '../utils/reportRenderers'
import { buildNeraca, buildLabaRugi, buildArusKas, buildSaldoAkun, buildBukuBesar, buildGLArmada } from '../utils/reportModel'
import { getTrucks } from '../utils/accounting'
```
In the `LaporanPage` return, after the `<p>` subtitle line, add:
```jsx
<DownloadAllPanel
  defaultStart={`${new Date().toISOString().slice(0,7)}-01`}
  defaultEnd={new Date().toISOString().slice(0,10)} />
```

- [ ] **Step 2: Add per-tab export wiring (Arus Kas, Saldo, Buku Besar, GL Armada)**

For each of the 4 tabs lacking export, after the existing data load builds `data`/`journals`, construct a dataset and model, and add export buttons. Example for `ArusKasTab` — after `const load = ...`, add:
```jsx
const exportModel = data
  ? buildArusKas({ journals: data.__journals || [], trucks: [], startDate, endDate })
  : null
```
> Simpler approach (recommended): give each tab an `onExportExcel`/`onExportPdf` that fetches its own dataset on demand:
```jsx
const handleExport = async (fmt) => {
  const ds = { journals: await getJournals({ endDate }), trucks: await getTrucks(), startDate, endDate }
  const model = await buildArusKas(ds)            // swap builder per tab
  fmt === 'excel' ? exportReportToExcel(model) : exportReportToPdf(model)
}
```
Add two buttons (Excel/PDF) in each tab's control `card`, shown only when `data`/`journals` present, calling `handleExport('excel'|'pdf')`. Use the same builder mapping per tab: Saldo→`buildSaldoAkun`, Buku Besar→`buildBukuBesar`, GL Armada→`buildGLArmada`.
> Import `getJournals` too. Reuse existing `startDate/endDate/selectedAccount` state already in each tab.

- [ ] **Step 3: Migrate Neraca & Laba Rugi tabs to model-based export (optional in this task, keep behavior)**

Leave existing `exportNeracaToExcel/PDF` calls working for now (removed in Task 13). No change required to keep them functioning.

- [ ] **Step 4: Verify build + run dev smoke**

Run: `cd apps/bul-accounting && npm run build`
Expected: succeeds. Then `npm run dev`, open Laporan, click Generate on each tab and Download-Semua → files download.

- [ ] **Step 5: Commit**

```bash
git add apps/bul-accounting/src/pages/LaporanPage.jsx
git commit -m "feat(bul-accounting): wire export into all report tabs + Download-All header"
```

---

## Task 13: Migrate Neraca/Laba Rugi to renderers + remove bespoke export fns

**Files:**
- Modify: `src/pages/LaporanPage.jsx`, `src/utils/exportUtils.js`

- [ ] **Step 1: Point Neraca & Laba Rugi tabs to model renderers**

In `NeracaTab`, replace the Excel/PDF onClick handlers:
```jsx
onClick={async () => exportReportToExcel(await buildNeraca({ journals: await getJournals({ endDate }), trucks: [], endDate, startDate: endDate }))}
onClick={async () => exportReportToPdf(await buildNeraca({ journals: await getJournals({ endDate }), trucks: [], endDate, startDate: endDate }))}
```
Do the equivalent for `LabaRugiTab` with `buildLabaRugi` and its `startDate,endDate`. Remove the old imports `exportNeracaToExcel, exportLabaRugiToExcel, exportNeracaToPDF, exportLabaRugiToPDF` from the import block.

- [ ] **Step 2: Delete bespoke functions from `exportUtils.js`**

Remove `exportNeracaToExcel`, `exportLabaRugiToExcel`, `exportNeracaToPDF`, `exportLabaRugiToPDF` from `src/utils/exportUtils.js`. Keep `exportToExcel`, `exportJournalsToExcel`, `exportToPDF` (used elsewhere — verify with grep before deleting).

Run: `cd apps/bul-accounting && grep -rn "exportNeracaToExcel\|exportLabaRugiToExcel\|exportNeracaToPDF\|exportLabaRugiToPDF" src/`
Expected: no matches after edits.

- [ ] **Step 3: Verify build + tests**

Run: `cd apps/bul-accounting && npm run build && npx vitest run`
Expected: build succeeds, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/bul-accounting/src/pages/LaporanPage.jsx apps/bul-accounting/src/utils/exportUtils.js
git commit -m "refactor(bul-accounting): migrate neraca/labarugi to ReportModel renderers, drop bespoke export fns"
```

---

## Task 14: Final validation

**Files:** none (validation only)

- [ ] **Step 1: Full test + build**

Run: `cd apps/bul-accounting && npx vitest run && npm run build`
Expected: all tests pass, build clean.

- [ ] **Step 2: Manual smoke (dev server)**

Run: `cd apps/bul-accounting && npm run dev`. Verify, per spec §10.4:
- Each of 6 tabs: Generate → Excel + PDF download; numbers on screen == file.
- Download-Semua: Excel has 6 sheets; PDF has 6 sections (page breaks).
- Empty period (future dates, no journals): files still download with "Tidak ada data"/zero totals, no crash.
- A journal whose `keterangan` starts with `=` exports as `'=...` (open the xlsx, confirm no formula).

- [ ] **Step 3: Final commit (if any cleanup)**

```bash
git add -A && git commit -m "chore(bul-accounting): final cleanup for laporan export suite"
```

---

## Self-Review (completed by author)

- **Spec coverage:** §2 ReportModel→T5/T6; §3 files→all tasks; §4 dataset/period→T9 + builders; §5 UI→T10/T11/T12; §6 testing→T1-T7; §7 reviewer notes→T3 guardrail steps; §8 optimizer (fetch-once T9, lazy-load T7/T8); §9 S1→T4, S2→manual verify (note below); §10 DevOps→deploy section in response. ✅
- **S2 gating:** verify `/laporan` route role-gating during T12 (read `App.jsx` router). Added as manual check; if route is open to `reader`, raise with user before release.
- **Placeholders:** none — all steps carry real code/commands.
- **Type consistency:** `ReportModel` keys (`id,title,periodLabel,columns,rows`), `row.type` enum, builder names (`buildNeraca…buildGLArmada`, `buildAllReports`), renderer names (`modelToAoa`, `exportReportToExcel/Pdf`, `exportAllToExcel/Pdf`), `escapeCell`, `loadReportDataset`, `filterJournalsByDate` consistent across tasks. ✅
