import { describe, it, expect, vi, beforeEach } from 'vitest'

// Regresi: approveIntegrationItem menyimpan nilai BRUTO ke invoices.amount,
// sementara jurnalnya mendebit 1121 dengan nilai BERSIH. Subledger AR dan buku
// besar jadi berselisih sebesar total uang jalan.

vi.mock('../../firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(), doc: vi.fn(), onSnapshot: vi.fn(),
  query: vi.fn(), where: vi.fn(),
  updateDoc: vi.fn(async () => {}),
  getDocs: vi.fn(async () => ({ docs: [] })),
}))

const saveInvoice = vi.fn(async () => ({ id: 'INV-DOC-1' }))
vi.mock('../accounting', () => ({
  saveJournal: vi.fn(async () => 'JRN-1'),
  deleteJournal: vi.fn(async () => {}),
  saveInvoice: (...args) => saveInvoice(...args),
  updateInvoice: vi.fn(async () => {}),
  saveCustomer: vi.fn(async () => ({ id: 'CUST-1' })),
  getNextCustomerNo: vi.fn(async () => 'C-001'),
}))

import { approveIntegrationItem } from '../integrationUtils'

// Angka nyata dari invoice SJT/001/01/2026
const queueItem = {
  id: 'IQ-INV-abc',
  type: 'invoice',
  tanggal: '2026-01-25',
  noInvoice: 'SJT/001/01/2026',
  pt: 'PT. Tunas Maju',
  totalNilai: 12324060,
  totalUJ: 4480000,
  piutangNet: 7844060,
  sourceInvoiceId: 'INV-SRC-1',
}

const journalLines = [
  { accountCode: '1121', debit: 7844060, credit: 0, keterangan: 'Piutang' },
  { accountCode: '4100', debit: 0, credit: 7844060, keterangan: 'Pendapatan' },
]

describe('approveIntegrationItem — invoice', () => {
  beforeEach(() => { saveInvoice.mockClear() })

  it('menyimpan piutang bersih ke amount, bukan nilai bruto', async () => {
    await approveIntegrationItem(queueItem, journalLines, '2026-01-25', 'Invoice', 'uid1')

    expect(saveInvoice).toHaveBeenCalledTimes(1)
    expect(saveInvoice.mock.calls[0][0]).toMatchObject({
      amount: 7844060,
      amountGross: 12324060,
      totalUJ: 4480000,
    })
  })

  it('jatuh ke selisih manual ketika piutangNet tidak dikirim', async () => {
    const { piutangNet, ...tanpaNet } = queueItem
    await approveIntegrationItem(tanpaNet, journalLines, '2026-01-25', 'Invoice', 'uid1')

    expect(saveInvoice.mock.calls[0][0]).toMatchObject({
      amount: 7844060,
      amountGross: 12324060,
      totalUJ: 4480000,
    })
  })

  it('menyimpan totalUJ 0 untuk invoice tanpa uang jalan', async () => {
    const journalLinesTanpaUJ = [
      { accountCode: '1121', debit: 12324060, credit: 0, keterangan: 'Piutang' },
      { accountCode: '4100', debit: 0, credit: 12324060, keterangan: 'Pendapatan' },
    ]
    await approveIntegrationItem(
      { ...queueItem, totalUJ: 0, piutangNet: 12324060 },
      journalLinesTanpaUJ, '2026-01-25', 'Invoice', 'uid1',
    )

    expect(saveInvoice.mock.calls[0][0]).toMatchObject({
      amount: 12324060,
      amountGross: 12324060,
      totalUJ: 0,
    })
  })

  it('mengikuti baris 1121 yang diedit akuntan, bukan piutangNet bawaan bridge', async () => {
    // Regresi: akuntan boleh mengedit baris jurnal sebelum approve. amount
    // harus cocok dengan Dr 1121 yang benar-benar terposting, bukan angka
    // yang disarankan bridge — jika tidak, subledger bisa berselisih dari
    // GL lewat jalur ini persis seperti bug yang diperbaiki fix ini.
    const journalLinesDiedit = [
      { accountCode: '1121', debit: 8000000, credit: 0, keterangan: 'Piutang (disesuaikan akuntan)' },
      { accountCode: '4100', debit: 0, credit: 8000000, keterangan: 'Pendapatan' },
    ]
    await approveIntegrationItem(queueItem, journalLinesDiedit, '2026-01-25', 'Invoice', 'uid1')

    expect(saveInvoice.mock.calls[0][0]).toMatchObject({ amount: 8000000 })
  })

  it('jatuh ke piutangNet ketika baris jurnal tidak memuat akun 1121', async () => {
    const journalLinesTanpa1121 = [
      { accountCode: '4100', debit: 0, credit: 12324060, keterangan: 'Pendapatan' },
    ]
    await approveIntegrationItem(queueItem, journalLinesTanpa1121, '2026-01-25', 'Invoice', 'uid1')

    expect(saveInvoice.mock.calls[0][0]).toMatchObject({ amount: 7844060 })
  })
})
