// Chart of Accounts - Jasa Pengiriman Pasir & Batu
// Struktur: 1=Aset, 2=Kewajiban, 3=Ekuitas, 4=Pendapatan, 5=HPP, 6=Beban Operasional, 7=Pendapatan Lain, 8=Beban Lain, 9=Penutup

export const COA = [
  { code: "1000", name: "ASET", parent: null, level: 0, type: "header" },
  { code: "1100", name: "Aset Lancar", parent: "1000", level: 1, type: "header" },
  { code: "1110", name: "Kas dan Setara Kas", parent: "1100", level: 2, type: "header" },
  { code: "1111", name: "Kas Kecil", parent: "1110", level: 3, type: "detail", normalBalance: "debit" },
  { code: "1112", name: "Bank BCA Operasional", parent: "1110", level: 3, type: "detail", normalBalance: "debit" },
  { code: "1113", name: "Bank Mandiri Operasional", parent: "1110", level: 3, type: "detail", normalBalance: "debit" },
  { code: "1114", name: "Deposito Berjangka", parent: "1110", level: 3, type: "detail", normalBalance: "debit" },
  { code: "1120", name: "Piutang Usaha", parent: "1100", level: 2, type: "header" },
  { code: "1121", name: "Piutang Pelanggan - Proyek", parent: "1120", level: 3, type: "detail", normalBalance: "debit" },
  { code: "1122", name: "Piutang Tagihan Belum Ditagih", parent: "1120", level: 3, type: "detail", normalBalance: "debit" },
  { code: "1130", name: "Cadangan Kerugian Piutang", parent: "1100", level: 2, type: "detail", normalBalance: "credit" },
  { code: "1140", name: "Persediaan Operasional", parent: "1100", level: 2, type: "header" },
  { code: "1141", name: "Persediaan Solar/BBM", parent: "1140", level: 3, type: "detail", normalBalance: "debit" },
  { code: "1142", name: "Persediaan Oli & Pelumas", parent: "1140", level: 3, type: "detail", normalBalance: "debit" },
  { code: "1143", name: "Persediaan Sparepart", parent: "1140", level: 3, type: "detail", normalBalance: "debit" },
  { code: "1144", name: "Persediaan Ban", parent: "1140", level: 3, type: "detail", normalBalance: "debit" },
  { code: "1150", name: "Uang Muka", parent: "1100", level: 2, type: "header" },
  { code: "1151", name: "Uang Muka Sopir/Uang Jalan", parent: "1150", level: 3, type: "detail", normalBalance: "debit" },
  { code: "1152", name: "Uang Muka Pembelian Sparepart", parent: "1150", level: 3, type: "detail", normalBalance: "debit" },
  { code: "1153", name: "Uang Muka Pembelian BBM", parent: "1150", level: 3, type: "detail", normalBalance: "debit" },
  { code: "1160", name: "Biaya Dibayar di Muka", parent: "1100", level: 2, type: "header" },
  { code: "1161", name: "Sewa Dibayar di Muka", parent: "1160", level: 3, type: "detail", normalBalance: "debit" },
  { code: "1162", name: "Asuransi Dibayar di Muka", parent: "1160", level: 3, type: "detail", normalBalance: "debit" },
  { code: "1163", name: "STNK/KIR/Izin Trayek Dibayar di Muka", parent: "1160", level: 3, type: "detail", normalBalance: "debit" },
  { code: "1170", name: "Pajak Dibayar di Muka", parent: "1100", level: 2, type: "header" },
  { code: "1171", name: "PPN Masukan", parent: "1170", level: 3, type: "detail", normalBalance: "debit" },
  { code: "1172", name: "PPh 23 Dibayar di Muka", parent: "1170", level: 3, type: "detail", normalBalance: "debit" },
  { code: "1173", name: "PPh 25 Dibayar di Muka", parent: "1170", level: 3, type: "detail", normalBalance: "debit" },
  { code: "1180", name: "Aset Lancar Lainnya", parent: "1100", level: 2, type: "header" },
  { code: "1181", name: "Piutang Karyawan", parent: "1180", level: 3, type: "detail", normalBalance: "debit" },
  { code: "1182", name: "Saldo E-Toll / Deposit Tol", parent: "1180", level: 3, type: "detail", normalBalance: "debit" },
  { code: "1200", name: "Aset Tidak Lancar", parent: "1000", level: 1, type: "header" },
  { code: "1210", name: "Aset Tetap", parent: "1200", level: 2, type: "header" },
  { code: "1211", name: "Tanah", parent: "1210", level: 3, type: "detail", normalBalance: "debit" },
  { code: "1212", name: "Bangunan/Gudang", parent: "1210", level: 3, type: "detail", normalBalance: "debit" },
  { code: "1213", name: "Kendaraan Truck", parent: "1210", level: 3, type: "detail", normalBalance: "debit" },
  { code: "1214", name: "Kendaraan Operasional Kantor", parent: "1210", level: 3, type: "detail", normalBalance: "debit" },
  { code: "1215", name: "Alat Bengkel", parent: "1210", level: 3, type: "detail", normalBalance: "debit" },
  { code: "1216", name: "Peralatan Kantor", parent: "1210", level: 3, type: "detail", normalBalance: "debit" },
  { code: "1217", name: "Furnitur & Inventaris", parent: "1210", level: 3, type: "detail", normalBalance: "debit" },
  { code: "1218", name: "Komputer & Printer", parent: "1210", level: 3, type: "detail", normalBalance: "debit" },
  { code: "1219", name: "GPS/Tracker Armada", parent: "1210", level: 3, type: "detail", normalBalance: "debit" },
  { code: "1220", name: "Akumulasi Penyusutan", parent: "1200", level: 2, type: "header" },
  { code: "1221", name: "Akumulasi Penyusutan Bangunan/Gudang", parent: "1220", level: 3, type: "detail", normalBalance: "credit" },
  { code: "1222", name: "Akumulasi Penyusutan Kendaraan Truck", parent: "1220", level: 3, type: "detail", normalBalance: "credit" },
  { code: "1223", name: "Akumulasi Penyusutan Kendaraan Operasional", parent: "1220", level: 3, type: "detail", normalBalance: "credit" },
  { code: "1224", name: "Akumulasi Penyusutan Alat Bengkel", parent: "1220", level: 3, type: "detail", normalBalance: "credit" },
  { code: "1225", name: "Akumulasi Penyusutan Peralatan Kantor", parent: "1220", level: 3, type: "detail", normalBalance: "credit" },
  { code: "1226", name: "Akumulasi Penyusutan Furnitur & Inventaris", parent: "1220", level: 3, type: "detail", normalBalance: "credit" },
  { code: "1227", name: "Akumulasi Penyusutan Komputer & Printer", parent: "1220", level: 3, type: "detail", normalBalance: "credit" },
  { code: "1228", name: "Akumulasi Penyusutan GPS/Tracker Armada", parent: "1220", level: 3, type: "detail", normalBalance: "credit" },
  { code: "1240", name: "Aset Lain-lain", parent: "1200", level: 2, type: "header" },
  { code: "1241", name: "Uang Jaminan", parent: "1240", level: 3, type: "detail", normalBalance: "debit" },
  { code: "1242", name: "Deposit Sewa", parent: "1240", level: 3, type: "detail", normalBalance: "debit" },
  { code: "2000", name: "KEWAJIBAN", parent: null, level: 0, type: "header" },
  { code: "2100", name: "Kewajiban Lancar", parent: "2000", level: 1, type: "header" },
  { code: "2110", name: "Hutang Usaha", parent: "2100", level: 2, type: "header" },
  { code: "2111", name: "Hutang Supplier BBM", parent: "2110", level: 3, type: "detail", normalBalance: "credit" },
  { code: "2112", name: "Hutang Supplier Sparepart", parent: "2110", level: 3, type: "detail", normalBalance: "credit" },
  { code: "2113", name: "Hutang Bengkel/Servis", parent: "2110", level: 3, type: "detail", normalBalance: "credit" },
  { code: "2114", name: "Hutang Vendor Lainnya", parent: "2110", level: 3, type: "detail", normalBalance: "credit" },
  { code: "2120", name: "Hutang Operasional", parent: "2100", level: 2, type: "header" },
  { code: "2121", name: "Hutang Gaji dan Upah", parent: "2120", level: 3, type: "detail", normalBalance: "credit" },
  { code: "2122", name: "Hutang Uang Jalan Sopir", parent: "2120", level: 3, type: "detail", normalBalance: "credit" },
  { code: "2123", name: "Hutang Tol/Parkir/Retribusi", parent: "2120", level: 3, type: "detail", normalBalance: "credit" },
  { code: "2124", name: "Biaya Masih Harus Dibayar", parent: "2120", level: 3, type: "detail", normalBalance: "credit" },
  { code: "2130", name: "Hutang Pajak", parent: "2100", level: 2, type: "header" },
  { code: "2131", name: "Hutang PPh 21", parent: "2130", level: 3, type: "detail", normalBalance: "credit" },
  { code: "2132", name: "Hutang PPh 23", parent: "2130", level: 3, type: "detail", normalBalance: "credit" },
  { code: "2133", name: "Hutang PPh 29", parent: "2130", level: 3, type: "detail", normalBalance: "credit" },
  { code: "2134", name: "Hutang PPN Keluaran", parent: "2130", level: 3, type: "detail", normalBalance: "credit" },
  { code: "2135", name: "Hutang Pajak Kendaraan", parent: "2130", level: 3, type: "detail", normalBalance: "credit" },
  { code: "2140", name: "Pendapatan Diterima di Muka", parent: "2100", level: 2, type: "header" },
  { code: "2141", name: "Uang Muka Pelanggan", parent: "2140", level: 3, type: "detail", normalBalance: "credit" },
  { code: "2150", name: "Hutang Jangka Pendek Lainnya", parent: "2100", level: 2, type: "header" },
  { code: "2151", name: "Hutang Leasing Jatuh Tempo < 1 Tahun", parent: "2150", level: 3, type: "detail", normalBalance: "credit" },
  { code: "2152", name: "Hutang Bank Jangka Pendek", parent: "2150", level: 3, type: "detail", normalBalance: "credit" },
  { code: "2153", name: "Hutang Pemegang Saham", parent: "2150", level: 3, type: "detail", normalBalance: "credit" },
  { code: "2200", name: "Kewajiban Jangka Panjang", parent: "2000", level: 1, type: "header" },
  { code: "2210", name: "Hutang Bank Jangka Panjang", parent: "2200", level: 2, type: "detail", normalBalance: "credit" },
  { code: "2220", name: "Hutang Leasing Kendaraan > 1 Tahun", parent: "2200", level: 2, type: "detail", normalBalance: "credit" },
  { code: "2230", name: "Liabilitas Imbalan Kerja", parent: "2200", level: 2, type: "detail", normalBalance: "credit" },
  { code: "2240", name: "Kewajiban Jangka Panjang Lainnya", parent: "2200", level: 2, type: "detail", normalBalance: "credit" },
  { code: "3000", name: "EKUITAS", parent: null, level: 0, type: "header" },
  { code: "3100", name: "Modal", parent: "3000", level: 1, type: "header" },
  { code: "3110", name: "Modal Disetor", parent: "3100", level: 2, type: "detail", normalBalance: "credit" },
  { code: "3120", name: "Tambahan Modal Disetor", parent: "3100", level: 2, type: "detail", normalBalance: "credit" },
  { code: "3200", name: "Saldo Laba", parent: "3000", level: 1, type: "header" },
  { code: "3210", name: "Saldo Laba Ditahan", parent: "3200", level: 2, type: "detail", normalBalance: "credit" },
  { code: "3220", name: "Laba/Rugi Tahun Berjalan", parent: "3200", level: 2, type: "detail", normalBalance: "credit" },
  { code: "3230", name: "Prive Pemilik", parent: "3000", level: 1, type: "detail", normalBalance: "debit" },
  { code: "4000", name: "PENDAPATAN", parent: null, level: 0, type: "header" },
  { code: "4100", name: "Pendapatan Usaha", parent: "4000", level: 1, type: "detail", normalBalance: "credit" },
  { code: "4200", name: "Potongan & Penyesuaian Pendapatan", parent: "4000", level: 1, type: "header" },
  { code: "4210", name: "Potongan Penjualan Jasa", parent: "4200", level: 2, type: "detail", normalBalance: "debit" },
  { code: "5000", name: "BEBAN POKOK PENDAPATAN", parent: null, level: 0, type: "header" },
  { code: "5100", name: "Beban Langsung Armada", parent: "5000", level: 1, type: "header" },
  { code: "5110", name: "BBM Armada", parent: "5100", level: 2, type: "detail", normalBalance: "debit" },
  { code: "5120", name: "Oli & Pelumas Armada", parent: "5100", level: 2, type: "detail", normalBalance: "debit" },
  { code: "5130", name: "Upah Sopir", parent: "5100", level: 2, type: "detail", normalBalance: "debit" },
  { code: "5140", name: "Upah Kernet/Helper", parent: "5100", level: 2, type: "detail", normalBalance: "debit" },
  { code: "5150", name: "Uang Jalan, Makan & Penginapan Sopir", parent: "5100", level: 2, type: "detail", normalBalance: "debit" },
  { code: "5160", name: "Tol, Parkir & Retribusi Jalan", parent: "5100", level: 2, type: "detail", normalBalance: "debit" },
  { code: "5170", name: "Jasa Bongkar Muat/Loader", parent: "5100", level: 2, type: "detail", normalBalance: "debit" },
  { code: "5180", name: "Komisi Ritase/Dispatcher", parent: "5100", level: 2, type: "detail", normalBalance: "debit" },
  { code: "5190", name: "Sewa Truck Pihak Ketiga", parent: "5100", level: 2, type: "detail", normalBalance: "debit" },
  { code: "5200", name: "Perawatan Armada", parent: "5000", level: 1, type: "header" },
  { code: "5210", name: "Servis & Perbaikan Berkala", parent: "5200", level: 2, type: "detail", normalBalance: "debit" },
  { code: "5220", name: "Sparepart Armada", parent: "5200", level: 2, type: "detail", normalBalance: "debit" },
  { code: "5230", name: "Ban & Vulkanisir", parent: "5200", level: 2, type: "detail", normalBalance: "debit" },
  { code: "5240", name: "Cuci, Grease & Aksesoris Kecil", parent: "5200", level: 2, type: "detail", normalBalance: "debit" },
  { code: "5250", name: "STNK, KIR & Izin Trayek", parent: "5200", level: 2, type: "detail", normalBalance: "debit" },
  { code: "5260", name: "Asuransi Armada", parent: "5200", level: 2, type: "detail", normalBalance: "debit" },
  { code: "5270", name: "Penyusutan Truck", parent: "5200", level: 2, type: "detail", normalBalance: "debit" },
  { code: "5280", name: "Klaim/Kerusakan Muatan", parent: "5200", level: 2, type: "detail", normalBalance: "debit" },
  { code: "6000", name: "BEBAN USAHA / OPERASIONAL", parent: null, level: 0, type: "header" },
  { code: "6100", name: "Beban Umum & Administrasi", parent: "6000", level: 1, type: "header" },
  { code: "6110", name: "Gaji Staf Kantor", parent: "6100", level: 2, type: "detail", normalBalance: "debit" },
  { code: "6120", name: "Tunjangan & Lembur Staf", parent: "6100", level: 2, type: "detail", normalBalance: "debit" },
  { code: "6130", name: "BPJS Tenaga Kerja & Kesehatan", parent: "6100", level: 2, type: "detail", normalBalance: "debit" },
  { code: "6140", name: "ATK & Cetakan Surat Jalan", parent: "6100", level: 2, type: "detail", normalBalance: "debit" },
  { code: "6150", name: "Listrik, Air & Internet", parent: "6100", level: 2, type: "detail", normalBalance: "debit" },
  { code: "6160", name: "Telepon & Pulsa Operasional", parent: "6100", level: 2, type: "detail", normalBalance: "debit" },
  { code: "6170", name: "Sewa Kantor/Gudang", parent: "6100", level: 2, type: "detail", normalBalance: "debit" },
  { code: "6180", name: "Perawatan Kantor/Gudang", parent: "6100", level: 2, type: "detail", normalBalance: "debit" },
  { code: "6190", name: "Bahan Kebersihan & Rumah Tangga", parent: "6100", level: 2, type: "detail", normalBalance: "debit" },
  { code: "6200", name: "Beban Administrasi", parent: "6000", level: 1, type: "header" },
  { code: "6210", name: "Administrasi Bank", parent: "6200", level: 2, type: "detail", normalBalance: "debit" },
  { code: "6220", name: "Biaya Transfer & Materai", parent: "6200", level: 2, type: "detail", normalBalance: "debit" },
  { code: "6230", name: "Jasa Profesional (Akuntan/Konsultan/Legal)", parent: "6200", level: 2, type: "detail", normalBalance: "debit" },
  { code: "6240", name: "Perizinan & Legalitas Usaha", parent: "6200", level: 2, type: "detail", normalBalance: "debit" },
  { code: "6250", name: "Pajak & Retribusi Perusahaan", parent: "6200", level: 2, type: "detail", normalBalance: "debit" },
  { code: "6260", name: "Penyusutan Aset Kantor", parent: "6200", level: 2, type: "detail", normalBalance: "debit" },
  { code: "6270", name: "Amortisasi Aset Lainnya", parent: "6200", level: 2, type: "detail", normalBalance: "debit" },
  { code: "6280", name: "Software & Langganan Sistem", parent: "6200", level: 2, type: "detail", normalBalance: "debit" },
  { code: "6290", name: "Beban Piutang Tak Tertagih", parent: "6200", level: 2, type: "detail", normalBalance: "debit" },
  { code: "6300", name: "Beban Pemasaran & Lainnya", parent: "6000", level: 1, type: "header" },
  { code: "6310", name: "Promosi & Pemasaran", parent: "6300", level: 2, type: "detail", normalBalance: "debit" },
  { code: "6320", name: "Jamuan & Representasi", parent: "6300", level: 2, type: "detail", normalBalance: "debit" },
  { code: "6330", name: "Perjalanan Dinas", parent: "6300", level: 2, type: "detail", normalBalance: "debit" },
  { code: "6340", name: "Pelatihan & Rekrutmen", parent: "6300", level: 2, type: "detail", normalBalance: "debit" },
  { code: "6350", name: "Sumbangan", parent: "6300", level: 2, type: "detail", normalBalance: "debit" },
  { code: "6360", name: "Beban Lain-lain Operasional", parent: "6300", level: 2, type: "detail", normalBalance: "debit" },
  { code: "7000", name: "PENDAPATAN LAIN-LAIN", parent: null, level: 0, type: "header" },
  { code: "7100", name: "Pendapatan Bunga Bank", parent: "7000", level: 1, type: "detail", normalBalance: "credit" },
  { code: "7110", name: "Keuntungan Penjualan Aset Tetap", parent: "7000", level: 1, type: "detail", normalBalance: "credit" },
  { code: "7120", name: "Pendapatan Klaim Asuransi", parent: "7000", level: 1, type: "detail", normalBalance: "credit" },
  { code: "7130", name: "Pendapatan Selisih Kurs", parent: "7000", level: 1, type: "detail", normalBalance: "credit" },
  { code: "7140", name: "Pendapatan Lain-lain", parent: "7000", level: 1, type: "detail", normalBalance: "credit" },
  { code: "8000", name: "BEBAN LAIN-LAIN", parent: null, level: 0, type: "header" },
  { code: "8100", name: "Beban Bunga Bank", parent: "8000", level: 1, type: "detail", normalBalance: "debit" },
  { code: "8110", name: "Beban Bunga Leasing", parent: "8000", level: 1, type: "detail", normalBalance: "debit" },
  { code: "8120", name: "Denda & Penalti", parent: "8000", level: 1, type: "detail", normalBalance: "debit" },
  { code: "8130", name: "Kerugian Penjualan Aset Tetap", parent: "8000", level: 1, type: "detail", normalBalance: "debit" },
  { code: "8140", name: "Beban Selisih Kurs", parent: "8000", level: 1, type: "detail", normalBalance: "debit" },
  { code: "8150", name: "Beban Lain-lain", parent: "8000", level: 1, type: "detail", normalBalance: "debit" },
  { code: "9000", name: "AKUN PENUTUP", parent: null, level: 0, type: "header" },
  { code: "9100", name: "Ikhtisar Laba/Rugi", parent: "9000", level: 1, type: "detail", normalBalance: "credit" },
  { code: "9110", name: "Pajak Penghasilan Badan", parent: "9000", level: 1, type: "detail", normalBalance: "debit" },
]

