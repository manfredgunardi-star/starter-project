# PDF Export untuk Semua Laporan — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambahkan tombol "Export PDF" (dan "Export Excel") ke 7 halaman laporan yang belum memilikinya, menggunakan pattern yang sama dengan AssetDisposalsReportPage.jsx yang sudah berfungsi.

**Architecture:** Inline `exportPDF()` function per halaman — tidak ada shared utility agar konsisten dengan 4 halaman aset yang sudah ada. jsPDF + jspdf-autotable sudah terinstall. XLSX sudah terinstall. Tidak ada perubahan DB/RPC diperlukan.

**Tech Stack:** React 18, jsPDF ^2.x, jspdf-autotable ^3.x, xlsx, lucide-react (FileText + Download icons), Ant Design Button

---

## File Structure

| File | Action | Deskripsi |
|---|---|---|
| `src/pages/reports/BalanceSheetPage.jsx` | Modify | Tambah exportPDF + exportExcel + tombol |
| `src/pages/reports/IncomeStatementPage.jsx` | Modify | Tambah exportPDF + exportExcel + tombol |
| `src/pages/reports/CashFlowPage.jsx` | Modify | Tambah exportPDF + exportExcel + tombol |
| `src/pages/reports/ARAPAgingPage.jsx` | Modify | Tambah exportPDF AR + AP + tombol di kedua tab |
| `src/pages/reports/TrialBalancePage.jsx` | Modify | Tambah exportPDF + exportExcel + tombol |
| `src/pages/reports/SalesReportPage.jsx` | Modify | Tambah exportPDF + exportExcel + tombol |
| `src/pages/reports/PurchaseReportPage.jsx` | Modify | Tambah exportPDF + exportExcel + tombol |

**Tidak diubah** (sudah punya PDF export): AssetDisposalsReportPage.jsx, AssetsListReportPage.jsx, AssetsSummaryReportPage.jsx, DepreciationPeriodReportPage.jsx.

**Model assignment:** Semua task = **Codex** (pure UI modifications, no SQL needed)

---

## Referensi Pattern (dari AssetDisposalsReportPage.jsx)

```jsx
// Import di bagian atas
import { jsPDF } from 'jspdf'
import 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { Download, FileText } from 'lucide-react'

// Fungsi exportPDF() di dalam komponen
function exportPDF() {
  const doc = new jsPDF()
  doc.setFontSize(14)
  doc.text('Judul Laporan', 14, 15)
  doc.setFontSize(10)
  doc.text('subtitle / periode', 14, 22)

  const tableData = rows.map(r => [r.col1, r.col2, formatCurrency(r.amount)])
  doc.autoTable({
    head: [['Kolom1', 'Kolom2', 'Jumlah']],
    body: tableData,
    startY: 28,
    theme: 'grid',
    columnStyles: { 2: { halign: 'right' } },
  })
  doc.save(`nama-file-${tanggal}.pdf`)
}

// Tombol — hanya tampil ketika data sudah dimuat (rows.length > 0 atau data !== null)
{data && !loading && (
  <Space>
    <Button icon={<FileText size={14} />} onClick={exportPDF}>Export PDF</Button>
    <Button icon={<Download size={14} />} onClick={exportExcel}>Export Excel</Button>
  </Space>
)}
```

---

## Task 1: BalanceSheetPage.jsx — PDF Export

**File:** Modify `src/pages/reports/BalanceSheetPage.jsx`

**Data yang tersedia di state:**
- `data` — array of `{coa_id, code, name, type, balance}` (difilter via `byType()`)
- `endDate` — string "YYYY-MM-DD"
- `byType('asset')`, `byType('liability')`, `byType('equity')` — array subset

**PDF output:** 3 section vertikal (Aset, Kewajiban, Modal) lalu baris total di bawahnya

- [ ] **Step 1: Tambah imports**

Di baris paling atas setelah import yang ada, tambahkan:
```jsx
import { jsPDF } from 'jspdf'
import 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { Download, FileText } from 'lucide-react'
```

- [ ] **Step 2: Tambah fungsi exportPDF() dan exportExcel() di dalam komponen BalanceSheetPage**

