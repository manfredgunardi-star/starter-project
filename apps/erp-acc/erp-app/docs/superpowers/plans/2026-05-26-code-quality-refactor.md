# Code Quality Refactor — ERP Pembukuan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Perbaiki bug, eliminasi duplikasi logika, dan tingkatkan performa bundle — tanpa mengubah fungsionalitas apapun.

**Architecture:** Refactor dibagi tiga fase: (1) bug fix + deduplication yang sepenuhnya aman, (2) React performance tanpa perubahan perilaku, (3) perbaikan data integrity via SQL migration yang memindahkan logika dari klien ke server. Setiap task berdiri sendiri dan bisa di-commit independen.

**Tech Stack:** React 19, Vite 8, Ant Design 6, Supabase (PostgreSQL), React Router v7, Playwright (E2E only, no unit test framework)

---

## Model & Effort Allocation

### Claude Sonnet 4.6 (Tasks 1–7)
Cocok untuk JavaScript/React refactoring: membaca konteks codebase yang ada, refactor cross-file, lazy loading. Estimasi: **~3–4 jam total** (Tasks 1–7 bisa dikerjakan sekaligus via subagent-driven-development).

### Codex GPT 5.5/5.4 (Tasks 8–10)
Cocok untuk penulisan SQL migration yang terisolasi dan well-specified. Setiap task Codex memiliki spec SQL yang lengkap di bawah sehingga tidak perlu akses codebase React. Estimasi: **~1–2 jam per task** (termasuk review manusia).

**Keyword untuk melanjutkan setelah Codex selesai:**
- Setelah Task 8 (Codex): ketik **"lanjut task 8 integrasi"**
- Setelah Task 9 (Codex): ketik **"lanjut task 9 integrasi"**  
- Setelah Task 10 (Codex): ketik **"lanjut task 10 integrasi"**

---

## File Map

| File | Aksi | Task |
|---|---|---|
| `src/utils/currency.js` | Modify | 1 |
| `src/components/shared/LineItemsTable.jsx` | Modify | 2 |
| `src/services/dashboardService.js` | Modify | 3 |
| `src/hooks/useQuery.js` | Create | 4 |
| `src/hooks/useMasterData.js` | Modify | 4 |
| `src/hooks/useSales.js` | Modify | 4 |
| `src/hooks/usePurchase.js` | Modify | 4 |
| `src/hooks/useCashBank.js` | Modify | 4 |
| `src/hooks/useInventory.js` | Modify | 4 |
| `src/services/supabaseUtils.js` | Create | 5 |
| `src/services/masterDataService.js` | Modify | 5 |
| `src/App.jsx` | Modify | 6 |
| `src/pages/DashboardPage.jsx` | Modify (loading state) | 6 |
| `migrations/003_dashboard_aggregate_rpc.sql` | Create | 7 (Codex) |
| `src/services/dashboardService.js` | Modify | 7 (integrasi) |
| `migrations/004_fix_save_order_rpc.sql` | Create | 8 (Codex) |
| `src/services/salesService.js` | Modify | 8 (integrasi) |
| `src/services/purchaseService.js` | Modify | 8 (integrasi) |
| `migrations/005_manual_journal_period_check.sql` | Create | 9 (Codex) |
| `src/services/journalService.js` | Modify | 9 (integrasi) |

---

## Task 1: Fix parseCurrency Regex Bug

**Files:**
- Modify: `src/utils/currency.js`

Fungsi `parseCurrency` menggunakan `.replace(',', '.')` yang hanya mengganti **kemunculan pertama** koma. Format Indonesia `1.234,56` (titik = ribuan, koma = desimal) perlu semua titik ribuan dihapus dulu, baru koma desimal diganti titik. Saat ini fungsi ini tidak dipakai luas, tapi kalau dipakai untuk parsing input user bisa salah hitung.

- [ ] **Step 1: Perbaiki implementasi parseCurrency**

Ganti isi `src/utils/currency.js` bagian fungsi `parseCurrency` (baris 16-28):

```js
export function parseCurrency(str) {
  if (typeof str === 'number') return str
  if (str == null) return 0
  const s = String(str).trim()
  if (!s) return 0
  // Format Indonesia: titik = pemisah ribuan, koma = desimal
  // Hapus semua titik ribuan, lalu ubah koma desimal terakhir ke titik
  const cleaned = s
    .replace(/[^0-9,\-]/g, '')  // hapus: Rp, titik ribuan, spasi, dll
    .replace(/,/g, '.')          // semua koma → titik (termasuk desimal)
  // Jika ada lebih dari satu titik, ambil hanya bagian terakhir sebagai desimal
  const parts = cleaned.split('.')
  const normalized = parts.length > 1
    ? parts.slice(0, -1).join('') + '.' + parts[parts.length - 1]
    : cleaned
  const n = parseFloat(normalized)
  return Number.isFinite(n) ? n : 0
}
```

- [ ] **Step 2: Verifikasi build tidak ada error**

```bash
cd apps/erp-acc/erp-app
npm run build
```

Expected: `✓ built in X.Xs` tanpa error.

- [ ] **Step 3: Verifikasi manual parseCurrency di browser console**

