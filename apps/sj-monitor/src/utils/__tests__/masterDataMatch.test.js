import { describe, it, expect } from 'vitest';
import { normalizeForMatch, findMasterIdByField } from '../masterDataMatch.js';

describe('normalizeForMatch', () => {
  it('trim, lowercase, dan collapse whitespace', () => {
    expect(normalizeForMatch('  B  1234   ABC ')).toBe('b 1234 abc');
  });

  it('menangani null/undefined sebagai string kosong', () => {
    expect(normalizeForMatch(null)).toBe('');
    expect(normalizeForMatch(undefined)).toBe('');
  });
});

describe('findMasterIdByField', () => {
  const trucks = [
    { id: 'T1', nomorPolisi: 'B 1234 ABC' },
    { id: 'T2', nomorPolisi: 'D 5678 XYZ' },
  ];

  it('menemukan match case-insensitive dan toleran spasi', () => {
    expect(findMasterIdByField(trucks, 'nomorPolisi', '  b 1234  abc')).toBe('T1');
  });

  it('mengembalikan null jika tidak ada yang cocok', () => {
    expect(findMasterIdByField(trucks, 'nomorPolisi', 'B 9999 ZZZ')).toBeNull();
  });

  it('mengembalikan null untuk nilai kosong', () => {
    expect(findMasterIdByField(trucks, 'nomorPolisi', '')).toBeNull();
    expect(findMasterIdByField(trucks, 'nomorPolisi', null)).toBeNull();
  });

  it('mengembalikan null untuk list kosong/undefined', () => {
    expect(findMasterIdByField([], 'nomorPolisi', 'B 1234 ABC')).toBeNull();
    expect(findMasterIdByField(undefined, 'nomorPolisi', 'B 1234 ABC')).toBeNull();
  });
});
