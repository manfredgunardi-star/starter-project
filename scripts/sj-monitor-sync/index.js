/**
 * SJ-Monitor Sync
 * ─────────────────────────────────────────────────────────────────────────────
 * Membaca data Firestore (project: surat-jalan-monitor) dan menulis ke
 * Google Sheets. Pola sama dengan scripts/bul-monitor-sync.
 *
 * Business rules:
 *   1. Full refresh untuk semua tab bisnis (clear data lama di bawah header).
 *   2. Ambil hanya data aktif (isActive !== false && !deletedAt).
 *   3. Invoice membaca koleksi utama `invoice` + legacy `invoices`, lalu
 *      di-merge per noInvoice (versi terbaru menang) — meniru App.jsx.
 *   4. Tab "_sync_log" tidak pernah di-clear, hanya append satu baris per run.
 *   5. Semua string di-escape terhadap formula injection (lihat row-builders).
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
  isActiveRow,
  normalizeSJ,
  normalizeInvoice,
  mergeInvoices,
  buildSuratJalanRows,
  buildInvoiceRows,
  buildBiayaRows,
  buildUangMukaRows,
  buildTransaksiRows,
  buildArmadaRows,
  buildSupirRows,
  buildRuteRows,
  buildMaterialRows,
  buildTarifRuteRows
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

async function getCollectionRows(collectionName, { normalize, filterFn = isActiveRow } = {}) {
  const snapshot = await db.collection(collectionName).get()
  return snapshot.docs
    .map(doc => {
      const raw = { _docId: doc.id, ...doc.data() }
      const withId = { ...raw, id: raw.id || doc.id }
      return normalize ? normalize(withId, doc.id) : withId
    })
    .filter(filterFn)
}

async function getMergedInvoices() {
  const keepAll = () => true
  const [primary, legacy] = await Promise.all([
    getCollectionRows('invoice', { normalize: normalizeInvoice, filterFn: keepAll }),
    getCollectionRows('invoices', { normalize: normalizeInvoice, filterFn: keepAll })
  ])
  // mergeInvoices sudah memfilter data aktif setelah digabung (meniru App.jsx)
  return mergeInvoices(primary, legacy)
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
 * Pastikan baris header ada di setiap sheet.
 * Satu batchGet untuk semua header (bukan satu GET per sheet).
 */
