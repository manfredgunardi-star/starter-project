import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resetDb } from '../reset-db.mjs';
import { sebagai, sql, unik, buatPengguna, tutup } from './helpers.mjs';

let owner;
let ruteKembar;
beforeAll(async () => {
  await resetDb();
  owner = await buatPengguna('owner');
  ruteKembar = unik('RUTE-GALAT-');
  for (const asal of ['Bogor', 'Bekasi']) {
    await sebagai(owner,
      'select public.simpan_rute(p_id => null, p_nama => $1, p_asal => $2, p_tujuan => $3)',
      [ruteKembar, asal, 'Jakarta']);
  }
});
afterAll(tutup);

describe('pesan galat impor', () => {
  it('impor_surat_jalan menyebut berkas, baris sumber, dan nomor SJ', async () => {
    const baris = {
      lini: 'SJP', nomor: 'SJ-002', tanggal: '2026-03-01', pelanggan: 'PT HANTU',
      rute: 'R1', material: 'Pasir', nopol: 'B 1 AA', supir: 'Budi',
      qty_muat: '10', uang_jalan: '400000', __baris: 4,
    };
    await expect(sebagai(owner, 'select public.impor_surat_jalan($1::jsonb)', [JSON.stringify([baris])]))
      .rejects.toMatchObject({ code: 'P0001',
        message: 'surat-jalan.csv baris 4 (SJ-002): pelanggan "PT HANTU" tidak ditemukan atau tidak aktif' });
    delete baris.__baris;
    await expect(sebagai(owner, 'select public.impor_surat_jalan($1::jsonb)', [JSON.stringify([baris])]))
      .rejects.toMatchObject({ code: 'P0001',
        message: 'surat-jalan.csv baris 1 (SJ-002): pelanggan "PT HANTU" tidak ditemukan atau tidak aktif' });
    await expect(sql(`select internal.wajib_ketemu(null, 'supir', 'Sukirman', 4, 'surat-jalan.csv', 'SJ-002')`))
      .rejects.toMatchObject({ code: 'P0001',
        message: 'surat-jalan.csv baris 4 (SJ-002): supir "Sukirman" tidak ditemukan atau tidak aktif' });
    await expect(sql(`select internal.cari_rute('RUTE HANTU', null, null, 4, 'surat-jalan.csv', 'SJ-002')`))
      .rejects.toMatchObject({ code: 'P0001',
        message: 'surat-jalan.csv baris 4 (SJ-002): rute "RUTE HANTU" tidak ditemukan atau tidak aktif' });
    await expect(sql(`select internal.cari_rute($1, null, null, 4, 'surat-jalan.csv', 'SJ-002')`, [ruteKembar]))
      .rejects.toMatchObject({ code: 'P0001',
        message: `surat-jalan.csv baris 4 (SJ-002): rute "${ruteKembar}" ada lebih dari satu; isi juga rute_asal dan rute_tujuan` });
    const [r] = await sql(`select internal.cari_rute($1, 'Bekasi', 'Jakarta', 4, 'surat-jalan.csv', 'SJ-002') as id`, [ruteKembar]);
    expect(await sql('select asal, tujuan from public.rute where id = $1', [r.id]))
      .toEqual([{ asal: 'Bekasi', tujuan: 'Jakarta' }]);
  });

  it('pemanggil tanpa parameter baru mendapat bunyi yang persis sama seperti sebelumnya', async () => {
    // impor_master dan impor_kas tidak diubah migrasi ini. Bunyi bawaan harus persis tetap.
    await expect(sql(`select internal.wajib_ketemu(null, 'supir', 'X', 3)`))
      .rejects.toMatchObject({ code: 'P0001', message: 'Baris 3: supir "X" tidak ditemukan atau tidak aktif' });
    await expect(sql(`select internal.wajib_ketemu(null, 'supir', null, 3)`))
      .rejects.toMatchObject({ code: 'P0001', message: 'Baris 3: supir "" tidak ditemukan atau tidak aktif' });
    await expect(sql(`select internal.cari_rute('RUTE HANTU', null, null, 3)`))
      .rejects.toMatchObject({ code: 'P0001', message: 'Baris 3: rute "RUTE HANTU" tidak ditemukan atau tidak aktif' });
    await expect(sql(`select internal.cari_rute($1, null, null, 3)`, [ruteKembar]))
      .rejects.toMatchObject({ code: 'P0001',
        message: `Baris 3: rute "${ruteKembar}" ada lebih dari satu; isi juga rute_asal dan rute_tujuan` });
    expect(await sql(`select internal.wajib_ketemu('00000000-0000-0000-0000-000000000009', 'supir', 'X', 3) as id`))
      .toEqual([{ id: '00000000-0000-0000-0000-000000000009' }]);
  });
});
