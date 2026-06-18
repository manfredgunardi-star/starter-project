# Sortir Kolom Penjualan & Pembelian — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambahkan sortir kolom (klik header) ke 9 halaman list Penjualan & Pembelian di erp-acc, default tanggal terbaru di atas.

**Architecture:** Sortir dilakukan sepenuhnya di client menggunakan hook `useSortableData` yang menerima data hasil filter dan mengembalikan data terurut. Komponen presentasional `SortableHeader` menggantikan `<th>` statis dengan ikon arah sortir. Comparator murni di `sort.js` menangani tipe date/number/string, termasuk nilai null.

**Tech Stack:** React 18, Vite, Lucide React (ChevronUp/ChevronDown/ChevronsUpDown)

---

## File Map

| Status | Path | Tanggung Jawab |
|---|---|---|
| CREATE | `src/utils/sort.js` | Comparator murni untuk date/number/string |
| CREATE | `src/hooks/useSortableData.js` | Hook sortir generik (state + sorted array) |
| CREATE | `src/components/ui/SortableHeader.jsx` | `<th>` presentasional dengan ikon sortir |
| MODIFY | `src/pages/sales/SalesOrdersPage.jsx` | Tambah sortir (pilot) |
| MODIFY | `src/pages/sales/GoodsDeliveriesPage.jsx` | Tambah sortir |
| MODIFY | `src/pages/sales/SalesInvoicesPage.jsx` | Tambah sortir |
| MODIFY | `src/pages/sales/ProformaInvoicesPage.jsx` | Tambah sortir |
| MODIFY | `src/pages/sales/SalesReturnsPage.jsx` | Tambah sortir |
| MODIFY | `src/pages/purchase/PurchaseOrdersPage.jsx` | Tambah sortir |
| MODIFY | `src/pages/purchase/GoodsReceiptsPage.jsx` | Tambah sortir |
| MODIFY | `src/pages/purchase/PurchaseInvoicesPage.jsx` | Tambah sortir |
| MODIFY | `src/pages/purchase/PurchaseReturnsPage.jsx` | Tambah sortir |

---

## Task 1: Pure comparator + useSortableData hook

**Files:**
- Create: `apps/erp-acc/erp-app/src/utils/sort.js`
- Create: `apps/erp-acc/erp-app/src/hooks/useSortableData.js`

- [ ] **Step 1: Buat `src/utils/sort.js`**

```js
export function compareValues(a, b, type) {
  const aNull = a == null || a === ''
  const bNull = b == null || b === ''
  if (aNull && bNull) return 0
  if (aNull) return 1
  if (bNull) return -1

  if (type === 'date') {
    return new Date(a) - new Date(b)
  }
  if (type === 'number') {
    return Number(a) - Number(b)
  }
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}
```

- [ ] **Step 2: Buat `src/hooks/useSortableData.js`**

```js
import { useState, useMemo } from 'react'
import { compareValues } from '../utils/sort'

export function useSortableData(data, sortConfig, defaultSort = { key: 'date', direction: 'desc' }) {
  const [sortKey, setSortKey] = useState(defaultSort.key)
  const [sortDirection, setSortDirection] = useState(defaultSort.direction)

  function requestSort(key) {
    if (key === sortKey) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDirection(key === 'date' ? 'desc' : 'asc')
    }
  }

  const sorted = useMemo(() => {
    const config = sortConfig[sortKey]
    if (!config) return data
    return [...data].sort((a, b) => {
      const cmp = compareValues(config.accessor(a), config.accessor(b), config.type)
      return sortDirection === 'asc' ? cmp : -cmp
    })
  }, [data, sortKey, sortDirection, sortConfig])

  return { sorted, sortKey, sortDirection, requestSort }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/erp-acc/erp-app/src/utils/sort.js apps/erp-acc/erp-app/src/hooks/useSortableData.js
git commit -m "feat: add sort comparator and useSortableData hook"
```

---

## Task 2: SortableHeader component

**Files:**
- Create: `apps/erp-acc/erp-app/src/components/ui/SortableHeader.jsx`

- [ ] **Step 1: Buat `src/components/ui/SortableHeader.jsx`**

