'use strict'

const { Firestore } = require('@google-cloud/firestore')
const { google } = require('googleapis')
const { buildAccountMap } = require('./lib/account-map')
const { buildGLRows, formatTimestampWIB } = require('./lib/general-ledger')
const {
  DEFAULT_SHEET_SCHEMAS,
  ensureSheetsAndHeaders,
  replaceSheet,
  upsertGeneralLedger,
} = require('./lib/sheet-operations')
const {
  CONSULTANT_SCHEMAS,
  buildJournalReviewRows,
  buildMonthlyTrialBalanceRows,
  buildMonthlyIncomeStatementRows,
  buildMonthlyBalanceSheetRows,
  buildAgingReceivableRows,
  buildTruckProfitabilityRows,
  buildAssetRows,
  buildCashBankReconciliationRows,
} = require('./lib/consultant-reports')

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'bul-accounting'
const DEFAULT_SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID
const DEFAULT_DRY_RUN = process.env.DRY_RUN === 'true'
const DEFAULT_FULL_SYNC = process.env.FULL_SYNC === 'true'
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000
const WIB_LOCALE_OPTIONS = { timeZone: 'Asia/Jakarta' }
const ALL_SHEET_SCHEMAS = [
  ...DEFAULT_SHEET_SCHEMAS,
  ...CONSULTANT_SCHEMAS,
]

function getYesterdayWIBRange(now = new Date()) {
  const nowUTC = new Date(now)
  const nowWIB = new Date(nowUTC.getTime() + WIB_OFFSET_MS)
  const yesterdayWIB = new Date(nowWIB)
  yesterdayWIB.setUTCDate(yesterdayWIB.getUTCDate() - 1)

  const startWIBMidnight = new Date(Date.UTC(
    yesterdayWIB.getUTCFullYear(),
    yesterdayWIB.getUTCMonth(),
    yesterdayWIB.getUTCDate(),
    0, 0, 0, 0
  ))
  const endWIBMidnight = new Date(Date.UTC(
    nowWIB.getUTCFullYear(),
    nowWIB.getUTCMonth(),
    nowWIB.getUTCDate(),
    0, 0, 0, 0
  ))

  return {
    start: new Date(startWIBMidnight.getTime() - WIB_OFFSET_MS),
    end: new Date(endWIBMidnight.getTime() - WIB_OFFSET_MS),
    dateStr: yesterdayWIB.toISOString().split('T')[0],
  }
}

function toWIBString(value) {
  if (!value) return ''
  try {
    return new Date(value).toLocaleString('id-ID', WIB_LOCALE_OPTIONS)
  } catch {
    return value
  }
}

function getDocumentId(record) {
  return String(record && (record._docId || record.id || ''))
}

function normalizeSnapshotDocs(snapshot) {
  return (snapshot.docs || []).map((doc) => ({ _docId: doc.id, ...doc.data() }))
}

function isAuditMutation(entry) {
  return entry && (entry.action === 'update' || entry.action === 'delete')
}

async function getCollectionDocuments(db, collectionName, orderByField) {
  let query = db.collection(collectionName)
  if (orderByField && typeof query.orderBy === 'function') {
    query = query.orderBy(orderByField, 'asc')
  }
  const snapshot = await query.get()
  return normalizeSnapshotDocs(snapshot)
}

async function getRangeDocuments(db, collectionName, field, start, end, orderByField = field) {
  const startISO = start.toISOString()
  const endISO = end.toISOString()
  const snapshot = await db.collection(collectionName)
    .where(field, '>=', startISO)
    .where(field, '<', endISO)
    .orderBy(orderByField, 'asc')
    .get()
  return normalizeSnapshotDocs(snapshot)
}

async function getNewJournals(db, start, end) {
  return getRangeDocuments(db, 'journals', 'createdAt', start, end)
}

async function getAuditEntries(db, start, end) {
  const entries = await getRangeDocuments(db, 'audit_log', 'at', start, end)
  return entries.filter(isAuditMutation)
}

async function getAllJournals(db) {
  return getCollectionDocuments(db, 'journals', 'createdAt')
}

async function getAllAuditEntries(db) {
  const entries = await getCollectionDocuments(db, 'audit_log', 'at')
  return entries.filter(isAuditMutation)
}

async function fetchJournalsByIds(db, journalIds) {
  const ids = [...new Set(Array.from(journalIds || []).filter(Boolean).map(String))]
  const snapshots = await Promise.all(ids.map((id) => db.collection('journals').doc(id).get()))

  return snapshots
    .filter((snapshot) => snapshot.exists)
    .map((snapshot) => ({ _docId: snapshot.id, ...snapshot.data() }))
}

