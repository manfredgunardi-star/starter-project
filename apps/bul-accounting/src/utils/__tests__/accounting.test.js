import { describe, it, expect, vi } from 'vitest'

// Mock firebase so accounting.js imports do not hit the network.
vi.mock('../../firebase', () => ({ db: {} }))
// Mock getJournals at the firestore layer by mocking the module's getDocs.
vi.mock('firebase/firestore', async () => {
  return {
    collection: vi.fn(), query: vi.fn(), where: vi.fn(), orderBy: vi.fn(),
    getDocs: vi.fn(async () => ({ docs: globalThis.__SEED__.map(j => ({ id: j.id, data: () => j })) })),
    addDoc: vi.fn(), updateDoc: vi.fn(), doc: vi.fn(), getDoc: vi.fn(),
    Timestamp: {}, writeBatch: vi.fn(), limit: vi.fn(), setDoc: vi.fn(),
    runTransaction: vi.fn(),
  }
})

import { generateNeracaData } from '../accounting'

// Minimal balanced seed: cash 10,000 debit; modal 10,000 credit.
// '1111' = Kas Kecil (detail, normalBalance: debit) ✓
// '3110' = Modal Disetor (detail, normalBalance: credit) ✓  [3100 is a header, not detail]
globalThis.__SEED__ = [
  {
    id: 'j1', date: '2026-06-10', status: 'posted', truckId: '',
    lines: [
      { accountCode: '1111', debit: 10000, credit: 0 },
      { accountCode: '3110', debit: 0, credit: 10000 },
    ],
  },
]

describe('generateNeracaData (characterization)', () => {
  it('balances: total aset == total kewajiban + ekuitas', async () => {
    const d = await generateNeracaData('2026-06-30')
    expect(d.totalAset).toBe(10000)
    expect(d.totalAset).toBe(d.totalKewajiban + d.totalEkuitas)
  })
})

import { generateLabaRugiData, generateArusKasData, getAccountBalances } from '../accounting'

// '4100' = Pendapatan Usaha (detail, normalBalance: credit) ✓
// '6110' = Gaji Staf Kantor (detail, normalBalance: debit) ✓  [6100 is a header, not detail]
globalThis.__SEED2__ = [
  // Pendapatan usaha 5,000 (kredit 4xxx) against cash debit
  { id: 'p1', date: '2026-06-05', status: 'posted', truckId: '',
    lines: [ { accountCode: '1111', debit: 5000, credit: 0 }, { accountCode: '4100', debit: 0, credit: 5000 } ] },
  // Beban operasional 2,000 (debit 6xxx) paid cash
  { id: 'b1', date: '2026-06-06', status: 'posted', truckId: '',
    lines: [ { accountCode: '6110', debit: 2000, credit: 0 }, { accountCode: '1111', debit: 0, credit: 2000 } ] },
]

describe('generateLabaRugiData (characterization)', () => {
  it('computes laba bersih = pendapatan - beban', async () => {
    globalThis.__SEED__ = globalThis.__SEED2__
    const d = await generateLabaRugiData('2026-06-01', '2026-06-30')
    expect(d.totalPendapatanUsaha).toBe(5000)
    expect(d.totalBebanOperasional).toBe(2000)
    expect(d.labaBersih).toBe(3000)
  })
})

describe('generateArusKasData (characterization)', () => {
  it('saldoAwal + totalPerubahan == saldoAkhir', async () => {
    globalThis.__SEED__ = globalThis.__SEED2__
    const d = await generateArusKasData('2026-06-01', '2026-06-30')
    expect(d.saldoAwal + d.totalPerubahanKas).toBe(d.saldoAkhir)
  })
})

import { filterJournalsByDate } from '../accounting'

describe('injected journals equivalence', () => {
  it('getAccountBalances(...,journals) equals fetched version', async () => {
    globalThis.__SEED__ = globalThis.__SEED2__
    const fetched = await getAccountBalances('2026-06-30')
    const all = globalThis.__SEED2__
    const injected = await getAccountBalances('2026-06-30', null, 'all', all)
    expect(injected).toEqual(fetched)
  })
})
