// erp-app/tests/return-invoice-credit.spec.js
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.test' })

// NOTE: this spec exercises a real "Post Retur" against the live ERP-MG database.
// Because `sales_returns` has no delete RLS policy (immutable by design, any status)
// and `invoices` has no soft-delete columns, every successful run permanently leaves
// one tagged invoice + sales_return + journal row behind — see the longer explanation
// in afterAll below. Don't wire this spec into a routine full-suite CI sweep without
// accounting for that (each run adds one more permanent row).

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

let testCustomerId = null
let testProductId = null
let testInvoiceId = null
let testInvoiceItemId = null
let testInvoiceNumber = null
let testCustomerName = null
let createdReturnId = null

// Select in this app is a wrapper around AntD Select (src/components/ui/Select.jsx) —
// it does NOT render a native <select>. To pick an option: locate the wrapper div via
// its <label>, click the hidden search input to open the dropdown, type to filter, then
// click the matching option in the (visible, non-hidden) dropdown. Mirrors the proven
// pattern in playwright/bank-import-reports.spec.js (selectFirstAccount).
async function pickAntdOption(page, labelText, searchText, optionText) {
  const label = page.locator('label', { hasText: labelText }).first()
  const wrapper = label.locator('xpath=..')
  const select = wrapper.locator('.ant-select')
  await select.click()
  // AntD keeps the previous dropdown's leave-transition node in the DOM briefly,
  // so more than one `.ant-select-dropdown:not(.ant-select-dropdown-hidden))` can
  // match at once — the freshly opened one is always the last node appended to body.
  const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last()
  await dropdown.waitFor({ state: 'visible' })
  if (searchText) await select.locator('input.ant-select-input').fill(searchText)
  await dropdown.locator('.ant-select-item-option', { hasText: optionText }).first().click()
}