Buka dev server (`npm run dev`), buka DevTools Console, jalankan:
```js
// Import tidak bisa langsung — test via copy-paste logika:
const s = "1.234,56"
const cleaned = s.replace(/[^0-9,\-]/g, '').replace(/,/g, '.')
const parts = cleaned.split('.')
const normalized = parts.length > 1 ? parts.slice(0,-1).join('') + '.' + parts[parts.length-1] : cleaned
console.log(parseFloat(normalized)) // harus: 1234.56
```

Expected output: `1234.56`

- [ ] **Step 4: Commit**

```bash
git add apps/erp-acc/erp-app/src/utils/currency.js
git commit -m "fix(erp-acc): parseCurrency regex — replace all commas, not just first"
```

---

## Task 2: Replace Math.random() dengan crypto.randomUUID()

**Files:**
- Modify: `src/components/shared/LineItemsTable.jsx`

`Math.random()` bisa menghasilkan duplikat key di sesi yang sama. `crypto.randomUUID()` tersedia di semua modern browser dan menghasilkan UUID v4 yang collision-safe.

- [ ] **Step 1: Ganti fungsi emptyRow di LineItemsTable.jsx**

Di `src/components/shared/LineItemsTable.jsx`, ganti baris 8-19:

```js
function emptyRow() {
  return {
    _key: crypto.randomUUID(),
    product_id: '',
    unit_id: '',
    quantity: '',
    quantity_base: 0,
    unit_price: '',
    tax_amount: 0,
    total: 0,
  }
}
```

- [ ] **Step 2: Verifikasi build**

```bash
cd apps/erp-acc/erp-app
npm run build
```

Expected: build sukses tanpa error.

- [ ] **Step 3: Verifikasi manual**

`npm run dev`, buka halaman Sales Order baru, tambahkan beberapa baris item. Cek di DevTools React tab bahwa setiap row punya `_key` yang berbeda (format UUID: `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`).

- [ ] **Step 4: Commit**

```bash
git add apps/erp-acc/erp-app/src/components/shared/LineItemsTable.jsx
git commit -m "fix(erp-acc): use crypto.randomUUID() for line item keys instead of Math.random()"
```

---

## Task 3: Deduplicate `today()` — Hapus Definisi Lokal di dashboardService

**Files:**
- Modify: `src/services/dashboardService.js`

`dashboardService.js` mendefinisikan fungsi `today()` sendiri di baris 10-12, padahal `src/utils/date.js` sudah mengekspor `today` yang ekuivalen (menggunakan `date-fns`). Fungsi lokal di dashboardService juga mendefinisikan `monthStart()`, `lastMonthStart()`, `lastMonthEnd()`, dan `sixMonthsAgo()` yang hanya dipakai di file ini — itu boleh tetap lokal karena memang domain-specific.

- [ ] **Step 1: Tambah import dan hapus definisi lokal today()**

Di `src/services/dashboardService.js`:

**Tambah import di baris 1** (sebelum baris yang ada):
```js
import { today } from '../utils/date'
```

**Hapus fungsi lokal `today` (baris 10-13)**:
```js
// HAPUS blok ini:
function today() {
  // Gunakan waktu lokal, bukan UTC — mencegah off-by-one di timezone WIB (UTC+7)
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
```

Catatan: `today()` di `utils/date.js` menggunakan `date-fns` `format(new Date(), 'yyyy-MM-dd')` yang menghasilkan string format sama. Behaviour timezone identik karena `new Date()` keduanya menggunakan waktu lokal.

- [ ] **Step 2: Verifikasi build**

```bash
cd apps/erp-acc/erp-app
npm run build
```

Expected: build sukses.

- [ ] **Step 3: Commit**

```bash
git add apps/erp-acc/erp-app/src/services/dashboardService.js
git commit -m "refactor(erp-acc): remove duplicate today() in dashboardService, use utils/date"
```

---

## Task 4: Extract Generic `useQuery` Hook — Hapus 3 Duplikat

**Files:**
- Create: `src/hooks/useQuery.js`
- Modify: `src/hooks/useMasterData.js`
- Modify: `src/hooks/useSales.js`
- Modify: `src/hooks/usePurchase.js`
- Modify: `src/hooks/useCashBank.js` *(jika ada pattern serupa)*
- Modify: `src/hooks/useInventory.js` *(jika ada pattern serupa)*

Ada tiga implementasi hampir identik dari fetch-list pattern: `useFetchList` di `useMasterData.js`, `useList` di `useSales.js`, dan `useList` di `usePurchase.js`. Perbedaan satu-satunya: saat error, `useSales`/`usePurchase` clear data ke `[]`, sementara `useMasterData` mempertahankan data lama. Kita pertahankan kedua perilaku via opsi `keepDataOnError`.

- [ ] **Step 1: Buat file hooks/useQuery.js**

Buat file baru `src/hooks/useQuery.js`:

```js
import { useState, useEffect, useCallback } from 'react'

/**
 * Generic data-fetching hook.
 * @param {Function} fetcher - async function yang return array
 * @param {object} options
 * @param {boolean} options.keepDataOnError - pertahankan data lama saat refetch gagal (default: false)
 */
export function useQuery(fetcher, { keepDataOnError = false } = {}) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetcher()
      setData(result || [])
    } catch (err) {
      setError(err.message)
      if (!keepDataOnError) setData([])
    } finally {
      setLoading(false)
    }
  }, [fetcher, keepDataOnError])

  useEffect(() => {
    fetch()
  }, [fetch])

  return { data, loading, error, refetch: fetch }
}
```

