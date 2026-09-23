import { describe, it, expect } from 'vitest';
import { keBarisJurnal, selisihJurnal } from './barisJurnal.js';

describe('barisJurnal', () => {
  const baris = [
    { akun_kode: '5110', debit: '100000', truk_id: 't1' },
    { akun_kode: '1111', kredit: '99999.99' },
    { akun_kode: '6150' },
  ];
  it('selisih', () => {
    expect(selisihJurnal(baris)).toEqual({ debit: '100000.00', kredit: '99999.99', selisih: '0.01' });
  });
  it('membuang baris kosong dan menormalkan null', () => {
    expect(keBarisJurnal(baris)).toEqual([
      { akun_kode: '5110', debit: '100000', kredit: '0', keterangan: '', truk_id: 't1', supir_id: null, pelanggan_id: null, lini_kode: null },
      { akun_kode: '1111', debit: '0', kredit: '99999.99', keterangan: '', truk_id: null, supir_id: null, pelanggan_id: null, lini_kode: null },
    ]);
  });
  it('menolak baris yang berisi debit dan kredit sekaligus', () => {
    expect(() => keBarisJurnal([{ akun_kode: '1', debit: '1', kredit: '1' }])).toThrow(/debit atau kredit/);
  });
});