// Helper: get detail accounts only (yang bisa dijurnal)
export const getDetailAccounts = () => COA.filter(a => a.type === 'detail')

// Helper: get accounts by first digit (category)
export const getAccountsByCategory = (prefix) => COA.filter(a => a.code.startsWith(prefix))

// Helper: get account name by code
export const getAccountName = (code) => {
  const acc = COA.find(a => a.code === code)
  return acc ? `${acc.code} - ${acc.name}` : code
}

// Helper: determine normal balance from account code
export const getNormalBalance = (code) => {
  const first = code.charAt(0)
  if (['1','5','6','8'].includes(first)) return 'debit'
  if (['2','3','4','7'].includes(first)) return 'credit'
  if (code === '9100') return 'credit'
  if (code === '9110') return 'debit'
  return 'debit'
}

// Helper: Kas & Bank accounts
export const getKasBankAccounts = () => COA.filter(a =>
  a.type === 'detail' && (a.code.startsWith('111'))
)

// Helper: Revenue accounts
export const getRevenueAccounts = () => COA.filter(a =>
  a.type === 'detail' && (a.code.startsWith('4') || a.code.startsWith('7'))
)

// Helper: Expense accounts
export const getExpenseAccounts = () => COA.filter(a =>
  a.type === 'detail' && (a.code.startsWith('5') || a.code.startsWith('6') || a.code.startsWith('8'))
)

