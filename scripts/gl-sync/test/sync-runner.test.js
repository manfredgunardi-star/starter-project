'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  ALL_SHEET_SCHEMAS,
  getImpactedJournalIds,
  getYesterdayWIBRange,
  runSync,
} = require('../index')

function makeDoc(id, data) {
  return {
    id,
    exists: Boolean(data),
    data: () => data,
  }
}

function compareValues(left, right) {
  return String(left || '').localeCompare(String(right || ''))
}

function createQuery(collections, name, filters = [], orderField = null) {
  return {
    where(field, operator, value) {
      return createQuery(collections, name, [...filters, { field, operator, value }], orderField)
    },
    orderBy(field) {
      return createQuery(collections, name, filters, field)
    },
    async get() {
      let records = collections[name] || []
      for (const filter of filters) {
        records = records.filter((record) => {
          const value = record.data[filter.field]
          if (filter.operator === '>=') return value >= filter.value
          if (filter.operator === '<') return value < filter.value
          if (filter.operator === '==') return value === filter.value
          return true
        })
      }
      if (orderField) {
        records = [...records].sort((left, right) => compareValues(left.data[orderField], right.data[orderField]))
      }
      return { docs: records.map((record) => makeDoc(record.id, record.data)) }
    },
  }
}

function createFakeDb(rawCollections) {
  const collections = Object.fromEntries(Object.entries(rawCollections).map(([name, records]) => [
    name,
    records.map((record) => ({ id: record.id, data: { ...record } })),
  ]))

  return {
    collection(name) {
      const query = createQuery(collections, name)
      return {
        ...query,
        doc(id) {
          return {
            async get() {
              const record = (collections[name] || []).find((item) => item.id === id)
              return makeDoc(id, record && record.data)
            },
          }
        },
      }
    },
  }
}

function createHeaders(overrides = {}) {
  return Object.fromEntries(ALL_SHEET_SCHEMAS.map((schema) => [
    schema.headerRange,
    [overrides[schema.title] || schema.headers],
  ]))
}

function createFakeSheets({
  headers = createHeaders(),
  syncLogRows = [['Tanggal (WIB)', 'Status']],
  glRows = [],
  missingTitles = [],
  requireSyncLogProvisioning = false,
} = {}) {
  const calls = {
    append: [],
    batchUpdate: [],
    clear: [],
    get: [],
    sequence: [],
    update: [],
  }
  let syncLogProvisioned = !requireSyncLogProvisioning
  const metadata = ALL_SHEET_SCHEMAS
    .filter((schema) => !missingTitles.includes(schema.title))
    .map((schema, index) => ({
      properties: {
        sheetId: index + 100,
        title: schema.title,
      },
    }))

  const sheets = {
    calls,
    spreadsheets: {
      async get() {
        calls.get.push({ type: 'metadata' })
        return { data: { sheets: metadata } }
      },
      async batchUpdate(request) {
        calls.batchUpdate.push(request)
        for (const operation of request.requestBody.requests || []) {
          if (operation.addSheet) {
            metadata.push({ properties: { sheetId: metadata.length + 100, title: operation.addSheet.properties.title } })
          }
        }
        return { data: {} }
      },
      values: {
        async get(request) {
          calls.get.push(request)
          calls.sequence.push({ type: 'get', range: request.range })
          if (request.range === '_sync_log!A:B') {
            if (!syncLogProvisioned) throw new Error('_sync_log belum ada')
            return { data: { values: syncLogRows } }
          }
          if (request.range === 'General Ledger!A:P') return { data: { values: glRows } }
          return { data: { values: headers[request.range] || [] } }
        },
        async update(request) {
          calls.update.push(request)
          calls.sequence.push({ type: 'update', range: request.range })
          if (request.range === '_sync_log!A1:E1') syncLogProvisioned = true
          return { data: {} }
        },
        async append(request) {
          calls.append.push(request)
          return { data: {} }
        },
        async clear(request) {
          calls.clear.push(request)
          return { data: {} }
        },
      },
    },
  }

  return sheets
}

