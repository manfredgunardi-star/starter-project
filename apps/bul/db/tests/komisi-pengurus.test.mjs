import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resetDb } from '../reset-db.mjs';
import { sql, buatPengguna, sebagai, unik, tutup } from './helpers.mjs';
import { siapkanMaster, buatSj, buatSjSelesai } from './fixtures.mjs';

let owner, ops, keu, m;

const satu = async (uid, q, p) => (await sebagai(uid, q, p))[0];

async function buatPengurus(uid, opsi = {}) {
  const { nama = unik('PENGURUS-'), aktif = true } = opsi;
  const { id } = await satu(uid, 'select public.simpan_pengurus(p_id => null, p_nama => $1, p_aktif => $2) as id', [nama, aktif]);
  return id;
}

async function tetapkanTipeRute(uid, ruteId, opsi = {}) {
  const { nominal = '25000', berlakuMulai = '2026-01-01' } = opsi;
  const { id: tipeRute } = await satu(uid, 'select public.simpan_tipe_rute(p_id => null, p_nama => $1) as id', [unik('TIPE-')]);
  const [r] = await sql('select nama, asal, tujuan from public.rute where id = $1', [ruteId]);
  await sebagai(uid,
    'select public.simpan_rute(p_id => $1, p_nama => $2, p_asal => $3, p_tujuan => $4, p_aktif => true, p_tipe_rute_id => $5)',
    [ruteId, r.nama, r.asal, r.tujuan, tipeRute]);
  await sebagai(uid,
    'select public.simpan_aturan_komisi(p_id => null, p_nama => $1, p_tipe_rute_id => $2, p_berlaku_mulai => $3, p_nominal => $4)',
    [unik('KOMISI-'), tipeRute, berlakuMulai, nominal]);
  return tipeRute;
}

const ambilSj = async (id) => (await sql('select * from public.surat_jalan where id = $1', [id]))[0];

beforeAll(async () => {
  await resetDb();
  owner = await buatPengguna('owner');
  ops = await buatPengguna('operasional');
  keu = await buatPengguna('keuangan');
  m = await siapkanMaster(owner);
});
afterAll(tutup);

describe('master: pengurus', () => {
  it('simpan membuat dan mengubah', async () => {
    const id = await buatPengurus(owner, { nama: 'Budi' });
    const [row] = await sql('select nama, telepon, aktif from public.pengurus where id = $1', [id]);
    expect(row).toEqual({ nama: 'Budi', telepon: '', aktif: true });
    await sebagai(owner, 'select public.simpan_pengurus(p_id => $1, p_nama => $2, p_telepon => $3, p_aktif => $4)', [id, 'Budi S', '0811', false]);
    const [ubah] = await sql('select nama, telepon, aktif from public.pengurus where id = $1', [id]);
    expect(ubah).toEqual({ nama: 'Budi S', telepon: '0811', aktif: false });
  });
  it('nama wajib diisi', async () => {
    await expect(sebagai(owner, "select public.simpan_pengurus(p_id => null, p_nama => '')", [])).rejects.toMatchObject({ code: 'P0001' });
  });
  it('keuangan tidak boleh menyimpan pengurus', async () => {
    await expect(sebagai(keu, "select public.simpan_pengurus(p_id => null, p_nama => 'X')", [])).rejects.toMatchObject({ code: '42501' });
  });
});

describe('master: tipe_rute', () => {
  it('simpan membuat dan mengubah', async () => {
    const nama = unik('TIPE-');
    const { id } = await satu(owner, 'select public.simpan_tipe_rute(p_id => null, p_nama => $1) as id', [nama]);
    const [row] = await sql('select nama, aktif from public.tipe_rute where id = $1', [id]);
    expect(row).toEqual({ nama, aktif: true });
  });
  it('nama unik', async () => {
    const nama = unik('TIPE-');
    await sebagai(owner, 'select public.simpan_tipe_rute(p_id => null, p_nama => $1)', [nama]);
    await expect(sebagai(owner, 'select public.simpan_tipe_rute(p_id => null, p_nama => $1)', [nama])).rejects.toMatchObject({ code: '23505' });
  });
});

