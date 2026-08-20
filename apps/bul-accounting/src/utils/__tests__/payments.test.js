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

import { validateAllocations, summarizeAllocations } from '../payments'

const baris = (over = {}) => ({
  invoiceId: 'inv1', invoiceNo: 'INV-001', truckId: null,
  amount: 1000000, totalPaid: 0,
  selected: true, jumlahBayar: 1000000, pph: 0,
  ...over,
})

describe('validateAllocations', () => {
  it('menolak ketika tidak ada baris tercentang', () => {
    const r = validateAllocations([baris({ selected: false })])
    expect(r.valid).toBe(false)
    expect(r.formError).toBe('Pilih minimal satu invoice')
  })

  it('menerima alokasi penuh yang wajar', () => {
    const r = validateAllocations([baris()])
    expect(r.valid).toBe(true)
    expect(r.errors).toEqual({})
  })

  it('menerima alokasi sebagian', () => {
    const r = validateAllocations([baris({ jumlahBayar: 400000 })])
    expect(r.valid).toBe(true)
  })

  it('menolak jumlah bayar nol', () => {
    const r = validateAllocations([baris({ jumlahBayar: 0 })])
    expect(r.valid).toBe(false)
    expect(r.errors.inv1).toBe('Jumlah bayar harus lebih dari 0')
  })

  it('menolak jumlah bayar negatif', () => {
    const r = validateAllocations([baris({ jumlahBayar: -1 })])
    expect(r.valid).toBe(false)
    expect(r.errors.inv1).toBe('Jumlah bayar harus lebih dari 0')
  })

  it('menolak overpayment di luar toleransi', () => {
    const r = validateAllocations([baris({ jumlahBayar: 1000001 })])
    expect(r.valid).toBe(false)
    expect(r.errors.inv1).toBe('Jumlah bayar melebihi sisa tagihan')
  })

  it('memperhitungkan cicilan yang sudah masuk', () => {
    const r = validateAllocations([baris({ totalPaid: 600000, jumlahBayar: 400001 })])
    expect(r.valid).toBe(false)
    expect(r.errors.inv1).toBe('Jumlah bayar melebihi sisa tagihan')
  })

  it('menoleransi selisih pembulatan 0,5', () => {
    const r = validateAllocations([baris({ jumlahBayar: 1000000.4 })])
    expect(r.valid).toBe(true)
  })

  it('menolak PPh negatif', () => {
    const r = validateAllocations([baris({ pph: -1 })])
    expect(r.valid).toBe(false)
    expect(r.errors.inv1).toBe('PPh tidak valid')
  })

  it('menolak PPh melebihi jumlah bayar', () => {
    const r = validateAllocations([baris({ jumlahBayar: 100000, pph: 100001 })])
    expect(r.valid).toBe(false)
    expect(r.errors.inv1).toBe('PPh tidak valid')
  })

  it('menerima PPh sama dengan jumlah bayar', () => {
    const r = validateAllocations([baris({ jumlahBayar: 100000, pph: 100000 })])
    expect(r.valid).toBe(true)
  })

  it('mengabaikan baris yang tidak tercentang walau nilainya kacau', () => {
    const r = validateAllocations([
      baris(),
      baris({ invoiceId: 'inv2', selected: false, jumlahBayar: 99999999 }),
    ])
    expect(r.valid).toBe(true)
  })

  it('melaporkan error per invoice, bukan hanya yang pertama', () => {
    const r = validateAllocations([
      baris({ invoiceId: 'inv1', jumlahBayar: 0 }),
      baris({ invoiceId: 'inv2', jumlahBayar: 100000, pph: 200000 }),
    ])
    expect(r.valid).toBe(false)
    expect(Object.keys(r.errors).sort()).toEqual(['inv1', 'inv2'])
  })
})

describe('summarizeAllocations', () => {
  it('menjumlahkan hanya baris tercentang', () => {
    const s = summarizeAllocations([
      baris({ invoiceId: 'inv1', jumlahBayar: 1000000, pph: 20000 }),
      baris({ invoiceId: 'inv2', jumlahBayar: 500000, pph: 10000 }),
      baris({ invoiceId: 'inv3', selected: false, jumlahBayar: 999999 }),
    ])
    expect(s).toEqual({ count: 2, totalGross: 1500000, totalPph: 30000, totalNet: 1470000 })
  })

  it('nol baris menghasilkan nol semua', () => {
    expect(summarizeAllocations([])).toEqual({ count: 0, totalGross: 0, totalPph: 0, totalNet: 0 })
  })

  it('menerima input string dari field form', () => {
    const s = summarizeAllocations([baris({ jumlahBayar: '250000', pph: '5000' })])
    expect(s.totalGross).toBe(250000)
    expect(s.totalNet).toBe(245000)
  })
})