async function ensureHeaders() {
  const dryRunMissingSheets = await ensureSheetTabs()

  const sheetsToCheck = SHEETS.filter(sheet => !dryRunMissingSheets.has(sheet.name))
  dryRunMissingSheets.forEach(name => console.log(`  [DRY RUN] Akan tambah header ke sheet: ${name}`))

  if (sheetsToCheck.length === 0) return

  const res = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: SPREADSHEET_ID,
    ranges: sheetsToCheck.map(sheet => `${sheet.name}!A1:Z1`)
  })

  const valueRanges = res.data.valueRanges || []

  for (let i = 0; i < sheetsToCheck.length; i++) {
    const sheet = sheetsToCheck[i]
    const values = valueRanges[i]?.values

    if (!values || values.length === 0) {
      if (DRY_RUN) {
        console.log(`  [DRY RUN] Akan tambah header ke sheet: ${sheet.name}`)
        continue
      }

      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheet.name}!A1:Z1`,
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
  const runTimestamp = toWIBString(new Date())

  console.log('═══════════════════════════════════════════════════════════')
  console.log('  SJ-Monitor Firestore → Google Sheets Sync')
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
    uangMuka,
    transaksi,
    trucks,
    supir,
    rute,
    material,
    tarifRute
  ] = await Promise.all([
    getCollectionRows('surat_jalan', { normalize: normalizeSJ }),
    getMergedInvoices(),
    getCollectionRows('biaya'),
    getCollectionRows('uang_muka'),
    getCollectionRows('transaksi'),
    getCollectionRows('trucks'),
    getCollectionRows('supir'),
    getCollectionRows('rute'),
    getCollectionRows('material'),
    getCollectionRows('tarif_rute')
  ])

  console.log(`  ✓ Surat Jalan : ${suratJalan.length}`)
  console.log(`  ✓ Invoice     : ${invoices.length}`)
  console.log(`  ✓ Biaya       : ${biaya.length}`)
  console.log(`  ✓ Uang Muka   : ${uangMuka.length}`)
  console.log(`  ✓ Transaksi   : ${transaksi.length}`)
  console.log(`  ✓ Armada      : ${trucks.length}`)
  console.log(`  ✓ Supir       : ${supir.length}`)
  console.log(`  ✓ Rute        : ${rute.length}`)
  console.log(`  ✓ Material    : ${material.length}`)
  console.log(`  ✓ Tarif Rute  : ${tarifRute.length}`)

  const sjMap   = new Map(suratJalan.map(s => [s.id, s]))
  const ruteMap = new Map(rute.map(r => [String(r.id), r]))

  const suratJalanRows = buildSuratJalanRows(suratJalan, runTimestamp)
  const invoiceRows    = buildInvoiceRows(invoices, runTimestamp)
  const biayaRows      = buildBiayaRows(biaya, sjMap, runTimestamp)
  const uangMukaRows   = buildUangMukaRows(uangMuka, runTimestamp)
  const transaksiRows  = buildTransaksiRows(transaksi, sjMap, runTimestamp)
  const armadaRows     = buildArmadaRows(trucks)
  const supirRows      = buildSupirRows(supir)
  const ruteRows       = buildRuteRows(rute)
  const materialRows   = buildMaterialRows(material)
  const tarifRuteRows  = buildTarifRuteRows(tarifRute, ruteMap)

  console.log('\n📊 Menulis full refresh ke Google Sheets...')
  await refreshSheet('Surat Jalan', suratJalanRows)
  await refreshSheet('Invoice', invoiceRows)
  await refreshSheet('Biaya Tambahan', biayaRows)
  await refreshSheet('Uang Muka', uangMukaRows)
  await refreshSheet('Transaksi', transaksiRows)
  await refreshSheet('Armada', armadaRows)
  await refreshSheet('Supir', supirRows)
  await refreshSheet('Rute', ruteRows)
  await refreshSheet('Material', materialRows)
  await refreshSheet('Tarif Rute', tarifRuteRows)

  const finishedTimestamp = toWIBString(new Date())
  const logRow = [
    runTimestamp,
    DRY_RUN ? 'dry-run' : 'success',
    suratJalanRows.length,
    invoiceRows.length,
    biayaRows.length,
    uangMukaRows.length,
    transaksiRows.length,
    armadaRows.length,
    supirRows.length,
    ruteRows.length,
    materialRows.length,
    tarifRuteRows.length,
    finishedTimestamp
  ]

  await appendRows('_sync_log', [logRow])

  console.log('\n✅ Sync selesai!')
  console.log(`   📄 Surat Jalan    : ${suratJalanRows.length} baris`)
  console.log(`   📄 Invoice        : ${invoiceRows.length} baris`)
  console.log(`   📄 Biaya Tambahan : ${biayaRows.length} baris`)
  console.log(`   📄 Uang Muka      : ${uangMukaRows.length} baris`)
  console.log(`   📄 Transaksi      : ${transaksiRows.length} baris`)
  console.log(`   📄 Armada         : ${armadaRows.length} baris`)
  console.log(`   📄 Supir          : ${supirRows.length} baris`)
  console.log(`   📄 Rute           : ${ruteRows.length} baris`)
  console.log(`   📄 Material       : ${materialRows.length} baris`)
  console.log(`   📄 Tarif Rute     : ${tarifRuteRows.length} baris`)
  console.log(`   🕐 ${finishedTimestamp} WIB`)
  console.log('═══════════════════════════════════════════════════════════')
}

main().catch(err => {
  console.error('\n❌ SJ-Monitor Sync gagal:', err.message || err)
  console.error(err.stack || '')
  process.exit(1)
})