- [ ] **Step 2: Refactor useMasterData.js**

Ganti seluruh isi `src/hooks/useMasterData.js`:

```js
import { useCallback } from 'react'
import { useQuery } from './useQuery'
import * as svc from '../services/masterDataService'

export function useUnits() {
  const fetcher = useCallback(() => svc.getUnits(), [])
  const { data: units, loading, error, refetch } = useQuery(fetcher, { keepDataOnError: true })
  return { units, loading, error, refetch }
}

export function useProducts() {
  const fetcher = useCallback(() => svc.getProducts(), [])
  const { data: products, loading, error, refetch } = useQuery(fetcher, { keepDataOnError: true })
  return { products, loading, error, refetch }
}

export function useCOA() {
  const fetcher = useCallback(() => svc.getCOA(), [])
  const { data: coa, loading, error, refetch } = useQuery(fetcher, { keepDataOnError: true })
  return { coa, loading, error, refetch }
}

export function useCustomers() {
  const fetcher = useCallback(() => svc.getCustomers(), [])
  const { data: customers, loading, error, refetch } = useQuery(fetcher, { keepDataOnError: true })
  return { customers, loading, error, refetch }
}

export function useSuppliers() {
  const fetcher = useCallback(() => svc.getSuppliers(), [])
  const { data: suppliers, loading, error, refetch } = useQuery(fetcher, { keepDataOnError: true })
  return { suppliers, loading, error, refetch }
}

export function useCashBankAccounts() {
  const fetcher = useCallback(() => svc.getCashBankAccounts(), [])
  const { data: accounts, loading, error, refetch } = useQuery(fetcher, { keepDataOnError: true })
  return { accounts, loading, error, refetch }
}

export function useCOAForCashBank() {
  const fetcher = useCallback(() => svc.getCOAForCashBank(), [])
  const { data: coaOptions, loading, error } = useQuery(fetcher, { keepDataOnError: true })
  return { coaOptions, loading, error }
}
```

- [ ] **Step 3: Refactor useSales.js**

Ganti seluruh isi `src/hooks/useSales.js`:

```js
import { useCallback } from 'react'
import { useQuery } from './useQuery'
import { getSalesOrders, getGoodsDeliveries, getSalesInvoices } from '../services/salesService'

export function useSalesOrders() {
  const fetcher = useCallback(() => getSalesOrders(), [])
  const { data: orders, loading, error, refetch } = useQuery(fetcher)
  return { orders, loading, error, refetch }
}

export function useGoodsDeliveries() {
  const fetcher = useCallback(() => getGoodsDeliveries(), [])
  const { data: deliveries, loading, error, refetch } = useQuery(fetcher)
  return { deliveries, loading, error, refetch }
}

export function useSalesInvoices() {
  const fetcher = useCallback(() => getSalesInvoices(), [])
  const { data: invoices, loading, error, refetch } = useQuery(fetcher)
  return { invoices, loading, error, refetch }
}
```

- [ ] **Step 4: Refactor usePurchase.js**

Ganti seluruh isi `src/hooks/usePurchase.js`:

```js
import { useCallback } from 'react'
import { useQuery } from './useQuery'
import { getPurchaseOrders, getGoodsReceipts, getPurchaseInvoices } from '../services/purchaseService'

export function usePurchaseOrders() {
  const fetcher = useCallback(() => getPurchaseOrders(), [])
  const { data: purchaseOrders, loading, error, refetch } = useQuery(fetcher)
  return { purchaseOrders, loading, error, refetch }
}

export function useGoodsReceipts() {
  const fetcher = useCallback(() => getGoodsReceipts(), [])
  const { data: goodsReceipts, loading, error, refetch } = useQuery(fetcher)
  return { goodsReceipts, loading, error, refetch }
}

export function usePurchaseInvoices() {
  const fetcher = useCallback(() => getPurchaseInvoices(), [])
  const { data: purchaseInvoices, loading, error, refetch } = useQuery(fetcher)
  return { purchaseInvoices, loading, error, refetch }
}
```

- [ ] **Step 5: Cek useCashBank.js dan useInventory.js**

Baca kedua file tersebut. Jika berisi internal `useList`/`useFetchList`, refactor dengan cara yang sama (gunakan `useQuery` dari `./useQuery`).

- [ ] **Step 6: Verifikasi build**

```bash
cd apps/erp-acc/erp-app
npm run build
```

Expected: build sukses, tidak ada `Cannot find module` atau error lain.

- [ ] **Step 7: Smoke test manual**

`npm run dev`, navigasi ke:
- Master → Produk: list produk muncul
- Penjualan → Sales Order: list muncul  
- Pembelian → Purchase Order: list muncul

- [ ] **Step 8: Commit**

```bash
git add apps/erp-acc/erp-app/src/hooks/useQuery.js \
        apps/erp-acc/erp-app/src/hooks/useMasterData.js \
        apps/erp-acc/erp-app/src/hooks/useSales.js \
        apps/erp-acc/erp-app/src/hooks/usePurchase.js \
        apps/erp-acc/erp-app/src/hooks/useCashBank.js \
        apps/erp-acc/erp-app/src/hooks/useInventory.js
git commit -m "refactor(erp-acc): extract generic useQuery hook, remove 3 duplicate useList implementations"
```

