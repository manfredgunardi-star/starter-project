# Frontend RBAC Guards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce consistent role-based UI guards across the entire ERP-ACC frontend so that viewers see read-only UI, staff see create/edit (no delete/post), and admins see everything.

**Architecture:** Add a `RoleGuard` wrapper component for route-level protection. Extend the sidebar to filter menu items by role. Add `canWrite`/`canPost`/`isAdmin` guards to all pages that currently lack them. No backend changes needed — RLS already enforces security.

**Tech Stack:** React 18, react-router-dom v6, existing AuthContext (`useAuth` hook)

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/components/layout/RoleGuard.jsx` | Create | Route-level wrapper that redirects unauthorized users to dashboard with toast |
| `src/components/layout/Sidebar.jsx` | Modify | Filter menu items based on user role |
| `src/App.jsx` | Modify | Wrap restricted routes with `RoleGuard` |
| `src/pages/sales/SalesOrdersPage.jsx` | Modify | Hide "Buat SO" button for viewers |
| `src/pages/sales/GoodsDeliveriesPage.jsx` | Modify | Hide "Tambah" button for viewers |
| `src/pages/sales/SalesInvoicesPage.jsx` | Modify | Hide "Tambah" button for viewers |
| `src/pages/purchase/PurchaseOrdersPage.jsx` | Modify | Hide "Buat PO" button for viewers |
| `src/pages/purchase/GoodsReceiptsPage.jsx` | Modify | Hide "Tambah GR" button for viewers |
| `src/pages/purchase/PurchaseInvoicesPage.jsx` | Modify | Hide "Tambah" button for viewers |
| `src/pages/cash/PaymentsPage.jsx` | Modify | Hide "Tambah Pembayaran" button for viewers |
| `src/pages/accounting/JournalsPage.jsx` | Modify | Hide "Jurnal Baru" button — admin only |
| `src/pages/purchase/PurchaseOrderFormPage.jsx` | Modify | Hide Save/Confirm/Post buttons per role |
| `src/pages/purchase/GoodsReceiptFormPage.jsx` | Modify | Hide Save/Post buttons per role |
| `src/pages/purchase/PurchaseInvoiceFormPage.jsx` | Modify | Hide Save/Post/Pay buttons per role |
| `src/pages/cash/PaymentFormPage.jsx` | Modify | Hide Save button for viewers |
| `src/pages/cash/TransferFormPage.jsx` | Modify | Hide Save button for viewers |
| `src/pages/accounting/ManualJournalFormPage.jsx` | Modify | Hide Save/Post buttons — admin only |
| `src/pages/assets/AssetsPage.jsx` | Modify | Hide "Tambah Aset" and "Bulk Import" for viewers |
| `src/pages/assets/AssetDetailPage.jsx` | Modify | Hide Edit/Dispose buttons per role |
| `src/pages/assets/DepreciationRunPage.jsx` | Modify | Admin only — hide run button for non-admins |

## Role Permission Matrix (reference for all tasks)

| Action | Viewer | Staff | Admin |
|--------|--------|-------|-------|
| View all data & reports | Yes | Yes | Yes |
| Create/edit master data | No | Yes (`canWrite`) | Yes |
| Delete master data | No | No | Yes (`isAdmin`) |
| Create/edit transactions (SO, PO, GR, GD, Invoice, Payment) | No | Yes (`canWrite`) | Yes |
| Post/confirm transactions | No | No | Yes (`canPost`) |
| Delete transactions | No | No | Yes (`isAdmin`) |
| Manual journal create/edit/post | No | No | Yes (`canPost`) |
| Manage users | No | No | Yes (`isAdmin`) |
| Depreciation run | No | No | Yes (`isAdmin`) |
| Bulk import assets | No | Yes (`canWrite`) | Yes |
| Dispose assets | No | Yes (`canWrite`) | Yes |

---

### Task 1: Create RoleGuard component

**Files:**
- Create: `src/components/layout/RoleGuard.jsx`

- [ ] **Step 1: Create the RoleGuard component**

```jsx
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

/**
 * Route-level guard. Wraps routes that require a minimum permission level.
 *
 * @param {'canWrite' | 'canPost' | 'isAdmin'} require - permission key from useAuth
 * @param {React.ReactNode} children
 */
export default function RoleGuard({ require, children }) {
  const auth = useAuth()

  if (!auth[require]) {
    return <Navigate to="/" replace />
  }

  return children
}
```

- [ ] **Step 2: Verify file was created**

Run: `cat src/components/layout/RoleGuard.jsx | head -20`
Expected: The component code above

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/RoleGuard.jsx
git commit -m "feat(rbac): add RoleGuard route-level component"
```

