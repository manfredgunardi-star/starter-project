import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resetDb } from '../reset-db.mjs';
import { sql, buatPengguna, sebagai, unik, tutup } from './helpers.mjs';

let owner, ops, keu, viewer;

beforeAll(async () => {
  await resetDb();
  owner = await buatPengguna('owner');
  ops = await buatPengguna('operasional');
  keu = await buatPengguna('keuangan');
  viewer = await buatPengguna('viewer');
});
afterAll(tutup);

const satu = async (uid, q, p) => (await sebagai(uid, q, p))[0];

describe('lini', () => {
  it('memiliki seed SJP, SJS, SJT', async () => {
    const rows = await sql('select kode from public.lini order by kode');
    expect(rows.map((r) => r.kode)).toEqual(['SJP', 'SJS', 'SJT']);
  });
  it('hanya owner yang bisa menyimpan lini', async () => {
    await expect(sebagai(ops, "select public.simpan_lini('SJX', 'Uji', true)")).rejects.toMatchObject({ code: '42501' });
    const r = await satu(owner, "select public.simpan_lini(' sjx ', 'Uji', true) as kode");
    expect(r.kode).toBe('SJX');
  });
});

describe('truk dan supir', () => {
  it('menormalkan nomor polisi', async () => {
    const r = await satu(ops, 'select public.simpan_truk(p_id => null, p_nopol => $1, p_jenis => $2) as id', ['  b 1234  cd ', 'Dump']);
    const [t] = await sql('select nopol from public.truk where id = $1', [r.id]);
    expect(t.nopol).toBe('B 1234 CD');
  });
  it('menolak nomor polisi ganda', async () => {
    await expect(
      sebagai(ops, 'select public.simpan_truk(p_id => null, p_nopol => $1)', ['B 1234 CD']),
    ).rejects.toMatchObject({ code: '23505' });
  });
  it('viewer dan keuangan tidak boleh menyimpan truk/supir', async () => {
    await expect(sebagai(viewer, 'select public.simpan_supir(p_id => null, p_nama => $1)', ['X'])).rejects.toMatchObject({ code: '42501' });
    await expect(sebagai(keu, 'select public.simpan_truk(p_id => null, p_nopol => $1)', ['B 1 X'])).rejects.toMatchObject({ code: '42501' });
  });
  it('mengubah id yang tidak ada → P0002', async () => {
    await expect(
      sebagai(ops, 'select public.simpan_supir(p_id => $1, p_nama => $2)', ['00000000-0000-0000-0000-000000000001', 'X']),
    ).rejects.toMatchObject({ code: 'P0002' });
  });
  it('mencatat audit', async () => {
    const r = await satu(ops, 'select public.simpan_supir(p_id => null, p_nama => $1) as id', ['Budi']);
    const a = await sql("select aksi from public.audit_log where entitas = 'supir' and entitas_id = $1", [r.id]);
    expect(a).toEqual([{ aksi: 'simpan' }]);
  });
  it('authenticated tidak bisa insert langsung', async () => {
    await expect(sebagai(owner, "insert into public.truk (nopol) values ('B 9 Z')")).rejects.toMatchObject({ code: '42501' });
  });
});

describe('pelanggan dan material', () => {
  it('keuangan boleh menyimpan pelanggan', async () => {
    const r = await satu(keu, 'select public.simpan_pelanggan(p_id => null, p_nama => $1) as id', [unik('PLG-')]);
    const [p] = await sql('select pemotong_pph, aktif from public.pelanggan where id = $1', [r.id]);
    expect(p).toEqual({ pemotong_pph: true, aktif: true });
  });
  it('material wajib lini yang ada dan aktif', async () => {
    await expect(
      sebagai(ops, 'select public.simpan_material(p_id => null, p_lini_kode => $1, p_nama => $2, p_satuan => $3)', ['ZZZ', 'Pasir', 'm3']),
    ).rejects.toMatchObject({ code: 'P0001' });
  });
  it('material wajib satuan', async () => {
    await expect(
      sebagai(ops, 'select public.simpan_material(p_id => null, p_lini_kode => $1, p_nama => $2, p_satuan => $3)', ['SJP', unik('M'), ' ']),
    ).rejects.toMatchObject({ code: 'P0001' });
  });
});

