const test = require('node:test')
const assert = require('node:assert/strict')

function safeRequire(modulePath) {
  try {
    return require(modulePath)
  } catch (error) {
    if (error && error.code === 'MODULE_NOT_FOUND' && error.message.includes(modulePath)) {
      return {}
    }
    throw error
  }
}

const { buildAccountMap } = require('../lib/account-map')
const consultantReports = safeRequire('../lib/consultant-reports')

function createAccountMap() {
  return buildAccountMap([
    { code: '1111', name: 'Kas Kecil', normalBalance: 'debit', type: 'detail' },
    { code: '1112', name: 'Bank BCA Operasional', normalBalance: 'debit', type: 'detail' },
    { code: '1121', name: 'Piutang Pelanggan - Proyek', normalBalance: 'debit', type: 'detail' },
    { code: '1212', name: 'Bangunan/Gudang', normalBalance: 'debit', type: 'detail' },
    { code: '1213', name: 'Kendaraan Truck', normalBalance: 'debit', type: 'detail' },
    { code: '1221', name: 'Akumulasi Penyusutan Bangunan/Gudang', normalBalance: 'credit', type: 'detail' },
    { code: '1222', name: 'Akumulasi Penyusutan Kendaraan Truck', normalBalance: 'credit', type: 'detail' },
    { code: '2110', name: 'Hutang Usaha', normalBalance: 'credit', type: 'detail' },
    { code: '3110', name: 'Modal Disetor', normalBalance: 'credit', type: 'detail' },
    { code: '4100', name: 'Pendapatan Usaha', normalBalance: 'credit', type: 'detail' },
    { code: '5110', name: 'BBM Armada', normalBalance: 'debit', type: 'detail' },
    { code: '6110', name: 'Gaji Staf Kantor', normalBalance: 'debit', type: 'detail' },
    { code: '6260', name: 'Penyusutan & Amortisasi Umum', normalBalance: 'debit', type: 'detail' },
    { code: '7100', name: 'Pendapatan Bunga Bank', normalBalance: 'credit', type: 'detail' },
    { code: '8100', name: 'Beban Bunga Bank', normalBalance: 'debit', type: 'detail' },
  ], [])
}

test('CONSULTANT_SCHEMAS exports the eight consultant accounting sheets in order', () => {
  assert.deepStrictEqual(
    consultantReports.CONSULTANT_SCHEMAS && consultantReports.CONSULTANT_SCHEMAS.map((schema) => schema.title),
    [
      'Review Jurnal',
      'Trial Balance Bulanan',
      'Laba Rugi Bulanan',
      'Neraca Bulanan',
      'Aging Piutang',
      'Profitabilitas Truck',
      'Daftar Aset',
      'Rekonsiliasi Kas Bank',
    ]
  )

  assert.deepStrictEqual(
    consultantReports.CONSULTANT_SCHEMAS && consultantReports.CONSULTANT_SCHEMAS[0].headers,
    [
      'Tanggal',
      'Journal ID',
      'No. Jurnal',
      'Status',
      'Jenis Jurnal',
      'Deskripsi',
      'Truck',
      'Jumlah Baris',
      'Total Debit (Rp)',
      'Total Kredit (Rp)',
      'Selisih (Rp)',
      'Flags',
      'Akun Hilang',
      'Baris Keterangan Kosong',
      'Duplicate Key',
    ]
  )
})