```jsx
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'

export default function SortableHeader({ label, sortKey, activeKey, direction, onSort, align = 'left' }) {
  const isActive = sortKey === activeKey
  return (
    <th
      onClick={() => onSort(sortKey)}
      style={{
        padding: '12px 24px',
        textAlign: align,
        fontSize: 14,
        fontWeight: 500,
        cursor: 'pointer',
        userSelect: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {label}{' '}
      {isActive
        ? direction === 'asc'
          ? <ChevronUp size={14} style={{ verticalAlign: 'middle', color: '#3b82f6' }} />
          : <ChevronDown size={14} style={{ verticalAlign: 'middle', color: '#3b82f6' }} />
        : <ChevronsUpDown size={14} style={{ verticalAlign: 'middle', color: '#9ca3af' }} />
      }
    </th>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/erp-acc/erp-app/src/components/ui/SortableHeader.jsx
git commit -m "feat: add SortableHeader th component with sort icon"
```

---

## Task 3: Integrasi SalesOrdersPage (pilot)

**Files:**
- Modify: `apps/erp-acc/erp-app/src/pages/sales/SalesOrdersPage.jsx`

- [ ] **Step 1: Tulis ulang `SalesOrdersPage.jsx`**

File lengkap setelah modifikasi:

```jsx
import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Space, Flex, Typography } from 'antd'
import { useSalesOrders } from '../../hooks/useSales'
import { useAuth } from '../../contexts/AuthContext'
import { formatCurrency } from '../../utils/currency'
import { formatDate } from '../../utils/date'
import Button from '../../components/ui/Button'
import StatusBadge from '../../components/ui/StatusBadge'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import SortableHeader from '../../components/ui/SortableHeader'
import { useSortableData } from '../../hooks/useSortableData'
import { Plus, Search } from 'lucide-react'

const SORT_CONFIG = {
  number: { accessor: o => o.so_number,      type: 'string' },
  date:   { accessor: o => o.date,           type: 'date'   },
  party:  { accessor: o => o.customer?.name, type: 'string' },
  total:  { accessor: o => o.total,          type: 'number' },
}
const DEFAULT_SORT = { key: 'date', direction: 'desc' }

export default function SalesOrdersPage() {
  const navigate = useNavigate()
  const { canWrite } = useAuth()
  const { orders, loading, error } = useSalesOrders()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const filtered = useMemo(() => {
    return orders.filter(o => {
      const matchSearch = !search ||
        o.so_number?.toLowerCase().includes(search.toLowerCase()) ||
        o.customer?.name?.toLowerCase().includes(search.toLowerCase())
      const matchStatus = !statusFilter || o.status === statusFilter
      return matchSearch && matchStatus
    })
  }, [orders, search, statusFilter])

  const { sorted, sortKey, sortDirection, requestSort } = useSortableData(filtered, SORT_CONFIG, DEFAULT_SORT)

  if (loading) return <LoadingSpinner message="Memuat sales orders..." />
  if (error) return <Typography.Text type="danger">{error}</Typography.Text>

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={24}>
      <Flex justify="space-between" align="center">
        <Typography.Title level={3} style={{ margin: 0 }}>Sales Order</Typography.Title>
        {canWrite && (
          <Button variant="primary" onClick={() => navigate('/sales/orders/new')}>
            <Plus size={20} /> Buat SO
          </Button>
        )}
      </Flex>

      <Space>
        <div style={{ position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari no. SO atau customer..."
            style={{ width: 280, paddingLeft: 36, paddingRight: 12, paddingTop: 8, paddingBottom: 8, border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14 }}
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 12px', fontSize: 14 }}
        >
          <option value="">Semua Status</option>
          <option value="draft">Draft</option>
          <option value="confirmed">Confirmed</option>
          <option value="invoiced">Invoiced</option>
          <option value="done">Done</option>
          <option value="closed">Closed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </Space>

      <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: '#f3f4f6', borderBottom: '1px solid #e5e7eb' }}>
            <tr>
              <SortableHeader label="No. SO" sortKey="number" activeKey={sortKey} direction={sortDirection} onSort={requestSort} />
              <SortableHeader label="Tanggal" sortKey="date" activeKey={sortKey} direction={sortDirection} onSort={requestSort} />
              <SortableHeader label="Customer" sortKey="party" activeKey={sortKey} direction={sortDirection} onSort={requestSort} />
              <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>Status</th>
              <SortableHeader label="Total" sortKey="total" activeKey={sortKey} direction={sortDirection} onSort={requestSort} align="right" />
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '32px 24px', textAlign: 'center', fontSize: 14, color: '#6b7280' }}>
                  Belum ada sales order
                </td>
              </tr>
            ) : (
              sorted.map(order => (
                <tr
                  key={order.id}
                  onClick={() => navigate(`/sales/orders/${order.id}`)}
                  style={{ borderBottom: '1px solid #e5e7eb', cursor: 'pointer' }}
                >
                  <td style={{ padding: '12px 24px', fontSize: 14, fontFamily: 'monospace' }}>{order.so_number}</td>
                  <td style={{ padding: '12px 24px', fontSize: 14 }}>{formatDate(order.date)}</td>
                  <td style={{ padding: '12px 24px', fontSize: 14 }}>{order.customer?.name || '—'}</td>
                  <td style={{ padding: '12px 24px', fontSize: 14 }}><StatusBadge status={order.status} /></td>
                  <td style={{ padding: '12px 24px', fontSize: 14, textAlign: 'right', fontWeight: 500 }}>{formatCurrency(order.total)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Space>
  )
}
```