Letakkan setelah deklarasi `handleLoad`:
```jsx
function exportPDF() {
  const doc = new jsPDF()
  doc.setFontSize(14)
  doc.text('Neraca (Balance Sheet)', 14, 15)
  doc.setFontSize(10)
  doc.text(`Per Tanggal: ${endDate}`, 14, 22)

  const aset = byType('asset')
  const kewajiban = byType('liability')
  const modal = byType('equity')

  const totalAset = aset.reduce((s, a) => s + Number(a.balance), 0)
  const totalKewajiban = kewajiban.reduce((s, a) => s + Number(a.balance), 0)
  const totalModal = modal.reduce((s, a) => s + Number(a.balance), 0)

  const rows = [
    ...aset.map(a => ['ASET', a.code, a.name, formatCurrency(a.balance)]),
    ['', '', 'TOTAL ASET', formatCurrency(totalAset)],
    ...kewajiban.map(a => ['KEWAJIBAN', a.code, a.name, formatCurrency(a.balance)]),
    ['', '', 'TOTAL KEWAJIBAN', formatCurrency(totalKewajiban)],
    ...modal.map(a => ['MODAL', a.code, a.name, formatCurrency(a.balance)]),
    ['', '', 'TOTAL MODAL', formatCurrency(totalModal)],
  ]

  doc.autoTable({
    head: [['Kelompok', 'Kode', 'Nama Akun', 'Saldo']],
    body: rows,
    startY: 28,
    theme: 'grid',
    columnStyles: { 3: { halign: 'right' } },
    didParseCell: (hookData) => {
      if (hookData.row.raw[2]?.startsWith('TOTAL')) {
        hookData.cell.styles.fontStyle = 'bold'
      }
    },
  })
  doc.save(`balance-sheet-${endDate}.pdf`)
}

function exportExcel() {
  const aset = byType('asset')
  const kewajiban = byType('liability')
  const modal = byType('equity')
  const allRows = [
    ...aset.map(a => ({ Kelompok: 'ASET', Kode: a.code, Nama: a.name, Saldo: Number(a.balance) })),
    ...kewajiban.map(a => ({ Kelompok: 'KEWAJIBAN', Kode: a.code, Nama: a.name, Saldo: Number(a.balance) })),
    ...modal.map(a => ({ Kelompok: 'MODAL', Kode: a.code, Nama: a.name, Saldo: Number(a.balance) })),
  ]
  const ws = XLSX.utils.json_to_sheet(allRows)
  ws['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 30 }, { wch: 15 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Neraca')
  XLSX.writeFile(wb, `balance-sheet-${endDate}.xlsx`)
}
```

- [ ] **Step 3: Tambah tombol Export di area data (setelah `{data && !loading && (...)}`)**

Di dalam blok `{data && !loading && (...)}`, tambahkan sebelum `<Row gutter={16}>`:
```jsx
<Space>
  <Button icon={<FileText size={14} />} onClick={exportPDF}>Export PDF</Button>
  <Button icon={<Download size={14} />} onClick={exportExcel}>Export Excel</Button>
</Space>
```

Pastikan `Button` yang diimport adalah dari `antd` (bukan custom Button). Cek import di atas — jika `Button` dari `antd` belum diimport, tambahkan ke destructure import antd.

- [ ] **Step 4: Build check**

