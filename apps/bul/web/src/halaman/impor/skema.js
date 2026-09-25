import { dariCsv, keCsv } from '../../lib/csv.js';
import { dariSen, jumlahkan } from '../../lib/uang.js';

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

export function templatCsv() {
  return BERKAS.map((b) => ({
    berkas: b.berkas,
    teks: keCsv(b.kolom.map((k) => ({ title: k.nama, dataIndex: k.nama })), []),
  }));
}

// Kolom -> jenis master yang dirujuknya. Material ditangani khusus karena kuncinya
// gabungan (lini, nama).
const RUJUKAN = {
  rute: { tipe_rute: 'tipe_rute' },
  uang_jalan: { rute: 'rute' },
  tarif: { pelanggan: 'pelanggan', rute: 'rute', lini: 'lini' },
  aturan_upah: { rute: 'rute', lini: 'lini' },
  surat_jalan: { pelanggan: 'pelanggan', rute: 'rute', nopol: 'truk', supir: 'supir', pengurus: 'pengurus', lini: 'lini' },
  kas: { akun_kas: 'akun', akun: 'akun', nopol: 'truk', supir: 'supir', pengurus: 'pengurus', lini: 'lini' },
};
const PUNYA_MATERIAL = ['tarif', 'aturan_upah', 'surat_jalan'];
const BERKAS_DARI_KUNCI = Object.fromEntries(BERKAS.map((b) => [b.kunci, b.berkas]));

export function namaTakDikenal(kiriman, master) {
  // Yang sudah ada di database, ditambah yang akan dibuat oleh kiriman ini sendiri.
  const ada = {};
  for (const [jenis, daftar] of Object.entries(master)) ada[jenis] = new Set(daftar);
  for (const [kunci, kolomNama] of [['pelanggan', 'nama'], ['rute', 'nama'], ['supir', 'nama'], ['pengurus', 'nama']]) {
    for (const b of kiriman[kunci] ?? []) ada[kunci].add(b[kolomNama]);
  }
  for (const b of kiriman.truk ?? []) ada.truk.add(b.nopol);
  for (const b of kiriman.material ?? []) ada.material.add(`${b.lini}|${b.nama}`);

  const galat = [];
  for (const [kunci, kolom] of Object.entries(RUJUKAN)) {
    (kiriman[kunci] ?? []).forEach((b, i) => {
      for (const [nama, jenis] of Object.entries(kolom)) {
        const v = (b[nama] ?? '').trim();
        if (v && !ada[jenis].has(v)) {
          galat.push(`${BERKAS_DARI_KUNCI[kunci]} baris ${i + 1}: ${nama} "${v}" belum ada`);
        }
      }
      if (PUNYA_MATERIAL.includes(kunci)) {
        const m = (b.material ?? '').trim();
        if (m && !ada.material.has(`${(b.lini ?? '').trim()}|${m}`)) {
          galat.push(`${BERKAS_DARI_KUNCI[kunci]} baris ${i + 1}: material "${m}" belum ada`);
        }
      }
    });
  }
  return galat;
}

export function ringkasan(kiriman) {
  const jumlah = {};
  for (const [kunci, baris] of Object.entries(kiriman)) if (baris?.length) jumlah[kunci] = baris.length;
  const sj = kiriman.surat_jalan ?? [];
  const kas = kiriman.kas ?? [];
  const jml = (list) => dariSen(jumlahkan(list.filter((v) => v !== '' && v != null)));
  return {
    jumlah,
    uangJalan: jml(sj.map((b) => b.uang_jalan)),
    upah: jml(sj.map((b) => b.upah)),
    kasKeluar: jml(kas.filter((b) => b.jenis === 'keluar').map((b) => b.jumlah)),
    kasMasuk: jml(kas.filter((b) => b.jenis === 'masuk').map((b) => b.jumlah)),
  };
}

// Kumpulan hal yang membuat impor TETAP SUKSES tetapi menyimpang dari kebenaran historis
// tanpa meninggalkan jejak. Semuanya sudah diverifikasi langsung ke database, bukan dugaan:
//  - komisi tidak punya penimpa per baris di selesaikan_sj, jadi ia selalu dihitung ulang
//    dari aturan_komisi; tanpa tipe rute atau tanpa aturan, jurnalnya tidak ada sama sekali;
//  - upah yang dikosongkan membuat selesaikan_sj memakai aturan upah yang berlaku SEKARANG;
//  - SJ tanpa pengurus tidak menghasilkan baris komisi.
// Tak satu pun memunculkan galat, dan tak satu pun terlihat dari laporan, karena yang salah
// bukan angkanya melainkan ketiadaannya.
export function peringatanImpor(kiriman, master) {
  const pesan = [];
  const tipeBaru = new Map();
  for (const b of kiriman.rute ?? []) tipeBaru.set((b.nama ?? '').trim(), (b.tipe_rute ?? '').trim());

  const kosong = [...tipeBaru].filter(([, t]) => !t).map(([n]) => n);
  if (kosong.length) {
    pesan.push(`${kosong.length} rute di rute.csv tidak punya tipe rute, jadi surat jalan pada rute itu tidak akan menghasilkan komisi pengurus: ${kosong.join(', ')}`);
  }

  const berkomisi = new Set(master.tipeRuteBerkomisi ?? []);
  const tanpaAturan = [...new Set([...tipeBaru.values()].filter((t) => t && !berkomisi.has(t)))];
  if (tanpaAturan.length) {
    pesan.push(`${tanpaAturan.length} tipe rute belum punya aturan komisi yang aktif, jadi komisinya nol: ${tanpaAturan.join(', ')}`);
  }

  // Rute yang SUDAH ada di master tanpa tipe rute, dan tidak diperbaiki oleh kiriman ini.
  const lamaTanpaTipe = new Set((master.ruteTanpaTipe ?? []).filter((n) => !tipeBaru.get(n)));
  const sjKena = (kiriman.surat_jalan ?? []).filter((b) => lamaTanpaTipe.has((b.rute ?? '').trim())).length;
  if (sjKena) {
    pesan.push(`${sjKena} surat jalan memakai rute lama yang tipe rutenya masih kosong, jadi tidak akan menghasilkan komisi pengurus`);
  }

  const sj = kiriman.surat_jalan ?? [];
  const upahKosong = sj.filter((b) => (b.tanggal_selesai ?? '').trim() && !(b.upah ?? '').trim()).length;
  if (upahKosong) {
    pesan.push(`${upahKosong} surat jalan sudah selesai tetapi upahnya kosong, jadi upahnya dihitung dari aturan upah yang berlaku sekarang, bukan dari dokumen lama`);
  }

  const tanpaPengurus = sj.filter((b) => !(b.pengurus ?? '').trim()).length;
  if (tanpaPengurus) {
    pesan.push(`${tanpaPengurus} surat jalan tidak menyebut pengurus, jadi tidak akan menghasilkan komisi pengurus`);
  }
  return pesan;
}
