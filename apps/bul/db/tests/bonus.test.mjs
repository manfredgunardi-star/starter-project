import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resetDb } from '../reset-db.mjs';
import { sql, buatPengguna, sebagai, unik, tutup } from './helpers.mjs';
import { siapkanMaster } from './fixtures.mjs';

let owner, keu, ops, m;

const satu = async (uid, q, p) => (await sebagai(uid, q, p))[0];

const simpanAturan = (uid, { nama = unik('BONUS-'), jenis, ambang = null, nominal, mulai = '2026-01-01', aktif = true, id = null } = {}) =>
  satu(uid,
    `select public.simpan_aturan_bonus(p_id => $1, p_nama => $2, p_jenis => $3, p_ambang => $4,
       p_nominal => $5, p_berlaku_mulai => $6, p_aktif => $7) as id`,
    [id, nama, jenis, ambang, nominal, mulai, aktif]).then((r) => r.id);

beforeAll(async () => {
  await resetDb();
  owner = await buatPengguna('owner');
  keu = await buatPengguna('keuangan');
  ops = await buatPengguna('operasional');
  m = await siapkanMaster(owner);
});
afterAll(tutup);

describe('master: aturan_bonus', () => {
  it('menyimpan aturan rit harian', async () => {
    const id = await simpanAturan(keu, { jenis: 'rit_harian_supir', ambang: 3, nominal: '30000' });
    const [row] = await sql('select jenis, ambang, nominal, aktif from public.aturan_bonus where id = $1', [id]);
    expect(row).toEqual({ jenis: 'rit_harian_supir', ambang: 3, nominal: '30000.00', aktif: true });
  });

  it('tonase wajib tanpa ambang', async () => {
    await expect(simpanAturan(keu, { jenis: 'tonase_supir', ambang: 2, nominal: '10000' }))
      .rejects.toMatchObject({ code: 'P0001' });
    const id = await simpanAturan(keu, { jenis: 'tonase_supir', nominal: '10000' });
    const [row] = await sql('select ambang from public.aturan_bonus where id = $1', [id]);
    expect(row).toEqual({ ambang: null });
  });

  it('jenis selain tonase wajib punya ambang minimal 1', async () => {
    await expect(simpanAturan(keu, { jenis: 'rit_bulanan_supir', ambang: null, nominal: '500000' }))
      .rejects.toMatchObject({ code: 'P0001' });
    await expect(simpanAturan(keu, { jenis: 'rit_bulanan_supir', ambang: 0, nominal: '500000' }))
      .rejects.toMatchObject({ code: 'P0001' });
  });

  it('jenis tidak dikenal ditolak', async () => {
    await expect(simpanAturan(keu, { jenis: 'rit_mingguan_supir', ambang: 3, nominal: '1000' }))
      .rejects.toMatchObject({ code: '23514' });
  });

  it('hanya satu aturan aktif per jenis dan tanggal berlaku', async () => {
    await simpanAturan(keu, { jenis: 'rit_bulanan_pengurus', ambang: 50, nominal: '400000', mulai: '2026-04-01' });
    await expect(simpanAturan(keu, { jenis: 'rit_bulanan_pengurus', ambang: 60, nominal: '500000', mulai: '2026-04-01' }))
      .rejects.toMatchObject({ code: '23505' });
  });

  it('operasional tidak boleh menyimpan aturan bonus', async () => {
    await expect(simpanAturan(ops, { jenis: 'rit_harian_supir', ambang: 3, nominal: '30000' }))
      .rejects.toMatchObject({ code: '42501' });
  });

  it('update id yang tidak ada ditolak P0002', async () => {
    await expect(simpanAturan(keu, {
      id: '00000000-0000-0000-0000-000000000123', jenis: 'rit_harian_supir', ambang: 3, nominal: '30000',
    })).rejects.toMatchObject({ code: 'P0002' });
  });
});

describe('bonus_berlaku', () => {
  it('mengambil aturan terbaru yang berlaku dan kosong kalau belum ada', async () => {
    await simpanAturan(keu, { jenis: 'rit_harian_supir', ambang: 3, nominal: '30000', mulai: '2026-05-01' });
    await simpanAturan(keu, { jenis: 'rit_harian_supir', ambang: 3, nominal: '45000', mulai: '2026-07-01' });
    expect(await sql("select * from public.bonus_berlaku('rit_harian_supir', '2026-06-15')"))
      .toEqual([{ ambang: 3, nominal: '30000.00' }]);
    expect(await sql("select * from public.bonus_berlaku('rit_harian_supir', '2026-08-15')"))
      .toEqual([{ ambang: 3, nominal: '45000.00' }]);
    // Sebelum aturan paling awal (2026-01-01, dibuat uji pertama di berkas ini) memang belum ada apa-apa.
    expect(await sql("select * from public.bonus_berlaku('rit_harian_supir', '2025-12-31')")).toEqual([]);
    // Penyaringan per jenis: tanggal yang sama mengembalikan aturan tonase (ambang null, 10000 dari
    // uji di describe sebelumnya), bukan aturan rit harian 45000 di atas.
    expect(await sql("select * from public.bonus_berlaku('tonase_supir', '2026-08-15')"))
      .toEqual([{ ambang: null, nominal: '10000.00' }]);
  });
});

