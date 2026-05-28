import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import * as XLSX from 'xlsx'

dotenv.config({ path: '.env.test' })

const LIVE_URL = 'https://erp-app-bay.vercel.app'
const AUTH_STATE = 'playwright/.auth/user.json'
const SAMPLE_FILE = 'test-results/bank-import-sample.xlsx'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

let sessionId = null
let sessionUrl = null

async function ensureAuthState() {
  if (fs.existsSync(AUTH_STATE)) return

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

  fs.mkdirSync(path.dirname(AUTH_STATE), { recursive: true })
  fs.writeFileSync(AUTH_STATE, JSON.stringify({
    cookies: [],
    origins: [{
      origin: LIVE_URL,
      localStorage: [{ name: storageKey, value: JSON.stringify(session) }],
    }],
  }, null, 2))
}

function createSampleStatementFile() {
  fs.mkdirSync(path.dirname(SAMPLE_FILE), { recursive: true })
  const worksheet = XLSX.utils.aoa_to_sheet([
    ['Tanggal', 'Keterangan', 'Jumlah'],
    ['2026-01-15', 'Pembayaran Invoice #001', -5000000],
    ['2026-01-16', 'Terima Pembayaran #002', 3000000],
    ['2026-01-17', 'Transfer ke vendor', -1500000],
    ['2026-01-18', 'Kas masuk', 2000000],
    ['2026-01-19', 'Biaya admin', -50000],
  ])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Statement')
  XLSX.writeFile(workbook, SAMPLE_FILE)
}

async function gotoLive(page, route) {
  await page.goto(`${LIVE_URL}${route}`, { waitUntil: 'domcontentloaded' })
}

async function uploadSampleFile(page) {
  await page.locator('input[type="file"]').setInputFiles(SAMPLE_FILE)
}

async function selectFirstAccount(page) {
  const card = page.locator('.ant-card', { hasText: '1. Pilih Akun' })
  await card.locator('.ant-select').first().click()
  await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option').first().click()
}

async function loadBankImportPage(page) {
  await gotoLive(page, '/cash/import')
  await expect(page.getByRole('heading', { name: 'Import Rekening Koran' })).toBeVisible({ timeout: 15000 })
}

async function createImportSessionViaUi(page) {
  await loadBankImportPage(page)
  await uploadSampleFile(page)
  await expect(page.getByText('2. Pemetaan Kolom')).toBeVisible({ timeout: 10000 })
  await selectFirstAccount(page)
  await page.getByRole('button', { name: /Proses Import/i }).click()
  await page.waitForURL(/\/cash\/import\/[0-9a-f-]{36}$/i, { timeout: 20000 })
  sessionUrl = page.url()
  sessionId = sessionUrl.split('/').pop()
}

async function setDateInputNearLabel(page, label, value) {
  const input = page.locator('div', { hasText: label }).locator('input').first()
  await input.click()
  await input.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
  await input.fill(value)
  await input.press('Enter')
}

function firstOfCurrentMonth() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

