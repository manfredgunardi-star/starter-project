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

describe('impor_surat_jalan', () => {
  const imporSj = (uid, baris) =>
    sebagai(uid, 'select public.impor_surat_jalan($1::jsonb) as n', [JSON.stringify(baris)]);

  // Master dengan tarif/uang jalan/upah yang SENGAJA berbeda dari angka di berkas,
  // supaya bisa dibuktikan yang dipakai adalah angka berkas.
  async function masterUji() {
    const rute = unik('RUTE-');
    const mat = unik('MAT-');
    const plg = unik('PLG-');
    const supir = unik('SUPIR-');
    const nopol = unik('B ');
    // tipe_rute dan aturan_komisi BUKAN cakupan impor; keduanya dibuat lewat layar master
    // aplikasi sebelum impor dijalankan. Fixture meniru prasyarat itu, sebab tanpa keduanya
    // komisi_berlaku(null, tanggal) mengembalikan null dan selesaikan_sj tidak membentuk
    // satu pun baris jurnal komisi -- diam-diam, tanpa galat.
    const tipe = unik('TIPE-');
    const [t] = await sebagai(owner,
      'select public.simpan_tipe_rute(p_id => null, p_nama => $1) as id', [tipe]);
    await sebagai(owner,
      `select public.simpan_aturan_komisi(p_id => null, p_nama => $1, p_tipe_rute_id => $2,
         p_berlaku_mulai => '2026-01-01'::date, p_nominal => 50000)`, [unik('KOM-'), t.id]);
    await sebagai(owner, 'select public.impor_master($1::jsonb)', [JSON.stringify({
      rute: [{ nama: rute, asal: 'Bogor', tujuan: 'Jakarta', tipe_rute: tipe }],
      material: [{ lini: 'SJP', nama: mat, satuan: 'm3' }],
      pelanggan: [{ nama: plg, pemotong_pph: true }],
      truk: [{ nopol }],
      supir: [{ nama: supir }],
      uang_jalan: [{ rute, berlaku_mulai: '2026-01-01', nominal: '111111' }],
      aturan_upah: [{ nama: unik('UPAH-'), rute, berlaku_mulai: '2026-01-01', basis: 'per_sj', nominal: '222222' }],
    })]);
    return { rute, mat, plg, supir, nopol, tipe };
  }

  it('memakai angka dari berkas, bukan dari master', async () => {
    const m = await masterUji();
    const nomor = unik('SJ');
    const [r] = await imporSj(owner, [{
      lini: 'SJP', nomor, tanggal: '2026-03-02', pelanggan: m.plg, rute: m.rute,
      material: m.mat, nopol: m.nopol, supir: m.supir, qty_muat: '10',
      uang_jalan: '400000', qty_bongkar: '9.5', tanggal_selesai: '2026-03-03', upah: '175000',
      keterangan: 'impor uji',
    }]);
    expect(r.n).toBe(1);

    const [sj] = await sql(
      'select status, uang_jalan, upah, qty_bongkar, tanggal_selesai from public.surat_jalan where nomor = $1',
      [nomor]);
    expect(sj).toEqual({
      status: 'selesai', uang_jalan: '400000.00', upah: '175000.00',
      qty_bongkar: '9.500', tanggal_selesai: '2026-03-03',
    });
  });

  it('SJ tanpa tanggal_selesai tetap berstatus berangkat', async () => {
    const m = await masterUji();
    const nomor = unik('SJ');
    await imporSj(owner, [{
      lini: 'SJP', nomor, tanggal: '2026-03-04', pelanggan: m.plg, rute: m.rute,
      material: m.mat, nopol: m.nopol, supir: m.supir, qty_muat: '8', uang_jalan: '400000',
    }]);
    const [sj] = await sql('select status, upah from public.surat_jalan where nomor = $1', [nomor]);
    expect(sj).toEqual({ status: 'berangkat', upah: null });
  });

  it('pengurus dari berkas ikut ke SJ dan ke baris jurnal komisi', async () => {
    const m = await masterUji();
    const pengurus = unik('PGR-');
    await sebagai(owner, 'select public.impor_master($1::jsonb)', [JSON.stringify({
      pengurus: [{ nama: pengurus }],
    })]);
    const nomor = unik('SJ');
    await imporSj(owner, [{
      lini: 'SJP', nomor, tanggal: '2026-03-05', pelanggan: m.plg, rute: m.rute,
      material: m.mat, nopol: m.nopol, supir: m.supir, pengurus, qty_muat: '10',
      uang_jalan: '400000', qty_bongkar: '10', tanggal_selesai: '2026-03-06', upah: '150000',
    }]);
    const [sj] = await sql(
      `select g.nama from public.surat_jalan s join public.pengurus g on g.id = s.pengurus_id
        where s.nomor = $1`, [nomor]);
    expect(sj.nama).toBe(pengurus);

    // Cacah baris saja akan lulus walau nominalnya salah. Nilai dipatri, bukan dihitung
    // ulang lewat internal.akun_posting, supaya tes tidak sekadar mengulang rumus yang diuji.
    const baris = await sql(
      `select b.akun_kode, b.debit, b.kredit from public.surat_jalan s
         join public.jurnal_baris b on b.jurnal_id = s.jurnal_upah_id
        where s.nomor = $1 and b.pengurus_id = s.pengurus_id
        order by b.akun_kode`, [nomor]);
    expect(baris).toEqual([
      { akun_kode: '2125', debit: '0.00', kredit: '50000.00' },
      { akun_kode: '5180', debit: '50000.00', kredit: '0.00' },
    ]);
  });

  it('gagal di tengah tidak meninggalkan satu pun SJ atau jurnal', async () => {
    const m = await masterUji();
    const awalSj = (await sql('select count(*)::int as n from public.surat_jalan'))[0].n;
    const awalJurnal = (await sql('select count(*)::int as n from public.jurnal'))[0].n;
    const nomor = unik('SJ');

    const baris = [1, 2, 3, 4, 5].map((i) => ({
      lini: 'SJP', nomor: `${nomor}-${i}`, tanggal: '2026-03-10', pelanggan: m.plg, rute: m.rute,
      material: m.mat, nopol: m.nopol, supir: i === 4 ? 'SUPIR HANTU' : m.supir,
      qty_muat: '10', uang_jalan: '400000', qty_bongkar: '10',
      tanggal_selesai: '2026-03-11', upah: '150000',
    }));

    await expect(imporSj(owner, baris)).rejects.toMatchObject({
      code: 'P0001',
      message: `surat-jalan.csv baris 4 (${nomor}-4): supir "SUPIR HANTU" tidak ditemukan atau tidak aktif`,
    });

    // Dibaca dari koneksi terpisah: tidak boleh ada sisa apa pun.
    expect((await sql('select count(*)::int as n from public.surat_jalan'))[0].n).toBe(awalSj);
    expect((await sql('select count(*)::int as n from public.jurnal'))[0].n).toBe(awalJurnal);
    expect(await sql('select nomor from public.surat_jalan where nomor like $1', [`${nomor}-%`])).toEqual([]);
  });

  it('nomor SJ kembar dalam lini yang sama ditolak', async () => {
    const m = await masterUji();
    const nomor = unik('SJ');
    const satu = {
      lini: 'SJP', nomor, tanggal: '2026-03-12', pelanggan: m.plg, rute: m.rute,
      material: m.mat, nopol: m.nopol, supir: m.supir, qty_muat: '10', uang_jalan: '400000',
    };
    await imporSj(owner, [satu]);
    await expect(imporSj(owner, [satu])).rejects.toMatchObject({ code: '23505' });
  });
});

