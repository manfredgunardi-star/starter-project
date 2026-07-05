'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')

const {
  SHEETS,
  escapeCell,
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
} = require('../lib/row-builders')

const TS = '05/07/2026, 00.00.00'

function headersOf(name) {
  return SHEETS.find(sheet => sheet.name === name).headers
}

// ─── escapeCell (guard formula injection) ───────────────────────────────────

test('escapeCell: string berawalan =,+,-,@ diberi prefix apostrof', () => {
  assert.equal(escapeCell('=SUM(A1:A2)'), "'=SUM(A1:A2)")
  assert.equal(escapeCell('+62 812'), "'+62 812")
  assert.equal(escapeCell('-diskon'), "'-diskon")
  assert.equal(escapeCell('@user'), "'@user")
})

test('escapeCell: string normal dan angka tidak diubah', () => {
  assert.equal(escapeCell('Tol + parkir'), 'Tol + parkir')
  assert.equal(escapeCell(''), '')
  assert.equal(escapeCell(-5000), -5000)
  assert.equal(escapeCell(0), 0)
})

// ─── isActiveRow ────────────────────────────────────────────────────────────

test('isActiveRow: soft-deleted dan isActive false tersaring', () => {
  assert.equal(isActiveRow({}), true)
  assert.equal(isActiveRow({ isActive: true }), true)
  assert.equal(isActiveRow({ isActive: false }), false)
  assert.equal(isActiveRow({ deletedAt: '2026-01-01' }), false)
})

// ─── normalizeSJ ────────────────────────────────────────────────────────────

test('normalizeSJ: fallback tanggalSJ dari field legacy', () => {
  assert.equal(normalizeSJ({ tglSJ: '2026-01-02' }, 'D1').tanggalSJ, '2026-01-02')
  assert.equal(normalizeSJ({ tgl_sj: '2026-01-03' }, 'D1').tanggalSJ, '2026-01-03')
  assert.equal(normalizeSJ({ tanggal: '2026-01-04' }, 'D1').tanggalSJ, '2026-01-04')
  assert.equal(normalizeSJ({ tanggalSJ: '2026-01-05', tglSJ: 'x' }, 'D1').tanggalSJ, '2026-01-05')
})

test('normalizeSJ: id fallback ke docId', () => {
  assert.equal(normalizeSJ({}, 'DOC-9').id, 'DOC-9')
  assert.equal(normalizeSJ({ id: 'SJ-1' }, 'DOC-9').id, 'SJ-1')
})

// ─── mergeInvoices ──────────────────────────────────────────────────────────

test('mergeInvoices: dedupe per noInvoice, versi terbaru menang', () => {
  const primary = [
    { id: 'A', noInvoice: 'INV-1', updatedAt: '2026-02-01', totalHarga: 200 }
  ]
  const legacy = [
    { id: 'B', noInvoice: 'INV-1', updatedAt: '2026-01-01', totalHarga: 100 },
    { id: 'C', noInvoice: 'INV-2', createdAt: '2026-01-15', totalHarga: 300 }
  ]
  const merged = mergeInvoices(primary, legacy)
  assert.equal(merged.length, 2)
  const inv1 = merged.find(i => i.noInvoice === 'INV-1')
  assert.equal(inv1.totalHarga, 200)
})

test('mergeInvoices: invoice tidak aktif tersaring', () => {
  const merged = mergeInvoices(
    [{ id: 'A', noInvoice: 'INV-1', isActive: false }],
    [{ id: 'B', noInvoice: 'INV-2', deletedAt: '2026-01-01' }]
  )
  assert.equal(merged.length, 0)
})

// ─── Row builders: lebar baris = lebar header ───────────────────────────────

test('setiap row builder menghasilkan baris selebar header tab-nya', () => {
  const sj = { id: 'SJ-1', tanggalSJ: '2026-01-01', nomorSJ: 'SJ-001', qtyIsi: 10 }
  const sjMap = new Map([['SJ-1', sj]])
  const ruteMap = new Map([['R1', { id: 'R1', rute: 'A - B' }]])

  const cases = [
    ['Surat Jalan', buildSuratJalanRows([sj], TS)],
    ['Invoice', buildInvoiceRows([{ noInvoice: 'INV-1', suratJalanIds: ['SJ-1'] }], TS)],
    ['Biaya Tambahan', buildBiayaRows([{ suratJalanId: 'SJ-1', jenisBiaya: 'Tol', nominal: 5000 }], sjMap, TS)],
    ['Uang Muka', buildUangMukaRows([{ tanggal: '2026-01-01', nomorSJ: 'SJ-001', jumlah: 100 }], TS)],
    ['Transaksi', buildTransaksiRows([{ tanggal: '2026-01-01', tipe: 'pengeluaran', nominal: 100, suratJalanId: 'SJ-1' }], sjMap, TS)],
    ['Armada', buildArmadaRows([{ nomorPolisi: 'B 1234 XX' }])],
    ['Supir', buildSupirRows([{ namaSupir: 'Budi', pt: 'PT A' }])],
    ['Rute', buildRuteRows([{ rute: 'A - B', uangJalan: 100000 }])],
    ['Material', buildMaterialRows([{ material: 'Pasir', satuan: 'm3' }])],
    ['Tarif Rute', buildTarifRuteRows([{ ruteId: 'R1', uangJalan: 100000, effectiveDate: '2026-01-01' }], ruteMap)]
  ]

  for (const [name, rows] of cases) {
    assert.equal(rows.length, 1, `${name}: harus 1 baris`)
    assert.equal(rows[0].length, headersOf(name).length, `${name}: lebar baris != lebar header`)
  }
})

