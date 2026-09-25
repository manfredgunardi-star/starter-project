import { dariCsv } from '../../lib/csv.js';

const T = (nama, wajib = false) => ({ nama, jenis: 'teks', wajib });
const A = (nama, wajib = false) => ({ nama, jenis: 'angka', wajib });
const D = (nama, wajib = false) => ({ nama, jenis: 'tanggal', wajib });
const B = (nama) => ({ nama, jenis: 'boolean', wajib: false });
const P = (nama, pilihan, wajib = false) => ({ nama, jenis: 'pilihan', pilihan, wajib });

// Rute dirujuk lewat (nama, asal, tujuan) karena rute_nama_key dihapus migrasi
// 20260923000200; asal/tujuan hanya perlu diisi ketika nama rutenya kembar.
const RUTE_RUJUK = [T('rute', true), T('rute_asal'), T('rute_tujuan')];

export const BERKAS = [
  { berkas: 'rute.csv', kunci: 'rute', kolom: [T('nama', true), T('asal'), T('tujuan'), T('tipe_rute')] },
  { berkas: 'material.csv', kunci: 'material', kolom: [T('lini', true), T('nama', true), T('satuan', true), A('standar_bongkar')] },
  { berkas: 'pelanggan.csv', kunci: 'pelanggan', kolom: [T('nama', true), T('alamat'), T('npwp'), B('pemotong_pph'), T('catatan')] },
  { berkas: 'truk.csv', kunci: 'truk', kolom: [T('nopol', true), T('jenis')] },
  { berkas: 'supir.csv', kunci: 'supir', kolom: [T('nama', true), T('telepon')] },
  { berkas: 'pengurus.csv', kunci: 'pengurus', kolom: [T('nama', true), T('telepon')] },
  { berkas: 'uang-jalan.csv', kunci: 'uang_jalan', kolom: [...RUTE_RUJUK, D('berlaku_mulai', true), A('nominal', true)] },
  { berkas: 'tarif.csv', kunci: 'tarif', kolom: [T('pelanggan', true), ...RUTE_RUJUK, T('lini', true), T('material', true), D('berlaku_mulai', true), A('harga_satuan', true)] },
  { berkas: 'aturan-upah.csv', kunci: 'aturan_upah', kolom: [T('nama', true), T('rute'), T('rute_asal'), T('rute_tujuan'), T('lini'), T('material'), D('berlaku_mulai', true), P('basis', ['per_sj', 'per_satuan'], true), A('nominal', true)] },
  { berkas: 'surat-jalan.csv', kunci: 'surat_jalan', kolom: [T('lini', true), T('nomor', true), D('tanggal', true), T('pelanggan', true), ...RUTE_RUJUK, T('material', true), T('nopol', true), T('supir', true), T('pengurus'), A('qty_muat', true), A('uang_jalan', true), A('qty_bongkar'), D('tanggal_selesai'), A('upah'), T('keterangan')] },
  { berkas: 'kas.csv', kunci: 'kas', kolom: [T('ref'), P('jenis', ['keluar', 'masuk'], true), D('tanggal', true), T('akun_kas', true), T('keterangan', true), T('akun', true), A('jumlah', true), T('keterangan_baris'), T('lini'), T('nopol'), T('supir'), T('pengurus')] },
];

function keAngka(v) {
  const s = v.replace(/\s/g, '');
  return /^-?\d+(,\d+)?$/.test(s) ? s.replace(',', '.') : null;
}

function keTanggal(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return null;
  const [, th, bl, tg] = m.map(Number);
  const d = new Date(Date.UTC(th, bl - 1, tg));
  const nyata = d.getUTCFullYear() === th && d.getUTCMonth() === bl - 1 && d.getUTCDate() === tg;
  return nyata ? v : null;
}

const YA = ['ya', 'true', '1', 'y'];
const TIDAK = ['tidak', 'false', '0', 'n'];

export function bacaBerkas(namaBerkas, teks) {
  const def = BERKAS.find((b) => b.berkas.toLowerCase() === String(namaBerkas).toLowerCase());
  if (!def) return { kunci: null, baris: [], galat: [`${namaBerkas} diabaikan — bukan berkas impor`] };

  const mentah = dariCsv(teks);
  const galat = [];
  const judul = new Set(Object.keys(mentah[0] ?? {}));
  for (const k of def.kolom) {
    if (k.wajib && !judul.has(k.nama)) galat.push(`${def.berkas}: kolom "${k.nama}" tidak ada`);
  }
  if (galat.length) return { kunci: def.kunci, baris: [], galat };

  const baris = [];
  mentah.forEach((m, i) => {
    const no = i + 1;
    const keluar = {};
    let rusak = false;
    for (const k of def.kolom) {
      const v = (m[k.nama] ?? '').trim();
      if (v === '') {
        if (k.wajib) { galat.push(`${def.berkas} baris ${no}: ${k.nama} wajib diisi`); rusak = true; }
        keluar[k.nama] = k.jenis === 'boolean' ? null : '';
        continue;
      }
      if (k.jenis === 'angka') {
        const a = keAngka(v);
        if (a === null) { galat.push(`${def.berkas} baris ${no}: ${k.nama} "${v}" bukan angka`); rusak = true; }
        keluar[k.nama] = a ?? '';
      } else if (k.jenis === 'tanggal') {
        const d = keTanggal(v);
        if (d === null) { galat.push(`${def.berkas} baris ${no}: ${k.nama} "${v}" bukan tanggal YYYY-MM-DD`); rusak = true; }
        keluar[k.nama] = d ?? '';
      } else if (k.jenis === 'boolean') {
        const l = v.toLowerCase();
        if (YA.includes(l)) keluar[k.nama] = true;
        else if (TIDAK.includes(l)) keluar[k.nama] = false;
        else { galat.push(`${def.berkas} baris ${no}: ${k.nama} "${v}" harus ya atau tidak`); rusak = true; keluar[k.nama] = null; }
      } else if (k.jenis === 'pilihan' && !k.pilihan.includes(v)) {
        galat.push(`${def.berkas} baris ${no}: ${k.nama} "${v}" harus salah satu dari ${k.pilihan.join(', ')}`);
        rusak = true;
        keluar[k.nama] = v;
      } else {
        keluar[k.nama] = v;
      }
    }
    // qty_bongkar HANYA terpakai ketika tanggal_selesai ada; impor_surat_jalan memanggil
    // selesaikan_sj di dalam cabang itu saja. Tanpa tanggal selesai, angka yang user tulis
    // dibuang diam-diam, jadi lebih baik ditolak di sini daripada hilang tanpa jejak.
    // Sel tanggal dibaca MENTAH, bukan hasil konversinya: tanggal yang salah bentuk
    // juga menjadi '' sesudah dikonversi, dan penjaga ini akan menyebutnya "kosong"
    // padahal user jelas mengisinya.
    if (def.kunci === 'surat_jalan' && keluar.qty_bongkar !== ''
        && (m.tanggal_selesai ?? '').trim() === '') {
      galat.push(`${def.berkas} baris ${no}: qty_bongkar diisi tetapi tanggal_selesai kosong, jadi qty_bongkar akan terbuang`);
      rusak = true;
    }
    if (!rusak) baris.push(keluar);
  });

  return { kunci: def.kunci, baris, galat };
}