function createJournal(id, overrides = {}) {
  return {
    id,
    date: '2026-06-05',
    type: 'umum',
    description: `Journal ${id}`,
    truckId: 'B 1234 BUL',
    createdAt: '2026-06-05T18:00:00.000Z',
    createdBy: 'tester',
    status: 'posted',
    lines: [
      { accountCode: '1111', debit: 100, credit: 0, keterangan: `Debit ${id}` },
      { accountCode: '4100', debit: 0, credit: 100, keterangan: `Credit ${id}` },
    ],
    ...overrides,
  }
}

test('getYesterdayWIBRange returns the completed WIB date window', () => {
  const range = getYesterdayWIBRange(new Date('2026-06-06T17:00:00.000Z'))

  assert.equal(range.dateStr, '2026-06-06')
  assert.equal(range.start.toISOString(), '2026-06-05T17:00:00.000Z')
  assert.equal(range.end.toISOString(), '2026-06-06T17:00:00.000Z')
})

test('getImpactedJournalIds combines created journals and audit mutations without duplicates', () => {
  assert.deepEqual(
    getImpactedJournalIds(
      [{ _docId: 'J1' }, { id: 'J2' }],
      [{ journalId: 'J2' }, { journalId: 'J3' }]
    ),
    ['J1', 'J2', 'J3']
  )
})

test('runSync daily upserts created, updated, and deleted journals, then refreshes consultant sheets', async () => {
  const db = createFakeDb({
    journals: [
      createJournal('JNEW'),
      createJournal('JUPD', { createdAt: '2026-05-01T00:00:00.000Z', lines: [
        { accountCode: '1111', debit: 200, credit: 0, keterangan: 'Kas update' },
        { accountCode: '4100', debit: 0, credit: 200, keterangan: 'Pendapatan update' },
      ] }),
      createJournal('JDEL', { createdAt: '2026-05-01T00:00:00.000Z', status: 'deleted', deletedAt: '2026-06-05T20:30:00.000Z' }),
    ],
    audit_log: [
      { id: 'A1', journalId: 'JUPD', action: 'update', at: '2026-06-05T18:00:00.000Z', by: 'tester' },
      { id: 'A2', journalId: 'JDEL', action: 'delete', at: '2026-06-05T19:00:00.000Z', by: 'tester' },
    ],
    coa: [],
    invoices: [],
    assets: [],
  })
  const sheets = createFakeSheets({
    glRows: [
      ALL_SHEET_SCHEMAS[0].headers,
      ['2026-06-01', 'JUPD', 'JUPD', 1],
      ['2026-06-01', 'JDEL', 'JDEL', 1],
    ],
  })

  const result = await runSync({
    db,
    sheets,
    spreadsheetId: 'sheet-1',
    now: new Date('2026-06-06T17:00:00.000Z'),
    logger: { log() {} },
  })

  assert.equal(result.status, 'success')
  assert.deepEqual(result.impactedJournalIds, ['JNEW', 'JUPD', 'JDEL'])

  const glAppend = sheets.calls.append.find((call) => call.range === 'General Ledger!A2')
  assert.ok(glAppend)
  assert.deepEqual([...new Set(glAppend.requestBody.values.map((row) => row[1]))], ['JNEW', 'JUPD', 'JDEL'])
  assert.ok(glAppend.requestBody.values.some((row) => row[1] === 'JDEL' && row[11] === 'Dihapus'))
  assert.ok(glAppend.requestBody.values.every((row) => row[8] !== row[7]))

  assert.equal(sheets.calls.clear.filter((call) => call.range === 'Audit Log!A2:Z').length, 1)
  const auditAppend = sheets.calls.append.find((call) => call.range === 'Audit Log!A2')
  assert.equal(auditAppend.requestBody.values.length, 2)
  assert.equal(sheets.calls.clear.filter((call) => call.range.includes('Review Jurnal')).length, 1)
  assert.equal(sheets.calls.append.filter((call) => call.range === '_sync_log!A2').length, 1)
  assert.ok(sheets.calls.batchUpdate.some((call) => call.requestBody.requests[0].deleteDimension))
})

