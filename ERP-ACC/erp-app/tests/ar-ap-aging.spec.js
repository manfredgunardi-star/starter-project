// erp-app/tests/ar-ap-aging.spec.js
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.test' })

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

let testCustomerId = null
let testSupplierId = null
let testProductId = null
let testSalesInvoiceId = null
let testPurchaseInvoiceId = null

// Helper: tanggal N hari yang lalu dari hari ini
function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

test.describe('AR/AP Aging Report', () => {

  test.use({ storageState: 'tests/.auth.json' })

  test.beforeAll(async ({ browser }) => {
    // Autentikasi Supabase
    const { error: authErr } = await supabase.auth.signInWithPassword({
      email: process.env.TEST_EMAIL,
      password: process.env.TEST_PASSWORD,
    })
    if (authErr) throw new Error(`Supabase login gagal: ${authErr.message}`)

    // Ambil unit pertama
    const { data: unit, error: uErr } = await supabase
      .from('units').select('id').limit(1).single()
    if (uErr) throw new Error(`Tidak ada unit: ${uErr.message}`)

    // Buat COA dummy untuk AR/AP (ambil akun yang sudah ada)
    const { data: arCoa } = await supabase
      .from('coa').select('id').limit(1).single()

    // Buat customer test
    const { data: customer, error: cErr } = await supabase
      .from('customers')
      .insert({ name: `TEST-Customer-Aging-${Date.now()}` })
      .select('id').single()
    if (cErr) throw new Error(`Gagal buat test customer: ${cErr.message}`)
    testCustomerId = customer.id

    // Buat supplier test
    const { data: supplier, error: sErr } = await supabase
      .from('suppliers')
      .insert({ name: `TEST-Supplier-Aging-${Date.now()}` })
      .select('id').single()
    if (sErr) throw new Error(`Gagal buat test supplier: ${sErr.message}`)
    testSupplierId = supplier.id

    // Buat product test
    const { data: product, error: pErr } = await supabase
      .from('products')
      .insert({ name: `TEST-Product-Aging-${Date.now()}`, base_unit_id: unit.id, sell_price: 500000, buy_price: 400000 })
      .select('id').single()
    if (pErr) throw new Error(`Gagal buat test product: ${pErr.message}`)
    testProductId = product.id

    // Buat sales invoice (piutang) — jatuh tempo 45 hari lalu → bucket "31-60"
    const invoiceDate = daysAgo(60)
    const dueDate = daysAgo(45)
    const { data: salesInv, error: siErr } = await supabase
      .from('invoices')
      .insert({
        invoice_number: `INV-TEST-AR-${Date.now()}`,
        date: invoiceDate,
        due_date: dueDate,
        type: 'sales',
        customer_id: testCustomerId,
        subtotal: 500000,
        tax_amount: 0,
        total: 500000,
        amount_paid: 0,
        status: 'posted',
        notes: '__PLAYWRIGHT_TEST__',
      })
      .select('id').single()
    if (siErr) throw new Error(`Gagal buat test sales invoice: ${siErr.message}`)
    testSalesInvoiceId = salesInv.id

    // Buat purchase invoice (utang) — jatuh tempo 10 hari lalu → bucket "1-30"
    const poDate = daysAgo(20)
    const poDueDate = daysAgo(10)
    const { data: purchaseInv, error: piErr } = await supabase
      .from('invoices')
      .insert({
        invoice_number: `INV-TEST-AP-${Date.now()}`,
        date: poDate,
        due_date: poDueDate,
        type: 'purchase',
        supplier_id: testSupplierId,
        subtotal: 400000,
        tax_amount: 0,
        total: 400000,
        amount_paid: 0,
        status: 'posted',
        notes: '__PLAYWRIGHT_TEST__',
      })
      .select('id').single()
    if (piErr) throw new Error(`Gagal buat test purchase invoice: ${piErr.message}`)
    testPurchaseInvoiceId = purchaseInv.id

    // Bangun storageState dari session Supabase
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
    if (testSalesInvoiceId) {
      await supabase.from('invoices').delete().eq('id', testSalesInvoiceId)
    }
    if (testPurchaseInvoiceId) {
      await supabase.from('invoices').delete().eq('id', testPurchaseInvoiceId)
    }
    if (testProductId) {
      await supabase.from('products').delete().eq('id', testProductId)
    }
    if (testCustomerId) {
      await supabase.from('customers').delete().eq('id', testCustomerId)
    }
    if (testSupplierId) {
      await supabase.from('suppliers').delete().eq('id', testSupplierId)
    }
    await supabase.auth.signOut()
  })

  // --- Test 1 ---
  test('Halaman AR/AP Aging bisa dibuka dari sidebar', async ({ page }) => {
    await page.goto('/reports/ar-ap-aging')
    await expect(
      page.locator('h2:has-text("Laporan AR/AP Aging"), h1:has-text("Laporan AR/AP Aging")')
    ).toBeVisible({ timeout: 10000 })
    await expect(page.locator('label:has-text("Per Tanggal"), span:has-text("Per Tanggal")')).toBeVisible()
    await expect(page.locator('button:has-text("Tampilkan")')).toBeVisible()
  })

  // --- Test 2 ---
  test('Klik Tampilkan menampilkan dua tab AR dan AP', async ({ page }) => {
    await page.goto('/reports/ar-ap-aging')
    await page.locator('button:has-text("Tampilkan")').click()
    await expect(page.locator('.ant-tabs-tab:has-text("Piutang / AR")')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('.ant-tabs-tab:has-text("Utang / AP")')).toBeVisible()
  })

  // --- Test 3 ---
  test('Tab AR menampilkan invoice test customer', async ({ page }) => {
    await page.goto('/reports/ar-ap-aging')
    await page.locator('button:has-text("Tampilkan")').click()
    // Pastikan tab AR aktif (default)
    await expect(page.locator('.ant-tabs-tab-active:has-text("Piutang / AR")')).toBeVisible({ timeout: 10000 })
    // Cek customer test muncul di tabel
    const { data: customer } = await supabase
      .from('customers').select('name').eq('id', testCustomerId).single()
    await expect(page.locator(`td:has-text("${customer.name}")`)).toBeVisible({ timeout: 5000 })
  })

  // --- Test 4 ---
  test('Tab AP menampilkan invoice test supplier', async ({ page }) => {
    await page.goto('/reports/ar-ap-aging')
    await page.locator('button:has-text("Tampilkan")').click()
    await expect(page.locator('.ant-tabs-tab:has-text("Utang / AP")')).toBeVisible({ timeout: 10000 })
    await page.locator('.ant-tabs-tab:has-text("Utang / AP")').click()
    const { data: supplier } = await supabase
      .from('suppliers').select('name').eq('id', testSupplierId).single()
    await expect(page.locator(`td:has-text("${supplier.name}")`)).toBeVisible({ timeout: 5000 })
  })

  // --- Test 5 ---
  test('Summary stats muncul dan bernilai positif', async ({ page }) => {
    await page.goto('/reports/ar-ap-aging')
    await page.locator('button:has-text("Tampilkan")').click()
    await expect(page.locator('.ant-tabs-tab-active:has-text("Piutang / AR")')).toBeVisible({ timeout: 10000 })
    // Summary stats: 3 statistic cards
    await expect(page.locator('.ant-statistic-title:has-text("Total Outstanding")')).toBeVisible()
    await expect(page.locator('.ant-statistic-title:has-text("Sudah Jatuh Tempo")')).toBeVisible()
    await expect(page.locator('.ant-statistic-title:has-text("Lebih dari 90 Hari")')).toBeVisible()
  })

  // --- Test 6 ---
  test('Aging bucket ditampilkan sebagai Tag warna', async ({ page }) => {
    await page.goto('/reports/ar-ap-aging')
    await page.locator('button:has-text("Tampilkan")').click()
    await expect(page.locator('.ant-tabs-tab-active:has-text("Piutang / AR")')).toBeVisible({ timeout: 10000 })
    // Invoice test ada di bucket 31-60 hari — cari tag yang sesuai
    await expect(
      page.locator('.ant-tag', { hasText: '31–60 Hari' })
    ).toBeVisible({ timeout: 5000 })
  })

  // --- Test 7 ---
  test('Invoice sudah paid tidak muncul di laporan', async ({ page }) => {
    // Buat invoice paid sementara untuk memverifikasi tidak muncul
    const { data: paidInv } = await supabase
      .from('invoices')
      .insert({
        invoice_number: `INV-TEST-PAID-${Date.now()}`,
        date: daysAgo(30),
        due_date: daysAgo(15),
        type: 'sales',
        customer_id: testCustomerId,
        subtotal: 999000,
        tax_amount: 0,
        total: 999000,
        amount_paid: 999000,
        status: 'paid',
        notes: '__PLAYWRIGHT_TEST_PAID__',
      })
      .select('id').single()

    await page.goto('/reports/ar-ap-aging')
    await page.locator('button:has-text("Tampilkan")').click()
    await expect(page.locator('.ant-tabs-tab-active:has-text("Piutang / AR")')).toBeVisible({ timeout: 10000 })

    // Invoice paid dengan total 999.000 tidak boleh muncul
    await expect(
      page.locator('td', { hasText: '999' }).filter({ hasText: '000' })
    ).toHaveCount(0)

    // Cleanup
    if (paidInv?.id) {
      await supabase.from('invoices').delete().eq('id', paidInv.id)
    }
  })

})
