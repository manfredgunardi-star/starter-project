/**
 * BUL-Accounting GL Sync
 * ─────────────────────────────────────────────────────────────────────────────
 * Berjalan setiap tengah malam WIB via GitHub Actions.
 * Membaca data Firestore (project: bul-accounting) dan menulis ke Google Sheets.
 *
 * Business rules:
 *   1. Cek _sync_log — jika tanggal ini sudah di-sync, skip (dedup guard).
 *   2. Ambil jurnal yang DIBUAT kemarin (tanggal WIB sebelum midnight run).
 *   3. Ambil audit_log untuk aksi update/delete kemarin.
 *   4. Jika tidak ada aktivitas → log "no-activity", exit.
 *   5. Jurnal baru → APPEND ke sheet "General Ledger" (tidak pernah overwrite).
 *   6. Perubahan/penghapusan → APPEND ke sheet "Audit Log" (siapa + jam berapa).
 *   7. Log run ke sheet "_sync_log".
 *
 * Auth: Application Default Credentials (di-set oleh google-github-actions/auth@v2)
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict'

const { Firestore } = require('@google-cloud/firestore')
const { google } = require('googleapis')

// ─── Config ──────────────────────────────────────────────────────────────────

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'bul-accounting'
const SPREADSHEET_ID      = process.env.GOOGLE_SPREADSHEET_ID
const DRY_RUN             = process.env.DRY_RUN === 'true'
const FULL_SYNC           = process.env.FULL_SYNC === 'true'

if (!SPREADSHEET_ID) {
  console.error('❌ GOOGLE_SPREADSHEET_ID environment variable tidak di-set.')
  process.exit(1)
}

// ─── Init Firestore (@google-cloud/firestore — supports WIF natively) ────────

const db = new Firestore({ projectId: FIREBASE_PROJECT_ID })

// ─── Init Google Sheets API (juga menggunakan ADC) ───────────────────────────

const auth = new google.auth.GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
})
const sheets = google.sheets({ version: 'v4', auth })

// ─── Timezone Helper (WIB = UTC+7) ───────────────────────────────────────────

/**
 * Hitung range tanggal untuk hari KEMARIN dalam zona WIB.
 * Dipanggil saat midnight WIB, jadi kita sync hari yang baru selesai.
 *
 * @returns {{ start: Date, end: Date, dateStr: string }}
 *   start → kemarin 00:00 WIB (dalam UTC)
 *   end   → hari ini  00:00 WIB (dalam UTC) = sekarang
 *   dateStr → "YYYY-MM-DD" kemarin WIB (digunakan sebagai dedup key)
 */
function getYesterdayWIBRange() {
  const WIB_OFFSET_MS = 7 * 60 * 60 * 1000  // UTC+7

  const nowUTC = new Date()

  // Konversi "sekarang" ke WIB agar bisa tahu tanggal WIB-nya
  const nowWIB = new Date(nowUTC.getTime() + WIB_OFFSET_MS)

  // Kemarin dalam WIB
  const yesterdayWIB = new Date(nowWIB)
  yesterdayWIB.setUTCDate(yesterdayWIB.getUTCDate() - 1)

  // Kemarin midnight WIB → konversi ke UTC
  const startWIBmidnight = new Date(Date.UTC(
    yesterdayWIB.getUTCFullYear(),
    yesterdayWIB.getUTCMonth(),
    yesterdayWIB.getUTCDate(),
    0, 0, 0, 0
  ))
  const startUTC = new Date(startWIBmidnight.getTime() - WIB_OFFSET_MS)

  // Hari ini midnight WIB → konversi ke UTC (= sekarang saat cron berjalan)
  const endWIBmidnight = new Date(Date.UTC(
    nowWIB.getUTCFullYear(),
    nowWIB.getUTCMonth(),
    nowWIB.getUTCDate(),
    0, 0, 0, 0
  ))
  const endUTC = new Date(endWIBmidnight.getTime() - WIB_OFFSET_MS)

  // dateStr = tanggal kemarin WIB sebagai key dedup
  const dateStr = yesterdayWIB.toISOString().split('T')[0]  // "YYYY-MM-DD"

  return { start: startUTC, end: endUTC, dateStr }
}

