import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resetDb } from '../reset-db.mjs';
import { sql, buatPengguna, sebagai, unik, tutup } from './helpers.mjs';

let owner;

beforeAll(async () => {
  await resetDb();
  owner = await buatPengguna('owner');
});
afterAll(tutup);

describe('fondasi impor', () => {
  it('nama supir dan pengurus tidak boleh kembar', async () => {
    const supir = unik('SUPIR-');
    await sebagai(owner, 'select public.simpan_supir(p_id => null, p_nama => $1)', [supir]);
    await expect(sebagai(owner, 'select public.simpan_supir(p_id => null, p_nama => $1)', [supir]))
      .rejects.toMatchObject({ code: '23505' });

    const pengurus = unik('PGR-');
    await sebagai(owner, 'select public.simpan_pengurus(p_id => null, p_nama => $1)', [pengurus]);
    await expect(sebagai(owner, 'select public.simpan_pengurus(p_id => null, p_nama => $1)', [pengurus]))
      .rejects.toMatchObject({ code: '23505' });
  });

  it('wajib_ketemu menyebut nomor baris, jenis, dan nilainya', async () => {
    await expect(sql(`select internal.wajib_ketemu(null, 'supir', 'Sukirman', 214)`))
      .rejects.toThrow(/Baris 214: supir "Sukirman" tidak ditemukan/);
    const [r] = await sql(
      `select internal.wajib_ketemu('00000000-0000-0000-0000-000000000009'::uuid, 'supir', 'X', 1) as id`);
    expect(r.id).toBe('00000000-0000-0000-0000-000000000009');
  });

  it('periksa_kiriman menolak yang bukan daftar dan yang lebih dari 5000 baris', async () => {
    await expect(sql(`select internal.periksa_kiriman('{}'::jsonb, 'kas.csv')`))
      .rejects.toThrow(/kas\.csv harus berupa daftar baris/);
    await expect(sql(`select internal.periksa_kiriman(
      (select jsonb_agg(jsonb_build_object('n', g)) from generate_series(1, 5001) g), 'kas.csv')`))
      .rejects.toThrow(/maksimal 5000 baris/);
    // Daftar kosong sah: berkas boleh tidak diunggah sama sekali.
    await sql(`select internal.periksa_kiriman('[]'::jsonb, 'kas.csv')`);
  });

  it('cari_rute memakai kunci (nama, asal, tujuan) dan menolak yang ambigu', async () => {
    const nama = unik('RUTE-');
    await sebagai(owner,
      'select public.simpan_rute(p_id => null, p_nama => $1, p_asal => $2, p_tujuan => $3)',
      [nama, 'Bogor', 'Jakarta']);
    await sebagai(owner,
      'select public.simpan_rute(p_id => null, p_nama => $1, p_asal => $2, p_tujuan => $3)',
      [nama, 'Bekasi', 'Jakarta']);

    await expect(sql('select internal.cari_rute($1, null, null, 7)', [nama]))
      .rejects.toThrow(/ada lebih dari satu; isi juga rute_asal dan rute_tujuan/);

    const [r] = await sql('select internal.cari_rute($1, $2, $3, 7) as id', [nama, 'Bekasi', 'Jakarta']);
    expect(r.id).toBeTruthy();

    await expect(sql('select internal.cari_rute($1, null, null, 9)', [unik('HANTU-')]))
      .rejects.toThrow(/Baris 9: rute ".*" tidak ditemukan/);
  });
});
