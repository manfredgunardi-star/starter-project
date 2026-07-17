import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import fs from 'fs'

dotenv.config({ path: '.env.test' })

const LIVE_URL = 'https://erp-app-bay.vercel.app'
const AUTH_STATE = 'playwright/.auth/user.json'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

async function ensureAuthState() {
  if (fs.existsSync(AUTH_STATE)) return
  const { error } = await supabase.auth.signInWithPassword({
    email: process.env.TEST_EMAIL,
    password: process.env.TEST_PASSWORD,
  })
  if (error) throw new Error(`Supabase login gagal: ${error.message}`)
  const { data: sessionData } = await supabase.auth.getSession()
  const session = sessionData.session
  if (!session) throw new Error('Session tidak ada setelah login')
  const projectRef = new URL(process.env.VITE_SUPABASE_URL).hostname.split('.')[0]
  const storageKey = `sb-${projectRef}-auth-token`
  fs.mkdirSync('playwright/.auth', { recursive: true })
  fs.writeFileSync(AUTH_STATE, JSON.stringify({
    cookies: [],
    origins: [{ origin: LIVE_URL, localStorage: [{ name: storageKey, value: JSON.stringify(session) }] }],
  }, null, 2))
}

async function gotoLive(page, route) {
  await page.goto(`${LIVE_URL}${route}`, { waitUntil: 'domcontentloaded' })
}

test.describe('General Cash Transaction (non-AP/AR) — live smoke', () => {
  test.use({ storageState: AUTH_STATE })

  test.beforeAll(async () => {
    await ensureAuthState()
  })

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      fs.mkdirSync('test-results/general-cash-transaction', { recursive: true })
      const safeTitle = testInfo.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
      await page.screenshot({
        path: `test-results/general-cash-transaction/${safeTitle}.png`,
        fullPage: true,
      })
    }
  })

  test('T1: halaman Transaksi Kas/Bank Lainnya terbuka tanpa error', async ({ page }) => {
    await gotoLive(page, '/cash/general-transactions/new')
    await expect(page.getByText('Transaksi Kas/Bank Lainnya')).toBeVisible({ timeout: 8000 })
  })

  test('T2: form punya minimal 2 baris debit/kredit', async ({ page }) => {
    await gotoLive(page, '/cash/general-transactions/new')
    const debitInputs = page.locator('input[placeholder="0"]')
    await expect(debitInputs.first()).toBeVisible({ timeout: 8000 })
    expect(await debitInputs.count()).toBeGreaterThanOrEqual(4) // 2 rows x (debit + credit)
  })

  test('T3: tombol Posting Transaksi disabled saat form kosong', async ({ page }) => {
    await gotoLive(page, '/cash/general-transactions/new')
    await expect(page.getByRole('button', { name: /posting transaksi/i })).toBeDisabled({ timeout: 8000 })
  })

  test('T4: peringatan akun kas/bank tampil saat belum ada baris terhubung rekening', async ({ page }) => {
    await gotoLive(page, '/cash/general-transactions/new')
    await expect(page.getByText(/minimal satu baris harus terhubung ke akun kas\/bank/i)).toBeVisible({ timeout: 8000 })
  })

  test('T5: menu "Transaksi Lainnya" tampil di sidebar Kas & Bank', async ({ page }) => {
    await gotoLive(page, '/cash/accounts')
    await expect(page.getByText('Transaksi Lainnya')).toBeVisible({ timeout: 8000 })
  })

  // —— Regression: existing Jurnal list + Jurnal Umum still work ——

  test('T6: halaman daftar Jurnal tetap terbuka tanpa error', async ({ page }) => {
    await gotoLive(page, '/accounting/journals')
    await expect(page.locator('h2, h3, .ant-typography').filter({ hasText: /jurnal/i }).first()).toBeVisible({ timeout: 8000 })
  })

  test('T7: halaman Tambah Jurnal Manual tetap terbuka tanpa error (regresi pasca-ekstraksi komponen)', async ({ page }) => {
    await gotoLive(page, '/accounting/journals/new')
    await expect(page.locator('h3, h2, .ant-typography').filter({ hasText: /jurnal/i }).first()).toBeVisible({ timeout: 8000 })
    await expect(page.locator('input[placeholder*="0"]').first()).toBeVisible({ timeout: 8000 })
  })
})
