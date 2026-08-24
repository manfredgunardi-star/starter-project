import { describe, it, expect } from 'vitest'
import { resolvePiutangNet, describeInvoiceGross, resolveApprovedAmount } from '../invoiceAmounts'

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

  it('mengembalikan null ketika amount sudah diedit manual setelah backfill (rincian basi)', () => {
    // gross(12324060) - uj(4480000) = 7844060, tapi amount di-edit manual jadi 5000000
    expect(describeInvoiceGross({ amount: 5000000, amountGross: 12324060, totalUJ: 4480000 }))
      .toBeNull()
  })

  it('tetap mengembalikan rincian untuk selisih pembulatan kecil (<= Rp 1)', () => {
    expect(describeInvoiceGross({ amount: 7844060.4, amountGross: 12324060, totalUJ: 4480000 }))
      .toEqual({ gross: 12324060, uj: 4480000 })
  })
})

describe('resolveApprovedAmount', () => {
  const item = { totalNilai: 12324060, totalUJ: 4480000, piutangNet: 7844060 }

  it('memakai debit baris 1121 yang benar-benar disetujui akuntan', () => {
    expect(resolveApprovedAmount(item, [{ accountCode: '1121', debit: 9000000, credit: 0 }]))
      .toBe(9000000)
  })

  it('mengikuti baris 1121 walau berbeda dari item.piutangNet (akuntan mengedit sebelum approve)', () => {
    expect(resolveApprovedAmount(item, [{ accountCode: '1121', debit: 8000000, credit: 0 }]))
      .not.toBe(item.piutangNet)
  })

  it('jatuh ke resolvePiutangNet ketika baris 1121 tidak ada', () => {
    expect(resolveApprovedAmount(item, [{ accountCode: '4100', debit: 0, credit: 12324060 }]))
      .toBe(7844060)
  })

  it('jatuh ke resolvePiutangNet ketika debit 1121 bukan angka berhingga', () => {
    expect(resolveApprovedAmount(item, [{ accountCode: '1121', debit: NaN, credit: 0 }]))
      .toBe(7844060)
  })

  it('jatuh ke resolvePiutangNet ketika journalLines kosong atau tidak ada', () => {
    expect(resolveApprovedAmount(item, [])).toBe(7844060)
    expect(resolveApprovedAmount(item, undefined)).toBe(7844060)
  })
})
