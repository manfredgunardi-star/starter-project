# Design Spec: Playwright Tests — Cetak Purchase Order

**Tanggal:** 2026-04-17
**Status:** Approved (Updated)
**Scope:** ERP-ACC (`erp-app/tests/`)

---

## Ringkasan

Menambahkan Playwright test suite untuk fitur cetak Purchase Order. Test berjalan terhadap local dev server (`http://localhost:5173`) dengan login asli menggunakan credentials dari environment variable. Test data (satu PO dummy) dibuat via Supabase client di `beforeAll` dan di-hard delete di `afterAll` sehingga tidak pernah muncul di UI setelah test selesai. 7 test end-to-end memverifikasi seluruh flow.

---

## Keputusan Desain

| Pertanyaan | Keputusan |
|---|---|
| Target environment | Local dev server (`http://localhost:5173`) |
| Auth approach | Login nyata dengan credentials Supabase |
| Session management | `beforeAll` login sekali, simpan ke `tests/.auth.json` |
| Credentials storage | `.env.test` (gitignored) |
| Test data | Buat PO dummy via Supabase client di `beforeAll`, hard delete di `afterAll` |
| Test data visibility | Hard delete setelah test — tidak muncul di UI |
| window.print mock | `addInitScript` override sebelum klik |
| PDF verification | `page.waitForEvent('download')` |
| Jumlah test | 7 test |

---

## File

### File Baru

| File | Tujuan |
|------|--------|
| `erp-app/tests/po-print.spec.js` | Test suite utama — 7 test |
| `erp-app/.env.test` | Credentials + Supabase config (gitignored) |

### File yang Dimodifikasi

| File | Perubahan |
|------|-----------|
| `erp-app/.gitignore` | Tambah `.env.test` dan `tests/.auth.json` jika belum ada |

### File Tidak Diubah

- `erp-app/tests/invoice-print.spec.js` — tidak disentuh
- `erp-app/playwright.config.js` — tidak disentuh

---

## Environment Variables (`.env.test`)

```
TEST_EMAIL=manfred.gunardi@gmail.com
TEST_PASSWORD=@35010368Aa
VITE_SUPABASE_URL=https://cjnszzfbxgyszoskfgva.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqbnN6emZieGd5c3pvc2tmZ3ZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3NTE3OTIsImV4cCI6MjA5MTMyNzc5Mn0.ASi9aoiy3rk06sEgsONn8j6ZgU3oIrvIrYpzlXN6JUk
```

---

## Test Data Setup & Teardown

### `beforeAll` — buat PO dummy

```js
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.test' })

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

let testPoId = null

test.beforeAll(async ({ browser }) => {
  // 1. Login Supabase client (untuk bisa akses DB dengan RLS)
  await supabase.auth.signInWithPassword({
    email: process.env.TEST_EMAIL,
    password: process.env.TEST_PASSWORD,
  })

  // 2. Ambil supplier pertama yang ada
  const { data: supplier } = await supabase
    .from('suppliers')
    .select('id')
    .limit(1)
    .single()

  // 3. Ambil product pertama yang ada
  const { data: product } = await supabase
    .from('products')
    .select('id')
    .limit(1)
    .single()

  // 4. Ambil unit pertama yang ada
  const { data: unit } = await supabase
    .from('units')
    .select('id')
    .limit(1)
    .single()

  // 5. Buat PO dummy
  const { data: po } = await supabase
    .from('purchase_orders')
    .insert({
      po_number: `PO-TEST-${Date.now()}`,
      date: new Date().toISOString().split('T')[0],
      supplier_id: supplier.id,
      status: 'draft',
      notes: '__PLAYWRIGHT_TEST__',
      total: 100000,
    })
    .select('id')
    .single()

  testPoId = po.id

  // 6. Buat PO item
  await supabase.from('purchase_order_items').insert({
    purchase_order_id: testPoId,
    product_id: product.id,
    unit_id: unit.id,
    quantity: 1,
    quantity_base: 1,
    unit_price: 100000,
    tax_amount: 0,
    total: 100000,
  })

  // 7. Login Playwright (untuk UI tests)
  const page = await browser.newPage()
  await page.goto('/login')
  await page.fill('input[type=email]', process.env.TEST_EMAIL)
  await page.fill('input[type=password]', process.env.TEST_PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL('**/dashboard**', { timeout: 15000 })
  await page.context().storageState({ path: 'tests/.auth.json' })
  await page.close()
})
```

