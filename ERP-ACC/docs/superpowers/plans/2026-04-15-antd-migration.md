# Ant Design Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrasi penuh UI `erp-app` dari Tailwind CSS + 10 custom components ke Ant Design via wrapper layer, tanpa mengubah kode halaman/bisnis logic.

**Architecture:** Component-first wrapper strategy — rewrite isi `src/components/ui/*.jsx` sebagai wrapper tipis di atas komponen AntD dengan mempertahankan API lama. Page code tidak berubah. Tailwind di-sweep per-area halaman, lalu dihapus dari build config di akhir.

**Tech Stack:** React 19, Vite 8, Ant Design 5, dayjs, react-router-dom 7. Saat ini: Tailwind CSS 4 (`@tailwindcss/vite`), Lucide React icons (tetap), Supabase backend (tidak tersentuh).

**Spec reference:** [`docs/superpowers/specs/2026-04-15-antd-migration-design.md`](../specs/2026-04-15-antd-migration-design.md)

**Catatan testing:** Project tidak punya test framework. "Test" = `npm run build` pass + smoke test manual sesuai checklist di spec. Setiap task harus leave build in passing state.

---

## File Structure

**Modifikasi (wrapper rewrite):**
- `erp-app/src/components/ui/Button.jsx`
- `erp-app/src/components/ui/Input.jsx`
- `erp-app/src/components/ui/Select.jsx`
- `erp-app/src/components/ui/Modal.jsx`
- `erp-app/src/components/ui/ConfirmDialog.jsx`
- `erp-app/src/components/ui/StatusBadge.jsx`
- `erp-app/src/components/ui/LoadingSpinner.jsx`
- `erp-app/src/components/ui/Toast.jsx`
- `erp-app/src/components/ui/ToastContext.jsx`
- `erp-app/src/components/ui/DataTable.jsx`
- `erp-app/src/main.jsx` (ConfigProvider + AntdApp)
- `erp-app/src/index.css` (hapus Tailwind directives di akhir)
- `erp-app/vite.config.js` (hapus `@tailwindcss/vite` di akhir)
- `erp-app/package.json` (tambah antd + dayjs; hapus tailwind di akhir)

**Buat baru:**
- `erp-app/src/components/ui/DateInput.jsx`

**Sweep Tailwind (tidak ubah logic, hanya styling):**
- `erp-app/src/pages/master/*.jsx`
- `erp-app/src/pages/purchase/*.jsx`
- `erp-app/src/pages/sales/*.jsx`
- `erp-app/src/pages/accounting/*.jsx`
- `erp-app/src/pages/cash/*.jsx`
- `erp-app/src/pages/assets/*.jsx`
- `erp-app/src/pages/inventory/*.jsx`
- `erp-app/src/pages/reports/*.jsx`
- `erp-app/src/pages/settings/*.jsx`
- `erp-app/src/pages/DashboardPage.jsx`
- `erp-app/src/pages/LoginPage.jsx`
- `erp-app/src/App.jsx` (layout shell)
- `erp-app/src/components/shared/*.jsx`
- `erp-app/src/components/assets/*.jsx`

---

## Phase 1 — Setup

### Task 1: Install AntD + Setup ConfigProvider

**Files:**
- Modify: `erp-app/package.json`
- Modify: `erp-app/src/main.jsx`

- [ ] **Step 1: Install antd dan dayjs**

Run:
```bash
cd erp-app && npm install antd dayjs
```

- [ ] **Step 2: Update `main.jsx` dengan ConfigProvider + AntdApp**

Replace entire file `erp-app/src/main.jsx`:

```jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider, App as AntdApp } from 'antd'
import idID from 'antd/locale/id_ID'
import 'dayjs/locale/id'
import dayjs from 'dayjs'
import './index.css'
import App from './App.jsx'

dayjs.locale('id')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ConfigProvider locale={idID}>
      <AntdApp>
        <App />
      </AntdApp>
    </ConfigProvider>
  </StrictMode>,
)
```

- [ ] **Step 3: Build verify**

Run: `cd erp-app && npm run build`
Expected: build pass tanpa error.

- [ ] **Step 4: Commit**

```bash
git add erp-app/package.json erp-app/package-lock.json erp-app/src/main.jsx
git commit -m "feat(ui): install antd and setup ConfigProvider with id_ID locale"
```

---

## Phase 2 — Wrapper Components

**Rule untuk semua task di phase ini:** API lama harus 100% dipertahankan. Setelah rewrite, `npm run build` harus pass.

