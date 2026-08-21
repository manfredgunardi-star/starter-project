import { db } from '../firebase'
import {
  collection, addDoc, updateDoc, doc, getDocs, getDoc,
  query, where, orderBy, Timestamp, writeBatch, limit, setDoc, runTransaction
} from 'firebase/firestore'
import { COA, getNormalBalance } from '../data/chartOfAccounts'
import {
  computeInvoiceStatus,
  validateAllocations,
  buildPaymentJournalLines,
  buildPaymentEntries,
  TOLERANSI_RUPIAH,
} from './payments'
import { getJournalType } from '../data/kasAccounts'

// ===== FORMAT HELPERS =====
export const formatCurrency = (amount) => {
  if (amount == null || isNaN(amount)) return 'Rp 0'
  const abs = Math.abs(amount)
  const formatted = new Intl.NumberFormat('id-ID').format(Math.round(abs))
  return amount < 0 ? `(Rp ${formatted})` : `Rp ${formatted}`
}

export const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

export const toFirestoreDate = (dateStr) => dateStr // Store as ISO string for simplicity

// ===== AUDIT TRAIL =====
async function writeAuditLog(journalId, action, by, extra = {}) {
  try {
    await addDoc(collection(db, 'audit_log'), {
      journalId,
      action,
      by: by || 'system',
      at: new Date().toISOString(),
      ...extra,
    })
  } catch (_) {
    // audit log failure must not block main operation
  }
}

export async function getAuditLog(journalId) {
  const q = query(collection(db, 'audit_log'), where('journalId', '==', journalId))
  const snap = await getDocs(q)
  const logs = snap.docs.map(d => d.data())
  logs.sort((a, b) => (a.at || '').localeCompare(b.at || ''))
  return logs
}

// Firestore menolak field bernilai undefined (ignoreUndefinedProperties default false),
// dan satu field undefined membatalkan seluruh tulisan. Buang key-nya sebelum dikirim.
function stripUndefined(data) {
  return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined))
}

// ===== JOURNAL ENTRIES =====
// Validasi balance + bentuk dokumen jurnal. Dipakai saveJournal() dan penulisan
// jurnal ber-batch supaya aturan balance tidak pernah berbeda antar jalur posting.
function buildJournalDoc(journalData) {
  const totalDebit = journalData.lines.reduce((s, l) => s + (l.debit || 0), 0)
  const totalCredit = journalData.lines.reduce((s, l) => s + (l.credit || 0), 0)

  if (Math.abs(totalDebit - totalCredit) > 0.5) {
    throw new Error(`Jurnal tidak balance! Debit: ${totalDebit}, Credit: ${totalCredit}`)
  }

  return {
    ...journalData,
    totalDebit,
    totalCredit,
    createdAt: new Date().toISOString(),
    status: 'posted'
  }
}

export async function saveJournal(journalData) {
  // journalData: { date, description, truckId, type, lines: [{accountCode, debit, credit}], createdBy, recurring? }
  // Mengembalikan STRING id dokumen jurnal, bukan DocumentReference.
  const docData = buildJournalDoc(journalData)

  const ref = await addDoc(collection(db, 'journals'), docData)
  await writeAuditLog(ref.id, 'create', journalData.createdBy, { description: journalData.description })
  return ref.id
}

export async function updateJournal(id, journalData) {
  const totalDebit = journalData.lines.reduce((s, l) => s + (l.debit || 0), 0)
  const totalCredit = journalData.lines.reduce((s, l) => s + (l.credit || 0), 0)

  if (Math.abs(totalDebit - totalCredit) > 0.5) {
    throw new Error(`Jurnal tidak balance! Debit: ${totalDebit}, Credit: ${totalCredit}`)
  }

  await updateDoc(doc(db, 'journals', id), {
    ...journalData,
    totalDebit,
    totalCredit,
    updatedAt: new Date().toISOString()
  })
  await writeAuditLog(id, 'update', journalData.createdBy, { description: journalData.description })
}

export async function deleteJournal(id, deletedBy) {
  await updateDoc(doc(db, 'journals', id), {
    status: 'deleted',
    deletedAt: new Date().toISOString()
  })
  await writeAuditLog(id, 'delete', deletedBy)
}

// Catatan: fungsi hardDeleteJournal dihapus — melanggar aturan soft-delete (Data Safety Rule #1).
// Penghapusan jurnal harus selalu lewat deleteJournal() yang menyetel status 'deleted'.

// ===== FETCH JOURNALS =====
export async function getJournals(filters = {}) {
  let q = query(collection(db, 'journals'), where('status', '==', 'posted'))

  const snap = await getDocs(q)
  let results = snap.docs.map(d => ({ id: d.id, ...d.data() }))

  // Client-side filtering for complex queries (Firestore free tier limitations)
  if (filters.startDate) {
    results = results.filter(j => j.date >= filters.startDate)
  }
  if (filters.endDate) {
    results = results.filter(j => j.date <= filters.endDate)
  }
  if (filters.type) {
    results = results.filter(j => j.type === filters.type)
  }
  if (filters.truckId && filters.truckId !== 'all') {
    results = results.filter(j => j.truckId === filters.truckId || !j.truckId)
  }
  if (filters.accountCode) {
    results = results.filter(j => j.lines?.some(l => l.accountCode === filters.accountCode))
  }

  return results.sort((a, b) => (a.date > b.date ? -1 : 1))
}

