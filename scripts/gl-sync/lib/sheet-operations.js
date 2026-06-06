'use strict'

const { GL_HEADERS, buildJournalDeleteRequests } = require('./general-ledger')

const GL_SHEET_NAME = 'General Ledger'
const AUDIT_SHEET_NAME = 'Audit Log'
const SYNC_LOG_SHEET_NAME = '_sync_log'

const AUDIT_HEADERS = [
  'Waktu Perubahan (WIB)',
  'No. Jurnal',
  'Aksi',
  'Tanggal Jurnal',
  'Deskripsi',
  'Dilakukan Oleh',
  'Timestamp ISO',
]

const SYNC_LOG_HEADERS = [
  'Tanggal (WIB)',
  'Status',
  'Jurnal Ditambahkan',
  'Audit Entries',
  'Selesai Pada (WIB)',
]

const DEFAULT_SHEET_SCHEMAS = [
  {
    title: GL_SHEET_NAME,
    headerRange: 'General Ledger!A1:P1',
    dataRange: 'General Ledger!A:P',
    appendRange: 'General Ledger!A2',
    clearRange: 'General Ledger!A2:Z',
    headers: GL_HEADERS,
    requireFullSyncForHeaderMismatch: true,
    mismatchError: 'Header General Ledger legacy terdeteksi. Jalankan FULL_SYNC=true untuk migrasi.',
  },
  {
    title: AUDIT_SHEET_NAME,
    headerRange: 'Audit Log!A1:G1',
    headers: AUDIT_HEADERS,
  },
  {
    title: SYNC_LOG_SHEET_NAME,
    headerRange: '_sync_log!A1:E1',
    headers: SYNC_LOG_HEADERS,
  },
]

function isSameHeader(actualRow, expectedRow) {
  if (!Array.isArray(actualRow)) return false
  if (actualRow.length !== expectedRow.length) return false
  return actualRow.every((value, index) => value === expectedRow[index])
}

async function getSheetMetadata(sheets, spreadsheetId) {
  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets(properties(sheetId,title))',
  })

  return (response.data.sheets || []).map((sheet) => sheet.properties || {})
}

function findSheet(metadata, title) {
  return metadata.find((sheet) => sheet.title === title) || null
}

function getSchemas(schemas) {
  return Array.isArray(schemas) && schemas.length > 0
    ? schemas
    : DEFAULT_SHEET_SCHEMAS
}

function planOperation(plannedOperations, operation) {
  plannedOperations.push(operation)
}

async function updateHeader({ sheets, spreadsheetId, range, headers, dryRun }) {
  if (dryRun) return

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'RAW',
    requestBody: {
      values: [headers],
    },
  })
}

async function appendRows({ sheets, spreadsheetId, sheetName, rows, dryRun }) {
  if (dryRun || !Array.isArray(rows) || rows.length === 0) return

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A2`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: rows,
    },
  })
}

async function ensureSheetsAndHeaders({ sheets, spreadsheetId, schemas, dryRun = false, fullSync = false }) {
  const metadata = await getSheetMetadata(sheets, spreadsheetId)
  const requiredSheets = getSchemas(schemas)
  const plannedOperations = []

  const missingSheets = requiredSheets.filter((sheet) => !findSheet(metadata, sheet.title))

  if (!dryRun && missingSheets.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: missingSheets.map((sheet) => ({
          addSheet: {
            properties: { title: sheet.title },
          },
        })),
      },
    })
  }

  for (const sheet of missingSheets) {
    planOperation(plannedOperations, { type: 'addSheet', title: sheet.title })
    planOperation(plannedOperations, { type: 'setHeader', title: sheet.title, range: sheet.headerRange })
  }

  for (const sheet of requiredSheets) {
    const existingSheet = findSheet(metadata, sheet.title)
    if (!existingSheet) {
      if (dryRun) continue

      await updateHeader({
        sheets,
        spreadsheetId,
        range: sheet.headerRange,
        headers: sheet.headers,
        dryRun,
      })
      continue
    }

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: sheet.headerRange,
    })
    const existingHeader = response.data.values && response.data.values[0]

    if (!existingHeader || existingHeader.length === 0) {
      planOperation(plannedOperations, { type: 'setHeader', title: sheet.title, range: sheet.headerRange })
      await updateHeader({
        sheets,
        spreadsheetId,
        range: sheet.headerRange,
        headers: sheet.headers,
        dryRun,
      })
      continue
    }

    if (isSameHeader(existingHeader, sheet.headers)) continue

    if (sheet.requireFullSyncForHeaderMismatch && !fullSync) {
      throw new Error(sheet.mismatchError || 'Header sheet tidak cocok. Jalankan FULL_SYNC=true untuk migrasi.')
    }

    planOperation(plannedOperations, { type: 'setHeader', title: sheet.title, range: sheet.headerRange })
    await updateHeader({
      sheets,
      spreadsheetId,
      range: sheet.headerRange,
      headers: sheet.headers,
      dryRun,
    })
  }

  return {
    plannedOperations,
    sheets: metadata,
  }
}

async function replaceSheet({ sheets, spreadsheetId, sheetName, rows = [], dryRun = false }) {
  if (dryRun) return

  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${sheetName}!A2:Z`,
  })

  await appendRows({
    sheets,
    spreadsheetId,
    sheetName,
    rows,
    dryRun,
  })
}

function getGeneralLedgerSchema(schemas) {
  const requiredSheets = getSchemas(schemas)
  return requiredSheets.find((sheet) => sheet.title === GL_SHEET_NAME) || DEFAULT_SHEET_SCHEMAS[0]
}

async function upsertGeneralLedger({ sheets, spreadsheetId, schemas, journalIds = [], rows = [], dryRun = false }) {
  const generalLedgerSchema = getGeneralLedgerSchema(schemas)
  const metadata = await getSheetMetadata(sheets, spreadsheetId)
  const sheet = findSheet(metadata, GL_SHEET_NAME)
  if (!sheet) {
    throw new Error('Sheet General Ledger tidak ditemukan.')
  }

  const existingResponse = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: generalLedgerSchema.dataRange || 'General Ledger!A:P',
  })
  const existingRows = existingResponse.data.values || []
  const impactedJournalIds = [...new Set([
    ...journalIds,
    ...rows.map((row) => row[1]).filter(Boolean),
  ].filter(Boolean))]
  const requests = buildJournalDeleteRequests(existingRows, impactedJournalIds, sheet.sheetId)

  if (!dryRun && requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests,
      },
    })
  }

  await appendRows({
    sheets,
    spreadsheetId,
    sheetName: generalLedgerSchema.title || GL_SHEET_NAME,
    rows,
    dryRun,
  })
}

module.exports = {
  AUDIT_HEADERS,
  DEFAULT_SHEET_SCHEMAS,
  SYNC_LOG_HEADERS,
  ensureSheetsAndHeaders,
  replaceSheet,
  upsertGeneralLedger,
}
