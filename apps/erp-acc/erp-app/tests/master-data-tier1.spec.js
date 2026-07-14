// erp-app/tests/master-data-tier1.spec.js
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import fs from 'fs'

dotenv.config({ path: '.env' })
dotenv.config({ path: '.env.test' })

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

const runId = Date.now()
const prefix = `PW-${runId}`
const records = {
  category: {
    route: '/master/categories',
    title: 'Kategori Produk',
    addButton: 'Tambah Kategori',
    addTitle: 'Tambah Kategori Produk',
    editTitle: 'Edit Kategori Produk',
    deleteTitle: 'Hapus Kategori Produk',
    codePlaceholder: 'Contoh: RAW',
    namePlaceholder: 'Contoh: Bahan Baku',
    code: `${prefix}-CAT`,
    name: `${prefix} Kategori`,
    editedName: `${prefix} Kategori Edit`,
  },
  paymentTerm: {
    route: '/master/payment-terms',
    title: 'Syarat Pembayaran',
    addButton: 'Tambah Syarat',
    addTitle: 'Tambah Syarat Pembayaran',
    editTitle: 'Edit Syarat Pembayaran',
    deleteTitle: 'Hapus Syarat Pembayaran',
    codePlaceholder: 'Contoh: NET30',
    namePlaceholder: 'Contoh: Net 30 Hari',
    code: `${prefix}-TERM`,
    name: `${prefix} Net 45`,
    editedName: `${prefix} Net 60`,
  },
  taxCode: {
    route: '/master/tax-codes',
    title: 'Kode Pajak',
    addButton: 'Tambah Kode Pajak',
    addTitle: 'Tambah Kode Pajak',
    editTitle: 'Edit Kode Pajak',
    deleteTitle: 'Hapus Kode Pajak',
    codePlaceholder: 'Contoh: PPN11',
    namePlaceholder: 'Contoh: PPN 11%',
    code: `${prefix}-TAX`,
    name: `${prefix} Tax`,
    editedName: `${prefix} Tax Edit`,
  },
  warehouse: {
    route: '/master/warehouses',
    title: 'Gudang',
    addButton: 'Tambah Gudang',
    addTitle: 'Tambah Gudang',
    editTitle: 'Edit Gudang',
    deleteTitle: 'Hapus Gudang',
    codePlaceholder: 'Contoh: WH-UTAMA',
    namePlaceholder: 'Contoh: Gudang Utama',
    code: `${prefix}-WH`,
    name: `${prefix} Warehouse`,
    editedName: `${prefix} Warehouse Edit`,
  },
}

let defaultWarehouseLabel = 'WH-MAIN - Gudang Utama'
let testUserId = null

async function writeAuthState() {
  const { error } = await supabase.auth.signInWithPassword({
    email: process.env.TEST_EMAIL,
    password: process.env.TEST_PASSWORD,
  })
  if (error) throw new Error(`Supabase login gagal: ${error.message}`)

  const { data: sessionData } = await supabase.auth.getSession()
  const session = sessionData.session
  if (!session) throw new Error('Supabase session tidak ada setelah login')
  testUserId = session.user.id

  const projectRef = new URL(process.env.VITE_SUPABASE_URL).hostname.split('.')[0]
  const storageKey = `sb-${projectRef}-auth-token`
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
}

async function cleanupTestRecords() {
  const cleanups = [
    'product_categories',
    'payment_terms',
    'tax_codes',
    'warehouses',
  ]

  for (const table of cleanups) {
    await supabase
      .from(table)
      .update({
        is_active: false,
        deleted_at: new Date().toISOString(),
        deleted_by: testUserId,
      })
      .like('code', 'PW-%')
  }
}

async function openMasterPage(page, config) {
  await page.goto(config.route)
  await expect(page.getByRole('heading', { name: config.title })).toBeVisible({ timeout: 10000 })
}

function activeModal(page, title) {
  return page.locator('.ant-modal').filter({ hasText: title }).last()
}

