/**
 * Row builders — fungsi pure untuk mengubah dokumen Firestore sj-monitor
 * menjadi baris Google Sheets. Tidak ada I/O di modul ini agar mudah di-test.
 *
 * Normalisasi meniru perilaku aplikasi (apps/sj-monitor/src/App.jsx) supaya
 * angka di spreadsheet konsisten dengan yang tampil di layar:
 *   - tanggalSJ fallback: tglSJ / tgl_sj / tanggal / date        (App.jsx:1675)
 *   - invoice merge: koleksi `invoice` + legacy `invoices`,
 *     dedupe per noInvoice, versi updatedAt/createdAt terbaru menang (App.jsx:1726)
 */

'use strict'

const WIB_LOCALE_OPTIONS = { timeZone: 'Asia/Jakarta' }
const WIB_DATE_OPTIONS   = { timeZone: 'Asia/Jakarta', day: '2-digit', month: '2-digit', year: 'numeric' }

// ─── Konfigurasi tab & header ───────────────────────────────────────────────

const SHEETS = [
  {
    name: 'Surat Jalan',
    headers: ['Tanggal SJ', 'Tanggal Terkirim', 'Nomor SJ', 'PT', 'Supir', 'Nomor Polisi', 'Rute', 'Material', 'Qty Isi', 'Qty Bongkar', 'Qty Loss', 'Satuan', 'Uang Jalan (Rp)', 'Status', 'Status Invoice', 'Waktu Sync (WIB)']
  },
  {
    name: 'Invoice',
    headers: ['No. Invoice', 'Tanggal Invoice', 'Jumlah SJ', 'Total Qty', 'Total Harga (Rp)', 'Total UM (Rp)', 'Total Setelah UM (Rp)', 'Waktu Sync (WIB)']
  },
  {
    name: 'Biaya Tambahan',
    headers: ['Nomor SJ', 'Tanggal SJ', 'PT', 'Jenis Biaya', 'Nominal (Rp)', 'Keterangan', 'Waktu Sync (WIB)']
  },
  {
    name: 'Uang Muka',
    headers: ['Tanggal', 'Nomor SJ', 'Jumlah (Rp)', 'Keterangan', 'Dibuat Oleh', 'Waktu Sync (WIB)']
  },
  {
    name: 'Transaksi',
    headers: ['Tanggal', 'Tipe', 'Nominal (Rp)', 'Keterangan', 'Nomor SJ', 'PT', 'Sumber', 'Waktu Sync (WIB)']
  },
  {
    name: 'Armada',
    headers: ['Nomor Polisi']
  },
  {
    name: 'Supir',
    headers: ['Nama Supir', 'PT']
  },
  {
    name: 'Rute',
    headers: ['Nama Rute', 'Uang Jalan (Rp)']
  },
  {
    name: 'Material',
    headers: ['Material', 'Satuan']
  },
  {
    name: 'Tarif Rute',
    headers: ['Rute', 'Uang Jalan (Rp)', 'Berlaku Mulai', 'Dibuat Pada']
  },
  {
    name: '_sync_log',
    headers: ['Tanggal Run (WIB)', 'Status', 'SJ', 'Invoice', 'Biaya', 'Uang Muka', 'Transaksi', 'Armada', 'Supir', 'Rute', 'Material', 'Tarif Rute', 'Selesai Pada (WIB)']
  }
]

// ─── Helpers tanggal & teks ─────────────────────────────────────────────────

function asDate(value) {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value.toDate === 'function') return value.toDate()

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date
}

function toDateStr(value) {
  if (!value) return ''
  const date = asDate(value)
  if (!date) return String(value)
  return date.toLocaleDateString('id-ID', WIB_DATE_OPTIONS)
}

