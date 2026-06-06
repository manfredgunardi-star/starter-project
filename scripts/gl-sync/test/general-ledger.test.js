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
const generalLedger = safeRequire('../lib/general-ledger')

test('GL_HEADERS exports the exact 16 flat general ledger columns', () => {
  assert.deepStrictEqual(generalLedger.GL_HEADERS, [
    'Tanggal',
    'Journal ID',
    'No. Jurnal',
    'Urutan Baris',
    'Jenis Jurnal',
    'Deskripsi',
    'Truck',
    'Kode Akun',
    'Nama Akun',
    'Debit (Rp)',
    'Kredit (Rp)',
    'Status',
    'Dibuat Oleh',
    'Dibuat Pada',
    'Terakhir Diubah',
    'Waktu Sync (WIB)',
  ])
})

test('buildGLRows repeats metadata per line, uses account-map fallback, and marks deleted journals', () => {
  const accountMap = buildAccountMap(
    [
      { code: '1111', name: 'Kas Kecil', normalBalance: 'debit' },
      { code: '4100', name: 'Pendapatan Jasa', normalBalance: 'credit' },
    ],
    []
  )

  const formatTimestamp = (value) => (value ? `fmt:${value}` : '')
  const syncTimestamp = '2026-06-06T08:09:10.000Z'
  const journals = [
    {
      _docId: 'journal-abcdef12',
      id: 'journal-ignored-id',
      date: '2026-06-05',
      type: 'penyesuaian',
      description: 'Deskripsi header tidak dipakai',
      truckId: 'TRUCK-JURNAL',
      status: 'deleted',
      createdBy: 'user-1',
      createdAt: '2026-06-05T01:02:03.000Z',
      updatedAt: '2026-06-05T04:05:06.000Z',
      deletedAt: '2026-06-05T04:06:07.000Z',
      lines: [
        {
          accountCode: '1111',
          debit: 150000,
          credit: 0,
          keterangan: 'Solar dibayar',
          truckId: 'TRUCK-LINE',
        },
        {
          accountCode: '9999',
          debit: 0,
          credit: 150000,
          keterangan: 'Kas berkurang',
          truckId: '',
        },
      ],
    },
  ]

  const rows = generalLedger.buildGLRows(
    journals,
    accountMap,
    syncTimestamp,
    formatTimestamp
  )

  assert.deepStrictEqual(rows, [
    [
      '2026-06-05',
      'journal-abcdef12',
      'journal-',
      1,
      'penyesuaian',
      'Solar dibayar',
      'TRUCK-LINE',
      '1111',
      'Kas Kecil',
      150000,
      '',
      'Dihapus',
      'user-1',
      'fmt:2026-06-05T01:02:03.000Z',
      'fmt:2026-06-05T04:06:07.000Z',
      'fmt:2026-06-06T08:09:10.000Z',
    ],
    [
      '2026-06-05',
      'journal-abcdef12',
      'journal-',
      2,
      'penyesuaian',
      'Kas berkurang',
      'TRUCK-JURNAL',
      '9999',
      '[Akun tidak ditemukan: 9999]',
      '',
      150000,
      'Dihapus',
      'user-1',
      'fmt:2026-06-05T01:02:03.000Z',
      'fmt:2026-06-05T04:06:07.000Z',
      'fmt:2026-06-06T08:09:10.000Z',
    ],
  ])
})

test('buildGLRows uses id when _docId is missing and falls back truck to dash', () => {
  const accountMap = buildAccountMap(
    [{ code: '1111', name: 'Kas Kecil', normalBalance: 'debit' }],
    []
  )

  const rows = generalLedger.buildGLRows(
    [
      {
        id: 'ABCDEF123456',
        date: '2026-06-06',
        type: 'umum',
        createdBy: 'user-2',
        createdAt: '2026-06-06T01:00:00.000Z',
        updatedAt: '2026-06-06T02:00:00.000Z',
        lines: [
          {
            accountCode: '1111',
            debit: 10,
            credit: 0,
            keterangan: 'Kas masuk',
          },
        ],
      },
    ],
    accountMap,
    '2026-06-06T03:00:00.000Z',
    (value) => value
  )

  assert.equal(rows[0][1], 'ABCDEF123456')
  assert.equal(rows[0][2], 'ABCDEF12')
  assert.equal(rows[0][6], '-')
  assert.equal(rows[0][11], 'Aktif')
})

test('buildGLRows picks the latest updatedAt or deletedAt for Terakhir Diubah', () => {
  const accountMap = buildAccountMap(
    [{ code: '1111', name: 'Kas Kecil', normalBalance: 'debit' }],
    []
  )

  const rows = generalLedger.buildGLRows(
    [
      {
        _docId: 'J-DELETE-1',
        date: '2026-06-06',
        type: 'umum',
        createdBy: 'user-3',
        createdAt: '2026-06-06T01:00:00.000Z',
        updatedAt: '2026-06-06T04:00:00.000Z',
        deletedAt: '2026-06-06T03:00:00.000Z',
        lines: [
          {
            accountCode: '1111',
            debit: 10,
            credit: 0,
            keterangan: 'latest updated wins',
          },
        ],
      },
      {
        _docId: 'J-DELETE-2',
        date: '2026-06-06',
        type: 'umum',
        createdBy: 'user-4',
        createdAt: '2026-06-06T01:00:00.000Z',
        updatedAt: '2026-06-06T02:00:00.000Z',
        deletedAt: '2026-06-06T05:00:00.000Z',
        lines: [
          {
            accountCode: '1111',
            debit: 20,
            credit: 0,
            keterangan: 'latest delete wins',
          },
        ],
      },
    ],
    accountMap,
    '2026-06-06T06:00:00.000Z',
    (value) => value
  )

  assert.equal(rows[0][14], '2026-06-06T04:00:00.000Z')
  assert.equal(rows[1][14], '2026-06-06T05:00:00.000Z')
})

test('buildJournalDeleteRequests treats existingRows as sheet values including header and groups contiguous journal rows descending', () => {
  const existingRows = [
    generalLedger.GL_HEADERS,
    ['2026-06-01', 'J-001', 'J-001', 1],
    ['2026-06-01', 'J-001', 'J-001', 2],
    ['2026-06-01', 'J-002', 'J-002', 1],
    ['2026-06-02', 'J-001', 'J-001', 1],
    ['2026-06-03', '', '', 1],
    ['2026-06-04', 'J-003', 'J-003', 1],
    ['2026-06-04', 'J-003', 'J-003', 2],
    ['2026-06-05', 'J-004', 'J-004', 1],
  ]

  const requests = generalLedger.buildJournalDeleteRequests(existingRows, ['J-001', 'J-003'], 321)

  assert.deepStrictEqual(requests, [
    {
      deleteDimension: {
        range: {
          sheetId: 321,
          dimension: 'ROWS',
          startIndex: 6,
          endIndex: 8,
        },
      },
    },
    {
      deleteDimension: {
        range: {
          sheetId: 321,
          dimension: 'ROWS',
          startIndex: 4,
          endIndex: 5,
        },
      },
    },
    {
      deleteDimension: {
        range: {
          sheetId: 321,
          dimension: 'ROWS',
          startIndex: 1,
          endIndex: 3,
        },
      },
    },
  ])
})