async function createRecord(page, config) {
  await openMasterPage(page, config)
  await page.getByRole('button', { name: config.addButton }).click()

  const modal = activeModal(page, config.addTitle)
  await expect(modal).toBeVisible()
  await modal.getByPlaceholder(config.codePlaceholder).fill(config.code)
  await modal.getByPlaceholder(config.namePlaceholder).fill(config.name)

  if (config === records.paymentTerm) {
    await modal.locator('.ant-input-number-input').nth(0).fill('45')
  }

  if (config === records.taxCode) {
    await modal.locator('.ant-input-number-input').nth(0).fill('5')
  }

  if (config === records.warehouse) {
    await modal.getByPlaceholder('Alamat gudang').fill('Alamat test Playwright')
  }

  await modal.getByRole('button', { name: 'Tambah' }).click()
  await expect(page.locator('tr', { hasText: config.code })).toBeVisible({ timeout: 10000 })
  await expect(page.locator('tr', { hasText: config.name })).toBeVisible()
}

async function editRecord(page, config) {
  const row = page.locator('tr', { hasText: config.code })
  await row.locator('button[title="Edit"]').click()

  const modal = activeModal(page, config.editTitle)
  await expect(modal).toBeVisible()
  await modal.getByPlaceholder(config.namePlaceholder).fill(config.editedName)
  await modal.getByRole('button', { name: 'Simpan' }).click()

  await expect(page.locator('tr', { hasText: config.editedName })).toBeVisible({ timeout: 10000 })
}

async function deleteRecord(page, config) {
  const row = page.locator('tr', { hasText: config.code })
  await row.locator('button[title="Hapus"]').click()

  const modal = activeModal(page, config.deleteTitle)
  await expect(modal).toBeVisible()
  await modal.getByRole('button', { name: 'Hapus' }).click()

  await expect(page.locator('tr', { hasText: config.code })).toHaveCount(0, { timeout: 10000 })
}

async function exerciseCrud(page, config) {
  await createRecord(page, config)
  await editRecord(page, config)
  await deleteRecord(page, config)
}

test.describe('Master Data Tier 1', () => {
  test.use({ storageState: 'tests/.auth.json' })

  test.beforeAll(async () => {
    await writeAuthState()
    await cleanupTestRecords()

    const { data: defaultWarehouse } = await supabase
      .from('warehouses')
      .select('code, name')
      .eq('is_active', true)
      .eq('is_default', true)
      .maybeSingle()

    if (defaultWarehouse) {
      defaultWarehouseLabel = `${defaultWarehouse.code} - ${defaultWarehouse.name}`
    }
  })

  test.afterAll(async () => {
    await cleanupTestRecords()
    await supabase.auth.signOut()
  })

  test('seed master data tier 1 tampil di halaman master', async ({ page }) => {
    await openMasterPage(page, records.category)
    await expect(page.locator('tr', { hasText: 'UNCAT' })).toBeVisible()

    await openMasterPage(page, records.paymentTerm)
    await expect(page.locator('tr', { hasText: 'CASH' })).toBeVisible()
    await expect(page.locator('tr', { hasText: 'NET30' })).toBeVisible()

    await openMasterPage(page, records.taxCode)
    await expect(page.locator('tr', { hasText: 'PPN11' })).toBeVisible()

    await openMasterPage(page, records.warehouse)
    await expect(page.locator('tr', { hasText: 'WH-MAIN' })).toBeVisible()
  })

  test('kategori produk bisa tambah, edit, dan soft delete dari UI', async ({ page }) => {
    await exerciseCrud(page, records.category)
  })

  test('syarat pembayaran bisa tambah, edit, dan soft delete dari UI', async ({ page }) => {
    await exerciseCrud(page, records.paymentTerm)
  })

  test('kode pajak bisa tambah, edit, dan soft delete dari UI', async ({ page }) => {
    await exerciseCrud(page, records.taxCode)
  })

  test('gudang bisa tambah, edit, dan soft delete dari UI', async ({ page }) => {
    await exerciseCrud(page, records.warehouse)
  })

  test('form GD dan GR memuat dropdown gudang default', async ({ page }) => {
    await page.goto('/sales/deliveries/new')
    await expect(page.getByRole('heading', { name: 'Pengiriman Baru' })).toBeVisible({ timeout: 10000 })
    await expect(page.locator('.ant-select-selection-item', { hasText: defaultWarehouseLabel })).toBeVisible({ timeout: 10000 })

    await page.goto('/purchase/receipts/new')
    await expect(page.getByRole('heading', { name: 'Penerimaan Baru' })).toBeVisible({ timeout: 10000 })
    await expect(page.locator('.ant-select-selection-item', { hasText: defaultWarehouseLabel })).toBeVisible({ timeout: 10000 })
  })
})
