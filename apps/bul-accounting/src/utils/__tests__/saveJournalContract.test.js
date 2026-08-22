import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// Regresi P0: saveJournal() mengembalikan STRING id (ref.id), bukan DocumentReference.
// Pemanggil yang menulis `journal.id` menghasilkan `undefined`, dan Firestore menolak
// field undefined (ignoreUndefinedProperties default false di src/firebase.js), sehingga
// updateDoc() melempar error dan jurnal yang sudah tersimpan jadi yatim (orphan).

vi.mock('../../firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(), query: vi.fn(), where: vi.fn(), orderBy: vi.fn(),
  getDocs: vi.fn(async () => ({ docs: [] })),
  addDoc: vi.fn(async () => ({ id: 'JRN123' })),
  updateDoc: vi.fn(), doc: vi.fn(), getDoc: vi.fn(),
  Timestamp: {}, writeBatch: vi.fn(), limit: vi.fn(), setDoc: vi.fn(),
  runTransaction: vi.fn(),
}))

import { saveJournal } from '../accounting'

describe('saveJournal contract', () => {
  it('mengembalikan string id, bukan objek DocumentReference', async () => {
    const result = await saveJournal({
      date: '2026-08-20',
      description: 'Bayar tagihan supplier',
      type: 'bank',
      lines: [
        { accountCode: '6110', debit: 1000, credit: 0 },
        { accountCode: '1112', debit: 0, credit: 1000 },
      ],
      createdBy: 'uid1',
    })

    expect(typeof result).toBe('string')
    expect(result).toBe('JRN123')
    // Menegaskan kenapa `journal.id` bug: string tidak punya properti `.id`
    expect(result.id).toBeUndefined()
  })
})

describe('tidak ada pemanggil saveJournal yang mendereferensi .id', () => {
  const srcDir = path.resolve(process.cwd(), 'src')

  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return e.name === '__tests__' ? [] : walk(p)
    return /\.jsx?$/.test(e.name) ? [p] : []
  })

  // `X.id` dengan X sebagai identifier utuh (bukan bagian dari `fooX.id`)
  const dereferencesId = (code, varName) => {
    const needle = varName + '.id'
    let from = 0
    for (;;) {
      const at = code.indexOf(needle, from)
      if (at === -1) return false
      const before = at === 0 ? '' : code[at - 1]
      const after = code[at + needle.length] || ''
      const isWord = (c) => /[A-Za-z0-9_$]/.test(c)
      if (!isWord(before) && !isWord(after)) return true
      from = at + 1
    }
  }

  it('setiap `await saveJournal(...)` disimpan sebagai string id', () => {
    const files = walk(srcDir)
    // Self-check: guard tidak boleh lulus hanya karena daftar file kosong.
    expect(files.some(f => f.endsWith('BiayaPage.jsx'))).toBe(true)
    expect(files.some(f => f.endsWith('PenjualanPage.jsx'))).toBe(true)

    const offenders = []

    for (const file of files) {
      const code = fs.readFileSync(file, 'utf8')
      // Nama variabel penerima hasil saveJournal: `const X = await saveJournal(`
      const re = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*await\s+saveJournal\s*\(/g
      let m
      while ((m = re.exec(code)) !== null) {
        const varName = m[1]
        if (dereferencesId(code.slice(m.index), varName)) {
          offenders.push(path.relative(srcDir, file) + ' -> ' + varName + '.id')
        }
      }
    }

    expect(offenders).toEqual([])
  })
})
