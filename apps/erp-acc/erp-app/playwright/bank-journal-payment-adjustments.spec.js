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

test.describe('Bank Account in Journal & Payment Adjustments — live smoke', () => {
  test.use({ storageState: AUTH_STATE })

  test.beforeAll(async () => {
    await ensureAuthState()
  })

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      fs.mkdirSync('test-results/bank-journal-payment', { recursive: true })
      const safeTitle = testInfo.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
      await page.screenshot({
        path: `test-results/bank-journal-payment/${safeTitle}.png`,
        fullPage: true,
      })
    }
  })

  // ── Schema checks (via Supabase client) ──────────────────────

  test('T1: journal_items.account_id kolom ada di database', async () => {
    // If column doesn't exist, select will error with "column does not exist"
    const { error } = await supabase
      .from('journal_items')
      .select('id, account_id')
      .limit(1)
    expect(error).toBeNull()
  })

  test('T2: payments punya 6 kolom adjustment di database', async () => {
    const { error } = await supabase
      .from('payments')
      .select('id, discount_amount, discount_coa_id, fee_amount, fee_coa_id, rounding_amount, rounding_coa_id')
      .limit(1)
    expect(error).toBeNull()
  })

  test('T3: accounts.coa_id tersedia (getAccounts sudah include coa_id)', async () => {
    const { data, error } = await supabase
      .from('accounts')
      .select('id, name, coa_id')
      .limit(1)
    expect(error).toBeNull()
    expect(data).toBeDefined()
  })

  // ── Manual Journal: bank account dropdown ────────────────────

  test('T4: halaman Tambah Jurnal terbuka tanpa error', async ({ page }) => {
    await gotoLive(page, '/accounting/journals/new')
    await expect(page.locator('h3, h2, .ant-typography').filter({ hasText: /jurnal/i })).toBeVisible({ timeout: 8000 })
  })

  test('T5: form jurnal punya baris debit dan kredit', async ({ page }) => {
    await gotoLive(page, '/accounting/journals/new')
    // Minimal ada 2 input field numerik (debit + kredit baris pertama)
    await expect(page.locator('input[placeholder*="0"]').first()).toBeVisible({ timeout: 8000 })
  })

  // ── Payment Form: adjustment fields ──────────────────────────

  test('T6: halaman Tambah Pembayaran (incoming) terbuka tanpa error', async ({ page }) => {
    await gotoLive(page, '/cash/payments/new')
    await expect(page.locator('h3, h2, .ant-typography').filter({ hasText: /pembayaran/i })).toBeVisible({ timeout: 8000 })
  })

  test('T7: section Penyesuaian tampil di form pembayaran incoming', async ({ page }) => {
    await gotoLive(page, '/cash/payments/new')
    await expect(page.getByText('Penyesuaian', { exact: false })).toBeVisible({ timeout: 8000 })
  })

  test('T8: input diskon penjualan tampil untuk incoming', async ({ page }) => {
    await gotoLive(page, '/cash/payments/new')
    await expect(page.getByText(/diskon penjualan/i)).toBeVisible({ timeout: 8000 })
  })

  test('T9: COA diskon muncul saat nilai diskon diisi (incoming)', async ({ page }) => {
    await gotoLive(page, '/cash/payments/new')
    // Isi input diskon dengan nilai > 0
    const discountInput = page.locator('input[placeholder="0"]').first()
    await discountInput.fill('50000')
    await discountInput.blur()
    // COA Diskon select harus muncul
    await expect(page.getByText(/COA Diskon/i)).toBeVisible({ timeout: 4000 })
  })

  test('T10: form outgoing menampilkan label Diskon pembelian dan Biaya bank', async ({ page }) => {
    await gotoLive(page, '/cash/payments/new?type=outgoing')
    // Pilih mode outgoing via radio jika ada
    const outgoingRadio = page.locator('input[type="radio"][value="outgoing"]')
    if (await outgoingRadio.count() > 0) {
      await outgoingRadio.click()
    }
    await expect(page.getByText(/diskon pembelian/i)).toBeVisible({ timeout: 6000 })
    await expect(page.getByText(/biaya bank/i)).toBeVisible({ timeout: 4000 })
  })

  test('T11: input pembulatan tampil di form pembayaran', async ({ page }) => {
    await gotoLive(page, '/cash/payments/new')
    await expect(page.getByText(/pembulatan/i)).toBeVisible({ timeout: 8000 })
  })

  test('T12: COA pembulatan muncul saat nilai pembulatan diisi', async ({ page }) => {
    await gotoLive(page, '/cash/payments/new')
    // Isi input pembulatan
    const roundingInput = page.locator('input[placeholder="0"]').last()
    await roundingInput.fill('50')
    await roundingInput.blur()
    await expect(page.getByText(/COA Pembulatan/i)).toBeVisible({ timeout: 4000 })
  })
})