test('buildJournalReviewRows flags imbalance, missing accounts, blank line descriptions, deleted journals, short journals, and duplicate signatures', () => {
  const accountMap = createAccountMap()
  const journals = [
    {
      _docId: 'J-DUP-001',
      date: '2026-01-05',
      description: 'Pendapatan Januari',
      type: 'bank',
      truckId: 'TRUCK-1',
      status: 'posted',
      lines: [
        { accountCode: '1111', debit: 100, credit: 0, keterangan: 'Kas masuk' },
        { accountCode: '4100', debit: 0, credit: 100, keterangan: 'Pendapatan jasa' },
      ],
    },
    {
      _docId: 'J-DUP-002',
      date: '2026-01-05',
      description: 'Pendapatan Januari',
      type: 'bank',
      truckId: 'TRUCK-1',
      status: 'posted',
      lines: [
        { accountCode: '1111', debit: 100, credit: 0, keterangan: 'Kas masuk' },
        { accountCode: '4100', debit: 0, credit: 100, keterangan: 'Pendapatan jasa' },
      ],
    },
    {
      _docId: 'J-BAD-001',
      date: '2026-01-06',
      description: 'Jurnal bermasalah',
      type: 'umum',
      status: 'deleted',
      lines: [
        { accountCode: '9999', debit: 50, credit: 0, keterangan: '   ' },
      ],
    },
  ]

  const rows = consultantReports.buildJournalReviewRows(journals, accountMap)

  assert.deepStrictEqual(rows, [
    [
      '2026-01-05',
      'J-DUP-001',
      'J-DUP-00',
      'posted',
      'bank',
      'Pendapatan Januari',
      'TRUCK-1',
      2,
      100,
      100,
      '',
      'Potensi duplikat',
      '',
      '',
      '2026-01-05|1111|Kas masuk|100|0__4100|Pendapatan jasa|0|100',
    ],
    [
      '2026-01-05',
      'J-DUP-002',
      'J-DUP-00',
      'posted',
      'bank',
      'Pendapatan Januari',
      'TRUCK-1',
      2,
      100,
      100,
      '',
      'Potensi duplikat',
      '',
      '',
      '2026-01-05|1111|Kas masuk|100|0__4100|Pendapatan jasa|0|100',
    ],
    [
      '2026-01-06',
      'J-BAD-001',
      'J-BAD-00',
      'deleted',
      'umum',
      'Jurnal bermasalah',
      '-',
      1,
      50,
      '',
      50,
      'Keterangan baris kosong; Kode akun hilang; Kurang dari 2 lines; Status deleted; Tidak balance',
      '9999',
      '1',
      '2026-01-06|9999||50|0',
    ],
  ])
})

test('buildMonthlyTrialBalanceRows rolls opening and ending balances forward by month and excludes deleted journals from numeric columns', () => {
  const accountMap = createAccountMap()
  const journals = [
    {
      _docId: 'J-MODAL',
      date: '2026-01-02',
      status: 'posted',
      lines: [
        { accountCode: '1111', debit: 200, credit: 0, keterangan: 'Setor modal' },
        { accountCode: '3110', debit: 0, credit: 200, keterangan: 'Setor modal' },
      ],
    },
    {
      _docId: 'J-SALES',
      date: '2026-01-10',
      status: 'posted',
      lines: [
        { accountCode: '1111', debit: 100, credit: 0, keterangan: 'Kas masuk' },
        { accountCode: '4100', debit: 0, credit: 100, keterangan: 'Pendapatan jasa' },
      ],
    },
    {
      _docId: 'J-BBM',
      date: '2026-02-05',
      status: 'posted',
      lines: [
        { accountCode: '5110', debit: 30, credit: 0, keterangan: 'BBM truck' },
        { accountCode: '1111', debit: 0, credit: 30, keterangan: 'Bayar BBM truck' },
      ],
    },
    {
      _docId: 'J-GAJI',
      date: '2026-02-12',
      status: 'posted',
      lines: [
        { accountCode: '6110', debit: 25, credit: 0, keterangan: 'Gaji admin' },
        { accountCode: '1111', debit: 0, credit: 25, keterangan: 'Bayar gaji admin' },
      ],
    },
    {
      _docId: 'J-DELETED',
      date: '2026-02-18',
      status: 'deleted',
      lines: [
        { accountCode: '6110', debit: 999, credit: 0, keterangan: 'Harus diabaikan' },
        { accountCode: '1111', debit: 0, credit: 999, keterangan: 'Harus diabaikan' },
      ],
    },
  ]

  const rows = consultantReports.buildMonthlyTrialBalanceRows(journals, accountMap)

  assert.deepStrictEqual(rows, [
    ['2026-01', '1111', 'Kas Kecil', 'debit', '', 300, '', 300],
    ['2026-01', '3110', 'Modal Disetor', 'credit', '', '', 200, 200],
    ['2026-01', '4100', 'Pendapatan Usaha', 'credit', '', '', 100, 100],
    ['2026-02', '1111', 'Kas Kecil', 'debit', 300, '', 55, 245],
    ['2026-02', '3110', 'Modal Disetor', 'credit', 200, '', '', 200],
    ['2026-02', '4100', 'Pendapatan Usaha', 'credit', 100, '', '', 100],
    ['2026-02', '5110', 'BBM Armada', 'debit', '', 30, '', 30],
    ['2026-02', '6110', 'Gaji Staf Kantor', 'debit', '', 25, '', 25],
  ])
})

