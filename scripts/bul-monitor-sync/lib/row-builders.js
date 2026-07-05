/**
 * Row builders — fungsi pure untuk mengubah dokumen Firestore bul-monitor
 * menjadi baris Google Sheets. Tidak ada I/O di modul ini agar mudah di-test.
 *
 * Dipindahkan apa adanya dari index.js; satu-satunya perubahan perilaku adalah
 * guard formula injection (escapeCell/escapeRow), backport dari
 * scripts/sj-monitor-sync/lib/row-builders.js.
 */

'use strict'

const WIB_LOCALE_OPTIONS = { timeZone: 'Asia/Jakarta' }
const WIB_DATE_OPTIONS   = { timeZone: 'Asia/Jakarta', day: '2-digit', month: '2-digit', year: 'numeric' }

// ─── Konfigurasi tab & header ───────────────────────────────────────────────

const SHEETS = [
  {
    name: 'Surat Jalan',
    headers: ['Tanggal SJ', 'Tanggal Terkirim', 'Nomor SJ', 'PT', 'Supir', 'Nomor Polisi', 'Rute', 'Material', 'Qty Bongkar', 'Satuan', 'Uang Jalan (Rp)', 'Status', 'Status Invoice', 'Waktu Sync (WIB)']
  },
  {
    name: 'Invoice',
    headers: ['No. Invoice', 'Tanggal Invoice', 'PT', 'Total Qty', 'Total Nilai (Rp)', 'Status', 'Jumlah SJ', 'Waktu Sync (WIB)']
  },
  {
    name: 'Biaya Tambahan',
    headers: ['Nomor SJ', 'Tanggal SJ', 'PT', 'Jenis Biaya', 'Nominal (Rp)', 'Keterangan', 'Waktu Sync (WIB)']
  },
  {
    name: 'Armada',
    headers: ['Plat Nomor', 'Nama']
  },
  {
    name: 'Supir',
    headers: ['Nama Supir']
  },
  {
    name: 'Rute',
    headers: ['Nama Rute']
  },
  {
    name: 'Pelanggan',
    headers: ['Nama PT', 'Alamat', 'NPWP']
  },
  {
    name: '_sync_log',
    headers: ['Tanggal Run (WIB)', 'Status', 'SJ', 'Invoice', 'Biaya', 'Armada', 'Supir', 'Rute', 'Pelanggan', 'Selesai Pada (WIB)']
  }
]

// ─── Timezone Helpers ───────────────────────────────────────────────────────

function asDate(value) {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value.toDate === 'function') return value.toDate()

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date
}

function toDateStr(isoStr) {
  if (!isoStr) return ''
  const date = asDate(isoStr)
  if (!date) return isoStr
  return date.toLocaleDateString('id-ID', WIB_DATE_OPTIONS)
}

function toWIBString(isoStr) {
  if (!isoStr) return ''
  try {
    return new Date(isoStr).toLocaleString('id-ID', WIB_LOCALE_OPTIONS)
  } catch {
    return isoStr
  }
}

function toSortTime(value) {
  const date = asDate(value)
  return date ? date.getTime() : 0
}

function compareTextAsc(a, b) {
  return String(a || '').localeCompare(String(b || ''), 'id-ID')
}

// ─── Guard formula injection ────────────────────────────────────────────────
// valueInputOption USER_ENTERED mengevaluasi string berawalan =,+,-,@ sebagai
// formula. Data bebas-teks (keterangan, nama) di-escape dengan prefix apostrof.

function escapeCell(value) {
  if (typeof value !== 'string') return value
  if (/^[=+\-@]/.test(value)) return `'${value}`
  return value
}

function escapeRow(row) {
  return row.map(escapeCell)
}

// ─── Filter ─────────────────────────────────────────────────────────────────

function isActive(row) {
  return row.isActive !== false && !row.deletedAt
}

// ─── Row Builders ───────────────────────────────────────────────────────────

function buildSuratJalanRows(suratJalan, syncTimestamp) {
  return [...suratJalan]
    .sort((a, b) => toSortTime(b.tanggalSJ) - toSortTime(a.tanggalSJ))
    .map(sj => escapeRow([
      toDateStr(sj.tanggalSJ),
      toDateStr(sj.tglTerkirim),
      sj.nomorSJ || '',
      sj.pt || '',
      sj.namaSupir || '',
      sj.nomorPolisi || '',
      sj.rute || '',
      sj.material || '',
      Number(sj.qtyBongkar) || 0,
      sj.satuan || '',
      Number(sj.uangJalan) || 0,
      sj.status || '',
      sj.statusInvoice || '',
      syncTimestamp
    ]))
}

function buildInvoiceRows(invoices, syncTimestamp) {
  return [...invoices]
    .sort((a, b) => toSortTime(b.tglInvoice) - toSortTime(a.tglInvoice))
    .map(inv => escapeRow([
      inv.noInvoice || '',
      toDateStr(inv.tglInvoice),
      inv.pt || '',
      Number(inv.totalQty) || 0,
      Number(inv.totalNilai) || 0,
      inv.status || '',
      (inv.suratJalanIds || []).length,
      syncTimestamp
    ]))
}

function buildBiayaRows(biaya, sjMap, syncTimestamp) {
  return [...biaya]
    .sort((a, b) => {
      const sjA = sjMap.get(a.suratJalanId)
      const sjB = sjMap.get(b.suratJalanId)
      return toSortTime(sjB?.tanggalSJ) - toSortTime(sjA?.tanggalSJ)
    })
    .map(b => {
      const sj = sjMap.get(b.suratJalanId)
      return escapeRow([
        sj?.nomorSJ || b.suratJalanId || '',
        toDateStr(sj?.tanggalSJ),
        sj?.pt || '',
        b.jenisBiaya || '',
        Number(b.nominal) || 0,
        b.keteranganBiaya || '',
        syncTimestamp
      ])
    })
}

function buildArmadaRows(trucks) {
  return [...trucks]
    .sort((a, b) => compareTextAsc(a.platNomor || a.nomorPolisi || a.name, b.platNomor || b.nomorPolisi || b.name))
    .map(t => escapeRow([
      t.platNomor || t.nomorPolisi || t.name || '',
      t.name || t.namaTruck || ''
    ]))
}

function buildSupirRows(supir) {
  return [...supir]
    .sort((a, b) => compareTextAsc(a.namaSupir || a.name, b.namaSupir || b.name))
    .map(s => escapeRow([s.namaSupir || s.name || '']))
}

function buildRuteRows(rute) {
  return [...rute]
    .sort((a, b) => compareTextAsc(a.rute || a.name, b.rute || b.name))
    .map(r => escapeRow([r.rute || r.name || '']))
}

function buildPelangganRows(pelanggan) {
  return [...pelanggan]
    .sort((a, b) => compareTextAsc(a.name, b.name))
    .map(p => escapeRow([
      p.name || '',
      p.address || '',
      p.npwp || ''
    ]))
}

module.exports = {
  SHEETS,
  asDate,
  toDateStr,
  toWIBString,
  toSortTime,
  compareTextAsc,
  escapeCell,
  escapeRow,
  isActive,
  buildSuratJalanRows,
  buildInvoiceRows,
  buildBiayaRows,
  buildArmadaRows,
  buildSupirRows,
  buildRuteRows,
  buildPelangganRows
}
