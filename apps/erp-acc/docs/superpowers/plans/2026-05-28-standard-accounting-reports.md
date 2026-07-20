# Standard Accounting Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambahkan 3 laporan akuntansi standar yang belum ada: Neraca Saldo (Trial Balance), Laporan Penjualan, dan Laporan Pembelian.

**Architecture:** Trial Balance menggunakan RPC PostgreSQL baru `get_trial_balance(p_as_of_date)` yang memfilter hanya akun dengan aktivitas jurnal. Sales & Purchase Report menggunakan direct Supabase query pada tabel `invoices` (konsisten dengan pola `getARAgingData` di `reportService.js`). Semua halaman mengikuti pola `BalanceSheetPage.jsx` (filter tanggal → klik Tampilkan → tabel hasil).

**Tech Stack:** React 18 + Ant Design, Supabase PostgreSQL, `reportService.js` extensions, react-router-dom.

**Executor Notes:**
- Working dir: `C:\Project\apps\erp-acc\erp-app\`
- No test framework — skip TDD steps, validasi dengan `npm run build`
- Kolom tabel `invoices`: `id`, `invoice_number`, `date`, `due_date`, `type`, `subtotal`, `tax_amount`, `total`, `amount_paid`, `status`, `customer_id`, `supplier_id`
- Ikuti pola `BalanceSheetPage.jsx` untuk filter + tampilkan
- Ikuti pola `ARAPAgingPage.jsx` untuk filter + customer/supplier dropdown
- Format currency: `formatCurrency` dari `../../utils/currency`
- Export PDF: `jsPDF` + `jspdf-autotable` (sudah terinstall, lihat `AssetDisposalsReportPage.jsx` untuk contoh)
- Fungsi `get_account_balances` yang ada di `reportService.js` return shape: `{ coa_id, code, name, type, normal_balance, total_debit, total_credit, balance }`

---

## Model Assignment

| Task | Model | Alasan |
|------|-------|--------|
| T1: SQL Migration 030 | **Claude** | PostgreSQL function baru — akuntansi domain knowledge |
| T2: reportService.js additions | **Codex** | 3 simple service functions (wrapper + direct query) |
| T3: TrialBalancePage.jsx | **Codex** | Display page — pola identik dengan BalanceSheetPage |
| T4: SalesReportPage.jsx | **Codex** | Filter + tabel + export — pola identik dengan ARAPAgingPage |
| T5: PurchaseReportPage.jsx | **Codex** | Mirror dari SalesReportPage dengan supplier |
| T6: App.jsx routes + Sidebar.jsx | **Codex** | Boilerplate routing + nav additions |

---

## File Structure

```
erp-app/
├── supabase/migrations/
│   └── 030_trial_balance_function.sql  [CREATE — Task 1]
├── src/
│   ├── services/
│   │   └── reportService.js            [MODIFY — Task 2, append 3 functions]
│   ├── pages/reports/
│   │   ├── TrialBalancePage.jsx         [CREATE — Task 3]
│   │   ├── SalesReportPage.jsx          [CREATE — Task 4]
│   │   └── PurchaseReportPage.jsx       [CREATE — Task 5]
│   ├── App.jsx                          [MODIFY — Task 6, lazy imports + 3 routes]
│   └── components/layout/Sidebar.jsx   [MODIFY — Task 6, Laporan group additions]
```

---

## Task 1 (Claude): SQL Migration 030 — get_trial_balance RPC

**Files:**
- Create: `supabase/migrations/030_trial_balance_function.sql`

- [ ] **Step 1: Buat file migration**

```sql
-- ============================================================
-- Migration 030: Trial Balance (Neraca Saldo) Function
-- Berbeda dari get_account_balances: selalu dari awal waktu
-- dan hanya mengembalikan akun yang punya aktivitas jurnal.
-- ============================================================

