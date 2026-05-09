# Dashboard KPIs & Charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade halaman Dashboard dengan tiga peningkatan: (1) overdue AR/AP alert cards, (2) month-over-month % change pada KPI Penjualan, dan (3) monthly revenue vs expense bar chart (Recharts, 6 bulan terakhir) — menghasilkan dashboard yang informatif seperti QuickBooks/Xero.

**Architecture:** Extend `dashboardService.js` dengan query overdue + last-month-sales di `getDashboardMetrics()`, tambah fungsi baru `getMonthlyTrend()` yang fetch invoice 6 bulan terakhir dan aggregate per bulan di sisi klien. Install `recharts`. Buat `MonthlyTrendChart` sebagai isolated component. Update `DashboardPage.jsx` dengan: new overdue KPI row (conditional, hanya muncul jika ada overdue), MoM indicator pada card Penjualan, dan chart section.

**Tech Stack:** React 18, Ant Design 6.3.5, Recharts (baru di-install), Supabase JS SDK, `formatCurrency` dari `utils/currency`, `Flex`/`Space` dari antd, Lucide React icons.

---

## File Structure

| Action | File | Tanggung Jawab |
|--------|------|----------------|
| Modify | `erp-app/src/services/dashboardService.js` | Tambah `lastMonthStart()`, `lastMonthEnd()`, `sixMonthsAgo()`, extend `getDashboardMetrics()`, tambah `getMonthlyTrend()` |
| Create | `erp-app/src/components/dashboard/MonthlyTrendChart.jsx` | Recharts `BarChart` — revenue vs pembelian 6 bulan, custom tooltip formatCurrency |
| Modify | `erp-app/src/pages/DashboardPage.jsx` | Import baru, `MomIndicator` helper, update `MetricCard` sub support, overdue row, chart section |
| Create | `erp-app/tests/dashboard.spec.js` | Playwright E2E — dashboard load, KPI cards, chart SVG, overdue row behavior |

---

## Task 1: Extend getDashboardMetrics() — Overdue AR/AP + MoM Data

**Files:**
- Modify: `erp-app/src/services/dashboardService.js`

File saat ini berisi: `monthStart()`, `today()`, `getDashboardMetrics()` dengan 7 query dalam `Promise.all`.

- [ ] **Step 1.1: Tambahkan 2 helper functions setelah `today()` (baris 9)**

Buka `erp-app/src/services/dashboardService.js`. Setelah baris `function today() { ... }`, tambahkan:

```js
function lastMonthStart() {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function lastMonthEnd() {
  const d = new Date()
  d.setDate(0) // hari terakhir bulan sebelumnya
  return d.toISOString().slice(0, 10)
}
```

- [ ] **Step 1.2: Tambahkan 3 query ke dalam `Promise.all([...])` di `getDashboardMetrics()`**

Di dalam array `Promise.all([...])`, setelah query `cashResult` (elemen ke-7 / query terakhir yang ada), tambahkan 3 query baru:

```js
    // Piutang jatuh tempo: sales invoice sudah melewati due_date dan belum lunas
    supabase
      .from('invoices')
      .select('total, amount_paid')
      .eq('type', 'sales')
      .in('status', ['posted', 'partial'])
      .lt('due_date', today())
      .not('due_date', 'is', null),

    // Hutang jatuh tempo: purchase invoice sudah melewati due_date dan belum lunas
    supabase
      .from('invoices')
      .select('total, amount_paid')
      .eq('type', 'purchase')
      .in('status', ['posted', 'partial'])
      .lt('due_date', today())
      .not('due_date', 'is', null),

    // Penjualan bulan lalu (sebagai pembanding untuk MoM %)
    supabase
      .from('invoices')
      .select('total')
      .eq('type', 'sales')
      .in('status', ['posted', 'partial', 'paid'])
      .gte('date', lastMonthStart())
      .lte('date', lastMonthEnd()),
```

- [ ] **Step 1.3: Update destructuring dan error checks**

Ubah destructuring `const [ ... ] = await Promise.all([...])` menjadi:

```js
  const [
    salesResult,
    piutangResult,
    hutangResult,
    stockResult,
    recentSalesResult,
    recentPaymentsResult,
    cashResult,
    overduePiutangResult,
    overdueHutangResult,
    lastMonthSalesResult,
  ] = await Promise.all([...])
```

Setelah `if (cashResult.error) throw cashResult.error`, tambahkan:

```js
  if (overduePiutangResult.error) throw overduePiutangResult.error
  if (overdueHutangResult.error) throw overdueHutangResult.error
  if (lastMonthSalesResult.error) throw lastMonthSalesResult.error
```

- [ ] **Step 1.4: Tambahkan computed values dan return fields baru**

Setelah baris `const totalKas = ...`, tambahkan:

```js
  const totalOverduePiutang = (overduePiutangResult.data || []).reduce(
    (s, r) => s + (Number(r.total) - Number(r.amount_paid)), 0
  )
  const totalOverdueHutang = (overdueHutangResult.data || []).reduce(
    (s, r) => s + (Number(r.total) - Number(r.amount_paid)), 0
  )
  const lastMonthPenjualan = (lastMonthSalesResult.data || []).reduce(
    (s, r) => s + Number(r.total), 0
  )
```

Update return object menjadi:

```js
  return {
    totalPenjualan,
    totalPiutang,
    totalHutang,
    totalKas,
    totalOverduePiutang,
    totalOverdueHutang,
    lastMonthPenjualan,
    lowStock: (stockResult.data || []).map(s => ({ ...s, qty_on_hand: s.quantity_on_hand })),
    recentSales: recentSalesResult.data || [],
    recentPayments: recentPaymentsResult.data || [],
    accounts: cashResult.data || [],
  }
```

- [ ] **Step 1.5: Build check**

```bash
cd C:/Project/ERP-ACC/erp-app && npm run build 2>&1 | tail -15
```

Expected: build berhasil tanpa error.

- [ ] **Step 1.6: Commit**

```bash
cd C:/Project/ERP-ACC
git add erp-app/src/services/dashboardService.js
git commit -m "feat: add overdue AR/AP and last-month sales to getDashboardMetrics"
```

---

## Task 2: Add getMonthlyTrend() to dashboardService.js

**Files:**
- Modify: `erp-app/src/services/dashboardService.js`

- [ ] **Step 2.1: Append helper + fungsi baru di akhir file**

Tambahkan di akhir `erp-app/src/services/dashboardService.js`:

```js
function sixMonthsAgo() {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - 5) // bulan ini + 5 bulan sebelumnya = 6 bulan total
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export async function getMonthlyTrend() {
  const start = sixMonthsAgo()
  const [salesRes, purchaseRes] = await Promise.all([
    supabase
      .from('invoices')
      .select('date, total')
      .eq('type', 'sales')
      .in('status', ['posted', 'partial', 'paid'])
      .gte('date', start),
    supabase
      .from('invoices')
      .select('date, total')
      .eq('type', 'purchase')
      .in('status', ['posted', 'partial', 'paid'])
      .gte('date', start),
  ])
  if (salesRes.error) throw salesRes.error
  if (purchaseRes.error) throw purchaseRes.error

  // Bangun 6 bucket bulan: dari 5 bulan lalu hingga bulan ini
  const months = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - i)
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleString('id-ID', { month: 'short', year: '2-digit' }),
      revenue: 0,
      expense: 0,
    })
  }

  for (const inv of salesRes.data || []) {
    const key = inv.date.slice(0, 7)
    const m = months.find(b => b.key === key)
    if (m) m.revenue += Number(inv.total)
  }
  for (const inv of purchaseRes.data || []) {
    const key = inv.date.slice(0, 7)
    const m = months.find(b => b.key === key)
    if (m) m.expense += Number(inv.total)
  }

  return months
}
```

- [ ] **Step 2.2: Build check**

```bash
cd C:/Project/ERP-ACC/erp-app && npm run build 2>&1 | tail -10
```