---

## Task 5: Extract `softDelete` Utility — Hapus Copy-Paste 5x

**Files:**
- Create: `src/services/supabaseUtils.js`
- Modify: `src/services/masterDataService.js`

Pattern softDelete berulang 5 kali persis (Product, COA, Customer, Supplier, CashBankAccount). Ekstrak ke utility function.

- [ ] **Step 1: Buat src/services/supabaseUtils.js**

```js
import { supabase } from '../lib/supabase'

/**
 * Soft-delete satu baris dengan set is_active=false, deleted_at, deleted_by.
 * Tabel harus punya kolom: is_active, deleted_at, deleted_by.
 */
export async function softDelete(table, id) {
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase
    .from(table)
    .update({
      is_active: false,
      deleted_at: new Date().toISOString(),
      deleted_by: user?.id ?? null,
    })
    .eq('id', id)
  if (error) throw error
}
```

- [ ] **Step 2: Refactor masterDataService.js — ganti 5 softDelete dengan utility**

Di `src/services/masterDataService.js`, tambah import di baris pertama setelah import supabase:

```js
import { softDelete } from './supabaseUtils'
```

Kemudian ganti masing-masing fungsi softDelete:

**softDeleteProduct (baris 149-160):**
```js
export async function softDeleteProduct(id) {
  await softDelete('products', id)
}
```

**softDeleteCOA (baris 212-231):** — PERHATIAN: fungsi ini punya business logic check dulu (cek journal_items), pertahankan logika itu, hanya ganti bagian update:
```js
export async function softDeleteCOA(id) {
  // Check if this account is referenced in journal_items
  const { count, error: checkError } = await supabase
    .from('journal_items')
    .select('id', { count: 'exact', head: true })
    .eq('coa_id', id)
  if (checkError) throw checkError
  if (count > 0) throw new Error('Akun ini sudah digunakan dalam jurnal dan tidak dapat dihapus')

  await softDelete('coa', id)
}
```

**softDeleteCustomer (baris 277-288):**
```js
export async function softDeleteCustomer(id) {
  await softDelete('customers', id)
}
```

**softDeleteSupplier (baris 334-345):**
```js
export async function softDeleteSupplier(id) {
  await softDelete('suppliers', id)
}
```

**softDeleteCashBankAccount (baris 387-398):**
```js
export async function softDeleteCashBankAccount(id) {
  await softDelete('accounts', id)
}
```

- [ ] **Step 3: Cek apakah ada softDelete lain di codebase**

```bash
grep -rn "is_active: false" apps/erp-acc/erp-app/src/services/ --include="*.js"
```

Jika ada hasil di file lain (assetService, dll.), refactor dengan cara yang sama.

- [ ] **Step 4: Verifikasi build**

```bash
cd apps/erp-acc/erp-app
npm run build
```

Expected: build sukses.

- [ ] **Step 5: Smoke test manual**

`npm run dev`, buka Master → Customer, coba hapus (soft delete) satu customer. Verifikasi customer menghilang dari list, dan tidak ada error di console.

- [ ] **Step 6: Commit**

```bash
git add apps/erp-acc/erp-app/src/services/supabaseUtils.js \
        apps/erp-acc/erp-app/src/services/masterDataService.js
git commit -m "refactor(erp-acc): extract softDelete utility, remove 5 copy-paste implementations"
```

---

## Task 6: Lazy Load Routes — Aktifkan Code Splitting

**Files:**
- Modify: `src/App.jsx`

`App.jsx` mengimport 40+ komponen halaman secara statis. `<Suspense>` yang ada tidak berfungsi karena tidak ada `React.lazy()`. Dengan menambahkan lazy loading, initial bundle akan turun signifikan karena Vite akan memecah code ke chunk-chunk terpisah.

- [ ] **Step 1: Ganti semua static imports dengan React.lazy()**

Ganti seluruh blok imports halaman di `src/App.jsx` (baris 11-87) dengan:

```js
import { Suspense, lazy } from 'react'
import { Spin } from 'antd'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ToastProvider } from './components/ui/ToastContext'
import LoginPage from './pages/LoginPage'
import AppLayout from './components/layout/AppLayout'
import ProtectedRoute from './components/layout/ProtectedRoute'
import RoleGuard from './components/layout/RoleGuard'

// Master Data
const UnitsPage = lazy(() => import('./pages/master/UnitsPage'))
const ProductCategoriesPage = lazy(() => import('./pages/master/ProductCategoriesPage'))
const PaymentTermsPage = lazy(() => import('./pages/master/PaymentTermsPage'))
const TaxCodesPage = lazy(() => import('./pages/master/TaxCodesPage'))
const WarehousesPage = lazy(() => import('./pages/master/WarehousesPage'))
const ProductsPage = lazy(() => import('./pages/master/ProductsPage'))
const CustomersPage = lazy(() => import('./pages/master/CustomersPage'))
const SuppliersPage = lazy(() => import('./pages/master/SuppliersPage'))
const COAPage = lazy(() => import('./pages/master/COAPage'))
const ProductsBulkImportPage = lazy(() => import('./pages/master/ProductsBulkImportPage'))
const CustomersBulkImportPage = lazy(() => import('./pages/master/CustomersBulkImportPage'))
const SuppliersBulkImportPage = lazy(() => import('./pages/master/SuppliersBulkImportPage'))

// Inventory
const StockPage = lazy(() => import('./pages/inventory/StockPage'))
const StockCardPage = lazy(() => import('./pages/inventory/StockCardPage'))

// Sales
const SalesOrdersPage = lazy(() => import('./pages/sales/SalesOrdersPage'))
const SalesOrderFormPage = lazy(() => import('./pages/sales/SalesOrderFormPage'))
const GoodsDeliveriesPage = lazy(() => import('./pages/sales/GoodsDeliveriesPage'))
const GoodsDeliveryFormPage = lazy(() => import('./pages/sales/GoodsDeliveryFormPage'))
const SalesInvoicesPage = lazy(() => import('./pages/sales/SalesInvoicesPage'))
const SalesInvoiceFormPage = lazy(() => import('./pages/sales/SalesInvoiceFormPage'))

// Purchase
const PurchaseOrdersPage = lazy(() => import('./pages/purchase/PurchaseOrdersPage'))
const PurchaseOrderFormPage = lazy(() => import('./pages/purchase/PurchaseOrderFormPage'))
const GoodsReceiptsPage = lazy(() => import('./pages/purchase/GoodsReceiptsPage'))
const GoodsReceiptFormPage = lazy(() => import('./pages/purchase/GoodsReceiptFormPage'))
const PurchaseInvoicesPage = lazy(() => import('./pages/purchase/PurchaseInvoicesPage'))
const PurchaseInvoiceFormPage = lazy(() => import('./pages/purchase/PurchaseInvoiceFormPage'))

// Cash & Bank
const CashBankAccountsPage = lazy(() => import('./pages/cash/AccountsPage'))
const PaymentsPage = lazy(() => import('./pages/cash/PaymentsPage'))
const PaymentFormPage = lazy(() => import('./pages/cash/PaymentFormPage'))
const TransferFormPage = lazy(() => import('./pages/cash/TransferFormPage'))
const ReconciliationPage = lazy(() => import('./pages/cash/ReconciliationPage'))

// Accounting
const JournalsPage = lazy(() => import('./pages/accounting/JournalsPage'))
const ManualJournalFormPage = lazy(() => import('./pages/accounting/ManualJournalFormPage'))
const LedgerPage = lazy(() => import('./pages/accounting/LedgerPage'))
const RecurringPage = lazy(() => import('./pages/accounting/RecurringPage'))
const RecurringFormPage = lazy(() => import('./pages/accounting/RecurringFormPage'))

// Reports
const BalanceSheetPage = lazy(() => import('./pages/reports/BalanceSheetPage'))
const IncomeStatementPage = lazy(() => import('./pages/reports/IncomeStatementPage'))
const CashFlowPage = lazy(() => import('./pages/reports/CashFlowPage'))
const ARAPAgingPage = lazy(() => import('./pages/reports/ARAPAgingPage'))

// Dashboard
const DashboardPage = lazy(() => import('./pages/DashboardPage'))

// Fixed Assets
const AssetsPage = lazy(() => import('./pages/assets/AssetsPage'))
const AssetCategoriesPage = lazy(() => import('./pages/assets/AssetCategoriesPage'))
const AssetFormPage = lazy(() => import('./pages/assets/AssetFormPage'))
const AssetDetailPage = lazy(() => import('./pages/assets/AssetDetailPage'))
const DepreciationRunPage = lazy(() => import('./pages/assets/DepreciationRunPage'))
const AssetDisposalFormPage = lazy(() => import('./pages/assets/AssetDisposalFormPage'))
const AssetBulkImportPage = lazy(() => import('./pages/assets/AssetBulkImportPage'))

// Fixed Assets Reports
const AssetsListReportPage = lazy(() => import('./pages/reports/AssetsListReportPage'))
const DepreciationPeriodReportPage = lazy(() => import('./pages/reports/DepreciationPeriodReportPage'))
const AssetDisposalsReportPage = lazy(() => import('./pages/reports/AssetDisposalsReportPage'))
const AssetsSummaryReportPage = lazy(() => import('./pages/reports/AssetsSummaryReportPage'))

// Settings
const AuditLogPage = lazy(() => import('./pages/settings/AuditLogPage'))
const UsersPage = lazy(() => import('./pages/settings/UsersPage'))
const CompanySettingsPage = lazy(() => import('./pages/settings/CompanySettingsPage'))
const ClosingPeriodPage = lazy(() => import('./pages/settings/ClosingPeriodPage'))
```

Pastikan `Suspense` sudah diimport dari `'react'` (ubah `import { Suspense } from 'react'` menjadi `import { Suspense, lazy } from 'react'`).

Bagian `AppContent()` dan `App()` function tidak perlu diubah.

- [ ] **Step 2: Verifikasi build dan compare bundle size**

```bash
cd apps/erp-acc/erp-app
npm run build 2>&1 | tail -30
```

Expected: build sukses, output menunjukkan banyak chunk terpisah (bukan satu file `index-*.js` besar). Cari baris yang menunjukkan ukuran bundle utama — harus lebih kecil dari sebelumnya.

- [ ] **Step 3: Smoke test manual — navigasi antar halaman**

```bash
npm run dev
```

Navigasi ke minimal 5 halaman berbeda. Setiap navigasi pertama ke halaman baru akan menampilkan spinner sebentar (Suspense fallback) — ini normal dan expected. Verifikasi tidak ada error di console.

