import { describe, it, expect } from 'vitest';
import { terbilang } from './terbilang.js';

describe('terbilang', () => {
  it.each([
    ['0', 'nol rupiah'],
    ['1', 'satu rupiah'],
    ['11', 'sebelas rupiah'],
    ['100', 'seratus rupiah'],
    ['1000', 'seribu rupiah'],
    ['567500', 'lima ratus enam puluh tujuh ribu lima ratus rupiah'],
    ['1417500', 'satu juta empat ratus tujuh belas ribu lima ratus rupiah'],
    ['2000000000', 'dua miliar rupiah'],
  ])('%s', (v, hasil) => expect(terbilang(v)).toBe(hasil));
});
