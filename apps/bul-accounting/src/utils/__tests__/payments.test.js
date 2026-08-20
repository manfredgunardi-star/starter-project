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

import { buildPaymentJournalLines, buildPaymentEntries } from '../payments'

const totalDebit = (lines) => lines.reduce((s, l) => s + (l.debit || 0), 0)
const totalCredit = (lines) => lines.reduce((s, l) => s + (l.credit || 0), 0)

describe('buildPaymentJournalLines', () => {
  it('tanpa PPh: dua baris, bank penuh lawan satu piutang', () => {
    const lines = buildPaymentJournalLines({
      rows: [baris({ jumlahBayar: 1000000, pph: 0 })],
      account: '1112',
      keterangan: 'Pembayaran PT ABC',
    })
    expect(lines).toHaveLength(2)
    expect(lines[0]).toEqual({
      accountCode: '1112', debit: 1000000, credit: 0,
      keterangan: 'Pembayaran PT ABC', truckId: null,
    })
    expect(lines[1].accountCode).toBe('1121')
    expect(lines[1].credit).toBe(1000000)
    expect(totalDebit(lines)).toBe(totalCredit(lines))
  })

  it('tidak memunculkan baris 1172 ketika total PPh nol', () => {
    const lines = buildPaymentJournalLines({
      rows: [baris({ pph: 0 })], account: '1112', keterangan: 'x',
    })
    expect(lines.some(l => l.accountCode === '1172')).toBe(false)
  })

  it('dengan PPh: bank berkurang, satu baris 1172 berisi total PPh', () => {
    const lines = buildPaymentJournalLines({
      rows: [
        baris({ invoiceId: 'inv1', invoiceNo: 'INV-001', jumlahBayar: 1000000, pph: 20000 }),
        baris({ invoiceId: 'inv2', invoiceNo: 'INV-002', jumlahBayar: 500000, pph: 10000 }),
      ],
      account: '1112',
      keterangan: 'Pembayaran PT ABC',
    })
    expect(lines[0]).toMatchObject({ accountCode: '1112', debit: 1470000 })
    expect(lines[1]).toMatchObject({ accountCode: '1172', debit: 30000 })
    expect(totalDebit(lines)).toBe(1500000)
    expect(totalCredit(lines)).toBe(1500000)
  })

  it('menggabungkan PPh walau hanya sebagian baris yang dipotong', () => {
    const lines = buildPaymentJournalLines({
      rows: [
        baris({ invoiceId: 'inv1', jumlahBayar: 1000000, pph: 20000 }),
        baris({ invoiceId: 'inv2', jumlahBayar: 500000, pph: 0 }),
      ],
      account: '1112', keterangan: 'x',
    })
    const pphLines = lines.filter(l => l.accountCode === '1172')
    expect(pphLines).toHaveLength(1)
    expect(pphLines[0].debit).toBe(20000)
    expect(totalDebit(lines)).toBe(totalCredit(lines))
  })

  it('memecah kredit piutang per invoice dengan nomor invoice di keterangan', () => {
    const lines = buildPaymentJournalLines({
      rows: [
        baris({ invoiceId: 'inv1', invoiceNo: 'INV-001', jumlahBayar: 100000 }),
        baris({ invoiceId: 'inv2', invoiceNo: 'INV-002', jumlahBayar: 200000 }),
        baris({ invoiceId: 'inv3', invoiceNo: 'INV-003', jumlahBayar: 300000 }),
      ],
      account: '1112', keterangan: 'Setoran 20 Agu',
    })
    const kredit = lines.filter(l => l.accountCode === '1121')
    expect(kredit).toHaveLength(3)
    expect(kredit.map(l => l.credit)).toEqual([100000, 200000, 300000])
    expect(kredit[0].keterangan).toBe('Setoran 20 Agu — INV-001')
  })

  it('meneruskan truckId per baris dan tidak menaruhnya di baris kas', () => {
    const lines = buildPaymentJournalLines({
      rows: [
        baris({ invoiceId: 'inv1', truckId: 'T1', jumlahBayar: 100000 }),
        baris({ invoiceId: 'inv2', truckId: 'T2', jumlahBayar: 200000 }),
      ],
      account: '1112', keterangan: 'x',
    })
    expect(lines[0].truckId).toBe(null)
    const kredit = lines.filter(l => l.accountCode === '1121')
    expect(kredit.map(l => l.truckId)).toEqual(['T1', 'T2'])
  })

  it('memakai potongan invoiceId ketika nomor invoice kosong', () => {
    const lines = buildPaymentJournalLines({
      rows: [baris({ invoiceId: 'abcdefgh1234', invoiceNo: '', jumlahBayar: 100000 })],
      account: '1112', keterangan: 'Setoran',
    })
    expect(lines[1].keterangan).toBe('Setoran — abcdefgh')
  })

  it('tetap balance untuk 20 invoice dengan PPh acak-tetap', () => {
    const rows = Array.from({ length: 20 }, (_, i) => baris({
      invoiceId: `inv${i}`, invoiceNo: `INV-${i}`,
      amount: 1000000, jumlahBayar: 1000000, pph: (i % 5) * 1000,
    }))
    const lines = buildPaymentJournalLines({ rows, account: '1113', keterangan: 'batch' })
    expect(totalDebit(lines)).toBe(totalCredit(lines))
    expect(totalCredit(lines)).toBe(20000000)
  })

  it('satu invoice menghasilkan jurnal setara modal pembayaran lama', () => {
    // PembayaranModal lama, cabang berPPh: Dr kas(net), Dr 1172(pph), Cr 1121(gross)
    const lines = buildPaymentJournalLines({
      rows: [baris({ jumlahBayar: 1000000, pph: 20000 })],
      account: '1112', keterangan: 'Pembayaran INV-001 - PT ABC',
    })
    expect(lines.map(l => l.accountCode)).toEqual(['1112', '1172', '1121'])
    expect(lines[0].debit).toBe(980000)
    expect(lines[1].debit).toBe(20000)
    expect(lines[2].credit).toBe(1000000)
  })
})