// Pure date/type/truck/account filter mirroring getJournals' client-side logic.
// Used to derive per-report views from a single pre-fetched journal set.
export function filterJournalsByDate(journals, startDate, endDate) {
  let r = journals
  if (startDate) r = r.filter(j => j.date >= startDate)
  if (endDate) r = r.filter(j => j.date <= endDate)
  return r.slice().sort((a, b) => (a.date > b.date ? -1 : 1))
}

// ===== ACCOUNT BALANCES =====
export async function getAccountBalances(endDate, startDate = null, truckId = 'all', journals = null) {
  const src = journals
    ? filterJournalsByDate(journals, startDate || '1900-01-01', endDate)
    : await getJournals({
        startDate: startDate || '1900-01-01',
        endDate
      })

  const balances = {}

  src.forEach(j => {
    if (truckId !== 'all' && j.truckId && j.truckId !== truckId) return

    j.lines?.forEach(line => {
      if (!balances[line.accountCode]) {
        balances[line.accountCode] = { debit: 0, credit: 0 }
      }
      balances[line.accountCode].debit += (line.debit || 0)
      balances[line.accountCode].credit += (line.credit || 0)
    })
  })

  // Calculate net balance per account based on normal balance
  const result = {}
  Object.keys(balances).forEach(code => {
    const nb = getNormalBalance(code)
    const net = nb === 'debit'
      ? balances[code].debit - balances[code].credit
      : balances[code].credit - balances[code].debit
    result[code] = {
      ...balances[code],
      net,
      normalBalance: nb
    }
  })

  return result
}

// ===== FINANCIAL REPORTS =====
export async function generateNeracaData(endDate, truckId = 'all', journals = null) {
  const balances = await getAccountBalances(endDate, null, truckId, journals)
  const detailAccounts = COA.filter(a => a.type === 'detail')

  const getBalance = (code) => {
    if (!balances[code]) return 0
    const nb = getNormalBalance(code)
    return nb === 'debit'
      ? balances[code].debit - balances[code].credit
      : balances[code].credit - balances[code].debit
  }

  // Group by category
  const aset = detailAccounts.filter(a => a.code.startsWith('1'))
  const kewajiban = detailAccounts.filter(a => a.code.startsWith('2'))
  const ekuitas = detailAccounts.filter(a => a.code.startsWith('3'))

  // Calculate laba tahun berjalan for ekuitas
  const pendapatan = detailAccounts.filter(a => a.code.startsWith('4') || a.code.startsWith('7'))
  const beban = detailAccounts.filter(a => a.code.startsWith('5') || a.code.startsWith('6') || a.code.startsWith('8'))

  const totalPendapatan = pendapatan.reduce((s, a) => s + getBalance(a.code), 0)
  const totalBeban = beban.reduce((s, a) => s + getBalance(a.code), 0)
  const labaBerjalan = totalPendapatan - totalBeban

  return {
    aset: aset.map(a => ({ ...a, balance: getBalance(a.code) })),
    kewajiban: kewajiban.map(a => ({ ...a, balance: getBalance(a.code) })),
    ekuitas: ekuitas.map(a => ({ ...a, balance: getBalance(a.code) })),
    totalAset: aset.reduce((s, a) => s + getBalance(a.code), 0),
    totalKewajiban: kewajiban.reduce((s, a) => s + getBalance(a.code), 0),
    totalEkuitas: ekuitas.reduce((s, a) => s + getBalance(a.code), 0) + labaBerjalan,
    labaBerjalan
  }
}

export async function generateLabaRugiData(startDate, endDate, truckId = 'all', journals = null) {
  const balances = await getAccountBalances(endDate, startDate, truckId, journals)

  const getBalance = (code) => {
    if (!balances[code]) return 0
    const nb = getNormalBalance(code)
    return nb === 'debit'
      ? balances[code].debit - balances[code].credit
      : balances[code].credit - balances[code].debit
  }

  const detailAccounts = COA.filter(a => a.type === 'detail')

  const pendapatanUsaha = detailAccounts.filter(a => a.code.startsWith('4'))
  const hpp = detailAccounts.filter(a => a.code.startsWith('5'))
  const bebanOperasional = detailAccounts.filter(a => a.code.startsWith('6'))
  const pendapatanLain = detailAccounts.filter(a => a.code.startsWith('7'))
  const bebanLain = detailAccounts.filter(a => a.code.startsWith('8'))

  const totalPendapatanUsaha = pendapatanUsaha.reduce((s, a) => s + getBalance(a.code), 0)
  const totalHPP = hpp.reduce((s, a) => s + getBalance(a.code), 0)
  const labaKotor = totalPendapatanUsaha - totalHPP
  const totalBebanOperasional = bebanOperasional.reduce((s, a) => s + getBalance(a.code), 0)
  const labaOperasional = labaKotor - totalBebanOperasional
  const totalPendapatanLain = pendapatanLain.reduce((s, a) => s + getBalance(a.code), 0)
  const totalBebanLain = bebanLain.reduce((s, a) => s + getBalance(a.code), 0)
  const labaBersih = labaOperasional + totalPendapatanLain - totalBebanLain

  return {
    pendapatanUsaha: pendapatanUsaha.map(a => ({ ...a, balance: getBalance(a.code) })),
    hpp: hpp.map(a => ({ ...a, balance: getBalance(a.code) })),
    bebanOperasional: bebanOperasional.map(a => ({ ...a, balance: getBalance(a.code) })),
    pendapatanLain: pendapatanLain.map(a => ({ ...a, balance: getBalance(a.code) })),
    bebanLain: bebanLain.map(a => ({ ...a, balance: getBalance(a.code) })),
    totalPendapatanUsaha, totalHPP, labaKotor,
    totalBebanOperasional, labaOperasional,
    totalPendapatanLain, totalBebanLain, labaBersih
  }
}

