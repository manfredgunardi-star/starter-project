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

async function ensureSheetsAndHeaders({ sheets, spreadsheetId, dryRun = false, fullSync = false }) {
  const metadata = await getSheetMetadata(sheets, spreadsheetId)
  const requiredSheets = [
    { title: GL_SHEET_NAME, range: 'General Ledger!A1:P1', headers: GL_HEADERS },
    { title: AUDIT_SHEET_NAME, range: 'Audit Log!A1:G1', headers: AUDIT_HEADERS },
    { title: SYNC_LOG_SHEET_NAME, range: '_sync_log!A1:E1', headers: SYNC_LOG_HEADERS },
  ]

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

  for (const sheet of requiredSheets) {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: sheet.range,
    })
    const existingHeader = response.data.values && response.data.values[0]

    if (!existingHeader || existingHeader.length === 0) {
      await updateHeader({
        sheets,
        spreadsheetId,
        range: sheet.range,
        headers: sheet.headers,
        dryRun,
      })
      continue
    }

    if (isSameHeader(existingHeader, sheet.headers)) continue

    if (sheet.title === GL_SHEET_NAME && !fullSync) {
      throw new Error('Header General Ledger legacy terdeteksi. Jalankan FULL_SYNC=true untuk migrasi.')
    }

    await updateHeader({
      sheets,
      spreadsheetId,
      range: sheet.range,
      headers: sheet.headers,
      dryRun,
    })
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

async function upsertGeneralLedger({ sheets, spreadsheetId, rows = [], dryRun = false }) {
  const metadata = await getSheetMetadata(sheets, spreadsheetId)
  const sheet = findSheet(metadata, GL_SHEET_NAME)
  if (!sheet) {
    throw new Error('Sheet General Ledger tidak ditemukan.')
  }

  const existingResponse = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'General Ledger!A:P',
  })
  const existingRows = existingResponse.data.values || []
  const journalIds = [...new Set(rows.map((row) => row[1]).filter(Boolean))]
  const requests = buildJournalDeleteRequests(existingRows, journalIds, sheet.sheetId)

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
    sheetName: GL_SHEET_NAME,
    rows,
    dryRun,
  })
}

module.exports = {
  AUDIT_HEADERS,
  SYNC_LOG_HEADERS,
  ensureSheetsAndHeaders,
  replaceSheet,
  upsertGeneralLedger,
}