describe('impor_kas', () => {
  const imporKas = (uid, baris) =>
    sebagai(uid, 'select public.impor_kas($1::jsonb) as n', [JSON.stringify(baris)]);

  it('baris ber-ref sama menjadi satu transaksi multi-rincian', async () => {
    const ket = unik('KAS-');
    const [r] = await imporKas(owner, [
      { ref: 'A1', jenis: 'keluar', tanggal: '2026-04-01', akun_kas: '1111', keterangan: ket,
        akun: '5110', jumlah: '300000', keterangan_baris: 'Solar' },
      { ref: 'A1', jenis: 'keluar', tanggal: '2026-04-01', akun_kas: '1111', keterangan: ket,
        akun: '5160', jumlah: '200000', keterangan_baris: 'Tol' },
    ]);
    expect(r.n).toBe(1);

    const [t] = await sql('select id, jenis, total from public.transaksi_kas where keterangan = $1', [ket]);
    expect({ jenis: t.jenis, total: t.total }).toEqual({ jenis: 'keluar', total: '500000.00' });
    const rincian = await sql(
      'select akun_kode, jumlah from public.transaksi_kas_baris where transaksi_id = $1 order by urutan', [t.id]);
    expect(rincian).toEqual([
      { akun_kode: '5110', jumlah: '300000.00' },
      { akun_kode: '5160', jumlah: '200000.00' },
    ]);
  });

  it('ref kosong berarti setiap baris berdiri sendiri', async () => {
    const a = unik('KAS-');
    const b = unik('KAS-');
    const [r] = await imporKas(owner, [
      { jenis: 'keluar', tanggal: '2026-04-02', akun_kas: '1111', keterangan: a, akun: '5110', jumlah: '50000' },
      { jenis: 'keluar', tanggal: '2026-04-02', akun_kas: '1111', keterangan: b, akun: '5110', jumlah: '60000' },
    ]);
    expect(r.n).toBe(2);
    const rows = await sql(
      'select total from public.transaksi_kas where keterangan in ($1, $2) order by total', [a, b]);
    expect(rows).toEqual([{ total: '50000.00' }, { total: '60000.00' }]);
  });

  it('satu ref dengan tanggal berbeda ditolak dan menyebut ref-nya', async () => {
    await expect(imporKas(owner, [
      { ref: 'B2', jenis: 'keluar', tanggal: '2026-04-03', akun_kas: '1111', keterangan: unik('KAS-'),
        akun: '5110', jumlah: '10000' },
      { ref: 'B2', jenis: 'keluar', tanggal: '2026-04-04', akun_kas: '1111', keterangan: unik('KAS-'),
        akun: '5110', jumlah: '10000' },
    ])).rejects.toThrow(/ref "B2".*harus sama/);
  });

  it('penjagaan dimensi catat_kas tetap berlaku lewat jalur impor', async () => {
    // Kolomnya akun_kode, bukan nilai. Akun dibaca dari pengaturan_posting sebagai INPUT,
    // bukan sebagai nilai harapan; yang dipatri adalah pesan galatnya. Ketiga penjagaan
    // diuji karena dua di antaranya baru ditambahkan fase Bonus, dan jalur impor ini
    // belum pernah menyentuhnya.
    const akun = Object.fromEntries((await sql(
      `select kunci, akun_kode from public.pengaturan_posting
        where kunci in ('hutang_upah_sopir', 'hutang_komisi_pengurus', 'hutang_bonus')`))
      .map((r) => [r.kunci, r.akun_kode]));
    const kirim = (kode) => imporKas(owner, [
      { jenis: 'keluar', tanggal: '2026-04-05', akun_kas: '1111', keterangan: unik('KAS-'),
        akun: kode, jumlah: '100000' },
    ]);
    await expect(kirim(akun.hutang_upah_sopir))
      .rejects.toThrow(/Pembayaran upah wajib memilih supir/);
    await expect(kirim(akun.hutang_komisi_pengurus))
      .rejects.toThrow(/Pembayaran komisi pengurus wajib memilih pengurus/);
    await expect(kirim(akun.hutang_bonus))
      .rejects.toThrow(/Pembayaran bonus wajib memilih supir atau pengurus/);
  });

  it('gagal di tengah tidak meninggalkan transaksi kas atau jurnal', async () => {
    const awalKas = (await sql('select count(*)::int as n from public.transaksi_kas'))[0].n;
    const awalJurnal = (await sql('select count(*)::int as n from public.jurnal'))[0].n;
    const ket = unik('KAS-');
    await expect(imporKas(owner, [
      { jenis: 'keluar', tanggal: '2026-04-06', akun_kas: '1111', keterangan: ket, akun: '5110', jumlah: '10000' },
      { jenis: 'keluar', tanggal: '2026-04-06', akun_kas: '1111', keterangan: unik('KAS-'),
        akun: '9999', jumlah: '10000' },
    ])).rejects.toThrow(/Akun 9999 tidak ada/);
    expect((await sql('select count(*)::int as n from public.transaksi_kas'))[0].n).toBe(awalKas);
    expect((await sql('select count(*)::int as n from public.jurnal'))[0].n).toBe(awalJurnal);
    expect(await sql('select id from public.transaksi_kas where keterangan = $1', [ket])).toEqual([]);
  });
});