---

### Task 2: Wrap restricted routes with RoleGuard in App.jsx

**Files:**
- Modify: `src/App.jsx`

Route protection rules:
- **`/new` and `/edit` transaction routes** → `require="canWrite"` (staff + admin)
- **Manual journal form** → `require="canPost"` (admin only)
- **Depreciation run** → `require="isAdmin"`
- **Settings/users** → `require="isAdmin"`
- **Transfer form** → `require="canWrite"`
- List pages, detail pages, reports, audit log → no guard (all roles can view)

- [ ] **Step 1: Add RoleGuard import**

Add after the ProtectedRoute import line (line 7):

```jsx
import RoleGuard from './components/layout/RoleGuard'
```

- [ ] **Step 2: Wrap sales form routes**

Replace lines 119-126 (the 6 `/new` and `/:id` sales form routes):

```jsx
          <Route path="sales/orders/new" element={<RoleGuard require="canWrite"><SalesOrderFormPage /></RoleGuard>} />
          <Route path="sales/orders/:id" element={<SalesOrderFormPage />} />
          <Route path="sales/deliveries/new" element={<RoleGuard require="canWrite"><GoodsDeliveryFormPage /></RoleGuard>} />
          <Route path="sales/deliveries/:id" element={<GoodsDeliveryFormPage />} />
          <Route path="sales/invoices/new" element={<RoleGuard require="canWrite"><SalesInvoiceFormPage /></RoleGuard>} />
          <Route path="sales/invoices/:id" element={<SalesInvoiceFormPage />} />
```

Note: `/:id` routes are NOT guarded because viewers need to view existing documents. The form pages themselves will hide Save/Post buttons per role (Task 6+).

- [ ] **Step 3: Wrap purchase form routes**

Replace lines 130-137:

```jsx
          <Route path="purchase/orders/new" element={<RoleGuard require="canWrite"><PurchaseOrderFormPage /></RoleGuard>} />
          <Route path="purchase/orders/:id" element={<PurchaseOrderFormPage />} />
          <Route path="purchase/receipts/new" element={<RoleGuard require="canWrite"><GoodsReceiptFormPage /></RoleGuard>} />
          <Route path="purchase/receipts/:id" element={<GoodsReceiptFormPage />} />
          <Route path="purchase/invoices/new" element={<RoleGuard require="canWrite"><PurchaseInvoiceFormPage /></RoleGuard>} />
          <Route path="purchase/invoices/:id" element={<PurchaseInvoiceFormPage />} />
```

- [ ] **Step 4: Wrap cash & bank form routes**

Replace lines 142-143 (PaymentFormPage and TransferFormPage):

```jsx
          <Route path="cash/payments/new" element={<RoleGuard require="canWrite"><PaymentFormPage /></RoleGuard>} />
          <Route path="cash/transfers/new" element={<RoleGuard require="canWrite"><TransferFormPage /></RoleGuard>} />
```

- [ ] **Step 5: Wrap accounting form routes**

Replace line 148 (ManualJournalFormPage new):

```jsx
          <Route path="accounting/journals/new" element={<RoleGuard require="canPost"><ManualJournalFormPage /></RoleGuard>} />
          <Route path="accounting/journals/:id" element={<ManualJournalFormPage />} />
```

- [ ] **Step 6: Wrap asset write routes**

Replace lines 164-169:

```jsx
          <Route path="assets/new" element={<RoleGuard require="canWrite"><AssetFormPage /></RoleGuard>} />
          <Route path="assets/bulk-import" element={<RoleGuard require="canWrite"><AssetBulkImportPage /></RoleGuard>} />
          <Route path="assets/depreciation" element={<RoleGuard require="isAdmin"><DepreciationRunPage /></RoleGuard>} />
          <Route path="assets/:id" element={<AssetDetailPage />} />
          <Route path="assets/:id/edit" element={<RoleGuard require="canWrite"><AssetFormPage /></RoleGuard>} />
          <Route path="assets/:id/dispose" element={<RoleGuard require="canWrite"><AssetDisposalFormPage /></RoleGuard>} />
```

- [ ] **Step 7: Wrap settings/users route**

Replace line 172:

```jsx
          <Route path="settings/users" element={<RoleGuard require="isAdmin"><UsersPage /></RoleGuard>} />
```

- [ ] **Step 8: Verify build passes**