- [ ] **Step 2: Verifikasi build lulus**

```bash
cd apps/erp-acc/erp-app && npm run build
```

Expected: Build sukses tanpa error.

- [ ] **Step 3: Commit**

```bash
git add apps/erp-acc/erp-app/src/pages/sales/SalesOrdersPage.jsx
git commit -m "feat(sales): add sortable columns to SalesOrdersPage"
```

---

## Task 4: Integrasi 4 halaman Penjualan tersisa

**Files:**
- Modify: `apps/erp-acc/erp-app/src/pages/sales/GoodsDeliveriesPage.jsx`
- Modify: `apps/erp-acc/erp-app/src/pages/sales/SalesInvoicesPage.jsx`
- Modify: `apps/erp-acc/erp-app/src/pages/sales/ProformaInvoicesPage.jsx`
- Modify: `apps/erp-acc/erp-app/src/pages/sales/SalesReturnsPage.jsx`

### GoodsDeliveriesPage

Kolom sortir: No. GD (string), Tanggal (date), Customer (string). Tidak ada Total.

- [ ] **Step 1: Modifikasi `GoodsDeliveriesPage.jsx`**

Tambahkan 3 import berikut di baris akhir blok import yang ada:
```jsx
import SortableHeader from '../../components/ui/SortableHeader'
import { useSortableData } from '../../hooks/useSortableData'
```

Tambahkan konstanta sebelum `export default function GoodsDeliveriesPage()`:
```js
const SORT_CONFIG = {
  number: { accessor: d => d.gd_number,       type: 'string' },
  date:   { accessor: d => d.date,            type: 'date'   },
  party:  { accessor: d => d.customer?.name,  type: 'string' },
}
const DEFAULT_SORT = { key: 'date', direction: 'desc' }
```

Tambahkan setelah `const filtered = useMemo(...)`:
```js
const { sorted, sortKey, sortDirection, requestSort } = useSortableData(filtered, SORT_CONFIG, DEFAULT_SORT)
```

Ganti `<thead>` menjadi:
```jsx
<thead style={{ background: '#f3f4f6', borderBottom: '1px solid #e5e7eb' }}>
  <tr>
    <SortableHeader label="No. GD" sortKey="number" activeKey={sortKey} direction={sortDirection} onSort={requestSort} />
    <SortableHeader label="Tanggal" sortKey="date" activeKey={sortKey} direction={sortDirection} onSort={requestSort} />
    <SortableHeader label="Customer" sortKey="party" activeKey={sortKey} direction={sortDirection} onSort={requestSort} />
    <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>Ref. SO</th>
    <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>Status</th>
  </tr>
</thead>
```

Ganti `filtered.map(d =>` menjadi `sorted.map(d =>`, dan `filtered.length === 0` menjadi `sorted.length === 0`.

### SalesInvoicesPage

Kolom sortir: No. Invoice (string), Tanggal (date), Customer (string), Total (number). Jatuh Tempo, Status, Dibayar, Aksi tidak disortir.

- [ ] **Step 2: Modifikasi `SalesInvoicesPage.jsx`**

Tambahkan import setelah import yang ada:
```jsx
import SortableHeader from '../../components/ui/SortableHeader'
import { useSortableData } from '../../hooks/useSortableData'
```

