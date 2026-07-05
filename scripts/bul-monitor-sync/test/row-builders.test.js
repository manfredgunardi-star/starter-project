'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')

const {
  SHEETS,
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

test('escapeRow: hanya sel string berbahaya yang di-escape', () => {
  assert.deepEqual(
    escapeRow(['=X', 'aman', 42, '-Y']),
    ["'=X", 'aman', 42, "'-Y"]
  )
})

// ─── isActive ───────────────────────────────────────────────────────────────

test('isActive: soft-deleted dan isActive false tersaring', () => {
  assert.equal(isActive({}), true)
  assert.equal(isActive({ isActive: true }), true)
  assert.equal(isActive({ isActive: false }), false)
  assert.equal(isActive({ deletedAt: '2026-01-01' }), false)
})

// ─── Row builders: lebar baris = lebar header ───────────────────────────────

test('setiap row builder menghasilkan baris selebar header tab-nya', () => {
  const sj = { id: 'SJ-1', tanggalSJ: '2026-01-01', nomorSJ: 'SJ-001' }
  const sjMap = new Map([['SJ-1', sj]])

  const cases = [
    ['Surat Jalan', buildSuratJalanRows([sj], TS)],
    ['Invoice', buildInvoiceRows([{ noInvoice: 'INV-1', suratJalanIds: ['SJ-1'] }], TS)],
    ['Biaya Tambahan', buildBiayaRows([{ suratJalanId: 'SJ-1', jenisBiaya: 'Tol', nominal: 5000 }], sjMap, TS)],
    ['Armada', buildArmadaRows([{ platNomor: 'B 1234 XX', name: 'Truk 1' }])],
    ['Supir', buildSupirRows([{ namaSupir: 'Budi' }])],
    ['Rute', buildRuteRows([{ rute: 'A - B' }])],
    ['Pelanggan', buildPelangganRows([{ name: 'PT A', address: 'Jl. X', npwp: '01.234' }])]
  ]

  for (const [name, rows] of cases) {
    assert.equal(rows.length, 1, `${name}: harus 1 baris`)
    assert.equal(rows[0].length, headersOf(name).length, `${name}: lebar baris != lebar header`)
  }
})

// ─── buildSuratJalanRows ────────────────────────────────────────────────────

test('buildSuratJalanRows: sort descending by tanggalSJ, angka tetap number', () => {
  const rows = buildSuratJalanRows([
    { tanggalSJ: '2026-01-01', nomorSJ: 'LAMA', qtyBongkar: '7.5', uangJalan: '250000' },
    { tanggalSJ: '2026-03-01', nomorSJ: 'BARU' }
  ], TS)

  assert.equal(rows[0][2], 'BARU')
  assert.equal(rows[1][2], 'LAMA')
  assert.equal(rows[1][8], 7.5)      // Qty Bongkar jadi number
  assert.equal(rows[1][10], 250000)  // Uang Jalan jadi number
})

test('buildSuratJalanRows: field bebas-teks di-escape', () => {
  const rows = buildSuratJalanRows([{ tanggalSJ: '2026-01-01', nomorSJ: '=HYPERLINK("x")' }], TS)
  assert.equal(rows[0][2], "'=HYPERLINK(\"x\")")
})

// ─── buildInvoiceRows ───────────────────────────────────────────────────────

test('buildInvoiceRows: jumlah SJ dari suratJalanIds, no invoice di-escape', () => {
  const rows = buildInvoiceRows([{
    noInvoice: '=IMPORTXML("http://evil","//x")',
    tglInvoice: '2026-01-10',
    suratJalanIds: ['a', 'b', 'c'],
    totalQty: '30',
    totalNilai: '1500000',
    status: 'Lunas'
  }], TS)

  assert.equal(rows[0][0], "'=IMPORTXML(\"http://evil\",\"//x\")")
  assert.equal(rows[0][3], 30)
  assert.equal(rows[0][4], 1500000)
  assert.equal(rows[0][6], 3)
})

// ─── buildBiayaRows ─────────────────────────────────────────────────────────

test('buildBiayaRows: join nomor SJ via sjMap, keterangan di-escape', () => {
  const sjMap = new Map([['SJ-1', { id: 'SJ-1', nomorSJ: 'SJ-001', tanggalSJ: '2026-01-01', pt: 'PT A' }]])
  const rows = buildBiayaRows([
    { suratJalanId: 'SJ-1', jenisBiaya: 'Tol', nominal: 5000, keteranganBiaya: '=cmd|calc' },
    { suratJalanId: 'SJ-HILANG', jenisBiaya: 'Parkir', nominal: 2000 }
  ], sjMap, TS)

  const joined = rows.find(r => r[3] === 'Tol')
  const orphan = rows.find(r => r[3] === 'Parkir')
  assert.equal(joined[0], 'SJ-001')
  assert.equal(joined[5], "'=cmd|calc")
  assert.equal(orphan[0], 'SJ-HILANG')
})

// ─── Master data builders ───────────────────────────────────────────────────

test('master data: sort ascending, nama berbahaya di-escape', () => {
  const supir = buildSupirRows([{ namaSupir: 'Zul' }, { namaSupir: '@Adi' }])
  assert.equal(supir[0][0], "'@Adi")
  assert.equal(supir[1][0], 'Zul')

  const rute = buildRuteRows([{ rute: 'Z' }, { rute: '-A ke B' }])
  assert.equal(rute[0][0], "'-A ke B")

  const pelanggan = buildPelangganRows([{ name: 'PT A', address: '=1+1', npwp: '+01' }])
  assert.deepEqual(pelanggan[0], ['PT A', "'=1+1", "'+01"])

  const armada = buildArmadaRows([{ platNomor: '=B 1 X', name: 'Truk' }])
  assert.equal(armada[0][0], "'=B 1 X")
})
