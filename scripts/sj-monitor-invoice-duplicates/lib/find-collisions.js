/**
 * Bagian murni dari audit nomor invoice kembar — tanpa Firestore, bisa diuji
 * tanpa kredensial maupun dependency.
 */

export const isActive = (row) => !row?.deletedAt && row?.isActive !== false

export const timestampOf = (row) => String(row?.updatedAt || row?.createdAt || '')

/** mergeById dari apps/sj-monitor/src/utils/sjHelpers.js. */
export function mergeById(primary, legacy) {
  const byId = new Map()
  for (const row of [...primary, ...legacy]) {
    const id = String(row?.id ?? '')
    if (!id) continue
    const prev = byId.get(id)
    if (!prev || timestampOf(row) > timestampOf(prev)) byId.set(id, row)
  }
  return Array.from(byId.values())
}

/**
 * Kelompokkan invoice aktif per `noInvoice` dan kembalikan hanya nomor yang
 * dipakai lebih dari satu dokumen. `pemenang` adalah dokumen yang selama ini
 * TAMPIL di UI di bawah dedup lama — sisanya tak pernah dirender di layar mana pun.
 */
export function findCollisions(active) {
  const byNumber = new Map()
  for (const inv of active) {
    const key = String(inv?.noInvoice || inv?.id || '').trim()
    if (!key) continue
    if (!byNumber.has(key)) byNumber.set(key, [])
    byNumber.get(key).push(inv)
  }

  return Array.from(byNumber.entries())
    .filter(([, group]) => group.length > 1)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([noInvoice, group]) => ({
      noInvoice,
      group,
      // Aturan dedup lama: fold dengan `nextTs >= prevTs`, jadi pada seri
      // dokumen yang dibaca terakhir yang menang.
      pemenang: group.reduce((prev, inv) => (timestampOf(inv) >= timestampOf(prev) ? inv : prev)),
    }))
}