```bash
cd C:\Project\apps\erp-acc\erp-app && npm run build
```
Expected: exit 0, no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/erp-acc/erp-app/src/pages/reports/BalanceSheetPage.jsx
git commit -m "feat(erp-acc): add PDF/Excel export to BalanceSheetPage"
```

---

## Task 2: IncomeStatementPage.jsx — PDF Export

**File:** Modify `src/pages/reports/IncomeStatementPage.jsx`

**Data yang tersedia di state:**
- `data` — array of `{coa_id, code, name, type, balance}`
- `startDate`, `endDate` — string "YYYY-MM-DD"
- `byType('revenue')`, `byType('expense')` — array subset
- `netIncome = totalRevenue - totalExpense` (computed dari data)

- [ ] **Step 1: Tambah imports**

```jsx
import { jsPDF } from 'jspdf'
import 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { Download, FileText } from 'lucide-react'
```

Juga pastikan `Space` dan `Button` dari `antd` sudah ada di destructure import antd.

- [ ] **Step 2: Tambah fungsi exportPDF() dan exportExcel()**

Letakkan setelah `handleLoad`:
```jsx
function exportPDF() {
  const doc = new jsPDF()
  doc.setFontSize(14)
  doc.text('Laporan Laba Rugi (Income Statement)', 14, 15)
  doc.setFontSize(10)
  doc.text(`${startDate} s/d ${endDate}`, 14, 22)

  const revenue = byType('revenue')
  const expense = byType('expense')
  const totalRevenue = revenue.reduce((s, a) => s + Number(a.balance), 0)
  const totalExpense = expense.reduce((s, a) => s + Number(a.balance), 0)
  const net = totalRevenue - totalExpense

  const rows = [
    ...revenue.map(a => ['PENDAPATAN', a.code, a.name, formatCurrency(a.balance)]),
    ['', '', 'Total Pendapatan', formatCurrency(totalRevenue)],
    ...expense.map(a => ['BEBAN', a.code, a.name, formatCurrency(a.balance)]),
    ['', '', 'Total Beban', formatCurrency(totalExpense)],
    ['', '', net >= 0 ? 'LABA BERSIH' : 'RUGI BERSIH', formatCurrency(Math.abs(net))],
  ]

  doc.autoTable({
    head: [['Kelompok', 'Kode', 'Nama Akun', 'Jumlah']],
    body: rows,
    startY: 28,
    theme: 'grid',
    columnStyles: { 3: { halign: 'right' } },
    didParseCell: (hookData) => {
      const label = hookData.row.raw[2]
      if (label?.startsWith('Total') || label === 'LABA BERSIH' || label === 'RUGI BERSIH') {
        hookData.cell.styles.fontStyle = 'bold'
      }
    },
  })
  doc.save(`income-statement-${startDate}-${endDate}.pdf`)
}

