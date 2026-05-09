/**
 * integrationUtils.js
 * Handles reads and actions on `integration_queue` collection in bul-accounting.
 * Used by the Review Integrasi page to list, approve, and reject incoming data
 * from bul-monitor.
 */

import { db } from '../firebase';
import {
  collection, doc, updateDoc, onSnapshot,
  query, where, getDocs,
} from 'firebase/firestore';
import { saveJournal, deleteJournal, saveInvoice, updateInvoice, saveCustomer, getNextCustomerNo } from './accounting';

// ─── Internal helpers ────────────────────────────────────────────────────────

/**
 * Cari customer di collection `customers` berdasarkan nama (case-insensitive).
 * Jika tidak ditemukan dan pelangganData tersedia, buat customer baru.
 * @returns {{ id: string, name: string }}
 */
async function findOrCreateCustomer(pelangganData, pt, createdBy) {
  const nameToMatch = (pelangganData?.name || pt || '').trim().toLowerCase();
  if (!nameToMatch) return null;

  const snap = await getDocs(collection(db, 'customers'));
  const existing = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .find(c => c.status !== 'deleted' && (c.name || '').trim().toLowerCase() === nameToMatch);

  if (existing) return { id: existing.id, name: existing.name };

  // Belum ada — buat baru
  const customerNo = await getNextCustomerNo();
  const ref = await saveCustomer({
    customerNo,
    name: pelangganData?.name || pt,
    address: pelangganData?.address || '',
    npwp: pelangganData?.npwp || '',
    phone: '',
    email: '',
    createdBy: createdBy || 'integration',
    sourceIntegration: true,
  });
  return { id: ref.id, name: pelangganData?.name || pt };
}

// ─── Subscribe ───────────────────────────────────────────────────────────────

/**
 * Dengarkan semua item antrian dengan status 'pending' secara real-time.
 *
 * @param   {Function} onData - Callback(items[]) dipanggil setiap ada perubahan
 * @returns {Function}        - Unsubscribe function
 */
export function subscribePendingQueue(onData) {
  const q = query(
    collection(db, 'integration_queue'),
    where('status', '==', 'pending')
  );
  return onSnapshot(q, (snap) => {
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    onData(items);
  });
}

/**
 * Dengarkan semua item antrian (pending + approved + rejected) untuk riwayat.
 *
 * @param   {Function} onData - Callback(items[])
 * @returns {Function}        - Unsubscribe function
 */
export function subscribeAllQueue(onData) {
  return onSnapshot(collection(db, 'integration_queue'), (snap) => {
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    onData(items);
  });
}

// ─── Approve ─────────────────────────────────────────────────────────────────

/**
 * Setujui item antrian: buat jurnal di bul-accounting, lalu update status bridge doc.
 *
 * @param {Object}   item         - Dokumen integration_queue
 * @param {Object[]} journalLines - Lines jurnal yang sudah diedit akuntan
 *                                  [{ accountCode, debit, credit, keterangan, truckId }]
 * @param {string}   date         - Tanggal jurnal (YYYY-MM-DD)
 * @param {string}   description  - Deskripsi jurnal
 * @param {string}   createdBy    - UID/nama akuntan yang approve
 * @returns {string} journalId    - ID jurnal yang dibuat
 */
export async function approveIntegrationItem(item, journalLines, date, description, createdBy) {
  // 1. Buat jurnal di bul-accounting
  const journalId = await saveJournal({
    date,
    description,
    type: 'umum',
    lines: journalLines,
    createdBy,
    sourceIntegration: item.id,
    sourceSjId: item.sourceSjId || null,
    sourceInvoiceId: item.sourceInvoiceId || null,
  });

  // 2. Jika tipe invoice → auto-sync pelanggan + buat invoice di Penjualan
  let accountingInvoiceId = null;
  if (item.type === 'invoice') {
    const customer = await findOrCreateCustomer(item.pelangganData, item.pt, createdBy);
    const invRef = await saveInvoice({
      date: item.tanggal || date,
      invoiceNo: item.noInvoice || '',
      customerId: customer?.id || null,
      customerName: customer?.name || item.pt || '',
      amount: item.totalNilai || 0,
      description: `Invoice ${item.noInvoice} - ${item.pt} (dari BUL-Monitor)`,
      status: 'unpaid',
      sourceIntegration: item.id,
      sourceInvoiceId: item.sourceInvoiceId || null,
      createdBy,
    });
    accountingInvoiceId = invRef.id;
  }

  // 3. Update status bridge doc → approved
  await updateDoc(doc(db, 'integration_queue', item.id), {
    status: 'approved',
    journalId,
    ...(accountingInvoiceId ? { accountingInvoiceId } : {}),
    reviewedBy: createdBy,
    updatedAt: new Date().toISOString(),
  });

  return journalId;
}

// ─── Reject ──────────────────────────────────────────────────────────────────

/**
 * Tolak item antrian: update status bridge doc → rejected dengan alasan penolakan.
 * bul-monitor akan mendeteksi perubahan ini dan membuka kunci data SJ/Invoice.
 *
 * @param {Object} item       - Dokumen integration_queue
 * @param {string} reason     - Alasan penolakan (wajib diisi)
 * @param {string} reviewedBy - UID/nama akuntan yang reject
 */
export async function rejectIntegrationItem(item, reason, reviewedBy) {
  await updateDoc(doc(db, 'integration_queue', item.id), {
    status: 'rejected',
    rejectionReason: reason || 'Ditolak oleh akuntan.',
    reviewedBy,
    updatedAt: new Date().toISOString(),
  });
}

// ─── Cancel ──────────────────────────────────────────────────────────────────

/**
 * Batalkan item yang sudah approved: hapus jurnal terkait, lalu update status → cancelled.
 * bul-monitor akan mendeteksi perubahan ini dan membuka kunci data SJ/Invoice.
 *
 * @param {Object} item         - Dokumen integration_queue (harus status 'approved')
 * @param {string} reason       - Alasan pembatalan
 * @param {string} cancelledBy  - UID/nama akuntan yang membatalkan
 */
export async function cancelIntegrationItem(item, reason, cancelledBy) {
  // 1. Hapus jurnal terkait jika ada
  if (item.journalId) {
    await deleteJournal(item.journalId);
  }

  // 2. Batalkan invoice di Penjualan jika ada
  if (item.accountingInvoiceId) {
    await updateInvoice(item.accountingInvoiceId, {
      status: 'cancelled',
      payments: [],
      totalPaid: 0,
      paidDate: null,
      updatedBy: cancelledBy,
    });
  }

  // 3. Update status bridge doc → cancelled
  await updateDoc(doc(db, 'integration_queue', item.id), {
    status: 'cancelled',
    cancellationReason: reason || 'Dibatalkan oleh akuntan.',
    cancelledBy,
    journalId: null,
    accountingInvoiceId: null,
    updatedAt: new Date().toISOString(),
  });
}
