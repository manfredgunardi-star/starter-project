import { describe, it, expect } from 'vitest';
import { BERKAS, bacaBerkas } from './skema.js';

const csv = (...baris) => `\ufeff${baris.join('\r\n')}\r\n`;

describe('BERKAS', () => {
  it('memuat sebelas berkas dengan kunci yang dikenali RPC impor', () => {
    expect(BERKAS.map((b) => b.berkas)).toEqual([
      'rute.csv', 'material.csv', 'pelanggan.csv', 'truk.csv', 'supir.csv', 'pengurus.csv',
      'uang-jalan.csv', 'tarif.csv', 'aturan-upah.csv', 'surat-jalan.csv', 'kas.csv',
    ]);
    expect(BERKAS.map((b) => b.kunci)).toEqual([
      'rute', 'material', 'pelanggan', 'truk', 'supir', 'pengurus',
      'uang_jalan', 'tarif', 'aturan_upah', 'surat_jalan', 'kas',
    ]);
  });
});

describe('bacaBerkas', () => {
  it('menolak nama berkas yang tidak dikenal', () => {
    const h = bacaBerkas('laporan.csv', csv('a;b', '1;2'));
    expect(h.kunci).toBeNull();
    expect(h.galat).toEqual(['laporan.csv diabaikan — bukan berkas impor']);
  });

  it('menyebut kolom wajib yang hilang', () => {
    const h = bacaBerkas('supir.csv', csv('telepon', '0812'));
    expect(h.galat).toEqual(['supir.csv: 1 kolom wajib tidak ada — nama. Pastikan baris pertama berkas adalah baris judul dari templat dan pemisahnya titik koma.']);
    expect(h.baris).toEqual([]);
  });

  it('mengubah koma desimal menjadi titik dan menolak angka yang tidak terbaca', () => {
    const h = bacaBerkas('uang-jalan.csv', csv(
      'rute;berlaku_mulai;nominal',
      'Bogor-Jakarta;2026-01-01;400000',
      'Bogor-Bekasi;2026-01-01;12500,75',
      'Bogor-Depok;2026-01-01;Rp 1.500.000',
    ));
    expect(h.baris.map((b) => b.nominal)).toEqual(['400000', '12500.75']);
    expect(h.galat).toEqual(['uang-jalan.csv baris 4 kolom E "nominal": "Rp 1.500.000" bukan angka. Contoh yang benar: 10 atau 10,5 — pakai koma untuk desimal, tanpa titik ribuan dan tanpa "Rp"']);
  });

  it('menolak tanggal yang salah bentuk maupun yang tidak ada di kalender', () => {
    const h = bacaBerkas('uang-jalan.csv', csv(
      'rute;berlaku_mulai;nominal',
      'A;31/06/2026;1000',
      'B;2026-06-31;1000',
      'C;2026-06-30;1000',
    ));
    expect(h.baris.map((b) => b.berlaku_mulai)).toEqual(['2026-06-30']);
    expect(h.galat).toEqual([
      'uang-jalan.csv baris 2 kolom D "berlaku_mulai": "31/06/2026" bukan tanggal. Pakai YYYY-MM-DD, contoh 2026-03-01',
      'uang-jalan.csv baris 3 kolom D "berlaku_mulai": "2026-06-31" bukan tanggal. Pakai YYYY-MM-DD, contoh 2026-03-01',
    ]);
  });

  it('menolak nilai di luar pilihan yang sah', () => {
    const h = bacaBerkas('kas.csv', csv(
      'jenis;tanggal;akun_kas;keterangan;akun;jumlah',
      'transfer;2026-04-01;1111;Pindah;5110;1000',
    ));
    expect(h.galat).toEqual(['kas.csv baris 2 kolom B "jenis": "transfer" harus salah satu dari keluar, masuk']);
  });

  it('membaca ya/tidak menjadi boolean dan kosong menjadi null', () => {
    const h = bacaBerkas('pelanggan.csv', csv(
      'nama;pemotong_pph',
      'PT A;ya',
      'PT B;tidak',
      'PT C;',
    ));
    expect(h.baris.map((b) => b.pemotong_pph)).toEqual([true, false, null]);
    expect(h.galat).toEqual([]);
  });

  it('mengumpulkan SELURUH galat, bukan berhenti di yang pertama', () => {
    const h = bacaBerkas('uang-jalan.csv', csv(
      'rute;berlaku_mulai;nominal',
      'A;bukan-tanggal;bukan-angka',
      'B;2026-01-01;juga-bukan',
      ';2026-01-01;1000',
    ));
    expect(h.galat).toHaveLength(4);
    expect(h.galat).toContain('uang-jalan.csv baris 4 kolom A "rute": wajib diisi');
  });

  it('membaca surat-jalan.csv lengkap dan menyimpan angka sebagai string', () => {
    const h = bacaBerkas('surat-jalan.csv', csv(
      'lini;nomor;tanggal;pelanggan;rute;material;nopol;supir;qty_muat;uang_jalan;qty_bongkar;tanggal_selesai;upah',
      'SJP;SJ-001;2026-03-02;PT A;Bogor-Jakarta;Pasir;B 1234 XY;Budi;10;400000;9,5;2026-03-03;175000',
    ));
    expect(h.galat).toEqual([]);
    expect(h.kunci).toBe('surat_jalan');
    expect(h.baris[0]).toMatchObject({
      lini: 'SJP', nomor: 'SJ-001', qty_muat: '10', uang_jalan: '400000',
      qty_bongkar: '9.5', tanggal_selesai: '2026-03-03', upah: '175000',
    });
  });

  it('menolak qty_bongkar tanpa tanggal_selesai, dan tidak menyebut tanggal rusak sebagai kosong', () => {
    const kolom = 'lini;nomor;tanggal;pelanggan;rute;material;nopol;supir;qty_muat;uang_jalan;qty_bongkar;tanggal_selesai';
    const sj = (qty, selesai) => `SJP;SJ-1;2026-03-01;PT A;Bogor-Jakarta;Pasir;B 1;Budi;10;400000;${qty};${selesai}`;

    // Tanpa tanggal selesai, impor_surat_jalan tidak pernah memanggil selesaikan_sj,
    // jadi qty_bongkar yang user tulis terbuang tanpa jejak. Itulah yang ditolak di sini.
    const kosong = bacaBerkas('surat-jalan.csv', csv(kolom, sj('9,5', '')));
    expect(kosong.baris).toEqual([]);
    expect(kosong.galat).toEqual([
      'surat-jalan.csv baris 2 (SJ-1) kolom N "qty_bongkar": diisi tetapi O "tanggal_selesai" kosong, jadi qty_bongkar akan terbuang',
    ]);

    // Penjaga membaca sel MENTAH. Kalau ia membaca hasil konversi, tanggal yang salah bentuk
    // muncul sebagai '' dan user diberi DUA galat untuk satu kesalahan, satu di antaranya bohong.
    const rusak = bacaBerkas('surat-jalan.csv', csv(kolom, sj('9,5', '32-13-2026')));
    expect(rusak.galat).toEqual([
      'surat-jalan.csv baris 2 (SJ-1) kolom O "tanggal_selesai": "32-13-2026" bukan tanggal. Pakai YYYY-MM-DD, contoh 2026-03-01',
    ]);

    // qty_bongkar kosong tanpa tanggal selesai adalah SJ yang memang belum selesai, bukan galat.
    const belum = bacaBerkas('surat-jalan.csv', csv(kolom, sj('', '')));
    expect(belum.galat).toEqual([]);
    expect(belum.baris).toHaveLength(1);
  });
});