Tambahkan konstanta sebelum `export default function SalesInvoicesPage()`:
```js
const SORT_CONFIG = {
  number: { accessor: inv => inv.invoice_number,  type: 'string' },
  date:   { accessor: inv => inv.date,            type: 'date'   },
  party:  { accessor: inv => inv.customer?.name,  type: 'string' },
  total:  { accessor: inv => inv.total,           type: 'number' },
}
const DEFAULT_SORT = { key: 'date', direction: 'desc' }
```

Tambahkan setelah `const filtered = useMemo(...)`:
```js
const { sorted, sortKey, sortDirection, requestSort } = useSortableData(filtered, SORT_CONFIG, DEFAULT_SORT)
```

Ganti `<thead>` menjadi:
```jsx
<thead style={{ background: '#f3f4f6', borderBottom: '1px solid #e5e7eb' }}>
  <tr>
    <SortableHeader label="No. Invoice" sortKey="number" activeKey={sortKey} direction={sortDirection} onSort={requestSort} />
    <SortableHeader label="Tanggal" sortKey="date" activeKey={sortKey} direction={sortDirection} onSort={requestSort} />
    <SortableHeader label="Customer" sortKey="party" activeKey={sortKey} direction={sortDirection} onSort={requestSort} />
    <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>Jatuh Tempo</th>
    <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>Status</th>
    <SortableHeader label="Total" sortKey="total" activeKey={sortKey} direction={sortDirection} onSort={requestSort} align="right" />
    <th style={{ padding: '12px 24px', textAlign: 'right', fontSize: 14, fontWeight: 500 }}>Dibayar</th>
    <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: 14, fontWeight: 500 }}>Aksi</th>
  </tr>
</thead>
```

Ganti `filtered.map(inv =>` menjadi `sorted.map(inv =>`, dan `filtered.length === 0` menjadi `sorted.length === 0`.

### ProformaInvoicesPage

Kolom sortir: No. Proforma (string), Tanggal (date), Customer (string), Total (number). Berlaku Hingga dan Aksi tidak disortir.

Catatan: Halaman ini menggunakan `useState`/`useEffect` bukan `useQuery` untuk fetching, tapi `filtered` tetap berupa `useMemo` — hook `useSortableData` bekerja sama persis.

- [ ] **Step 3: Modifikasi `ProformaInvoicesPage.jsx`**

Tambahkan import setelah import yang ada:
```jsx
import SortableHeader from '../../components/ui/SortableHeader'
import { useSortableData } from '../../hooks/useSortableData'
```

Tambahkan konstanta sebelum `export default function ProformaInvoicesPage()`:
```js
const SORT_CONFIG = {
  number: { accessor: p => p.proforma_number,  type: 'string' },
  date:   { accessor: p => p.date,             type: 'date'   },
  party:  { accessor: p => p.customer?.name,   type: 'string' },
  total:  { accessor: p => p.total,            type: 'number' },
}
const DEFAULT_SORT = { key: 'date', direction: 'desc' }
```

Tambahkan setelah `const filtered = useMemo(...)`:
```js
const { sorted, sortKey, sortDirection, requestSort } = useSortableData(filtered, SORT_CONFIG, DEFAULT_SORT)
```

Ganti `<thead>` menjadi:
```jsx
<thead style={{ background: '#f3f4f6', borderBottom: '1px solid #e5e7eb' }}>
  <tr>
    <SortableHeader label="No. Proforma" sortKey="number" activeKey={sortKey} direction={sortDirection} onSort={requestSort} />
    <SortableHeader label="Tanggal" sortKey="date" activeKey={sortKey} direction={sortDirection} onSort={requestSort} />
    <SortableHeader label="Customer" sortKey="party" activeKey={sortKey} direction={sortDirection} onSort={requestSort} />
    <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>Berlaku Hingga</th>
    <SortableHeader label="Total" sortKey="total" activeKey={sortKey} direction={sortDirection} onSort={requestSort} align="right" />
    <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: 14, fontWeight: 500 }}>Aksi</th>
  </tr>
</thead>
```

Ganti `filtered.map(p =>` menjadi `sorted.map(p =>`, dan `filtered.length === 0` menjadi `sorted.length === 0`.

### SalesReturnsPage

Kolom sortir: No. Retur (string), Tanggal (date), Customer (string), Total (number). Ref SO dan Status tidak disortir.