describe('master: aturan_komisi', () => {
  it('simpan membuat dengan tipe_rute_id wajib', async () => {
    const { id: tipeRute } = await satu(owner, 'select public.simpan_tipe_rute(p_id => null, p_nama => $1) as id', [unik('TIPE-')]);
    const { id } = await satu(owner,
      'select public.simpan_aturan_komisi(p_id => null, p_nama => $1, p_tipe_rute_id => $2, p_berlaku_mulai => $3, p_nominal => $4) as id',
      [unik('KOMISI-'), tipeRute, '2026-01-01', '25000']);
    const [row] = await sql('select tipe_rute_id, nominal, aktif from public.aturan_komisi where id = $1', [id]);
    expect(row).toEqual({ tipe_rute_id: tipeRute, nominal: '25000.00', aktif: true });
  });
  it('menolak tipe_rute_id kosong', async () => {
    await expect(sebagai(owner,
      "select public.simpan_aturan_komisi(p_id => null, p_nama => 'X', p_tipe_rute_id => null, p_berlaku_mulai => '2026-01-01', p_nominal => '25000')",
      [])).rejects.toMatchObject({ code: 'P0001' });
  });
  it('operasional tidak boleh menyimpan aturan komisi', async () => {
    const { id: tipeRute } = await satu(owner, 'select public.simpan_tipe_rute(p_id => null, p_nama => $1) as id', [unik('TIPE-')]);
    await expect(sebagai(ops,
      'select public.simpan_aturan_komisi(p_id => null, p_nama => $1, p_tipe_rute_id => $2, p_berlaku_mulai => $3, p_nominal => $4)',
      [unik('KOMISI-'), tipeRute, '2026-01-01', '25000'])).rejects.toMatchObject({ code: '42501' });
  });
});

describe('buat_sj mengisi pengurus_id otomatis', () => {
  it('kosong kalau belum ada pengurus aktif', async () => {
    await sql('update public.pengurus set aktif = false');
    const id = await buatSj(ops, m);
    expect((await ambilSj(id)).pengurus_id).toBeNull();
  });
  it('terisi otomatis kalau tepat 1 pengurus aktif', async () => {
    await sql('update public.pengurus set aktif = false');
    const pengurus = await buatPengurus(owner);
    const id = await buatSj(ops, m);
    expect((await ambilSj(id)).pengurus_id).toBe(pengurus);
  });
  it('kosong kalau lebih dari 1 pengurus aktif', async () => {
    await sql('update public.pengurus set aktif = false');
    await buatPengurus(owner);
    await buatPengurus(owner);
    const id = await buatSj(ops, m);
    expect((await ambilSj(id)).pengurus_id).toBeNull();
  });
});