import { templatCsv, namaTakDikenal, ringkasan, peringatanImpor } from './skema.js';
import { dariCsv } from '../../lib/csv.js';

describe('templatCsv', () => {
  it('menghasilkan sebelas berkas berisi baris judul saja', () => {
    const t = templatCsv();
    expect(t).toHaveLength(11);
    const sj = t.find((x) => x.berkas === 'surat-jalan.csv');
    expect(sj.teks.startsWith('\ufefflini;nomor;tanggal;pelanggan;rute;')).toBe(true);
    expect(dariCsv(sj.teks)).toEqual([]);
  });
});

describe('namaTakDikenal', () => {
  const master = {
    pelanggan: ['PT Lama'], rute: ['Rute Lama'], truk: ['B 1 AA'], supir: ['Budi'],
    pengurus: [], material: ['SJP|Pasir'], lini: ['SJP', 'SJT', 'SJS'], tipe_rute: [], akun: ['1111', '5110'],
  };

  it('menerima nama yang akan dibuat oleh berkas master dalam kiriman yang sama', () => {
    const kiriman = {
      pelanggan: [{ nama: 'PT Baru' }],
      rute: [{ nama: 'Rute Baru', asal: '', tujuan: '' }],
      surat_jalan: [{
        lini: 'SJP', nomor: 'SJ-1', pelanggan: 'PT Baru', rute: 'Rute Baru',
        material: 'Pasir', nopol: 'B 1 AA', supir: 'Budi', pengurus: '',
      }],
    };
    expect(namaTakDikenal(kiriman, master)).toEqual([]);
  });

  it('melaporkan SEMUA nama yang tidak dikenal sekaligus, dengan nomor baris', () => {
    const kiriman = {
      surat_jalan: [
        { lini: 'SJP', nomor: 'SJ-1', pelanggan: 'PT Hantu', rute: 'Rute Lama', material: 'Pasir', nopol: 'B 1 AA', supir: 'Budi' },
        { lini: 'SJP', nomor: 'SJ-2', pelanggan: 'PT Lama', rute: 'Rute Lama', material: 'Pasir', nopol: 'B 1 AA', supir: 'Sukirman' },
      ],
      kas: [{ jenis: 'keluar', akun_kas: '1111', akun: '9999', supir: '', nopol: '', pengurus: '' }],
      // Lini salah ketik di berkas master sendiri. Tanpa pemeriksaan ini, satu-satunya galat
      // yang muncul adalah tudingan ke tarif.csv atau surat-jalan.csv pada kolom material yang
      // ejaannya justru benar, sehingga user dikirim ke berkas, baris, dan kolom yang keliru.
      material: [{ lini: 'SJX', nama: 'Batu', satuan: 'm3' }],
    };
    expect(namaTakDikenal(kiriman, master)).toEqual([
      'material.csv baris 1 kolom A "lini": "SJX" belum ada di master. Tambahkan lewat lini.csv pada kiriman yang sama, atau lewat layar masternya',
      'surat-jalan.csv baris 1 (SJ-1) kolom D "pelanggan": "PT Hantu" belum ada di master. Tambahkan lewat pelanggan.csv pada kiriman yang sama, atau lewat layar masternya',
      'surat-jalan.csv baris 2 (SJ-2) kolom J "supir": "Sukirman" belum ada di master. Tambahkan lewat supir.csv pada kiriman yang sama, atau lewat layar masternya',
      'kas.csv baris 1 kolom F "akun": "9999" belum ada di master. Tambahkan lewat layar Akun pada kiriman yang sama, atau lewat layar masternya',
    ]);
  });

  it('mencocokkan material per lini, bukan hanya namanya', () => {
    const kiriman = {
      surat_jalan: [{ lini: 'SJT', nomor: 'SJ-1', pelanggan: 'PT Lama', rute: 'Rute Lama', material: 'Pasir', nopol: 'B 1 AA', supir: 'Budi' }],
    };
    expect(namaTakDikenal(kiriman, master)).toEqual(['surat-jalan.csv baris 1 (SJ-1) kolom H "material": "Pasir" belum ada untuk lini "SJT". Material dicocokkan per lini, jadi nama yang sama di lini berbeda dianggap material berbeda']);
  });
});

