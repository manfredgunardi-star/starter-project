// Sumber tunggal daftar akun kas/bank.
// Sebelumnya di-hardcode terpisah di PenjualanPage, BiayaPage, dan AsetPage.
// Isi disalin persis dari PenjualanPage.jsx:155 agar tidak ada perubahan perilaku.

export const KAS_ACCOUNTS = [
  { code: '1111', name: 'Kas Kecil',                type: 'kas'  },
  { code: '1112', name: 'Bank BCA Operasional',     type: 'bank' },
  { code: '1113', name: 'Bank Mandiri Operasional', type: 'bank' },
]

// Nama pendek untuk tampilan riwayat pembayaran.
// Disalin persis dari konstanta KAS_NAMES di PenjualanPage.jsx:17.
export const KAS_SHORT_NAMES = {
  '1111': 'Kas Kecil',
  '1112': 'Bank BCA',
  '1113': 'Bank Mandiri',
}

export const getKasAccountName = (code) => KAS_SHORT_NAMES[code] || code

// Menggantikan dua ekspresi lama yang hasilnya identik untuk ketiga kode di atas:
//   PenjualanPage.jsx:187  account.startsWith('1111') ? 'kas' : 'bank'
//   BiayaPage.jsx:157      account === '1111' ? 'kas' : 'bank'
// Kode tak dikenal jatuh ke 'bank', sama seperti kedua ekspresi lama.
export const getJournalType = (code) =>
  KAS_ACCOUNTS.find(a => a.code === code)?.type || 'bank'