- [ ] **Step 4: Commit**

```bash
git add apps/erp-acc/erp-app/src/App.jsx
git commit -m "perf(erp-acc): lazy load all route pages — enable code splitting via React.lazy"
```

---

## Task 7: Dashboard Aggregate RPC — Pindahkan 10 Query ke 1 SQL Function

> **Assigned to: Codex (GPT 5.5/5.4)**
> Keyword untuk melanjutkan setelah Codex selesai: **"lanjut task 7 integrasi"**

### Spec untuk Codex

Tulis SQL migration untuk membuat PostgreSQL function `get_dashboard_metrics()` yang mengembalikan semua data yang saat ini diambil via 10 query terpisah di `dashboardService.js`.

**File yang harus dibuat:** `apps/erp-acc/erp-app/migrations/003_dashboard_aggregate_rpc.sql`

**Context database:**
- Tabel `invoices`: kolom `id, type('sales'|'purchase'), status('draft'|'confirmed'|'posted'|'partial'|'paid'), date (date), due_date (date nullable), total (numeric), amount_paid (numeric), customer_id (uuid), created_at (timestamptz)`
- Tabel `payments`: kolom `id, payment_number, date, amount, type, customer_id (nullable FK), supplier_id (nullable FK), created_at`
- Tabel `accounts`: kolom `id, name, type, balance (numeric), is_active (boolean), deleted_at (timestamptz nullable)`
- Tabel `inventory_stock`: kolom `product_id (uuid), warehouse_id (uuid), quantity_on_hand (numeric)`
- Tabel `products`: kolom `id, name, sku, base_unit_id (uuid)`
- Tabel `units`: kolom `id, name`
- Tabel `customers`: kolom `id, name`
- Tabel `suppliers`: kolom `id, name`

**Function signature yang dibutuhkan:**

```sql
CREATE OR REPLACE FUNCTION get_dashboard_metrics(p_today date DEFAULT CURRENT_DATE)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_month_start date;
  v_last_month_start date;
  v_last_month_end date;
  ...
BEGIN
  ...
  RETURN jsonb_build_object(
    'total_penjualan', ...,
    'total_piutang', ...,
    'total_hutang', ...,
    'total_kas', ...,
    'total_overdue_piutang', ...,
    'total_overdue_hutang', ...,
    'last_month_penjualan', ...,
    'low_stock', ...,        -- array jsonb
    'recent_sales', ...,     -- array jsonb (5 terbaru)
    'recent_payments', ...   -- array jsonb (5 terbaru)
  );
END;
$$;
```

**Logika yang harus diimplementasi (dari dashboardService.js):**
- `total_penjualan`: SUM(total) dari invoices type='sales', status IN ('posted','partial','paid'), date antara awal bulan ini s/d hari ini
- `total_piutang`: SUM(total - amount_paid) dari invoices type='sales', status IN ('posted','partial')
- `total_hutang`: SUM(total - amount_paid) dari invoices type='purchase', status IN ('posted','partial')
- `total_kas`: SUM(balance) dari accounts is_active=true AND deleted_at IS NULL
- `total_overdue_piutang`: SUM(total - amount_paid) dari invoices type='sales', status IN ('posted','partial'), due_date < today, due_date IS NOT NULL
- `total_overdue_hutang`: sama tapi type='purchase'
- `last_month_penjualan`: SUM(total) invoices type='sales', status IN ('posted','partial','paid'), date di bulan lalu
- `low_stock`: top 8 inventory_stock dengan quantity_on_hand <= 10, join ke products dan units, return array JSON
- `recent_sales`: 5 invoice type='sales' terbaru (order by created_at DESC), join customers, return array JSON
- `recent_payments`: 5 payments terbaru (order by created_at DESC), LEFT JOIN customers, LEFT JOIN suppliers, return array JSON

**Grant yang diperlukan:**
```sql
GRANT EXECUTE ON FUNCTION get_dashboard_metrics(date) TO authenticated;
GRANT EXECUTE ON FUNCTION get_dashboard_metrics(date) TO service_role;
```

---

### Step integrasi (Claude — setelah menerima keyword "lanjut task 7 integrasi")

- [ ] **Step 7.A: Apply migration ke Supabase**

```bash
# Apply migration via Supabase CLI atau Dashboard SQL editor
supabase db push
# ATAU paste isi migration ke Supabase Dashboard > SQL Editor
```

- [ ] **Step 7.B: Update dashboardService.js — ganti 10 query dengan 1 RPC call**

Ganti fungsi `getDashboardMetrics` di `src/services/dashboardService.js` dengan:

```js
export async function getDashboardMetrics() {
  const { data, error } = await supabase.rpc('get_dashboard_metrics')
  if (error) throw error

  return {
    totalPenjualan: data.total_penjualan ?? 0,
    totalPiutang: data.total_piutang ?? 0,
    totalHutang: data.total_hutang ?? 0,
    totalKas: data.total_kas ?? 0,
    totalOverduePiutang: data.total_overdue_piutang ?? 0,
    totalOverdueHutang: data.total_overdue_hutang ?? 0,
    lastMonthPenjualan: data.last_month_penjualan ?? 0,
    lowStock: (data.low_stock ?? []).map(s => ({ ...s, qty_on_hand: s.quantity_on_hand })),
    recentSales: data.recent_sales ?? [],
    recentPayments: data.recent_payments ?? [],
    accounts: data.accounts ?? [],
  }
}
```