describe('ringkasan', () => {
  it('menjumlahkan uang jalan, upah, dan kas tanpa float', () => {
    const r = ringkasan({
      pelanggan: [{ nama: 'A' }, { nama: 'B' }],
      surat_jalan: [
        { uang_jalan: '400000', upah: '150000.55' },
        { uang_jalan: '400000', upah: '' },
      ],
      kas: [
        { jenis: 'keluar', jumlah: '300000' },
        { jenis: 'keluar', jumlah: '0.45' },
        { jenis: 'masuk', jumlah: '50000' },
      ],
    });
    expect(r.jumlah).toEqual({ pelanggan: 2, surat_jalan: 2, kas: 3 });
    expect(r.uangJalan).toBe('800000.00');
    expect(r.upah).toBe('150000.55');
    expect(r.kasKeluar).toBe('300000.45');
    expect(r.kasMasuk).toBe('50000.00');
  });
});

describe('peringatanImpor', () => {
  const master = { tipeRuteBerkomisi: ['Dalam Kota'], ruteTanpaTipe: ['Rute Lama'] };

  it('menghitung rute di berkas yang tipe rutenya kosong', () => {
    expect(peringatanImpor({
      rute: [
        { nama: 'Rute A', tipe_rute: 'Dalam Kota' },
        { nama: 'Rute B', tipe_rute: '' },
        { nama: 'Rute C', tipe_rute: '  ' },
      ],
    }, master)).toEqual([
      '2 rute di rute.csv tidak punya tipe rute, jadi surat jalan pada rute itu tidak akan menghasilkan komisi pengurus: Rute B, Rute C',
    ]);
  });

  it('menghitung tipe rute yang belum punya aturan komisi aktif', () => {
    expect(peringatanImpor({
      rute: [{ nama: 'Rute A', tipe_rute: 'Luar Kota' }],
    }, master)).toEqual([
      '1 tipe rute belum punya aturan komisi yang aktif, jadi komisinya nol: Luar Kota',
    ]);
  });

  it('menghitung SJ yang memakai rute lama tanpa tipe rute', () => {
    expect(peringatanImpor({
      surat_jalan: [
        { nomor: 'SJ-1', rute: 'Rute Lama', pengurus: 'Andi' },
        { nomor: 'SJ-2', rute: 'Rute Lama', pengurus: 'Andi' },
        { nomor: 'SJ-3', rute: 'Rute A', pengurus: 'Andi' },
      ],
    }, master)).toEqual([
      '2 surat jalan memakai rute lama yang tipe rutenya masih kosong, jadi tidak akan menghasilkan komisi pengurus',
    ]);
  });

  it('diam kalau rute lama diberi tipe di kiriman yang sama', () => {
    expect(peringatanImpor({
      rute: [{ nama: 'Rute Lama', tipe_rute: 'Dalam Kota' }],
      surat_jalan: [{ nomor: 'SJ-1', rute: 'Rute Lama', pengurus: 'Andi' }],
    }, master)).toEqual([]);
  });

  // Diverifikasi ke database: upah kosong membuat selesaikan_sj menghitung dari
  // aturan_upah yang berlaku SEKARANG, bukan memakai angka kwitansi lama.
  it('menghitung SJ selesai yang upahnya dikosongkan', () => {
    expect(peringatanImpor({
      rute: [{ nama: 'Rute A', tipe_rute: 'Dalam Kota' }],
      surat_jalan: [
        { nomor: 'SJ-1', rute: 'Rute A', pengurus: 'Andi', tanggal_selesai: '2026-03-02', upah: '150000' },
        { nomor: 'SJ-2', rute: 'Rute A', pengurus: 'Andi', tanggal_selesai: '2026-03-03', upah: '' },
        { nomor: 'SJ-3', rute: 'Rute A', pengurus: 'Andi', tanggal_selesai: '', upah: '' },
      ],
    }, master)).toEqual([
      '1 surat jalan sudah selesai tetapi upahnya kosong, jadi upahnya dihitung dari aturan upah yang berlaku sekarang, bukan dari dokumen lama',
    ]);
  });

  it('menghitung SJ tanpa pengurus', () => {
    expect(peringatanImpor({
      rute: [{ nama: 'Rute A', tipe_rute: 'Dalam Kota' }],
      surat_jalan: [
        { nomor: 'SJ-1', rute: 'Rute A', pengurus: 'Andi', tanggal_selesai: '2026-03-02', upah: '150000' },
        { nomor: 'SJ-2', rute: 'Rute A', pengurus: '', tanggal_selesai: '2026-03-03', upah: '150000' },
      ],
    }, master)).toEqual([
      '1 surat jalan tidak menyebut pengurus, jadi tidak akan menghasilkan komisi pengurus',
    ]);
  });
});

