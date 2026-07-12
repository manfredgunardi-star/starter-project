/**
 * BUL Monitor Sync
 * ─────────────────────────────────────────────────────────────────────────────
 * Membaca data Firestore (project: bul-monitor) dan menulis ke Google Sheets.
 *
 * Business rules:
 *   1. Full refresh untuk semua sheet bisnis (clear data lama di bawah header).
 *   2. Ambil hanya data aktif dari koleksi bul_*.
 *   3. Surat Jalan membaca koleksi baru + legacy, lalu merge berdasarkan field id.
 *   4. Sheet "_sync_log" tidak pernah di-clear, hanya append satu baris per run.
 *
 * Auth: Application Default Credentials (di-set oleh google-github-actions/auth@v2)
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict'

const { Firestore } = require('@google-cloud/firestore')
const { google } = require('googleapis')

const {
  SHEETS,
  toWIBString,
  toSortTime,
  isActive,
  buildSuratJalanRows,
  buildInvoiceRows,
  buildBiayaRows,
  buildArmadaRows,
  buildSupirRows,
  buildRuteRows,
  buildPelangganRows
} = require('./lib/row-builders')

// ─── Config ─────────────────────────────────────────────────────────────────

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID
const SPREADSHEET_ID      = process.env.GOOGLE_SPREADSHEET_ID
const DRY_RUN             = process.env.DRY_RUN === 'true'

if (!FIREBASE_PROJECT_ID) {
  console.error('❌ FIREBASE_PROJECT_ID environment variable tidak di-set.')
  process.exit(1)
}

if (!SPREADSHEET_ID) {
  console.error('❌ GOOGLE_SPREADSHEET_ID environment variable tidak di-set.')
  process.exit(1)
}

// ─── Init Firestore (@google-cloud/firestore — supports WIF natively) ────────

const db = new Firestore({ projectId: FIREBASE_PROJECT_ID })

// ─── Init Google Sheets API (juga menggunakan ADC) ──────────────────────────

const auth = new google.auth.GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
})
const sheets = google.sheets({ version: 'v4', auth })

// ─── Firestore Queries ──────────────────────────────────────────────────────

async function getCollectionRows(collectionName, filterFn = isActive) {
  const snapshot = await db.collection(collectionName).get()
  return snapshot.docs
    .map(doc => ({ _docId: doc.id, ...doc.data() }))
    .filter(filterFn)
}

async function getSuratJalanRows() {
  const [currentRows, legacyRows] = await Promise.all([
    getCollectionRows('bul_surat_jalan'),
    getCollectionRows('bul_suratJalan')
  ])

  const merged = new Map()
  for (const row of [...currentRows, ...legacyRows]) {
    const normalized = {
      ...row,
      id: row.id || row._docId,
      tanggalSJ: row.tanggalSJ || row.tglSJ || row.tgl_sj || row.tanggal || ''
    }
    const existing = merged.get(normalized.id)
    if (!existing || toSortTime(normalized.updatedAt) > toSortTime(existing.updatedAt)) {
      merged.set(normalized.id, normalized)
    }
  }

  return Array.from(merged.values())
}

// ─── Sheet Operations ───────────────────────────────────────────────────────

async function ensureSheetTabs() {
  const res = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID })
  const existing = new Set((res.data.sheets || []).map(sheet => sheet.properties.title))
  const missing = SHEETS.filter(sheet => !existing.has(sheet.name))

  if (missing.length === 0) return new Set()

  if (DRY_RUN) {
    console.log(`  [DRY RUN] Akan membuat sheet: ${missing.map(sheet => sheet.name).join(', ')}`)
    return new Set(missing.map(sheet => sheet.name))
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: missing.map(sheet => ({
        addSheet: { properties: { title: sheet.name } }
      }))
    }
  })

  missing.forEach(sheet => console.log(`  📋 Sheet dibuat: ${sheet.name}`))
  return new Set()
}

/**
 * Pastikan baris header ada di setiap sheet (jika belum diisi).
 */
async function ensureHeaders() {
  const dryRunMissingSheets = await ensureSheetTabs()

  for (const sheet of SHEETS) {
    if (dryRunMissingSheets.has(sheet.name)) {
      console.log(`  [DRY RUN] Akan tambah header ke sheet: ${sheet.name}`)
      continue
    }

    const range = `${sheet.name}!A1:Z1`
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range })

    if (!res.data.values || res.data.values.length === 0) {
      if (DRY_RUN) {
        console.log(`  [DRY RUN] Akan tambah header ke sheet: ${sheet.name}`)
        continue
      }

      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [sheet.headers] }
      })
      console.log(`  📋 Header ditambahkan ke sheet: ${sheet.name}`)
    }
  }
}