// ─── Deduplication ───────────────────────────────────────────────────────────

/**
 * Cek apakah tanggal ini sudah di-sync sukses sebelumnya.
 * Cegah double-write jika workflow berjalan dua kali.
 */
async function checkAlreadyRun(dateStr) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: '_sync_log!A:B'
  })
  const rows = res.data.values || []
  // Skip baris header (baris pertama)
  return rows.slice(1).some(row => row[0] === dateStr && row[1] === 'success')
}

// ─── Firestore Queries ───────────────────────────────────────────────────────

/**
 * Ambil semua jurnal yang dibuat dalam rentang waktu tertentu.
 * Firestore stores createdAt as ISO string.
 */
async function getNewJournals(start, end) {
  const startISO = start.toISOString()
  const endISO   = end.toISOString()

  const snapshot = await db.collection('journals')
    .where('createdAt', '>=', startISO)
    .where('createdAt', '<',  endISO)
    .orderBy('createdAt', 'asc')
    .get()

  return snapshot.docs.map(doc => ({ _docId: doc.id, ...doc.data() }))
}

/**
 * Ambil semua audit_log entries untuk rentang waktu tertentu.
 * Filter update/delete di sisi JS untuk menghindari kebutuhan composite index.
 */
async function getAuditEntries(start, end) {
  const startISO = start.toISOString()
  const endISO   = end.toISOString()

  const snapshot = await db.collection('audit_log')
    .where('at', '>=', startISO)
    .where('at', '<',  endISO)
    .orderBy('at', 'asc')
    .get()

  // Hanya catat perubahan dan penghapusan (bukan pembuatan baru)
  return snapshot.docs
    .map(doc => doc.data())
    .filter(entry => entry.action === 'update' || entry.action === 'delete')
}

/**
 * [FULL SYNC] Ambil SEMUA jurnal tanpa filter tanggal.
 * Digunakan hanya untuk initial backfill.
 */
async function getAllJournals() {
  const snapshot = await db.collection('journals')
    .orderBy('createdAt', 'asc')
    .get()
  return snapshot.docs.map(doc => ({ _docId: doc.id, ...doc.data() }))
}

/**
 * [FULL SYNC] Ambil SEMUA audit_log tanpa filter tanggal.
 * Tetap hanya mengambil action update/delete (create tercermin di GL).
 */
async function getAllAuditEntries() {
  const snapshot = await db.collection('audit_log')
    .orderBy('at', 'asc')
    .get()
  return snapshot.docs
    .map(doc => doc.data())
    .filter(entry => entry.action === 'update' || entry.action === 'delete')
}

// ─── Row Builders ─────────────────────────────────────────────────────────────

const WIB_LOCALE_OPTIONS = { timeZone: 'Asia/Jakarta' }

function toWIBString(isoStr) {
  if (!isoStr) return ''
  try {
    return new Date(isoStr).toLocaleString('id-ID', WIB_LOCALE_OPTIONS)
  } catch {
    return isoStr
  }
}

function formatNumber(val) {
  if (val === undefined || val === null || val === 0) return ''
  return Number(val)  // Kirim angka murni — Google Sheets yang handle formatting
}

/**
 * Ubah daftar jurnal menjadi baris-baris untuk sheet "General Ledger".
 * 1 jurnal → N baris (satu per line debit/kredit) + 1 baris kosong separator.
 *
 * Kolom: Tanggal | No.Jurnal | Deskripsi | Truck | Kode Akun | Nama Akun | Debit | Kredit | Dibuat Oleh | Waktu Sync
 */
function buildGLRows(journals, syncTimestamp) {
  const rows = []
  for (const journal of journals) {
    const lines = journal.lines || []
    lines.forEach((line, idx) => {
      rows.push([
        idx === 0 ? (journal.date || '')                  : '',
        idx === 0 ? ((journal.id || journal._docId || '').slice(0, 8)) : '',
        idx === 0 ? (journal.description || '')           : '',
        idx === 0 ? (journal.truckId || '-')              : '',
        line.accountCode  || '',
        line.accountName  || line.accountCode || '',
        formatNumber(line.debit),
        formatNumber(line.credit),
        idx === 0 ? (journal.createdBy || '')             : '',
        idx === 0 ? syncTimestamp                          : ''
      ])
    })
    // Baris kosong sebagai separator antar jurnal
    rows.push(new Array(10).fill(''))
  }
  return rows
}