### Task 2: Button Wrapper

**Files:**
- Modify: `erp-app/src/components/ui/Button.jsx`

- [ ] **Step 1: Rewrite Button sebagai AntD wrapper**

Replace entire file `erp-app/src/components/ui/Button.jsx`:

```jsx
import { Button as AntdButton } from 'antd'

const variantToType = {
  primary: 'primary',
  secondary: 'default',
  danger: 'primary',
  ghost: 'text'
}

const sizeMap = {
  sm: 'small',
  md: 'middle',
  lg: 'large'
}

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  onClick,
  children,
  ...props
}) {
  return (
    <AntdButton
      type={variantToType[variant] || 'default'}
      danger={variant === 'danger'}
      size={sizeMap[size] || 'middle'}
      loading={loading}
      disabled={disabled}
      onClick={onClick}
      {...props}
    >
      {children}
    </AntdButton>
  )
}
```

- [ ] **Step 2: Build verify**

Run: `cd erp-app && npm run build`
Expected: build pass.

- [ ] **Step 3: Commit**

```bash
git add erp-app/src/components/ui/Button.jsx
git commit -m "refactor(ui): replace Button with AntD wrapper"
```

---

### Task 3: Input Wrapper

**Files:**
- Modify: `erp-app/src/components/ui/Input.jsx`

- [ ] **Step 1: Rewrite Input sebagai AntD wrapper**

Replace entire file `erp-app/src/components/ui/Input.jsx`:

```jsx
import { forwardRef } from 'react'
import { Input as AntdInput, InputNumber } from 'antd'

const Input = forwardRef(({
  label,
  error,
  type = 'text',
  placeholder,
  value,
  onChange,
  ...props
}, ref) => {
  const isNumber = type === 'number'
  const isTextarea = type === 'textarea'

  const field = isNumber ? (
    <InputNumber
      ref={ref}
      placeholder={placeholder}
      value={value === '' || value === undefined ? null : value}
      onChange={(val) => onChange && onChange({ target: { value: val ?? '' } })}
      status={error ? 'error' : undefined}
      style={{ width: '100%' }}
      {...props}
    />
  ) : isTextarea ? (
    <AntdInput.TextArea
      ref={ref}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      status={error ? 'error' : undefined}
      {...props}
    />
  ) : (
    <AntdInput
      ref={ref}
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      status={error ? 'error' : undefined}
      {...props}
    />
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {label && (
        <label style={{ fontSize: 14, fontWeight: 500 }}>{label}</label>
      )}
      {field}
      {error && <span style={{ color: '#ff4d4f', fontSize: 12 }}>{error}</span>}
    </div>
  )
})

Input.displayName = 'Input'

export default Input
```

- [ ] **Step 2: Build verify**

Run: `cd erp-app && npm run build`
Expected: build pass.

- [ ] **Step 3: Commit**

```bash
git add erp-app/src/components/ui/Input.jsx
git commit -m "refactor(ui): replace Input with AntD wrapper (text/number/textarea)"
```

---

### Task 4: Select Wrapper

**Files:**
- Modify: `erp-app/src/components/ui/Select.jsx`

- [ ] **Step 1: Rewrite Select sebagai AntD wrapper**

Replace entire file `erp-app/src/components/ui/Select.jsx`:

```jsx
import { forwardRef } from 'react'
import { Select as AntdSelect } from 'antd'

const Select = forwardRef(({
  label,
  error,
  options = [],
  placeholder = 'Pilih...',
  value,
  onChange,
  ...props
}, ref) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {label && (
        <label style={{ fontSize: 14, fontWeight: 500 }}>{label}</label>
      )}
      <AntdSelect
        ref={ref}
        placeholder={placeholder}
        value={value === '' ? undefined : value}
        onChange={(val) => onChange && onChange({ target: { value: val ?? '' } })}
        options={options.map(o => ({ value: o.value, label: o.label }))}
        status={error ? 'error' : undefined}
        allowClear
        showSearch
        optionFilterProp="label"
        style={{ width: '100%' }}
        {...props}
      />
      {error && <span style={{ color: '#ff4d4f', fontSize: 12 }}>{error}</span>}
    </div>
  )
})

Select.displayName = 'Select'

export default Select
```

- [ ] **Step 2: Build verify**

Run: `cd erp-app && npm run build`
Expected: build pass.

- [ ] **Step 3: Commit**

```bash
git add erp-app/src/components/ui/Select.jsx
git commit -m "refactor(ui): replace Select with AntD wrapper"
```