Hapus fungsi-fungsi helper lokal yang tidak lagi dipakai: `monthStart()`, `lastMonthStart()`, `lastMonthEnd()`. Pertahankan `sixMonthsAgo()` karena masih dipakai oleh `getMonthlyTrend()`.

- [ ] **Step 7.C: Verifikasi build**

```bash
cd apps/erp-acc/erp-app && npm run build
```

- [ ] **Step 7.D: Smoke test dashboard**

`npm run dev`, buka halaman Dashboard. Semua angka KPI (total penjualan, piutang, hutang, kas) harus muncul dengan nilai yang sama seperti sebelumnya.

- [ ] **Step 7.E: Commit**

```bash
git add apps/erp-acc/erp-app/migrations/003_dashboard_aggregate_rpc.sql \
        apps/erp-acc/erp-app/src/services/dashboardService.js
git commit -m "perf(erp-acc): replace 10 parallel dashboard queries with single aggregate RPC"
```

---

## Task 8: Fix Data Integrity — payment_term_id & warehouse_id Masuk ke RPC

> **Assigned to: Codex (GPT 5.5/5.4)**
> Keyword untuk melanjutkan setelah Codex selesai: **"lanjut task 8 integrasi"**

### Spec untuk Codex

Saat ini fungsi `save_sales_order` dan `save_purchase_order` (Supabase RPC) tidak menerima parameter `payment_term_id` dan `warehouse_id`, sehingga klien harus melakukan UPDATE terpisah setelah RPC berhasil. Ini melanggar atomisitas.

**File yang harus dibuat:** `apps/erp-acc/erp-app/migrations/004_fix_save_order_rpc.sql`

Tulis migration yang meng-update (CREATE OR REPLACE) kedua RPC function berikut untuk menerima parameter `payment_term_id` dan `warehouse_id`:

**Signature baru `save_sales_order`:**
```sql
CREATE OR REPLACE FUNCTION save_sales_order(
  p_so jsonb,      -- tambah field: payment_term_id (uuid nullable), warehouse_id (uuid nullable)
  p_items jsonb[]
) RETURNS uuid ...
```

Parameter `p_so` sudah include semua field lama (`id, date, customer_id, status, notes`) ditambah `payment_term_id` dan `warehouse_id`. Function harus:
1. Upsert header ke `sales_orders` termasuk `payment_term_id` dan `warehouse_id`
2. Delete sales_order_items lama (jika update)
3. Insert items baru dari `p_items`
4. Return `id` (uuid) dari SO yang disimpan

Buat versi serupa untuk `save_purchase_order` dan `save_goods_delivery` dan `save_goods_receipt` — keduanya punya masalah yang sama untuk `warehouse_id`.

Untuk `save_sales_invoice` dan `save_purchase_invoice`: tambahkan `payment_term_id` ke dalam parameter.

---

### Step integrasi (Claude — setelah menerima keyword "lanjut task 8 integrasi")

- [ ] **Step 8.A: Apply migration**

Paste isi `migrations/004_fix_save_order_rpc.sql` ke Supabase Dashboard → SQL Editor → Run.

- [ ] **Step 8.B: Update salesService.js — hapus second UPDATE**

Di `src/services/salesService.js`, fungsi `saveSalesOrder` (baris 31-79):

Tambah `payment_term_id` dan `warehouse_id` ke dalam `p_so`:
```js
export async function saveSalesOrder(so, items) {
  const { data, error } = await supabase.rpc('save_sales_order', {
    p_so: {
      id:              so.id              || null,
      date:            so.date,
      customer_id:     so.customer_id,
      payment_term_id: so.payment_term_id || null,
      warehouse_id:    so.warehouse_id    || null,
      status:          so.status          || 'draft',
      notes:           so.notes           || null,
    },
    p_items: items.map(i => ({
      product_id:    i.product_id,
      unit_id:       i.unit_id,
      quantity:      Number(i.quantity),
      quantity_base: Number(i.quantity_base) || Number(i.quantity),
      unit_price:    Number(i.unit_price)    || 0,
      tax_amount:    Number(i.tax_amount)    || 0,
      total:         Number(i.total)         || 0,
    })),
  })
  if (error) throw error
  return data
}
```

Hapus seluruh blok `if (hasPaymentTerm || hasWarehouse) { ... }` setelah RPC call (baris 56-77 di original).

Lakukan hal yang sama untuk `saveSalesInvoice` (hapus second update untuk payment_term_id).

- [ ] **Step 8.C: Update purchaseService.js**

Cara yang sama: tambah `payment_term_id` + `warehouse_id` ke `p_po` di `savePurchaseOrder`, hapus second UPDATE block.

Update `saveGoodsDelivery` dan `saveGoodsReceipt`: tambah `warehouse_id` ke dalam parameter RPC, hapus second UPDATE.

Update `savePurchaseInvoice`: tambah `payment_term_id` ke dalam RPC params, hapus second update.

- [ ] **Step 8.D: Verifikasi build**

```bash
cd apps/erp-acc/erp-app && npm run build
```

- [ ] **Step 8.E: Smoke test**