test('buildMonthlyIncomeStatementRows groups account classes 4-8 per month and ignores deleted journals', () => {
  const accountMap = createAccountMap()
  const journals = [
    {
      date: '2026-01-10',
      status: 'posted',
      lines: [
        { accountCode: '1111', debit: 100, credit: 0, keterangan: 'Kas masuk' },
        { accountCode: '4100', debit: 0, credit: 100, keterangan: 'Pendapatan jasa' },
      ],
    },
    {
      date: '2026-02-05',
      status: 'posted',
      lines: [
        { accountCode: '5110', debit: 30, credit: 0, keterangan: 'BBM truck' },
        { accountCode: '1111', debit: 0, credit: 30, keterangan: 'Bayar BBM truck' },
      ],
    },
    {
      date: '2026-02-12',
      status: 'posted',
      lines: [
        { accountCode: '6110', debit: 25, credit: 0, keterangan: 'Gaji admin' },
        { accountCode: '1111', debit: 0, credit: 25, keterangan: 'Bayar gaji admin' },
      ],
    },
    {
      date: '2026-03-01',
      status: 'posted',
      lines: [
        { accountCode: '1112', debit: 50, credit: 0, keterangan: 'Bunga bank' },
        { accountCode: '7100', debit: 0, credit: 50, keterangan: 'Bunga bank' },
      ],
    },
    {
      date: '2026-03-02',
      status: 'posted',
      lines: [
        { accountCode: '8100', debit: 3, credit: 0, keterangan: 'Biaya admin bank' },
        { accountCode: '1112', debit: 0, credit: 3, keterangan: 'Biaya admin bank' },
      ],
    },
    {
      date: '2026-03-03',
      status: 'deleted',
      lines: [
        { accountCode: '4100', debit: 0, credit: 999, keterangan: 'Tidak dihitung' },
        { accountCode: '1111', debit: 999, credit: 0, keterangan: 'Tidak dihitung' },
      ],
    },
  ]

  const rows = consultantReports.buildMonthlyIncomeStatementRows(journals, accountMap)

  assert.deepStrictEqual(rows, [
    ['2026-01', '4100', 'Pendapatan Usaha', 'Pendapatan Usaha', 'credit', 100],
    ['2026-02', '5110', 'BBM Armada', 'Harga Pokok Penjualan', 'debit', 30],
    ['2026-02', '6110', 'Gaji Staf Kantor', 'Beban Operasional', 'debit', 25],
    ['2026-03', '7100', 'Pendapatan Bunga Bank', 'Pendapatan Lain-lain', 'credit', 50],
    ['2026-03', '8100', 'Beban Bunga Bank', 'Beban Lain-lain', 'debit', 3],
  ])
})

test('buildMonthlyBalanceSheetRows produces cumulative ending balances by month for account classes 1-3', () => {
  const accountMap = createAccountMap()
  const journals = [
    {
      date: '2026-01-02',
      status: 'posted',
      lines: [
        { accountCode: '1111', debit: 200, credit: 0, keterangan: 'Setor modal' },
        { accountCode: '3110', debit: 0, credit: 200, keterangan: 'Setor modal' },
      ],
    },
    {
      date: '2026-02-15',
      status: 'posted',
      lines: [
        { accountCode: '1111', debit: 0, credit: 80, keterangan: 'Bayar hutang' },
        { accountCode: '2110', debit: 80, credit: 0, keterangan: 'Bayar hutang' },
      ],
    },
    {
      date: '2026-02-20',
      status: 'posted',
      lines: [
        { accountCode: '1112', debit: 50, credit: 0, keterangan: 'Transfer bank' },
        { accountCode: '1111', debit: 0, credit: 50, keterangan: 'Transfer bank' },
      ],
    },
    {
      date: '2026-02-28',
      status: 'deleted',
      lines: [
        { accountCode: '1111', debit: 999, credit: 0, keterangan: 'Abaikan' },
        { accountCode: '3110', debit: 0, credit: 999, keterangan: 'Abaikan' },
      ],
    },
  ]

  const rows = consultantReports.buildMonthlyBalanceSheetRows(journals, accountMap)

  assert.deepStrictEqual(rows, [
    ['2026-01', '1111', 'Kas Kecil', 'Aset', 'debit', 200],
    ['2026-01', '3110', 'Modal Disetor', 'Ekuitas', 'credit', 200],
    ['2026-02', '1111', 'Kas Kecil', 'Aset', 'debit', 70],
    ['2026-02', '1112', 'Bank BCA Operasional', 'Aset', 'debit', 50],
    ['2026-02', '2110', 'Hutang Usaha', 'Kewajiban', 'credit', -80],
    ['2026-02', '3110', 'Modal Disetor', 'Ekuitas', 'credit', 200],
  ])
})

