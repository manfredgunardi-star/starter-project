# PO Print Playwright Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tulis dan jalankan 7 Playwright E2E tests untuk fitur cetak Purchase Order, dengan test data yang dibuat dan dihapus otomatis via Supabase client.

**Architecture:** `beforeAll` login ke Supabase + buat PO dummy → jalankan 7 test dengan real browser → `afterAll` hard delete PO dummy. Credentials dan Supabase config disimpan di `.env.test` (gitignored). `window.print` di-mock via `addInitScript`, PDF diverifikasi via `page.waitForEvent('download')`.

**Tech Stack:** `@playwright/test` (sudah terpasang), `@supabase/supabase-js` (sudah terpasang), `dotenv` (perlu diinstall)

---

## File Map

| Status | File | Perubahan |
|--------|------|-----------|
| CREATE | `erp-app/tests/po-print.spec.js` | Test suite — 7 tests + setup/teardown |
| CREATE | `erp-app/.env.test` | Credentials + Supabase config (gitignored) |
| MODIFY | `erp-app/.gitignore` | Tambah `.env.test` dan `tests/.auth.json` |

---

## Task 1: Install dotenv dan setup file environment

**Files:**
- Modify: `erp-app/package.json` (via npm install)
- Create: `erp-app/.env.test`
- Modify: `erp-app/.gitignore`

- [ ] **Step 1: Install dotenv sebagai devDependency**

Jalankan dari `C:\Project\ERP-ACC\erp-app\`:
```bash
cd C:\Project\ERP-ACC\erp-app && npm install --save-dev dotenv
```

Expected output: `added 1 package` (atau serupa). Tidak ada error.

- [ ] **Step 2: Buat file `erp-app/.env.test`**

Buat file baru dengan isi berikut (path: `C:\Project\ERP-ACC\erp-app\.env.test`):

```
TEST_EMAIL=manfred.gunardi@gmail.com
TEST_PASSWORD=@35010368Aa
VITE_SUPABASE_URL=https://cjnszzfbxgyszoskfgva.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqbnN6emZieGd5c3pvc2tmZ3ZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3NTE3OTIsImV4cCI6MjA5MTMyNzc5Mn0.ASi9aoiy3rk06sEgsONn8j6ZgU3oIrvIrYpzlXN6JUk
```

- [ ] **Step 3: Update `erp-app/.gitignore` — tambah 2 baris**

Tambahkan di akhir file `C:\Project\ERP-ACC\erp-app\.gitignore`:

```
.env.test
tests/.auth.json
```

- [ ] **Step 4: Commit**

```bash
cd C:\Project && git add ERP-ACC/erp-app/package.json ERP-ACC/erp-app/package-lock.json ERP-ACC/erp-app/.gitignore
git commit -m "chore: install dotenv, update gitignore for test credentials"
```

Note: **JANGAN** commit `.env.test` — file ini harus tetap di-gitignore.

---

## Task 2: Tulis `po-print.spec.js`

**Files:**
- Create: `erp-app/tests/po-print.spec.js`

File ini berisi seluruh test suite: setup Supabase, buat PO dummy, 7 tests, cleanup.

**Konteks penting:**
- `supabase` client di-import dari `@supabase/supabase-js` yang sudah terpasang sebagai dependency utama app
- `testPoId` dan `testPoNumber` adalah module-level variables yang di-set di `beforeAll` dan dipakai di semua tests
- `test.use({ storageState })` harus di dalam `test.describe` — file `.auth.json` dibuat oleh `beforeAll` sebelum test pertama berjalan
- `addInitScript` di Tests 2 dan 5 harus dipanggil SEBELUM `page.goto` agar mock aktif saat halaman load

- [ ] **Step 1: Buat file `erp-app/tests/po-print.spec.js`**

```js
// erp-app/tests/po-print.spec.js
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.test' })

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

let testPoId = null
let testPoNumber = null