/**
 * Ubah daftar audit entries menjadi baris-baris untuk sheet "Audit Log".
 *
 * Kolom: Waktu Perubahan | No.Jurnal | Aksi | Tanggal Jurnal | Deskripsi | Oleh | Timestamp ISO
 */
function buildAuditRows(entries) {
  return entries.map(entry => [
    toWIBString(entry.at),
    (entry.journalId || '').slice(0, 8),
    entry.action === 'delete' ? '🗑️ DIHAPUS' : '✏️ DIUBAH',
    entry.journalDate        || '',
    entry.journalDescription || entry.description || '',
    entry.by                 || '',
    entry.at                 || ''
  ])
}

// ─── Sheet Operations ─────────────────────────────────────────────────────────

/**
 * Pastikan baris header ada di setiap sheet (jika belum diisi).
 */
async function ensureHeaders() {
  const GL_HEADERS    = [['Tanggal', 'No. Jurnal', 'Deskripsi', 'Truck', 'Kode Akun', 'Nama Akun', 'Debit (Rp)', 'Kredit (Rp)', 'Dibuat Oleh', 'Waktu Sync (WIB)']]
  const AUDIT_HEADERS = [['Waktu Perubahan (WIB)', 'No. Jurnal', 'Aksi', 'Tanggal Jurnal', 'Deskripsi', 'Dilakukan Oleh', 'Timestamp ISO']]
  const LOG_HEADERS   = [['Tanggal (WIB)', 'Status', 'Jurnal Ditambahkan', 'Audit Entries', 'Selesai Pada (WIB)']]

  const checks = [
    { range: 'General Ledger!A1:J1', headers: GL_HEADERS },
    { range: 'Audit Log!A1:G1',      headers: AUDIT_HEADERS },
    { range: '_sync_log!A1:E1',      headers: LOG_HEADERS }
  ]

  for (const { range, headers } of checks) {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range })
    if (!res.data.values || res.data.values.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: headers }
      })
      console.log(`  📋 Header ditambahkan ke sheet: ${range.split('!')[0]}`)
    }
  }
}

/**
 * Append baris-baris ke sheet tertentu.
 */
async function appendRows(sheetName, rows) {
  if (rows.length === 0) return
  if (DRY_RUN) {
    console.log(`  [DRY RUN] Akan append ${rows.length} baris ke "${sheetName}"`)
    return
  }
  await sheets.spreadsheets.values.append({
    spreadsheetId:  SPREADSHEET_ID,
    range:          `${sheetName}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody:    { values: rows }
  })
}

/**
 * [FULL SYNC] Hapus semua data di sheet kecuali baris header (row 1).
 * Digunakan sebelum re-import agar tidak ada data duplikat.
 */
async function clearSheetData(sheetName) {
  if (DRY_RUN) {
    console.log(`  [DRY RUN] Akan hapus data di "${sheetName}" (kecuali header)`)
    return
  }
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A2:Z100000`
  })
  console.log(`  🗑️  Data lama di "${sheetName}" dibersihkan`)
}

/**
 * Catat hasil run ke sheet "_sync_log".
 */
