import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resetDb } from '../reset-db.mjs';
import { sql, buatPengguna, sebagai, unik, tutup } from './helpers.mjs';
import { siapkanMaster, buatSj, buatSjSelesai } from './fixtures.mjs';

let owner, ops, keu, m;

beforeAll(async () => {
  await resetDb();
  owner = await buatPengguna('owner');
  ops = await buatPengguna('operasional');
  keu = await buatPengguna('keuangan');
  m = await siapkanMaster(owner);
});
afterAll(tutup);

const ambilSj = async (id) => (await sql('select * from public.surat_jalan where id = $1', [id]))[0];

describe('buat SJ', () => {
  it('mengambil uang jalan dari master menurut tanggal SJ', async () => {
    const id = await buatSj(ops, m);
    const sj = await ambilSj(id);
    expect(sj).toMatchObject({ status: 'berangkat', uang_jalan: '400000.00', qty_muat: '10.000', lini_kode: 'SJP' });
  });
  it('uang jalan boleh diisi manual', async () => {
    const id = await buatSj(ops, m, { uangJalan: '375000' });
    expect((await ambilSj(id)).uang_jalan).toBe('375000.00');
  });
  it('menolak uang jalan yang belum diatur untuk tanggal itu', async () => {
    await expect(buatSj(ops, m, { tanggal: '2025-12-15' })).rejects.toMatchObject({ code: 'P0001' });
  });
  it('material harus milik lini SJ', async () => {
    await expect(buatSj(ops, { ...m, lini: 'SJT' })).rejects.toMatchObject({ code: 'P0001' });
  });
  it('nomor unik per lini di antara SJ yang tidak batal', async () => {
    const nomor = unik('SJ');
    await buatSj(ops, m, { nomor });
    await expect(buatSj(ops, m, { nomor })).rejects.toMatchObject({ code: '23505' });
  });
  it('keuangan tidak boleh membuat SJ', async () => {
    await expect(buatSj(keu, m)).rejects.toMatchObject({ code: '42501' });
  });
  it('ubah_sj hanya untuk status berangkat', async () => {
    const id = await buatSj(ops, m);
    await sebagai(ops,
      `select public.ubah_sj(p_id => $1, p_nomor => $2, p_tanggal => $3, p_pelanggan_id => $4, p_rute_id => $5, p_material_id => $6,
        p_truk_id => $7, p_supir_id => $8, p_qty_muat => $9, p_uang_jalan => $10)`,
      [id, 'SJ-UBAH-1', '2026-02-03', m.pelanggan, m.rute, m.material, m.truk, m.supir, '11', '410000']);
    expect(await ambilSj(id)).toMatchObject({ nomor: 'SJ-UBAH-1', qty_muat: '11.000', uang_jalan: '410000.00' });
    await sebagai(ops, "select public.selesaikan_sj($1, '11', '2026-02-03')", [id]);
    await expect(sebagai(ops,
      `select public.ubah_sj(p_id => $1, p_nomor => $2, p_tanggal => $3, p_pelanggan_id => $4, p_rute_id => $5, p_material_id => $6,
        p_truk_id => $7, p_supir_id => $8, p_qty_muat => $9, p_uang_jalan => $10)`,
      [id, 'SJ-UBAH-1', '2026-02-03', m.pelanggan, m.rute, m.material, m.truk, m.supir, '12', '410000'])).rejects.toMatchObject({ code: 'P0001' });
  });
});

