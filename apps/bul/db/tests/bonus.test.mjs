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
describe('posting dan pembalikan bonus', () => {
  let supir;
  const hitung = (uid, periode) => satu(uid, 'select public.hitung_bonus($1) as id', [periode]).then((r) => r.id);
  const batalkan = (uid, periode, alasan = 'Koreksi data') =>
    satu(uid, 'select public.batalkan_bonus($1, $2, $3) as id', [periode, alasan, '2026-07-10']).then((r) => r.id);

  beforeAll(async () => {
    await simpanAturan(keu, { jenis: 'rit_harian_supir', ambang: 2, nominal: '25000', mulai: '2026-06-01' });
    const r = await satu(owner, 'select public.simpan_supir(p_id => null, p_nama => $1) as id', [unik('SUPIR-')]);
    supir = r.id;
    for (let i = 0; i < 2; i += 1) {
      const nomor = unik('SJ');
      const sjId = await satu(owner,
        `select public.buat_sj(p_lini_kode => $1, p_nomor => $2, p_tanggal => $3, p_pelanggan_id => $4, p_rute_id => $5,
           p_material_id => $6, p_truk_id => $7, p_supir_id => $8, p_qty_muat => $9) as id`,
        [m.lini, nomor, '2026-06-04', m.pelanggan, m.rute, m.material, m.truk, supir, '10']);
      await sebagai(owner, 'select public.selesaikan_sj($1, $2, $3, $4)', [sjId.id, '10', '2026-06-04', null]);
    }
  });

  it('bulan yang belum berakhir ditolak', async () => {
    const depan = new Date();
    depan.setMonth(depan.getMonth() + 1);
    const periode = `${depan.getFullYear()}-${String(depan.getMonth() + 1).padStart(2, '0')}-01`;
    await expect(hitung(keu, periode)).rejects.toMatchObject({ code: 'P0001' });
  });

  it('periode tanpa bonus ditolak, tidak membuat jurnal kosong', async () => {
    await expect(hitung(keu, '2025-06-01')).rejects.toMatchObject({ code: 'P0001' });
    expect(await sql("select id from public.jurnal where sumber_tipe = 'bonus' and tanggal = '2025-06-30'")).toEqual([]);
  });

  it('operasional tidak boleh menghitung bonus', async () => {
    await expect(hitung(ops, '2026-06-01')).rejects.toMatchObject({ code: '42501' });
  });

  it('posting menghasilkan satu jurnal seimbang bertanggal akhir bulan', async () => {
    const jurnalId = await hitung(keu, '2026-06-15');
    const [j] = await sql('select tanggal, sumber_tipe, sumber_id from public.jurnal where id = $1', [jurnalId]);
    expect(j).toEqual({ tanggal: '2026-06-30', sumber_tipe: 'bonus', sumber_id: null });
    const baris = await sql(
      'select akun_kode, debit, kredit, supir_id from public.jurnal_baris where jurnal_id = $1 order by urutan', [jurnalId]);
    expect(baris).toEqual([
      { akun_kode: '5135', debit: '25000.00', kredit: '0.00', supir_id: supir },
      { akun_kode: '2126', debit: '0.00', kredit: '25000.00', supir_id: supir },
    ]);
  });

  it('hutang bonus muncul di v_hutang_bonus', async () => {
    const rows = await sql('select penerima_jenis, penerima_id, saldo from public.v_hutang_bonus where penerima_id = $1', [supir]);
    expect(rows).toEqual([{ penerima_jenis: 'supir', penerima_id: supir, saldo: '25000.00' }]);
  });

  it('posting kedua untuk periode yang sama ditolak', async () => {
    await expect(hitung(keu, '2026-06-01')).rejects.toMatchObject({ code: 'P0001' });
  });

  it('SJ tidak bisa diselesaikan lagi di bulan yang bonusnya sudah diposting', async () => {
    const sjId = await satu(owner,
      `select public.buat_sj(p_lini_kode => $1, p_nomor => $2, p_tanggal => $3, p_pelanggan_id => $4, p_rute_id => $5,
         p_material_id => $6, p_truk_id => $7, p_supir_id => $8, p_qty_muat => $9) as id`,
      [m.lini, unik('SJ'), '2026-06-20', m.pelanggan, m.rute, m.material, m.truk, supir, '10']);
    await expect(sebagai(owner, 'select public.selesaikan_sj($1, $2, $3, $4)', [sjId.id, '10', '2026-06-20', null]))
      .rejects.toMatchObject({ code: 'P0001' });
  });

  it('SJ yang sudah selesai tidak bisa dibatalkan di bulan yang bonusnya sudah diposting', async () => {
    const [sjLama] = await sql(
      "select id from public.surat_jalan where supir_id = $1 and status = 'selesai' and tanggal_selesai = '2026-06-04' limit 1",
      [supir]);
    await expect(sebagai(owner, 'select public.batalkan_sj($1, $2, $3)', [sjLama.id, 'Uji', '2026-07-01']))
      .rejects.toMatchObject({ code: 'P0001' });
  });

  it('batalkan_bonus membalik jurnal dan mengosongkan hutang bonus', async () => {
    const pembalik = await batalkan(keu, '2026-06-01');
    const [p] = await sql('select sumber_tipe, tanggal from public.jurnal where id = $1', [pembalik]);
    expect(p).toEqual({ sumber_tipe: 'pembalik', tanggal: '2026-07-10' });
    expect(await sql('select saldo from public.v_hutang_bonus where penerima_id = $1', [supir])).toEqual([]);
  });

  it('batalkan_bonus pada periode yang belum diposting ditolak P0002', async () => {
    await expect(batalkan(keu, '2026-04-01')).rejects.toMatchObject({ code: 'P0002' });
  });

  it('batalkan_bonus tanpa alasan ditolak', async () => {
    await expect(batalkan(keu, '2026-06-01', '   ')).rejects.toMatchObject({ code: 'P0001' });
  });

  it('setelah dibatalkan, periode boleh dihitung ulang', async () => {
    const jurnalId = await hitung(keu, '2026-06-01');
    expect(jurnalId).toBeTruthy();
    const rows = await sql('select saldo from public.v_hutang_bonus where penerima_id = $1', [supir]);
    expect(rows).toEqual([{ saldo: '25000.00' }]);
  });

  it('hutang bonus bisa dilunasi lewat kas dengan dimensi supir', async () => {
    await sebagai(keu, 'select public.catat_kas($1, $2, $3, $4, $5)',
      ['keluar', '2026-07-15', '1112', 'Bayar bonus', JSON.stringify([{ akun_kode: '2126', jumlah: '25000', supir_id: supir }])]);
    expect(await sql('select saldo from public.v_hutang_bonus where penerima_id = $1', [supir])).toEqual([]);
  });

  it('pembayaran bonus tanpa dimensi ditolak', async () => {
    await expect(sebagai(keu, 'select public.catat_kas($1, $2, $3, $4, $5)',
      ['keluar', '2026-07-16', '1112', 'Bayar bonus', JSON.stringify([{ akun_kode: '2126', jumlah: '1000' }])]))
      .rejects.toMatchObject({ code: 'P0001' });
  });

  // Harus menjadi uji TERAKHIR di berkas ini: mengunci periode mempengaruhi seluruh posting sesudahnya.
  it('periode yang sudah dikunci menolak posting bonus', async () => {
    // Aturan sendiri untuk Agustus 2026 supaya dua SJ di bawah sudah cukup melewati ambang.
    await simpanAturan(keu, { jenis: 'rit_harian_supir', ambang: 2, nominal: '25000', mulai: '2026-08-01' });
    const sjId = await satu(owner,
      `select public.buat_sj(p_lini_kode => $1, p_nomor => $2, p_tanggal => $3, p_pelanggan_id => $4, p_rute_id => $5,
         p_material_id => $6, p_truk_id => $7, p_supir_id => $8, p_qty_muat => $9) as id`,
      [m.lini, unik('SJ'), '2026-08-03', m.pelanggan, m.rute, m.material, m.truk, supir, '10']);
    await sebagai(owner, 'select public.selesaikan_sj($1, $2, $3, $4)', [sjId.id, '10', '2026-08-03', null]);
    const sjId2 = await satu(owner,
      `select public.buat_sj(p_lini_kode => $1, p_nomor => $2, p_tanggal => $3, p_pelanggan_id => $4, p_rute_id => $5,
         p_material_id => $6, p_truk_id => $7, p_supir_id => $8, p_qty_muat => $9) as id`,
      [m.lini, unik('SJ'), '2026-08-03', m.pelanggan, m.rute, m.material, m.truk, supir, '10']);
    await sebagai(owner, 'select public.selesaikan_sj($1, $2, $3, $4)', [sjId2.id, '10', '2026-08-03', null]);
    // Ada bonus untuk Agustus 2026, jadi penolakan di bawah benar-benar datang dari penguncian periode.
    expect((await sebagai(keu, 'select * from public.pratinjau_bonus($1)', ['2026-08-01'])).length).toBeGreaterThan(0);
    await sebagai(owner, 'select public.atur_kunci_periode($1)', ['2026-08-31']);
    await expect(hitung(keu, '2026-08-01')).rejects.toMatchObject({ code: 'P0001', message: /dikunci/ });
  });
});