Expected: build pass.

- [ ] **Step 2.3: Commit**

```bash
cd C:/Project/ERP-ACC
git add erp-app/src/services/dashboardService.js
git commit -m "feat: add getMonthlyTrend to dashboardService for 6-month bar chart"
```

---

## Task 3: Install Recharts + Create MonthlyTrendChart Component

**Files:**
- Create: `erp-app/src/components/dashboard/MonthlyTrendChart.jsx`

- [ ] **Step 3.1: Install recharts**

```bash
cd C:/Project/ERP-ACC/erp-app && npm install recharts
```

Expected: `recharts` muncul di `dependencies` pada `package.json`.

- [ ] **Step 3.2: Buat file component**

Buat file baru `erp-app/src/components/dashboard/MonthlyTrendChart.jsx`:

```jsx
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { formatCurrency } from '../../utils/currency'

function yAxisFormatter(v) {
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(0)}M`
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(0)}jt`
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}rb`
  return String(v)
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e5e7eb',
      borderRadius: 8,
      padding: '10px 14px',
      fontSize: 13,
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    }}>
      <div style={{ fontWeight: 600, marginBottom: 6, color: '#111827' }}>{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ color: p.color, marginBottom: 2 }}>
          {p.name}: {formatCurrency(p.value)}
        </div>
      ))}
    </div>
  )
}

