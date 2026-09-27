import { describe, it, expect } from 'vitest';
import dayjs from 'dayjs';
import { KONFIG_MASTER } from './konfigurasi.js';
import { HAK } from '../../layout/menu.js';

describe('konfigurasi master', () => {
  it('setiap konfigurasi lengkap dan hak-nya dikenal', () => {
    for (const [kunci, k] of Object.entries(KONFIG_MASTER)) {
      expect(k.kunci).toBe(kunci);
      expect(HAK[k.hak]).toBeDefined();
      expect(typeof k.keArgs).toBe('function');
      expect(k.rpc).toMatch(/^simpan_/);
    }
  });
  it('truk: baris baru mengirim p_id null', () => {
    expect(KONFIG_MASTER.truk.keArgs({ nopol: 'b 1 x', jenis: 'Dump', aktif: true }, null))
      .toEqual({ p_id: null, p_nopol: 'b 1 x', p_jenis: 'Dump', p_aktif: true });
  });
  it('tarif: tanggal dan harga dikirim sebagai string', () => {
    expect(KONFIG_MASTER.tarif.keArgs({
      pelanggan_id: 'p', rute_id: 'r', material_id: 'm', berlaku_mulai: dayjs('2026-03-01'), harga_satuan: '65000',
    }, null)).toEqual({
      p_pelanggan_id: 'p', p_rute_id: 'r', p_material_id: 'm', p_berlaku_mulai: '2026-03-01', p_harga_satuan: '65000',
    });
  });
  it('aturan upah: rute/material kosong jadi null', () => {
    const a = KONFIG_MASTER['aturan-upah'].keArgs({
      nama: 'Default', rute_id: undefined, material_id: undefined, berlaku_mulai: dayjs('2026-01-01'), basis: 'per_sj', nominal: '150000', aktif: true,
    }, { id: 'x' });
    expect(a).toEqual({ p_id: 'x', p_nama: 'Default', p_rute_id: null, p_material_id: null, p_berlaku_mulai: '2026-01-01', p_basis: 'per_sj', p_nominal: '150000', p_aktif: true });
  });
  it('pengurus: baris baru mengirim p_id null', () => {
    expect(KONFIG_MASTER.pengurus.keArgs({ nama: 'Budi', telepon: '0811', aktif: true }, null))
      .toEqual({ p_id: null, p_nama: 'Budi', p_telepon: '0811', p_aktif: true });
  });
  it('rute: tipe_rute_id kosong jadi null', () => {
    expect(KONFIG_MASTER.rute.keArgs({ nama: 'X', asal: 'A', tujuan: 'B', tipe_rute_id: undefined, aktif: true }, null))
      .toEqual({ p_id: null, p_nama: 'X', p_asal: 'A', p_tujuan: 'B', p_aktif: true, p_tipe_rute_id: null });
  });
  it('aturan bonus: ambang dikirim apa adanya untuk jenis rit', () => {
    expect(KONFIG_MASTER['aturan-bonus'].keArgs({
      nama: 'Rit harian', jenis: 'rit_harian_supir', ambang: '3', nominal: '30000',
      berlaku_mulai: dayjs('2026-09-01'), aktif: true,
    }, null)).toEqual({
      p_id: null, p_nama: 'Rit harian', p_jenis: 'rit_harian_supir', p_ambang: '3',
      p_nominal: '30000', p_berlaku_mulai: '2026-09-01', p_aktif: true,
    });
  });
  it('aturan bonus: jenis tonase selalu mengirim ambang null', () => {
    expect(KONFIG_MASTER['aturan-bonus'].keArgs({
      nama: 'Tonase', jenis: 'tonase_supir', ambang: '5', nominal: '15000',
      berlaku_mulai: dayjs('2026-09-01'), aktif: true,
    }, null).p_ambang).toBe(null);
  });
  it('material: standar bongkar kosong jadi null', () => {
    expect(KONFIG_MASTER.material.keArgs({
      lini_kode: 'SJP', nama: 'Pasir', satuan: 'ton', standar_bongkar: undefined, aktif: true,
    }, null)).toEqual({
      p_id: null, p_lini_kode: 'SJP', p_nama: 'Pasir', p_satuan: 'ton', p_aktif: true, p_standar_bongkar: null,
    });
    expect(KONFIG_MASTER.material.keArgs({
      lini_kode: 'SJP', nama: 'Pasir', satuan: 'ton', standar_bongkar: '20', aktif: true,
    }, null).p_standar_bongkar).toBe('20');
  });

});