async function clearSheet(name) {
  if (DRY_RUN) {
    console.log(`  [DRY RUN] Akan hapus data di "${name}" (kecuali header)`)
    return
  }

  await sheets.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range: `${name}!A2:Z100000`
  })
}

async function appendRows(name, rows) {
  if (rows.length === 0) return

  if (DRY_RUN) {
    console.log(`  [DRY RUN] Akan append ${rows.length} baris ke "${name}"`)
    return
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${name}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows }
  })
}

async function refreshSheet(name, rows) {
  console.log(`📊 Refresh "${name}": ${rows.length} baris`)
  await clearSheet(name)
  await appendRows(name, rows)
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const runTimestamp = toWIBString(new Date().toISOString())

  console.log('═══════════════════════════════════════════════════════════')
  console.log('  BUL Monitor Firestore → Google Sheets Sync')
  console.log('  Mode          : 🔄 FULL REFRESH')
  console.log(`  Firebase      : ${FIREBASE_PROJECT_ID}`)
  console.log(`  Spreadsheet   : ${SPREADSHEET_ID}`)
  console.log(`  DRY RUN       : ${DRY_RUN ? '🧪 YA' : '🚀 TIDAK'}`)
  console.log('═══════════════════════════════════════════════════════════')

  console.log('\n🔧 Memastikan sheet dan header...')
  await ensureHeaders()

  console.log('\n📡 Mengambil data dari Firestore...')
  const [
    suratJalan,
    invoices,
    biaya,
    trucks,
    supir,
    rute,
    pelanggan
  ] = await Promise.all([
    getSuratJalanRows(),
    getCollectionRows('bul_invoices', row => row.isActive !== false),
    getCollectionRows('bul_biaya'),
    getCollectionRows('bul_trucks'),
    getCollectionRows('bul_supir'),
    getCollectionRows('bul_rute'),
    getCollectionRows('bul_pelanggan')
  ])

  console.log(`  ✓ Surat Jalan : ${suratJalan.length}`)
  console.log(`  ✓ Invoice     : ${invoices.length}`)
  console.log(`  ✓ Biaya       : ${biaya.length}`)
  console.log(`  ✓ Armada      : ${trucks.length}`)
  console.log(`  ✓ Supir       : ${supir.length}`)
  console.log(`  ✓ Rute        : ${rute.length}`)
  console.log(`  ✓ Pelanggan   : ${pelanggan.length}`)

  const sjMap = new Map(suratJalan.map(s => [s.id, s]))

  const suratJalanRows = buildSuratJalanRows(suratJalan, runTimestamp)
  const invoiceRows    = buildInvoiceRows(invoices, runTimestamp)
  const biayaRows      = buildBiayaRows(biaya, sjMap, runTimestamp)
  const armadaRows     = buildArmadaRows(trucks)
  const supirRows      = buildSupirRows(supir)
  const ruteRows       = buildRuteRows(rute)
  const pelangganRows  = buildPelangganRows(pelanggan)

  console.log('\n📊 Menulis full refresh ke Google Sheets...')
  await refreshSheet('Surat Jalan', suratJalanRows)
  await refreshSheet('Invoice', invoiceRows)
  await refreshSheet('Biaya Tambahan', biayaRows)
  await refreshSheet('Armada', armadaRows)
  await refreshSheet('Supir', supirRows)
  await refreshSheet('Rute', ruteRows)
  await refreshSheet('Pelanggan', pelangganRows)

  const finishedTimestamp = toWIBString(new Date().toISOString())
  const logRow = [
    runTimestamp,
    DRY_RUN ? 'dry-run' : 'success',
    suratJalanRows.length,
    invoiceRows.length,
    biayaRows.length,
    armadaRows.length,
    supirRows.length,
    ruteRows.length,
    pelangganRows.length,
    finishedTimestamp
  ]

  await appendRows('_sync_log', [logRow])

  console.log('\n✅ Sync selesai!')
  console.log(`   📄 Surat Jalan    : ${suratJalanRows.length} baris`)
  console.log(`   📄 Invoice        : ${invoiceRows.length} baris`)
  console.log(`   📄 Biaya Tambahan : ${biayaRows.length} baris`)
  console.log(`   📄 Armada         : ${armadaRows.length} baris`)
  console.log(`   📄 Supir          : ${supirRows.length} baris`)
  console.log(`   📄 Rute           : ${ruteRows.length} baris`)
  console.log(`   📄 Pelanggan      : ${pelangganRows.length} baris`)
  console.log(`   🕐 ${finishedTimestamp} WIB`)
  console.log('═══════════════════════════════════════════════════════════')
}

main().catch(err => {
  console.error('\n❌ BUL Monitor Sync gagal:', err.message || err)
  console.error(err.stack || '')
  process.exit(1)
})