describe('material: standar bongkar', () => {
  it('standar bongkar tersimpan dan boleh kosong', async () => {
    const a = await satu(owner,
      'select public.simpan_material(p_id => null, p_lini_kode => $1, p_nama => $2, p_satuan => $3, p_standar_bongkar => $4) as id',
      [m.lini, unik('MAT-'), 'ton', '20']);
    const [rowA] = await sql('select standar_bongkar from public.material where id = $1', [a.id]);
    expect(rowA).toEqual({ standar_bongkar: '20.000' });
    const b = await satu(owner,
      'select public.simpan_material(p_id => null, p_lini_kode => $1, p_nama => $2, p_satuan => $3) as id',
      [m.lini, unik('MAT-'), 'ton']);
    const [rowB] = await sql('select standar_bongkar from public.material where id = $1', [b.id]);
    expect(rowB).toEqual({ standar_bongkar: null });
  });

  it('standar bongkar nol ditolak', async () => {
    await expect(sebagai(owner,
      'select public.simpan_material(p_id => null, p_lini_kode => $1, p_nama => $2, p_satuan => $3, p_standar_bongkar => $4)',
      [m.lini, unik('MAT-'), 'ton', '0'])).rejects.toMatchObject({ code: '23514' });
  });
});
describe('perhitungan bonus', () => {
  // Setiap skenario memakai bulan sendiri supaya tidak saling mencemari.
  const pratinjau = (uid, periode) => sebagai(uid, 'select * from public.pratinjau_bonus($1) order by jenis', [periode]);

  async function supirBaru() {
    const r = await satu(owner, 'select public.simpan_supir(p_id => null, p_nama => $1) as id', [unik('SUPIR-')]);
    return r.id;
  }

  async function sjSelesai(mm, { supir, tanggal, qtyBongkar = '10', material = null }) {
    const nomor = unik('SJ');
    const r = await satu(owner,
      `select public.buat_sj(p_lini_kode => $1, p_nomor => $2, p_tanggal => $3, p_pelanggan_id => $4, p_rute_id => $5,
         p_material_id => $6, p_truk_id => $7, p_supir_id => $8, p_qty_muat => $9) as id`,
      [mm.lini, nomor, tanggal, mm.pelanggan, mm.rute, material ?? mm.material, mm.truk, supir, '10']);
    await sebagai(owner, 'select public.selesaikan_sj($1, $2, $3, $4)', [r.id, qtyBongkar, tanggal, null]);
    return r.id;
  }

  it('rit harian: di bawah ambang nol, tepat ambang dapat, di atas ambang tetap satu kali', async () => {
    await simpanAturan(keu, { jenis: 'rit_harian_supir', ambang: 3, nominal: '30000', mulai: '2026-09-01' });
    const kurang = await supirBaru();
    const pas = await supirBaru();
    const lebih = await supirBaru();
    for (let i = 0; i < 2; i += 1) await sjSelesai(m, { supir: kurang, tanggal: '2026-09-02' });
    for (let i = 0; i < 3; i += 1) await sjSelesai(m, { supir: pas, tanggal: '2026-09-02' });
    for (let i = 0; i < 5; i += 1) await sjSelesai(m, { supir: lebih, tanggal: '2026-09-02' });
    const rows = await pratinjau(keu, '2026-09-01');
    const harian = rows.filter((r) => r.jenis === 'rit_harian_supir');
    expect(harian.find((r) => r.penerima_id === kurang)).toBeUndefined();
    expect(harian.find((r) => r.penerima_id === pas)).toMatchObject({ dasar: '1', jumlah: '30000.00' });
    expect(harian.find((r) => r.penerima_id === lebih)).toMatchObject({ dasar: '1', jumlah: '30000.00' });
  });

  it('rit harian dihitung per hari, bukan per bulan', async () => {
    await simpanAturan(keu, { jenis: 'rit_harian_supir', ambang: 3, nominal: '20000', mulai: '2026-10-01' });
    const s = await supirBaru();
    for (let i = 0; i < 3; i += 1) await sjSelesai(m, { supir: s, tanggal: '2026-10-05' });
    for (let i = 0; i < 3; i += 1) await sjSelesai(m, { supir: s, tanggal: '2026-10-06' });
    for (let i = 0; i < 2; i += 1) await sjSelesai(m, { supir: s, tanggal: '2026-10-07' });
    const rows = await pratinjau(keu, '2026-10-15');
    expect(rows.find((r) => r.jenis === 'rit_harian_supir' && r.penerima_id === s))
      .toMatchObject({ dasar: '2', jumlah: '40000.00' });
  });

  it('tonase: tanpa standar dilewati, sama dengan standar nol, melebihi standar flat per SJ', async () => {
    await simpanAturan(keu, { jenis: 'tonase_supir', nominal: '15000', mulai: '2026-11-01' });
    const tanpa = await satu(owner,
      'select public.simpan_material(p_id => null, p_lini_kode => $1, p_nama => $2, p_satuan => $3) as id',
      [m.lini, unik('MAT-'), 'ton']);
    const dengan = await satu(owner,
      'select public.simpan_material(p_id => null, p_lini_kode => $1, p_nama => $2, p_satuan => $3, p_standar_bongkar => $4) as id',
      [m.lini, unik('MAT-'), 'ton', '20']);
    const a = await supirBaru();
    const b = await supirBaru();
    const c = await supirBaru();
    await sjSelesai(m, { supir: a, tanggal: '2026-11-03', qtyBongkar: '25', material: tanpa.id });
    await sjSelesai(m, { supir: b, tanggal: '2026-11-03', qtyBongkar: '20', material: dengan.id });
    await sjSelesai(m, { supir: c, tanggal: '2026-11-03', qtyBongkar: '23', material: dengan.id });
    await sjSelesai(m, { supir: c, tanggal: '2026-11-04', qtyBongkar: '30', material: dengan.id });
    const rows = await pratinjau(keu, '2026-11-01');
    const tonase = rows.filter((r) => r.jenis === 'tonase_supir');
    expect(tonase.find((r) => r.penerima_id === a)).toBeUndefined();
    expect(tonase.find((r) => r.penerima_id === b)).toBeUndefined();
    expect(tonase.find((r) => r.penerima_id === c)).toMatchObject({ dasar: '2', jumlah: '30000.00' });
  });

  it('bonus harian, tonase, dan bulanan menumpuk penuh untuk satu supir', async () => {
    await simpanAturan(keu, { jenis: 'rit_harian_supir', ambang: 3, nominal: '30000', mulai: '2026-12-01' });
    await simpanAturan(keu, { jenis: 'rit_bulanan_supir', ambang: 6, nominal: '500000', mulai: '2026-12-01' });
    await simpanAturan(keu, { jenis: 'tonase_supir', nominal: '10000', mulai: '2026-12-01' });
    const mat = await satu(owner,
      'select public.simpan_material(p_id => null, p_lini_kode => $1, p_nama => $2, p_satuan => $3, p_standar_bongkar => $4) as id',
      [m.lini, unik('MAT-'), 'ton', '20']);
    const s = await supirBaru();
    for (let i = 0; i < 3; i += 1) await sjSelesai(m, { supir: s, tanggal: '2026-12-02', qtyBongkar: '25', material: mat.id });
    for (let i = 0; i < 3; i += 1) await sjSelesai(m, { supir: s, tanggal: '2026-12-03', qtyBongkar: '10', material: mat.id });
    const rows = (await pratinjau(keu, '2026-12-20')).filter((r) => r.penerima_id === s);
    expect(rows.map((r) => [r.jenis, r.dasar, r.jumlah])).toEqual([
      ['rit_bulanan_supir', '6', '500000.00'],
      ['rit_harian_supir', '2', '60000.00'],
      ['tonase_supir', '3', '30000.00'],
    ]);
  });

  it('SJ batal tidak ikut terhitung', async () => {
    await simpanAturan(keu, { jenis: 'rit_harian_supir', ambang: 2, nominal: '10000', mulai: '2027-01-01' });
    const s = await supirBaru();
    await sjSelesai(m, { supir: s, tanggal: '2027-01-05' });
    const batal = await sjSelesai(m, { supir: s, tanggal: '2027-01-05' });
    await sebagai(owner, 'select public.batalkan_sj($1, $2, $3)', [batal, 'Uji batal', '2027-01-06']);
    const rows = await pratinjau(keu, '2027-01-01');
    expect(rows.find((r) => r.penerima_id === s)).toBeUndefined();
  });

  it('jenis tanpa aturan tidak menghasilkan baris dan tidak melempar error', async () => {
    const s = await supirBaru();
    await sjSelesai(m, { supir: s, tanggal: '2027-02-05' });
    expect(await pratinjau(keu, '2027-02-01')).toEqual([]);
  });

  it('viewer dan operasional tidak boleh membuka pratinjau', async () => {
    const viewer = await buatPengguna('viewer');
    await expect(pratinjau(viewer, '2026-09-01')).rejects.toMatchObject({ code: '42501' });
    await expect(pratinjau(ops, '2026-09-01')).rejects.toMatchObject({ code: '42501' });
  });
});