describe('buildPaymentEntries', () => {
  it('menghasilkan satu entri per invoice tercentang dengan netDiterima terhitung', () => {
    const out = buildPaymentEntries({
      rows: [
        baris({ invoiceId: 'inv1', jumlahBayar: 1000000, pph: 20000 }),
        baris({ invoiceId: 'inv2', selected: false }),
      ],
      account: '1112',
      keterangan: 'Setoran',
      date: '2026-08-20',
      journalId: 'jrn1',
      paymentGroupId: 'grp1',
      createdAt: '2026-08-20T03:00:00.000Z',
    })
    expect(out).toHaveLength(1)
    expect(out[0].invoiceId).toBe('inv1')
    expect(out[0].entry).toEqual({
      journalId: 'jrn1',
      paymentGroupId: 'grp1',
      date: '2026-08-20',
      jumlahBayar: 1000000,
      pph: 20000,
      netDiterima: 980000,
      account: '1112',
      keterangan: 'Setoran',
      createdAt: '2026-08-20T03:00:00.000Z',
    })
  })

  it('total jumlahBayar entri sama dengan totalGross ringkasan', () => {
    const rows = [
      baris({ invoiceId: 'inv1', jumlahBayar: 300000 }),
      baris({ invoiceId: 'inv2', jumlahBayar: 700000 }),
    ]
    const out = buildPaymentEntries({
      rows, account: '1112', keterangan: 'x', date: '2026-08-20',
      journalId: 'j', paymentGroupId: 'g', createdAt: 'now',
    })
    const total = out.reduce((s, o) => s + o.entry.jumlahBayar, 0)
    expect(total).toBe(summarizeAllocations(rows).totalGross)
  })
})

describe('buildPaymentJournalLines guards', () => {
  it('melempar error ketika tidak ada baris tercentang', () => {
    expect(() => buildPaymentJournalLines({
      rows: [baris({ selected: false })], account: '1112', keterangan: 'x',
    })).toThrow()
  })
})

describe('buildPaymentEntries guards', () => {
  it('melempar error ketika tidak ada baris tercentang', () => {
    expect(() => buildPaymentEntries({
      rows: [baris({ selected: false })], account: '1112', keterangan: 'x',
      date: '2026-08-20', journalId: 'j', paymentGroupId: 'g', createdAt: 'now',
    })).toThrow()
  })
})
