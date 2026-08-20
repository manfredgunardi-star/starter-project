import { describe, it, expect } from 'vitest'
import { computeInvoiceStatus, sisaTagihan } from '../payments'

describe('computeInvoiceStatus', () => {
  it('belum dibayar sama sekali -> unpaid', () => {
    expect(computeInvoiceStatus(1000000, 0)).toBe('unpaid')
  })

  it('dibayar sebagian -> partial', () => {
    expect(computeInvoiceStatus(1000000, 400000)).toBe('partial')
  })

  it('dibayar penuh -> paid', () => {
    expect(computeInvoiceStatus(1000000, 1000000)).toBe('paid')
  })

  it('kelebihan bayar tetap paid', () => {
    expect(computeInvoiceStatus(1000000, 1000001)).toBe('paid')
  })

  it('selisih pembulatan di bawah 0,5 dianggap lunas', () => {
    expect(computeInvoiceStatus(1000000, 999999.6)).toBe('paid')
  })

  it('nominal mikro tetap partial, bukan unpaid (perilaku lama dipertahankan)', () => {
    expect(computeInvoiceStatus(1000000, 0.4)).toBe('partial')
  })

  it('totalPaid null/undefined diperlakukan sebagai 0', () => {
    expect(computeInvoiceStatus(1000000, null)).toBe('unpaid')
    expect(computeInvoiceStatus(1000000, undefined)).toBe('unpaid')
  })
})

describe('sisaTagihan', () => {
  it('menghitung amount dikurangi totalPaid', () => {
    expect(sisaTagihan({ amount: 1000000, totalPaid: 300000 })).toBe(700000)
  })

  it('field kosong diperlakukan sebagai 0', () => {
    expect(sisaTagihan({ amount: 1000000 })).toBe(1000000)
    expect(sisaTagihan({})).toBe(0)
  })
})