create or replace function get_trial_balance(p_as_of_date date)
returns table (
  coa_id         uuid,
  code           text,
  name           text,
  type           text,
  normal_balance text,
  total_debit    numeric,
  total_credit   numeric,
  balance        numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  select
    c.id                                                     as coa_id,
    c.code,
    c.name,
    c.type,
    c.normal_balance,
    coalesce(sum(ji.debit), 0)                               as total_debit,
    coalesce(sum(ji.credit), 0)                              as total_credit,
    case c.normal_balance
      when 'debit'  then coalesce(sum(ji.debit), 0)  - coalesce(sum(ji.credit), 0)
      when 'credit' then coalesce(sum(ji.credit), 0) - coalesce(sum(ji.debit), 0)
    end                                                      as balance
  from coa c
  -- INNER JOIN: hanya akun yang punya minimal satu journal entry
  join journal_items ji on ji.coa_id = c.id
  join journals j       on ji.journal_id = j.id
    and j.is_posted = true
    and j.date <= p_as_of_date
  where c.is_active = true
  group by c.id, c.code, c.name, c.type, c.normal_balance
  order by c.code;
end;
$$;
```

- [ ] **Step 2: Apply migration ke Supabase**

Buka Supabase Dashboard → SQL Editor → paste isi file → Run.

Verifikasi query:
```sql
select * from get_trial_balance(current_date) limit 5;
```
Expected: baris dengan `total_debit`, `total_credit`, `balance`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/030_trial_balance_function.sql
git commit -m "feat(erp-acc): add get_trial_balance PostgreSQL function (migration 030)"
```

---

## Task 2 (Codex): reportService.js — 3 new service functions

**Files:**
- Modify: `src/services/reportService.js` (append di akhir file)

**Catatan penting:**
- `getTrialBalance` memanggil RPC `get_trial_balance` yang baru dibuat di Task 1
- `getSalesReport` dan `getPurchaseReport` menggunakan direct Supabase query (bukan RPC)
- Parameter `customerId` dan `supplierId` bersifat opsional (null = semua)

Tambahkan di akhir `src/services/reportService.js`:

```javascript
export async function getTrialBalance(asOfDate) {
  const { data, error } = await supabase.rpc('get_trial_balance', {
    p_as_of_date: asOfDate,
  })
  if (error) throw error
  return data
}

export async function getSalesReport(startDate, endDate, customerId = null) {
  let q = supabase
    .from('invoices')
    .select(`
      id, invoice_number, date, due_date, subtotal, tax_amount, total, amount_paid, status,
      customer:customers(id, name)
    `)
    .eq('type', 'sales')
    .in('status', ['posted', 'partial', 'paid'])
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date')
    .order('invoice_number')

  if (customerId) q = q.eq('customer_id', customerId)

  const { data, error } = await q
  if (error) throw error
  return data
}

export async function getPurchaseReport(startDate, endDate, supplierId = null) {
  let q = supabase
    .from('invoices')
    .select(`
      id, invoice_number, date, due_date, subtotal, tax_amount, total, amount_paid, status,
      supplier:suppliers(id, name)
    `)
    .eq('type', 'purchase')
    .in('status', ['posted', 'partial', 'paid'])
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date')
    .order('invoice_number')

  if (supplierId) q = q.eq('supplier_id', supplierId)

  const { data, error } = await q
  if (error) throw error
  return data
}
```

- [ ] **Step 1: Tambahkan 3 fungsi di akhir** `src/services/reportService.js` (persis seperti kode di atas).

- [ ] **Step 2: Verifikasi build**

```bash
cd apps/erp-acc/erp-app && npm run build
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/services/reportService.js
git commit -m "feat(erp-acc): add getTrialBalance, getSalesReport, getPurchaseReport to reportService"
```

---

## Task 3 (Codex): TrialBalancePage.jsx

**Files:**
- Create: `src/pages/reports/TrialBalancePage.jsx`

**Deskripsi:** Satu filter (tanggal per) → klik Tampilkan → tabel dengan kolom: Kode, Nama Akun, Debit, Kredit, Saldo. Baris footer: total debit dan total kredit (harus sama jika pembukuan balance). Ikuti pola `BalanceSheetPage.jsx`.

```jsx
import { useState } from 'react'
import { getTrialBalance } from '../../services/reportService'
import { formatCurrency } from '../../utils/currency'
import Button from '../../components/ui/Button'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import DateInput from '../../components/ui/DateInput'
import { Search } from 'lucide-react'
import {
  Space, Card, Typography, Alert, Table, Row, Col, Statistic
} from 'antd'

const { Title, Text } = Typography

function today() { return new Date().toISOString().slice(0, 10) }

export default function TrialBalancePage() {
  const [asOfDate, setAsOfDate] = useState(today())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleLoad() {
    setLoading(true)
    setError(null)
    try {
      const rows = await getTrialBalance(asOfDate)
      setData(rows)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const totalDebit  = data ? data.reduce((s, r) => s + Number(r.total_debit), 0)  : 0
  const totalCredit = data ? data.reduce((s, r) => s + Number(r.total_credit), 0) : 0
  const isBalanced  = data && Math.abs(totalDebit - totalCredit) < 0.01

  const columns = [
    {
      title: 'Kode',
      dataIndex: 'code',
      key: 'code',
      width: 90,
      render: v => <Text type="secondary">{v}</Text>,
    },
    {
      title: 'Nama Akun',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'Tipe',
      dataIndex: 'type',
      key: 'type',
      width: 120,
      render: v => <Text type="secondary" style={{ textTransform: 'capitalize' }}>{v}</Text>,
    },
    {
      title: 'Debit',
      dataIndex: 'total_debit',
      key: 'total_debit',
      align: 'right',
      width: 150,
      render: v => <Text>{formatCurrency(v)}</Text>,
    },
    {
      title: 'Kredit',
      dataIndex: 'total_credit',
      key: 'total_credit',
      align: 'right',
      width: 150,
      render: v => <Text>{formatCurrency(v)}</Text>,
    },
    {
      title: 'Saldo',
      dataIndex: 'balance',
      key: 'balance',
      align: 'right',
      width: 150,
      render: (v, row) => (
        <Text strong style={{ color: Number(v) < 0 ? '#ff4d4f' : undefined }}>
          {formatCurrency(v)}
        </Text>
      ),
    },
  ]

  const footer = () => (
    <Row justify="space-between" align="middle">
      <Col>
        <Text strong>Total</Text>
      </Col>
      <Col style={{ textAlign: 'right', minWidth: 300 }}>
        <Space size="large">
          <Text strong>Debit: {formatCurrency(totalDebit)}</Text>
          <Text strong>Kredit: {formatCurrency(totalCredit)}</Text>
        </Space>
      </Col>
    </Row>
  )

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Title level={2} style={{ margin: 0 }}>Neraca Saldo (Trial Balance)</Title>

      <Card>
        <Space direction="horizontal" size="middle" wrap>
          <div>
            <Text strong>Per Tanggal</Text>
            <div style={{ marginTop: 4 }}>
              <DateInput value={asOfDate} onChange={setAsOfDate} />
            </div>
          </div>
          <Button
            style={{ marginTop: 20 }}
            onClick={handleLoad}
            icon={<Search size={14} />}
          >
            Tampilkan
          </Button>
        </Space>
      </Card>

      {loading && <LoadingSpinner />}
      {error && <Alert message={error} type="error" showIcon />}

      {data && (
        <>
          {isBalanced ? (
            <Alert message="Pembukuan balance — total debit = total kredit." type="success" showIcon />
          ) : (
            <Alert
              message={`Pembukuan TIDAK balance! Selisih: ${formatCurrency(Math.abs(totalDebit - totalCredit))}`}
              type="error"
              showIcon
            />
          )}

          <Row gutter={16}>
            <Col xs={12} sm={6}>
              <Statistic title="Total Akun Aktif" value={data.length} />
            </Col>
            <Col xs={12} sm={6}>
              <Statistic title="Total Debit" value={formatCurrency(totalDebit)} />
            </Col>
            <Col xs={12} sm={6}>
              <Statistic title="Total Kredit" value={formatCurrency(totalCredit)} />
            </Col>
          </Row>

          <Card
            title={`Neraca Saldo per ${asOfDate}`}
            styles={{ body: { padding: 0 } }}
          >
            <Table
              dataSource={data}
              columns={columns}
              rowKey="coa_id"
              pagination={false}
              size="small"
              footer={footer}
              locale={{ emptyText: 'Tidak ada data' }}
            />
          </Card>
        </>
      )}
    </Space>
  )
}
```

- [ ] **Step 1: Buat file** dengan kode di atas.

- [ ] **Step 2: Verifikasi build**

```bash
cd apps/erp-acc/erp-app && npm run build
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/pages/reports/TrialBalancePage.jsx
git commit -m "feat(erp-acc): add TrialBalancePage with balance check indicator"
```

---

## Task 4 (Codex): SalesReportPage.jsx

**Files:**
- Create: `src/pages/reports/SalesReportPage.jsx`

**Deskripsi:** Filter tanggal + customer (opsional) → tabel invoice penjualan dengan kolom: No. Invoice, Tanggal, Customer, Subtotal, PPN, Total, Terbayar, Sisa, Status. Footer total row. Ikuti pola `ARAPAgingPage.jsx`.

**Customers dropdown:** gunakan `useCustomers` dari `../../hooks/useMasterData` jika ada, atau langsung `supabase.from('customers').select('id, name')`. Cek file `src/hooks/` untuk hook yang sesuai.

**Status badge color:**
- `paid` → `success` (hijau)
- `partial` → `processing` (biru)
- `posted` → `warning` (kuning)
- `draft` → `default` (abu)

```jsx
import { useState, useEffect } from 'react'
import { getSalesReport } from '../../services/reportService'
import { supabase } from '../../lib/supabase'
import { formatCurrency } from '../../utils/currency'
import Button from '../../components/ui/Button'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import DateInput from '../../components/ui/DateInput'
import { Search } from 'lucide-react'
import { Space, Card, Typography, Alert, Table, Tag, Row, Col, Statistic, Select } from 'antd'

const { Title, Text } = Typography

function firstOfMonth() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` }
function today()        { return new Date().toISOString().slice(0, 10) }