test.describe('Bank import and standard accounting reports - live smoke', () => {
  test.use({ storageState: AUTH_STATE })

  test.beforeAll(async () => {
    await ensureAuthState()
    createSampleStatementFile()
  })

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      fs.mkdirSync('test-results/bank-import-reports', { recursive: true })
      const safeTitle = testInfo.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
      await page.screenshot({
        path: `test-results/bank-import-reports/${safeTitle}.png`,
        fullPage: true,
      })
      await page.screenshot({ path: 'test-failure.png', fullPage: true })
    }
  })

  test.afterAll(async () => {
    if (sessionId) {
      await cancelImportSession(sessionId)
    }
    await supabase.auth.signOut()
  })

  async function cancelImportSession(id) {
    await supabase.auth.signInWithPassword({
      email: process.env.TEST_EMAIL,
      password: process.env.TEST_PASSWORD,
    })
    await supabase.rpc('cancel_bank_import', { p_session_id: id })
  }

  test('Sidebar: new menu items appear after login', async ({ page }) => {
    await gotoLive(page, '/')
    const kasBankMenu = page.locator('.ant-menu-title-content', { hasText: /^Kas & Bank$/ })
    await expect(kasBankMenu).toBeVisible({ timeout: 15000 })
    await kasBankMenu.click()
    await expect(page.getByText('Import Rekening Koran')).toBeVisible()

    const laporanMenu = page.locator('.ant-menu-title-content', { hasText: /^Laporan$/ })
    await expect(laporanMenu).toBeVisible()
    await laporanMenu.click()
    await expect(page.getByText('Neraca Saldo')).toBeVisible()
    await expect(page.getByText('Laporan Penjualan')).toBeVisible()
    await expect(page.getByText('Laporan Pembelian')).toBeVisible()
  })

  test('T1: bank import page loads with title', async ({ page }) => {
    await loadBankImportPage(page)
  })

  test('T2: submit without account selected shows pilih akun toast', async ({ page }) => {
    await loadBankImportPage(page)
    await uploadSampleFile(page)
    await expect(page.getByText('2. Pemetaan Kolom')).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('button', { name: /Proses Import/i })).toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: /Proses Import/i }).click()
    await expect(page.locator('.ant-message-notice-content', { hasText: /Pilih akun/i })).toBeVisible({ timeout: 5000 })
  })

  test('T3: upload XLSX shows preview table and mapping card', async ({ page }) => {
    await loadBankImportPage(page)
    await uploadSampleFile(page)
    await expect(page.getByText('2. Pemetaan Kolom')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/Preview \(5 baris pertama/i)).toBeVisible()
    await expect(page.locator('.ant-table')).toBeVisible()
  })

  test('T4: split amount mode shows Debit and Kredit selects', async ({ page }) => {
    await loadBankImportPage(page)
    await uploadSampleFile(page)
    await page.getByText('Dua kolom terpisah (Debit dan Kredit)').click()
    await expect(page.getByText('Kolom Debit (keluar)')).toBeVisible()
    await expect(page.getByText('Kolom Kredit (masuk)')).toBeVisible()
  })

  test('T5: valid mapping redirects to import preview URL', async ({ page }) => {
    await createImportSessionViaUi(page)
    await expect(page).toHaveURL(/\/cash\/import\/[0-9a-f-]{36}$/i)
  })

  test('T6: import preview page shows title', async ({ page }) => {
    test.skip(!sessionUrl, 'T5 did not create an import session')
    await page.goto(sessionUrl)
    await expect(page.getByRole('heading', { name: 'Preview Import Rekening Koran' })).toBeVisible({ timeout: 15000 })
  })

  test('T7: import preview statistic cards are visible', async ({ page }) => {
    test.skip(!sessionUrl, 'T5 did not create an import session')
    await page.goto(sessionUrl)
    await expect(page.locator('.ant-statistic-title', { hasText: /^Total Baris$/ })).toBeVisible()
    await expect(page.locator('.ant-statistic-title', { hasText: /^Cocok$/ })).toBeVisible()
    await expect(page.locator('.ant-statistic-title', { hasText: /^Tidak Pasti$/ })).toBeVisible()
    await expect(page.locator('.ant-statistic-title', { hasText: /^Tidak Cocok$/ })).toBeVisible()
  })

  test('T8: import preview table has at least one row', async ({ page }) => {
    test.skip(!sessionUrl, 'T5 did not create an import session')
    await page.goto(sessionUrl)
    await expect(page.locator('.ant-table-tbody tr').first()).toBeVisible({ timeout: 15000 })
  })

  test('T9: Batalkan Import button is visible', async ({ page }) => {
    test.skip(!sessionUrl, 'T5 did not create an import session')
    await page.goto(sessionUrl)
    await expect(page.getByRole('button', { name: /Batalkan Import/i })).toBeVisible()
  })

  test('T10: Konfirmasi Import button is visible', async ({ page }) => {
    test.skip(!sessionUrl, 'T5 did not create an import session')
    await page.goto(sessionUrl)
    await expect(page.getByRole('button', { name: /Konfirmasi Import/i })).toBeVisible()
  })

  test('T11: cancel import via Popconfirm navigates to cash accounts', async ({ page }) => {
    test.skip(!sessionUrl, 'T5 did not create an import session')
    await page.goto(sessionUrl)
    await page.getByRole('button', { name: /Batalkan Import/i }).click()
    await expect(page.getByText('Batalkan import?')).toBeVisible()
    await page.getByRole('button', { name: /Ya, Batalkan/i }).click()
    await page.waitForURL(/\/cash\/accounts$/i, { timeout: 15000 })
    sessionId = null
  })

  test('T12: trial balance page title is visible', async ({ page }) => {
    await gotoLive(page, '/reports/trial-balance')
    await expect(page.getByRole('heading', { name: 'Neraca Saldo (Trial Balance)' })).toBeVisible({ timeout: 15000 })
  })

  test('T13: trial balance has no alert before clicking Tampilkan', async ({ page }) => {
    await gotoLive(page, '/reports/trial-balance')
    await expect(page.locator('.ant-alert')).toHaveCount(0)
  })

  test('T14: trial balance loads table or info alert after clicking Tampilkan', async ({ page }) => {
    await gotoLive(page, '/reports/trial-balance')
    await setDateInputNearLabel(page, 'Per Tanggal', today())
    await page.getByRole('button', { name: /Tampilkan/i }).click()
    const table = page.locator('.ant-table')
    const info = page.locator('.ant-alert', { hasText: 'Tidak ada jurnal terposting' })
    await expect(table.or(info)).toBeVisible({ timeout: 15000 })
  })

  test('T15: trial balance data footer shows Total Debit and Total Kredit when rows exist', async ({ page }) => {
    await gotoLive(page, '/reports/trial-balance')
    await page.getByRole('button', { name: /Tampilkan/i }).click()
    await expect(page.locator('.ant-table')).toBeVisible({ timeout: 15000 })
    const rows = await page.locator('.ant-table-tbody tr:not(.ant-table-placeholder)').count()
    test.skip(rows === 0, 'No trial balance rows exist')
    await expect(page.locator('.ant-statistic-title', { hasText: /^Total Debit$/ })).toBeVisible()
    await expect(page.locator('.ant-statistic-title', { hasText: /^Total Kredit$/ })).toBeVisible()
  })

  test('T16: empty trial balance shows Tidak ada jurnal terposting info alert', async ({ page }) => {
    await gotoLive(page, '/reports/trial-balance')
    await setDateInputNearLabel(page, 'Per Tanggal', '1900-01-01')
    await page.getByRole('button', { name: /Tampilkan/i }).click()
    await expect(page.getByText('Tidak ada jurnal terposting')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('.ant-alert-success')).toHaveCount(0)
  })

  test('T17: sales report page title is visible', async ({ page }) => {
    await gotoLive(page, '/reports/sales')
    await expect(page.getByRole('heading', { name: 'Laporan Penjualan' })).toBeVisible({ timeout: 15000 })
  })

  test('T18: sales report draft exclusion info alert is visible before loading', async ({ page }) => {
    await gotoLive(page, '/reports/sales')
    await expect(page.locator('.ant-alert', { hasText: /Draft/i })).toBeVisible({ timeout: 15000 })
  })

  test('T19: sales report current month loads table or empty state', async ({ page }) => {
    await gotoLive(page, '/reports/sales')
    await setDateInputNearLabel(page, 'Dari Tanggal', firstOfCurrentMonth())
    await setDateInputNearLabel(page, 'Sampai Tanggal', today())
    await page.getByRole('button', { name: /Tampilkan/i }).click()
    await expect(page.locator('.ant-table')).toBeVisible({ timeout: 15000 })
  })

  test('T20: sales report status column does not show Draft tag', async ({ page }) => {
    await gotoLive(page, '/reports/sales')
    await page.getByRole('button', { name: /Tampilkan/i }).click()
    await expect(page.locator('.ant-table')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('.ant-tag', { hasText: 'Draft' })).toHaveCount(0)
  })

  test('T21: purchase report page title is visible', async ({ page }) => {
    await gotoLive(page, '/reports/purchases')
    await expect(page.getByRole('heading', { name: 'Laporan Pembelian' })).toBeVisible({ timeout: 15000 })
  })

  test('T22: purchase report draft exclusion info alert is visible', async ({ page }) => {
    await gotoLive(page, '/reports/purchases')
    await expect(page.locator('.ant-alert', { hasText: /Draft/i })).toBeVisible({ timeout: 15000 })
  })

  test('T23: purchase report filter label shows Supplier, not Customer', async ({ page }) => {
    await gotoLive(page, '/reports/purchases')
    await expect(page.locator('strong', { hasText: /^Supplier$/ })).toBeVisible()
    await expect(page.getByText('Customer')).toHaveCount(0)
  })

  test('T24: purchase report footer shows Hutang label, not Piutang', async ({ page }) => {
    await gotoLive(page, '/reports/purchases')
    await page.getByRole('button', { name: /Tampilkan/i }).click()
    await expect(page.locator('.ant-table')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(/Hutang:/i)).toBeVisible()
    await expect(page.getByText(/Piutang:/i)).toHaveCount(0)
  })
})
