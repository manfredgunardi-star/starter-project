import { formatRupiah, formatTanggal } from '../../lib/format.js';

const uang = (title, dataIndex) => ({ title, dataIndex, align: 'right', angka: true, render: formatRupiah });

export const LAPORAN = {
  neraca: {
    judul: 'Neraca', fungsi: 'laporan_neraca', param: ['per'],
    args: (p) => ({ p_per: p.per }),
    kolom: [{ title: 'Bagian', dataIndex: 'bagian' }, { title: 'Kode', dataIndex: 'kode' }, { title: 'Nama', dataIndex: 'nama' }, uang('Saldo', 'saldo')],
    total: [{ label: 'Total aset', kolom: 'saldo', filter: (r) => r.bagian === 'aset' },
      { label: 'Total kewajiban + ekuitas', kolom: 'saldo', filter: (r) => r.bagian !== 'aset' }],
  },
  'laba-rugi': {
    judul: 'Laba Rugi', fungsi: 'laporan_laba_rugi', param: ['periode'],
    args: (p) => ({ p_dari: p.dari, p_sampai: p.sampai }),
    kolom: [{ title: 'Kategori', dataIndex: 'kategori' }, { title: 'Kode', dataIndex: 'kode' }, { title: 'Nama', dataIndex: 'nama' }, uang('Jumlah', 'jumlah')],
    total: [{ label: 'Laba (rugi) bersih', kolom: 'jumlah', tanda: (r) => (['pendapatan', 'pendapatan_lain'].includes(r.kategori) ? 1 : -1) }],
  },
  'laba-dimensi': {
    judul: 'Laba per Dimensi', fungsi: 'laporan_laba_dimensi', param: ['periode', 'dimensi'],
    args: (p) => ({ p_dari: p.dari, p_sampai: p.sampai, p_dimensi: p.dimensi }),
    kolom: [{ title: 'Nama', dataIndex: 'dimensi_nama' }, uang('Pendapatan', 'pendapatan'), uang('Beban', 'beban'), uang('Laba', 'laba')],
  },
  'saldo-akun': {
    judul: 'Saldo Akun (Neraca Saldo)', fungsi: 'laporan_saldo_akun', param: ['periode'],
    args: (p) => ({ p_dari: p.dari, p_sampai: p.sampai }),
    kolom: [{ title: 'Kode', dataIndex: 'kode' }, { title: 'Nama', dataIndex: 'nama' }, uang('Saldo awal', 'saldo_awal'),
      uang('Debit', 'debit'), uang('Kredit', 'kredit'), uang('Saldo akhir', 'saldo_akhir')],
  },
  'umur-piutang': {
    judul: 'Umur Piutang', fungsi: 'laporan_umur_piutang', param: ['per'],
    args: (p) => ({ p_per: p.per }),
    kolom: [{ title: 'Pelanggan', dataIndex: 'pelanggan_nama' }, { title: 'Nomor', dataIndex: 'nomor' },
      { title: 'Tanggal', dataIndex: 'tanggal', render: formatTanggal }, uang('Sisa', 'sisa'),
      { title: 'Umur (hari)', dataIndex: 'umur_hari', align: 'right' }, { title: 'Kelompok', dataIndex: 'kelompok' }],
    total: [{ label: 'Total piutang', kolom: 'sisa' }],
  },
  'hutang-upah': {
    judul: 'Hutang Upah Supir', view: 'v_hutang_upah_supir', param: [],
    args: () => ({}),
    kolom: [{ title: 'Supir', dataIndex: 'supir_nama' }, uang('Saldo hutang', 'saldo')],
    total: [{ label: 'Total', kolom: 'saldo' }],
  },
  omzet: {
    judul: 'Omzet vs Batas PP 55', fungsi: 'laporan_omzet', param: ['tahun'],
    args: (p) => ({ p_tahun: p.tahun }),
    kolom: [{ title: 'Tahun', dataIndex: 'tahun' }, uang('Omzet', 'omzet'), uang('Batas', 'batas_omzet'),
      { title: '% batas', dataIndex: 'persen', align: 'right', angka: true }, { title: 'PP 55 aktif', dataIndex: 'pp55_aktif', render: (v) => (v ? 'Ya' : 'Tidak') }],
  },
};