const STATUS_MAP = {
  paid:    { color: 'success',    label: 'Lunas' },
  partial: { color: 'processing', label: 'Sebagian' },
  posted:  { color: 'warning',    label: 'Terposting' },
  draft:   { color: 'default',    label: 'Draft' },
}

export default function SalesReportPage() {
  const [startDate, setStartDate] = useState(firstOfMonth())
  const [endDate,   setEndDate]   = useState(today())
  const [customerId, setCustomerId] = useState(null)
  const [customers,  setCustomers]  = useState([])
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    supabase.from('customers').select('id, name').eq('is_active', true).order('name')
      .then(({ data: c }) => setCustomers(c || []))
  }, [])

  async function handleLoad() {
    setLoading(true)
    setError(null)
    try {
      const rows = await getSalesReport(startDate, endDate, customerId)
      setData(rows)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const totalSubtotal  = data ? data.reduce((s, r) => s + Number(r.subtotal),  0) : 0
  const totalTax       = data ? data.reduce((s, r) => s + Number(r.tax_amount), 0) : 0
  const totalAmount    = data ? data.reduce((s, r) => s + Number(r.total),      0) : 0
  const totalPaid      = data ? data.reduce((s, r) => s + Number(r.amount_paid), 0) : 0
  const totalOutstanding = totalAmount - totalPaid

  const columns = [
    { title: 'No. Invoice', dataIndex: 'invoice_number', key: 'invoice_number', width: 150 },
    { title: 'Tanggal',     dataIndex: 'date',           key: 'date',           width: 110 },
    {
      title: 'Customer',
      key: 'customer',
      render: (_, r) => r.customer?.name || '—',
    },
    {
      title: 'Subtotal', dataIndex: 'subtotal', key: 'subtotal', align: 'right', width: 130,
      render: v => formatCurrency(v),
    },
    {
      title: 'PPN', dataIndex: 'tax_amount', key: 'tax_amount', align: 'right', width: 110,
      render: v => formatCurrency(v),
    },
    {
      title: 'Total', dataIndex: 'total', key: 'total', align: 'right', width: 130,
      render: v => <Text strong>{formatCurrency(v)}</Text>,
    },
    {
      title: 'Terbayar', dataIndex: 'amount_paid', key: 'amount_paid', align: 'right', width: 130,
      render: v => <Text type="success">{formatCurrency(v)}</Text>,
    },
    {
      title: 'Sisa',
      key: 'outstanding',
      align: 'right',
      width: 130,
      render: (_, r) => {
        const outstanding = Number(r.total) - Number(r.amount_paid)
        return <Text type={outstanding > 0 ? 'danger' : 'secondary'}>{formatCurrency(outstanding)}</Text>
      },
    },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 100,
      render: s => {
        const cfg = STATUS_MAP[s] || { color: 'default', label: s }
        return <Tag color={cfg.color}>{cfg.label}</Tag>
      },
    },
  ]

  const footer = () => (
    <Row justify="end">
      <Col>
        <Space size="large">
          <Text strong>Subtotal: {formatCurrency(totalSubtotal)}</Text>
          <Text strong>PPN: {formatCurrency(totalTax)}</Text>
          <Text strong>Total: {formatCurrency(totalAmount)}</Text>
          <Text strong style={{ color: '#52c41a' }}>Terbayar: {formatCurrency(totalPaid)}</Text>
          <Text strong style={{ color: '#ff4d4f' }}>Sisa: {formatCurrency(totalOutstanding)}</Text>
        </Space>
      </Col>
    </Row>
  )

  const customerOptions = [
    { value: null, label: '— Semua Customer —' },
    ...customers.map(c => ({ value: c.id, label: c.name })),
  ]

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Title level={2} style={{ margin: 0 }}>Laporan Penjualan</Title>

      <Card>
        <Space direction="horizontal" size="middle" wrap>
          <div>
            <Text strong>Dari Tanggal</Text>
            <div style={{ marginTop: 4 }}>
              <DateInput value={startDate} onChange={setStartDate} />
            </div>
          </div>
          <div>
            <Text strong>Sampai Tanggal</Text>
            <div style={{ marginTop: 4 }}>
              <DateInput value={endDate} onChange={setEndDate} />
            </div>
          </div>
          <div>
            <Text strong>Customer</Text>
            <div style={{ marginTop: 4 }}>
              <Select
                style={{ width: 220 }}
                options={customerOptions}
                value={customerId}
                onChange={setCustomerId}
              />
            </div>
          </div>
          <Button
            style={{ marginTop: 20 }}
            onClick={handleLoad}
            icon={<Search size={14} />}
          >
            Tampilkan
          </Button>
        </Space>
      </Card>

      {loading && <LoadingSpinner />}
      {error && <Alert message={error} type="error" showIcon />}

      {data && (
        <>
          <Row gutter={16}>
            <Col xs={12} sm={4}><Statistic title="Total Invoice" value={data.length} /></Col>
            <Col xs={12} sm={5}><Statistic title="Total Nilai" value={formatCurrency(totalAmount)} /></Col>
            <Col xs={12} sm={5}><Statistic title="Terbayar" value={formatCurrency(totalPaid)} /></Col>
            <Col xs={12} sm={5}><Statistic title="Piutang" value={formatCurrency(totalOutstanding)} /></Col>
          </Row>

          <Card
            title={`Laporan Penjualan ${startDate} s/d ${endDate}`}
            styles={{ body: { padding: 0 } }}
          >
            <Table
              dataSource={data}
              columns={columns}
              rowKey="id"
              pagination={{ pageSize: 50 }}
              size="small"
              footer={data.length > 0 ? footer : undefined}
              locale={{ emptyText: 'Tidak ada data untuk periode ini' }}
            />
          </Card>
        </>
      )}
    </Space>
  )
}
```

- [ ] **Step 1: Buat file** dengan kode di atas.

- [ ] **Step 2: Verifikasi build**

```bash
cd apps/erp-acc/erp-app && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/reports/SalesReportPage.jsx
git commit -m "feat(erp-acc): add SalesReportPage with date range + customer filter"
```

---

## Task 5 (Codex): PurchaseReportPage.jsx

**Files:**
- Create: `src/pages/reports/PurchaseReportPage.jsx`

**Deskripsi:** Mirror dari `SalesReportPage.jsx` dengan perubahan:
- Import `getPurchaseReport` (bukan `getSalesReport`)
- Dropdown "Customer" diganti "Supplier" — `supabase.from('suppliers')`, `supplierId` state
- Kolom "Customer" diganti "Supplier"
- Title: "Laporan Pembelian"
- Statistic "Piutang" diganti "Hutang"

```jsx
import { useState, useEffect } from 'react'
import { getPurchaseReport } from '../../services/reportService'
import { supabase } from '../../lib/supabase'
import { formatCurrency } from '../../utils/currency'
import Button from '../../components/ui/Button'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import DateInput from '../../components/ui/DateInput'
import { Search } from 'lucide-react'
import { Space, Card, Typography, Alert, Table, Tag, Row, Col, Statistic, Select } from 'antd'