- [ ] **Step 4: Modifikasi `SalesReturnsPage.jsx`**

Tambahkan import setelah import yang ada:
```jsx
import SortableHeader from '../../components/ui/SortableHeader'
import { useSortableData } from '../../hooks/useSortableData'
```

Tambahkan konstanta sebelum `export default function SalesReturnsPage()`:
```js
const SORT_CONFIG = {
  number: { accessor: r => r.sr_number,        type: 'string' },
  date:   { accessor: r => r.date,             type: 'date'   },
  party:  { accessor: r => r.customer?.name,   type: 'string' },
  total:  { accessor: r => r.total,            type: 'number' },
}
const DEFAULT_SORT = { key: 'date', direction: 'desc' }
```

Tambahkan setelah `const filtered = useMemo(...)`:
```js
const { sorted, sortKey, sortDirection, requestSort } = useSortableData(filtered, SORT_CONFIG, DEFAULT_SORT)
```

Ganti `<thead>` menjadi:
```jsx
<thead style={{ background: '#f3f4f6', borderBottom: '1px solid #e5e7eb' }}>
  <tr>
    <SortableHeader label="No. Retur" sortKey="number" activeKey={sortKey} direction={sortDirection} onSort={requestSort} />
    <SortableHeader label="Tanggal" sortKey="date" activeKey={sortKey} direction={sortDirection} onSort={requestSort} />
    <SortableHeader label="Customer" sortKey="party" activeKey={sortKey} direction={sortDirection} onSort={requestSort} />
    <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>Ref SO</th>
    <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>Status</th>
    <SortableHeader label="Total" sortKey="total" activeKey={sortKey} direction={sortDirection} onSort={requestSort} align="right" />
  </tr>
</thead>
```

Ganti `filtered.map(r =>` menjadi `sorted.map(r =>`, dan `filtered.length === 0` menjadi `sorted.length === 0`.

- [ ] **Step 5: Verifikasi build lulus**

```bash
cd apps/erp-acc/erp-app && npm run build
```

Expected: Build sukses tanpa error.

- [ ] **Step 6: Commit**

```bash
git add apps/erp-acc/erp-app/src/pages/sales/GoodsDeliveriesPage.jsx \
        apps/erp-acc/erp-app/src/pages/sales/SalesInvoicesPage.jsx \
        apps/erp-acc/erp-app/src/pages/sales/ProformaInvoicesPage.jsx \
        apps/erp-acc/erp-app/src/pages/sales/SalesReturnsPage.jsx
git commit -m "feat(sales): add sortable columns to remaining sales list pages"
```

---

## Task 5: Integrasi 4 halaman Pembelian

**Files:**
- Modify: `apps/erp-acc/erp-app/src/pages/purchase/PurchaseOrdersPage.jsx`
- Modify: `apps/erp-acc/erp-app/src/pages/purchase/GoodsReceiptsPage.jsx`
- Modify: `apps/erp-acc/erp-app/src/pages/purchase/PurchaseInvoicesPage.jsx`
- Modify: `apps/erp-acc/erp-app/src/pages/purchase/PurchaseReturnsPage.jsx`

### PurchaseOrdersPage

Kolom sortir: No. PO (string), Tanggal (date), Supplier (string), Total (number). Status dan Aksi tidak disortir.

- [ ] **Step 1: Modifikasi `PurchaseOrdersPage.jsx`**

Tambahkan import setelah import yang ada:
```jsx
import SortableHeader from '../../components/ui/SortableHeader'
import { useSortableData } from '../../hooks/useSortableData'
```

Tambahkan konstanta sebelum `export default function PurchaseOrdersPage()`:
```js
const SORT_CONFIG = {
  number: { accessor: po => po.po_number,       type: 'string' },
  date:   { accessor: po => po.date,            type: 'date'   },
  party:  { accessor: po => po.supplier?.name,  type: 'string' },
  total:  { accessor: po => po.total,           type: 'number' },
}
const DEFAULT_SORT = { key: 'date', direction: 'desc' }
```

Tambahkan setelah `const filtered = useMemo(...)`:
```js
const { sorted, sortKey, sortDirection, requestSort } = useSortableData(filtered, SORT_CONFIG, DEFAULT_SORT)
```

