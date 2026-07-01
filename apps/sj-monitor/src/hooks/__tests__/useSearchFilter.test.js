// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useSearchFilter } from '../useSearchFilter.js';

const items = [
  { id: 1, nomorSJ: 'SJ-001', rute: 'Jakarta-Bandung' },
  { id: 2, nomorSJ: 'SJ-002', rute: 'Jakarta-Surabaya' },
  { id: 3, nomorSJ: 'SJ-003', rute: 'Bandung-Semarang' },
];

describe('useSearchFilter', () => {
  it('mengembalikan semua item saat searchTerm kosong', () => {
    const { result } = renderHook(() => useSearchFilter(items, '', ['nomorSJ', 'rute']));
    expect(result.current).toHaveLength(3);
  });

  it('mencocokkan field yang diberikan, case-insensitive', () => {
    const { result } = renderHook(() => useSearchFilter(items, 'bandung', ['nomorSJ', 'rute']));
    expect(result.current.map((i) => i.id)).toEqual([1, 3]);
  });

  it('mencocokkan nomorSJ secara terpisah dari rute', () => {
    const { result } = renderHook(() => useSearchFilter(items, 'sj-002', ['nomorSJ', 'rute']));
    expect(result.current.map((i) => i.id)).toEqual([2]);
  });

  it('aman saat list null/undefined', () => {
    const { result } = renderHook(() => useSearchFilter(null, 'apa saja', ['nomorSJ']));
    expect(result.current).toEqual([]);
  });

  it('aman saat field yang dicari tidak ada di item', () => {
    const { result } = renderHook(() => useSearchFilter(items, 'test', ['fieldTidakAda']));
    expect(result.current).toEqual([]);
  });
});