### `afterAll` — hard delete PO dummy

```js
test.afterAll(async () => {
  if (testPoId) {
    await supabase.from('purchase_order_items')
      .delete()
      .eq('purchase_order_id', testPoId)
    await supabase.from('purchase_orders')
      .delete()
      .eq('id', testPoId)
  }
  await supabase.auth.signOut()
})
```

PO ini tidak pernah muncul di UI setelah test selesai karena langsung di-hard delete.

---

## Auth Setup untuk Test Pages

```js
test.use({ storageState: 'tests/.auth.json' })
```

---

## 7 Test Cases

### Test 1: PO list loads dengan kolom Aksi

```
Navigate: /purchase/orders
Verify: heading "Purchase Order" visible
Verify: <th> dengan text "Aksi" ada di tabel
```

### Test 2: Print icon di list — window.print dipanggil

```
Setup: addInitScript → window.print = () => { window._printCalled = true }
Navigate: /purchase/orders
Wait: row dengan data-id=testPoId atau baris dengan title "Print PO" muncul
Click: button[title="Print PO"] pada baris PO test
Wait: #invoice-print-root berisi .invoice-template (timeout 10s)
Verify: window._printCalled === true
Verify: .invoice-template mengandung text "Purchase Order"
```

### Test 3: PDF icon di list — file terdownload

```
Navigate: /purchase/orders
Wait: button[title="Download PDF"] muncul
Promise.all: [waitForEvent('download'), click button[title="Download PDF"] baris test PO]
Verify: download.suggestedFilename() matches /^po-/
```

### Test 4: PO form — tombol Print dan PDF ada di toolbar

```
Navigate: /purchase/orders/{testPoId}
Verify: button mengandung text "Print" visible
Verify: button mengandung text "Download PDF" visible
```

### Test 5: Print button di form — window.print dipanggil

```
Setup: addInitScript → window.print mock
Navigate: /purchase/orders/{testPoId}
Click: button mengandung text "Print"
Wait: #invoice-print-root berisi .invoice-template (timeout 10s)
Verify: window._printCalled === true
Verify: .invoice-template mengandung text "Purchase Order"
```

### Test 6: PDF button di form — file terdownload

```
Navigate: /purchase/orders/{testPoId}
Promise.all: [waitForEvent('download'), click button "Download PDF"]
Verify: download.suggestedFilename() matches /^po-/
```

### Test 7: Form PO baru — tombol Print/PDF tidak muncul

```
Navigate: /purchase/orders/new
Verify: button "Print" tidak ada (count === 0)
Verify: button "Download PDF" tidak ada (count === 0)
```

---

## Mocking Strategy

### window.print

```js
await page.addInitScript(() => {
  window._printCalled = false
  window.print = () => { window._printCalled = true }
})
// setelah klik:
const printed = await page.evaluate(() => window._printCalled)
expect(printed).toBe(true)
```

### PDF Download

```js
const [download] = await Promise.all([
  page.waitForEvent('download'),
  locator.click()
])
expect(download.suggestedFilename()).toMatch(/^po-/)
```

---

## Constraints

- Dev server (`npm run dev`) harus berjalan di port 5173 sebelum test dijalankan
- `@supabase/supabase-js` sudah terpasang (dependency utama app)
- `dotenv` perlu terpasang di devDependencies jika belum ada
- Test harus dijalankan secara serial (`fullyParallel: false` sudah di config)
- `window.print` mock harus via `addInitScript` (sebelum page load) agar berlaku di semua frame

---

## Run Command

```bash
cd erp-app && npx playwright test tests/po-print.spec.js --reporter=list
```
