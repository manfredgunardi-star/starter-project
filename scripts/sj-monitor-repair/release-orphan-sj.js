/**
 * SJ-Monitor — Release Orphan Surat Jalan
 * ─────────────────────────────────────────────────────────────────────────────
 * Memulihkan Surat Jalan yang masih terkunci 'terinvoice' padahal invoice
 * induknya sudah dibatalkan, sehingga SJ tidak bisa dipilih untuk invoice baru.
 *
 * Penyebabnya diperbaiki di apps/sj-monitor/src/services/invoiceSJService.js,
 * tetapi dokumen yang terlanjur rusak tetap perlu diperbaiki satu kali.
 *
 * PENGAMAN
 *   1. DRY RUN adalah default. Tanpa flag --apply tidak ada satu pun write.
 *   2. SJ yang invoice induknya MASIH AKTIF akan ditolak, bukan dilepas —
 *      melepasnya berisiko membuat SJ ter-invoice dua kali.
 *   3. Hanya menulis field whitelist sjInvoiceFieldsOnly() dari firestore.rules.
 *   4. Tidak pernah menghapus dokumen. Setiap perubahan menulis history_log
 *      berisi nilai sebelumnya agar bisa ditelusuri / dikembalikan manual.
 *
 * PEMAKAIAN
 *   # 1. Lihat rencana (tidak menulis apa pun)
 *   node release-orphan-sj.js
 *
 *   # 2. Jalankan sungguhan setelah rencana di atas Anda setujui
 *   node release-orphan-sj.js --apply
 *
 *   # Nomor SJ lain (opsional, koma sebagai pemisah)
 *   node release-orphan-sj.js --sj=22E-04041,22E-04235
 *
 * Auth: Application Default Credentials.
 *   gcloud auth application-default login
 *   set FIREBASE_PROJECT_ID=surat-jalan-monitor   (PowerShell: $env:FIREBASE_PROJECT_ID=...)
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict'

const { Firestore } = require('@google-cloud/firestore')

// ─── Config ─────────────────────────────────────────────────────────────────

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'surat-jalan-monitor'
const ACTOR = process.env.REPAIR_ACTOR || 'repair-script'

// Enam SJ yang dilaporkan terkunci setelah invoice TMP-SI152/2026 dibatalkan.
const DEFAULT_SJ_NUMBERS = [
  '22E-04041',
  '22E-04235',
  '22E-04237',
  '22E-04448',
  '22E-04450',
  '22E-04508'
]

const APPLY = process.argv.includes('--apply')
const sjArg = process.argv.find(a => a.startsWith('--sj='))
const SJ_NUMBERS = sjArg
  ? sjArg.slice('--sj='.length).split(',').map(s => s.trim()).filter(Boolean)
  : DEFAULT_SJ_NUMBERS

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Mirror isSJTerinvoice() di apps/sj-monitor/src/utils/sjHelpers.js */
function isTerinvoice (sj) {
  const status = String(sj?.statusInvoice || '').toLowerCase()
  return status === 'terinvoice' || !!sj?.invoiceId || !!sj?.invoiceNo
}

function isLive (row) {
  return !!row && !row.deletedAt && row.isActive !== false
}

/** Invoice bisa berada di koleksi utama `invoice` atau legacy `invoices`. */
async function findInvoice (db, invoiceId) {
  if (!invoiceId) return { found: false, live: false, where: null }
  for (const col of ['invoice', 'invoices']) {
    const snap = await db.collection(col).doc(String(invoiceId)).get()
    if (snap.exists) {
      const data = snap.data() || {}
      if (isLive(data)) return { found: true, live: true, where: col, data }
      return { found: true, live: false, where: col, data }
    }
  }
  return { found: false, live: false, where: null }
}

