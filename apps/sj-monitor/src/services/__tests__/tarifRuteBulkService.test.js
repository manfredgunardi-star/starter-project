import { describe, it, expect, vi } from 'vitest';

const ensureAuthedMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('firebase/firestore', () => ({
  collection: (_db, col) => ({ __col: true, col }),
  getDocs: vi.fn().mockResolvedValue({ forEach: () => {} }),
  writeBatch: () => ({ set: vi.fn(), update: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) }),
  doc: (_db, col, id) => ({ __ref: true, col, id }),
  query: (...args) => ({ __query: true, args }),
  where: (...args) => ({ __where: true, args }),
}));
vi.mock('../../config/firebase-config', () => ({ db: {}, ensureAuthed: ensureAuthedMock }));
vi.mock('../../firestoreService.js', () => ({ sanitizeForFirestore: (x) => x }));

import { commitBulkTarifUpdate } from '../tarifRuteBulkService.js';

describe('commitBulkTarifUpdate — validasi boundary', () => {
  it('menolak tarifBaru non-angka sebelum menulis apa pun', async () => {
    const result = await commitBulkTarifUpdate({
      updates: [{ ruteId: 'R1', tarifBaru: 'abc' }],
      effectiveDate: '2026-07-01',
      username: 'tester',
    });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/Tarif baru tidak valid untuk rute R1/);
    expect(ensureAuthedMock).not.toHaveBeenCalled();
  });

  it('menolak tarifBaru negatif', async () => {
    const result = await commitBulkTarifUpdate({
      updates: [{ ruteId: 'R2', tarifBaru: -100 }],
      effectiveDate: '2026-07-01',
      username: 'tester',
    });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/R2/);
  });

  it('menolak effectiveDate tidak valid', async () => {
    const result = await commitBulkTarifUpdate({
      updates: [{ ruteId: 'R1', tarifBaru: 500000 }],
      effectiveDate: 'bukan-tanggal',
      username: 'tester',
    });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/Tanggal efektif tidak valid/);
  });

  it('menolak effectiveDate kosong', async () => {
    const result = await commitBulkTarifUpdate({
      updates: [{ ruteId: 'R1', tarifBaru: 500000 }],
      effectiveDate: '',
      username: 'tester',
    });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/Tanggal efektif tidak valid/);
  });

  it('updates kosong tetap ditolak lebih dulu', async () => {
    const result = await commitBulkTarifUpdate({ updates: [], effectiveDate: '2026-07-01', username: 'tester' });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/Tidak ada perubahan/);
  });
});
