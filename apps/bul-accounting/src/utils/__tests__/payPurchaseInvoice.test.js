import { describe, it, expect, vi, beforeEach } from 'vitest'

// payPurchaseInvoice() menulis jurnal pembayaran DAN menandai tagihan lunas dalam
// satu writeBatch. Test ini mengunci dua jaminan: journalId yang tersimpan adalah
// string id jurnal yang benar-benar dibuat, dan kegagalan validasi tidak boleh
// menyisakan jurnal yatim di buku besar.

const h = vi.hoisted(() => ({
  batch: { set: vi.fn(), update: vi.fn(), commit: vi.fn(async () => {}) },
  addDoc: vi.fn(async () => ({ id: 'AUDIT1' })),
}))

vi.mock('../../firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, name) => ({ __collection: name })),
  // doc(collection) -> ref auto-id; doc(db, 'coll', id) -> ref eksplisit
  doc: vi.fn((...args) =>
    args.length === 1
      ? { id: 'JRN-AUTO-1', __collection: args[0].__collection }
      : { id: args[2], __path: `${args[1]}/${args[2]}` }
  ),
  writeBatch: vi.fn(() => h.batch),
  addDoc: h.addDoc,
  updateDoc: vi.fn(),
  getDocs: vi.fn(async () => ({ docs: [] })),
  getDoc: vi.fn(),
  query: vi.fn(), where: vi.fn(), orderBy: vi.fn(),
  Timestamp: {}, limit: vi.fn(), setDoc: vi.fn(),
}))

import { payPurchaseInvoice } from '../accounting'

const balancedJournal = {
  date: '2026-08-20',
  description: 'Bayar INV-99 - PT Ban Sejahtera',
  type: 'bank',
  truckId: null,
  invoiceId: 'INV_DOC_1',
  lines: [
    { accountCode: '5210', debit: 2_500_000, credit: 0 },
    { accountCode: '1112', debit: 0, credit: 2_500_000 },
  ],
  createdBy: 'uid-superadmin',
}

beforeEach(() => {
  h.batch.set.mockClear()
  h.batch.update.mockClear()
  h.batch.commit.mockClear()
  h.addDoc.mockClear()
})

describe('payPurchaseInvoice', () => {
  it('menyimpan journalId sebagai string id jurnal yang dibuat', async () => {
    const returned = await payPurchaseInvoice('INV_DOC_1', {
      journalData: balancedJournal,
      paidDate: '2026-08-20',
      updatedBy: 'uid-superadmin',
    })

    expect(returned).toBe('JRN-AUTO-1')

    const [, updatePayload] = h.batch.update.mock.calls[0]
    expect(updatePayload.journalId).toBe('JRN-AUTO-1')
    expect(typeof updatePayload.journalId).toBe('string')
    expect(updatePayload.status).toBe('paid')
    expect(updatePayload.paidDate).toBe('2026-08-20')
  })

  it('menulis jurnal dan update tagihan dalam satu batch commit', async () => {
    await payPurchaseInvoice('INV_DOC_1', {
      journalData: balancedJournal,
      paidDate: '2026-08-20',
      updatedBy: 'uid-superadmin',
    })

    expect(h.batch.set).toHaveBeenCalledTimes(1)
    expect(h.batch.update).toHaveBeenCalledTimes(1)
    expect(h.batch.commit).toHaveBeenCalledTimes(1)

    const [journalRef, journalDoc] = h.batch.set.mock.calls[0]
    const [invoiceRef] = h.batch.update.mock.calls[0]
    expect(journalRef.id).toBe('JRN-AUTO-1')
    expect(invoiceRef.__path).toBe('purchase_invoices/INV_DOC_1')
    expect(journalDoc.status).toBe('posted')
    expect(journalDoc.totalDebit).toBe(journalDoc.totalCredit)
    // Jurnal pembayaran biaya bisa ditelusuri balik ke tagihannya
    expect(journalDoc.invoiceId).toBe('INV_DOC_1')
  })

  it('membuang field undefined agar Firestore tidak menolak seluruh tulisan', async () => {
    await payPurchaseInvoice('INV_DOC_1', {
      journalData: balancedJournal,
      paidDate: '2026-08-20',
      updatedBy: undefined, // mis. currentUser?.uid saat sesi belum termuat
    })

    const [, updatePayload] = h.batch.update.mock.calls[0]
    expect('updatedBy' in updatePayload).toBe(false)
    expect(Object.values(updatePayload).every(v => v !== undefined)).toBe(true)
  })

  it('jurnal tidak balance: melempar error TANPA menyisakan jurnal yatim', async () => {
    const unbalanced = {
      ...balancedJournal,
      lines: [
        { accountCode: '5210', debit: 2_500_000, credit: 0 },
        { accountCode: '1112', debit: 0, credit: 2_000_000 },
      ],
    }

    await expect(
      payPurchaseInvoice('INV_DOC_1', {
        journalData: unbalanced,
        paidDate: '2026-08-20',
        updatedBy: 'uid-superadmin',
      })
    ).rejects.toThrow(/tidak balance/)

    expect(h.batch.set).not.toHaveBeenCalled()
    expect(h.batch.commit).not.toHaveBeenCalled()
  })

  it('commit gagal (mis. rules menolak update): tidak ada jurnal yang ter-commit', async () => {
    h.batch.commit.mockRejectedValueOnce(new Error('PERMISSION_DENIED'))

    await expect(
      payPurchaseInvoice('INV_DOC_1', {
        journalData: balancedJournal,
        paidDate: '2026-08-20',
        updatedBy: 'uid-admin-biasa',
      })
    ).rejects.toThrow('PERMISSION_DENIED')

    // Batch bersifat all-or-nothing: jurnal tidak pernah mendarat di buku besar,
    // dan audit log tidak ditulis untuk jurnal yang tidak jadi.
    expect(h.addDoc).not.toHaveBeenCalled()
  })
})
