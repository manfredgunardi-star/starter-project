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

const { GL_HEADERS } = safeRequire('../lib/general-ledger')
const sheetOperations = safeRequire('../lib/sheet-operations')

const DEFAULT_SCHEMAS = [
  {
    title: 'General Ledger',
    headerRange: 'General Ledger!A1:P1',
    dataRange: 'General Ledger!A:P',
    appendRange: 'General Ledger!A2',
    clearRange: 'General Ledger!A2:Z',
    headers: GL_HEADERS,
    requireFullSyncForHeaderMismatch: true,
    mismatchError: 'Header General Ledger legacy terdeteksi. Jalankan FULL_SYNC=true untuk migrasi.',
  },
  {
    title: 'Audit Log',
    headerRange: 'Audit Log!A1:G1',
    headers: ['Waktu Perubahan (WIB)', 'No. Jurnal', 'Aksi', 'Tanggal Jurnal', 'Deskripsi', 'Dilakukan Oleh', 'Timestamp ISO'],
  },
  {
    title: '_sync_log',
    headerRange: '_sync_log!A1:E1',
    headers: ['Tanggal (WIB)', 'Status', 'Jurnal Ditambahkan', 'Audit Entries', 'Selesai Pada (WIB)'],
  },
]

function createFakeSheets({
  sheetsMetadata = [],
  valuesByRange = {},
} = {}) {
  const calls = {
    get: [],
    valuesGet: [],
    valuesUpdate: [],
    valuesAppend: [],
    valuesClear: [],
    batchUpdate: [],
  }

  return {
    calls,
    spreadsheets: {
      get: async (params) => {
        calls.get.push(params)
        return {
          data: {
            sheets: sheetsMetadata.map((sheet) => ({
              properties: { ...sheet },
            })),
          },
        }
      },
      batchUpdate: async (params) => {
        calls.batchUpdate.push(params)
        return { data: {} }
      },
      values: {
        get: async (params) => {
          calls.valuesGet.push(params)
          return {
            data: {
              values: valuesByRange[params.range] || [],
            },
          }
        },
        update: async (params) => {
          calls.valuesUpdate.push(params)
          return { data: {} }
        },
        append: async (params) => {
          calls.valuesAppend.push(params)
          return { data: {} }
        },
        clear: async (params) => {
          calls.valuesClear.push(params)
          return { data: {} }
        },
      },
    },
  }
}

test('ensureSheetsAndHeaders creates missing sheets and writes headers when absent', async () => {
  const fakeSheets = createFakeSheets({
    sheetsMetadata: [
      { sheetId: 11, title: 'General Ledger' },
    ],
    valuesByRange: {
      'General Ledger!A1:P1': [],
      '_sync_log!A1:E1': [['Tanggal (WIB)', 'Status', 'Jurnal Ditambahkan', 'Audit Entries', 'Selesai Pada (WIB)']],
    },
  })

  await sheetOperations.ensureSheetsAndHeaders({
    sheets: fakeSheets,
    spreadsheetId: 'spreadsheet-1',
    schemas: DEFAULT_SCHEMAS,
  })

  assert.deepStrictEqual(fakeSheets.calls.batchUpdate, [
    {
      spreadsheetId: 'spreadsheet-1',
      requestBody: {
        requests: [
          { addSheet: { properties: { title: 'Audit Log' } } },
          { addSheet: { properties: { title: '_sync_log' } } },
        ],
      },
    },
  ])
  assert.equal(fakeSheets.calls.valuesUpdate.length, 3)
  assert.deepStrictEqual(fakeSheets.calls.valuesUpdate[0], {
    spreadsheetId: 'spreadsheet-1',
    range: 'General Ledger!A1:P1',
    valueInputOption: 'RAW',
    requestBody: { values: [GL_HEADERS] },
  })
})