Ganti `<thead>` menjadi:
```jsx
<thead style={{ background: '#f3f4f6', borderBottom: '1px solid #e5e7eb' }}>
  <tr>
    <SortableHeader label="No. PO" sortKey="number" activeKey={sortKey} direction={sortDirection} onSort={requestSort} />
    <SortableHeader label="Tanggal" sortKey="date" activeKey={sortKey} direction={sortDirection} onSort={requestSort} />
    <SortableHeader label="Supplier" sortKey="party" activeKey={sortKey} direction={sortDirection} onSort={requestSort} />
    <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>Status</th>
    <SortableHeader label="Total" sortKey="total" activeKey={sortKey} direction={sortDirection} onSort={requestSort} align="right" />
    <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: 14, fontWeight: 500 }}>Aksi</th>
  </tr>
</thead>
```

Ganti `filtered.map(po =>` menjadi `sorted.map(po =>`, dan `filtered.length === 0` menjadi `sorted.length === 0`.

### GoodsReceiptsPage

Kolom sortir: No. GR (string), Tanggal (date), Supplier (string). Tidak ada Total.

- [ ] **Step 2: Modifikasi `GoodsReceiptsPage.jsx`**

Tambahkan import setelah import yang ada:
```jsx
import SortableHeader from '../../components/ui/SortableHeader'
import { useSortableData } from '../../hooks/useSortableData'
```

Tambahkan konstanta sebelum `export default function GoodsReceiptsPage()`:
```js
const SORT_CONFIG = {
  number: { accessor: gr => gr.gr_number,       type: 'string' },
  date:   { accessor: gr => gr.date,            type: 'date'   },
  party:  { accessor: gr => gr.supplier?.name,  type: 'string' },
}
const DEFAULT_SORT = { key: 'date', direction: 'desc' }
```

Tambahkan setelah `const filtered = useMemo(...)`:
```js
const { sorted, sortKey, sortDirection, requestSort } = useSortableData(filtered, SORT_CONFIG, DEFAULT_SORT)
```

Ganti `<thead>` menjadi:
```jsx
<thead style={{ background: '#f3f4f6', borderBottom: '1px solid #e5e7eb' }}>
  <tr>
    <SortableHeader label="No. GR" sortKey="number" activeKey={sortKey} direction={sortDirection} onSort={requestSort} />
    <SortableHeader label="Tanggal" sortKey="date" activeKey={sortKey} direction={sortDirection} onSort={requestSort} />
    <SortableHeader label="Supplier" sortKey="party" activeKey={sortKey} direction={sortDirection} onSort={requestSort} />
    <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>Ref. PO</th>
    <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>Status</th>
  </tr>
</thead>
```

Ganti `filtered.map(gr =>` menjadi `sorted.map(gr =>`, dan `filtered.length === 0` menjadi `sorted.length === 0`.

### PurchaseInvoicesPage

Kolom sortir: No. Invoice (string), Tanggal (date), Supplier (string), Total (number). Jatuh Tempo, Status, Dibayar tidak disortir.

- [ ] **Step 3: Modifikasi `PurchaseInvoicesPage.jsx`**

Tambahkan import setelah import yang ada:
```jsx
import SortableHeader from '../../components/ui/SortableHeader'
import { useSortableData } from '../../hooks/useSortableData'
```

Tambahkan konstanta sebelum `export default function PurchaseInvoicesPage()` (setelah `const STATUS_COLOR = {...}`):
```js
const SORT_CONFIG = {
  number: { accessor: inv => inv.invoice_number,  type: 'string' },
  date:   { accessor: inv => inv.date,            type: 'date'   },
  party:  { accessor: inv => inv.supplier?.name,  type: 'string' },
  total:  { accessor: inv => inv.total,           type: 'number' },
}
const DEFAULT_SORT = { key: 'date', direction: 'desc' }
```

Tambahkan setelah `const filtered = useMemo(...)`:
```js
const { sorted, sortKey, sortDirection, requestSort } = useSortableData(filtered, SORT_CONFIG, DEFAULT_SORT)
```