---

### Task 5: Modal Wrapper

**Files:**
- Modify: `erp-app/src/components/ui/Modal.jsx`

- [ ] **Step 1: Rewrite Modal sebagai AntD wrapper**

Replace entire file `erp-app/src/components/ui/Modal.jsx`:

```jsx
import { Modal as AntdModal } from 'antd'

const sizeToWidth = {
  sm: 400,
  md: 520,
  lg: 720
}

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md'
}) {
  return (
    <AntdModal
      open={isOpen}
      onCancel={onClose}
      title={title}
      width={sizeToWidth[size] || 520}
      footer={null}
      destroyOnClose
    >
      {children}
    </AntdModal>
  )
}
```

- [ ] **Step 2: Build verify**

Run: `cd erp-app && npm run build`
Expected: build pass.

- [ ] **Step 3: Commit**

```bash
git add erp-app/src/components/ui/Modal.jsx
git commit -m "refactor(ui): replace Modal with AntD wrapper"
```

---

### Task 6: ConfirmDialog Wrapper

**Files:**
- Modify: `erp-app/src/components/ui/ConfirmDialog.jsx`

**Catatan:** ConfirmDialog lama adalah component yang dipakai dengan pattern `isOpen/onClose/onConfirm`. Kita pertahankan pattern ini (bukan convert ke imperative API) supaya caller tidak berubah. Implementasinya cukup wrapper di atas AntD `Modal` dengan footer buttons.

- [ ] **Step 1: Rewrite ConfirmDialog sebagai AntD wrapper**

Replace entire file `erp-app/src/components/ui/ConfirmDialog.jsx`:

```jsx
import { Modal as AntdModal, Button as AntdButton, Space } from 'antd'

export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Hapus',
  variant = 'danger'
}) {
  return (
    <AntdModal
      open={isOpen}
      onCancel={onClose}
      title={title}
      width={400}
      footer={
        <Space>
          <AntdButton onClick={onClose}>Batal</AntdButton>
          <AntdButton
            type="primary"
            danger={variant === 'danger'}
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {confirmText}
          </AntdButton>
        </Space>
      }
      destroyOnClose
    >
      <p>{message}</p>
    </AntdModal>
  )
}
```

- [ ] **Step 2: Build verify**

Run: `cd erp-app && npm run build`
Expected: build pass.

- [ ] **Step 3: Commit**

```bash
git add erp-app/src/components/ui/ConfirmDialog.jsx
git commit -m "refactor(ui): replace ConfirmDialog with AntD wrapper"
```

---

### Task 7: StatusBadge Wrapper

**Files:**
- Modify: `erp-app/src/components/ui/StatusBadge.jsx`

- [ ] **Step 1: Rewrite StatusBadge sebagai AntD Tag wrapper**

Replace entire file `erp-app/src/components/ui/StatusBadge.jsx`:

```jsx
import { Tag } from 'antd'

const statusConfig = {
  draft: { color: 'default', label: 'Draft' },
  posted: { color: 'success', label: 'Posted' },
  confirmed: { color: 'blue', label: 'Confirmed' },
  paid: { color: 'blue', label: 'Paid' },
  partial: { color: 'warning', label: 'Partial' },
  pending: { color: 'orange', label: 'Pending' },
  completed: { color: 'success', label: 'Completed' },
  cancelled: { color: 'error', label: 'Cancelled' }
}

export default function StatusBadge({ status }) {
  const config = statusConfig[status] || statusConfig.draft
  return <Tag color={config.color}>{config.label}</Tag>
}
```

- [ ] **Step 2: Build verify**

Run: `cd erp-app && npm run build`
Expected: build pass.

- [ ] **Step 3: Commit**

```bash
git add erp-app/src/components/ui/StatusBadge.jsx
git commit -m "refactor(ui): replace StatusBadge with AntD Tag wrapper"
```

---

### Task 8: LoadingSpinner Wrapper

**Files:**
- Modify: `erp-app/src/components/ui/LoadingSpinner.jsx`

- [ ] **Step 1: Rewrite LoadingSpinner sebagai AntD Spin wrapper**

Replace entire file `erp-app/src/components/ui/LoadingSpinner.jsx`:

```jsx
import { Spin } from 'antd'

export default function LoadingSpinner({ message = 'Memuat...' }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: 256
    }}>
      <Spin size="large" tip={message}>
        <div style={{ padding: 50 }} />
      </Spin>
    </div>
  )
}
```

