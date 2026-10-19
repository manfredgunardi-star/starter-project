/**
 * Audit nomor invoice kembar — sj-monitor (project Firestore: surat-jalan-monitor).
 *
 * HANYA MEMBACA. Skrip ini tidak pernah menulis, memperbaiki, atau menghapus
 * apa pun di Firestore. Perbaikan data produksi butuh persetujuan user sendiri.
 *
 * Kenapa ada: sampai commit sebelumnya, App.jsx men-dedup daftar invoice dengan
 * kunci `noInvoice` dan hanya menyimpan satu dokumen per nomor — yang updatedAt
 * (atau createdAt) terbaru. Nomor invoice di produksi banyak yang placeholder
 * ketik tangan dengan spasi tidak konsisten, jadi dua invoice yang benar-benar
 * berbeda bisa bernomor sama dan yang kalah TIDAK PERNAH dirender di layar mana
 * pun. Skrip ini menyisir seluruh koleksi untuk menemukan semua kejadian itu,
 * bukan hanya yang dilaporkan user.
 *
 * Cara jalan (butuh Application Default Credentials yang bisa membaca Firestore
 * project surat-jalan-monitor, misalnya `gcloud auth application-default login`
 * atau GOOGLE_APPLICATION_CREDENTIALS menunjuk ke service-account JSON):
 *
 *   cd scripts/sj-monitor-invoice-duplicates
 *   npm install
 *   FIREBASE_PROJECT_ID=surat-jalan-monitor node index.js
 */

import { Firestore } from '@google-cloud/firestore'
import { findCollisions, isActive, mergeById, timestampOf } from './lib/find-collisions.js'

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'surat-jalan-monitor'

const rupiah = (value) =>
  typeof value === 'number' ? value.toLocaleString('id-ID') : String(value ?? '-')

async function fetchCollection(db, name) {
  try {
    const snap = await db.collection(name).get()
    // normalizeInv di App.jsx: id dari field `id` bila ada, jatuh ke doc id.
    return snap.docs.map((doc) => ({
      ...doc.data(),
      id: doc.data()?.id || doc.id,
      _docId: doc.id,
      _collection: name,
    }))
  } catch (err) {
    console.warn(`⚠️  Koleksi "${name}" tidak terbaca (${err.code || err.message}) — dilewati.`)
    return []
  }
}

async function main() {
  const db = new Firestore({ projectId: PROJECT_ID })

  const [primary, legacy] = await Promise.all([
    fetchCollection(db, 'invoice'),
    fetchCollection(db, 'invoices'),
  ])

  const active = mergeById(primary, legacy).filter(isActive)
  const collisions = findCollisions(active)

  console.log(`Project         : ${PROJECT_ID}`)
  console.log(`Dokumen dibaca  : invoice=${primary.length}, invoices(legacy)=${legacy.length}`)
  console.log(`Invoice aktif   : ${active.length}`)
  console.log(`Nomor kembar    : ${collisions.length}`)

  if (collisions.length === 0) {
    console.log('\n✅ Tidak ada noInvoice yang dipakai lebih dari satu dokumen aktif.')
    return
  }

  let totalTersembunyi = 0

  for (const { noInvoice, group, pemenang } of collisions) {
    console.log(`\n─── "${noInvoice}" — ${group.length} dokumen aktif`)
    for (const inv of group) {
      const kalah = inv !== pemenang
      if (kalah) totalTersembunyi += typeof inv.totalHarga === 'number' ? inv.totalHarga : 0
      console.log(
        [
          `  ${kalah ? '✗ TERSEMBUNYI' : '✓ tampil     '}`,
          `id=${inv.id}`,
          `doc=${inv._collection}/${inv._docId}`,
          `updatedAt=${timestampOf(inv) || '-'}`,
          `totalHarga=${rupiah(inv.totalHarga)}`,
          `sj=${(inv.suratJalanIds || []).length}`,
        ].join('  ')
      )
    }
  }

  console.log(
    `\nTotal totalHarga pada dokumen yang selama ini tersembunyi: Rp ${rupiah(totalTersembunyi)}`
  )
  console.log('Catatan: skrip ini read-only. Tidak ada data yang diubah.')
}

main().catch((err) => {
  console.error('❌ Gagal:', err)
  process.exit(1)
})
