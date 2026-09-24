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