- [ ] **Step 2: Build verify**

Run: `cd erp-app && npm run build`
Expected: build pass.

- [ ] **Step 3: Commit**

```bash
git add erp-app/src/components/ui/LoadingSpinner.jsx
git commit -m "refactor(ui): replace LoadingSpinner with AntD Spin wrapper"
```

---

### Task 9: Toast / ToastContext Wrapper

**Files:**
- Modify: `erp-app/src/components/ui/Toast.jsx`
- Modify: `erp-app/src/components/ui/ToastContext.jsx`

**Catatan:** `useToast()` existing expose API `{ success, error, info, warning }`. AntD `App.useApp().message` juga expose `{ success, error, info, warning, loading }`. Kita bridge keduanya via `ToastContext.jsx`. File `Toast.jsx` sendiri tidak lagi dipakai render, cukup di-stub supaya import tidak break (atau dihapus kalau tidak ada import eksternal — cek dulu).

- [ ] **Step 1: Cek apakah `Toast.jsx` di-import dari file selain `ToastContext.jsx`**

Run:
```bash
cd erp-app && grep -rn "from.*ui/Toast['\"]" src/ | grep -v ToastContext
```
Expected: no output (hanya `ToastContext.jsx` yang import). Kalau ada output, sesuaikan task.

- [ ] **Step 2: Stub `Toast.jsx`**

Replace entire file `erp-app/src/components/ui/Toast.jsx`:

```jsx
// Deprecated: rendering handled by AntD App.useApp().message via ToastContext.
// Kept as empty export to avoid breaking stale imports during migration.
export default function Toast() {
  return null
}
```

- [ ] **Step 3: Rewrite `ToastContext.jsx` sebagai bridge ke AntD message**

Replace entire file `erp-app/src/components/ui/ToastContext.jsx`:

```jsx
import { App as AntdApp } from 'antd'

export function ToastProvider({ children }) {
  return <>{children}</>
}

export function useToast() {
  const { message } = AntdApp.useApp()
  return {
    success: (msg) => message.success(msg),
    error: (msg) => message.error(msg),
    info: (msg) => message.info(msg),
    warning: (msg) => message.warning(msg)
  }
}
```

- [ ] **Step 4: Build verify**

Run: `cd erp-app && npm run build`
Expected: build pass.

- [ ] **Step 5: Commit**

```bash
git add erp-app/src/components/ui/Toast.jsx erp-app/src/components/ui/ToastContext.jsx
git commit -m "refactor(ui): replace Toast with AntD message API via useToast hook"
```

---

### Task 10: DataTable Wrapper

**Files:**
- Modify: `erp-app/src/components/ui/DataTable.jsx`

**Catatan:** Kolom existing pakai `{ key, label, render }`. AntD `Table` pakai `{ key, title, dataIndex, render }`. Wrapper map `label → title`, `key → dataIndex + key`, preserve `render(value, row)` signature.

- [ ] **Step 1: Rewrite DataTable sebagai AntD Table wrapper**

Replace entire file `erp-app/src/components/ui/DataTable.jsx`:

```jsx
import { Table } from 'antd'

export default function DataTable({
  columns,
  data,
  onRowClick,
  emptyMessage = 'Data tidak ditemukan',
  loading = false,
  pagination
}) {
  const antdColumns = (columns || []).map(col => ({
    key: col.key,
    title: col.label,
    dataIndex: col.key,
    render: col.render ? (value, row) => col.render(value, row) : undefined
  }))

  return (
    <Table
      columns={antdColumns}
      dataSource={(data || []).map((row, idx) => ({ ...row, __key: row.id ?? idx }))}
      rowKey="__key"
      loading={loading}
      pagination={pagination === false ? false : { pageSize: 20, showSizeChanger: true, ...(pagination || {}) }}
      locale={{ emptyText: emptyMessage }}
      onRow={onRowClick ? (record) => ({
        onClick: () => onRowClick(record),
        style: { cursor: 'pointer' }
      }) : undefined}
      size="middle"
    />
  )
}
```

- [ ] **Step 2: Build verify**

Run: `cd erp-app && npm run build`
Expected: build pass.

- [ ] **Step 3: Commit**

```bash
git add erp-app/src/components/ui/DataTable.jsx
git commit -m "refactor(ui): replace DataTable with AntD Table wrapper and enable pagination"
```

---

## Phase 3 — DateInput

### Task 11: DateInput Wrapper (new)