Ganti `<thead>` menjadi:
```jsx
<thead style={{ background: '#f3f4f6', borderBottom: '1px solid #e5e7eb' }}>
  <tr>
    <SortableHeader label="No. Invoice" sortKey="number" activeKey={sortKey} direction={sortDirection} onSort={requestSort} />
    <SortableHeader label="Tanggal" sortKey="date" activeKey={sortKey} direction={sortDirection} onSort={requestSort} />
    <SortableHeader label="Supplier" sortKey="party" activeKey={sortKey} direction={sortDirection} onSort={requestSort} />
    <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>Jatuh Tempo</th>
    <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>Status</th>
    <SortableHeader label="Total" sortKey="total" activeKey={sortKey} direction={sortDirection} onSort={requestSort} align="right" />
    <th style={{ padding: '12px 24px', textAlign: 'right', fontSize: 14, fontWeight: 500 }}>Dibayar</th>
  </tr>
</thead>
```

Ganti `filtered.map(inv =>` menjadi `sorted.map(inv =>`, dan `filtered.length === 0` menjadi `sorted.length === 0`.

### PurchaseReturnsPage

Kolom sortir: No. Retur (string), Tanggal (date), Supplier (string), Total (number). Ref PO dan Status tidak disortir.

- [ ] **Step 4: Modifikasi `PurchaseReturnsPage.jsx`**

Tambahkan import setelah import yang ada:
```jsx
import SortableHeader from '../../components/ui/SortableHeader'
import { useSortableData } from '../../hooks/useSortableData'
```

Tambahkan konstanta sebelum `export default function PurchaseReturnsPage()`:
```js
const SORT_CONFIG = {
  number: { accessor: r => r.pr_number,         type: 'string' },
  date:   { accessor: r => r.date,              type: 'date'   },
  party:  { accessor: r => r.supplier?.name,    type: 'string' },
  total:  { accessor: r => r.total,             type: 'number' },
}
const DEFAULT_SORT = { key: 'date', direction: 'desc' }
```

Tambahkan setelah `const filtered = useMemo(...)`:
```js
const { sorted, sortKey, sortDirection, requestSort } = useSortableData(filtered, SORT_CONFIG, DEFAULT_SORT)
```

Ganti `<thead>` menjadi:
```jsx
<thead style={{ background: '#f3f4f6', borderBottom: '1px solid #e5e7eb' }}>
  <tr>
    <SortableHeader label="No. Retur" sortKey="number" activeKey={sortKey} direction={sortDirection} onSort={requestSort} />
    <SortableHeader label="Tanggal" sortKey="date" activeKey={sortKey} direction={sortDirection} onSort={requestSort} />
    <SortableHeader label="Supplier" sortKey="party" activeKey={sortKey} direction={sortDirection} onSort={requestSort} />
    <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>Ref PO</th>
    <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>Status</th>
    <SortableHeader label="Total" sortKey="total" activeKey={sortKey} direction={sortDirection} onSort={requestSort} align="right" />
  </tr>
</thead>
```

Ganti `filtered.map(r =>` menjadi `sorted.map(r =>`, dan `filtered.length === 0` menjadi `sorted.length === 0`.

- [ ] **Step 5: Verifikasi build lulus**

```bash
cd apps/erp-acc/erp-app && npm run build
```

Expected: Build sukses tanpa error.

- [ ] **Step 6: Commit**

```bash
git add apps/erp-acc/erp-app/src/pages/purchase/PurchaseOrdersPage.jsx \
        apps/erp-acc/erp-app/src/pages/purchase/GoodsReceiptsPage.jsx \
        apps/erp-acc/erp-app/src/pages/purchase/PurchaseInvoicesPage.jsx \
        apps/erp-acc/erp-app/src/pages/purchase/PurchaseReturnsPage.jsx
git commit -m "feat(purchase): add sortable columns to all purchase list pages"
```

---

## Task 6: Final build validation

- [ ] **Step 1: Build final untuk konfirmasi keseluruhan**

```bash
cd apps/erp-acc/erp-app && npm run build
```

Expected output:
```
✓ built in X.XXs
dist/index.html
dist/assets/index-XXXX.js
...
```
Build harus selesai tanpa error atau warning yang menyebutkan file yang kita ubah.

- [ ] **Step 2: Catat summary perubahan**

Periksa bahwa semua 11 file telah dimodifikasi/dibuat:
```bash
git log --oneline -6
```

Expected (urutan bisa berbeda):
```
feat(purchase): add sortable columns to all purchase list pages
feat(sales): add sortable columns to remaining sales list pages
feat(sales): add sortable columns to SalesOrdersPage
feat: add SortableHeader th component with sort icon
feat: add sort comparator and useSortableData hook
docs: add sort feature design spec for sales & purchase list pages
```
