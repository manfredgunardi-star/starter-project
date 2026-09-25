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
    expect(h.galat).toEqual(['supir.csv: kolom "nama" tidak ada']);
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
    expect(h.galat).toEqual(['uang-jalan.csv baris 3: nominal "Rp 1.500.000" bukan angka']);
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
      'uang-jalan.csv baris 1: berlaku_mulai "31/06/2026" bukan tanggal YYYY-MM-DD',
      'uang-jalan.csv baris 2: berlaku_mulai "2026-06-31" bukan tanggal YYYY-MM-DD',
    ]);
  });

  it('menolak nilai di luar pilihan yang sah', () => {
    const h = bacaBerkas('kas.csv', csv(
      'jenis;tanggal;akun_kas;keterangan;akun;jumlah',
      'transfer;2026-04-01;1111;Pindah;5110;1000',
    ));
    expect(h.galat).toEqual(['kas.csv baris 1: jenis "transfer" harus salah satu dari keluar, masuk']);
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
    expect(h.galat).toContain('uang-jalan.csv baris 3: rute wajib diisi');
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
      'surat-jalan.csv baris 1: qty_bongkar diisi tetapi tanggal_selesai kosong, jadi qty_bongkar akan terbuang',
    ]);

    // Penjaga membaca sel MENTAH. Kalau ia membaca hasil konversi, tanggal yang salah bentuk
    // muncul sebagai '' dan user diberi DUA galat untuk satu kesalahan, satu di antaranya bohong.
    const rusak = bacaBerkas('surat-jalan.csv', csv(kolom, sj('9,5', '32-13-2026')));
    expect(rusak.galat).toEqual([
      'surat-jalan.csv baris 1: tanggal_selesai "32-13-2026" bukan tanggal YYYY-MM-DD',
    ]);

    // qty_bongkar kosong tanpa tanggal selesai adalah SJ yang memang belum selesai, bukan galat.
    const belum = bacaBerkas('surat-jalan.csv', csv(kolom, sj('', '')));
    expect(belum.galat).toEqual([]);
  });
});
