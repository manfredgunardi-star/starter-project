# Handoff to Codex — ERP-ACC Phase 1: Tasks 16, 17, 19

**Date:** 2026-05-15
**From:** Claude (Sonnet, session after task 13 handoff)
**To:** Codex (OpenAI)
**Branch:** `claude/affectionate-poitras-b50616`
**Worktree:** `C:\Project\apps\erp-acc\.claude\worktrees\affectionate-poitras-b50616\`

---

## TL;DR

Claude selesaikan Tasks 14, 15, 18, 20. Tersisa untuk Codex: **Task 16** (GoodsDeliveryFormPage — warehouse dropdown), **Task 17** (GoodsReceiptFormPage — warehouse dropdown, mirror Task 16), **Task 19** (Playwright e2e smoke test).

**Semua file Codex sebelumnya (Tasks 2-13) belum di-stage/commit.** Sebelum mulai, commit dulu atau koordinasikan staging dengan session sebelumnya.

---

## Status Branch Saat Ini

### Commits di Branch (git log --oneline -10)
```
5ba01ec feat(erp-acc): add payment_term selector with auto due_date to PI form   ← Claude Task 15
bb8c73d feat(erp-acc): add payment_term selector with auto due_date to SI form   ← Claude Task 14
42aee54 feat(erp-acc): join product_categories & tax_codes in getProducts         ← Claude Task 18
0089fed docs(erp-acc): update plan RLS blueprint + add Codex handoff for Phase 1
3a79dd5 fix(erp-acc): split master tier 1 RLS into per-action policies, restrict delete to admin
c459344 feat(erp-acc): add master data tier 1 schema with backfill defaults       ← SQL Migration 026
```

### Unstaged Changes (Codex Tasks 2-13, belum di-commit)
File-file berikut diubah oleh Codex sesi sebelumnya tapi **belum di-stage**:
- `src/App.jsx`
- `src/components/layout/Sidebar.jsx`
- `src/pages/master/ProductsPage.jsx`
- `src/pages/sales/SalesOrderFormPage.jsx`
- `src/pages/purchase/PurchaseOrderFormPage.jsx`
- `src/services/masterDataService.js`
- `src/services/salesService.js`
- `src/services/purchaseService.js`

Dan file-file **baru (untracked)**:
- `src/services/productCategoryService.js`
- `src/services/paymentTermService.js`
- `src/services/taxCodeService.js`
- `src/services/warehouseService.js`
- `src/pages/master/ProductCategoriesPage.jsx`
- `src/pages/master/PaymentTermsPage.jsx`
- `src/pages/master/TaxCodesPage.jsx`
- `src/pages/master/WarehousesPage.jsx`
- `apps/erp-acc/docs/superpowers/handoff-claude-2026-05-14-master-data-task18.md`

**Langkah wajib sebelum Task 16-17-19:** Stage dan commit semua perubahan Tasks 2-13 terlebih dahulu (atau pastikan worktree bersih dari konflik).

---

## Selesai oleh Claude (Referensi)

### Task 18 — `masterDataService.getProducts()` (commit `42aee54`)
`getProducts()` sekarang join dua tabel baru:
```js
.select(`
  *,
  base_unit:units!products_base_unit_id_fkey(id, name),
  conversions:unit_conversions(...),
  category_ref:product_categories!products_category_id_fkey(id, code, name),
  default_tax_code:tax_codes!products_default_tax_code_id_fkey(id, code, name, rate, is_inclusive)
`)
```

### Task 14 — `SalesInvoiceFormPage.jsx` (commit `bb8c73d`)
- Tambah `paymentTerms` state, dropdown "Syarat Pembayaran"
- Auto-compute `due_date = invoice.date + payment_term.net_days` via `dayjs`
- `saveSalesInvoice` di `salesService.js` sekarang post-RPC update `invoices.payment_term_id`

### Task 15 — `PurchaseInvoiceFormPage.jsx` (commit `5ba01ec`)
Mirror persis Task 14 untuk AP invoice.

### Task 20 — Verification
- Build: ✅ `npm run build` pass (exit 0)
- Lint (5 files changed): 0 errors, 4 warnings (acceptable — pre-existing pattern)

---

## Tugas Codex: Task 16, 17, 19

---

## Task 16: Update GoodsDeliveryFormPage — Warehouse Dropdown

**File yang diubah:**
1. `apps/erp-acc/erp-app/src/pages/sales/GoodsDeliveryFormPage.jsx`
2. `apps/erp-acc/erp-app/src/services/salesService.js`

### State file saat ini

**GoodsDeliveryFormPage.jsx** — current imports:
```js
import { Space, Flex, Typography, Alert } from 'antd'
// TIDAK ada Select — harus ditambah
import { getGoodsDelivery, saveGoodsDelivery, postGoodsDelivery, getSalesOrder } from '../../services/salesService'
```

**Header state saat ini:**
```js
const [header, setHeader] = useState({
  gd_number: '',
  date: today(),
  customer_id: '',
  sales_order_id: '',
  status: 'draft',
  notes: '',
})
```

**saveGoodsDelivery di salesService.js** — RPC payload saat ini:
```js
export async function saveGoodsDelivery(gd, items) {
  const { data, error } = await supabase.rpc('save_goods_delivery', {
    p_gd: {
      id:             gd.id             || null,
      date:           gd.date,
      customer_id:    gd.customer_id,
      sales_order_id: gd.sales_order_id || null,
      status:         gd.status         || 'draft',
      notes:          gd.notes          || null,
    },
    // ...
  })
  if (error) throw error
  return data  // returns gd id
}
```

### Perubahan yang diperlukan

**A. GoodsDeliveryFormPage.jsx:**

1. Tambah `Select as AntdSelect` ke antd import:
   ```js
   import { Space, Flex, Typography, Alert, Select as AntdSelect } from 'antd'
   ```

2. Tambah import warehouse service:
   ```js
   import { getWarehouses, getDefaultWarehouse } from '../../services/warehouseService'
   ```

3. Tambah state `warehouses`:
   ```js
   const [warehouses, setWarehouses] = useState([])
   ```

4. Tambah `warehouse_id: ''` ke header initial state:
   ```js
   const [header, setHeader] = useState({
     gd_number: '',
     date: today(),
     customer_id: '',
     sales_order_id: '',
     warehouse_id: '',   // ← tambah ini
     status: 'draft',
     notes: '',
   })
   ```

5. Load warehouses + default pada mount. Untuk GD baru, prefill default warehouse:
   ```js
   useEffect(() => {
     Promise.all([getWarehouses(), getDefaultWarehouse()])
       .then(([whs, def]) => {
         setWarehouses(whs)
         if (isNew && def) setHeader(h => ({ ...h, warehouse_id: def.id }))
       })
       .catch(err => toast.error('Gagal load gudang: ' + err.message))
   }, [])
   ```

6. Dalam useEffect load existing GD (`if (!isNew) { getGoodsDelivery(id)... }`), tambah field ke setHeader:
   ```js
   warehouse_id: gd.warehouse_id || '',
   ```

7. Dalam useEffect load-dari-SO (`from_so` query param), tambah prefill warehouse dari SO:
   ```js
   setHeader(h => ({
     ...h,
     customer_id: so.customer_id,
     sales_order_id: so.id,
     warehouse_id: so.warehouse_id || h.warehouse_id, // inherit dari SO jika ada
   }))
   ```

8. Tambah warehouse Select UI — letakkan **setelah DocumentHeader dan sebelum items section**:
   ```jsx
   <Card size="small">
     <Row gutter={16}>
       <Col xs={24} md={10}>
         <div style={{ marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Gudang</div>
         <AntdSelect
           showSearch
           optionFilterProp="label"
           style={{ width: '100%' }}
           placeholder="Pilih gudang..."
           value={header.warehouse_id || undefined}
           onChange={v => setHeader(h => ({ ...h, warehouse_id: v || '' }))}
           disabled={readOnly}
           options={warehouses.map(w => ({ value: w.id, label: w.name }))}
         />
       </Col>
     </Row>
   </Card>
   ```
   Note: `Card`, `Row`, `Col` belum diimport di file ini — **harus tambah ke antd import**.
   Ubah import antd menjadi:
   ```js
   import { Space, Flex, Typography, Alert, Select as AntdSelect, Card, Row, Col } from 'antd'
   ```

**B. salesService.js — saveGoodsDelivery:**

Sama dengan pola SO/PO/SI/PI — post-RPC direct update untuk `warehouse_id`:
```js
export async function saveGoodsDelivery(gd, items) {
  const { data, error } = await supabase.rpc('save_goods_delivery', {
    p_gd: {
      id:             gd.id             || null,
      date:           gd.date,
      customer_id:    gd.customer_id,
      sales_order_id: gd.sales_order_id || null,
      status:         gd.status         || 'draft',
      notes:          gd.notes          || null,
    },
    p_items: items.map(i => ({
      product_id:    i.product_id,
      unit_id:       i.unit_id,
      quantity:      Number(i.quantity),
      quantity_base: Number(i.quantity_base) || Number(i.quantity),
    })),
  })
  if (error) throw error

  // Persist warehouse_id — not handled by save_goods_delivery RPC
  if (gd.warehouse_id) {
    const { error: whErr } = await supabase
      .from('goods_deliveries')
      .update({ warehouse_id: gd.warehouse_id })
      .eq('id', data)
    if (whErr) throw whErr
  }

  return data
}
```

### Build + Commit

```bash
# Dari apps/erp-acc/erp-app
npm run build   # wajib pass

# Dari worktree root
git add apps/erp-acc/erp-app/src/pages/sales/GoodsDeliveryFormPage.jsx
git add apps/erp-acc/erp-app/src/services/salesService.js
git commit -m "feat(erp-acc): add warehouse selector to GD form"
```

---

## Task 17: Update GoodsReceiptFormPage — Warehouse Dropdown

**File yang diubah:**
1. `apps/erp-acc/erp-app/src/pages/purchase/GoodsReceiptFormPage.jsx`
2. `apps/erp-acc/erp-app/src/services/purchaseService.js`

### State file saat ini

**GoodsReceiptFormPage.jsx** — current imports (identik strukturnya dengan GoodsDeliveryFormPage):
```js
import { Space, Flex, Typography, Alert } from 'antd'
// TIDAK ada Select, Card, Row, Col — harus ditambah
import { getGoodsReceipt, saveGoodsReceipt, postGoodsReceipt, getPurchaseOrder } from '../../services/purchaseService'
```

**Header state saat ini:**
```js
const [header, setHeader] = useState({
  gr_number: '',
  date: today(),
  supplier_id: '',
  purchase_order_id: '',
  status: 'draft',
  notes: '',
})
```

**saveGoodsReceipt di purchaseService.js** — RPC payload saat ini:
```js
export async function saveGoodsReceipt(gr, items) {
  const { data, error } = await supabase.rpc('save_goods_receipt', {
    p_gr: {
      id:                gr.id                || null,
      date:              gr.date,
      supplier_id:       gr.supplier_id,
      purchase_order_id: gr.purchase_order_id || null,
      status:            gr.status            || 'draft',
      notes:             gr.notes             || null,
    },
    p_items: items.map(i => ({
      product_id:    i.product_id,
      unit_id:       i.unit_id,
      quantity:      Number(i.quantity),
      quantity_base: Number(i.quantity_base) || Number(i.quantity),
      unit_price:    Number(i.unit_price)    || 0,
    })),
  })
  if (error) throw error
  return data  // returns gr id
}
```

### Perubahan yang diperlukan

**Identik dengan Task 16**, adaptasi untuk GR/PO:

1. Antd import — tambah `Select as AntdSelect, Card, Row, Col`
2. Import `getWarehouses, getDefaultWarehouse` dari `warehouseService`
3. State `warehouses`, tambah `warehouse_id: ''` ke header
4. Load warehouses + prefill default untuk GR baru
5. Load existing GR: tambah `warehouse_id: gr.warehouse_id || ''`
6. Load dari PO (`from_po` query param): prefill `warehouse_id: po.warehouse_id || h.warehouse_id`
7. UI Card dengan warehouse Select (identik Task 16)
8. `saveGoodsReceipt` di `purchaseService.js`: post-RPC update `goods_receipts.warehouse_id`

```js
// Tambahan di purchaseService.saveGoodsReceipt setelah `if (error) throw error`:
if (gr.warehouse_id) {
  const { error: whErr } = await supabase
    .from('goods_receipts')
    .update({ warehouse_id: gr.warehouse_id })
    .eq('id', data)
  if (whErr) throw whErr
}
```

### Build + Commit

```bash
npm run build

git add apps/erp-acc/erp-app/src/pages/purchase/GoodsReceiptFormPage.jsx
git add apps/erp-acc/erp-app/src/services/purchaseService.js
git commit -m "feat(erp-acc): add warehouse selector to GR form"
```

---

## Task 19: Playwright Smoke Test — master-data-tier1.spec.js

**File yang dibuat:**
- `apps/erp-acc/erp-app/tests/playwright/master-data-tier1.spec.js`

### Pattern dari spec existing

Baca `tests/ar-ap-aging.spec.js` untuk referensi auth pattern:
- Gunakan `test.use({ storageState: 'tests/.auth.json' })` untuk auth
- Env vars via `process.env.VITE_SUPABASE_URL`, `process.env.TEST_EMAIL`, dll. (dari `.env.test`)

**Catatan penting:** ESLint project ini melaporkan `'process' is not defined` di test files — ini **pre-existing issue** di seluruh test suite (bukan error baru yang Anda perkenalkan). Abaikan, atau tambah eslint-disable-line jika diperlukan.

### Spec yang harus dibuat

```js
// tests/playwright/master-data-tier1.spec.js
import { test, expect } from '@playwright/test'

test.describe('Master Data Tier 1 — CRUD Smoke', () => {

  test.use({ storageState: 'tests/.auth.json' })

  test('Product Categories: halaman load + seed row ada', async ({ page }) => {
    await page.goto('/master/categories')
    await expect(page.getByText('Kategori Produk')).toBeVisible()
    await expect(page.getByText('Uncategorized')).toBeVisible()
  })

  test('Product Categories: create baru', async ({ page }) => {
    await page.goto('/master/categories')
    await page.getByRole('button', { name: /Tambah/i }).click()
    await page.getByLabel('Kode').fill('E2E-CAT')
    await page.getByLabel('Nama').fill('E2E Test Category')
    await page.getByRole('button', { name: /OK/i }).click()
    await expect(page.getByText('Tersimpan')).toBeVisible()
    await expect(page.getByText('E2E Test Category')).toBeVisible()
  })

  test('Payment Terms: halaman load + 4 seed rows ada', async ({ page }) => {
    await page.goto('/master/payment-terms')
    await expect(page.getByText('CASH')).toBeVisible()
    await expect(page.getByText('NET14')).toBeVisible()
    await expect(page.getByText('NET30')).toBeVisible()
    await expect(page.getByText('NET60')).toBeVisible()
  })

  test('Payment Terms: create Net 45', async ({ page }) => {
    await page.goto('/master/payment-terms')
    await page.getByRole('button', { name: /Tambah/i }).click()
    await page.getByLabel('Kode').fill('NET45')
    await page.getByLabel('Nama').fill('Net 45')
    // InputNumber Net Days
    await page.getByLabel('Net Days').fill('45')
    await page.getByRole('button', { name: /OK/i }).click()
    await expect(page.getByText('Tersimpan')).toBeVisible()
    await expect(page.getByText('Net 45')).toBeVisible()
  })

  test('Tax Codes: 3 seed rows ada (PPN11, PPN0, NON)', async ({ page }) => {
    await page.goto('/master/tax-codes')
    await expect(page.getByText('PPN11')).toBeVisible()
    await expect(page.getByText('PPN0')).toBeVisible()
    await expect(page.getByText('NON')).toBeVisible()
  })

  test('Warehouses: default warehouse ada + badge Default terlihat', async ({ page }) => {
    await page.goto('/master/warehouses')
    await expect(page.getByText('Gudang Utama')).toBeVisible()
    await expect(page.getByText('Default')).toBeVisible()
  })

})
```

**Catatan label selector:** Sesuaikan `page.getByLabel(...)` dengan label Ant Design Form yang diimplementasi Codex. Jika label tidak match, gunakan `page.getByPlaceholder(...)` atau `page.locator('input').nth(n)`.

### Run & Commit

```bash
# Dari apps/erp-acc/erp-app — pastikan dev server running di port yang sesuai playwright.config.js
npx playwright test tests/playwright/master-data-tier1.spec.js --reporter=list
```

Jika auth storage state belum ada (`tests/.auth.json` tidak exist), cek `tests/` apakah ada script setup auth, atau buat manual auth sesuai pattern spec lain di repo.

```bash
git add apps/erp-acc/erp-app/tests/playwright/master-data-tier1.spec.js
git commit -m "test(erp-acc): add master data tier 1 e2e smoke"
```

---

## Constraints & Aturan (Reminder)

1. **Bahasa Indonesia** untuk komunikasi, **English** untuk commit messages.
2. **Tidak boleh deploy production** — hanya dev/staging.
3. **Always soft delete** — sudah diimplementasi di services (Tasks 2-5). Jangan ubah.
4. **ASK before changing financial logic** — posting GD/GR menyentuh inventory + jurnal HPP. Jangan ubah logic posting.
5. **Build wajib pass** — `npm run build` sebelum klaim selesai.
6. **No new npm packages** — reuse existing.
7. **Jangan commit Tasks 2-13** yang belum di-commit dari sesi sebelumnya tanpa memahami isinya — cek dulu dengan `git diff` dan `git status`.

---

## Pattern yang Dipakai Claude (Referensi untuk Task 16-17)

Berikut pattern tepat yang dipakai Claude untuk Task 14/15 — Task 16/17 harus mirip:

### State + Load pattern (dari SalesInvoiceFormPage.jsx yang sudah commit)
```js
const [warehouses, setWarehouses] = useState([])

// di initial header state:
warehouse_id: '',

// useEffect mount:
useEffect(() => {
  Promise.all([getWarehouses(), getDefaultWarehouse()])
    .then(([whs, def]) => {
      setWarehouses(whs)
      if (isNew && def) setHeader(h => ({ ...h, warehouse_id: def.id }))
    })
    .catch(err => toast.error('Gagal load gudang: ' + err.message))
}, [])

// di load existing document:
warehouse_id: gd.warehouse_id || '',
```

### UI pattern (dari SalesInvoiceFormPage.jsx — payment term selector)
```jsx
<Card size="small">
  <Row gutter={16}>
    <Col xs={24} md={10}>
      <div style={{ marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Gudang</div>
      <AntdSelect
        showSearch
        optionFilterProp="label"
        style={{ width: '100%' }}
        placeholder="Pilih gudang..."
        value={header.warehouse_id || undefined}
        onChange={v => setHeader(h => ({ ...h, warehouse_id: v || '' }))}
        disabled={readOnly}
        options={warehouses.map(w => ({ value: w.id, label: w.name }))}
      />
    </Col>
  </Row>
</Card>
```

### Service post-RPC pattern (dari salesService.js / purchaseService.js yang sudah commit)
```js
// Setelah RPC call + if (error) throw error:
if (gd.warehouse_id) {
  const { error: whErr } = await supabase
    .from('goods_deliveries')   // atau 'goods_receipts'
    .update({ warehouse_id: gd.warehouse_id })
    .eq('id', data)
  if (whErr) throw whErr
}
return data
```

---

## Quick Reference

### Paths
```
Worktree root:    C:\Project\apps\erp-acc\.claude\worktrees\affectionate-poitras-b50616\
ERP app:          apps/erp-acc/erp-app/   (relatif dari worktree root)
Services:         apps/erp-acc/erp-app/src/services/
Pages (sales):    apps/erp-acc/erp-app/src/pages/sales/
Pages (purchase): apps/erp-acc/erp-app/src/pages/purchase/
Tests:            apps/erp-acc/erp-app/tests/playwright/
```

### Build & lint commands
```bash
cd apps/erp-acc/erp-app
npm run build                                              # wajib pass
npx eslint src/pages/sales/GoodsDeliveryFormPage.jsx \
           src/services/salesService.js \
           src/pages/purchase/GoodsReceiptFormPage.jsx \
           src/services/purchaseService.js                 # 0 errors
npx playwright test tests/playwright/master-data-tier1.spec.js --reporter=list
```

### warehouseService.js yang sudah ada (Task 5, Codex sesi sebelumnya)
Functions yang bisa digunakan:
- `getWarehouses()` — semua warehouse aktif
- `getDefaultWarehouse()` — warehouse default (nullable, pakai `.maybeSingle()`)
- `setDefaultWarehouse(id)` — toggle default
- `deleteWarehouse(id)` — soft delete (blok jika default)

### Catatan lint
Full project lint: 44 pre-existing errors di file yang tidak disentuh Phase 1 (playwright.config.js, test files existing, asset pages, ToastContext, AuthContext, currency.js). Ini bukan dari pekerjaan Phase 1. Targeted lint ke file yang Anda ubah harus 0 errors.

---

## Laporan Setelah Codex Selesai

Tolong informasikan kembali ke Claude / user:
- Commits yang dibuat (SHA + message)
- File yang ditambahkan/diubah
- Build pass / tidak
- Playwright test results (berapa pass)
- Concerns/blockers

Setelah Tasks 16-17-19 selesai, **Phase 1 Plan selesai seluruhnya**. Siap untuk PR ke `main`.

---

— Claude (Sonnet 4.6, 2026-05-15)