function exportExcel() {
  const revenue = byType('revenue')
  const expense = byType('expense')
  const allRows = [
    ...revenue.map(a => ({ Kelompok: 'PENDAPATAN', Kode: a.code, Nama: a.name, Jumlah: Number(a.balance) })),
    ...expense.map(a => ({ Kelompok: 'BEBAN', Kode: a.code, Nama: a.name, Jumlah: Number(a.balance) })),
  ]
  const ws = XLSX.utils.json_to_sheet(allRows)
  ws['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 30 }, { wch: 15 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'LabaRugi')
  XLSX.writeFile(wb, `income-statement-${startDate}-${endDate}.xlsx`)
}
```

- [ ] **Step 3: Tambah tombol Export**

Di dalam blok `{data && !loading && (...)}`, tambahkan sebelum `<Card>`:
```jsx
<Space>
  <Button icon={<FileText size={14} />} onClick={exportPDF}>Export PDF</Button>
  <Button icon={<Download size={14} />} onClick={exportExcel}>Export Excel</Button>
</Space>
```

- [ ] **Step 4: Build check**

```bash
cd C:\Project\apps\erp-acc\erp-app && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add apps/erp-acc/erp-app/src/pages/reports/IncomeStatementPage.jsx
git commit -m "feat(erp-acc): add PDF/Excel export to IncomeStatementPage"
```

---

## Task 3: CashFlowPage.jsx — PDF Export

**File:** Modify `src/pages/reports/CashFlowPage.jsx`

**Data yang tersedia:**
- `data` — array of payment objects
- `incoming` = `data.filter(p => p.type === 'incoming')` — setiap item: `{date, customer: {name}, account: {name}, invoice: {invoice_number}, amount}`
- `outgoing` = `data.filter(p => p.type === 'outgoing')` — setiap item: `{date, supplier: {name}, account: {name}, invoice: {invoice_number}, amount}`
- `startDate`, `endDate`, `totalIn`, `totalOut`, `netCash`

- [ ] **Step 1: Tambah imports**

```jsx
import { jsPDF } from 'jspdf'
import 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { Download, FileText } from 'lucide-react'
```

Pastikan `Space` dan `Button` dari `antd` diimport.

- [ ] **Step 2: Tambah fungsi exportPDF() dan exportExcel()**

```jsx
function exportPDF() {
  const doc = new jsPDF()
  doc.setFontSize(14)
  doc.text('Laporan Arus Kas (Cash Flow)', 14, 15)
  doc.setFontSize(10)
  doc.text(`${startDate} s/d ${endDate}`, 14, 22)

  doc.setFontSize(11)
  doc.text('Kas Masuk', 14, 32)
  const inRows = incoming.map(p => [
    p.date,
    p.customer?.name || '—',
    p.account?.name || '—',
    p.invoice?.invoice_number || '—',
    formatCurrency(p.amount),
  ])
  inRows.push(['', '', '', 'Total Masuk', formatCurrency(totalIn)])

  doc.autoTable({
    head: [['Tanggal', 'Customer', 'Akun', 'Ref Invoice', 'Jumlah']],
    body: inRows,
    startY: 36,
    theme: 'grid',
    columnStyles: { 4: { halign: 'right' } },
    didParseCell: (hookData) => {
      if (hookData.row.raw[3] === 'Total Masuk') hookData.cell.styles.fontStyle = 'bold'
    },
  })

  const afterInY = doc.lastAutoTable.finalY + 8
  doc.setFontSize(11)
  doc.text('Kas Keluar', 14, afterInY)
  const outRows = outgoing.map(p => [
    p.date,
    p.supplier?.name || '—',
    p.account?.name || '—',
    p.invoice?.invoice_number || '—',
    formatCurrency(p.amount),
  ])
  outRows.push(['', '', '', 'Total Keluar', formatCurrency(totalOut)])

  doc.autoTable({
    head: [['Tanggal', 'Supplier', 'Akun', 'Ref Invoice', 'Jumlah']],
    body: outRows,
    startY: afterInY + 4,
    theme: 'grid',
    columnStyles: { 4: { halign: 'right' } },
    didParseCell: (hookData) => {
      if (hookData.row.raw[3] === 'Total Keluar') hookData.cell.styles.fontStyle = 'bold'
    },
  })

  const afterOutY = doc.lastAutoTable.finalY + 8
  doc.setFontSize(12)
  doc.setFont(undefined, 'bold')
  doc.text(`Arus Kas Bersih: ${formatCurrency(netCash)}`, 14, afterOutY)

  doc.save(`cash-flow-${startDate}-${endDate}.pdf`)
}

function exportExcel() {
  const inRows = incoming.map(p => ({
    Tipe: 'Kas Masuk',
    Tanggal: p.date,
    Pihak: p.customer?.name || '—',
    Akun: p.account?.name || '—',
    'Ref Invoice': p.invoice?.invoice_number || '—',
    Jumlah: Number(p.amount),
  }))
  const outRows = outgoing.map(p => ({
    Tipe: 'Kas Keluar',
    Tanggal: p.date,
    Pihak: p.supplier?.name || '—',
    Akun: p.account?.name || '—',
    'Ref Invoice': p.invoice?.invoice_number || '—',
    Jumlah: Number(p.amount),
  }))
  const ws = XLSX.utils.json_to_sheet([...inRows, ...outRows])
  ws['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 25 }, { wch: 20 }, { wch: 18 }, { wch: 15 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'ArusKas')
  XLSX.writeFile(wb, `cash-flow-${startDate}-${endDate}.xlsx`)
}
```

- [ ] **Step 3: Tambah tombol Export**

Di dalam blok `{data && !loading && (...)}`, tambahkan sebelum `<Row gutter={16}>`:
```jsx
<Space>
  <Button icon={<FileText size={14} />} onClick={exportPDF}>Export PDF</Button>
  <Button icon={<Download size={14} />} onClick={exportExcel}>Export Excel</Button>
</Space>
```

- [ ] **Step 4: Build check**

```bash
cd C:\Project\apps\erp-acc\erp-app && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add apps/erp-acc/erp-app/src/pages/reports/CashFlowPage.jsx
git commit -m "feat(erp-acc): add PDF/Excel export to CashFlowPage"
```

---

## Task 4: ARAPAgingPage.jsx — PDF Export

**File:** Modify `src/pages/reports/ARAPAgingPage.jsx`

**Data yang tersedia:**
- `arData` — raw invoices dari `getARAgingData()`, setiap item: `{id, invoice_number, date, due_date, total, amount_paid, status, customer: {name}}`
- `apData` — raw invoices dari `getAPAgingData()`, setiap item: `{id, invoice_number, date, due_date, total, amount_paid, status, supplier: {name}}`
- `arRows`, `apRows` — output dari `buildRows()`, campuran group headers dan detail rows
- `asOfDate` — string "YYYY-MM-DD"

**Catatan:** Karena struktur `arRows`/`apRows` mengandung `isGroupHeader: true`, untuk PDF kita akan menggunakan `arData` dan `apData` langsung (lebih simpel untuk di-flatten).

- [ ] **Step 1: Tambah imports**

```jsx
import { jsPDF } from 'jspdf'
import 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { Download, FileText } from 'lucide-react'
```

- [ ] **Step 2: Tambah fungsi exportPDF() dan exportExcel() di dalam komponen**

Letakkan setelah `handleLoad`:
```jsx
function exportPDF() {
  const doc = new jsPDF()
  doc.setFontSize(14)
  doc.text('Laporan AR/AP Aging', 14, 15)
  doc.setFontSize(10)
  doc.text(`Per Tanggal: ${asOfDate}`, 14, 22)

  // AR Section
  doc.setFontSize(11)
  doc.text('PIUTANG USAHA (AR)', 14, 30)
  const arTableData = (arData || []).map(inv => {
    const balance = Number(inv.total) - Number(inv.amount_paid)
    const bucket = getAgingBucket(inv.due_date, asOfDate)
    return [
      inv.invoice_number,
      inv.date,
      inv.due_date || '—',
      inv.customer?.name || '—',
      formatCurrency(balance),
      BUCKET_LABELS[bucket] || bucket,
    ]
  })
  doc.autoTable({
    head: [['No. Invoice', 'Tgl Invoice', 'Jatuh Tempo', 'Customer', 'Sisa Tagihan', 'Bucket']],
    body: arTableData,
    startY: 34,
    theme: 'grid',
    columnStyles: { 4: { halign: 'right' } },
  })

  // AP Section
  const afterArY = doc.lastAutoTable.finalY + 8
  doc.setFontSize(11)
  doc.text('UTANG USAHA (AP)', 14, afterArY)
  const apTableData = (apData || []).map(inv => {
    const balance = Number(inv.total) - Number(inv.amount_paid)
    const bucket = getAgingBucket(inv.due_date, asOfDate)
    return [
      inv.invoice_number,
      inv.date,
      inv.due_date || '—',
      inv.supplier?.name || '—',
      formatCurrency(balance),
      BUCKET_LABELS[bucket] || bucket,
    ]
  })
  doc.autoTable({
    head: [['No. Invoice', 'Tgl Invoice', 'Jatuh Tempo', 'Supplier', 'Sisa Tagihan', 'Bucket']],
    body: apTableData,
    startY: afterArY + 4,
    theme: 'grid',
    columnStyles: { 4: { halign: 'right' } },
  })

  doc.save(`ar-ap-aging-${asOfDate}.pdf`)
}

function exportExcel() {
  const arSheet = (arData || []).map(inv => {
    const balance = Number(inv.total) - Number(inv.amount_paid)
    return {
      Tipe: 'AR',
      'No. Invoice': inv.invoice_number,
      'Tgl Invoice': inv.date,
      'Jatuh Tempo': inv.due_date || '',
      Customer: inv.customer?.name || '',
      'Sisa Tagihan': balance,
      Bucket: BUCKET_LABELS[getAgingBucket(inv.due_date, asOfDate)],
    }
  })
  const apSheet = (apData || []).map(inv => {
    const balance = Number(inv.total) - Number(inv.amount_paid)
    return {
      Tipe: 'AP',
      'No. Invoice': inv.invoice_number,
      'Tgl Invoice': inv.date,
      'Jatuh Tempo': inv.due_date || '',
      Supplier: inv.supplier?.name || '',
      'Sisa Tagihan': balance,
      Bucket: BUCKET_LABELS[getAgingBucket(inv.due_date, asOfDate)],
    }
  })
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(arSheet), 'AR Aging')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(apSheet), 'AP Aging')
  XLSX.writeFile(wb, `ar-ap-aging-${asOfDate}.xlsx`)
}
```

- [ ] **Step 3: Tambah tombol Export**

Di dalam blok `{(arData || apData) && !loading && (...)}` sebelum `<Tabs ...>`:
```jsx
<Space>
  <Button icon={<FileText size={14} />} onClick={exportPDF}>Export PDF</Button>
  <Button icon={<Download size={14} />} onClick={exportExcel}>Export Excel</Button>
