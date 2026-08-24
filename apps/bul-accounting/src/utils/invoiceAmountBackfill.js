/**
 * invoiceAmountBackfill.js
 * Perencana koreksi `invoices.amount` dari nilai bruto menjadi piutang bersih.
 *
 * Modul ini murni — tanpa I/O dan tanpa import firebase — supaya seluruh aturan
 * bisa diuji dengan vitest dan runner Firestore di scripts/ tinggal memakainya
 * apa adanya tanpa menduplikasi logika.
 *
 * Dipakai oleh scripts/bul-accounting-backfill/index.js.
 */

import { resolvePiutangNet } from './invoiceAmounts'

export const SKIP_REASONS = {
  QUEUE_NOT_APPROVED: 'item antrian tidak berstatus approved',
  INVOICE_MISSING: 'dokumen invoice tidak ditemukan',
  ALREADY_BACKFILLED: 'amountGross sudah terisi',
  HAS_PAYMENT: 'invoice sudah punya pembayaran',
  CANCELLED: 'invoice berstatus cancelled',
  NO_UANG_JALAN: 'totalUJ nol',
}

/** Alasan melewati satu invoice, atau null bila invoice layak dikoreksi. */
function skipReasonFor(item, invoice) {
  if (item.status !== 'approved') return SKIP_REASONS.QUEUE_NOT_APPROVED
  if (!invoice) return SKIP_REASONS.INVOICE_MISSING
  if (Number.isFinite(Number(invoice.amountGross))) return SKIP_REASONS.ALREADY_BACKFILLED
  if ((Number(invoice.totalPaid) || 0) > 0) return SKIP_REASONS.HAS_PAYMENT
  if ((invoice.payments || []).length > 0) return SKIP_REASONS.HAS_PAYMENT
  if (invoice.status === 'cancelled') return SKIP_REASONS.CANCELLED
  if ((Number(item.totalUJ) || 0) === 0) return SKIP_REASONS.NO_UANG_JALAN
  return null
}

/**
 * Susun rencana koreksi tanpa menyentuh Firestore.
 *
 * Item antrian yang bukan tipe 'invoice' atau belum punya accountingInvoiceId
 * tidak masuk laporan sama sekali — keduanya memang bukan kandidat, bukan
 * kandidat yang gagal.
 *
 * @param {Object[]} queueItems - Dokumen integration_queue
 * @param {Object[]} invoices   - Dokumen invoices (wajib memuat field `id`)
 * @returns {{ updates: Object[], skipped: Object[], totals: Object }}
 */
export function planInvoiceAmountFix(queueItems, invoices) {
  const byId = new Map((invoices || []).map(inv => [inv.id, inv]))

  const updates = []
  const skipped = []

  for (const item of queueItems || []) {
    if (item.type !== 'invoice') continue
    if (!item.accountingInvoiceId) continue

    const invoice = byId.get(item.accountingInvoiceId)
    const reason = skipReasonFor(item, invoice)

    if (reason) {
      skipped.push({
        invoiceId: item.accountingInvoiceId,
        invoiceNo: invoice?.invoiceNo || item.noInvoice || '',
        reason,
      })
      continue
    }

    updates.push({
      invoiceId: item.accountingInvoiceId,
      invoiceNo: invoice.invoiceNo || item.noInvoice || '',
      amountBefore: Number(invoice.amount) || 0,
      amountAfter: resolvePiutangNet(item),
      amountGross: Number(item.totalNilai) || 0,
      totalUJ: Number(item.totalUJ) || 0,
    })
  }

  const totals = {
    updateCount: updates.length,
    skipCount: skipped.length,
    totalUJ: updates.reduce((sum, u) => sum + u.totalUJ, 0),
    amountDelta: updates.reduce((sum, u) => sum + (u.amountAfter - u.amountBefore), 0),
  }

  return { updates, skipped, totals }
}