function toWIBString(value) {
  if (!value) return ''
  const date = asDate(value)
  if (!date) return String(value)
  return date.toLocaleString('id-ID', WIB_LOCALE_OPTIONS)
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

// ─── Normalisasi & filter ───────────────────────────────────────────────────

function isActiveRow(row) {
  return row.isActive !== false && !row.deletedAt
}

function normalizeSJ(row, docId) {
  const id = row?.id || docId
  const tanggalSJ = row?.tanggalSJ || row?.tglSJ || row?.tgl_sj || row?.tanggal || row?.date || ''
  return { ...(row || {}), id, tanggalSJ }
}

function normalizeInvoice(row, docId) {
  const id = row?.id || docId
  const tglInvoice = row?.tglInvoice || row?.tanggalInvoice || row?.tgl_invoice || ''
  return { ...(row || {}), id, tglInvoice }
}

/**
 * Gabungkan invoice koleksi utama + legacy, dedupe per noInvoice.
 * Versi dengan updatedAt/createdAt terbaru menang (meniru App.jsx applyInv).
 */
function mergeInvoices(primary, legacy) {
  const merged = [...primary, ...legacy].filter(isActiveRow)
  const byInvoiceNumber = new Map()

  for (const inv of merged) {
    const key = String(inv?.noInvoice || inv?.id || '').trim()
    if (!key) continue
    const prev = byInvoiceNumber.get(key)
    if (!prev) {
      byInvoiceNumber.set(key, inv)
      continue
    }
    const prevTs = String(prev?.updatedAt || prev?.createdAt || '')
    const nextTs = String(inv?.updatedAt || inv?.createdAt || '')
    if (nextTs >= prevTs) byInvoiceNumber.set(key, inv)
  }

  return Array.from(byInvoiceNumber.values())
}

// ─── Row builders ───────────────────────────────────────────────────────────

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
      Number(sj.qtyIsi) || 0,
      Number(sj.qtyBongkar) || 0,
      Number(sj.quantityLoss) || 0,
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
      (inv.suratJalanIds || []).length,
      Number(inv.totalQty) || 0,
      Number(inv.totalHarga) || 0,
      Number(inv.totalUM) || 0,
      Number(inv.totalHargaAfterUM) || 0,
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
        sj?.pt || b.pt || '',
        b.jenisBiaya || '',
        Number(b.nominal) || 0,
        b.keteranganBiaya || b.keterangan || '',
        syncTimestamp
      ])
    })
}

function buildUangMukaRows(uangMuka, syncTimestamp) {
  return [...uangMuka]
    .sort((a, b) => toSortTime(b.tanggal) - toSortTime(a.tanggal))
    .map(um => escapeRow([
      toDateStr(um.tanggal),
      um.nomorSJ || '',
      Number(um.jumlah) || 0,
      um.keterangan || '',
      um.createdBy || '',
      syncTimestamp
    ]))
}

function buildTransaksiRows(transaksi, sjMap, syncTimestamp) {
  return [...transaksi]
    .sort((a, b) => toSortTime(b.tanggal) - toSortTime(a.tanggal))
    .map(tx => escapeRow([
      toDateStr(tx.tanggal),
      tx.tipe || '',
      Number(tx.nominal) || 0,
      tx.keterangan || '',
      sjMap.get(tx.suratJalanId)?.nomorSJ || '',
      tx.pt || '',
      tx.source || '',
      syncTimestamp
    ]))
}

function buildArmadaRows(trucks) {
  return [...trucks]
    .sort((a, b) => compareTextAsc(a.nomorPolisi, b.nomorPolisi))
    .map(t => escapeRow([t.nomorPolisi || '']))
}

function buildSupirRows(supir) {
  return [...supir]
    .sort((a, b) => compareTextAsc(a.namaSupir, b.namaSupir))
    .map(s => escapeRow([s.namaSupir || '', s.pt || '']))
}

function buildRuteRows(rute) {
  return [...rute]
    .sort((a, b) => compareTextAsc(a.rute, b.rute))
    .map(r => escapeRow([r.rute || '', Number(r.uangJalan) || 0]))
}

function buildMaterialRows(material) {
  return [...material]
    .sort((a, b) => compareTextAsc(a.material, b.material))
    .map(m => escapeRow([m.material || '', m.satuan || '']))
}

function buildTarifRuteRows(tarifRute, ruteMap) {
  return [...tarifRute]
    .sort((a, b) => toSortTime(b.effectiveDate) - toSortTime(a.effectiveDate) || compareTextAsc(ruteMap.get(a.ruteId)?.rute, ruteMap.get(b.ruteId)?.rute))
    .map(t => escapeRow([
      ruteMap.get(t.ruteId)?.rute || t.ruteId || '',
      Number(t.uangJalan) || 0,
      toDateStr(t.effectiveDate),
      toWIBString(t.createdAt)
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
}