test('ensureSheetsAndHeaders throws a FULL_SYNC error when daily sync sees legacy general ledger headers', async () => {
  const fakeSheets = createFakeSheets({
    sheetsMetadata: [
      { sheetId: 11, title: 'General Ledger' },
      { sheetId: 12, title: 'Audit Log' },
      { sheetId: 13, title: '_sync_log' },
    ],
    valuesByRange: {
      'General Ledger!A1:P1': [['Tanggal', 'No. Jurnal', 'Deskripsi']],
      'Audit Log!A1:G1': [['Waktu Perubahan (WIB)', 'No. Jurnal', 'Aksi', 'Tanggal Jurnal', 'Deskripsi', 'Dilakukan Oleh', 'Timestamp ISO']],
      '_sync_log!A1:E1': [['Tanggal (WIB)', 'Status', 'Jurnal Ditambahkan', 'Audit Entries', 'Selesai Pada (WIB)']],
    },
  })

  await assert.rejects(
    () => sheetOperations.ensureSheetsAndHeaders({
      sheets: fakeSheets,
      spreadsheetId: 'spreadsheet-1',
      schemas: DEFAULT_SCHEMAS,
      fullSync: false,
    }),
    /FULL_SYNC/
  )

  assert.equal(fakeSheets.calls.valuesUpdate.length, 0)
})

test('ensureSheetsAndHeaders may update general ledger headers during full sync', async () => {
  const fakeSheets = createFakeSheets({
    sheetsMetadata: [
      { sheetId: 11, title: 'General Ledger' },
      { sheetId: 12, title: 'Audit Log' },
      { sheetId: 13, title: '_sync_log' },
    ],
    valuesByRange: {
      'General Ledger!A1:P1': [['Tanggal', 'No. Jurnal', 'Deskripsi']],
      'Audit Log!A1:G1': [['Waktu Perubahan (WIB)', 'No. Jurnal', 'Aksi', 'Tanggal Jurnal', 'Deskripsi', 'Dilakukan Oleh', 'Timestamp ISO']],
      '_sync_log!A1:E1': [['Tanggal (WIB)', 'Status', 'Jurnal Ditambahkan', 'Audit Entries', 'Selesai Pada (WIB)']],
    },
  })

  await sheetOperations.ensureSheetsAndHeaders({
    sheets: fakeSheets,
    spreadsheetId: 'spreadsheet-1',
    schemas: DEFAULT_SCHEMAS,
    fullSync: true,
  })

  assert.equal(fakeSheets.calls.valuesUpdate.length, 1)
  assert.equal(fakeSheets.calls.valuesUpdate[0].range, 'General Ledger!A1:P1')
})

test('ensureSheetsAndHeaders works from generic schemas and can provision Review Jurnal', async () => {
  const fakeSheets = createFakeSheets({
    sheetsMetadata: [],
    valuesByRange: {
      'Review Jurnal!A1:C1': [],
    },
  })

  await sheetOperations.ensureSheetsAndHeaders({
    sheets: fakeSheets,
    spreadsheetId: 'spreadsheet-1',
    schemas: [
      {
        title: 'Review Jurnal',
        headerRange: 'Review Jurnal!A1:C1',
        headers: ['Journal ID', 'Status Review', 'Catatan'],
      },
    ],
  })

  assert.deepStrictEqual(fakeSheets.calls.batchUpdate, [
    {
      spreadsheetId: 'spreadsheet-1',
      requestBody: {
        requests: [
          { addSheet: { properties: { title: 'Review Jurnal' } } },
        ],
      },
    },
  ])
  assert.deepStrictEqual(fakeSheets.calls.valuesUpdate, [
    {
      spreadsheetId: 'spreadsheet-1',
      range: 'Review Jurnal!A1:C1',
      valueInputOption: 'RAW',
      requestBody: { values: [['Journal ID', 'Status Review', 'Catatan']] },
    },
  ])
})