describe('selesaikan_sj memposting komisi pengurus', () => {
  it('Dr 5180 / Cr 2125 dengan pengurus_id, dalam jurnal yang sama dengan upah', async () => {
    const lain = await siapkanMaster(owner);
    await sql('update public.pengurus set aktif = false');
    const pengurus = await buatPengurus(owner);
    await tetapkanTipeRute(owner, lain.rute);
    const id = await buatSjSelesai(ops, lain, { qty: '10', qtyBongkar: '9.5', tanggalSelesai: '2026-03-03', tanggal: '2026-03-03' });
    const sj = await ambilSj(id);
    expect(sj.pengurus_id).toBe(pengurus);
    const baris = await sql(
      'select akun_kode, debit, kredit, pengurus_id from public.jurnal_baris where jurnal_id = $1 order by urutan',
      [sj.jurnal_upah_id]);
    expect(baris).toEqual([
      { akun_kode: '5130', debit: '150000.00', kredit: '0.00', pengurus_id: null },
      { akun_kode: '2121', debit: '0.00', kredit: '150000.00', pengurus_id: null },
      { akun_kode: '5180', debit: '25000.00', kredit: '0.00', pengurus_id: pengurus },
      { akun_kode: '2125', debit: '0.00', kredit: '25000.00', pengurus_id: pengurus },
    ]);
  });
  it('melewati komisi (SJ tetap selesai) kalau rute belum punya tipe_rute', async () => {
    const lain = await siapkanMaster(owner);
    const id = await buatSjSelesai(ops, lain, { tanggalSelesai: '2026-03-04', tanggal: '2026-03-04' });
    const sj = await ambilSj(id);
    expect(sj.status).toBe('selesai');
    const baris = await sql('select akun_kode from public.jurnal_baris where jurnal_id = $1', [sj.jurnal_upah_id]);
    expect(baris.map((b) => b.akun_kode).sort()).toEqual(['2121', '5130']);
  });
  it('melewati komisi (SJ tetap selesai) kalau tipe_rute belum punya aturan_komisi berlaku', async () => {
    const lain = await siapkanMaster(owner);
    const { id: tipeRute } = await satu(owner, 'select public.simpan_tipe_rute(p_id => null, p_nama => $1) as id', [unik('TIPE-')]);
    await sebagai(owner,
      'select public.simpan_rute(p_id => $1, p_nama => $2, p_asal => $3, p_tujuan => $4, p_aktif => true, p_tipe_rute_id => $5)',
      [lain.rute, unik('RUTE-'), 'A', 'B', tipeRute]);
    const id = await buatSjSelesai(ops, lain, { tanggalSelesai: '2026-03-05', tanggal: '2026-03-05' });
    const sj = await ambilSj(id);
    expect(sj.status).toBe('selesai');
    const baris = await sql('select akun_kode from public.jurnal_baris where jurnal_id = $1', [sj.jurnal_upah_id]);
    expect(baris.map((b) => b.akun_kode).sort()).toEqual(['2121', '5130']);
  });
});

describe('batalkan_sj membalik komisi', () => {
  it('jurnal pembalik membawa pengurus_id', async () => {
    const lain = await siapkanMaster(owner);
    await sql('update public.pengurus set aktif = false');
    const pengurus = await buatPengurus(owner);
    await tetapkanTipeRute(owner, lain.rute);
    const id = await buatSjSelesai(ops, lain, { tanggalSelesai: '2026-03-06', tanggal: '2026-03-06' });
    const sj = await ambilSj(id);
    await sebagai(ops, "select public.batalkan_sj($1, 'salah data', '2026-03-07')", [id]);
    const [j] = await sql('select dibalik_oleh_id from public.jurnal where id = $1', [sj.jurnal_upah_id]);
    const pembalik = await sql(
      'select akun_kode, debit, kredit, pengurus_id from public.jurnal_baris where jurnal_id = $1 order by urutan',
      [j.dibalik_oleh_id]);
    expect(pembalik).toEqual([
      { akun_kode: '5130', debit: '0.00', kredit: '150000.00', pengurus_id: null },
      { akun_kode: '2121', debit: '150000.00', kredit: '0.00', pengurus_id: null },
      { akun_kode: '5180', debit: '0.00', kredit: '25000.00', pengurus_id: pengurus },
      { akun_kode: '2125', debit: '25000.00', kredit: '0.00', pengurus_id: pengurus },
    ]);
  });
});

describe('v_hutang_komisi_pengurus', () => {
  it('menjumlah saldo hutang komisi per pengurus', async () => {
    const lain = await siapkanMaster(owner);
    await sql('update public.pengurus set aktif = false');
    const pengurus = await buatPengurus(owner, { nama: unik('PENGURUS-') });
    await tetapkanTipeRute(owner, lain.rute);
    await buatSjSelesai(ops, lain, { tanggalSelesai: '2026-03-08', tanggal: '2026-03-08' });
    const [row] = await sql('select saldo from public.v_hutang_komisi_pengurus where pengurus_id = $1', [pengurus]);
    expect(row.saldo).toBe('25000.00');
  });
});
