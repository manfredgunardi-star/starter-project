import { describe, it, expect } from 'vitest';
import dayjs from 'dayjs';
import { argsBuatSj, argsUbahSj, argsSelesai } from './argsSj.js';

const nilai = {
  lini_kode: 'SJP', nomor: ' 0123 ', tanggal: dayjs('2026-02-02'), pelanggan_id: 'p', rute_id: 'r', material_id: 'm',
  truk_id: 't', supir_id: 's', qty_muat: '10.5', uang_jalan: undefined, keterangan: undefined,
};

describe('argsSj', () => {
  it('buat: uang jalan kosong dikirim null agar diambil dari master', () => {
    expect(argsBuatSj(nilai)).toEqual({
      p_lini_kode: 'SJP', p_nomor: '0123', p_tanggal: '2026-02-02', p_pelanggan_id: 'p', p_rute_id: 'r',
      p_material_id: 'm', p_truk_id: 't', p_supir_id: 's', p_qty_muat: '10.5', p_uang_jalan: null, p_keterangan: '',
    });
  });
  it('ubah: uang jalan wajib', () => {
    expect(argsUbahSj('id1', { ...nilai, uang_jalan: '400000' })).toMatchObject({ p_id: 'id1', p_uang_jalan: '400000', p_nomor: '0123' });
    expect(() => argsUbahSj('id1', nilai)).toThrow(/uang jalan/i);
  });
  it('selesai: upah kosong = null (pakai aturan)', () => {
    expect(argsSelesai('id1', { qty_bongkar: '9.5', tanggal_selesai: dayjs('2026-02-03'), upah: '' }))
      .toEqual({ p_id: 'id1', p_qty_bongkar: '9.5', p_tanggal_selesai: '2026-02-03', p_upah: null });
  });
});