test.describe('PO Print Feature', () => {

  test.use({ storageState: 'tests/.auth.json' })

  test.beforeAll(async ({ browser }) => {
    // --- Setup Supabase client ---
    const { error: authErr } = await supabase.auth.signInWithPassword({
      email: process.env.TEST_EMAIL,
      password: process.env.TEST_PASSWORD,
    })
    if (authErr) throw new Error(`Supabase login gagal: ${authErr.message}`)

    const { data: { user } } = await supabase.auth.getUser()

    // Ambil data master pertama yang ada
    const { data: supplier, error: sErr } = await supabase
      .from('suppliers').select('id').limit(1).single()
    if (sErr) throw new Error(`Tidak ada supplier: ${sErr.message}`)

    const { data: product, error: pErr } = await supabase
      .from('products').select('id').limit(1).single()
    if (pErr) throw new Error(`Tidak ada product: ${pErr.message}`)

    const { data: unit, error: uErr } = await supabase
      .from('units').select('id').limit(1).single()
    if (uErr) throw new Error(`Tidak ada unit: ${uErr.message}`)

    // Buat PO dummy
    testPoNumber = `PO-TEST-${Date.now()}`
    const { data: po, error: poErr } = await supabase
      .from('purchase_orders')
      .insert({
        po_number: testPoNumber,
        date: new Date().toISOString().split('T')[0],
        supplier_id: supplier.id,
        status: 'draft',
        notes: '__PLAYWRIGHT_TEST__',
        total: 100000,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (poErr) throw new Error(`Gagal buat test PO: ${poErr.message}`)
    testPoId = po.id

    // Buat PO item
    const { error: itemErr } = await supabase.from('purchase_order_items').insert({
      purchase_order_id: testPoId,
      product_id: product.id,
      unit_id: unit.id,
      quantity: 1,
      quantity_base: 1,
      unit_price: 100000,
      tax_amount: 0,
      total: 100000,
    })
    if (itemErr) throw new Error(`Gagal buat test PO item: ${itemErr.message}`)

    // Login browser dan simpan session
    const page = await browser.newPage()
    await page.goto('/login')
    await page.fill('input[type=email]', process.env.TEST_EMAIL)
    await page.fill('input[type=password]', process.env.TEST_PASSWORD)
    await page.click('button[type=submit]')
    await page.waitForURL('**/dashboard**', { timeout: 15000 })
    await page.context().storageState({ path: 'tests/.auth.json' })
    await page.close()
  })

  test.afterAll(async () => {
    if (testPoId) {
      await supabase.from('purchase_order_items')
        .delete().eq('purchase_order_id', testPoId)
      await supabase.from('purchase_orders')
        .delete().eq('id', testPoId)
    }
    await supabase.auth.signOut()
  })

  // --- Test 1 ---
  test('PO list loads dengan kolom Aksi', async ({ page }) => {
    await page.goto('/purchase/orders')
    await expect(
      page.locator('h3:has-text("Purchase Order"), h4:has-text("Purchase Order")')
    ).toBeVisible({ timeout: 10000 })
    await expect(page.locator('th:has-text("Aksi")')).toBeVisible()
  })

  // --- Test 2 ---
  test('Print icon di list memanggil window.print', async ({ page }) => {
    await page.addInitScript(() => {
      window._printCalled = false
      window.print = () => { window._printCalled = true }
    })
    await page.goto('/purchase/orders')
    const row = page.locator('tr').filter({ hasText: testPoNumber })
    await expect(row).toBeVisible({ timeout: 10000 })
    await row.locator('button[title="Print PO"]').click()
    await page.waitForSelector('#invoice-print-root .invoice-template', { timeout: 10000 })
    const printed = await page.evaluate(() => window._printCalled)
    expect(printed).toBe(true)
    await expect(page.locator('#invoice-print-root .invoice-template'))
      .toContainText('Purchase Order')
  })

  // --- Test 3 ---
  test('PDF icon di list mendownload file po-*.pdf', async ({ page }) => {
    await page.goto('/purchase/orders')
    const row = page.locator('tr').filter({ hasText: testPoNumber })
    await expect(row).toBeVisible({ timeout: 10000 })
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30000 }),
      row.locator('button[title="Download PDF"]').click(),
    ])
    expect(download.suggestedFilename()).toMatch(/^po-/)
  })

  // --- Test 4 ---
  test('PO form menampilkan tombol Print dan Download PDF', async ({ page }) => {
    await page.goto(`/purchase/orders/${testPoId}`)
    await expect(page.locator('button:has-text("Print")')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('button:has-text("Download PDF")')).toBeVisible()
  })

  // --- Test 5 ---
  test('Print button di form memanggil window.print', async ({ page }) => {
    await page.addInitScript(() => {
      window._printCalled = false
      window.print = () => { window._printCalled = true }
    })
    await page.goto(`/purchase/orders/${testPoId}`)
    await expect(page.locator('button:has-text("Print")')).toBeVisible({ timeout: 10000 })
    await page.locator('button:has-text("Print")').click()
    await page.waitForSelector('#invoice-print-root .invoice-template', { timeout: 10000 })
    const printed = await page.evaluate(() => window._printCalled)
    expect(printed).toBe(true)
    await expect(page.locator('#invoice-print-root .invoice-template'))
      .toContainText('Purchase Order')
  })

  // --- Test 6 ---
  test('PDF button di form mendownload file po-*.pdf', async ({ page }) => {
    await page.goto(`/purchase/orders/${testPoId}`)
    await expect(page.locator('button:has-text("Download PDF")')).toBeVisible({ timeout: 10000 })
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30000 }),
      page.locator('button:has-text("Download PDF")').click(),
    ])
    expect(download.suggestedFilename()).toMatch(/^po-/)
  })

  // --- Test 7 ---
  test('Form PO baru tidak menampilkan tombol Print dan PDF', async ({ page }) => {
    await page.goto('/purchase/orders/new')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('button:has-text("Print")')).toHaveCount(0)
    await expect(page.locator('button:has-text("Download PDF")')).toHaveCount(0)
  })

})
```

- [ ] **Step 2: Commit**

```bash
cd C:\Project && git add ERP-ACC/erp-app/tests/po-print.spec.js
git commit -m "test: add Playwright E2E test suite for PO print feature"
```

---

## Task 3: Jalankan tests dan verifikasi semua pass

**Files:**
- Tidak ada file yang diubah di step ini
- Test run akan membuat `erp-app/tests/.auth.json` sementara (gitignored)

**Prasyarat:** Dev server harus berjalan di port 5173.

- [ ] **Step 1: Pastikan dev server berjalan**

Buka terminal baru dan jalankan:
```bash
cd C:\Project\ERP-ACC\erp-app && npm run dev
```

Tunggu sampai output menampilkan:
```
  ➜  Local:   http://localhost:5173/