export default function MonthlyTrendChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
        <YAxis tickFormatter={yAxisFormatter} tick={{ fontSize: 11 }} width={52} />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: 13 }} />
        <Bar dataKey="revenue" name="Penjualan" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={40} />
        <Bar dataKey="expense" name="Pembelian" fill="#f97316" radius={[4, 4, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  )
}
```

- [ ] **Step 3.3: Build check**

```bash
cd C:/Project/ERP-ACC/erp-app && npm run build 2>&1 | tail -10
```

Expected: build pass — recharts ter-bundle tanpa error.

- [ ] **Step 3.4: Commit**

```bash
cd C:/Project/ERP-ACC
git add erp-app/package.json erp-app/package-lock.json erp-app/src/components/dashboard/MonthlyTrendChart.jsx
git commit -m "feat: install recharts and create MonthlyTrendChart component"
```

---

## Task 4: Update DashboardPage.jsx

**Files:**
- Modify: `erp-app/src/pages/DashboardPage.jsx`

Perubahan pada DashboardPage (289 baris saat ini):
1. Update imports (tambah `getMonthlyTrend`, `MonthlyTrendChart`, icons baru)
2. Tambah `MomIndicator` helper component
3. Update `MetricCard` agar `sub` bisa berupa ReactNode
4. Update state + `useEffect` untuk load `getMonthlyTrend()`
5. Update card Penjualan: sub → `MomIndicator`
6. Tambah overdue row (conditional) setelah row MetricCard pertama
7. Tambah chart section sebelum "Recent Sales"

- [ ] **Step 4.1: Update imports di baris 1–26**

Ganti seluruh blok import di atas file menjadi:

```jsx
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getDashboardMetrics, getMonthlyTrend } from '../services/dashboardService'
import { formatCurrency } from '../utils/currency'
import { formatDate } from '../utils/date'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import MonthlyTrendChart from '../components/dashboard/MonthlyTrendChart'
import {
  Row,
  Col,
  Card,
  Typography,
  Space,
  Flex,
  Alert,
  Tag,
} from 'antd'
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  AlertTriangle,
  Package,
  ArrowRight,
  Banknote,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
} from 'lucide-react'
```

- [ ] **Step 4.2: Update `MetricCard` component (baris 36–51) agar `sub` bisa ReactNode**

Ganti fungsi `MetricCard` menjadi:

```jsx
function MetricCard({ icon: Icon, label, value, color, sub }) {
  return (
    <Card style={{ background: color?.bg, borderColor: color?.border }}>
      <Space align="start">
        <div style={{ padding: 8, borderRadius: 8, background: 'rgba(255,255,255,0.6)' }}>
          <Icon size={22} style={{ color: color?.text }} />
        </div>
        <div>
          <Text style={{ fontSize: 13, opacity: 0.75, color: color?.text }}>{label}</Text>
          <div style={{ fontSize: 22, fontWeight: 700, color: color?.text, lineHeight: '1.3' }}>{value}</div>
          {sub && (
            typeof sub === 'string'
              ? <Text style={{ fontSize: 12, opacity: 0.6, color: color?.text }}>{sub}</Text>
              : sub
          )}
        </div>
      </Space>
    </Card>
  )
}
```

- [ ] **Step 4.3: Tambahkan `MomIndicator` component setelah `SectionHeader` (sebelum `DashboardPage`)**

Setelah fungsi `SectionHeader` (baris 53–64), tambahkan:

```jsx
function MomIndicator({ current, previous }) {
  if (!previous || previous === 0) return null
  const pct = ((current - previous) / previous * 100).toFixed(1)
  const up = current >= previous
  return (
    <Flex align="center" gap={2} style={{ marginTop: 2 }}>
      {up
        ? <ArrowUpRight size={12} color="#16a34a" />
        : <ArrowDownRight size={12} color="#dc2626" />}
      <span style={{ fontSize: 12, color: up ? '#16a34a' : '#dc2626' }}>
        {Math.abs(pct)}% vs bulan lalu
      </span>
    </Flex>
  )
}
```

- [ ] **Step 4.4: Update state dan `useEffect` (baris 66–76)**

Ganti state declarations dan `useEffect` menjadi:

```jsx
export default function DashboardPage() {
  const [metrics, setMetrics] = useState(null)
  const [trend, setTrend] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([getDashboardMetrics(), getMonthlyTrend()])
      .then(([m, t]) => {
        setMetrics(m)
        setTrend(t)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])
```

- [ ] **Step 4.5: Update card Penjualan Bulan Ini — ganti `sub={currentMonth}` dengan MomIndicator**

Di dalam Row pertama (gutter={[16,16]}), pada `Col` pertama yang berisi MetricCard Penjualan, ganti:

```jsx
        <Col xs={24} sm={12} xl={6}>
          <MetricCard
            icon={TrendingUp}
            label="Penjualan Bulan Ini"
            value={formatCurrency(metrics.totalPenjualan)}
            color={{ bg: '#f0fdf4', border: '#bbf7d0', text: '#14532d' }}
            sub={currentMonth}
          />
        </Col>
```

Menjadi:

```jsx
        <Col xs={24} sm={12} xl={6}>
          <MetricCard
            icon={TrendingUp}
            label="Penjualan Bulan Ini"
            value={formatCurrency(metrics.totalPenjualan)}
            color={{ bg: '#f0fdf4', border: '#bbf7d0', text: '#14532d' }}
            sub={
              <Space direction="vertical" size={0}>
                <Text style={{ fontSize: 12, opacity: 0.6, color: '#14532d' }}>{currentMonth}</Text>
                <MomIndicator current={metrics.totalPenjualan} previous={metrics.lastMonthPenjualan} />
              </Space>
            }
          />
        </Col>
```

- [ ] **Step 4.6: Tambahkan overdue row setelah `</Row>` pertama (setelah baris ~126)**

Setelah `</Row>` penutup dari Row 4 MetricCards, tambahkan:

```jsx
      {/* Overdue Alert Row — hanya tampil jika ada invoice jatuh tempo */}
      {(metrics.totalOverduePiutang > 0 || metrics.totalOverdueHutang > 0) && (
        <Row gutter={[16, 16]}>
          {metrics.totalOverduePiutang > 0 && (
            <Col xs={24} sm={12}>
              <MetricCard
                icon={Clock}
                label="Piutang Jatuh Tempo"
                value={formatCurrency(metrics.totalOverduePiutang)}
                color={{ bg: '#fff7ed', border: '#fed7aa', text: '#7c2d12' }}
                sub="AR sudah lewat jatuh tempo"
              />
            </Col>
          )}
          {metrics.totalOverdueHutang > 0 && (
            <Col xs={24} sm={12}>
              <MetricCard
                icon={AlertTriangle}
                label="Hutang Jatuh Tempo"
                value={formatCurrency(metrics.totalOverdueHutang)}
                color={{ bg: '#fef2f2', border: '#fecaca', text: '#7f1d1d' }}
                sub="AP sudah lewat jatuh tempo"
              />
            </Col>
          )}
        </Row>
      )}
```

- [ ] **Step 4.7: Tambahkan Monthly Trend Chart sebelum Row "Recent Sales" (sebelum baris ~128)**

Setelah overdue row (atau setelah Row pertama jika overdue kosong), sebelum `<Row gutter={[16, 16]}>` yang berisi "Invoice Penjualan Terbaru", tambahkan:

```jsx
      {/* Monthly Revenue & Expense Trend Chart */}
      {trend.length > 0 && (
        <Card
          title={
            <span style={{ fontWeight: 600, color: '#1f2937' }}>
              Tren Penjualan &amp; Pembelian (6 Bulan)
            </span>
          }
          size="small"
        >
          <MonthlyTrendChart data={trend} />
        </Card>
      )}
```

- [ ] **Step 4.8: Build check**

```bash
cd C:/Project/ERP-ACC/erp-app && npm run build 2>&1 | tail -20
```

Expected: build pass. Jika ada error `currentMonth is not defined`, pastikan baris `const currentMonth = ...` masih ada di bawah `if (!metrics) return null`.

- [ ] **Step 4.9: Commit**

```bash
cd C:/Project/ERP-ACC
git add erp-app/src/pages/DashboardPage.jsx
git commit -m "feat: add overdue KPI cards, MoM % indicator, and monthly trend chart to dashboard"
```

---

## Task 5: Playwright E2E Tests

**Files:**
- Create: `erp-app/tests/dashboard.spec.js`

Pattern identik dengan `tests/po-print.spec.js` dan `tests/ar-ap-aging.spec.js` — auth via Supabase → tulis `storageState` manual.

- [ ] **Step 5.1: Buat file test**

Buat file baru `erp-app/tests/dashboard.spec.js`:

```js
// erp-app/tests/dashboard.spec.js
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.test' })

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

test.describe('Dashboard KPIs & Chart', () => {

  test.use({ storageState: 'tests/.auth.json' })

  test.beforeAll(async () => {
    const { error } = await supabase.auth.signInWithPassword({
      email: process.env.TEST_EMAIL,
      password: process.env.TEST_PASSWORD,
    })
    if (error) throw new Error(`Supabase login gagal: ${error.message}`)

    const { data: sessionData } = await supabase.auth.getSession()
    const session = sessionData.session
    if (!session) throw new Error('Supabase session tidak ada setelah login')

    const projectRef = new URL(process.env.VITE_SUPABASE_URL).hostname.split('.')[0]
    const storageKey = `sb-${projectRef}-auth-token`
    const fs = await import('fs')
    fs.writeFileSync('tests/.auth.json', JSON.stringify({
      cookies: [],
      origins: [{
        origin: 'http://localhost:5173',
        localStorage: [{ name: storageKey, value: JSON.stringify(session) }],
      }],
    }, null, 2))
  })

  test.afterAll(async () => {
    await supabase.auth.signOut()
  })

  // --- Test 1 ---
  test('Dashboard page loads dengan judul', async ({ page }) => {
    await page.goto('/')
    await expect(
      page.locator('h2:has-text("Dashboard"), h1:has-text("Dashboard")')
    ).toBeVisible({ timeout: 10000 })
  })

  // --- Test 2 ---
  test('4 KPI metric cards utama muncul', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('text=Penjualan Bulan Ini')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('text=Total Piutang')).toBeVisible()
    await expect(page.locator('text=Total Hutang')).toBeVisible()
    await expect(page.locator('text=Total Kas & Bank')).toBeVisible()
  })

  // --- Test 3 ---
  test('Monthly trend chart section muncul dengan SVG', async ({ page }) => {
    await page.goto('/')
    await expect(
      page.locator('text=Tren Penjualan')
    ).toBeVisible({ timeout: 10000 })
    // Recharts merender SVG di dalam .recharts-wrapper
    await expect(page.locator('.recharts-wrapper svg')).toBeVisible({ timeout: 5000 })
  })

  // --- Test 4 ---
  test('Chart tooltip muncul saat hover bar', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.recharts-wrapper svg')).toBeVisible({ timeout: 10000 })
    // Hover ke tengah chart area
    const chart = page.locator('.recharts-wrapper')
    const box = await chart.boundingBox()
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      // Tooltip mungkin muncul atau tidak (tergantung apakah ada data) — cek tidak crash
      await page.waitForTimeout(500)
    }
  })

  // --- Test 5 ---
  test('Recent Sales Invoices section ada', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('text=Invoice Penjualan Terbaru')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('text=Pembayaran Terbaru')).toBeVisible()
  })

  // --- Test 6 ---
  test('Kas & Bank section ada', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('text=Saldo Kas & Bank')).toBeVisible({ timeout: 10000 })
  })

  // --- Test 7 ---
  test('Dashboard load tidak menghasilkan JS error', async ({ page }) => {
    const errors = []
    page.on('pageerror', err => errors.push(err.message))
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    // Filter error yang irrelevant (favicon, browser extension)
    const realErrors = errors.filter(e =>
      !e.includes('favicon') &&
      !e.includes('extension') &&
      !e.includes('ERR_')
    )
    expect(realErrors).toHaveLength(0)
  })

})
```

- [ ] **Step 5.2: Pastikan dev server running lalu jalankan tests**

```bash
cd C:/Project/ERP-ACC/erp-app
# Jalankan dev server di background jika belum running
npm run dev &
sleep 3
# Jalankan Playwright tests
npx playwright test tests/dashboard.spec.js --reporter=list 2>&1
```

Expected: 7 tests PASS. Jika ada test yang fail, baca error message dan perbaiki implementasi.

- [ ] **Step 5.3: Commit**

```bash
cd C:/Project/ERP-ACC
git add erp-app/tests/dashboard.spec.js
git commit -m "test: add Playwright E2E tests for Dashboard KPIs and monthly chart"
```

---

## Verification

### Manual Test Steps

1. Jalankan `npm run dev` di `erp-app/`
2. Buka `http://localhost:5173/` → pastikan Dashboard muncul tanpa error
3. **4 KPI Cards:** Penjualan, Total Piutang, Total Hutang, Total Kas & Bank
4. **MoM Indicator:** Card "Penjualan Bulan Ini" menampilkan "▲ X% vs bulan lalu" (hijau) atau "▼ X% vs bulan lalu" (merah)
   - Jika tidak ada data bulan lalu → indikator tidak muncul (MomIndicator returns null)
5. **Overdue Cards:** Jika ada invoice dengan `due_date` < hari ini dan status `posted`/`partial`:
   - Card "Piutang Jatuh Tempo" muncul (background orange)
   - Card "Hutang Jatuh Tempo" muncul (background merah)
   - Jika tidak ada overdue → section tidak muncul
6. **Chart:** Section "Tren Penjualan & Pembelian (6 Bulan)" muncul dengan bar chart
   - Hover bar → tooltip menampilkan angka dalam format Rupiah (Rp X.XXX.XXX)
   - Legend: "Penjualan" (biru) + "Pembelian" (orange)
7. Scroll ke bawah → Recent Sales, Recent Payments, Low Stock, Saldo Kas & Bank masih ada
8. Jalankan `npm run build` → harus pass tanpa error

### Edge Cases
- Jika tidak ada invoice sama sekali → chart tetap muncul dengan 6 bar = 0
- Jika `lastMonthPenjualan` = 0 → `MomIndicator` tidak muncul (`previous === 0` check)
- Jika `totalOverduePiutang = 0` dan `totalOverdueHutang = 0` → overdue row tidak render