test('buildAgingReceivableRows calculates filtered payments, outstanding, aging bucket, and derived status from posted payment journals only', () => {
  const invoices = [
    {
      id: 'INV-001',
      invoiceNo: 'INV-001',
      customerName: 'PT Alpha',
      date: '2026-04-01',
      dueDate: '2026-04-20',
      amount: 1000,
      status: 'unpaid',
      payments: [],
    },
    {
      id: 'INV-002',
      invoiceNo: 'INV-002',
      customerName: 'PT Beta',
      date: '2026-02-01',
      dueDate: '2026-03-10',
      amount: 1000,
      payments: [
        { journalId: 'PAY-POSTED', date: '2026-03-15', jumlahBayar: 400, keterangan: 'Bayar termin 1' },
      ],
    },
    {
      id: 'INV-003',
      invoiceNo: 'INV-003',
      customerName: 'PT Gamma',
      date: '2025-12-01',
      dueDate: '2025-12-31',
      amount: 500,
      status: 'paid',
      payments: [
        { journalId: 'PAY-DELETED', date: '2026-01-05', jumlahBayar: 500, keterangan: 'Harus diabaikan' },
      ],
    },
  ]

  const journals = [
    { _docId: 'PAY-POSTED', status: 'posted' },
    { _docId: 'PAY-DELETED', status: 'deleted' },
  ]

  const rows = consultantReports.buildAgingReceivableRows(invoices, journals, '2026-04-15')

  assert.deepStrictEqual(rows, [
    ['INV-003', 'INV-003', 'PT Gamma', '2025-12-01', '2025-12-31', 105, '>90 hari', 500, '', 500, 'unpaid'],
    ['INV-002', 'INV-002', 'PT Beta', '2026-02-01', '2026-03-10', 36, '31-60 hari', 1000, 400, 600, 'partial'],
    ['INV-001', 'INV-001', 'PT Alpha', '2026-04-01', '2026-04-20', '', 'Belum Jatuh Tempo', 1000, '', 1000, 'unpaid'],
  ])
})

test('buildTruckProfitabilityRows groups posted revenue and expense by truck and uses Tanpa Truck fallback', () => {
  const journals = [
    {
      _docId: 'TRUCK-REV',
      date: '2026-01-10',
      status: 'posted',
      truckId: 'TRUCK-1',
      lines: [
        { accountCode: '1111', debit: 300, credit: 0, keterangan: 'Kas masuk' },
        { accountCode: '4100', debit: 0, credit: 300, keterangan: 'Pendapatan jasa' },
      ],
    },
    {
      _docId: 'TRUCK-BBM',
      date: '2026-01-12',
      status: 'posted',
      lines: [
        { accountCode: '5110', debit: 120, credit: 0, keterangan: 'BBM', truckId: 'TRUCK-1' },
        { accountCode: '1111', debit: 0, credit: 120, keterangan: 'Kas keluar', truckId: 'TRUCK-1' },
      ],
    },
    {
      _docId: 'BANK-REV',
      date: '2026-01-15',
      status: 'posted',
      lines: [
        { accountCode: '1112', debit: 50, credit: 0, keterangan: 'Bunga bank' },
        { accountCode: '7100', debit: 0, credit: 50, keterangan: 'Bunga bank' },
      ],
    },
    {
      _docId: 'TRUCK-DEL',
      date: '2026-01-20',
      status: 'deleted',
      truckId: 'TRUCK-1',
      lines: [
        { accountCode: '5110', debit: 999, credit: 0, keterangan: 'Abaikan' },
        { accountCode: '1111', debit: 0, credit: 999, keterangan: 'Abaikan' },
      ],
    },
  ]

  const rows = consultantReports.buildTruckProfitabilityRows(journals)

  assert.deepStrictEqual(rows, [
    ['TRUCK-1', 300, 120, 180, 2],
    ['Tanpa Truck', 50, '', 50, 1],
  ])
})

