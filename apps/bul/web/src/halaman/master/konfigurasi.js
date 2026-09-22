import { formatRupiah, formatTanggal, keTanggalDb } from '../../lib/format.js';

const kosongNull = (v) => (v === undefined || v === '' ? null : v);
const AKTIF = { name: 'aktif', label: 'Aktif', tipe: 'saklar', bawaan: true };
const OPSI_LINI = { tabel: 'lini', label: 'nama', value: 'kode' };
const OPSI_PELANGGAN = { tabel: 'pelanggan', label: 'nama' };
const OPSI_RUTE = { tabel: 'rute', label: 'nama' };
const OPSI_MATERIAL = { tabel: 'material', label: (r) => `${r.lini_kode} · ${r.nama} (${r.satuan})`, order: 'nama' };

export const KONFIG_MASTER = {
  pelanggan: {
    kunci: 'pelanggan', judul: 'Pelanggan', tabel: 'pelanggan', order: { kolom: 'nama' },
    hak: 'pelanggan.simpan', rpc: 'simpan_pelanggan',
    kolom: [
      { title: 'Nama', dataIndex: 'nama' },
      { title: 'NPWP', dataIndex: 'npwp' },
      { title: 'Potong PPh', dataIndex: 'pemotong_pph', render: (v) => (v ? 'Ya' : 'Tidak') },
    ],
    field: [
      { name: 'nama', label: 'Nama', tipe: 'teks', wajib: true },
      { name: 'alamat', label: 'Alamat', tipe: 'teks' },
      { name: 'npwp', label: 'NPWP', tipe: 'teks' },
      { name: 'catatan', label: 'Catatan', tipe: 'teks' },
      { name: 'pemotong_pph', label: 'Pelanggan memotong PPh final', tipe: 'saklar', bawaan: true },
      AKTIF,
    ],
    keArgs: (v, b) => ({
      p_id: b?.id ?? null, p_nama: v.nama, p_alamat: v.alamat ?? '', p_npwp: v.npwp ?? '', p_catatan: v.catatan ?? '',
      p_pemotong_pph: v.pemotong_pph ?? true, p_aktif: v.aktif ?? true,
    }),
  },
  rute: {
    kunci: 'rute', judul: 'Rute', tabel: 'rute', order: { kolom: 'nama' },
    hak: 'master.operasional', rpc: 'simpan_rute',
    kolom: [
      { title: 'Nama', dataIndex: 'nama' },
      { title: 'Asal', dataIndex: 'asal' },
      { title: 'Tujuan', dataIndex: 'tujuan' },
    ],
    field: [
      { name: 'nama', label: 'Nama', tipe: 'teks', wajib: true },
      { name: 'asal', label: 'Asal', tipe: 'teks' },
      { name: 'tujuan', label: 'Tujuan', tipe: 'teks' },
      AKTIF,
    ],
    keArgs: (v, b) => ({ p_id: b?.id ?? null, p_nama: v.nama, p_asal: v.asal ?? '', p_tujuan: v.tujuan ?? '', p_aktif: v.aktif ?? true }),
  },
  'uang-jalan': {
    kunci: 'uang-jalan', judul: 'Uang Jalan Rute', tabel: 'uang_jalan_rute',
    select: '*, rute(nama)', order: { kolom: 'berlaku_mulai', naik: false },
    hak: 'master.operasional', rpc: 'simpan_uang_jalan_rute', bolehUbah: false,
    kolom: [
      { title: 'Rute', dataIndex: ['rute', 'nama'] },
      { title: 'Berlaku mulai', dataIndex: 'berlaku_mulai', render: formatTanggal },
      { title: 'Nominal', dataIndex: 'nominal', align: 'right', render: formatRupiah },
    ],
    field: [
      { name: 'rute_id', label: 'Rute', tipe: 'pilihan', sumber: OPSI_RUTE, wajib: true },
      { name: 'berlaku_mulai', label: 'Berlaku mulai', tipe: 'tanggal', wajib: true, bawaan: 'hari_ini' },
      { name: 'nominal', label: 'Nominal', tipe: 'uang', wajib: true },
    ],
    keArgs: (v) => ({ p_rute_id: v.rute_id, p_berlaku_mulai: keTanggalDb(v.berlaku_mulai), p_nominal: v.nominal }),
  },
  material: {
    kunci: 'material', judul: 'Material', tabel: 'material', order: { kolom: 'nama' },
    hak: 'master.operasional', rpc: 'simpan_material',
    kolom: [
      { title: 'Lini', dataIndex: 'lini_kode' },
      { title: 'Nama', dataIndex: 'nama' },
      { title: 'Satuan', dataIndex: 'satuan' },
    ],
    field: [
      { name: 'lini_kode', label: 'Lini', tipe: 'pilihan', sumber: OPSI_LINI, wajib: true },
      { name: 'nama', label: 'Nama', tipe: 'teks', wajib: true },
      { name: 'satuan', label: 'Satuan (m3, ton, rit, …)', tipe: 'teks', wajib: true },
      AKTIF,
    ],
    keArgs: (v, b) => ({ p_id: b?.id ?? null, p_lini_kode: v.lini_kode, p_nama: v.nama, p_satuan: v.satuan, p_aktif: v.aktif ?? true }),
  },
  truk: {
    kunci: 'truk', judul: 'Truk', tabel: 'truk', order: { kolom: 'nopol' },
    hak: 'master.operasional', rpc: 'simpan_truk',
    kolom: [{ title: 'Nomor polisi', dataIndex: 'nopol' }, { title: 'Jenis', dataIndex: 'jenis' }],
    field: [
      { name: 'nopol', label: 'Nomor polisi', tipe: 'teks', wajib: true },
      { name: 'jenis', label: 'Jenis', tipe: 'teks' },
      AKTIF,
    ],
    keArgs: (v, b) => ({ p_id: b?.id ?? null, p_nopol: v.nopol, p_jenis: v.jenis ?? '', p_aktif: v.aktif ?? true }),
  },
  supir: {
    kunci: 'supir', judul: 'Supir', tabel: 'supir', order: { kolom: 'nama' },
    hak: 'master.operasional', rpc: 'simpan_supir',
    kolom: [{ title: 'Nama', dataIndex: 'nama' }, { title: 'Telepon', dataIndex: 'telepon' }],
    field: [
      { name: 'nama', label: 'Nama', tipe: 'teks', wajib: true },
      { name: 'telepon', label: 'Telepon', tipe: 'teks' },
      AKTIF,
    ],
    keArgs: (v, b) => ({ p_id: b?.id ?? null, p_nama: v.nama, p_telepon: v.telepon ?? '', p_aktif: v.aktif ?? true }),
  },
  tarif: {
    kunci: 'tarif', judul: 'Tarif', tabel: 'tarif',
    select: '*, pelanggan(nama), rute(nama), material(nama, satuan)', order: { kolom: 'berlaku_mulai', naik: false },
    hak: 'tarif.simpan', rpc: 'simpan_tarif', bolehUbah: false,
    kolom: [
      { title: 'Pelanggan', dataIndex: ['pelanggan', 'nama'] },
      { title: 'Rute', dataIndex: ['rute', 'nama'] },
      { title: 'Material', dataIndex: ['material', 'nama'] },
      { title: 'Berlaku mulai', dataIndex: 'berlaku_mulai', render: formatTanggal },
      { title: 'Harga/satuan', dataIndex: 'harga_satuan', align: 'right', render: formatRupiah },
    ],
    field: [
      { name: 'pelanggan_id', label: 'Pelanggan', tipe: 'pilihan', sumber: OPSI_PELANGGAN, wajib: true },
      { name: 'rute_id', label: 'Rute', tipe: 'pilihan', sumber: OPSI_RUTE, wajib: true },
      { name: 'material_id', label: 'Material', tipe: 'pilihan', sumber: OPSI_MATERIAL, wajib: true },
      { name: 'berlaku_mulai', label: 'Berlaku mulai', tipe: 'tanggal', wajib: true, bawaan: 'hari_ini' },
      { name: 'harga_satuan', label: 'Harga per satuan', tipe: 'uang', wajib: true },
    ],
    keArgs: (v) => ({
      p_pelanggan_id: v.pelanggan_id, p_rute_id: v.rute_id, p_material_id: v.material_id,
      p_berlaku_mulai: keTanggalDb(v.berlaku_mulai), p_harga_satuan: v.harga_satuan,
    }),
  },
  'aturan-upah': {
    kunci: 'aturan-upah', judul: 'Aturan Upah Supir', tabel: 'aturan_upah',
    select: '*, rute(nama), material(nama)', order: { kolom: 'berlaku_mulai', naik: false },
    hak: 'tarif.simpan', rpc: 'simpan_aturan_upah',
    kolom: [
      { title: 'Nama', dataIndex: 'nama' },
      { title: 'Rute', dataIndex: ['rute', 'nama'], render: (v) => v ?? 'Semua' },
      { title: 'Material', dataIndex: ['material', 'nama'], render: (v) => v ?? 'Semua' },
      { title: 'Berlaku mulai', dataIndex: 'berlaku_mulai', render: formatTanggal },
      { title: 'Basis', dataIndex: 'basis', render: (v) => (v === 'per_sj' ? 'Per SJ' : 'Per satuan') },
      { title: 'Nominal', dataIndex: 'nominal', align: 'right', render: formatRupiah },
    ],
    field: [
      { name: 'nama', label: 'Nama aturan', tipe: 'teks', wajib: true },
      { name: 'rute_id', label: 'Rute (kosong = semua)', tipe: 'pilihan', sumber: OPSI_RUTE },
      { name: 'material_id', label: 'Material (kosong = semua)', tipe: 'pilihan', sumber: OPSI_MATERIAL },
      { name: 'berlaku_mulai', label: 'Berlaku mulai', tipe: 'tanggal', wajib: true, bawaan: 'hari_ini' },
      { name: 'basis', label: 'Basis', tipe: 'pilihan', wajib: true, bawaan: 'per_sj',
        opsi: [{ value: 'per_sj', label: 'Per SJ (ritase)' }, { value: 'per_satuan', label: 'Per satuan qty bongkar' }] },
      { name: 'nominal', label: 'Nominal', tipe: 'uang', wajib: true },
      AKTIF,
    ],
    keArgs: (v, b) => ({
      p_id: b?.id ?? null, p_nama: v.nama, p_rute_id: kosongNull(v.rute_id), p_material_id: kosongNull(v.material_id),
      p_berlaku_mulai: keTanggalDb(v.berlaku_mulai), p_basis: v.basis, p_nominal: v.nominal, p_aktif: v.aktif ?? true,
    }),
  },
  lini: {
    kunci: 'lini', judul: 'Lini Usaha', tabel: 'lini', order: { kolom: 'kode' },
    hak: 'lini.simpan', rpc: 'simpan_lini',
    kolom: [{ title: 'Kode', dataIndex: 'kode' }, { title: 'Nama', dataIndex: 'nama' }],
    field: [
      { name: 'kode', label: 'Kode (2–5 huruf)', tipe: 'teks', wajib: true, hanyaBaru: true },
      { name: 'nama', label: 'Nama', tipe: 'teks', wajib: true },
      AKTIF,
    ],
    keArgs: (v, b) => ({ p_kode: b?.kode ?? v.kode, p_nama: v.nama, p_aktif: v.aktif ?? true }),
  },
};