describe('nilai berlaku menurut tanggal', () => {
  it('uang jalan rute mengikuti tanggal berlaku', async () => {
    const { id: rute } = await satu(ops, 'select public.simpan_rute(p_id => null, p_nama => $1) as id', [unik('R')]);
    await sebagai(ops, 'select public.simpan_uang_jalan_rute($1, $2, $3)', [rute, '2026-01-01', '400000']);
    await sebagai(ops, 'select public.simpan_uang_jalan_rute($1, $2, $3)', [rute, '2026-03-01', '450000']);
    const q = 'select public.uang_jalan_berlaku($1, $2) as v';
    expect((await satu(ops, q, [rute, '2025-12-31'])).v).toBeNull();
    expect((await satu(ops, q, [rute, '2026-02-28'])).v).toBe('400000.00');
    expect((await satu(ops, q, [rute, '2026-03-01'])).v).toBe('450000.00');
  });

  it('tarif mengikuti tanggal berlaku dan upsert pada tanggal yang sama', async () => {
    const { id: plg } = await satu(keu, 'select public.simpan_pelanggan(p_id => null, p_nama => $1) as id', [unik('P')]);
    const { id: rute } = await satu(ops, 'select public.simpan_rute(p_id => null, p_nama => $1) as id', [unik('R')]);
    const { id: mat } = await satu(ops, 'select public.simpan_material(p_id => null, p_lini_kode => $1, p_nama => $2, p_satuan => $3) as id', ['SJP', unik('M'), 'm3']);
    const simpan = 'select public.simpan_tarif($1, $2, $3, $4, $5)';
    await sebagai(keu, simpan, [plg, rute, mat, '2026-01-01', '60000']);
    await sebagai(keu, simpan, [plg, rute, mat, '2026-01-01', '63000']);
    await sebagai(keu, simpan, [plg, rute, mat, '2026-07-01', '65000']);
    const q = 'select public.tarif_berlaku($1, $2, $3, $4) as v';
    expect((await satu(keu, q, [plg, rute, mat, '2026-06-30'])).v).toBe('63000.00');
    expect((await satu(keu, q, [plg, rute, mat, '2026-07-01'])).v).toBe('65000.00');
    await expect(sebagai(ops, simpan, [plg, rute, mat, '2026-08-01', '1'])).rejects.toMatchObject({ code: '42501' });
  });

  it('aturan upah paling spesifik menang', async () => {
    const { id: rute } = await satu(ops, 'select public.simpan_rute(p_id => null, p_nama => $1) as id', [unik('R')]);
    const { id: ruteLain } = await satu(ops, 'select public.simpan_rute(p_id => null, p_nama => $1) as id', [unik('R')]);
    const { id: mat } = await satu(ops, 'select public.simpan_material(p_id => null, p_lini_kode => $1, p_nama => $2, p_satuan => $3) as id', ['SJP', unik('M'), 'm3']);
    const { id: matLain } = await satu(ops, 'select public.simpan_material(p_id => null, p_lini_kode => $1, p_nama => $2, p_satuan => $3) as id', ['SJP', unik('M'), 'm3']);
    const simpan = 'select public.simpan_aturan_upah(p_id => null, p_nama => $1, p_rute_id => $2, p_material_id => $3, p_berlaku_mulai => $4, p_basis => $5, p_nominal => $6)';
    await sebagai(keu, simpan, ['Default', null, null, '2026-01-01', 'per_sj', '100000']);
    await sebagai(keu, simpan, ['Rute khusus', rute, null, '2026-01-01', 'per_sj', '150000']);
    await sebagai(keu, simpan, ['Rute+material', rute, mat, '2026-01-01', 'per_satuan', '10000']);
    const q = 'select public.upah_berlaku($1, $2, $3, $4) as v';
    expect((await satu(ops, q, [rute, mat, '2026-02-01', '12.5'])).v).toBe('125000.00');
    expect((await satu(ops, q, [rute, matLain, '2026-02-01', '12.5'])).v).toBe('150000.00');
    expect((await satu(ops, q, [ruteLain, mat, '2026-02-01', '12.5'])).v).toBe('100000.00');
    expect((await satu(ops, q, [ruteLain, mat, '2025-12-31', '12.5'])).v).toBeNull();
  });

  it('basis aturan upah tidak dikenal ditolak', async () => {
    await expect(
      sebagai(keu, 'select public.simpan_aturan_upah(p_id => null, p_nama => $1, p_rute_id => null, p_material_id => null, p_berlaku_mulai => $2, p_basis => $3, p_nominal => $4)', ['X', '2027-01-01', 'per_jam', '1']),
    ).rejects.toMatchObject({ code: '23514' });
  });
});
