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
