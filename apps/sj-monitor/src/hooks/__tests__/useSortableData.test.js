// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useSortableData } from '../useSortableData.js';

const items = [
  { id: 1, nomorSJ: 'SJ-003', qty: 5 },
  { id: 2, nomorSJ: 'SJ-001', qty: 20 },
  { id: 3, nomorSJ: 'SJ-002', qty: 10 },
];

describe('useSortableData', () => {
  it('mengembalikan list apa adanya saat belum ada sortConfig', () => {
    const { result } = renderHook(() => useSortableData(items));
    expect(result.current.sorted.map((i) => i.id)).toEqual([1, 2, 3]);
    expect(result.current.sortConfig).toBeNull();
  });

  it('mengurutkan ascending berdasarkan field string setelah toggleSort', () => {
    const { result } = renderHook(() => useSortableData(items));
    act(() => result.current.toggleSort('nomorSJ'));
    expect(result.current.sorted.map((i) => i.nomorSJ)).toEqual(['SJ-001', 'SJ-002', 'SJ-003']);
    expect(result.current.sortConfig).toEqual({ field: 'nomorSJ', direction: 'asc' });
  });

  it('toggle ke descending saat kolom yang sama diklik lagi', () => {
    const { result } = renderHook(() => useSortableData(items));
    act(() => result.current.toggleSort('nomorSJ'));
    act(() => result.current.toggleSort('nomorSJ'));
    expect(result.current.sorted.map((i) => i.nomorSJ)).toEqual(['SJ-003', 'SJ-002', 'SJ-001']);
    expect(result.current.sortConfig).toEqual({ field: 'nomorSJ', direction: 'desc' });
  });

  it('reset ke asc saat kolom berbeda diklik', () => {
    const { result } = renderHook(() => useSortableData(items));
    act(() => result.current.toggleSort('nomorSJ'));
    act(() => result.current.toggleSort('nomorSJ'));
    act(() => result.current.toggleSort('qty'));
    expect(result.current.sortConfig).toEqual({ field: 'qty', direction: 'asc' });
    expect(result.current.sorted.map((i) => i.qty)).toEqual([5, 10, 20]);
  });

  it('mengurutkan angka secara numerik, bukan leksikografis', () => {
    const numericItems = [{ id: 1, qty: 9 }, { id: 2, qty: 10 }, { id: 3, qty: 2 }];
    const { result } = renderHook(() => useSortableData(numericItems));
    act(() => result.current.toggleSort('qty'));
    expect(result.current.sorted.map((i) => i.qty)).toEqual([2, 9, 10]);
  });
});
