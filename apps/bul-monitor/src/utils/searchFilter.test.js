import { describe, it, expect } from 'vitest';
import { normalizeTerm, matchesSearch, filterBySearch } from './searchFilter.js';

const items = [
  { id: 1, nomorSJ: '012705', rute: 'CITEUREUP (PASIR KT - PT. MORTAR PRAKASA UTAMA)', material: 'Pasir' },
  { id: 2, nomorSJ: '012706', rute: 'BALARAJA (PASIR KT - PT. BRIK)', material: 'Pasir' },
  { id: 3, nomorSJ: '02193', rute: 'Cikarang (Tanah/Clay-PT. Platinum Ceramics Industry)', material: 'Tanah/Clay' },
];

const FIELDS = ['nomorSJ', 'rute', 'material'];

describe('normalizeTerm', () => {
  it('trim dan lowercase', () => {
    expect(normalizeTerm('  CiTeUreUp  ')).toBe('citeureup');
  });

  it('mengembalikan string kosong untuk null/undefined', () => {
    expect(normalizeTerm(null)).toBe('');
    expect(normalizeTerm(undefined)).toBe('');
  });
});

describe('matchesSearch', () => {
  it('kata kunci kosong selalu cocok', () => {
    expect(matchesSearch(items[0], '', FIELDS)).toBe(true);
    expect(matchesSearch(items[0], '   ', FIELDS)).toBe(true);
  });

  it('cocok pada salah satu field (OR)', () => {
    expect(matchesSearch(items[2], 'clay', FIELDS)).toBe(true);
    expect(matchesSearch(items[2], '02193', FIELDS)).toBe(true);
  });

  it('tidak cocok jika tidak ada field yang mengandung kata kunci', () => {
    expect(matchesSearch(items[0], 'surabaya', FIELDS)).toBe(false);
  });

  it('aman saat field tidak ada di item', () => {
    expect(matchesSearch({ id: 9 }, 'apa saja', FIELDS)).toBe(false);
  });
});

describe('filterBySearch', () => {
  it('mengembalikan semua item saat kata kunci kosong', () => {
    expect(filterBySearch(items, '', FIELDS)).toHaveLength(3);
  });

  it('mengembalikan semua item saat kata kunci hanya spasi', () => {
    expect(filterBySearch(items, '   ', FIELDS)).toHaveLength(3);
  });

  it('case-insensitive', () => {
    expect(filterBySearch(items, 'citeureup', FIELDS).map((i) => i.id)).toEqual([1]);
    expect(filterBySearch(items, 'CITEUREUP', FIELDS).map((i) => i.id)).toEqual([1]);
  });

  it('cocok substring di tengah teks', () => {
    expect(filterBySearch(items, 'pasir kt', FIELDS).map((i) => i.id)).toEqual([1, 2]);
  });

  it('mencari lintas field', () => {
    expect(filterBySearch(items, 'tanah', FIELDS).map((i) => i.id)).toEqual([3]);
  });

  it('mengembalikan array kosong bila tidak ada yang cocok', () => {
    expect(filterBySearch(items, 'zzz', FIELDS)).toEqual([]);
  });

  it('aman saat list null/undefined', () => {
    expect(filterBySearch(null, 'apa saja', FIELDS)).toEqual([]);
    expect(filterBySearch(undefined, '', FIELDS)).toEqual([]);
  });
});