test('header _sync_log memuat 10 kolom hitungan tab + status + 2 timestamp', () => {
  // 10 tab bisnis + Tanggal Run + Status + Selesai Pada = 13 kolom
  assert.equal(headersOf('_sync_log').length, 13)
})

// ─── buildSuratJalanRows ────────────────────────────────────────────────────

test('buildSuratJalanRows: sort descending by tanggalSJ, angka tetap number', () => {
  const rows = buildSuratJalanRows([
    { tanggalSJ: '2026-01-01', nomorSJ: 'LAMA', qtyBongkar: '7.5', uangJalan: '250000' },
    { tanggalSJ: '2026-03-01', nomorSJ: 'BARU' }
  ], TS)

  assert.equal(rows[0][2], 'BARU')
  assert.equal(rows[1][2], 'LAMA')
  assert.equal(rows[1][9], 7.5)      // Qty Bongkar jadi number
  assert.equal(rows[1][12], 250000)  // Uang Jalan jadi number
})

test('buildSuratJalanRows: field bebas-teks di-escape', () => {
  const rows = buildSuratJalanRows([{ tanggalSJ: '2026-01-01', nomorSJ: '=HYPERLINK("x")' }], TS)
  assert.equal(rows[0][2], "'=HYPERLINK(\"x\")")
})

// ─── buildInvoiceRows ───────────────────────────────────────────────────────

test('buildInvoiceRows: jumlah SJ dari suratJalanIds, total-total jadi number', () => {
  const rows = buildInvoiceRows([{
    noInvoice: 'INV-1',
    tglInvoice: '2026-01-10',
    suratJalanIds: ['a', 'b', 'c'],
    totalQty: '30',
    totalHarga: '1500000',
    totalUM: '500000',
    totalHargaAfterUM: '1000000'
  }], TS)

  assert.deepEqual(rows[0].slice(2, 7), [3, 30, 1500000, 500000, 1000000])
})

// ─── buildBiayaRows ─────────────────────────────────────────────────────────

test('buildBiayaRows: join nomor SJ via sjMap, fallback ke suratJalanId mentah', () => {
  const sjMap = new Map([['SJ-1', { id: 'SJ-1', nomorSJ: 'SJ-001', tanggalSJ: '2026-01-01', pt: 'PT A' }]])
  const rows = buildBiayaRows([
    { suratJalanId: 'SJ-1', jenisBiaya: 'Tol', nominal: 5000 },
    { suratJalanId: 'SJ-HILANG', jenisBiaya: 'Parkir', nominal: 2000 }
  ], sjMap, TS)

  const joined = rows.find(r => r[3] === 'Tol')
  const orphan = rows.find(r => r[3] === 'Parkir')
  assert.equal(joined[0], 'SJ-001')
  assert.equal(joined[2], 'PT A')
  assert.equal(orphan[0], 'SJ-HILANG')
})

// ─── buildTransaksiRows ─────────────────────────────────────────────────────

test('buildTransaksiRows: nomor SJ ter-join, sumber ikut tertulis', () => {
  const sjMap = new Map([['SJ-1', { id: 'SJ-1', nomorSJ: 'SJ-001' }]])
  const rows = buildTransaksiRows([{
    tanggal: '2026-01-01', tipe: 'pengeluaran', nominal: 250000,
    keterangan: 'Uang Jalan - SJ-001', suratJalanId: 'SJ-1', pt: 'PT A', source: 'auto_sj'
  }], sjMap, TS)

  assert.equal(rows[0][4], 'SJ-001')
  assert.equal(rows[0][6], 'auto_sj')
})

// ─── buildTarifRuteRows ─────────────────────────────────────────────────────

test('buildTarifRuteRows: nama rute dari ruteMap, fallback ruteId', () => {
  const ruteMap = new Map([['R1', { id: 'R1', rute: 'Depo - Site A' }]])
  const rows = buildTarifRuteRows([
    { ruteId: 'R1', uangJalan: 100000, effectiveDate: '2026-01-01' },
    { ruteId: 'R-HILANG', uangJalan: 90000, effectiveDate: '2026-02-01' }
  ], ruteMap)

  // sort desc by effectiveDate: R-HILANG (Feb) dulu
  assert.equal(rows[0][0], 'R-HILANG')
  assert.equal(rows[1][0], 'Depo - Site A')
  assert.equal(rows[1][1], 100000)
})

// ─── Master data builders ───────────────────────────────────────────────────

test('master data: sort ascending by nama', () => {
  const supir = buildSupirRows([{ namaSupir: 'Zul' }, { namaSupir: 'Adi', pt: 'PT B' }])
  assert.equal(supir[0][0], 'Adi')

  const rute = buildRuteRows([{ rute: 'Z' }, { rute: 'A', uangJalan: 1 }])
  assert.equal(rute[0][0], 'A')
})
