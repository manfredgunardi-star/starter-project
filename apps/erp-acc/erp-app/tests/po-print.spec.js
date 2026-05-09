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
let testSupplierId = null
let testProductId = null

test.describe('PO Print Feature', () => {

  test.use({ storageState: 'tests/.auth.json' })

  test.beforeAll(async ({ browser }) => {
    // --- Setup Supabase client ---
    const { error: authErr } = await supabase.auth.signInWithPassword({
      email: process.env.TEST_EMAIL,
      password: process.env.TEST_PASSWORD,
    })
    if (authErr) throw new Error(`Supabase login gagal: ${authErr.message}`)

    // Ambil unit pertama yang ada (units selalu ada: pcs, dus, kg)
    const { data: unit, error: uErr } = await supabase
      .from('units').select('id').limit(1).single()
    if (uErr) throw new Error(`Tidak ada unit: ${uErr.message}`)

    // Buat test supplier
    const { data: supplier, error: sErr } = await supabase
      .from('suppliers')
      .insert({ name: `TEST-Supplier-${Date.now()}` })
      .select('id')
      .single()
    if (sErr) throw new Error(`Gagal buat test supplier: ${sErr.message}`)
    testSupplierId = supplier.id

    // Buat test product
    const { data: product, error: pErr } = await supabase
      .from('products')
      .insert({ name: `TEST-Product-${Date.now()}`, base_unit_id: unit.id, buy_price: 100000 })
      .select('id')
      .single()
    if (pErr) throw new Error(`Gagal buat test product: ${pErr.message}`)
    testProductId = product.id

    // Buat PO dummy
    testPoNumber = `PO-TEST-${Date.now()}`
    const { data: po, error: poErr } = await supabase
      .from('purchase_orders')
      .insert({
        po_number: testPoNumber,
        date: new Date().toISOString().split('T')[0],
        supplier_id: testSupplierId,
        status: 'draft',
        notes: '__PLAYWRIGHT_TEST__',
        total: 100000,
      })
      .select('id')
      .single()
    if (poErr) throw new Error(`Gagal buat test PO: ${poErr.message}`)
    testPoId = po.id

    // Buat PO item
    const { error: itemErr } = await supabase.from('purchase_order_items').insert({
      purchase_order_id: testPoId,
      product_id: testProductId,
      unit_id: unit.id,
      quantity: 1,
      quantity_base: 1,
      unit_price: 100000,
      tax_amount: 0,
      total: 100000,
    })
    if (itemErr) throw new Error(`Gagal buat test PO item: ${itemErr.message}`)

    // Ambil session dari Supabase client dan bangun storageState manual
    // (lebih reliable daripada browser login via AntD form)
    const { data: sessionData } = await supabase.auth.getSession()
    const session = sessionData.session
    if (!session) throw new Error('Supabase session tidak ada setelah login')
    const projectRef = new URL(process.env.VITE_SUPABASE_URL).hostname.split('.')[0]
    const storageKey = `sb-${projectRef}-auth-token`
    const fs = await import('fs')
    const authState = {
      cookies: [],
      origins: [{
        origin: 'http://localhost:5173',
        localStorage: [
          { name: storageKey, value: JSON.stringify(session) },
        ],
      }],
    }
    fs.writeFileSync('tests/.auth.json', JSON.stringify(authState, null, 2))
  })

  test.afterAll(async () => {
    if (testPoId) {
      await supabase.from('purchase_order_items')
        .delete().eq('purchase_order_id', testPoId)
      await supabase.from('purchase_orders')
        .delete().eq('id', testPoId)
    }
    if (testProductId) {
      await supabase.from('products').delete().eq('id', testProductId)
    }
    if (testSupplierId) {
      await supabase.from('suppliers').delete().eq('id', testSupplierId)
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
    await page.waitForSelector('#invoice-print-root .invoice-template', { state: 'attached', timeout: 10000 })
    const printed = await page.evaluate(() => window._printCalled)
    expect(printed).toBe(true)
    await expect(page.locator('#invoice-print-root .invoice-template'))
      .toContainText('Purchase Order', { useInnerText: false })
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
    await page.waitForSelector('#invoice-print-root .invoice-template', { state: 'attached', timeout: 10000 })
    const printed = await page.evaluate(() => window._printCalled)
    expect(printed).toBe(true)
    await expect(page.locator('#invoice-print-root .invoice-template'))
      .toContainText('Purchase Order', { useInnerText: false })
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