export async function generateArusKasData(startDate, endDate, truckId = 'all', journals = null) {
  const src = journals
    ? filterJournalsByDate(journals, startDate, endDate)
    : await getJournals({ startDate, endDate })
  const kasAccounts = ['1111', '1112', '1113', '1114']

  let operasional = 0, investasi = 0, pendanaan = 0

  src.forEach(j => {
    if (truckId !== 'all' && j.truckId && j.truckId !== truckId) return

    const hasKas = j.lines?.some(l => kasAccounts.includes(l.accountCode))
    if (!hasKas) return

    const kasFlow = j.lines?.reduce((sum, l) => {
      if (kasAccounts.includes(l.accountCode)) {
        return sum + (l.debit || 0) - (l.credit || 0)
      }
      return sum
    }, 0) || 0

    // Classify based on contra accounts
    const contraAccounts = j.lines?.filter(l => !kasAccounts.includes(l.accountCode)).map(l => l.accountCode) || []

    const isInvestasi = contraAccounts.some(c => c.startsWith('12'))
    const isPendanaan = contraAccounts.some(c => c.startsWith('2') || c.startsWith('3'))

    if (isInvestasi) investasi += kasFlow
    else if (isPendanaan) pendanaan += kasFlow
    else operasional += kasFlow
  })

  // Get beginning and ending cash balances.
  // Saldo awal harus EKSKLUSIF terhadap startDate (saldo akhir periode sebelumnya),
  // karena arus periode (operasional/investasi/pendanaan) sudah mencakup transaksi
  // bertanggal startDate. Memakai startDate inklusif membuat transaksi hari pertama
  // terhitung dua kali → saldoAwal + totalPerubahan ≠ saldoAkhir.
  const startExclusive = (() => {
    const d = new Date(`${startDate}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() - 1)
    return d.toISOString().slice(0, 10)
  })()
  const beginBalances = await getAccountBalances(startExclusive, null, truckId, journals)
  const endBalances = await getAccountBalances(endDate, null, truckId, journals)

  const beginCash = kasAccounts.reduce((s, code) => {
    const b = beginBalances[code]
    return s + (b ? b.debit - b.credit : 0)
  }, 0)

  const endCash = kasAccounts.reduce((s, code) => {
    const b = endBalances[code]
    return s + (b ? b.debit - b.credit : 0)
  }, 0)

  return {
    operasional, investasi, pendanaan,
    totalPerubahanKas: operasional + investasi + pendanaan,
    saldoAwal: beginCash,
    saldoAkhir: endCash
  }
}

// ===== YEAR-END CLOSING =====
export async function generateClosingJournals(year, createdBy) {
  const startDate = `${year}-01-01`
  const endDate = `${year}-12-31`
  const balances = await getAccountBalances(endDate, startDate)

  const closingLines = []

  // Close revenue accounts (4xxx, 7xxx) - debit to zero, credit to Ikhtisar L/R
  COA.filter(a => a.type === 'detail' && (a.code.startsWith('4') || a.code.startsWith('7'))).forEach(acc => {
    const bal = balances[acc.code]
    if (!bal || bal.net === 0) return
    // Revenue has credit normal balance, so to close: debit revenue, credit ikhtisar
    closingLines.push({ accountCode: acc.code, debit: bal.net, credit: 0 })
  })

  const totalRevenue = closingLines.reduce((s, l) => s + l.debit, 0)
  if (totalRevenue > 0) {
    closingLines.push({ accountCode: '9100', debit: 0, credit: totalRevenue })
  }

  // Close expense accounts (5xxx, 6xxx, 8xxx) - credit to zero, debit Ikhtisar L/R
  const expenseLines = []
  COA.filter(a => a.type === 'detail' && (a.code.startsWith('5') || a.code.startsWith('6') || a.code.startsWith('8'))).forEach(acc => {
    const bal = balances[acc.code]
    if (!bal || bal.net === 0) return
    expenseLines.push({ accountCode: acc.code, debit: 0, credit: bal.net })
  })

  const totalExpense = expenseLines.reduce((s, l) => s + l.credit, 0)
  if (totalExpense > 0) {
    expenseLines.push({ accountCode: '9100', debit: totalExpense, credit: 0 })
  }

  // Close Ikhtisar L/R to Saldo Laba Ditahan
  const netIncome = totalRevenue - totalExpense
  const ikhtisarLines = []
  if (netIncome > 0) {
    ikhtisarLines.push({ accountCode: '9100', debit: netIncome, credit: 0 })
    ikhtisarLines.push({ accountCode: '3210', debit: 0, credit: netIncome })
  } else if (netIncome < 0) {
    ikhtisarLines.push({ accountCode: '3210', debit: Math.abs(netIncome), credit: 0 })
    ikhtisarLines.push({ accountCode: '9100', debit: 0, credit: Math.abs(netIncome) })
  }

  // Save all closing journals
  const results = []

  if (closingLines.length > 0) {
    const id1 = await saveJournal({
      date: endDate,
      description: `Jurnal Penutup Pendapatan Tahun ${year}`,
      type: 'closing',
      truckId: null,
      lines: closingLines,
      createdBy
    })
    results.push(id1)
  }

  if (expenseLines.length > 0) {
    const id2 = await saveJournal({
      date: endDate,
      description: `Jurnal Penutup Beban Tahun ${year}`,
      type: 'closing',
      truckId: null,
      lines: expenseLines,
      createdBy
    })
    results.push(id2)
  }

  if (ikhtisarLines.length > 0) {
    const id3 = await saveJournal({
      date: endDate,
      description: `Penutupan Ikhtisar L/R ke Saldo Laba Ditahan Tahun ${year}`,
      type: 'closing',
      truckId: null,
      lines: ikhtisarLines,
      createdBy
    })
    results.push(id3)
  }

  return { journalIds: results, netIncome }
}

// ===== RECURRING JOURNALS =====
export async function saveRecurringTemplate(templateData) {
  // templateData: { name, description, frequency ('monthly'), startDate, endDate, lines, truckId, nextRunDate }
  return await addDoc(collection(db, 'recurring_templates'), {
    ...templateData,
    status: 'active',
    createdAt: new Date().toISOString()
  })
}

export async function getRecurringTemplates() {
  const snap = await getDocs(query(collection(db, 'recurring_templates'), where('status', '==', 'active')))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function executeRecurringJournal(template, createdBy) {
  const journalId = await saveJournal({
    date: template.nextRunDate || new Date().toISOString().slice(0, 10),
    description: template.description,
    type: template.type || 'recurring',
    truckId: template.truckId || null,
    lines: template.lines,
    createdBy,
    recurringTemplateId: template.id
  })

  const execCount = (template.executionCount || 0) + 1
  const updateData = { executionCount: execCount, lastExecuted: new Date().toISOString() }

  // Cek apakah sudah mencapai batas eksekusi
  if (template.maxExecutions && execCount >= template.maxExecutions) {
    updateData.status = 'completed'
  } else {
    // Hitung nextRunDate: maju 1 periode, pakai dayOfMonth yang sama
    // Gunakan aritmatika string ISO (bukan setMonth) untuk hindari Date overflow
    // misal: new Date("2026-03-31").setMonth(3) → overflow ke May 1, bukan April 30
    const pad = n => String(n).padStart(2, '0')
    const baseParts = (template.nextRunDate || new Date().toISOString().slice(0, 10)).split('-')
    let yr = parseInt(baseParts[0])
    let mo = parseInt(baseParts[1]) - 1  // 0-indexed
    const dayOfMonth = template.dayOfMonth || parseInt(baseParts[2])

    if (template.frequency === 'monthly') {
      mo += 1
    } else if (template.frequency === 'quarterly') {
      mo += 3
    } else if (template.frequency === 'yearly') {
      yr += 1
    }
    // Normalize bulan jika overflow 12
    while (mo > 11) { mo -= 12; yr += 1; }

    // Clamp ke hari terakhir bulan target
    const maxDay = new Date(yr, mo + 1, 0).getDate()
    const clampedDay = Math.min(dayOfMonth, maxDay)
    updateData.nextRunDate = `${yr}-${pad(mo + 1)}-${pad(clampedDay)}`
  }

  await updateDoc(doc(db, 'recurring_templates', template.id), updateData)
  return journalId
}

export async function deleteRecurringTemplate(id) {
  await updateDoc(doc(db, 'recurring_templates', id), { status: 'deleted' })
}

export async function updateRecurringTemplateNextRunDate(id, nextRunDate) {
  await updateDoc(doc(db, 'recurring_templates', id), { nextRunDate })
}

// ===== TRUCKS (Cost Center) =====
export async function getTrucks() {
  const snap = await getDocs(collection(db, 'trucks'))
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(t => t.status !== 'deleted').sort((a, b) => a.name?.localeCompare(b.name))
}

export async function saveTruck(truckData) {
  return await addDoc(collection(db, 'trucks'), {
    ...truckData, createdAt: new Date().toISOString()
  })
}

export async function updateTruck(id, data) {
  await updateDoc(doc(db, 'trucks', id), data)
}

export async function deleteTruck(id) {
  await updateDoc(doc(db, 'trucks', id), { status: 'deleted', deletedAt: new Date().toISOString() })
}

// ===== ASSETS =====
export async function getAssets() {
  const snap = await getDocs(collection(db, 'assets'))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function saveAsset(assetData) {
  return await addDoc(collection(db, 'assets'), {
    ...assetData, createdAt: new Date().toISOString()
  })
}

export async function updateAsset(id, data) {
  await updateDoc(doc(db, 'assets', id), data)
}

// ===== INVOICES =====
export async function saveInvoice(invoiceData) {
  return await addDoc(collection(db, 'invoices'), {
    ...invoiceData,
    createdAt: new Date().toISOString(),
    status: invoiceData.status || 'draft'
  })
}

export async function getInvoices(filters = {}) {
  const snap = await getDocs(collection(db, 'invoices'))
  let results = snap.docs.map(d => ({ id: d.id, ...d.data() }))

  if (filters.status) results = results.filter(i => i.status === filters.status)
  if (filters.startDate) results = results.filter(i => i.date >= filters.startDate)
  if (filters.endDate) results = results.filter(i => i.date <= filters.endDate)

  return results.sort((a, b) => (a.date > b.date ? -1 : 1))
}

export async function updateInvoice(id, data) {
  await updateDoc(doc(db, 'invoices', id), { ...data, updatedAt: new Date().toISOString() })
}

export async function getJournal(id) {
  const snap = await getDoc(doc(db, 'journals', id))
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

/**
 * Tambah pembayaran ke invoice. Hitung ulang totalPaid dan status.
 * payment: { journalId, date, jumlahBayar, pph, netDiterima, account, keterangan }
 */
export async function addInvoicePayment(invoiceId, payment) {
  const snap = await getDoc(doc(db, 'invoices', invoiceId))
  if (!snap.exists()) throw new Error(`Invoice ${invoiceId} tidak ditemukan`)
  const inv = snap.data()
  const payments = [...(inv.payments || []), { ...payment, createdAt: new Date().toISOString() }]
  const totalPaid = payments.reduce((s, p) => s + (p.jumlahBayar || 0), 0)
  const status = computeInvoiceStatus(inv.amount, totalPaid)
  await updateDoc(doc(db, 'invoices', invoiceId), {
    payments, totalPaid, status, updatedAt: new Date().toISOString(),
  })
}

/**
 * Hapus pembayaran dari invoice (saat jurnal pembayaran dihapus). Hitung ulang status.
 */
export async function removeInvoicePayment(invoiceId, journalId) {
  const snap = await getDoc(doc(db, 'invoices', invoiceId))
  if (!snap.exists()) return
  const inv = snap.data()
  const payments = (inv.payments || []).filter(p => p.journalId !== journalId)
  const totalPaid = payments.reduce((s, p) => s + (p.jumlahBayar || 0), 0)
  const status = computeInvoiceStatus(inv.amount, totalPaid)
  await updateDoc(doc(db, 'invoices', invoiceId), {
    payments, totalPaid, status,
    ...(status !== 'paid' ? { paidDate: null } : {}),
    updatedAt: new Date().toISOString(),
  })
}

/**
 * Seluruh invoice yang masih terbuka untuk satu pelanggan.
 *
 * Sengaja memakai where() di Firestore, bukan pola tarik-seluruh-koleksi
 * seperti getInvoices(), karena pemilih multi-payment harus mengabaikan
 * filter tanggal halaman dan menampilkan tunggakan selama apa pun.
 *
 * Memerlukan composite index (customerId ASC, status ASC) di
 * firestore.indexes.json.
 */
export async function getOpenInvoicesByCustomer(customerId) {
  if (!customerId) return []
  const q = query(
    collection(db, 'invoices'),
    where('customerId', '==', customerId),
    where('status', 'in', ['unpaid', 'partial']),
  )
  const snap = await getDocs(q)
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
}

// Batas aman jauh di bawah limit 500 write per transaksi Firestore.
const MAX_INVOICE_PER_PEMBAYARAN = 50

/**
 * Mencatat satu penerimaan pembayaran yang melunasi beberapa invoice sekaligus.
 *
 * Satu runTransaction menulis: satu dokumen jurnal gabungan, lalu pembaruan
 * payments[]/totalPaid/status pada tiap invoice. Kalau ada satu invoice yang
 * statusnya berubah sejak modal dibuka, seluruh transaksi dibatalkan — tidak
 * ada partial write.
 *
 * rows: AllocationRow[] (lihat payments.js)
 * return: { journalId, paymentGroupId }
 */
export async function recordMultiInvoicePayment({ rows, account, date, keterangan, createdBy }) {
  const selected = (rows || []).filter(r => r.selected)

  if (!date) throw new Error('Tanggal wajib diisi')
  if (!account) throw new Error('Akun kas/bank wajib dipilih')
  if (selected.length > MAX_INVOICE_PER_PEMBAYARAN) {
    throw new Error(`Maksimal ${MAX_INVOICE_PER_PEMBAYARAN} invoice per pembayaran`)
  }

  // Integritas invoiceId diperiksa SEBELUM validateAllocations() karena
  // errors di sana dipetakan per invoiceId: id yang kosong akan bertumpuk di
  // key "undefined" dan membuat pesan kesalahan per baris tidak bisa dipercaya.
  const invoiceIds = selected.map(r => r.invoiceId)

  // Baris tanpa invoiceId lolos guard duplikat (Set hanya melihat kesamaan) dan
  // baru gagal jauh di dalam transaksi pada doc(db, 'invoices', undefined).
  // Dua baris yang sama-sama kosong bahkan mengaku "duplikat" — menyesatkan.
  if (invoiceIds.some(id => !id)) {
    throw new Error(
      'Ada baris pembayaran tanpa invoiceId. ' +
      'Muat ulang daftar invoice dan coba lagi.'
    )
  }

  // Satu invoice tercentang dua kali akan dibaca dua kali tetapi hanya
  // menyisakan satu tx.update() (write terakhir menang), sehingga salah satu
  // entri pembayaran hilang diam-diam. Tolak sejak awal.
  if (new Set(invoiceIds).size !== invoiceIds.length) {
    throw new Error('Ada invoice yang tercantum lebih dari satu kali')
  }

  const cek = validateAllocations(rows)
  if (!cek.valid) {
    // cek.errors dipetakan per invoiceId dan memuat satu-satunya keterangan
    // spesifik yang dimiliki user ("melebihi sisa tagihan", "PPh tidak valid").
    // Melemparnya sebagai string generik membuat jalur uang tidak bisa
    // didiagnosis, jadi detailnya dibawa dua kali: sebagai properti err.errors
    // untuk modal yang menandai per baris, dan dilipat ke dalam message untuk
    // pemanggil yang hanya menampilkan error.message.
    const rincian = Object.entries(cek.errors).map(([id, pesan]) => {
      const baris = selected.find(r => r.invoiceId === id)
      const label = baris?.invoiceNo || String(id).slice(0, 8)
      return `${label}: ${pesan}`
    })
    const err = new Error(
      cek.formError ||
      (rincian.length
        ? `Alokasi pembayaran tidak valid — ${rincian.join('; ')}`
        : 'Alokasi pembayaran tidak valid')
    )
    err.errors = cek.errors
    throw err
  }

  // keterangan ikut tertulis ke tiap entri payments[]; Firestore menolak
  // seluruh dokumen bila ada field undefined, dan stripUndefined() hanya
  // bekerja pada level teratas — jadi normalkan di sini.
  const catatan = keterangan || ''

  // Referensi dibuat lebih dulu agar journalId sudah diketahui sebelum commit
  // dan bisa ditulis ke tiap entri payments[].
  const journalRef = doc(collection(db, 'journals'))
  const paymentGroupId = crypto.randomUUID()

  const lines = buildPaymentJournalLines({ rows, account, keterangan: catatan })

  // buildJournalDoc() memegang satu-satunya aturan balance di modul ini dan
  // sekaligus menetapkan createdAt + status: 'posted'.
  const docData = stripUndefined(buildJournalDoc({
    date,
    description: catatan,
    type: getJournalType(account),
    truckId: null,
    lines,
    invoiceIds,
    paymentGroupId,
    createdBy: createdBy || null,
  }))

  // createdAt yang sama dipakai jurnal dan seluruh entri payments[]: satu
  // peristiwa pembayaran tidak boleh punya dua timestamp berbeda.
  const entries = buildPaymentEntries({
    rows, account, keterangan: catatan, date,
    journalId: journalRef.id, paymentGroupId, createdAt: docData.createdAt,
  })

  await runTransaction(db, async (tx) => {
    // FASE READ — seluruh get() harus selesai sebelum write pertama.
    const dibaca = []
    for (const { invoiceId, entry } of entries) {
      const ref = doc(db, 'invoices', invoiceId)
      const snap = await tx.get(ref)
      if (!snap.exists()) throw new Error(`Invoice ${invoiceId} tidak ditemukan`)
      dibaca.push({ invoiceId, ref, entry, data: snap.data() })
    }

    // VALIDASI ULANG terhadap data terkini di server.
    for (const { invoiceId, entry, data } of dibaca) {
      const label = data.invoiceNo || invoiceId.slice(0, 8)
      if (data.status !== 'unpaid' && data.status !== 'partial') {
        throw new Error(
          `Invoice ${label} sudah berstatus "${data.status}". ` +
          'Muat ulang daftar invoice dan coba lagi.'
        )
      }
      const sisa = (data.amount || 0) - (data.totalPaid || 0)
      if (entry.jumlahBayar > sisa + TOLERANSI_RUPIAH) {
        throw new Error(
          `Invoice ${label}: jumlah bayar melebihi sisa tagihan terkini. ` +
          'Muat ulang daftar invoice dan coba lagi.'
        )
      }
    }

    // FASE WRITE — jurnal dulu, lalu tiap invoice.
    tx.set(journalRef, docData)

    for (const { ref, entry, data } of dibaca) {
      const payments = [...(data.payments || []), entry]
      const totalPaid = payments.reduce((s, p) => s + (p.jumlahBayar || 0), 0)
      const status = computeInvoiceStatus(data.amount, totalPaid)
      tx.update(ref, stripUndefined({
        payments,
        totalPaid,
        status,
        ...(status === 'paid' ? { paidDate: date } : {}),
        updatedAt: new Date().toISOString(),
      }))
    }
  })

  // Audit ditulis setelah commit. Kegagalan audit tidak boleh membatalkan
  // operasi utama — pola yang sama dipakai writeAuditLog() di seluruh modul ini.
  await writeAuditLog(journalRef.id, 'create', createdBy, {
    description: catatan,
    invoiceIds,
    paymentGroupId,
  })

  return { journalId: journalRef.id, paymentGroupId }
}

// ===== CUSTOMERS =====
export async function getCustomers() {
  const snap = await getDocs(collection(db, 'customers'))
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => c.status !== 'deleted').sort((a, b) => a.customerNo?.localeCompare(b.customerNo))
}

export async function getNextCustomerNo() {
  const customers = await getCustomers()
  if (customers.length === 0) return 'CUST-001'
  const nums = customers.map(c => parseInt(c.customerNo?.replace('CUST-', '') || '0'))
  const max = Math.max(...nums, 0)
  return `CUST-${String(max + 1).padStart(3, '0')}`
}

export async function saveCustomer(customerData) {
  return await addDoc(collection(db, 'customers'), {
    ...customerData,
    createdAt: new Date().toISOString(),
    status: 'active'
  })
}

export async function updateCustomer(id, data) {
  await updateDoc(doc(db, 'customers', id), { ...data, updatedAt: new Date().toISOString() })
}

export async function deleteCustomer(id) {
  await updateDoc(doc(db, 'customers', id), { status: 'deleted', deletedAt: new Date().toISOString() })
}

// ===== SUPPLIERS =====
export async function getSuppliers() {
  const snap = await getDocs(collection(db, 'suppliers'))
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => s.status !== 'deleted').sort((a, b) => a.supplierNo?.localeCompare(b.supplierNo))
}

export async function getNextSupplierNo() {
  const suppliers = await getSuppliers()
  if (suppliers.length === 0) return 'SUPP-001'
  const nums = suppliers.map(s => parseInt(s.supplierNo?.replace('SUPP-', '') || '0'))
  const max = Math.max(...nums, 0)
  return `SUPP-${String(max + 1).padStart(3, '0')}`
}

export async function saveSupplier(supplierData) {
  return await addDoc(collection(db, 'suppliers'), {
    ...supplierData,
    createdAt: new Date().toISOString(),
    status: 'active'
  })
}

export async function updateSupplier(id, data) {
  await updateDoc(doc(db, 'suppliers', id), { ...data, updatedAt: new Date().toISOString() })
}

export async function deleteSupplier(id) {
  await updateDoc(doc(db, 'suppliers', id), { status: 'deleted', deletedAt: new Date().toISOString() })
}

// ===== PURCHASE INVOICES (Supplier) =====
export async function savePurchaseInvoice(data) {
  return await addDoc(collection(db, 'purchase_invoices'), stripUndefined({
    ...data,
    createdAt: new Date().toISOString(),
    status: data.status || 'unpaid'
  }))
}

export async function getPurchaseInvoices(filters = {}) {
  const snap = await getDocs(collection(db, 'purchase_invoices'))
  let results = snap.docs.map(d => ({ id: d.id, ...d.data() }))
  if (filters.supplierId) results = results.filter(i => i.supplierId === filters.supplierId)
  if (filters.status) results = results.filter(i => i.status === filters.status)
  return results.sort((a, b) => (a.date > b.date ? -1 : 1))
}

export async function updatePurchaseInvoice(id, data) {
  await updateDoc(doc(db, 'purchase_invoices', id), stripUndefined({ ...data, updatedAt: new Date().toISOString() }))
}

/**
 * Bayar tagihan supplier: tulis jurnal pembayaran DAN tandai tagihan lunas dalam
 * satu writeBatch. Sebelumnya kedua tulisan ini terpisah, sehingga kegagalan pada
 * langkah kedua (field undefined, atau rules menolak update bagi non-superadmin)
 * meninggalkan jurnal yatim Dr Biaya / Cr Kas di buku besar.
 *
 * @returns {Promise<string>} id jurnal pembayaran
 */
export async function payPurchaseInvoice(invoiceId, { journalData, paidDate, updatedBy }) {
  const docData = buildJournalDoc(journalData)
  const journalRef = doc(collection(db, 'journals'))

  const batch = writeBatch(db)
  batch.set(journalRef, docData)
  batch.update(doc(db, 'purchase_invoices', invoiceId), stripUndefined({
    status: 'paid',
    paidDate,
    journalId: journalRef.id,
    updatedBy,
    updatedAt: new Date().toISOString(),
  }))
  await batch.commit()

  await writeAuditLog(journalRef.id, 'create', journalData.createdBy, { description: journalData.description })
  return journalRef.id
}

// ===== COA MANAGEMENT (Firestore) =====
export async function getCustomCOA() {
  const snap = await getDocs(collection(db, 'coa'))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function addCustomAccount(accountData) {
  // accountData: { code, name, parent, level, type, normalBalance }
  return await addDoc(collection(db, 'coa'), {
    ...accountData,
    status: 'active',
    custom: true,
    createdAt: new Date().toISOString()
  })
}

export async function deactivateAccount(docId) {
  await updateDoc(doc(db, 'coa', docId), { status: 'inactive', updatedAt: new Date().toISOString() })
}

export async function reactivateAccount(docId) {
  await updateDoc(doc(db, 'coa', docId), { status: 'active', updatedAt: new Date().toISOString() })
}

// Deactivate built-in COA account (store override in Firestore)
export async function deactivateBuiltinAccount(code) {
  // Check if override doc exists
  const snap = await getDocs(query(collection(db, 'coa_overrides'), where('code', '==', code)))
  if (!snap.empty) {
    await updateDoc(doc(db, 'coa_overrides', snap.docs[0].id), { status: 'inactive', updatedAt: new Date().toISOString() })
  } else {
    await addDoc(collection(db, 'coa_overrides'), { code, status: 'inactive', createdAt: new Date().toISOString() })
  }
}

export async function reactivateBuiltinAccount(code) {
  const snap = await getDocs(query(collection(db, 'coa_overrides'), where('code', '==', code)))
  if (!snap.empty) {
    await updateDoc(doc(db, 'coa_overrides', snap.docs[0].id), { status: 'active', updatedAt: new Date().toISOString() })
  }
}

export async function getCOAOverrides() {
  const snap = await getDocs(collection(db, 'coa_overrides'))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

// ===== KARYAWAN (Employee Cost Center) =====
export async function getKaryawan() {
  const snap = await getDocs(collection(db, 'karyawan'))
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(k => k.status !== 'deleted').sort((a, b) => a.name?.localeCompare(b.name))
}

export async function saveKaryawan(data) {
  return await addDoc(collection(db, 'karyawan'), {
    ...data, createdAt: new Date().toISOString(), status: 'active'
  })
}

export async function updateKaryawan(id, data) {
  await updateDoc(doc(db, 'karyawan', id), { ...data, updatedAt: new Date().toISOString() })
}

export async function deleteKaryawan(id) {
  await updateDoc(doc(db, 'karyawan', id), { status: 'deleted', deletedAt: new Date().toISOString() })
}

// ===== BATCH IMPORT JOURNALS =====
/**
 * Import jurnal secara batch dari data yang sudah diparse dan divalidasi di sisi client.
 * Menggunakan writeBatch untuk efisiensi — tidak menulis audit_log per jurnal.
 * Jurnal yang tidak balance di-skip dan dilaporkan sebagai failed.
 *
 * @param {Object[]} journalsData - [{ ref, date, description, type, lines:[] }]
 * @param {string}   createdBy   - UID/nama user yang melakukan import
 * @returns {{ success: string[], failed: {ref, reason}[] }}
 */
export async function batchImportJournals(journalsData, createdBy) {
  const success = []
  const failed = []
  const valid = []

  for (const j of journalsData) {
    const totalDebit = j.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0)
    const totalCredit = j.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0)
    if (Math.abs(totalDebit - totalCredit) > 0.5) {
      failed.push({ ref: j.ref, reason: `Tidak balance (Dr ${totalDebit} ≠ Cr ${totalCredit})` })
      continue
    }
    valid.push({ ...j, totalDebit, totalCredit })
  }

  const CHUNK_SIZE = 200
  for (let i = 0; i < valid.length; i += CHUNK_SIZE) {
    const chunk = valid.slice(i, i + CHUNK_SIZE)
    const batch = writeBatch(db)
    for (const j of chunk) {
      const ref = doc(collection(db, 'journals'))
      batch.set(ref, {
        date: j.date,
        description: j.description,
        type: j.type || 'umum',
        lines: j.lines,
        totalDebit: j.totalDebit,
        totalCredit: j.totalCredit,
        createdAt: new Date().toISOString(),
        createdBy: createdBy || 'import',
        status: 'posted',
        sourceImport: true,
        importRef: j.ref,
      })
      success.push(j.ref)
    }
    await batch.commit()
  }

  return { success, failed }
}

// ===== COMPANY PROFILE =====
export async function getCompanyProfile() {
  const snap = await getDoc(doc(db, 'company_settings', 'profile'))
  if (snap.exists()) return snap.data()
  return null
}

export async function saveCompanyProfile(data) {
  await setDoc(doc(db, 'company_settings', 'profile'), {
    ...data,
    updatedAt: new Date().toISOString()
  })
}