</Space>
```

- [ ] **Step 4: Build check**

```bash
cd C:\Project\apps\erp-acc\erp-app && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add apps/erp-acc/erp-app/src/pages/reports/ARAPAgingPage.jsx
git commit -m "feat(erp-acc): add PDF/Excel export to ARAPAgingPage"
```

---

## Task 5: TrialBalancePage.jsx — PDF Export

**File:** Modify `src/pages/reports/TrialBalancePage.jsx`

**Data yang tersedia:**
- `data` — array of `{coa_id, code, name, type, total_debit, total_credit, balance}`
- `asOfDate` — string "YYYY-MM-DD"
- `totalDebit`, `totalCredit` — computed dari `data`

- [ ] **Step 1: Tambah imports**

```jsx
import { jsPDF } from 'jspdf'
import 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { Download, FileText } from 'lucide-react'
```

Pastikan `Space` dan `Button` dari `antd` ada di destructure import.

- [ ] **Step 2: Tambah fungsi exportPDF() dan exportExcel()**

```jsx
function exportPDF() {
  const doc = new jsPDF()
  doc.setFontSize(14)
  doc.text('Neraca Saldo (Trial Balance)', 14, 15)
  doc.setFontSize(10)
  doc.text(`Per Tanggal: ${asOfDate}`, 14, 22)

  const tableData = (data || []).map(row => [
    row.code,
    row.name,
    row.type,
    formatCurrency(row.total_debit),
    formatCurrency(row.total_credit),
    formatCurrency(row.balance),
  ])
  tableData.push(['', 'TOTAL', '', formatCurrency(totalDebit), formatCurrency(totalCredit), ''])

  doc.autoTable({
    head: [['Kode', 'Nama Akun', 'Tipe', 'Debit', 'Kredit', 'Saldo']],
    body: tableData,
    startY: 28,
    theme: 'grid',
    columnStyles: {
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
    },
    didParseCell: (hookData) => {
      if (hookData.row.raw[1] === 'TOTAL') hookData.cell.styles.fontStyle = 'bold'
    },
  })
  doc.save(`trial-balance-${asOfDate}.pdf`)
}