const { Title, Text } = Typography

function firstOfMonth() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` }
function today()        { return new Date().toISOString().slice(0, 10) }

const STATUS_MAP = {
  paid:    { color: 'success',    label: 'Lunas' },
  partial: { color: 'processing', label: 'Sebagian' },
  posted:  { color: 'warning',    label: 'Terposting' },
  draft:   { color: 'default',    label: 'Draft' },
}

export default function PurchaseReportPage() {
  const [startDate,   setStartDate]   = useState(firstOfMonth())
  const [endDate,     setEndDate]     = useState(today())
  const [supplierId,  setSupplierId]  = useState(null)
  const [suppliers,   setSuppliers]   = useState([])
  const [data,        setData]        = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState(null)

  useEffect(() => {
    supabase.from('suppliers').select('id, name').eq('is_active', true).order('name')
      .then(({ data: s }) => setSuppliers(s || []))
  }, [])

  async function handleLoad() {
    setLoading(true)
    setError(null)
    try {
      const rows = await getPurchaseReport(startDate, endDate, supplierId)
      setData(rows)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const totalSubtotal    = data ? data.reduce((s, r) => s + Number(r.subtotal),   0) : 0
  const totalTax         = data ? data.reduce((s, r) => s + Number(r.tax_amount),  0) : 0
  const totalAmount      = data ? data.reduce((s, r) => s + Number(r.total),       0) : 0
  const totalPaid        = data ? data.reduce((s, r) => s + Number(r.amount_paid), 0) : 0
  const totalOutstanding = totalAmount - totalPaid

  const columns = [
    { title: 'No. Invoice', dataIndex: 'invoice_number', key: 'invoice_number', width: 150 },
    { title: 'Tanggal',     dataIndex: 'date',           key: 'date',           width: 110 },
    {
      title: 'Supplier',
      key: 'supplier',
      render: (_, r) => r.supplier?.name || '—',
    },
    {
      title: 'Subtotal', dataIndex: 'subtotal', key: 'subtotal', align: 'right', width: 130,
      render: v => formatCurrency(v),
    },
    {
      title: 'PPN', dataIndex: 'tax_amount', key: 'tax_amount', align: 'right', width: 110,
      render: v => formatCurrency(v),
    },
    {
      title: 'Total', dataIndex: 'total', key: 'total', align: 'right', width: 130,
      render: v => <Text strong>{formatCurrency(v)}</Text>,
    },
    {
      title: 'Terbayar', dataIndex: 'amount_paid', key: 'amount_paid', align: 'right', width: 130,
      render: v => <Text type="success">{formatCurrency(v)}</Text>,
    },
    {
      title: 'Sisa',
      key: 'outstanding',
      align: 'right',
      width: 130,
      render: (_, r) => {
        const outstanding = Number(r.total) - Number(r.amount_paid)
        return <Text type={outstanding > 0 ? 'danger' : 'secondary'}>{formatCurrency(outstanding)}</Text>
      },
    },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 100,
      render: s => {
        const cfg = STATUS_MAP[s] || { color: 'default', label: s }
        return <Tag color={cfg.color}>{cfg.label}</Tag>
      },
    },
  ]

  const footer = () => (
    <Row justify="end">
      <Col>
        <Space size="large">
          <Text strong>Subtotal: {formatCurrency(totalSubtotal)}</Text>
          <Text strong>PPN: {formatCurrency(totalTax)}</Text>
          <Text strong>Total: {formatCurrency(totalAmount)}</Text>
          <Text strong style={{ color: '#52c41a' }}>Terbayar: {formatCurrency(totalPaid)}</Text>
          <Text strong style={{ color: '#ff4d4f' }}>Hutang: {formatCurrency(totalOutstanding)}</Text>
        </Space>
      </Col>
    </Row>
  )

  const supplierOptions = [
    { value: null, label: '— Semua Supplier —' },
    ...suppliers.map(s => ({ value: s.id, label: s.name })),
  ]

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Title level={2} style={{ margin: 0 }}>Laporan Pembelian</Title>

      <Card>
        <Space direction="horizontal" size="middle" wrap>
          <div>
            <Text strong>Dari Tanggal</Text>
            <div style={{ marginTop: 4 }}>
              <DateInput value={startDate} onChange={setStartDate} />
            </div>
          </div>
          <div>
            <Text strong>Sampai Tanggal</Text>
            <div style={{ marginTop: 4 }}>
              <DateInput value={endDate} onChange={setEndDate} />
            </div>
          </div>
          <div>
            <Text strong>Supplier</Text>
            <div style={{ marginTop: 4 }}>
              <Select
                style={{ width: 220 }}
                options={supplierOptions}
                value={supplierId}
                onChange={setSupplierId}
              />
            </div>
          </div>
          <Button
            style={{ marginTop: 20 }}
            onClick={handleLoad}
            icon={<Search size={14} />}
          >
            Tampilkan
          </Button>
        </Space>
      </Card>

      {loading && <LoadingSpinner />}
      {error && <Alert message={error} type="error" showIcon />}

      {data && (
        <>
          <Row gutter={16}>
            <Col xs={12} sm={4}><Statistic title="Total Invoice" value={data.length} /></Col>
            <Col xs={12} sm={5}><Statistic title="Total Nilai" value={formatCurrency(totalAmount)} /></Col>
            <Col xs={12} sm={5}><Statistic title="Terbayar" value={formatCurrency(totalPaid)} /></Col>
            <Col xs={12} sm={5}><Statistic title="Hutang" value={formatCurrency(totalOutstanding)} /></Col>
          </Row>

          <Card
            title={`Laporan Pembelian ${startDate} s/d ${endDate}`}
            styles={{ body: { padding: 0 } }}
          >
            <Table
              dataSource={data}
              columns={columns}
              rowKey="id"
              pagination={{ pageSize: 50 }}
              size="small"
              footer={data.length > 0 ? footer : undefined}
              locale={{ emptyText: 'Tidak ada data untuk periode ini' }}
            />
          </Card>
        </>
      )}
    </Space>
  )
}
```

