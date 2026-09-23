import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { resetDb } from '../reset-db.mjs';
import { pool, sql, buatPengguna, sebagai, tutup } from './helpers.mjs';
import { siapkanMaster } from './fixtures.mjs';

let owner, keu, viewer, m;

beforeAll(async () => {
  await resetDb();
  owner = await buatPengguna('owner');
  keu = await buatPengguna('keuangan');
  viewer = await buatPengguna('viewer');
  m = await siapkanMaster(owner);
});
afterAll(tutup);
afterEach(async () => {
  await sql('update public.kunci_periode set terkunci_sampai = null');
});

const jurnalManual = (uid, tanggal, baris, ket = 'Uji jurnal') =>
  sebagai(uid, 'select public.buat_jurnal_manual($1, $2, $3) as id', [tanggal, ket, JSON.stringify(baris)]).then((r) => r[0].id);

describe('seed akuntansi', () => {
  it('COA bul-accounting + 6251 tersedia', async () => {
    const [{ n }] = await sql('select count(*)::int as n from public.akun');
    expect(n).toBe(161);
    const [a] = await sql("select nama, tipe, saldo_normal from public.akun where kode = '6251'");
    expect(a).toEqual({ nama: 'Beban PPh Final UMKM (PP 55)', tipe: 'detail', saldo_normal: 'debit' });
    const kas = await sql('select kode from public.akun where kas_bank order by kode');
    expect(kas.map((r) => r.kode)).toEqual(['1111', '1112', '1113']);
  });
  it('pengaturan posting default', async () => {
    const rows = await sql('select kunci, akun_kode from public.pengaturan_posting order by kunci');
    expect(rows).toEqual([
      { kunci: 'beban_komisi_pengurus', akun_kode: '5180' },
      { kunci: 'beban_pph_final', akun_kode: '6251' },
      { kunci: 'beban_uang_jalan', akun_kode: '5150' },
      { kunci: 'beban_upah_sopir', akun_kode: '5130' },
      { kunci: 'hutang_komisi_pengurus', akun_kode: '2125' },
      { kunci: 'hutang_upah_sopir', akun_kode: '2121' },
      { kunci: 'pendapatan_jasa', akun_kode: '4100' },
      { kunci: 'piutang_usaha', akun_kode: '1121' },
    ]);
  });
  it('pajak berlaku 2026: PP 55 aktif 0,5%', async () => {
    const [p] = await sebagai(viewer, "select * from public.pajak_berlaku('2026-06-01')");
    expect(p).toMatchObject({ pp55_aktif: true, tarif_pph_final: '0.0050', batas_omzet: '4800000000.00' });
  });
  it('kategori_akun', async () => {
    const [r] = await sql("select public.kategori_akun('5130') as a, public.kategori_akun('4100') as b, public.kategori_akun('2121') as c");
    expect(r).toEqual({ a: 'hpp', b: 'pendapatan', c: 'kewajiban' });
  });
});

