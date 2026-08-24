import { describe, it, expect } from 'vitest'
import { resolvePiutangNet, describeInvoiceGross } from '../invoiceAmounts'

describe('resolvePiutangNet', () => {
  it('memakai piutangNet bila tersedia', () => {
    expect(resolvePiutangNet({ piutangNet: 7844060, totalNilai: 12324060, totalUJ: 4480000 }))
      .toBe(7844060)
  })

  it('jatuh ke totalNilai dikurangi totalUJ bila piutangNet tidak ada', () => {
    expect(resolvePiutangNet({ totalNilai: 12324060, totalUJ: 4480000 })).toBe(7844060)
  })

  it('jatuh ke totalNilai bila totalUJ juga tidak ada', () => {
    expect(resolvePiutangNet({ totalNilai: 12324060 })).toBe(12324060)
  })

  it('mengabaikan piutangNet yang bukan angka berhingga', () => {
    expect(resolvePiutangNet({ piutangNet: null, totalNilai: 1000, totalUJ: 400 })).toBe(600)
    expect(resolvePiutangNet({ piutangNet: NaN, totalNilai: 1000, totalUJ: 400 })).toBe(600)
  })

  it('mengembalikan nilai negatif apa adanya ketika uang jalan melebihi nilai invoice', () => {
    expect(resolvePiutangNet({ totalNilai: 1000, totalUJ: 1500 })).toBe(-500)
  })

  it('mengembalikan 0 untuk item kosong', () => {
    expect(resolvePiutangNet(undefined)).toBe(0)
    expect(resolvePiutangNet({})).toBe(0)
  })
})

describe('describeInvoiceGross', () => {
  it('mengembalikan rincian ketika invoice punya potongan uang jalan', () => {
    expect(describeInvoiceGross({ amount: 7844060, amountGross: 12324060, totalUJ: 4480000 }))
      .toEqual({ gross: 12324060, uj: 4480000 })
  })

  it('mengembalikan null untuk invoice manual tanpa uang jalan', () => {
    expect(describeInvoiceGross({ amount: 500000 })).toBeNull()
    expect(describeInvoiceGross({ amount: 500000, totalUJ: 0 })).toBeNull()
  })

  it('mengembalikan null ketika amountGross belum di-backfill', () => {
    expect(describeInvoiceGross({ amount: 12324060, totalUJ: 4480000 })).toBeNull()
  })

  it('mengembalikan null untuk input kosong', () => {
    expect(describeInvoiceGross(undefined)).toBeNull()
  })
})