async function checkAlreadyRun(sheets, spreadsheetId, dateStr) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: '_sync_log!A:B',
  })
  const rows = response.data.values || []
  return rows.slice(1).some((row) => row[0] === dateStr && row[1] === 'success')
}

async function appendRows({ sheets, spreadsheetId, sheetName, rows, dryRun }) {
  if (dryRun || !Array.isArray(rows) || rows.length === 0) return

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A2`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  })
}

function buildAuditRows(entries) {
  return (entries || []).map((entry) => [
    toWIBString(entry.at),
    entry.journalId || '',
    entry.action === 'delete' ? 'DIHAPUS' : 'DIUBAH',
    entry.journalDate || '',
    entry.journalDescription || entry.description || '',
    entry.by || '',
    entry.at || '',
  ])
}

function getImpactedJournalIds(newJournals, auditEntries) {
  return [...new Set([
    ...(newJournals || []).map(getDocumentId),
    ...(auditEntries || []).map((entry) => entry.journalId),
  ].filter(Boolean).map(String))]
}

function mergeImpactedJournals(newJournals, fetchedJournals) {
  const byId = new Map()
  for (const journal of newJournals || []) byId.set(getDocumentId(journal), journal)
  for (const journal of fetchedJournals || []) byId.set(getDocumentId(journal), journal)
  return byId
}

function buildConsultantSheetRows({ journals, invoices, assets, accountMap, asOfDate }) {
  return [
    { sheetName: 'Review Jurnal', rows: buildJournalReviewRows(journals, accountMap) },
    { sheetName: 'Trial Balance Bulanan', rows: buildMonthlyTrialBalanceRows(journals, accountMap) },
    { sheetName: 'Laba Rugi Bulanan', rows: buildMonthlyIncomeStatementRows(journals, accountMap) },
    { sheetName: 'Neraca Bulanan', rows: buildMonthlyBalanceSheetRows(journals, accountMap) },
    { sheetName: 'Aging Piutang', rows: buildAgingReceivableRows(invoices, journals, asOfDate) },
    { sheetName: 'Profitabilitas Truck', rows: buildTruckProfitabilityRows(journals) },
    { sheetName: 'Daftar Aset', rows: buildAssetRows(assets, journals, accountMap) },
    { sheetName: 'Rekonsiliasi Kas Bank', rows: buildCashBankReconciliationRows(journals, accountMap) },
  ]
}

async function refreshConsultantSheets({ sheets, spreadsheetId, consultantSheets, dryRun }) {
  for (const sheet of consultantSheets) {
    await replaceSheet({
      sheets,
      spreadsheetId,
      sheetName: sheet.sheetName,
      rows: sheet.rows,
      dryRun,
    })
  }
}

async function logSyncRun({ sheets, spreadsheetId, dateStr, status, journalCount, auditCount, syncTimestamp, dryRun }) {
  await appendRows({
    sheets,
    spreadsheetId,
    sheetName: '_sync_log',
    rows: [[dateStr, status, journalCount, auditCount, syncTimestamp]],
    dryRun,
  })
}

async function runSync({
  db,
  sheets,
  spreadsheetId,
  dryRun = false,
  fullSync = false,
  now = new Date(),
  logger = console,
}) {
  if (!spreadsheetId) {
    throw new Error('GOOGLE_SPREADSHEET_ID environment variable tidak di-set.')
  }

  const syncTimestamp = formatTimestampWIB(now)
  const dateRange = fullSync
    ? { dateStr: 'full-sync' }
    : getYesterdayWIBRange(now)

  logger.log(`BUL-Accounting GL Sync: ${fullSync ? 'FULL_SYNC' : dateRange.dateStr}`)

  if (!fullSync && await checkAlreadyRun(sheets, spreadsheetId, dateRange.dateStr)) {
    logger.log(`Sync untuk ${dateRange.dateStr} sudah pernah berhasil. Skip.`)
    return {
      dateStr: dateRange.dateStr,
      status: 'skipped',
      journalCount: 0,
      auditCount: 0,
      impactedJournalIds: [],
      reportRowCounts: {},
    }
  }

  const ensureResult = await ensureSheetsAndHeaders({
    sheets,
    spreadsheetId,
    schemas: ALL_SHEET_SCHEMAS,
    dryRun,
    fullSync,
  })

  const [
    customAccounts,
    allJournals,
    invoices,
    assets,
    activityJournals,
    auditEntries,
  ] = await Promise.all([
    getCollectionDocuments(db, 'coa'),
    getAllJournals(db),
    getCollectionDocuments(db, 'invoices'),
    getCollectionDocuments(db, 'assets'),
    fullSync ? Promise.resolve([]) : getNewJournals(db, dateRange.start, dateRange.end),
    fullSync ? getAllAuditEntries(db) : getAuditEntries(db, dateRange.start, dateRange.end),
  ])

  const accountMap = buildAccountMap(undefined, customAccounts)
  const allJournalRows = buildGLRows(allJournals, accountMap, now)
  const auditRows = buildAuditRows(auditEntries)
  const consultantSheets = buildConsultantSheetRows({
    journals: allJournals,
    invoices,
    assets,
    accountMap,
    asOfDate: dateRange.dateStr === 'full-sync' ? now.toISOString().split('T')[0] : dateRange.dateStr,
  })

  if (fullSync) {
    await replaceSheet({ sheets, spreadsheetId, sheetName: 'General Ledger', rows: allJournalRows, dryRun })
    await replaceSheet({ sheets, spreadsheetId, sheetName: 'Audit Log', rows: auditRows, dryRun })
  } else {
    const impactedJournalIds = getImpactedJournalIds(activityJournals, auditEntries)
    const fetchedJournals = await fetchJournalsByIds(db, impactedJournalIds)
    const impactedById = mergeImpactedJournals(activityJournals, fetchedJournals)
    const impactedJournals = impactedJournalIds.map((id) => impactedById.get(id)).filter(Boolean)
    const glRows = buildGLRows(impactedJournals, accountMap, now)

    if (impactedJournalIds.length > 0) {
      await upsertGeneralLedger({
        sheets,
        spreadsheetId,
        schemas: ALL_SHEET_SCHEMAS,
        journalIds: impactedJournalIds,
        rows: glRows,
        dryRun,
      })
    }

    if (auditRows.length > 0) {
      await appendRows({ sheets, spreadsheetId, sheetName: 'Audit Log', rows: auditRows, dryRun })
    }
  }

  await refreshConsultantSheets({ sheets, spreadsheetId, consultantSheets, dryRun })

  const impactedJournalIds = fullSync
    ? allJournals.map(getDocumentId).filter(Boolean)
    : getImpactedJournalIds(activityJournals, auditEntries)
  const status = fullSync ? 'full-sync' : (impactedJournalIds.length > 0 || auditEntries.length > 0 ? 'success' : 'no-activity')

  await logSyncRun({
    sheets,
    spreadsheetId,
    dateStr: dateRange.dateStr,
    status,
    journalCount: fullSync ? allJournals.length : impactedJournalIds.length,
    auditCount: auditEntries.length,
    syncTimestamp,
    dryRun,
  })

  const reportRowCounts = Object.fromEntries(consultantSheets.map((sheet) => [sheet.sheetName, sheet.rows.length]))
  logger.log(`Sync selesai: status=${status}, journals=${fullSync ? allJournals.length : impactedJournalIds.length}, audit=${auditEntries.length}`)

  return {
    dateStr: dateRange.dateStr,
    status,
    journalCount: fullSync ? allJournals.length : impactedJournalIds.length,
    auditCount: auditEntries.length,
    impactedJournalIds,
    glRowCount: fullSync ? allJournalRows.length : undefined,
    reportRowCounts,
    plannedOperations: ensureResult.plannedOperations,
  }
}

function createRuntime() {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })

  return {
    db: new Firestore({ projectId: FIREBASE_PROJECT_ID }),
    sheets: google.sheets({ version: 'v4', auth }),
  }
}

async function main() {
  const { db, sheets } = createRuntime()
  await runSync({
    db,
    sheets,
    spreadsheetId: DEFAULT_SPREADSHEET_ID,
    dryRun: DEFAULT_DRY_RUN,
    fullSync: DEFAULT_FULL_SYNC,
  })
}

if (require.main === module) {
  main().catch((error) => {
    console.error('GL Sync gagal:', error.message || error)
    console.error(error.stack || '')
    process.exit(1)
  })
}

module.exports = {
  ALL_SHEET_SCHEMAS,
  buildAuditRows,
  buildConsultantSheetRows,
  checkAlreadyRun,
  createRuntime,
  fetchJournalsByIds,
  getAllAuditEntries,
  getAllJournals,
  getAuditEntries,
  getImpactedJournalIds,
  getNewJournals,
  getYesterdayWIBRange,
  runSync,
  toWIBString,
}