describe('selesaikan SJ', () => {
  it('memposting upah dari aturan: Dr 5130 / Cr 2121 dengan dimensi', async () => {
    const id = await buatSjSelesai(ops, m, { qty: '10', qtyBongkar: '9.5', tanggalSelesai: '2026-02-03' });
    const sj = await ambilSj(id);
    expect(sj).toMatchObject({ status: 'selesai', qty_bongkar: '9.500', upah: '150000.00', tanggal_selesai: '2026-02-03' });
    const baris = await sql(
      'select akun_kode, debit, kredit, supir_id, truk_id, pelanggan_id, rute_id, lini_kode from public.jurnal_baris where jurnal_id = $1 order by urutan',
      [sj.jurnal_upah_id]);
    expect(baris).toEqual([
      { akun_kode: '5130', debit: '150000.00', kredit: '0.00', supir_id: m.supir, truk_id: m.truk, pelanggan_id: m.pelanggan, rute_id: m.rute, lini_kode: 'SJP' },
      { akun_kode: '2121', debit: '0.00', kredit: '150000.00', supir_id: m.supir, truk_id: m.truk, pelanggan_id: m.pelanggan, rute_id: m.rute, lini_kode: 'SJP' },
    ]);
    const [j] = await sql('select tanggal, sumber_tipe, sumber_id from public.jurnal where id = $1', [sj.jurnal_upah_id]);
    expect(j).toEqual({ tanggal: '2026-02-03', sumber_tipe: 'sj_selesai', sumber_id: id });
  });
  it('upah manual 0 tidak membuat jurnal', async () => {
    const id = await buatSjSelesai(ops, m, { upah: '0' });
    const sj = await ambilSj(id);
    expect(sj.upah).toBe('0.00');
    expect(sj.jurnal_upah_id).toBeNull();
  });
  it('menolak bila tidak ada aturan upah dan tidak diisi manual', async () => {
    const lain = await siapkanMaster(owner);
    await sql('update public.aturan_upah set aktif = false where rute_id = $1', [lain.rute]);
    const id = await buatSj(ops, lain);
    await expect(sebagai(ops, "select public.selesaikan_sj($1, '10', '2026-02-02')", [id])).rejects.toMatchObject({ code: 'P0001' });
  });
  it('menolak selesai dua kali dan tanggal selesai sebelum tanggal SJ', async () => {
    const id = await buatSj(ops, m, { tanggal: '2026-02-05' });
    await expect(sebagai(ops, "select public.selesaikan_sj($1, '10', '2026-02-04')", [id])).rejects.toMatchObject({ code: 'P0001' });
    await sebagai(ops, "select public.selesaikan_sj($1, '10', '2026-02-05')", [id]);
    await expect(sebagai(ops, "select public.selesaikan_sj($1, '10', '2026-02-05')", [id])).rejects.toMatchObject({ code: 'P0001' });
  });
});

describe('batalkan SJ', () => {
  it('SJ selesai dibatalkan dengan jurnal pembalik', async () => {
    const id = await buatSjSelesai(ops, m, { tanggalSelesai: '2026-02-06', tanggal: '2026-02-06' });
    const sebelum = await ambilSj(id);
    await sebagai(ops, "select public.batalkan_sj($1, 'salah truk', '2026-02-07')", [id]);
    const sj = await ambilSj(id);
    expect(sj).toMatchObject({ status: 'batal', alasan_batal: 'salah truk' });
    const [j] = await sql('select dibalik_oleh_id from public.jurnal where id = $1', [sebelum.jurnal_upah_id]);
    expect(j.dibalik_oleh_id).not.toBeNull();
  });
  it('nomor yang sama boleh dipakai lagi setelah batal', async () => {
    const nomor = unik('SJ');
    const id = await buatSj(ops, m, { nomor });
    await sebagai(ops, "select public.batalkan_sj($1, 'dobel', '2026-02-02')", [id]);
    await expect(buatSj(ops, m, { nomor })).resolves.toBeTruthy();
  });
  it('alasan wajib; batal dua kali ditolak', async () => {
    const id = await buatSj(ops, m);
    await expect(sebagai(ops, "select public.batalkan_sj($1, '', '2026-02-02')", [id])).rejects.toMatchObject({ code: 'P0001' });
    await sebagai(ops, "select public.batalkan_sj($1, 'x', '2026-02-02')", [id]);
    await expect(sebagai(ops, "select public.batalkan_sj($1, 'x', '2026-02-02')", [id])).rejects.toMatchObject({ code: 'P0001' });
  });
});
