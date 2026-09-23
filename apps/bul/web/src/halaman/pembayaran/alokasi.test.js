import { describe, it, expect } from 'vitest';
import { alokasiOtomatis, cekAlokasi } from './alokasi.js';

const inv = [{ id: 'a', sisa: '230000.00' }, { id: 'b', sisa: '567500.00' }];

describe('alokasi', () => {
  it('mengisi invoice tertua lebih dulu', () => {
    expect(alokasiOtomatis(inv, '500000')).toEqual([
      { invoice_id: 'a', jumlah: '230000.00' },
      { invoice_id: 'b', jumlah: '270000.00' },
    ]);
  });
  it('tidak melebihi sisa', () => {
    expect(alokasiOtomatis(inv, '9999999')).toEqual([
      { invoice_id: 'a', jumlah: '230000.00' },
      { invoice_id: 'b', jumlah: '567500.00' },
    ]);
  });
  it('nol → kosong', () => {
    expect(alokasiOtomatis(inv, '0')).toEqual([]);
  });
  it('cekAlokasi', () => {
    const al = [{ invoice_id: 'a', jumlah: '230000' }];
    expect(cekAlokasi(al, '228850', '1150')).toBeNull();
    expect(cekAlokasi(al, '228850', '0')).toMatch(/harus sama/);
    expect(cekAlokasi([], '1', '0')).toMatch(/minimal satu/);
    expect(cekAlokasi([{ invoice_id: 'a', jumlah: '0' }], '0', '0')).toMatch(/lebih dari 0/);
  });
});