describe('mesin jurnal lewat jurnal manual', () => {
  it('memposting jurnal seimbang dengan nomor tahunan dan dimensi', async () => {
    const id = await jurnalManual(keu, '2026-02-01', [
      { akun_kode: '5110', debit: '100000', truk_id: m.truk, keterangan: 'Solar' },
      { akun_kode: '1111', kredit: '100000' },
    ]);
    const [j] = await sql('select nomor, sumber_tipe from public.jurnal where id = $1', [id]);
    expect(j.nomor).toMatch(/^JU-2026-\d{6}$/);
    expect(j.sumber_tipe).toBe('manual');
    const baris = await sql('select urutan, akun_kode, debit, kredit, keterangan, truk_id from public.jurnal_baris where jurnal_id = $1 order by urutan', [id]);
    expect(baris).toEqual([
      { urutan: 1, akun_kode: '5110', debit: '100000.00', kredit: '0.00', keterangan: 'Solar', truk_id: m.truk },
      { urutan: 2, akun_kode: '1111', debit: '0.00', kredit: '100000.00', keterangan: 'Uji jurnal', truk_id: null },
    ]);
  });

  it('melewati baris bernilai nol', async () => {
    const id = await jurnalManual(keu, '2026-02-01', [
      { akun_kode: '6150', debit: '50000' },
      { akun_kode: '6160', debit: '0' },
      { akun_kode: '1111', kredit: '50000' },
    ]);
    const [{ n }] = await sql('select count(*)::int as n from public.jurnal_baris where jurnal_id = $1', [id]);
    expect(n).toBe(2);
  });

  it('menolak jurnal tidak seimbang dan tidak menyimpan apa pun', async () => {
    const [{ n: sebelum }] = await sql('select count(*)::int as n from public.jurnal');
    await expect(jurnalManual(keu, '2026-02-01', [
      { akun_kode: '6150', debit: '50000' },
      { akun_kode: '1111', kredit: '40000' },
    ])).rejects.toMatchObject({ code: '23514' });
    const [{ n: sesudah }] = await sql('select count(*)::int as n from public.jurnal');
    expect(sesudah).toBe(sebelum);
  });

  it('menolak akun header, kurang dari dua baris, angka negatif, dan >2 desimal', async () => {
    await expect(jurnalManual(keu, '2026-02-01', [{ akun_kode: '1110', debit: '1' }, { akun_kode: '1111', kredit: '1' }])).rejects.toMatchObject({ code: 'P0001' });
    await expect(jurnalManual(keu, '2026-02-01', [{ akun_kode: '1111', debit: '1' }])).rejects.toMatchObject({ code: 'P0001' });
    await expect(jurnalManual(keu, '2026-02-01', [{ akun_kode: '6150', debit: '-5' }, { akun_kode: '1111', kredit: '-5' }])).rejects.toMatchObject({ code: '23514' });
    await expect(jurnalManual(keu, '2026-02-01', [{ akun_kode: '6150', debit: '1.005' }, { akun_kode: '1111', kredit: '1.005' }])).rejects.toMatchObject({ code: 'P0001' });
  });

  it('menolak akun nonaktif', async () => {
    await sebagai(owner, "select public.simpan_akun('1114', 'Deposito Berjangka', '1110', 'detail', 'debit', false, false)");
    await expect(jurnalManual(keu, '2026-02-01', [{ akun_kode: '1114', debit: '1' }, { akun_kode: '1111', kredit: '1' }])).rejects.toMatchObject({ code: 'P0001' });
  });

  it('jurnal manual tidak boleh menyentuh piutang; hutang upah wajib supir', async () => {
    await expect(jurnalManual(keu, '2026-02-01', [{ akun_kode: '1121', debit: '1' }, { akun_kode: '4100', kredit: '1' }])).rejects.toMatchObject({ code: 'P0001' });
    await expect(jurnalManual(keu, '2026-02-01', [{ akun_kode: '2121', debit: '1' }, { akun_kode: '1111', kredit: '1' }])).rejects.toMatchObject({ code: 'P0001' });
    await expect(jurnalManual(keu, '2026-02-01', [{ akun_kode: '2121', debit: '1', supir_id: m.supir }, { akun_kode: '1111', kredit: '1' }])).resolves.toBeTruthy();
  });

  it('menolak posting di periode terkunci', async () => {
    await sebagai(owner, "select public.atur_kunci_periode('2026-01-31')");
    await expect(jurnalManual(keu, '2026-01-15', [{ akun_kode: '6150', debit: '1' }, { akun_kode: '1111', kredit: '1' }])).rejects.toMatchObject({ code: 'P0001' });
    await expect(jurnalManual(keu, '2026-02-01', [{ akun_kode: '6150', debit: '1' }, { akun_kode: '1111', kredit: '1' }])).resolves.toBeTruthy();
    await expect(sebagai(keu, "select public.atur_kunci_periode('2026-12-31')")).rejects.toMatchObject({ code: '42501' });
  });

  it('viewer tidak boleh membuat jurnal', async () => {
    await expect(jurnalManual(viewer, '2026-02-01', [{ akun_kode: '6150', debit: '1' }, { akun_kode: '1111', kredit: '1' }])).rejects.toMatchObject({ code: '42501' });
  });
});

describe('kekekalan jurnal', () => {
  it('trigger menolak update dan delete bahkan untuk superuser', async () => {
    const id = await jurnalManual(keu, '2026-02-02', [{ akun_kode: '6150', debit: '7' }, { akun_kode: '1111', kredit: '7' }]);
    await expect(sql("update public.jurnal set keterangan = 'ubah' where id = $1", [id])).rejects.toMatchObject({ code: 'P0001' });
    await expect(sql('delete from public.jurnal_baris where jurnal_id = $1', [id])).rejects.toMatchObject({ code: 'P0001' });
  });

  it('constraint tertunda menolak jurnal satu baris yang ditulis langsung', async () => {
    const c = await pool.connect();
    try {
      await c.query('begin');
      const { rows } = await c.query(
        "insert into public.jurnal (nomor, tanggal, keterangan, sumber_tipe) values ('UJI-RAW-1', '2026-02-03', 'mentah', 'manual') returning id");
      await c.query("insert into public.jurnal_baris (jurnal_id, urutan, akun_kode, debit, keterangan) values ($1, 1, '1111', 100, 'x')", [rows[0].id]);
      await expect(c.query('commit')).rejects.toMatchObject({ code: '23514' });
    } finally {
      await c.query('rollback').catch(() => {});
      c.release();
    }
  });
});

