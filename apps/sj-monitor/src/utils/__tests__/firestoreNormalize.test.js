import { describe, it, expect } from 'vitest';
import { getQueryStartISO, normalizeSJ, normalizeInvoice, isLiveRow } from '../firestoreNormalize.js';

describe('getQueryStartISO', () => {
  it('mengembalikan tanggal 1, 12 bulan lalu, format YYYY-MM-01', () => {
    expect(getQueryStartISO()).toMatch(/^\d{4}-\d{2}-01$/);
    const d = new Date(getQueryStartISO());
    const monthsAgo = (new Date().getFullYear() - d.getFullYear()) * 12 + (new Date().getMonth() - d.getMonth());
    expect(monthsAgo).toBe(12);
  });
});

describe('normalizeSJ', () => {
  it('fallback id ke docId dan tanggalSJ dari field legacy', () => {
    expect(normalizeSJ({ tglSJ: '2026-01-02' }, 'DOC1')).toMatchObject({ id: 'DOC1', tanggalSJ: '2026-01-02', isActive: true });
    expect(normalizeSJ({ id: 'SJ-9', tanggal: '2026-02-03', isActive: false }, 'DOC2')).toMatchObject({ id: 'SJ-9', tanggalSJ: '2026-02-03', isActive: false });
  });
});

describe('normalizeInvoice', () => {
  it('fallback tglInvoice dari field legacy', () => {
    expect(normalizeInvoice({ tanggalInvoice: '2026-03-04' }, 'D1')).toMatchObject({ id: 'D1', tglInvoice: '2026-03-04', isActive: true });
  });
});

describe('isLiveRow', () => {
  it('false untuk deletedAt atau isActive false', () => {
    expect(isLiveRow({ deletedAt: 'x' })).toBe(false);
    expect(isLiveRow({ isActive: false })).toBe(false);
    expect(isLiveRow({ isActive: true })).toBe(true);
    expect(isLiveRow({})).toBe(true);
  });
});
