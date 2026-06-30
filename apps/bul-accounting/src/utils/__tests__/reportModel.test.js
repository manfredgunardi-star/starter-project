import { describe, it, expect, vi } from 'vitest'
vi.mock('../../firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', async () => ({
  collection: vi.fn(), query: vi.fn(), where: vi.fn(), orderBy: vi.fn(),
  getDocs: vi.fn(async () => ({ docs: [] })), addDoc: vi.fn(), updateDoc: vi.fn(),
  doc: vi.fn(), getDoc: vi.fn(), Timestamp: {}, writeBatch: vi.fn(), limit: vi.fn(), setDoc: vi.fn(),
}))
import { buildNeraca, buildLabaRugi, buildArusKas } from '../reportModel'

// '1111' = Kas Kecil (detail, normalBalance: debit) ✓
// '3110' = Modal Disetor (detail, normalBalance: credit) ✓  [3100 is a header, not detail]
const journals = [
  { id: 'j1', date: '2026-06-10', status: 'posted', truckId: '',
    lines: [ { accountCode: '1111', debit: 10000, credit: 0 }, { accountCode: '3110', debit: 0, credit: 10000 } ] },
]
const dataset = { journals, trucks: [], startDate: '2026-06-01', endDate: '2026-06-30' }

describe('statement builders', () => {
  it('buildNeraca returns a ReportModel with TOTAL ASET total row', async () => {
    const m = await buildNeraca(dataset)
    expect(m.id).toBe('neraca')
    expect(m.columns).toHaveLength(2)
    const totalRow = m.rows.find(r => r.type === 'total' && /TOTAL ASET/.test(r.cells.label))
    expect(totalRow.cells.amount).toBe(10000)
  })
  it('buildLabaRugi includes LABA BERSIH', async () => {
    const m = await buildLabaRugi(dataset)
    expect(m.rows.some(r => /LABA BERSIH/.test(r.cells.label))).toBe(true)
  })
  it('buildArusKas includes SALDO KAS AKHIR', async () => {
    const m = await buildArusKas(dataset)
    expect(m.rows.some(r => /SALDO KAS AKHIR/.test(r.cells.label))).toBe(true)
  })
})