describe('pembatalan jurnal manual', () => {
  it('membuat jurnal pembalik dan menandai jurnal asal', async () => {
    const id = await jurnalManual(keu, '2026-02-04', [
      { akun_kode: '6150', debit: '25000', truk_id: m.truk },
      { akun_kode: '1111', kredit: '25000' },
    ]);
    const [{ id: pembalik }] = await sebagai(keu, "select public.batalkan_jurnal_manual($1, 'salah input', '2026-02-05') as id", [id]);
    const [asal] = await sql('select dibalik_oleh_id from public.jurnal where id = $1', [id]);
    expect(asal.dibalik_oleh_id).toBe(pembalik);
    const [pb] = await sql('select sumber_tipe, membalik_id, tanggal from public.jurnal where id = $1', [pembalik]);
    expect(pb).toEqual({ sumber_tipe: 'pembalik', membalik_id: id, tanggal: '2026-02-05' });
    const baris = await sql('select akun_kode, debit, kredit, truk_id from public.jurnal_baris where jurnal_id = $1 order by urutan', [pembalik]);
    expect(baris).toEqual([
      { akun_kode: '6150', debit: '0.00', kredit: '25000.00', truk_id: m.truk },
      { akun_kode: '1111', debit: '25000.00', kredit: '0.00', truk_id: null },
    ]);
    await expect(sebagai(keu, "select public.batalkan_jurnal_manual($1, 'lagi', '2026-02-05')", [id])).rejects.toMatchObject({ code: 'P0001' });
    await expect(sebagai(keu, "select public.batalkan_jurnal_manual($1, 'pembalik', '2026-02-05')", [pembalik])).rejects.toMatchObject({ code: 'P0001' });
  });

  it('alasan wajib dan tanggal batal tidak boleh mundur', async () => {
    const id = await jurnalManual(keu, '2026-02-10', [{ akun_kode: '6150', debit: '1' }, { akun_kode: '1111', kredit: '1' }]);
    await expect(sebagai(keu, "select public.batalkan_jurnal_manual($1, ' ', '2026-02-10')", [id])).rejects.toMatchObject({ code: 'P0001' });
    await expect(sebagai(keu, "select public.batalkan_jurnal_manual($1, 'x', '2026-02-09')", [id])).rejects.toMatchObject({ code: 'P0001' });
  });
});

describe('pengaturan akun', () => {
  it('owner menambah akun detail di bawah header', async () => {
    await sebagai(owner, "select public.simpan_akun('6361', 'Beban Uji', '6300', 'detail', 'debit')");
    const [a] = await sql("select induk_kode, aktif from public.akun where kode = '6361'");
    expect(a).toEqual({ induk_kode: '6300', aktif: true });
  });
  it('induk harus header; kode harus 4 digit', async () => {
    await expect(sebagai(owner, "select public.simpan_akun('6362', 'X', '1111', 'detail', 'debit')")).rejects.toMatchObject({ code: 'P0001' });
    await expect(sebagai(owner, "select public.simpan_akun('ABCD', 'X', '6300', 'detail', 'debit')")).rejects.toMatchObject({ code: '23514' });
  });
  it('akun yang dipakai pengaturan posting tidak bisa dinonaktifkan', async () => {
    await expect(sebagai(owner, "select public.simpan_akun('4100', 'Pendapatan Usaha', '4000', 'detail', 'kredit', false, false)")).rejects.toMatchObject({ code: 'P0001' });
  });
  it('pengaturan posting hanya ke akun detail aktif', async () => {
    await expect(sebagai(owner, "select public.atur_pengaturan_posting('pendapatan_jasa', '4000')")).rejects.toMatchObject({ code: 'P0001' });
    await sebagai(owner, "select public.atur_pengaturan_posting('pendapatan_jasa', '4100')");
    await expect(sebagai(keu, "select public.atur_pengaturan_posting('pendapatan_jasa', '4100')")).rejects.toMatchObject({ code: '42501' });
  });
  it('owner menyimpan pengaturan pajak bertanggal', async () => {
    await sebagai(owner, "select public.simpan_pengaturan_pajak('2027-01-01', false, 0.005, 4800000000)");
    const [p] = await sql("select * from public.pajak_berlaku('2027-03-01')");
    expect(p.pp55_aktif).toBe(false);
  });
  it('viewer bisa membaca buku besar', async () => {
    const rows = await sebagai(viewer, 'select nomor, akun_kode from public.v_buku_besar limit 1');
    expect(rows.length).toBe(1);
  });
});