describe('pesan galat surat jalan', () => {
  const def = BERKAS.find((b) => b.berkas === 'surat-jalan.csv');
  const J = def.kolom.map((k) => k.nama).join(';');
  const isi = (o = {}) => def.kolom.map((k) => o[k.nama] ?? ({
    lini: 'SJP', nomor: 'SJ-001', tanggal: '2026-03-01', pelanggan: 'PT A', rute: 'R1',
    rute_asal: 'Bogor', rute_tujuan: 'Jakarta', material: 'Pasir', nopol: 'B 1 AA',
    supir: 'Budi', pengurus: 'Andi', qty_muat: '10', uang_jalan: '400000',
  }[k.nama] ?? '')).join(';');

  it('menunjuk baris berkas, bukan urutan sesudah baris kosong dibuang', () => {
    // SJ-002 ada di baris 4 berkas. Sebelum perbaikan ini pesannya menyebut "baris 2",
    // yang isinya justru SJ-001 yang tidak bermasalah.
    const h = bacaBerkas('surat-jalan.csv', csv(J, isi({ nomor: 'SJ-001' }), '', isi({ nomor: 'SJ-002', qty_muat: 'xx' })));
    expect(h.galat).toHaveLength(1);
    expect(h.galat[0]).toContain('baris 4 (SJ-002)');
    expect(h.galat[0]).not.toContain('baris 2');
  });

  it('menyebut huruf kolom sebagaimana terlihat di Excel', () => {
    // 17 kolom, A sampai Q. qty_muat kolom ke-12 = L, tanggal ke-3 = C.
    const h = bacaBerkas('surat-jalan.csv', csv(J, isi({ nomor: 'SJ-007', qty_muat: 'xx', tanggal: '01/03/2026' })));
    expect(h.galat).toEqual([
      'surat-jalan.csv baris 2 (SJ-007) kolom C "tanggal": "01/03/2026" bukan tanggal. Pakai YYYY-MM-DD, contoh 2026-03-01',
      'surat-jalan.csv baris 2 (SJ-007) kolom L "qty_muat": "xx" bukan angka. Contoh yang benar: 10 atau 10,5 — pakai koma untuk desimal, tanpa titik ribuan dan tanpa "Rp"',
    ]);
  });

  it('kolom wajib yang hilang menjadi satu pesan, bukan delapan', () => {
    const h = bacaBerkas('surat-jalan.csv', csv('nomor;tanggal', 'SJ-1;2026-03-01'));
    expect(h.galat).toHaveLength(1);
    expect(h.galat[0]).toContain('8 kolom wajib tidak ada');
    expect(h.galat[0]).toContain('baris pertama berkas adalah baris judul');
  });

  it('baris yang lolos membawa nomor barisnya untuk pemeriksaan berikutnya', () => {
    const h = bacaBerkas('surat-jalan.csv', csv(J, '', isi({ nomor: 'SJ-005' })));
    expect(h.baris[0].__baris).toBe(3);
  });

  it('namaTakDikenal memakai nomor baris dan huruf kolom yang sama', () => {
    const master = { pelanggan: [], rute: ['R1'], truk: ['B 1 AA'], supir: ['Budi'],
      pengurus: ['Andi'], material: ['SJP|Pasir'], lini: ['SJP'], tipe_rute: [], akun: [] };
    const baris = { lini: 'SJP', nomor: 'SJ-009', pelanggan: 'PT B', rute: 'R1', rute_asal: 'Bogor',
      rute_tujuan: 'Jakarta', material: 'Pasir', nopol: 'B 1 AA', supir: 'Budi', pengurus: 'Andi', __baris: 7 };
    expect(namaTakDikenal({ surat_jalan: [baris] }, master)[0])
      .toContain('surat-jalan.csv baris 7 (SJ-009) kolom D "pelanggan": "PT B" belum ada di master');
  });
});