**Files:**
- Create: `erp-app/src/components/ui/DateInput.jsx`

**Catatan:** API: `<DateInput value="YYYY-MM-DD" onChange={(e) => ...}/>` — meng-emit event-like object `{ target: { value: 'YYYY-MM-DD' } }` supaya compatible dengan pattern lama `onChange={(e) => setState(e.target.value)}`.

- [ ] **Step 1: Buat file DateInput**

Create file `erp-app/src/components/ui/DateInput.jsx`:

```jsx
import { DatePicker } from 'antd'
import dayjs from 'dayjs'

export default function DateInput({
  label,
  error,
  value,
  onChange,
  placeholder = 'Pilih tanggal',
  disabled,
  ...props
}) {
  const dayjsValue = value ? dayjs(value) : null

  const handleChange = (d) => {
    const iso = d ? d.format('YYYY-MM-DD') : ''
    if (onChange) onChange({ target: { value: iso } })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {label && (
        <label style={{ fontSize: 14, fontWeight: 500 }}>{label}</label>
      )}
      <DatePicker
        value={dayjsValue && dayjsValue.isValid() ? dayjsValue : null}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        format="YYYY-MM-DD"
        status={error ? 'error' : undefined}
        style={{ width: '100%' }}
        {...props}
      />
      {error && <span style={{ color: '#ff4d4f', fontSize: 12 }}>{error}</span>}
    </div>
  )
}
```

- [ ] **Step 2: Build verify**

Run: `cd erp-app && npm run build`
Expected: build pass.

- [ ] **Step 3: Commit**

```bash
git add erp-app/src/components/ui/DateInput.jsx
git commit -m "feat(ui): add DateInput wrapper using AntD DatePicker with ISO string I/O"
```

---

### Task 12: Sweep 17 files — ganti `<input type="date">` ke `<DateInput>`

**Files (17):**
- Modify: `erp-app/src/pages/accounting/ManualJournalFormPage.jsx`
- Modify: `erp-app/src/pages/assets/DepreciationRunPage.jsx`
- Modify: `erp-app/src/pages/cash/TransferFormPage.jsx`
- Modify: `erp-app/src/pages/cash/PaymentFormPage.jsx`
- Modify: `erp-app/src/pages/reports/AssetsListReportPage.jsx`
- Modify: `erp-app/src/pages/reports/AssetsSummaryReportPage.jsx`
- Modify: `erp-app/src/pages/reports/AssetDisposalsReportPage.jsx`
- Modify: `erp-app/src/pages/assets/AssetFormPage.jsx`
- Modify: `erp-app/src/pages/assets/AssetDisposalFormPage.jsx`
- Modify: `erp-app/src/pages/settings/AuditLogPage.jsx`
- Modify: `erp-app/src/pages/reports/CashFlowPage.jsx`
- Modify: `erp-app/src/pages/reports/IncomeStatementPage.jsx`
- Modify: `erp-app/src/pages/reports/BalanceSheetPage.jsx`
- Modify: `erp-app/src/pages/accounting/LedgerPage.jsx`
- Modify: `erp-app/src/pages/cash/ReconciliationPage.jsx`
- Modify: `erp-app/src/components/shared/DocumentHeader.jsx`
- Modify: `erp-app/src/pages/inventory/StockCardPage.jsx`

- [ ] **Step 1: Per file, lakukan transformasi berikut**

Untuk setiap file di daftar di atas:

1. Tambah import di atas: `import DateInput from '../../components/ui/DateInput'` (sesuaikan relative path — dari `pages/xxx/`: `../../components/ui/DateInput`; dari `components/shared/`: `../ui/DateInput`).

2. Ganti pola:
```jsx
<input type="date" value={X} onChange={(e) => Y(e.target.value)} className="..." />
```
menjadi:
```jsx
<DateInput value={X} onChange={(e) => Y(e.target.value)} />
```

3. Kalau ada `<input type="date">` di dalam struktur `<label>...<input/></label>` dengan label di luar, pindahkan label ke prop `label` dari `DateInput`.

4. Hapus props Tailwind className di elemen yang dihapus.

- [ ] **Step 2: Verify tidak ada `type="date"` tersisa di src**

Run:
```bash
cd erp-app && grep -rn 'type="date"' src/ | grep -v DateInput.jsx
```
Expected: no output.

- [ ] **Step 3: Build verify**

Run: `cd erp-app && npm run build`
Expected: build pass.

- [ ] **Step 4: Commit**