describe('penjagaan lintas-RPC impor', () => {
  it('hanya owner yang boleh mengimpor', async () => {
    const keuangan = await buatPengguna('keuangan');
    const operasional = await buatPengguna('operasional');
    for (const uid of [keuangan, operasional]) {
      await expect(sebagai(uid, `select public.impor_master('{}'::jsonb)`))
        .rejects.toMatchObject({ code: '42501' });
      await expect(sebagai(uid, `select public.impor_surat_jalan('[]'::jsonb)`))
        .rejects.toMatchObject({ code: '42501' });
      await expect(sebagai(uid, `select public.impor_kas('[]'::jsonb)`))
        .rejects.toMatchObject({ code: '42501' });
    }
  });

  it('ketiganya memasang statement_timeout 600s', async () => {
    const rows = await sql(`
      select p.proname, p.proconfig::text[] as cfg
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname like 'impor\\_%'
       order by p.proname`);
    expect(rows.map((r) => r.proname)).toEqual(['impor_kas', 'impor_master', 'impor_surat_jalan']);
    for (const r of rows) {
      // toContain pada array adalah kesamaan ELEMEN, bukan substring. Nilai yang benar-benar
      // tersimpan adalah search_path="" lengkap dengan tanda kutipnya; 'search_path=' saja
      // tidak akan pernah cocok. Diverifikasi ke pg_proc.
      expect(r.cfg).toEqual(['search_path=""', 'statement_timeout=600s']);
    }
  });

  it('periode terkunci menolak impor SJ dan kas bertanggal di dalamnya', async () => {
    const rute = unik('RUTE-');
    const mat = unik('MAT-');
    const plg = unik('PLG-');
    const supir = unik('SUPIR-');
    const nopol = unik('B ');
    await sebagai(owner, 'select public.impor_master($1::jsonb)', [JSON.stringify({
      rute: [{ nama: rute }],
      material: [{ lini: 'SJP', nama: mat, satuan: 'm3' }],
      pelanggan: [{ nama: plg, pemotong_pph: true }],
      truk: [{ nopol }],
      supir: [{ nama: supir }],
      uang_jalan: [{ rute, berlaku_mulai: '2026-01-01', nominal: '400000' }],
      aturan_upah: [{ nama: unik('UPAH-'), rute, berlaku_mulai: '2026-01-01', basis: 'per_sj', nominal: '150000' }],
    })]);

    await sebagai(owner, `select public.atur_kunci_periode('2026-05-31'::date)`);
    try {
      await expect(sebagai(owner, 'select public.impor_surat_jalan($1::jsonb)', [JSON.stringify([{
        lini: 'SJP', nomor: unik('SJ'), tanggal: '2026-05-02', pelanggan: plg, rute,
        material: mat, nopol, supir, qty_muat: '10', uang_jalan: '400000',
        qty_bongkar: '10', tanggal_selesai: '2026-05-03', upah: '150000',
      }])])).rejects.toThrow(/Periode sampai 2026-05-31 sudah dikunci/);

      await expect(sebagai(owner, 'select public.impor_kas($1::jsonb)', [JSON.stringify([{
        jenis: 'keluar', tanggal: '2026-05-04', akun_kas: '1111',
        keterangan: unik('KAS-'), akun: '5110', jumlah: '10000',
      }])])).rejects.toThrow(/Periode sampai 2026-05-31 sudah dikunci/);
    } finally {
      // Kunci WAJIB dilepas: berkas ini berbagi satu database, dan describe
      // berikutnya akan ikut gagal kalau kunci dibiarkan menyala.
      await sebagai(owner, `select public.atur_kunci_periode(null)`);
    }
  });

  it('kiriman di atas 5000 baris ditolak sebelum apa pun ditulis', async () => {
    const baris = Array.from({ length: 5001 }, (_, i) => ({
      jenis: 'keluar', tanggal: '2026-04-20', akun_kas: '1111',
      keterangan: `Terlalu banyak ${i}`, akun: '5110', jumlah: '1000',
    }));
    await expect(sebagai(owner, 'select public.impor_kas($1::jsonb)', [JSON.stringify(baris)]))
      .rejects.toThrow(/kas\.csv berisi 5001 baris; maksimal 5000 baris per impor/);
  });
});
