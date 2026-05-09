// erp-app/tests/dashboard.spec.js
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.test' })

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

test.describe('Dashboard KPIs & Chart', () => {

  test.use({ storageState: 'tests/.auth.json' })

  test.beforeAll(async () => {
    const { error } = await supabase.auth.signInWithPassword({
      email: process.env.TEST_EMAIL,
      password: process.env.TEST_PASSWORD,
    })
    if (error) throw new Error(`Supabase login gagal: ${error.message}`)

    const { data: sessionData } = await supabase.auth.getSession()
    const session = sessionData.session
    if (!session) throw new Error('Supabase session tidak ada setelah login')

    const projectRef = new URL(process.env.VITE_SUPABASE_URL).hostname.split('.')[0]
    const storageKey = `sb-${projectRef}-auth-token`
    const fs = await import('fs')
    fs.writeFileSync('tests/.auth.json', JSON.stringify({
      cookies: [],
      origins: [{
        origin: 'http://localhost:5173',
        localStorage: [{ name: storageKey, value: JSON.stringify(session) }],
      }],
    }, null, 2))
  })

  test.afterAll(async () => {
    await supabase.auth.signOut()
  })

  // --- Test 1 ---
  test('Dashboard page loads dengan judul', async ({ page }) => {
    await page.goto('/')
    await expect(
      page.locator('h2:has-text("Dashboard"), h1:has-text("Dashboard")')
    ).toBeVisible({ timeout: 10000 })
  })

  // --- Test 2 ---
  test('4 KPI metric cards utama muncul', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('text=Penjualan Bulan Ini')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('text=Total Piutang')).toBeVisible()
    await expect(page.locator('text=Total Hutang')).toBeVisible()
    await expect(page.locator('text=Total Kas & Bank')).toBeVisible()
  })

  // --- Test 3 ---
  test('Monthly trend chart section muncul dengan SVG', async ({ page }) => {
    await page.goto('/')
    await expect(
      page.locator('text=Tren Penjualan')
    ).toBeVisible({ timeout: 10000 })
    await expect(page.locator('.recharts-wrapper svg[role="application"]')).toBeVisible({ timeout: 5000 })
  })

  // --- Test 4 ---
  test('Recent Sales Invoices dan Pembayaran Terbaru ada', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('text=Invoice Penjualan Terbaru')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('text=Pembayaran Terbaru')).toBeVisible()
  })

  // --- Test 5 ---
  test('Saldo Kas & Bank section ada', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('text=Saldo Kas & Bank')).toBeVisible({ timeout: 10000 })
  })

  // --- Test 6 ---
  test('Dashboard load tidak menghasilkan JS error', async ({ page }) => {
    const errors = []
    page.on('pageerror', err => errors.push(err.message))
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    const realErrors = errors.filter(e =>
      !e.includes('favicon') &&
      !e.includes('extension') &&
      !e.includes('ERR_')
    )
    expect(realErrors).toHaveLength(0)
  })

  // --- Test 7 ---
  test('Chart tooltip area dapat di-hover tanpa crash', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.recharts-wrapper svg[role="application"]')).toBeVisible({ timeout: 10000 })
    const chart = page.locator('.recharts-wrapper')
    const box = await chart.boundingBox()
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.waitForTimeout(500)
    }
    // Verify page still functional after hover
    await expect(page.locator('text=Penjualan Bulan Ini')).toBeVisible()
  })

})