async function findSJByNomor (db, nomorSJ) {
  const qs = await db.collection('surat_jalan').where('nomorSJ', '==', nomorSJ).get()
  return qs.docs.filter(d => isLive(d.data() || {}))
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main () {
  const db = new Firestore({ projectId: FIREBASE_PROJECT_ID })

  console.log(`\nProject   : ${FIREBASE_PROJECT_ID}`)
  console.log(`Mode      : ${APPLY ? '*** APPLY (menulis ke Firestore) ***' : 'DRY RUN (tidak menulis)'}`)
  console.log(`Target    : ${SJ_NUMBERS.length} Surat Jalan\n`)

  const plan = []

  for (const nomorSJ of SJ_NUMBERS) {
    const docs = await findSJByNomor(db, nomorSJ)

    if (docs.length === 0) {
      plan.push({ nomorSJ, action: 'SKIP', reason: 'SJ aktif tidak ditemukan' })
      continue
    }
    if (docs.length > 1) {
      plan.push({ nomorSJ, action: 'TOLAK', reason: `${docs.length} dokumen aktif dengan nomor sama — perlu diperiksa manual` })
      continue
    }

    const ref = docs[0].ref
    const sj = docs[0].data() || {}

    if (!isTerinvoice(sj)) {
      plan.push({ nomorSJ, action: 'SKIP', reason: 'sudah bebas, tidak perlu diperbaiki' })
      continue
    }

    const inv = await findInvoice(db, sj.invoiceId)
    if (inv.live) {
      plan.push({
        nomorSJ,
        action: 'TOLAK',
        reason: `invoice induk ${sj.invoiceNo || sj.invoiceId} MASIH AKTIF di /${inv.where} — melepas SJ ini berisiko double-invoice`
      })
      continue
    }

    plan.push({
      nomorSJ,
      action: 'PERBAIKI',
      ref,
      before: {
        statusInvoice: sj.statusInvoice ?? null,
        invoiceId: sj.invoiceId ?? null,
        invoiceNo: sj.invoiceNo ?? null
      },
      reason: inv.found
        ? `invoice induk sudah dibatalkan (/${inv.where})`
        : 'invoice induk tidak ada lagi'
    })
  }

  // ─── Laporan rencana ──────────────────────────────────────────────────────
  for (const p of plan) {
    const detail = p.before
      ? ` [statusInvoice=${p.before.statusInvoice}, invoiceNo=${p.before.invoiceNo}]`
      : ''
    console.log(`  ${p.action.padEnd(9)} ${p.nomorSJ.padEnd(12)} ${p.reason}${detail}`)
  }

  const toFix = plan.filter(p => p.action === 'PERBAIKI')
  const rejected = plan.filter(p => p.action === 'TOLAK')

  console.log(`\nRingkasan : ${toFix.length} diperbaiki, ${rejected.length} ditolak, ${plan.length - toFix.length - rejected.length} dilewati`)

  if (!APPLY) {
    console.log('\nDRY RUN — tidak ada perubahan. Jalankan ulang dengan --apply bila rencana di atas sudah benar.\n')
    return
  }
  if (toFix.length === 0) {
    console.log('\nTidak ada yang perlu ditulis.\n')
    return
  }

  // ─── Eksekusi ─────────────────────────────────────────────────────────────
  const nowIso = new Date().toISOString()
  const batch = db.batch()

  for (const p of toFix) {
    batch.set(p.ref, {
      statusInvoice: 'belum',
      invoiceId: null,
      invoiceNo: null,
      updatedAt: nowIso,
      updatedBy: ACTOR
    }, { merge: true })

    const logId = `LOG-RELEASESJ-${p.nomorSJ}-${Date.now()}`
    batch.set(db.collection('history_log').doc(logId), {
      id: logId,
      action: 'release_orphan_sj',
      suratJalanNo: p.nomorSJ,
      details: {
        reason: p.reason,
        before: p.before,
        after: { statusInvoice: 'belum', invoiceId: null, invoiceNo: null }
      },
      createdAt: nowIso,
      createdBy: ACTOR
    })
  }

  await batch.commit()
  console.log(`\n✅ ${toFix.length} Surat Jalan dilepas dari invoice. ${toFix.length} baris history_log ditulis.\n`)
}

main().catch(err => {
  console.error('\n❌ Gagal:', err?.message || err)
  process.exit(1)
})