test('buildAssetRows lists assets with estimated accumulated depreciation from posted journals only', () => {
  const accountMap = createAccountMap()
  const assets = [
    {
      id: 'AST-001',
      name: 'Hino X',
      accountCode: '1213',
      tanggalPerolehan: '2026-01-01',
      hargaPerolehan: 960,
      usiaEkonomis: 8,
      penyusutanPerBulan: 10,
      depreciationInfo: { accumAccount: '1222' },
      status: 'active',
    },
    {
      id: 'AST-002',
      name: 'Gudang A',
      accountCode: '1212',
      tanggalPerolehan: '2026-02-01',
      hargaPerolehan: 2400,
      usiaEkonomis: 20,
      depreciationInfo: { accumAccount: '1221' },
      status: 'active',
    },
  ]

  const journals = [
    {
      status: 'posted',
      lines: [
        { accountCode: '6260', debit: 10, credit: 0, keterangan: 'Penyusutan Hino X — 2026-02' },
        { accountCode: '1222', debit: 0, credit: 10, keterangan: 'Penyusutan Hino X — 2026-02' },
      ],
    },
    {
      status: 'posted',
      lines: [
        { accountCode: '6260', debit: 10, credit: 0, keterangan: 'Penyusutan Gudang A — 2026-03' },
        { accountCode: '1221', debit: 0, credit: 10, keterangan: 'Penyusutan Gudang A — 2026-03' },
      ],
    },
    {
      status: 'deleted',
      lines: [
        { accountCode: '6260', debit: 999, credit: 0, keterangan: 'Penyusutan Hino X — hapus' },
        { accountCode: '1222', debit: 0, credit: 999, keterangan: 'Penyusutan Hino X — hapus' },
      ],
    },
  ]

  const rows = consultantReports.buildAssetRows(assets, journals, accountMap)

  assert.deepStrictEqual(rows, [
    ['AST-001', 'Hino X', '1213', 'Kendaraan Truck', '2026-01-01', 960, 10, 10, 950, 'active'],
    ['AST-002', 'Gudang A', '1212', 'Bangunan/Gudang', '2026-02-01', 2400, 10, 10, 2390, 'active'],
  ])
})

test('buildCashBankReconciliationRows outputs running balances per 111* account and excludes deleted journals', () => {
  const accountMap = createAccountMap()
  const journals = [
    {
      _docId: 'J-MODAL',
      date: '2026-01-02',
      status: 'posted',
      description: 'Setor modal',
      lines: [
        { accountCode: '1111', debit: 200, credit: 0, keterangan: 'Kas masuk modal' },
        { accountCode: '3110', debit: 0, credit: 200, keterangan: 'Setor modal' },
      ],
    },
    {
      _docId: 'J-SALES',
      date: '2026-01-10',
      status: 'posted',
      description: 'Penjualan tunai',
      lines: [
        { accountCode: '1111', debit: 100, credit: 0, keterangan: 'Kas masuk penjualan' },
        { accountCode: '4100', debit: 0, credit: 100, keterangan: 'Pendapatan jasa' },
      ],
    },
    {
      _docId: 'J-GAJI',
      date: '2026-02-12',
      status: 'posted',
      description: 'Bayar gaji',
      lines: [
        { accountCode: '6110', debit: 25, credit: 0, keterangan: 'Gaji admin' },
        { accountCode: '1111', debit: 0, credit: 25, keterangan: 'Kas keluar gaji' },
      ],
    },
    {
      _docId: 'J-BUNGA',
      date: '2026-02-15',
      status: 'posted',
      description: 'Bunga bank',
      lines: [
        { accountCode: '1112', debit: 50, credit: 0, keterangan: 'Bank terima bunga' },
        { accountCode: '7100', debit: 0, credit: 50, keterangan: 'Pendapatan bunga' },
      ],
    },
    {
      _docId: 'J-DELETE',
      date: '2026-02-20',
      status: 'deleted',
      description: 'Abaikan',
      lines: [
        { accountCode: '1111', debit: 999, credit: 0, keterangan: 'Tidak dihitung' },
        { accountCode: '4100', debit: 0, credit: 999, keterangan: 'Tidak dihitung' },
      ],
    },
  ]

  const rows = consultantReports.buildCashBankReconciliationRows(journals, accountMap)

  assert.deepStrictEqual(rows, [
    ['1111', 'Kas Kecil', '2026-01-02', 'J-MODAL', 'J-MODAL', 'Kas masuk modal', 200, '', 200],
    ['1111', 'Kas Kecil', '2026-01-10', 'J-SALES', 'J-SALES', 'Kas masuk penjualan', 100, '', 300],
    ['1111', 'Kas Kecil', '2026-02-12', 'J-GAJI', 'J-GAJI', 'Kas keluar gaji', '', 25, 275],
    ['1112', 'Bank BCA Operasional', '2026-02-15', 'J-BUNGA', 'J-BUNGA', 'Bank terima bunga', 50, '', 50],
  ])
})
