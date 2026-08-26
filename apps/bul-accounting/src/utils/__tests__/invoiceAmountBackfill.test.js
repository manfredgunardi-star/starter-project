import { describe, it, expect } from 'vitest'
import { planInvoiceAmountFix, SKIP_REASONS } from '../invoiceAmountBackfill'

const queueItem = (over = {}) => ({
  id: 'IQ-INV-1',
  type: 'invoice',
  status: 'approved',
  accountingInvoiceId: 'INV-1',
  noInvoice: 'SJT/001/01/2026',
  totalNilai: 12324060,
  totalUJ: 4480000,
  piutangNet: 7844060,
  ...over,
})

const invoice = (over = {}) => ({
  id: 'INV-1',
  invoiceNo: 'SJT/001/01/2026',
  amount: 12324060,
  status: 'unpaid',
  ...over,
})

describe('planInvoiceAmountFix', () => {
  it('merencanakan koreksi amount bruto menjadi bersih', () => {
    const plan = planInvoiceAmountFix([queueItem()], [invoice()])

    expect(plan.updates).toEqual([{
      invoiceId: 'INV-1',
      invoiceNo: 'SJT/001/01/2026',
      amountBefore: 12324060,
      amountAfter: 7844060,
      amountGross: 12324060,
      totalUJ: 4480000,
    }])
    expect(plan.skipped).toEqual([])
  })

  it('menjumlahkan dampak koreksi', () => {
    const plan = planInvoiceAmountFix([queueItem()], [invoice()])

    expect(plan.totals).toEqual({
      updateCount: 1,
      skipCount: 0,
      totalUJ: 4480000,
      amountDelta: -4480000,
    })
  })

  it('idempoten: melewati invoice yang amountGross-nya sudah terisi', () => {
    const plan = planInvoiceAmountFix(
      [queueItem()],
      [invoice({ amount: 7844060, amountGross: 12324060, totalUJ: 4480000 })],
    )

    expect(plan.updates).toEqual([])
    expect(plan.skipped).toEqual([
      { invoiceId: 'INV-1', invoiceNo: 'SJT/001/01/2026', reason: SKIP_REASONS.ALREADY_BACKFILLED },
    ])
  })

  it('melewati invoice yang sudah punya pembayaran', () => {
    const plan = planInvoiceAmountFix([queueItem()], [invoice({ totalPaid: 1000000 })])

    expect(plan.updates).toEqual([])
    expect(plan.skipped[0].reason).toBe(SKIP_REASONS.HAS_PAYMENT)
  })

  it('melewati invoice yang punya array payments tidak kosong', () => {
    const plan = planInvoiceAmountFix(
      [queueItem()],
      [invoice({ payments: [{ jumlahBayar: 500 }] })],
    )

    expect(plan.skipped[0].reason).toBe(SKIP_REASONS.HAS_PAYMENT)
  })

  it('melewati invoice yang sudah dibatalkan', () => {
    const plan = planInvoiceAmountFix([queueItem()], [invoice({ status: 'cancelled' })])

    expect(plan.skipped[0].reason).toBe(SKIP_REASONS.CANCELLED)
  })

  it('melewati item antrian yang belum approved', () => {
    const plan = planInvoiceAmountFix([queueItem({ status: 'pending' })], [invoice()])

    expect(plan.skipped[0].reason).toBe(SKIP_REASONS.QUEUE_NOT_APPROVED)
  })

  it('melewati item antrian yang dokumen invoice-nya tidak ada', () => {
    const plan = planInvoiceAmountFix([queueItem()], [])

    expect(plan.skipped).toEqual([
      { invoiceId: 'INV-1', invoiceNo: 'SJT/001/01/2026', reason: SKIP_REASONS.INVOICE_MISSING },
    ])
  })

  it('melewati invoice tanpa uang jalan', () => {
    const plan = planInvoiceAmountFix(
      [queueItem({ totalUJ: 0, piutangNet: 12324060 })],
      [invoice()],
    )

    expect(plan.skipped[0].reason).toBe(SKIP_REASONS.NO_UANG_JALAN)
  })

  it('mengabaikan item antrian yang bukan tipe invoice', () => {
    const plan = planInvoiceAmountFix(
      [queueItem({ type: 'uang_jalan' }), queueItem({ type: 'transaksi_kas' })],
      [invoice()],
    )

    expect(plan.updates).toEqual([])
    expect(plan.skipped).toEqual([])
  })

  it('mengabaikan item antrian tanpa accountingInvoiceId', () => {
    const plan = planInvoiceAmountFix([queueItem({ accountingInvoiceId: null })], [invoice()])

    expect(plan.updates).toEqual([])
    expect(plan.skipped).toEqual([])
  })

  it('menangani banyak item sekaligus', () => {
    const plan = planInvoiceAmountFix(
      [
        queueItem(),
        queueItem({ id: 'IQ-INV-2', accountingInvoiceId: 'INV-2', noInvoice: 'SJP/002/02/2026', totalNilai: 8348080, totalUJ: 2000000, piutangNet: 6348080 }),
        queueItem({ id: 'IQ-INV-3', accountingInvoiceId: 'INV-3', noInvoice: 'SJP/003/02/2026', totalNilai: 5000000, totalUJ: 1000000, piutangNet: 4000000 }),
      ],
      [
        invoice(),
        invoice({ id: 'INV-2', invoiceNo: 'SJP/002/02/2026', amount: 8348080 }),
        invoice({ id: 'INV-3', invoiceNo: 'SJP/003/02/2026', amount: 5000000, totalPaid: 100 }),
      ],
    )

    expect(plan.totals).toEqual({
      updateCount: 2,
      skipCount: 1,
      totalUJ: 6480000,
      amountDelta: -6480000,
    })
  })

  it('mengembalikan rencana kosong untuk input kosong', () => {
    expect(planInvoiceAmountFix([], [])).toEqual({
      updates: [],
      skipped: [],
      totals: { updateCount: 0, skipCount: 0, totalUJ: 0, amountDelta: 0 },
    })
  })
})
