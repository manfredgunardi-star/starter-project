import { describe, it, expect } from 'vitest';
import { hitungRingkasan } from './ringkasan.js';

describe('hitungRingkasan', () => {
  it('menjumlahkan tanpa float', () => {
    expect(hitungRingkasan([
      { jumlah: '630000.00', uang_jalan: '400000.00' },
      { jumlah: '787500.00', uang_jalan: '450000.00' },
      { jumlah: '0.10', uang_jalan: '0.20' },
    ])).toEqual({ subtotal: '1417500.10', totalUangJalan: '850000.20', totalAkhir: '567499.90' });
  });
  it('baris bermasalah (jumlah null) diabaikan', () => {
    expect(hitungRingkasan([{ jumlah: null, uang_jalan: '1' }])).toEqual({ subtotal: '0.00', totalUangJalan: '0.00', totalAkhir: '0.00' });
  });
});
