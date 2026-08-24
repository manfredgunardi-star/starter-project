/**
 * Backfill invoices.amount — bruto → piutang bersih setelah potongan uang jalan.
 *
 * Seluruh aturan hidup di apps/bul-accounting/src/utils/invoiceAmountBackfill.js
 * (murni, teruji vitest). File ini hanya membaca Firestore, memanggil perencana,
 * menulis laporan CSV, lalu menulis balik bila DRY_RUN=false.
 *
 * Dry run (default):
 *   FIREBASE_PROJECT_ID=bul-accounting node index.js
 *
 * Eksekusi sungguhan:
 *   FIREBASE_PROJECT_ID=bul-accounting DRY_RUN=false node index.js
 */

import { Firestore } from '@google-cloud/firestore'
import fs from 'node:fs'
import path from 'node:path'
import { planInvoiceAmountFix } from '../../apps/bul-accounting/src/utils/invoiceAmountBackfill.js'

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'bul-accounting'
const DRY_RUN = process.env.DRY_RUN !== 'false'
const OUT_DIR = process.env.OUT_DIR || '.'

function csvCell(value) {
  const str = String(value ?? '')
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

function writeCsv(filePath, header, rows) {
  const lines = [header.join(','), ...rows.map(row => row.map(csvCell).join(','))]
  fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf8')
}

async function fetchAll(db, name) {
  const snap = await db.collection(name).get()
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
}

async function main() {
  const db = new Firestore({ projectId: PROJECT_ID })

  const [queueItems, invoices] = await Promise.all([
    fetchAll(db, 'integration_queue'),
    fetchAll(db, 'invoices'),
  ])

  const plan = planInvoiceAmountFix(queueItems, invoices)

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const updatePath = path.join(OUT_DIR, `backfill-updates-${stamp}.csv`)
  const skipPath = path.join(OUT_DIR, `backfill-skipped-${stamp}.csv`)

  writeCsv(
    updatePath,
    ['invoiceId', 'invoiceNo', 'amountBefore', 'amountAfter', 'amountGross', 'totalUJ'],
    plan.updates.map(u => [u.invoiceId, u.invoiceNo, u.amountBefore, u.amountAfter, u.amountGross, u.totalUJ]),
  )
  writeCsv(
    skipPath,
    ['invoiceId', 'invoiceNo', 'reason'],
    plan.skipped.map(s => [s.invoiceId, s.invoiceNo, s.reason]),
  )

  console.log(`Project        : ${PROJECT_ID}`)
  console.log(`Mode           : ${DRY_RUN ? 'DRY RUN (tidak menulis)' : 'LIVE (menulis Firestore)'}`)
  console.log(`Antrian dibaca : ${queueItems.length}`)
  console.log(`Invoice dibaca : ${invoices.length}`)
  console.log(`Akan dikoreksi : ${plan.totals.updateCount}`)
  console.log(`Dilewati       : ${plan.totals.skipCount}`)
  console.log(`Total uang jalan yang di-net : ${plan.totals.totalUJ}`)
  console.log(`Perubahan total amount       : ${plan.totals.amountDelta}`)
  console.log(`Laporan koreksi : ${updatePath}`)
  console.log(`Laporan dilewati: ${skipPath}`)

  const negatif = plan.updates.filter(u => u.amountAfter < 0)
  if (negatif.length > 0) {
    console.log(`\nPERHATIAN: ${negatif.length} invoice menjadi bernilai negatif (uang jalan melebihi nilai invoice):`)
    for (const u of negatif) console.log(`  ${u.invoiceNo}: ${u.amountAfter}`)
  }

  if (DRY_RUN) {
    console.log('\nDry run selesai. Periksa CSV, lalu jalankan ulang dengan DRY_RUN=false untuk menulis.')
    return
  }

  let written = 0
  for (const u of plan.updates) {
    await db.collection('invoices').doc(u.invoiceId).update({
      amount: u.amountAfter,
      amountGross: u.amountGross,
      totalUJ: u.totalUJ,
      updatedAt: new Date().toISOString(),
      backfillNote: 'amount dikoreksi ke piutang bersih setelah potongan uang jalan',
    })
    written += 1
  }
  console.log(`\nSelesai. ${written} invoice diperbarui.`)
}

main().catch(err => {
  console.error('Backfill gagal:', err)
  process.exitCode = 1
})
