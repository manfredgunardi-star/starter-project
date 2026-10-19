import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findCollisions } from '../lib/find-collisions.js'

// Pasangan nyata dari produksi: dua invoice berbeda bernomor sama, yang lebih
// lama (memuat SJ 14214, Rp 9.301.800) tak pernah tampil di UI.
const invoiceSJ14214 = {
  id: 'INV-1792142390985',
  noInvoice: 'TMP- SI1157/2026',
  updatedAt: '2026-10-16T09:19:50.986Z',
  totalHarga: 9301800,
  suratJalanIds: ['SJ-1792031281495'],
}
const invoiceNomorKembar = {
  id: 'INV-1792142678249',
  noInvoice: 'TMP- SI1157/2026',
  updatedAt: '2026-10-16T09:24:38.250Z',
  totalHarga: 23842000,
  suratJalanIds: ['SJ-A', 'SJ-B', 'SJ-C'],
}
const invoiceLain = {
  id: 'INV-999',
  noInvoice: 'TMP SI1162/2026',
  updatedAt: '2026-10-16T10:00:00.000Z',
  totalHarga: 500000,
}

test('melaporkan nomor kembar dan menandai dokumen yang tampil', () => {
  const hasil = findCollisions([invoiceSJ14214, invoiceNomorKembar, invoiceLain])

  assert.equal(hasil.length, 1)
  assert.equal(hasil[0].noInvoice, 'TMP- SI1157/2026')
  assert.equal(hasil[0].group.length, 2)
  // updatedAt terbaru menang di bawah dedup lama, jadi yang Rp 9,3 juta kalah.
  assert.equal(hasil[0].pemenang.id, 'INV-1792142678249')
})

test('urutan baca tidak mengubah siapa yang menang', () => {
  const hasil = findCollisions([invoiceNomorKembar, invoiceSJ14214])
  assert.equal(hasil[0].pemenang.id, 'INV-1792142678249')
})

test('nomor yang hanya dipakai satu dokumen tidak dilaporkan', () => {
  assert.deepEqual(findCollisions([invoiceLain]), [])
})
