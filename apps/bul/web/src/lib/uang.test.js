import { describe, it, expect } from 'vitest';
import { keSen, dariSen, kaliQtyHarga, jumlahkan } from './uang.js';

describe('uang', () => {
  it('keSen menerima string dan angka bulat', () => {
    expect(keSen('1234.5')).toBe(123450n);
    expect(keSen('1.234,50'.replace(/\./g, '').replace(',', '.'))).toBe(123450n);
    expect(keSen(63000)).toBe(6300000n);
    expect(keSen('')).toBe(0n);
    expect(keSen(null)).toBe(0n);
    expect(keSen('-10.05')).toBe(-1005n);
  });
  it('keSen menolak lebih dari 2 desimal dan teks', () => {
    expect(() => keSen('1.005')).toThrow(/2 desimal/);
    expect(() => keSen('abc')).toThrow(/tidak valid/);
  });
  it('dariSen', () => {
    expect(dariSen(123450n)).toBe('1234.50');
    expect(dariSen(5n)).toBe('0.05');
    expect(dariSen(-1005n)).toBe('-10.05');
  });
  it('kaliQtyHarga membulatkan setengah ke atas seperti Postgres round()', () => {
    expect(kaliQtyHarga('12.5', '63000')).toBe(78750000n);
    expect(kaliQtyHarga('1.333', '0.10')).toBe(13n);      // 0.1333 → 0.13
    expect(kaliQtyHarga('1.005', '1')).toBe(101n);        // 1.005 → 1.01
  });
  it('jumlahkan', () => {
    expect(jumlahkan(['1.10', 220n, '0.05'])).toBe(335n);
  });
});
