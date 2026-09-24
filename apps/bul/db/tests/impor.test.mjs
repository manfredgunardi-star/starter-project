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
describe('impor_master', () => {
  const imporMaster = (uid, data) =>
    sebagai(uid, 'select public.impor_master($1::jsonb) as hasil', [JSON.stringify(data)]);

  it('membuat master baru dan mengembalikan jumlah per jenis', async () => {
    const rute = unik('RUTE-');
    const mat = unik('MAT-');
    const plg = unik('PLG-');
    const [r] = await imporMaster(owner, {
      rute: [{ nama: rute, asal: 'Bogor', tujuan: 'Jakarta' }],
      material: [{ lini: 'SJP', nama: mat, satuan: 'm3', standar_bongkar: '20' }],
      pelanggan: [{ nama: plg, alamat: 'Jl. Uji', pemotong_pph: true }],
      uang_jalan: [{ rute, rute_asal: 'Bogor', rute_tujuan: 'Jakarta', berlaku_mulai: '2026-01-01', nominal: '400000' }],
      tarif: [{ pelanggan: plg, rute, rute_asal: 'Bogor', rute_tujuan: 'Jakarta', lini: 'SJP', material: mat, berlaku_mulai: '2026-01-01', harga_satuan: '63000' }],
    });
    expect(r.hasil).toMatchObject({ rute: 1, material: 1, pelanggan: 1, uang_jalan: 1, tarif: 1 });

    const [m] = await sql('select standar_bongkar from public.material where lini_kode = $1 and nama = $2', ['SJP', mat]);
    expect(m.standar_bongkar).toBe('20.000');
    const [t] = await sql(
      `select t.harga_satuan from public.tarif t
         join public.pelanggan p on p.id = t.pelanggan_id where p.nama = $1`, [plg]);
    expect(t.harga_satuan).toBe('63000.00');
  });

  it('impor yang sama diulang memperbarui, bukan menggandakan', async () => {
    const plg = unik('PLG-');
    await imporMaster(owner, { pelanggan: [{ nama: plg, alamat: 'Alamat lama', pemotong_pph: true }] });
    await imporMaster(owner, { pelanggan: [{ nama: plg, alamat: 'Alamat baru', pemotong_pph: false }] });
    const rows = await sql('select alamat, pemotong_pph from public.pelanggan where nama = $1', [plg]);
    expect(rows).toEqual([{ alamat: 'Alamat baru', pemotong_pph: false }]);
  });

  it('rute dikenali lewat (nama, asal, tujuan), bukan nama saja', async () => {
    const nama = unik('RUTE-');
    await imporMaster(owner, {
      rute: [
        { nama, asal: 'Bogor', tujuan: 'Jakarta' },
        { nama, asal: 'Bekasi', tujuan: 'Jakarta' },
      ],
    });
    const rows = await sql('select asal from public.rute where nama = $1 order by asal', [nama]);
    expect(rows).toEqual([{ asal: 'Bekasi' }, { asal: 'Bogor' }]);
  });

  it('nama yang tidak ditemukan ditolak dengan nomor baris, dan seluruh kiriman batal', async () => {
    // Rute dan material SENGAJA dibuat sah di kiriman yang sama supaya satu-satunya
    // yang bisa gagal adalah pelanggan. Kalau ketiganya hantu, `cari_rute` yang
    // meledak lebih dulu (ia statement tersendiri sebelum `simpan_tarif` dipanggil),
    // sehingga jalur `wajib_ketemu` untuk pelanggan tidak pernah teruji.
    const rute = unik('RUTE-');
    const mat = unik('MAT-');
    await expect(imporMaster(owner, {
      rute: [{ nama: rute, asal: 'Bogor', tujuan: 'Jakarta' }],
      material: [{ lini: 'SJP', nama: mat, satuan: 'm3', standar_bongkar: '20' }],
      tarif: [
        { pelanggan: unik('HANTU-'), rute, rute_asal: 'Bogor', rute_tujuan: 'Jakarta',
          lini: 'SJP', material: mat, berlaku_mulai: '2026-01-01', harga_satuan: '1000' },
      ],
    })).rejects.toThrow(/Baris 1: pelanggan "HANTU-[^"]*" tidak ditemukan/);

    // Atomisitas: rute dan material yang dibuat di panggilan yang gagal tidak boleh tersisa.
    expect(await sql('select 1 from public.rute where nama = $1', [rute])).toEqual([]);
    expect(await sql('select 1 from public.material where nama = $1', [mat])).toEqual([]);
  });
});