// Helper: Fixed asset accounts
export const getFixedAssetAccounts = () => COA.filter(a =>
  a.type === 'detail' && a.code.startsWith('121')
)

// Helper: Accumulated depreciation accounts
export const getAccumDepreciationAccounts = () => COA.filter(a =>
  a.type === 'detail' && a.code.startsWith('122')
)

// Map aset tetap ke akumulasi penyusutan & beban penyusutan
export const DEPRECIATION_MAP = {
  '1212': { accumAccount: '1221', expenseAccount: '5270', name: 'Bangunan/Gudang', usefulLife: 20 },
  '1213': { accumAccount: '1222', expenseAccount: '5270', name: 'Kendaraan Truck', usefulLife: 8 },
  '1214': { accumAccount: '1223', expenseAccount: '6260', name: 'Kendaraan Operasional', usefulLife: 8 },
  '1215': { accumAccount: '1224', expenseAccount: '6260', name: 'Alat Bengkel', usefulLife: 5 },
  '1216': { accumAccount: '1225', expenseAccount: '6260', name: 'Peralatan Kantor', usefulLife: 5 },
  '1217': { accumAccount: '1226', expenseAccount: '6260', name: 'Furnitur & Inventaris', usefulLife: 5 },
  '1218': { accumAccount: '1227', expenseAccount: '6260', name: 'Komputer & Printer', usefulLife: 4 },
  '1219': { accumAccount: '1228', expenseAccount: '6260', name: 'GPS/Tracker Armada', usefulLife: 4 },
}

