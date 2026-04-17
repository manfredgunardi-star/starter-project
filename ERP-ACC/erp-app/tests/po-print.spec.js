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