Run: `cd erp-app && npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 9: Commit**

```bash
git add src/App.jsx
git commit -m "feat(rbac): wrap restricted routes with RoleGuard"
```

---

### Task 3: Filter sidebar menu items by role

**Files:**
- Modify: `src/components/layout/Sidebar.jsx`

Each menu item gets an optional `minRole` property. The sidebar filters items based on the user's role.

- [ ] **Step 1: Add useAuth import and role-aware menu data**

Replace the imports section (lines 1-14) with:

```jsx
import { useState } from 'react'
import { useLocation, Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import {
  ChevronDown,
  LayoutDashboard,
  Database,
  Package,
  ShoppingCart,
  Truck,
  DollarSign,
  BookOpen,
  BarChart3,
  Settings,
  Building2
} from 'lucide-react'
```

- [ ] **Step 2: Add minRole to menu items that need restriction**

Replace the entire `menuGroups` array (lines 17-104) with:

```jsx
// minRole: 'write' = staff+admin, 'admin' = admin only
// No minRole = visible to all (including viewer)
const menuGroups = [
  {
    label: 'Master Data',
    icon: Database,
    items: [
      { label: 'Satuan', path: '/master/units' },
      { label: 'Produk', path: '/master/products' },
      { label: 'Customer', path: '/master/customers' },
      { label: 'Supplier', path: '/master/suppliers' },
      { label: 'COA', path: '/master/coa' }
    ]
  },
  {
    label: 'Inventory',
    icon: Package,
    items: [
      { label: 'Stok', path: '/inventory/stock' },
      { label: 'Kartu Stok', path: '/inventory/stock-card' }
    ]
  },
  {
    label: 'Penjualan',
    icon: ShoppingCart,
    items: [
      { label: 'Sales Order', path: '/sales/orders' },
      { label: 'Pengiriman', path: '/sales/deliveries' },
      { label: 'Invoice Penjualan', path: '/sales/invoices' }
    ]
  },
  {
    label: 'Pembelian',
    icon: Truck,
    items: [
      { label: 'Purchase Order', path: '/purchase/orders' },
      { label: 'Penerimaan', path: '/purchase/receipts' },
      { label: 'Invoice Pembelian', path: '/purchase/invoices' }
    ]
  },
  {
    label: 'Kas & Bank',
    icon: DollarSign,
    items: [
      { label: 'Akun', path: '/cash/accounts' },
      { label: 'Pembayaran', path: '/cash/payments' },
      { label: 'Transfer', path: '/cash/transfers/new', minRole: 'write' },
      { label: 'Rekonsiliasi', path: '/cash/reconciliation' }
    ]
  },
  {
    label: 'Pembukuan',
    icon: BookOpen,
    items: [
      { label: 'Jurnal', path: '/accounting/journals' },
      { label: 'Buku Besar', path: '/accounting/ledger' }
    ]
  },
  {
    label: 'Aset Tetap',
    icon: Building2,
    items: [
      { label: 'Daftar Aset', path: '/assets' },
      { label: 'Kategori Aset', path: '/assets/categories' },
      { label: 'Post Penyusutan', path: '/assets/depreciation', minRole: 'admin' },
      { label: 'Import Aset', path: '/assets/bulk-import', minRole: 'write' }
    ]
  },
  {
    label: 'Laporan',
    icon: BarChart3,
    items: [
      { label: 'Neraca', path: '/reports/balance-sheet' },
      { label: 'Laba Rugi', path: '/reports/income-statement' },
      { label: 'Arus Kas', path: '/reports/cash-flow' },
      { label: 'Daftar Aset Tetap', path: '/reports/assets-list' },
      { label: 'Penyusutan per Periode', path: '/reports/depreciation-period' },
      { label: 'Disposal Aset', path: '/reports/asset-disposals' },
      { label: 'Summary Aset per Kategori', path: '/reports/assets-summary' }
    ]
  },
  {
    label: 'Settings',
    icon: Settings,
    minRole: 'admin',
    items: [
      { label: 'Users', path: '/settings/users' },
      { label: 'Audit Log', path: '/settings/audit-log' }
    ]
  }
]
```

- [ ] **Step 3: Add role filtering logic to MenuGroup and Sidebar**

Replace the `MenuGroup` function (lines 124-170) with:

```jsx
function MenuGroup({ group, canWrite, isAdmin }) {
  const [isOpen, setIsOpen] = useState(true)
  const location = useLocation()
  const Icon = group.icon

  // Filter items by role
  const visibleItems = group.items.filter(item => {
    if (!item.minRole) return true
    if (item.minRole === 'write') return canWrite
    if (item.minRole === 'admin') return isAdmin
    return true
  })

  // Hide entire group if no visible items
  if (visibleItems.length === 0) return null

  const isGroupActive = visibleItems.some(item => location.pathname === item.path)

  return (
    <div className="mb-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center gap-2 px-4 py-2 rounded text-sm font-medium transition ${
          isGroupActive
            ? 'bg-blue-100 text-blue-900'
            : 'text-gray-700 hover:bg-gray-100'
        }`}
      >
        <Icon size={18} />
        <span className="flex-1 text-left">{group.label}</span>
        <ChevronDown
          size={16}
          className={`transition transform ${isOpen ? '' : '-rotate-90'}`}
        />
      </button>

      {isOpen && (
        <div className="ml-4 mt-1 space-y-1">
          {visibleItems.map(item => {
            const isActive = location.pathname === item.path
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`block px-4 py-2 rounded text-sm transition ${
                  isActive
                    ? 'bg-blue-600 text-white font-medium'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Update Sidebar to pass role info and filter groups**

Replace the `Sidebar` function (lines 173-188) with:

```jsx
export default function Sidebar() {
  const { canWrite, isAdmin } = useAuth()

  // Filter groups that have a minRole on the group itself
  const visibleGroups = menuGroups.filter(group => {
    if (!group.minRole) return true
    if (group.minRole === 'write') return canWrite
    if (group.minRole === 'admin') return isAdmin
    return true
  })

  return (
    <div className="w-64 bg-white border-r border-gray-200 flex flex-col h-screen">
      <div className="p-6 border-b border-gray-200">
        <h1 className="text-xl font-bold text-gray-900">ERP Pembukuan</h1>
      </div>

      <nav className="flex-1 overflow-y-auto p-4">
        <DashboardLink />
        {visibleGroups.map(group => (
          <MenuGroup key={group.label} group={group} canWrite={canWrite} isAdmin={isAdmin} />
        ))}
      </nav>
    </div>
  )
}
```

- [ ] **Step 5: Verify build passes**

Run: `cd erp-app && npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/Sidebar.jsx
git commit -m "feat(rbac): filter sidebar menu items by user role"
```

---

### Task 4: Add guards to sales list pages

**Files:**
- Modify: `src/pages/sales/SalesOrdersPage.jsx`
- Modify: `src/pages/sales/GoodsDeliveriesPage.jsx`
- Modify: `src/pages/sales/SalesInvoicesPage.jsx`

All three follow the same pattern: add `useAuth` import and wrap the "Tambah/New" button with `canWrite &&`.

- [ ] **Step 1: Guard SalesOrdersPage.jsx**

Add import after line 1:

```jsx
import { useAuth } from '../../contexts/AuthContext'
```

Inside the component function, add after `const [statusFilter, setStatusFilter] = useState('')` (line 14):

```jsx
  const { canWrite } = useAuth()
```

Replace line 33-35 (the Button):

```jsx
        {canWrite && (
          <Button variant="primary" onClick={() => navigate('/sales/orders/new')}>
            <Plus size={20} /> Buat SO
          </Button>
        )}
```

- [ ] **Step 2: Guard GoodsDeliveriesPage.jsx**

Add import after line 1:

```jsx
import { useAuth } from '../../contexts/AuthContext'
```

Inside the component function, add after the state declarations:

```jsx
  const { canWrite } = useAuth()
```

Wrap the "Tambah" button with `{canWrite && ( ... )}`.

- [ ] **Step 3: Guard SalesInvoicesPage.jsx**

Same pattern as Step 2: add `useAuth` import, destructure `canWrite`, wrap the "Tambah" button.

- [ ] **Step 4: Verify build passes**

Run: `cd erp-app && npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 5: Commit**

```bash
git add src/pages/sales/SalesOrdersPage.jsx src/pages/sales/GoodsDeliveriesPage.jsx src/pages/sales/SalesInvoicesPage.jsx
git commit -m "feat(rbac): add canWrite guards to sales list pages"
```

---

### Task 5: Add guards to purchase list pages

**Files:**
- Modify: `src/pages/purchase/PurchaseOrdersPage.jsx`
- Modify: `src/pages/purchase/GoodsReceiptsPage.jsx`
- Modify: `src/pages/purchase/PurchaseInvoicesPage.jsx`

Same pattern as Task 4.

- [ ] **Step 1: Guard PurchaseOrdersPage.jsx**

Add import:

```jsx
import { useAuth } from '../../contexts/AuthContext'
```

Add inside component:

```jsx
  const { canWrite } = useAuth()
```

Wrap the "Buat PO" button (line 33-35) with `{canWrite && ( ... )}`.

- [ ] **Step 2: Guard GoodsReceiptsPage.jsx**

Same pattern: add `useAuth`, destructure `canWrite`, wrap "Tambah GR" button.

- [ ] **Step 3: Guard PurchaseInvoicesPage.jsx**

Same pattern: add `useAuth`, destructure `canWrite`, wrap the button.

- [ ] **Step 4: Verify build passes**

Run: `cd erp-app && npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 5: Commit**

```bash
git add src/pages/purchase/PurchaseOrdersPage.jsx src/pages/purchase/GoodsReceiptsPage.jsx src/pages/purchase/PurchaseInvoicesPage.jsx
git commit -m "feat(rbac): add canWrite guards to purchase list pages"
```

---

### Task 6: Add guards to cash & accounting list pages

**Files:**
- Modify: `src/pages/cash/PaymentsPage.jsx`
- Modify: `src/pages/accounting/JournalsPage.jsx`

- [ ] **Step 1: Guard PaymentsPage.jsx**

Add `useAuth` import. Add `const { canWrite } = useAuth()` inside component. Wrap "Tambah Pembayaran" button with `{canWrite && ( ... )}`.

- [ ] **Step 2: Guard JournalsPage.jsx — admin only for manual journal**

Add `useAuth` import. Add `const { canPost } = useAuth()` inside component. Wrap the "Jurnal Baru" button with `{canPost && ( ... )}` — only admins can create manual journals.

- [ ] **Step 3: Verify build passes**

Run: `cd erp-app && npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 4: Commit**

```bash
git add src/pages/cash/PaymentsPage.jsx src/pages/accounting/JournalsPage.jsx
git commit -m "feat(rbac): add guards to cash payments and journals list pages"
```

---

### Task 7: Add guards to purchase form pages

**Files:**
- Modify: `src/pages/purchase/PurchaseOrderFormPage.jsx`
- Modify: `src/pages/purchase/GoodsReceiptFormPage.jsx`
- Modify: `src/pages/purchase/PurchaseInvoiceFormPage.jsx`

These form pages currently have NO role checks. Need to add `canWrite` and `canPost` guards on action buttons. Follow the same pattern used by `SalesInvoiceFormPage.jsx` which already has guards.

- [ ] **Step 1: Guard PurchaseOrderFormPage.jsx**

Add import:

```jsx
import { useAuth } from '../../contexts/AuthContext'
```

Add inside component:

```jsx
  const { canWrite, canPost } = useAuth()
```

Guard the Save button with `{!readOnly && canWrite && ( ... )}`.
Guard the Confirm button with `{canPost && ( ... )}` (only admin can confirm PO).

- [ ] **Step 2: Guard GoodsReceiptFormPage.jsx**

Add `useAuth` import. Destructure `{ canWrite, canPost }`.
Guard Save button: `{!readOnly && canWrite && ( ... )}`
Guard Post button: `{canPost && ( ... )}`

- [ ] **Step 3: Guard PurchaseInvoiceFormPage.jsx**

Add `useAuth` import. Destructure `{ canWrite, canPost }`.
Guard Save button: `{!readOnly && canWrite && ( ... )}`
Guard Post button: `{canPost && ( ... )}`

- [ ] **Step 4: Verify build passes**

Run: `cd erp-app && npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 5: Commit**

```bash
git add src/pages/purchase/PurchaseOrderFormPage.jsx src/pages/purchase/GoodsReceiptFormPage.jsx src/pages/purchase/PurchaseInvoiceFormPage.jsx
git commit -m "feat(rbac): add canWrite/canPost guards to purchase form pages"
```

---

### Task 8: Add guards to cash form pages

**Files:**
- Modify: `src/pages/cash/PaymentFormPage.jsx`
- Modify: `src/pages/cash/TransferFormPage.jsx`

- [ ] **Step 1: Guard PaymentFormPage.jsx**

Add `useAuth` import. Destructure `{ canWrite }`. Guard the submit/save button with `canWrite`.

- [ ] **Step 2: Guard TransferFormPage.jsx**

Add `useAuth` import. Destructure `{ canWrite }`. Guard the submit/save button with `canWrite`.

- [ ] **Step 3: Verify build passes**

Run: `cd erp-app && npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 4: Commit**

```bash
git add src/pages/cash/PaymentFormPage.jsx src/pages/cash/TransferFormPage.jsx
git commit -m "feat(rbac): add canWrite guards to cash form pages"
```

---

### Task 9: Add guards to manual journal form page

**Files:**
- Modify: `src/pages/accounting/ManualJournalFormPage.jsx`

Manual journals are admin-only for both create and post.

- [ ] **Step 1: Guard ManualJournalFormPage.jsx**

Add `useAuth` import. Destructure `{ canPost }`.
Guard Save button: `{!readOnly && canPost && ( ... )}`
Guard Post button: `{canPost && ( ... )}`

Note: Using `canPost` (not `canWrite`) because manual journals are admin-only per RLS policy.

- [ ] **Step 2: Verify build passes**

Run: `cd erp-app && npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 3: Commit**

```bash
git add src/pages/accounting/ManualJournalFormPage.jsx
git commit -m "feat(rbac): add canPost guard to manual journal form (admin only)"
```

---

### Task 10: Add guards to asset pages

**Files:**
- Modify: `src/pages/assets/AssetsPage.jsx`
- Modify: `src/pages/assets/AssetDetailPage.jsx`
- Modify: `src/pages/assets/DepreciationRunPage.jsx`

- [ ] **Step 1: Guard AssetsPage.jsx**

Add `useAuth` import. Destructure `{ canWrite }`.
Wrap "Tambah Aset" button (line 90-91) with `{canWrite && ( ... )}`.
Wrap "Bulk Import" button (line 93-94) with `{canWrite && ( ... )}`.
Wrap "Tambah Aset Pertama" button (line 148-149) with `{canWrite && ( ... )}`.
Also wrap Edit and Trash2 action buttons in the table rows with `{canWrite && ( ... )}` and `{isAdmin && ( ... )}` respectively.

- [ ] **Step 2: Guard AssetDetailPage.jsx**

Add `useAuth` import. Destructure `{ canWrite, isAdmin }`.
Wrap "Edit" button with `{canWrite && ( ... )}`.
Wrap "Dispose" button with `{canWrite && ( ... )}`.
Wrap "Delete" button with `{isAdmin && ( ... )}`.

- [ ] **Step 3: Guard DepreciationRunPage.jsx**

Add `useAuth` import. Destructure `{ isAdmin }`.
Wrap the run/execute button with `{isAdmin && ( ... )}`. Display a read-only message for non-admins: `{!isAdmin && <p className="text-sm text-gray-500">Hanya admin yang dapat menjalankan penyusutan.</p>}`

- [ ] **Step 4: Verify build passes**

Run: `cd erp-app && npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 5: Commit**

```bash
git add src/pages/assets/AssetsPage.jsx src/pages/assets/AssetDetailPage.jsx src/pages/assets/DepreciationRunPage.jsx
git commit -m "feat(rbac): add role guards to asset pages"
```

---

### Task 11: Final build verification

- [ ] **Step 1: Full build**

Run: `cd erp-app && npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 2: Manual test checklist**

Test each role by logging in as a user with that role:

**As Viewer:**
- [ ] Sidebar: should NOT show Settings group, Transfer menu, Import Aset menu, Post Penyusutan menu
- [ ] Navigate to `/sales/orders/new` directly → should redirect to dashboard
- [ ] Navigate to `/accounting/journals/new` directly → should redirect to dashboard
- [ ] Navigate to `/settings/users` directly → should redirect to dashboard
- [ ] Navigate to `/assets/depreciation` directly → should redirect to dashboard
- [ ] List pages should NOT show any "Tambah/Buat/New" buttons
- [ ] Existing document detail pages should be viewable (read-only)

**As Staff:**
- [ ] Sidebar: should show all menus EXCEPT Settings and Post Penyusutan
- [ ] Can navigate to `/sales/orders/new` and see the form with Save button
- [ ] Transaction form pages should show Save but NOT Post/Confirm buttons
- [ ] Manual journal form should be blocked (redirect to dashboard)
- [ ] Settings/Users should be blocked
- [ ] Depreciation run should be blocked

**As Admin:**
- [ ] Sidebar: all menus visible
- [ ] All buttons visible (Save, Post, Confirm, Delete)
- [ ] Can access all routes including Settings/Users and Depreciation Run

- [ ] **Step 3: Commit all together if any stragglers**

```bash
git add -A
git commit -m "feat(rbac): complete frontend role-based access control guards"
```