```

Biarkan terminal ini tetap berjalan.

- [ ] **Step 2: Jalankan test suite**

Di terminal terpisah:
```bash
cd C:\Project\ERP-ACC\erp-app && npx playwright test tests/po-print.spec.js --reporter=list
```

Expected output (semua 7 pass):
```
  ✓  PO Print Feature > PO list loads dengan kolom Aksi
  ✓  PO Print Feature > Print icon di list memanggil window.print
  ✓  PO Print Feature > PDF icon di list mendownload file po-*.pdf
  ✓  PO Print Feature > PO form menampilkan tombol Print dan Download PDF
  ✓  PO Print Feature > Print button di form memanggil window.print
  ✓  PO Print Feature > PDF button di form mendownload file po-*.pdf
  ✓  PO Print Feature > Form PO baru tidak menampilkan tombol Print dan PDF

  7 passed
```

- [ ] **Step 3: Jika ada test yang gagal — debug**

Jalankan dengan mode UI untuk melihat apa yang terjadi:
```bash
cd C:\Project\ERP-ACC\erp-app && npx playwright test tests/po-print.spec.js --ui
```

Atau jalankan satu test spesifik dengan headed browser:
```bash
cd C:\Project\ERP-ACC\erp-app && npx playwright test tests/po-print.spec.js --headed --grep "Print icon"
```

Kasus umum yang perlu ditangani:

**Jika beforeAll gagal dengan "Tidak ada supplier/product/unit":**
- Berarti database kosong. Buat minimal satu supplier, product, dan unit via UI dulu, lalu jalankan ulang test.

**Jika login gagal (dashboard tidak ditemukan):**
- Cek URL dashboard app. Jika bukan `/dashboard`, update `waitForURL('**/dashboard**')` ke pattern yang benar (misalnya `**/'` atau `**/home**`).

**Jika Test 2/5 gagal di `waitForSelector('#invoice-print-root .invoice-template')`:**
- Kemungkinan template tidak ter-render karena `getCompanySettings()` gagal. Pastikan ada data di tabel `company_settings` di Supabase.

**Jika Test 3/6 (PDF download) timeout:**
- jsPDF membutuhkan waktu lebih lama untuk render. Naikkan timeout dari 30000ms ke 60000ms.

- [ ] **Step 4: Setelah semua 7 test pass — push**

```bash
cd C:\Project && git push origin main
```
