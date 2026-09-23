const SEMUA = ['owner', 'keuangan', 'operasional', 'viewer'];

export const HAK = {
  'pengguna.kelola': ['owner'],
  'lini.simpan': ['owner'],
  'master.operasional': ['owner', 'operasional'],
  'pelanggan.simpan': ['owner', 'keuangan', 'operasional'],
  'tarif.simpan': ['owner', 'keuangan'],
  'sj.tulis': ['owner', 'operasional'],
  'invoice.tulis': ['owner', 'keuangan'],
  'pembayaran.tulis': ['owner', 'keuangan'],
  'kas.tulis': ['owner', 'keuangan'],
  'jurnal.manual': ['owner', 'keuangan'],
  'akuntansi.pengaturan': ['owner'],
};

export function boleh(peran, aksi) {
  if (!HAK[aksi]) throw new Error(`Aksi tidak dikenal: ${aksi}`);
  return Boolean(peran) && HAK[aksi].includes(peran);
}

export const MENU = [
  { key: 'beranda', label: 'Beranda', path: '/', lihat: SEMUA },
  { key: 'sj', label: 'Surat Jalan', path: '/sj', lihat: SEMUA },
  { key: 'invoice', label: 'Invoice', path: '/invoice', lihat: SEMUA },
  { key: 'pembayaran', label: 'Pembayaran', path: '/pembayaran', lihat: SEMUA },
  { key: 'kas', label: 'Kas & Bank', path: '/kas', lihat: SEMUA },
  { key: 'master', label: 'Master Data', path: '/master/pelanggan', lihat: SEMUA },
  { key: 'jurnal', label: 'Jurnal', path: '/jurnal', lihat: SEMUA },
  { key: 'buku-besar', label: 'Buku Besar', path: '/buku-besar', lihat: SEMUA },
  { key: 'akun', label: 'Daftar Akun', path: '/akun', lihat: SEMUA },
  { key: 'laporan', label: 'Laporan', path: '/laporan', lihat: SEMUA },
  { key: 'saldo-awal', label: 'Saldo Awal', path: '/saldo-awal', lihat: ['owner', 'keuangan'] },
  { key: 'pengaturan', label: 'Pengaturan', path: '/pengaturan', lihat: ['owner'] },
  { key: 'pengguna', label: 'Pengguna', path: '/pengguna', lihat: ['owner'] },
];

export function menuUntukPeran(peran) {
  if (!peran) return [];
  return MENU.filter((m) => m.lihat.includes(peran));
}
