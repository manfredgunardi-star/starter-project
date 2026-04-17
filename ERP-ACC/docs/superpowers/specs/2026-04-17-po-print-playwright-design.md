# Design Spec: Playwright Tests — Cetak Purchase Order

**Tanggal:** 2026-04-17
**Status:** Approved
**Scope:** ERP-ACC (`erp-app/tests/`)

---

## Ringkasan

Menambahkan Playwright test suite untuk fitur cetak Purchase Order. Test berjalan terhadap local dev server (`http://localhost:5173`) dengan login asli menggunakan credentials dari environment variable. 7 test end-to-end memverifikasi seluruh flow: kolom Aksi di list, print + PDF dari list dan dari form, serta verifikasi tombol tidak muncul di form PO baru.

---

## Keputusan Desain

| Pertanyaan | Keputusan |
|---|---|
| Target environment | Local dev server (`http://localhost:5173`) |
| Auth approach | Login nyata dengan credentials Supabase |
| Session management | `beforeAll` login sekali, simpan ke `tests/.auth.json` |
| Credentials storage | `.env.test` (gitignored) |
| window.print mock | `addInitScript` override sebelum klik |
| PDF verification | `page.waitForEvent('download')` |
| Jumlah test | 7 test |

---

## File

### File Baru

| File | Tujuan |
|------|--------|
| `erp-app/tests/po-print.spec.js` | Test suite utama — 7 test |
| `erp-app/.env.test` | Credentials (gitignored) |

### File yang Dimodifikasi

| File | Perubahan |
|------|-----------|
| `erp-app/.gitignore` | Tambah `.env.test` dan `tests/.auth.json` |

### File Tidak Diubah

- `erp-app/tests/invoice-print.spec.js` — tidak disentuh
- `erp-app/playwright.config.js` — tidak disentuh

---

## Auth Setup

`beforeAll` login sekali untuk seluruh suite, simpan session ke `tests/.auth.json`:

```js
test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage()
  await page.goto('/login')
  await page.fill('input[type=email]', process.env.TEST_EMAIL)
  await page.fill('input[type=password]', process.env.TEST_PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL('**/dashboard**', { timeout: 15000 })
  await page.context().storageState({ path: 'tests/.auth.json' })
  await page.close()
})

test.use({ storageState: 'tests/.auth.json' })
```

`.env.test` content:
```
TEST_EMAIL=manfred.gunardi@gmail.com
TEST_PASSWORD=@35010368Aa
```

Test membaca credentials via `dotenv`:
```js
import 'dotenv/config'
// atau gunakan dotenv({ path: '.env.test' })
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
Navigate: /purchase/orders
Setup: override window.print via addInitScript
Wait: baris pertama tabel muncul
Click: button[title="Print PO"] (baris pertama)
Wait: #invoice-print-root berisi .invoice-template
Verify: window._printCalled === true
Verify: .invoice-template mengandung text "Purchase Order"
```

### Test 3: PDF icon di list — file terdownload

```
Navigate: /purchase/orders
Wait: baris pertama tabel muncul
Promise.all: [waitForEvent('download'), click button[title="Download PDF"]]
Verify: download.suggestedFilename() matches /^po-/
```

### Test 4: PO form — tombol Print dan PDF ada di toolbar

```
Navigate: /purchase/orders
Click: baris pertama → navigasi ke form/detail PO
Verify: button dengan text "Print" visible di toolbar
Verify: button dengan text "Download PDF" visible di toolbar
```

### Test 5: Print button di form — window.print dipanggil

```
Navigate: /purchase/orders → buka detail PO pertama
Setup: override window.print via addInitScript
Click: button "Print"
Wait: #invoice-print-root berisi .invoice-template
Verify: window._printCalled === true
Verify: .invoice-template mengandung text "Purchase Order"
```

### Test 6: PDF button di form — file terdownload

```
Navigate: /purchase/orders → buka detail PO pertama
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
// ... setelah klik print ...
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

## Asumsi & Constraints

- Database sudah memiliki minimal **1 PO** agar test 2–6 bisa berjalan
- Dev server (`npm run dev`) harus sudah berjalan di port 5173 sebelum test dijalankan
- `dotenv` sudah terpasang di devDependencies (jika belum, install dulu)
- `window.print` mock harus dipasang via `addInitScript` (sebelum page load) agar berlaku sejak awal
- Test 2 dan 5 memerlukan waktu untuk async fetch PO + company settings — gunakan `waitFor` dengan timeout yang cukup

---

## Run Command

```bash
cd erp-app && npx playwright test tests/po-print.spec.js --reporter=list
```