```bash
git add erp-app/src/pages erp-app/src/components/shared
git commit -m "refactor(ui): replace native date inputs with DateInput wrapper in 17 files"
```

---

## Phase 4 — Tailwind Sweep (per area)

**Rule umum untuk Phase 4:**
- Hanya ubah styling — tidak ubah logic, tidak ubah komponen yang di-render (kecuali layout primitives).
- Layout mapping:
  - `flex gap-N` → `<Space>` (horizontal) atau `<Space direction="vertical">`.
  - `grid grid-cols-N` → `<Row gutter={...}>` + `<Col span={...}>`.
  - `p-N`, `m-N` → `style={{ padding: ..., margin: ... }}` (acuan: `4` = 16px, `2` = 8px, `6` = 24px).
  - `w-full`, `h-full`, `flex-1` → inline style.
  - `rounded-lg`, `shadow` → pakai AntD `<Card>` kalau container utama, atau inline style untuk kasus kecil.
  - Warna text/bg (`text-gray-700`, `bg-white`) → hapus, biarkan default AntD theme.
- Kalau ada container card pattern (border + rounded + padding), ganti ke `<Card>` dari AntD.
- Jangan hapus Tailwind config di Phase 4 — masih aktif sebagai fallback; dihapus di Task 18.

### Task 13: Sweep master + purchase + sales pages

**Files:**
- Modify: semua `.jsx` di `erp-app/src/pages/master/`
- Modify: semua `.jsx` di `erp-app/src/pages/purchase/`
- Modify: semua `.jsx` di `erp-app/src/pages/sales/`

- [ ] **Step 1: Per file, hapus Tailwind utility class dan ganti layout pattern sesuai rule umum di atas**

Fokus:
- Container halaman: bungkus dengan `<Card title="...">` atau `<div style={{ padding: 24 }}>`.
- Form row: `<Row gutter={16}>` + `<Col span={12}>`.
- Action bar: `<Space>`.

- [ ] **Step 2: Build verify**

Run: `cd erp-app && npm run build`
Expected: build pass.

- [ ] **Step 3: Dev smoke test**

Run `cd erp-app && npm run dev`, buka halaman master (Pelanggan, Supplier, Item, Akun), purchase, sales — pastikan tidak ada halaman putih / layout rusak parah. Tailwind utility lain masih boleh ada (sweep parsial).

- [ ] **Step 4: Commit**

```bash
git add erp-app/src/pages/master erp-app/src/pages/purchase erp-app/src/pages/sales
git commit -m "refactor(ui): sweep Tailwind classes in master/purchase/sales pages"
```

---

### Task 14: Sweep accounting + cash pages

**Files:**
- Modify: semua `.jsx` di `erp-app/src/pages/accounting/`
- Modify: semua `.jsx` di `erp-app/src/pages/cash/`

**Catatan penting:** Halaman `ManualJournalFormPage.jsx` berisi form debit/kredit balance — JANGAN ubah logic, hanya styling. Verifikasi total debit = kredit masih muncul sama persis.

- [ ] **Step 1: Per file, ikuti rule umum Phase 4**

- [ ] **Step 2: Build verify**

Run: `cd erp-app && npm run build`
Expected: build pass.

- [ ] **Step 3: Dev smoke test — modul finansial kritis**

Run `cd erp-app && npm run dev`, test:
- Jurnal list + form manual journal: tambah line, total debit/kredit sync, submit.
- Ledger list dengan filter tanggal.
- Kas/Bank: Payment form, Transfer form, Reconciliation page tetap render dan interaksi normal.

- [ ] **Step 4: Commit**

```bash
git add erp-app/src/pages/accounting erp-app/src/pages/cash
git commit -m "refactor(ui): sweep Tailwind classes in accounting/cash pages"
```

---

### Task 15: Sweep assets + inventory pages + components/assets

**Files:**
- Modify: semua `.jsx` di `erp-app/src/pages/assets/`
- Modify: semua `.jsx` di `erp-app/src/pages/inventory/`
- Modify: semua `.jsx` di `erp-app/src/components/assets/`

- [ ] **Step 1: Per file, ikuti rule umum Phase 4**

- [ ] **Step 2: Build verify**

Run: `cd erp-app && npm run build`
Expected: build pass.

- [ ] **Step 3: Dev smoke test — Aset**

Run dev, test:
- Assets list page (filter, click row).
- Asset form (create + edit).
- Depreciation Run page: preview 3-step workflow, post batch.
- Disposal form page: preview + execute.
- Stock card page (inventory).