- [ ] **Step 1: Buat file** dengan kode di atas.

- [ ] **Step 2: Verifikasi build**

```bash
cd apps/erp-acc/erp-app && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/reports/PurchaseReportPage.jsx
git commit -m "feat(erp-acc): add PurchaseReportPage with date range + supplier filter"
```

---

## Task 6 (Codex): App.jsx routes + Sidebar.jsx navigation

**Files:**
- Modify: `src/App.jsx` (lazy imports + routes)
- Modify: `src/components/layout/Sidebar.jsx` (Laporan group additions)

**Step 1: App.jsx** — tambahkan lazy imports di blok `// reports pages` (sekitar baris 65-68):

```jsx
const TrialBalancePage    = lazy(() => import('./pages/reports/TrialBalancePage'))
const SalesReportPage     = lazy(() => import('./pages/reports/SalesReportPage'))
const PurchaseReportPage  = lazy(() => import('./pages/reports/PurchaseReportPage'))
```

Tambahkan routes di blok reports (sekitar baris 190-195), setelah `reports/ar-ap-aging`:

```jsx
<Route path="reports/trial-balance"   element={<TrialBalancePage />} />
<Route path="reports/sales"           element={<SalesReportPage />} />
<Route path="reports/purchases"       element={<PurchaseReportPage />} />
```