test('runSync daily refreshes full Audit Log instead of appending only daily audit entries', async () => {
  const db = createFakeDb({
    journals: [createJournal('JUPD', { createdAt: '2026-05-01T00:00:00.000Z' })],
    audit_log: [
      { id: 'AOLD', journalId: 'JOLD', action: 'update', at: '2026-06-01T10:00:00.000Z', by: 'tester' },
      { id: 'ANEW', journalId: 'JUPD', action: 'update', at: '2026-06-05T18:00:00.000Z', by: 'tester' },
    ],
    coa: [],
    invoices: [],
    assets: [],
  })
  const sheets = createFakeSheets()

  await runSync({
    db,
    sheets,
    spreadsheetId: 'sheet-1',
    now: new Date('2026-06-06T17:00:00.000Z'),
    logger: { log() {} },
  })

  assert.equal(sheets.calls.clear.filter((call) => call.range === 'Audit Log!A2:Z').length, 1)
  const auditAppend = sheets.calls.append.find((call) => call.range === 'Audit Log!A2')
  assert.deepEqual(auditAppend.requestBody.values.map((row) => row[1]), ['JOLD', 'JUPD'])
})

test('runSync provisions _sync_log before daily dedup check on a new spreadsheet', async () => {
  const db = createFakeDb({
    journals: [createJournal('JNEW')],
    audit_log: [],
    coa: [],
    invoices: [],
    assets: [],
  })
  const sheets = createFakeSheets({
    missingTitles: ['_sync_log'],
    requireSyncLogProvisioning: true,
  })

  const result = await runSync({
    db,
    sheets,
    spreadsheetId: 'sheet-1',
    now: new Date('2026-06-06T17:00:00.000Z'),
    logger: { log() {} },
  })

  assert.equal(result.status, 'success')
  const syncLogReadIndex = sheets.calls.sequence.findIndex((call) => call.type === 'get' && call.range === '_sync_log!A:B')
  const syncLogHeaderIndex = sheets.calls.sequence.findIndex((call) => call.type === 'update' && call.range === '_sync_log!A1:E1')
  assert.ok(syncLogHeaderIndex >= 0)
  assert.ok(syncLogReadIndex > syncLogHeaderIndex)
})

test('runSync dry run skips daily dedup check when _sync_log is missing', async () => {
  const db = createFakeDb({
    journals: [createJournal('JNEW')],
    audit_log: [],
    coa: [],
    invoices: [],
    assets: [],
  })
  const sheets = createFakeSheets({
    missingTitles: ['_sync_log'],
    requireSyncLogProvisioning: true,
  })

  const result = await runSync({
    db,
    sheets,
    spreadsheetId: 'sheet-1',
    dryRun: true,
    now: new Date('2026-06-06T17:00:00.000Z'),
    logger: { log() {} },
  })

  assert.equal(result.status, 'success')
  assert.equal(sheets.calls.sequence.some((call) => call.type === 'get' && call.range === '_sync_log!A:B'), false)
  assert.equal(sheets.calls.append.length, 0)
  assert.equal(sheets.calls.batchUpdate.length, 0)
  assert.equal(sheets.calls.clear.length, 0)
  assert.equal(sheets.calls.update.length, 0)
})

test('runSync deletes stale ledger rows when an audited journal document is missing', async () => {
  const db = createFakeDb({
    journals: [],
    audit_log: [
      { id: 'A1', journalId: 'JMISSING', action: 'delete', at: '2026-06-05T18:00:00.000Z', by: 'tester' },
    ],
    coa: [],
    invoices: [],
    assets: [],
  })
  const sheets = createFakeSheets({
    glRows: [
      ALL_SHEET_SCHEMAS[0].headers,
      ['2026-06-01', 'JMISSING', 'JMISSING', 1],
    ],
  })

  const result = await runSync({
    db,
    sheets,
    spreadsheetId: 'sheet-1',
    now: new Date('2026-06-06T17:00:00.000Z'),
    logger: { log() {} },
  })

  assert.deepEqual(result.impactedJournalIds, ['JMISSING'])
  assert.equal(sheets.calls.append.some((call) => call.range === 'General Ledger!A2'), false)
  assert.ok(sheets.calls.batchUpdate.some((call) => call.requestBody.requests[0].deleteDimension))
})