- [ ] **Step 4: Commit**

```bash
git add erp-app/src/pages/assets erp-app/src/pages/inventory erp-app/src/components/assets
git commit -m "refactor(ui): sweep Tailwind classes in assets/inventory pages"
```

---

### Task 16: Sweep reports pages

**Files:**
- Modify: semua `.jsx` di `erp-app/src/pages/reports/`

**Catatan:** Reports banyak tabel besar — pastikan `DataTable` render dengan pagination default (pageSize 20). Verifikasi export Excel/PDF masih jalan (tombol trigger utility, tidak disentuh).

- [ ] **Step 1: Per file, ikuti rule umum Phase 4**

- [ ] **Step 2: Build verify**

Run: `cd erp-app && npm run build`
Expected: build pass.

- [ ] **Step 3: Dev smoke test — Laporan**

Run dev, test:
- Neraca (BalanceSheet), Laba Rugi (IncomeStatement), Arus Kas (CashFlow).
- Assets reports (list, summary, disposals).
- Klik tombol export Excel dan PDF — file ter-generate.

- [ ] **Step 4: Commit**

```bash
git add erp-app/src/pages/reports
git commit -m "refactor(ui): sweep Tailwind classes in reports pages"
```

---

### Task 17: Sweep settings + Dashboard + Login + App shell + shared

**Files:**
- Modify: semua `.jsx` di `erp-app/src/pages/settings/`
- Modify: `erp-app/src/pages/DashboardPage.jsx`
- Modify: `erp-app/src/pages/LoginPage.jsx`
- Modify: `erp-app/src/App.jsx`
- Modify: semua `.jsx` di `erp-app/src/components/shared/` (yang belum)

**Catatan App shell:**
- Bungkus root layout dengan AntD `<Layout>`: `<Sider>` untuk sidebar, `<Header>` untuk top bar, `<Content>` untuk page.
- Sidebar navigation → `<Menu mode="inline">` dengan `items` prop.
- LoginPage: container → `<Card>`, form inputs sudah pakai wrapper dari Phase 2.
- RoleGuard loading state (existing) tidak disentuh — itu logic.

- [ ] **Step 1: Refactor App.jsx shell ke AntD Layout + Menu**

Untuk `App.jsx`:
- Ganti sidebar `<aside>` ke `<Layout.Sider>` + `<Menu>` (items dari existing route config).
- Ganti header bar ke `<Layout.Header>`.
- Ganti main content wrapper ke `<Layout.Content style={{ padding: 24 }}>`.
- Hapus semua Tailwind utility classes di App.jsx.