**Step 2: Sidebar.jsx** — di object `Laporan` (sekitar baris 104-117), tambahkan 3 item baru setelah `AR/AP Aging`:

```js
{ label: 'Neraca Saldo',      path: '/reports/trial-balance' },
{ label: 'Laporan Penjualan', path: '/reports/sales' },
{ label: 'Laporan Pembelian', path: '/reports/purchases' },
```

- [ ] **Step 1: Edit App.jsx** — tambahkan lazy imports dan 3 routes.

- [ ] **Step 2: Edit Sidebar.jsx** — tambahkan 3 items di group Laporan.

- [ ] **Step 3: Verifikasi build**

```bash
cd apps/erp-acc/erp-app && npm run build
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx src/components/layout/Sidebar.jsx
git commit -m "feat(erp-acc): add routes and sidebar links for trial balance, sales report, purchase report"
```

---

## Verification Checklist

Setelah semua task selesai:

1. **Neraca Saldo** → pilih tanggal → Tampilkan → baris COA muncul → banner "balance" atau "tidak balance" sesuai data
2. **Laporan Penjualan** → pilih bulan ini → Tampilkan → invoice penjualan muncul → filter customer berfungsi
3. **Laporan Pembelian** → sama tapi untuk purchase invoice dan supplier
4. `npm run build` → PASS