function exportExcel() {
  const rows = (data || []).map(row => ({
    Kode: row.code,
    'Nama Akun': row.name,
    Tipe: row.type,
    Debit: Number(row.total_debit),
    Kredit: Number(row.total_credit),
    Saldo: Number(row.balance),
  }))
  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [{ wch: 10 }, { wch: 30 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 15 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'NeracaSaldo')
  XLSX.writeFile(wb, `trial-balance-${asOfDate}.xlsx`)
}
```

- [ ] **Step 3: Tambah tombol Export**

Di dalam blok `{data && !loading && (...)}`, tambahkan sebelum alert balance check:
```jsx
{!isEmpty && (
  <Space>
    <Button icon={<FileText size={14} />} onClick={exportPDF}>Export PDF</Button>
    <Button icon={<Download size={14} />} onClick={exportExcel}>Export Excel</Button>
  </Space>
)}
```

- [ ] **Step 4: Build check**

```bash
cd C:\Project\apps\erp-acc\erp-app && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add apps/erp-acc/erp-app/src/pages/reports/TrialBalancePage.jsx
git commit -m "feat(erp-acc): add PDF/Excel export to TrialBalancePage"
```

---

## Task 6: SalesReportPage.jsx + PurchaseReportPage.jsx — PDF Export

**Files:**
- Modify `src/pages/reports/SalesReportPage.jsx`
- Modify `src/pages/reports/PurchaseReportPage.jsx`

**Data SalesReportPage:**
- `data` — array of `{id, invoice_number, date, customer: {name}, subtotal, tax_amount, total, amount_paid, status}`
- `startDate`, `endDate`
- `totalSubtotal`, `totalTax`, `totalAmount`, `totalPaid`, `totalOutstanding`

**Data PurchaseReportPage:** sama persis, tapi `customer` → `supplier` dan label "Hutang" bukan "Piutang"

### SalesReportPage.jsx

- [ ] **Step 1: Tambah imports di SalesReportPage.jsx**

```jsx
import { jsPDF } from 'jspdf'
import 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { Download, FileText } from 'lucide-react'
```

- [ ] **Step 2: Tambah fungsi exportPDF() dan exportExcel() di SalesReportPage**

```jsx
function exportPDF() {
  const doc = new jsPDF()
  doc.setFontSize(14)
  doc.text('Laporan Penjualan', 14, 15)
  doc.setFontSize(10)
  doc.text(`${startDate} s/d ${endDate}`, 14, 22)

  const tableData = (data || []).map(row => [
    row.invoice_number,
    row.date,
    row.customer?.name || '—',
    formatCurrency(row.subtotal),
    formatCurrency(row.tax_amount),
    formatCurrency(row.total),
    formatCurrency(row.amount_paid),
    formatCurrency(Number(row.total) - Number(row.amount_paid)),
  ])
  tableData.push([
    '', '', 'TOTAL',
    formatCurrency(totalSubtotal),
    formatCurrency(totalTax),
    formatCurrency(totalAmount),
    formatCurrency(totalPaid),
    formatCurrency(totalOutstanding),
  ])

  doc.autoTable({
    head: [['No. Invoice', 'Tanggal', 'Customer', 'Subtotal', 'PPN', 'Total', 'Terbayar', 'Piutang']],
    body: tableData,
    startY: 28,
    theme: 'grid',
    styles: { fontSize: 8 },
    columnStyles: {
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right' },
      7: { halign: 'right' },
    },
    didParseCell: (hookData) => {
      if (hookData.row.raw[2] === 'TOTAL') hookData.cell.styles.fontStyle = 'bold'
    },
  })
  doc.save(`sales-report-${startDate}-${endDate}.pdf`)
}

function exportExcel() {
  const rows = (data || []).map(row => ({
    'No. Invoice': row.invoice_number,
    Tanggal: row.date,
    Customer: row.customer?.name || '',
    Subtotal: Number(row.subtotal),
    PPN: Number(row.tax_amount),
    Total: Number(row.total),
    Terbayar: Number(row.amount_paid),
    Piutang: Number(row.total) - Number(row.amount_paid),
    Status: row.status,
  }))
  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [{ wch: 16 }, { wch: 12 }, { wch: 25 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Penjualan')
  XLSX.writeFile(wb, `sales-report-${startDate}-${endDate}.xlsx`)
}
```

- [ ] **Step 3: Tambah tombol Export di SalesReportPage**

Di dalam blok `{data && !loading && (...)}`, tambahkan sebelum `<Row gutter={16}>`:
```jsx
<Space>
  <Button icon={<FileText size={14} />} onClick={exportPDF}>Export PDF</Button>
  <Button icon={<Download size={14} />} onClick={exportExcel}>Export Excel</Button>
</Space>
```

### PurchaseReportPage.jsx

- [ ] **Step 4: Tambah imports di PurchaseReportPage.jsx**

Sama persis dengan Sales:
```jsx
import { jsPDF } from 'jspdf'
import 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { Download, FileText } from 'lucide-react'
```

- [ ] **Step 5: Tambah fungsi exportPDF() dan exportExcel() di PurchaseReportPage**

```jsx
function exportPDF() {
  const doc = new jsPDF()
  doc.setFontSize(14)
  doc.text('Laporan Pembelian', 14, 15)
  doc.setFontSize(10)
  doc.text(`${startDate} s/d ${endDate}`, 14, 22)

  const tableData = (data || []).map(row => [
    row.invoice_number,
    row.date,
    row.supplier?.name || '—',
    formatCurrency(row.subtotal),
    formatCurrency(row.tax_amount),
    formatCurrency(row.total),
    formatCurrency(row.amount_paid),
    formatCurrency(Number(row.total) - Number(row.amount_paid)),
  ])
  tableData.push([
    '', '', 'TOTAL',
    formatCurrency(totalSubtotal),
    formatCurrency(totalTax),
    formatCurrency(totalAmount),
    formatCurrency(totalPaid),
    formatCurrency(totalOutstanding),
  ])

  doc.autoTable({
    head: [['No. Invoice', 'Tanggal', 'Supplier', 'Subtotal', 'PPN', 'Total', 'Terbayar', 'Hutang']],
    body: tableData,
    startY: 28,
    theme: 'grid',
    styles: { fontSize: 8 },
    columnStyles: {
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right' },
      7: { halign: 'right' },
    },
    didParseCell: (hookData) => {
      if (hookData.row.raw[2] === 'TOTAL') hookData.cell.styles.fontStyle = 'bold'
    },
  })
  doc.save(`purchase-report-${startDate}-${endDate}.pdf`)
}

function exportExcel() {
  const rows = (data || []).map(row => ({
    'No. Invoice': row.invoice_number,
    Tanggal: row.date,
    Supplier: row.supplier?.name || '',
    Subtotal: Number(row.subtotal),
    PPN: Number(row.tax_amount),
    Total: Number(row.total),
    Terbayar: Number(row.amount_paid),
    Hutang: Number(row.total) - Number(row.amount_paid),
    Status: row.status,
  }))
  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [{ wch: 16 }, { wch: 12 }, { wch: 25 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Pembelian')
  XLSX.writeFile(wb, `purchase-report-${startDate}-${endDate}.xlsx`)
}
```

- [ ] **Step 6: Tambah tombol Export di PurchaseReportPage**

Sama dengan Sales — di dalam `{data && !loading && (...)}` sebelum `<Row gutter={16}>`:
```jsx
<Space>
  <Button icon={<FileText size={14} />} onClick={exportPDF}>Export PDF</Button>
  <Button icon={<Download size={14} />} onClick={exportExcel}>Export Excel</Button>
</Space>
```

- [ ] **Step 7: Build check**

```bash
cd C:\Project\apps\erp-acc\erp-app && npm run build
```

- [ ] **Step 8: Commit**

```bash
git add apps/erp-acc/erp-app/src/pages/reports/SalesReportPage.jsx
git add apps/erp-acc/erp-app/src/pages/reports/PurchaseReportPage.jsx
git commit -m "feat(erp-acc): add PDF/Excel export to SalesReportPage and PurchaseReportPage"
```

---

## Self-Review

1. **Spec coverage:** 7 halaman × exportPDF + exportExcel + tombol ✅. 4 halaman aset yang sudah ada tidak diubah ✅.
2. **Placeholder scan:** Tidak ada TBD/TODO. Semua kode lengkap.
3. **Type consistency:** `formatCurrency` digunakan di semua halaman (sudah diimport di tiap file). `getAgingBucket` dan `BUCKET_LABELS` digunakan di Task 4 — keduanya sudah ada di file ARAPAgingPage.jsx.
4. **Import antd Button:** Beberapa halaman menggunakan custom `Button` dari `../../components/ui/Button`. Halaman report yang menggunakan custom Button: BalanceSheetPage, IncomeStatementPage, CashFlowPage, ARAPAgingPage, TrialBalancePage. Untuk konsistensi, gunakan `Button` dari `antd` untuk tombol Export — tambahkan ke destructure import antd jika belum ada, tanpa menghapus import custom Button yang dipakai untuk Tampilkan.

**PENTING untuk Codex:** Di BalanceSheetPage, IncomeStatementPage, CashFlowPage, ARAPAgingPage, TrialBalancePage — tombol "Tampilkan" menggunakan custom `Button` dari `../../components/ui/Button`. Jangan ganti tombol itu. Untuk tombol Export, impor `Button` dari `antd` dengan alias: `import { Button as AntButton } from 'antd'` lalu gunakan `<AntButton>` untuk Export, ATAU cukup tambahkan `Button` ke destructure antd yang ada dan beri alias pada custom Button.
