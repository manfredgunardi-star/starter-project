'use strict'

const { resolveAccount } = require('./account-map')

const GL_HEADERS = [
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
]

const WIB_LOCALE_OPTIONS = { timeZone: 'Asia/Jakarta' }

function formatTimestampWIB(value) {
  if (!value) return ''
  try {
    return new Date(value).toLocaleString('id-ID', WIB_LOCALE_OPTIONS)
  } catch {
    return value
  }
}

function formatNumber(value) {
  if (value === undefined || value === null || Number(value) === 0) return ''
  return Number(value)
}

function buildGLRows(journals, options = {}) {
  const accountMap = options.accountMap
  const formatTimestamp = options.formatTimestamp || formatTimestampWIB
  const syncTimestamp = options.syncTimestamp || new Date().toISOString()
  const rows = []

  for (const journal of journals || []) {
    const journalId = String(journal._docId || journal.id || '')
    const journalNumber = journalId.slice(0, 8)
    const statusLabel = journal.status === 'deleted' ? 'Dihapus' : 'Aktif'
    const lines = Array.isArray(journal.lines) ? journal.lines : []

    lines.forEach((line, index) => {
      const account = resolveAccount(line.accountCode || '', accountMap)
      rows.push([
        journal.date || '',
        journalId,
        journalNumber,
        index + 1,
        journal.type || '',
        line.keterangan || '',
        line.truckId || journal.truckId || '-',
        line.accountCode || '',
        account.name,
        formatNumber(line.debit),
        formatNumber(line.credit),
        statusLabel,
        journal.createdBy || '',
        formatTimestamp(journal.createdAt),
        formatTimestamp(journal.updatedAt),
        formatTimestamp(syncTimestamp),
      ])
    })
  }

  return rows
}

function buildJournalDeleteRequests(existingRows, journalIds, sheetId) {
  const ids = new Set((journalIds || []).filter(Boolean).map(String))
  if (ids.size === 0 || sheetId === undefined || sheetId === null) return []

  const matches = []
  let groupStart = null

  for (let rowIndex = 1; rowIndex < (existingRows || []).length; rowIndex += 1) {
    const row = existingRows[rowIndex] || []
    const journalId = String(row[1] || '')
    const isMatch = ids.has(journalId)

    if (isMatch && groupStart === null) {
      groupStart = rowIndex
      continue
    }

    if (!isMatch && groupStart !== null) {
      matches.push({ startIndex: groupStart, endIndex: rowIndex })
      groupStart = null
    }
  }

  if (groupStart !== null) {
    matches.push({ startIndex: groupStart, endIndex: (existingRows || []).length })
  }

  return matches
    .sort((left, right) => right.startIndex - left.startIndex)
    .map((range) => ({
      deleteDimension: {
        range: {
          sheetId,
          dimension: 'ROWS',
          startIndex: range.startIndex,
          endIndex: range.endIndex,
        },
      },
    }))
}

module.exports = {
  GL_HEADERS,
  formatTimestampWIB,
  buildGLRows,
  buildJournalDeleteRequests,
}
