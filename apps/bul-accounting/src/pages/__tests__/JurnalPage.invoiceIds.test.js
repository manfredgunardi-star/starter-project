import { describe, it, expect, vi } from 'vitest'

// JurnalPage mengimpor rantai modul yang menyentuh Firebase saat import.
// Test ini murni menguji helper normalisasi (pure function), jadi koneksi
// Firebase cukup di-stub agar import module tidak menginisialisasi SDK.
vi.mock('../../firebase', () => ({ db: {}, auth: {}, default: {} }))

import { invoiceIdsDari } from '../JurnalPage'

describe('invoiceIdsDari', () => {
  it('jurnal multi-payment: mengembalikan seluruh invoiceIds', () => {
    expect(invoiceIdsDari({ invoiceIds: ['INV-1', 'INV-2', 'INV-3'] }))
      .toEqual(['INV-1', 'INV-2', 'INV-3'])
  })

  it('jurnal lama: invoiceId tunggal dibungkus menjadi array satu elemen', () => {
    expect(invoiceIdsDari({ invoiceId: 'INV-9' })).toEqual(['INV-9'])
  })

  it('jurnal tanpa kaitan invoice menghasilkan array kosong, bukan [undefined]', () => {
    const hasil = invoiceIdsDari({ type: 'umum', description: 'Jurnal penyesuaian' })
    expect(hasil).toEqual([])
    expect(hasil).toHaveLength(0)
  })

  it('journal null/undefined tidak melempar dan menghasilkan array kosong', () => {
    expect(invoiceIdsDari(null)).toEqual([])
    expect(invoiceIdsDari(undefined)).toEqual([])
  })

  it('invoiceIds kosong menghasilkan array kosong', () => {
    expect(invoiceIdsDari({ invoiceIds: [] })).toEqual([])
  })

  it('invoiceIds diprioritaskan bila jurnal punya kedua field', () => {
    expect(invoiceIdsDari({ invoiceIds: ['INV-1', 'INV-2'], invoiceId: 'INV-1' }))
      .toEqual(['INV-1', 'INV-2'])
  })

  it('entri kosong di dalam invoiceIds dibuang', () => {
    expect(invoiceIdsDari({ invoiceIds: ['INV-1', null, undefined, '', 'INV-2'] }))
      .toEqual(['INV-1', 'INV-2'])
  })

  it('invoiceIds bertipe salah (bukan array) jatuh kembali ke invoiceId', () => {
    expect(invoiceIdsDari({ invoiceIds: 'INV-1', invoiceId: 'INV-7' })).toEqual(['INV-7'])
  })

  it('jurnal pembayaran AP tetap menghasilkan satu id (removeInvoicePayment jadi no-op)', () => {
    // BiayaPage menulis invoiceId dari koleksi purchase_invoices. Normalisasi
    // tidak membedakannya; removeInvoicePayment() yang keluar lebih awal
    // karena dokumen di koleksi invoices tidak ada.
    expect(invoiceIdsDari({ invoiceId: 'PINV-3', type: 'pembayaran_hutang' }))
      .toEqual(['PINV-3'])
  })
})