async function logSyncRun(dateStr, status, journalCount, auditCount, syncTimestamp) {
  if (DRY_RUN) {
    console.log(`  [DRY RUN] Akan log ke _sync_log: ${dateStr} | ${status} | jurnal=${journalCount} | audit=${auditCount}`)
    return
  }
  await appendRows('_sync_log', [[dateStr, status, journalCount, auditCount, syncTimestamp]])
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const syncTimestamp = new Date().toLocaleString('id-ID', WIB_LOCALE_OPTIONS)

  // ── Tentukan range berdasarkan mode ──────────────────────────────────────
  let start, end, dateStr
  if (FULL_SYNC) {
    dateStr = 'full-sync'
  } else {
    ;({ start, end, dateStr } = getYesterdayWIBRange())
  }

  console.log('═══════════════════════════════════════════════════════════')
  console.log(`  BUL-Accounting GL Sync`)
  if (FULL_SYNC) {
    console.log(`  Mode          : ⚡ FULL SYNC (semua data historis)`)
  } else {
    console.log(`  Sync tanggal  : ${dateStr} (WIB)`)
    console.log(`  Range UTC     : ${start.toISOString()} → ${end.toISOString()}`)
  }
  console.log(`  Spreadsheet   : ${SPREADSHEET_ID}`)
  console.log(`  DRY RUN       : ${DRY_RUN ? '🧪 YA' : '🚀 TIDAK'}`)
  console.log('═══════════════════════════════════════════════════════════')

  // ── Deduplication check (dilewati untuk full sync) ───────────────────────
  if (!FULL_SYNC) {
    const alreadyRun = await checkAlreadyRun(dateStr)
    if (alreadyRun) {
      console.log(`\n⏭️  Sync untuk ${dateStr} sudah pernah berhasil. Skip untuk mencegah duplikasi.`)
      process.exit(0)
    }
  }

  // ── Pastikan headers ada ─────────────────────────────────────────────────
  console.log('\n🔧 Memastikan header sheet...')
  await ensureHeaders()

  // ── Bersihkan data lama (hanya full sync) ────────────────────────────────
  if (FULL_SYNC) {
    console.log('\n🗑️  Membersihkan data lama sebelum re-import...')
    await Promise.all([
      clearSheetData('General Ledger'),
      clearSheetData('Audit Log')
    ])
  }

  // ── Fetch data dari Firestore ────────────────────────────────────────────
  if (FULL_SYNC) {
    console.log('\n📡 Full sync — mengambil SEMUA data dari Firestore...')
  } else {
    console.log('\n📡 Mengambil data dari Firestore...')
  }
  const [journals, auditEntries] = await Promise.all([
    FULL_SYNC ? getAllJournals() : getNewJournals(start, end),
    FULL_SYNC ? getAllAuditEntries() : getAuditEntries(start, end)
  ])

  console.log(`  ✓ Jurnal       : ${journals.length}`)
  console.log(`  ✓ Audit entries: ${auditEntries.length}`)

  // ── No activity check (hanya untuk daily sync) ───────────────────────────
  if (!FULL_SYNC && journals.length === 0 && auditEntries.length === 0) {
    console.log(`\n✅ Tidak ada aktivitas pada ${dateStr}. Sync dilewati.`)
    await logSyncRun(dateStr, 'no-activity', 0, 0, syncTimestamp)
    process.exit(0)
  }

  // ── Sync General Ledger ──────────────────────────────────────────────────
  if (journals.length > 0) {
    console.log(`\n📊 Menulis ${journals.length} jurnal ke General Ledger...`)
    const glRows = buildGLRows(journals, syncTimestamp)
    await appendRows('General Ledger', glRows)
    console.log(`  ✓ ${journals.length} jurnal berhasil di-append (${glRows.length} baris termasuk separator)`)
  } else {
    console.log('\n📊 Tidak ada jurnal untuk ditulis ke General Ledger.')
  }

  // ── Sync Audit Log ───────────────────────────────────────────────────────
  if (auditEntries.length > 0) {
    console.log(`\n📝 Menulis ${auditEntries.length} perubahan ke Audit Log...`)
    const auditRows = buildAuditRows(auditEntries)
    await appendRows('Audit Log', auditRows)
    console.log(`  ✓ ${auditEntries.length} audit entries berhasil dicatat`)
  }

  // ── Log ke _sync_log ─────────────────────────────────────────────────────
  const logStatus = FULL_SYNC ? 'full-sync' : 'success'
  await logSyncRun(dateStr, logStatus, journals.length, auditEntries.length, syncTimestamp)

  console.log('\n✅ Sync selesai!')
  console.log(`   📄 General Ledger : +${journals.length} jurnal`)
  console.log(`   📝 Audit Log      : +${auditEntries.length} entries`)
  console.log(`   🕐 ${syncTimestamp} WIB`)
  console.log('═══════════════════════════════════════════════════════════')
}

main().catch(err => {
  console.error('\n❌ GL Sync gagal:', err.message || err)
  console.error(err.stack || '')
  process.exit(1)
})