- [ ] **Step 2: Sweep LoginPage, DashboardPage, settings/*, components/shared/***

Ikuti rule umum Phase 4.

- [ ] **Step 3: Build verify**

Run: `cd erp-app && npm run build`
Expected: build pass.

- [ ] **Step 4: Dev smoke test — Shell & Auth**

Run dev, test:
- Login page render, login berhasil.
- Sidebar navigation berfungsi (all menu items click).
- Dashboard render.
- Audit log page + settings pages.
- RoleGuard: akses halaman `/assets/disposal` sebagai non-admin → redirect dengan benar (loading state tidak premature).

- [ ] **Step 5: Commit**

```bash
git add erp-app/src/App.jsx erp-app/src/pages/LoginPage.jsx erp-app/src/pages/DashboardPage.jsx erp-app/src/pages/settings erp-app/src/components/shared
git commit -m "refactor(ui): migrate App shell and auth pages to AntD Layout"
```

---

## Phase 5 — Cleanup & Verify

### Task 18: Remove Tailwind dari build

**Files:**
- Modify: `erp-app/vite.config.js`
- Modify: `erp-app/src/index.css`
- Modify: `erp-app/package.json`
- Delete: `erp-app/tailwind.config.*` (jika ada)
- Delete: `erp-app/postcss.config.*` (jika ada)

- [ ] **Step 1: Cek sisa Tailwind utility di src**

Run:
```bash
cd erp-app && grep -rEn 'className="[^"]*(bg-|text-|p-[0-9]|m-[0-9]|flex |grid |gap-|w-full|rounded|border-gray|shadow)' src/ | head -50
```

Expected: output bisa masih ada beberapa utility kecil yang non-blocking. Kalau jumlahnya masif (>50 occurrences), jangan lanjut — balik ke Task 13–17 dan sweep lanjutan.

- [ ] **Step 2: Hapus `@tailwindcss/vite` plugin dari `vite.config.js`**

Hapus line `import tailwindcss from '@tailwindcss/vite'` dan `tailwindcss()` dari array plugins. File setelahnya harus minimal seperti:

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
```

(Pertahankan opsi lain yang sudah ada di file kalau bukan Tailwind.)

- [ ] **Step 3: Bersihkan `src/index.css`**

Buka `erp-app/src/index.css`. Hapus semua directive `@import "tailwindcss";` / `@tailwind base;` / `@tailwind components;` / `@tailwind utilities;`. Biarkan custom CSS yang ada (kalau ada). Kalau file jadi kosong, biarkan file kosong saja (import di main.jsx masih jalan).

- [ ] **Step 4: Hapus dependencies Tailwind**

Run:
```bash
cd erp-app && npm uninstall tailwindcss @tailwindcss/vite
```

- [ ] **Step 5: Hapus file config Tailwind kalau ada**

Run:
```bash
cd erp-app && rm -f tailwind.config.js tailwind.config.cjs tailwind.config.mjs postcss.config.js postcss.config.cjs postcss.config.mjs
```

- [ ] **Step 6: Build verify**

Run: `cd erp-app && npm run build`
Expected: build pass, tidak ada error Tailwind-related.

- [ ] **Step 7: Cari residu utility yang sekarang no-op**

Run:
```bash
cd erp-app && grep -rEn 'className="[^"]*(bg-blue-|text-gray-|p-4|m-4|flex |grid |gap-|rounded-lg|shadow-)' src/ | wc -l
```
Expected: angka kecil (<30). Residu masih boleh ada (tidak break karena Tailwind sudah tidak di-process — class hanya jadi no-op). Kalau angka besar dan UI kelihatan rusak, hapus class residu per halaman sebelum commit.

- [ ] **Step 8: Commit**

```bash
git add erp-app/vite.config.js erp-app/src/index.css erp-app/package.json erp-app/package-lock.json
git commit -m "chore(ui): remove Tailwind from build pipeline and dependencies"
```

---

### Task 19: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full build + bundle size check**

Run: `cd erp-app && npm run build`

Expected output berisi baris mirip:
```
dist/assets/index-XXXXXXXX.js   XXX.XX kB │ gzip: XXX.XX kB
```

Verifikasi: main chunk < 3MB (3072 kB). Kalau lebih:
- Aktifkan manual chunk splitting: tambah ke `vite.config.js`:
  ```js
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          antd: ['antd'],
          vendor: ['react', 'react-dom', 'react-router-dom']
        }
      }
    }
  }
  ```
- Build ulang dan verifikasi main chunk turun.

- [ ] **Step 2: Full smoke test checklist**

Run dev: `cd erp-app && npm run dev`. Test semua modul:
- [ ] Login + RoleGuard routing (admin & non-admin)
- [ ] Dashboard render
- [ ] Master: Pelanggan, Supplier, Item, Akun (COA) — CRUD list & form
- [ ] Purchase & Sales pages — list + form
- [ ] Accounting: Jurnal list, Manual Journal form (total debit=kredit, submit)
- [ ] Accounting: Ledger dengan filter tanggal
- [ ] Cash/Bank: Payment, Transfer, Reconciliation
- [ ] Assets: list, form create, form edit, Depreciation Run 3-step, Disposal form
- [ ] Inventory: Stock Card
- [ ] Reports: Neraca, Laba Rugi, Arus Kas, Assets list/summary/disposals — render + export Excel & PDF
- [ ] Settings: Audit Log, user settings (kalau ada)
- [ ] Modal, Toast, ConfirmDialog interaksi
- [ ] DateInput: pilih tanggal di semua halaman form yang pakai

- [ ] **Step 3: Visual check**

Tidak ada halaman putih, tidak ada layout berantakan parah, warna primary biru AntD konsisten di semua halaman.

- [ ] **Step 4: Final commit (dokumentasi hasil)**

Kalau ada tambahan vite config untuk chunk splitting, commit:

```bash
git add erp-app/vite.config.js
git commit -m "chore(build): add manual chunk splitting for antd"
```

Kalau build dan test pass tanpa perubahan tambahan, tidak perlu commit.

- [ ] **Step 5: Update memory record**

Update `C:\Users\m3m31\.claude\projects\c--Project\memory\project_erp_acc_antd_migration.md`:
- Status: DONE
- Tanggal selesai
- Catatan bundle size final
- Residual Tailwind utility (jika ada) dan rencana follow-up