test.describe('Retur Penjualan mengurangi Piutang Invoice', () => {

  test.use({ storageState: 'tests/.auth.json' })

  test.beforeAll(async () => {
    const { error: authErr } = await supabase.auth.signInWithPassword({
      email: process.env.TEST_EMAIL,
      password: process.env.TEST_PASSWORD,
    })
    if (authErr) throw new Error(`Supabase login gagal: ${authErr.message}`)

    const { data: unit, error: uErr } = await supabase.from('units').select('id').limit(1).single()
    if (uErr) throw new Error(`Tidak ada unit: ${uErr.message}`)

    testCustomerName = `TEST-Customer-ReturnCredit-${Date.now()}`
    const { data: customer, error: cErr } = await supabase
      .from('customers')
      .insert({ name: testCustomerName })
      .select('id').single()
    if (cErr) throw new Error(`Gagal buat test customer: ${cErr.message}`)
    testCustomerId = customer.id

    const { data: product, error: pErr } = await supabase
      .from('products')
      .insert({ name: `TEST-Product-ReturnCredit-${Date.now()}`, base_unit_id: unit.id, sell_price: 100000, is_taxable: false })
      .select('id').single()
    if (pErr) throw new Error(`Gagal buat test product: ${pErr.message}`)
    testProductId = product.id

    testInvoiceNumber = `INV-TEST-RC-${Date.now()}`
    const { data: invoice, error: iErr } = await supabase
      .from('invoices')
      .insert({
        invoice_number: testInvoiceNumber,
        date: new Date().toISOString().split('T')[0],
        type: 'sales',
        customer_id: testCustomerId,
        subtotal: 1000000,
        tax_amount: 0,
        total: 1000000,
        amount_paid: 0,
        status: 'posted',
        notes: '__PLAYWRIGHT_TEST__',
      })
      .select('id').single()
    if (iErr) throw new Error(`Gagal buat test invoice: ${iErr.message}`)
    testInvoiceId = invoice.id

    const { data: item, error: iiErr } = await supabase
      .from('invoice_items')
      .insert({
        invoice_id: testInvoiceId,
        product_id: testProductId,
        unit_id: unit.id,
        quantity: 10,
        quantity_base: 10,
        unit_price: 100000,
        tax_amount: 0,
        total: 1000000,
      })
      .select('id').single()
    if (iiErr) throw new Error(`Gagal buat test invoice item: ${iiErr.message}`)
    testInvoiceItemId = item.id

    // Bangun storageState dari session Supabase (sama seperti ar-ap-aging.spec.js)
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

  // IMPORTANT — full hard-delete cleanup is only possible for a run that fails
  // before "Simpan Draft" is ever clicked (i.e. no sales_returns row was created
  // at all). Once a sales_returns row exists — draft OR posted, status makes no
  // difference — it can never be hard-deleted by this (or any authenticated,
  // non-service-role) client: re-verified directly against ERP-MG's pg_policies
  // (`select policyname, cmd, roles, qual, with_check from pg_policies where
  // tablename = 'sales_returns'`) that the {authenticated} role has sr_select /
  // sr_insert / sr_update policies but NO delete policy whatsoever — not one
  // scoped to status='posted', just entirely absent, so RLS default-denies DELETE
  // for every row regardless of status. That undeletable row then FK-blocks
  // deleting the invoice; the invoice (plus, once posted, the journal
  // `post_sales_return` writes) FK-blocks deleting the customer;
  // inventory_movements from the posting's stock-in reversal FK-blocks the product.
  //
  // So this afterAll does the best a client with only an authenticated
  // (non-service-role) key can do: best-effort hard-delete every row in FK-safe
  // order (this fully succeeds only when the test never got far enough to create a
  // sales_returns row), and falls back to the app's own soft-delete convention
  // (is_active: false, deleted_at) for customer/product when the hard delete is
  // blocked — so the test fixtures at least disappear from every normal app
  // screen. `invoices` has no such soft-delete column, so once a return has been
  // saved against it, the invoice + sales_return (+ journal, once posted) remain
  // as permanent, clearly-tagged (name prefix + notes: '__PLAYWRIGHT_TEST__')
  // audit-trail rows in the live database — this is inherent to exercising the
  // real posting flow, not a gap in this cleanup logic.
  test.afterAll(async () => {
    if (createdReturnId) {
      const { error: sriErr } = await supabase.from('sales_return_items').delete().eq('sales_return_id', createdReturnId)
      if (sriErr) console.warn('cleanup: gagal hapus sales_return_items (expected — no delete policy on this table):', sriErr.message)
      const { error: srErr } = await supabase.from('sales_returns').delete().eq('id', createdReturnId)
      if (srErr) console.warn('cleanup: gagal hapus sales_returns (expected — no delete policy on this table):', srErr.message)
    }
    if (testInvoiceItemId) {
      const { error: iiErr } = await supabase.from('invoice_items').delete().eq('id', testInvoiceItemId)
      if (iiErr) console.warn('cleanup: gagal hapus invoice_items:', iiErr.message)
    }
    if (testInvoiceId) {
      const { error: invErr } = await supabase.from('invoices').delete().eq('id', testInvoiceId)
      if (invErr) console.warn('cleanup: gagal hapus invoices (expected if a linked sales_return still exists):', invErr.message)
    }

    if (testProductId) {
      const { error } = await supabase.from('products').delete().eq('id', testProductId)
      if (error) {
        await supabase.from('products')
          .update({ is_active: false, deleted_at: new Date().toISOString() })
          .eq('id', testProductId)
      }
    }
    if (testCustomerId) {
      const { error } = await supabase.from('customers').delete().eq('id', testCustomerId)
      if (error) {
        await supabase.from('customers')
          .update({ is_active: false, deleted_at: new Date().toISOString() })
          .eq('id', testCustomerId)
      }
    }
    await supabase.auth.signOut()
  })

  test('Buat retur terhubung ke invoice, qty dibatasi returnable_qty, posting mengurangi Piutang', async ({ page }) => {
    await page.goto('/sales/returns/new')
    await expect(page.getByRole('heading', { name: 'Retur Penjualan Baru' })).toBeVisible({ timeout: 10000 })

    // Pilih Customer (AntD Select, showSearch) — filter dengan nama unik test customer.
    await pickAntdOption(page, 'Customer', testCustomerName, testCustomerName)

    // Pilih Invoice Asal — sekarang enabled karena customer sudah dipilih.
    await pickAntdOption(page, 'Invoice Asal', testInvoiceNumber, testInvoiceNumber)

    // Tabel item retur (InvoiceReturnItemsPicker) menampilkan baris utk line invoice ini,
    // dengan kolom "Sisa Bisa Diretur" = 10 (belum pernah diretur sebelumnya).
    const itemRow = page.locator('tr', { hasText: 'TEST-Product-ReturnCredit' })
    await expect(itemRow).toBeVisible({ timeout: 10000 })
    await expect(itemRow.locator('td').nth(2)).toHaveText('10')

    const qtyInput = itemRow.locator('input[type="number"]')

    // Exercise the actual returnable-qty clamp (InvoiceReturnItemsPicker.jsx:19 —
    // Math.min(Math.max(Number(qty) || 0, 0), Number(row.returnable))): enter well
    // above the returnable cap of 10 and confirm the input snaps back to 10, with
    // the row's total reflecting the clamped qty (10 * 100.000 = 1.000.000), not
    // the raw input value. Without this, a broken clamp would still pass the test.
    await qtyInput.fill('99')
    await expect(qtyInput).toHaveValue('10')
    await expect(itemRow).toContainText('1.000.000')

    // Now set the qty we actually want to submit for the rest of the flow.
    await qtyInput.fill('3')
    await expect(itemRow).toContainText('300.000')

    await page.getByRole('button', { name: /Simpan Draft/i }).click()
    await expect(page).toHaveURL(/\/sales\/returns\/[0-9a-f-]{36}$/, { timeout: 10000 })

    const url = page.url()
    createdReturnId = url.split('/').pop()

    await page.getByRole('button', { name: /Post Retur/i }).click()
    await expect(
      page.locator('.ant-message-notice-content', { hasText: /Retur diposting/i })
    ).toBeVisible({ timeout: 10000 })

    // Verifikasi backend: return_credit_amount bertambah 300.000 (3 x 100.000, tanpa pajak)
    // dan status invoice menjadi 'partial' (belum lunas, ada retur credit).
    const { data: inv } = await supabase
      .from('invoices')
      .select('return_credit_amount, status')
      .eq('id', testInvoiceId)
      .single()
    expect(Number(inv.return_credit_amount)).toBe(300000)
    expect(inv.status).toBe('partial')

    // Verifikasi di UI: Laporan AR/AP Aging menghitung Sisa Tagihan dengan
    // mengurangi return_credit_amount (src/pages/reports/ARAPAgingPage.jsx:52-55) —
    // 1.000.000 - 300.000 = 700.000. (Catatan: kartu "Sisa Tagih" di halaman detail
    // invoice sendiri — SalesInvoiceFormPage.jsx:270 — TIDAK memasukkan
    // return_credit_amount ke perhitungan `remaining`, jadi laporan Aging dipakai di
    // sini sebagai titik verifikasi UI yang sudah benar untuk fitur ini.)
    await page.goto('/reports/ar-ap-aging')
    await page.getByRole('button', { name: /Tampilkan/i }).click()
    const invoiceRow = page.locator('tr', { hasText: testInvoiceNumber })
    await expect(invoiceRow).toBeVisible({ timeout: 10000 })
    await expect(invoiceRow).toContainText('700.000')
  })

})