`npm run dev`:
1. Buat Sales Order baru dengan memilih customer, payment term, gudang → simpan → reload halaman → verifikasi payment term dan gudang masih tersimpan
2. Buat Purchase Order baru → simpan → reload → verifikasi data lengkap

- [ ] **Step 8.F: Commit**

```bash
git add apps/erp-acc/erp-app/migrations/004_fix_save_order_rpc.sql \
        apps/erp-acc/erp-app/src/services/salesService.js \
        apps/erp-acc/erp-app/src/services/purchaseService.js
git commit -m "fix(erp-acc): move payment_term_id+warehouse_id into RPCs — restore atomic saves"
```

---

## Task 9: Pindah Manual Journal Period Check ke Server

> **Assigned to: Codex (GPT 5.5/5.4)**
> Keyword untuk melanjutkan setelah Codex selesai: **"lanjut task 9 integrasi"**

### Spec untuk Codex

Saat ini `journalService.js` melakukan period check di JavaScript sebelum insert (memanggil `getClosedPeriods()` dan `isPeriodClosed()`). GD/GR/Invoice sudah melakukan check ini server-side via trigger atau RPC. Manual journal harus mengikuti pola yang sama.

**File yang harus dibuat:** `apps/erp-acc/erp-app/migrations/005_manual_journal_period_check.sql`

**Context database:**
- Tabel `journals`: kolom `id, journal_number, date (date), description, source, is_posted, created_by`
- Tabel `company_settings`: kolom `id, closed_periods (text[] nullable)` — array of 'YYYY-MM' strings
- RPC `post_manual_journal(p_journal_id uuid)` sudah ada

Tulis migration yang menambahkan trigger BEFORE INSERT pada tabel `journals` yang:
1. Mengambil `closed_periods` dari `company_settings` (ambil satu baris — ada single row)
2. Mengecek apakah `NEW.date` jatuh di period yang sudah ditutup (format key: `to_char(NEW.date, 'YYYY-MM')`)
3. Jika iya, RAISE EXCEPTION dengan message: `'Periode ' || to_char(NEW.date, 'YYYY-MM') || ' sudah ditutup. Tidak dapat menyimpan jurnal.'`

Trigger harus bernama `check_journal_period_not_closed` dan hanya aktif untuk INSERT (bukan UPDATE).

---

### Step integrasi (Claude — setelah menerima keyword "lanjut task 9 integrasi")

- [ ] **Step 9.A: Apply migration**

Paste isi `migrations/005_manual_journal_period_check.sql` ke Supabase Dashboard → SQL Editor → Run.

- [ ] **Step 9.B: Update journalService.js — hapus client-side period check**

Di `src/services/journalService.js`, hapus baris 2-3 (import):
```js
// HAPUS:
import { getClosedPeriods } from './companySettingsService'
import { isPeriodClosed } from '../utils/periodUtils'
```

Di fungsi `saveManualJournal` (baris 37-73), hapus blok period check (baris 40-43):
```js
// HAPUS blok ini:
const { closedPeriods } = await getClosedPeriods()
if (isPeriodClosed(header.date, closedPeriods)) {
  throw new Error(`Periode ${header.date.slice(0, 7)} sudah ditutup. Tidak dapat menyimpan jurnal.`)
}
```

Di fungsi `postManualJournal` (baris 75-89), hapus juga client-side check (baris 79-84):
```js
// HAPUS blok ini:
const { closedPeriods } = await getClosedPeriods()
if (isPeriodClosed(journal.date, closedPeriods)) {
  throw new Error(`Periode ${journal.date.slice(0, 7)} sudah ditutup. Tidak dapat memposting jurnal.`)
}
```

Error dari trigger PostgreSQL akan otomatis dilempar ke klien melalui Supabase — pesan error akan sama.

- [ ] **Step 9.C: Verifikasi build**

```bash
cd apps/erp-acc/erp-app && npm run build
```

- [ ] **Step 9.D: Smoke test**

`npm run dev`, buka Pembukuan → Jurnal → Buat jurnal baru. Coba buat jurnal di periode yang sudah ditutup (jika ada) — harus error dengan pesan yang sama. Coba di periode aktif — harus berhasil.

- [ ] **Step 9.E: Commit**

```bash
git add apps/erp-acc/erp-app/migrations/005_manual_journal_period_check.sql \
        apps/erp-acc/erp-app/src/services/journalService.js
git commit -m "fix(erp-acc): enforce journal period check server-side via trigger, remove client bypass"
```

---

## Self-Review

**Spec coverage:**
- ✅ parseCurrency bug → Task 1
- ✅ Math.random() → Task 2  
- ✅ today() duplikasi → Task 3
- ✅ useList/useFetchList 3x duplikat → Task 4
- ✅ softDelete 5x duplikat → Task 5
- ✅ Tidak ada code splitting → Task 6
- ✅ Dashboard 10 query → Task 7
- ✅ payment_term_id atomic save → Task 8
- ✅ Manual journal period check bypass → Task 9

**Scope yang sengaja dikecualikan dari plan ini** (butuh diskusi terpisah):
- Standardisasi UI paradigm (AntD vs custom) — perubahan terlalu besar dan bisa break UX
- Role system redesign — butuh keputusan bisnis soal permissions baru
- `masterDataService.js` split — low-risk tapi large scope, bisa jadi plan tersendiri
- Caching global (React Query/SWR) — architectural change besar, plan terpisah