// ===== DYNAMIC COA SUPPORT =====
// Merge built-in COA with custom Firestore accounts and overrides
export function getMergedCOA(customAccounts = [], overrides = []) {
  const inactiveBuiltinCodes = new Set(
    overrides.filter(o => o.status === 'inactive').map(o => o.code)
  )

  // Built-in accounts with inactive flag
  const builtinMerged = COA.map(a => ({
    ...a,
    custom: false,
    inactive: inactiveBuiltinCodes.has(a.code)
  }))

  // Custom accounts from Firestore
  const customMerged = customAccounts
    .filter(a => a.status !== 'deleted')
    .map(a => ({
      code: a.code,
      name: a.name,
      parent: a.parent || null,
      level: a.level || 2,
      type: a.type || 'detail',
      normalBalance: a.normalBalance || getNormalBalance(a.code),
      custom: true,
      firestoreId: a.id,
      inactive: a.status === 'inactive'
    }))

  // Combine and sort by code
  return [...builtinMerged, ...customMerged].sort((a, b) => a.code.localeCompare(b.code))
}

// Dynamic versions that accept merged COA
export const getDetailAccountsDynamic = (mergedCOA) =>
  mergedCOA.filter(a => a.type === 'detail' && !a.inactive)

export const getAccountNameDynamic = (code, mergedCOA) => {
  const acc = mergedCOA.find(a => a.code === code)
  return acc ? `${acc.code} - ${acc.name}` : code
}