test('ensureSheetsAndHeaders dry run with missing sheets skips header reads, does not fail, and returns planned operations', async () => {
  const fakeSheets = createFakeSheets({
    sheetsMetadata: [],
  })

  const result = await sheetOperations.ensureSheetsAndHeaders({
    sheets: fakeSheets,
    spreadsheetId: 'spreadsheet-1',
    schemas: DEFAULT_SCHEMAS,
    dryRun: true,
  })

  assert.equal(fakeSheets.calls.batchUpdate.length, 0)
  assert.equal(fakeSheets.calls.valuesUpdate.length, 0)
  assert.equal(fakeSheets.calls.valuesAppend.length, 0)
  assert.equal(fakeSheets.calls.valuesClear.length, 0)
  assert.equal(fakeSheets.calls.valuesGet.length, 0)
  assert.deepStrictEqual(result.plannedOperations, [
    { type: 'addSheet', title: 'General Ledger' },
    { type: 'setHeader', title: 'General Ledger', range: 'General Ledger!A1:P1' },
    { type: 'addSheet', title: 'Audit Log' },
    { type: 'setHeader', title: 'Audit Log', range: 'Audit Log!A1:G1' },
    { type: 'addSheet', title: '_sync_log' },
    { type: 'setHeader', title: '_sync_log', range: '_sync_log!A1:E1' },
  ])
})

test('replaceSheet clears A2:Z then appends rows', async () => {
  const fakeSheets = createFakeSheets()
  const rows = [
    ['2026-06-05', 'J-001'],
    ['2026-06-05', 'J-002'],
  ]

  await sheetOperations.replaceSheet({
    sheets: fakeSheets,
    spreadsheetId: 'spreadsheet-1',
    sheetName: 'General Ledger',
    rows,
    dryRun: false,
  })

  assert.deepStrictEqual(fakeSheets.calls.valuesClear, [
    {
      spreadsheetId: 'spreadsheet-1',
      range: 'General Ledger!A2:Z',
    },
  ])
  assert.deepStrictEqual(fakeSheets.calls.valuesAppend, [
    {
      spreadsheetId: 'spreadsheet-1',
      range: 'General Ledger!A2',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: rows },
    },
  ])
})

test('replaceSheet dry run skips clear and append', async () => {
  const fakeSheets = createFakeSheets()

  await sheetOperations.replaceSheet({
    sheets: fakeSheets,
    spreadsheetId: 'spreadsheet-1',
    sheetName: 'General Ledger',
    rows: [['2026-06-05', 'J-001']],
    dryRun: true,
  })

  assert.equal(fakeSheets.calls.valuesClear.length, 0)
  assert.equal(fakeSheets.calls.valuesAppend.length, 0)
})

test('upsertGeneralLedger deletes matching journal rows by sheetId then appends latest rows', async () => {
  const fakeSheets = createFakeSheets({
    sheetsMetadata: [
      { sheetId: 77, title: 'General Ledger' },
      { sheetId: 12, title: 'Audit Log' },
      { sheetId: 13, title: '_sync_log' },
    ],
    valuesByRange: {
      'General Ledger!A:P': [
        GL_HEADERS,
        ['2026-06-04', 'J-001', 'J-001', 1],
        ['2026-06-04', 'J-001', 'J-001', 2],
        ['2026-06-04', 'J-002', 'J-002', 1],
        ['2026-06-05', 'J-003', 'J-003', 1],
      ],
    },
  })

  const rows = [
    ['2026-06-06', 'J-001', 'J-001', 1],
    ['2026-06-06', 'J-001', 'J-001', 2],
    ['2026-06-06', 'J-003', 'J-003', 1],
  ]

  await sheetOperations.upsertGeneralLedger({
    sheets: fakeSheets,
    spreadsheetId: 'spreadsheet-1',
    schemas: DEFAULT_SCHEMAS,
    journalIds: ['J-001', 'J-003'],
    rows,
    dryRun: false,
  })

  assert.deepStrictEqual(fakeSheets.calls.batchUpdate, [
    {
      spreadsheetId: 'spreadsheet-1',
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: 77,
                dimension: 'ROWS',
                startIndex: 4,
                endIndex: 5,
              },
            },
          },
          {
            deleteDimension: {
              range: {
                sheetId: 77,
                dimension: 'ROWS',
                startIndex: 1,
                endIndex: 3,
              },
            },
          },
        ],
      },
    },
  ])
  assert.deepStrictEqual(fakeSheets.calls.valuesAppend, [
    {
      spreadsheetId: 'spreadsheet-1',
      range: 'General Ledger!A2',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: rows },
    },
  ])
})