test('runSync dry run performs reads but no sheet writes', async () => {
  const db = createFakeDb({
    journals: [createJournal('JNEW')],
    audit_log: [],
    coa: [],
    invoices: [],
    assets: [],
  })
  const sheets = createFakeSheets()

  const result = await runSync({
    db,
    sheets,
    spreadsheetId: 'sheet-1',
    dryRun: true,
    now: new Date('2026-06-06T17:00:00.000Z'),
    logger: { log() {} },
  })

  assert.equal(result.status, 'success')
  assert.equal(sheets.calls.append.length, 0)
  assert.equal(sheets.calls.batchUpdate.length, 0)
  assert.equal(sheets.calls.clear.length, 0)
  assert.equal(sheets.calls.update.length, 0)
  assert.ok(sheets.calls.get.length > 0)
})

test('runSync blocks legacy General Ledger headers during daily sync before writing data', async () => {
  const db = createFakeDb({
    journals: [createJournal('JNEW')],
    audit_log: [],
    coa: [],
    invoices: [],
    assets: [],
  })
  const sheets = createFakeSheets({
    headers: createHeaders({
      'General Ledger': ['Tanggal', 'No. Jurnal', 'Deskripsi', 'Truck', 'Kode Akun', 'Nama Akun', 'Debit (Rp)', 'Kredit (Rp)', 'Dibuat Oleh', 'Waktu Sync (WIB)'],
    }),
  })

  await assert.rejects(
    runSync({
      db,
      sheets,
      spreadsheetId: 'sheet-1',
      now: new Date('2026-06-06T17:00:00.000Z'),
      logger: { log() {} },
    }),
    /FULL_SYNC=true/
  )
  assert.equal(sheets.calls.append.length, 0)
  assert.equal(sheets.calls.batchUpdate.length, 0)
  assert.equal(sheets.calls.clear.length, 0)
})

test('runSync full sync replaces General Ledger, Audit Log, and consultant sheets', async () => {
  const db = createFakeDb({
    journals: [createJournal('JFULL')],
    audit_log: [
      { id: 'A1', journalId: 'JFULL', action: 'update', at: '2026-06-01T10:00:00.000Z', by: 'tester' },
    ],
    coa: [],
    invoices: [],
    assets: [],
  })
  const sheets = createFakeSheets({
    headers: createHeaders({
      'General Ledger': ['Tanggal', 'No. Jurnal', 'Deskripsi', 'Truck', 'Kode Akun', 'Nama Akun', 'Debit (Rp)', 'Kredit (Rp)', 'Dibuat Oleh', 'Waktu Sync (WIB)'],
    }),
  })

  const result = await runSync({
    db,
    sheets,
    spreadsheetId: 'sheet-1',
    fullSync: true,
    now: new Date('2026-06-06T17:00:00.000Z'),
    logger: { log() {} },
  })

  assert.equal(result.status, 'full-sync')
  assert.equal(sheets.calls.update.some((call) => call.range === 'General Ledger!A1:P1'), true)
  assert.equal(sheets.calls.clear.some((call) => call.range === 'General Ledger!A2:Z'), true)
  assert.equal(sheets.calls.clear.some((call) => call.range === 'Audit Log!A2:Z'), true)
  assert.equal(sheets.calls.append.some((call) => call.range === 'General Ledger!A2'), true)
  assert.equal(sheets.calls.append.some((call) => call.range === '_sync_log!A2'), true)
  assert.equal(sheets.calls.clear.filter((call) => call.range.includes('Trial Balance Bulanan')).length, 1)
})