test('upsertGeneralLedger deletes impacted IDs even when rows are empty', async () => {
  const fakeSheets = createFakeSheets({
    sheetsMetadata: [{ sheetId: 77, title: 'General Ledger' }],
    valuesByRange: {
      'General Ledger!A:P': [
        GL_HEADERS,
        ['2026-06-04', 'J-404', 'J-404', 1],
        ['2026-06-04', 'J-404', 'J-404', 2],
        ['2026-06-04', 'J-200', 'J-200', 1],
      ],
    },
  })

  await sheetOperations.upsertGeneralLedger({
    sheets: fakeSheets,
    spreadsheetId: 'spreadsheet-1',
    schemas: DEFAULT_SCHEMAS,
    journalIds: ['J-404'],
    rows: [],
    dryRun: false,
  })

  assert.deepStrictEqual(fakeSheets.calls.batchUpdate, [
    {
      spreadsheetId: 'spreadsheet-1',
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: 77,
                dimension: 'ROWS',
                startIndex: 1,
                endIndex: 3,
              },
            },
          },
        ],
      },
    },
  ])
  assert.equal(fakeSheets.calls.valuesAppend.length, 0)
})

test('upsertGeneralLedger uses supplied sheetId without requiring sheet metadata', async () => {
  const fakeSheets = createFakeSheets({
    sheetsMetadata: [],
    valuesByRange: {
      'General Ledger!A:P': [
        GL_HEADERS,
        ['2026-06-04', 'J-777', 'J-777', 1],
      ],
    },
  })

  await sheetOperations.upsertGeneralLedger({
    sheets: fakeSheets,
    spreadsheetId: 'spreadsheet-1',
    schemas: DEFAULT_SCHEMAS,
    sheetId: 88,
    journalIds: ['J-777'],
    rows: [['2026-06-06', 'J-777', 'J-777', 1]],
    dryRun: false,
  })

  assert.deepStrictEqual(fakeSheets.calls.batchUpdate, [
    {
      spreadsheetId: 'spreadsheet-1',
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: 88,
                dimension: 'ROWS',
                startIndex: 1,
                endIndex: 2,
              },
            },
          },
        ],
      },
    },
  ])
})

test('upsertGeneralLedger treats a single string journalId as one impacted journal', async () => {
  const fakeSheets = createFakeSheets({
    sheetsMetadata: [{ sheetId: 77, title: 'General Ledger' }],
    valuesByRange: {
      'General Ledger!A:P': [
        GL_HEADERS,
        ['2026-06-04', 'J-404', 'J-404', 1],
        ['2026-06-04', 'J-404', 'J-404', 2],
      ],
    },
  })

  await sheetOperations.upsertGeneralLedger({
    sheets: fakeSheets,
    spreadsheetId: 'spreadsheet-1',
    schemas: DEFAULT_SCHEMAS,
    journalIds: 'J-404',
    rows: [],
    dryRun: false,
  })

  assert.deepStrictEqual(fakeSheets.calls.batchUpdate, [
    {
      spreadsheetId: 'spreadsheet-1',
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: 77,
                dimension: 'ROWS',
                startIndex: 1,
                endIndex: 3,
              },
            },
          },
        ],
      },
    },
  ])
})

test('upsertGeneralLedger dry run never writes, clears, appends, or batch deletes', async () => {
  const fakeSheets = createFakeSheets({
    sheetsMetadata: [{ sheetId: 77, title: 'General Ledger' }],
    valuesByRange: {
      'General Ledger!A:P': [GL_HEADERS],
    },
  })

  await sheetOperations.upsertGeneralLedger({
    sheets: fakeSheets,
    spreadsheetId: 'spreadsheet-1',
    schemas: DEFAULT_SCHEMAS,
    journalIds: ['J-001'],
    rows: [['2026-06-06', 'J-001', 'J-001', 1]],
    dryRun: true,
  })

  assert.equal(fakeSheets.calls.batchUpdate.length, 0)
  assert.equal(fakeSheets.calls.valuesUpdate.length, 0)
  assert.equal(fakeSheets.calls.valuesAppend.length, 0)
  assert.equal(fakeSheets.calls.valuesClear.length, 0)
})
