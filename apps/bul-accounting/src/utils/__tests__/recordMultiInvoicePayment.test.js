import { describe, it, expect, beforeEach, vi } from 'vitest'

// recordMultiInvoicePayment() adalah jalur uang paling rawan di fitur ini: satu
// runTransaction menulis satu jurnal gabungan + pembaruan payments[]/totalPaid/
// status pada beberapa invoice sekaligus. Test di sini memakai fake transaction
// yang MENCATAT URUTAN get/set/update, sehingga jaminan yang diuji adalah
// perilaku nyata (urutan read-before-write, tidak ada partial write, akumulasi
// totalPaid), bukan sekadar "mock terpanggil".

const h = vi.hoisted(() => ({
  // invoiceId -> data dokumen invoice versi server
  store: {},
  // catatan berurutan seluruh operasi: get, set, update, commit, audit
  log: [],
}))

vi.mock('../../firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, name) => ({ __collection: name })),
  // doc(collection) -> ref auto-id; doc(db, 'coll', id) -> ref eksplisit
  doc: vi.fn((...args) =>
    args.length === 1
      ? { id: 'JRN-AUTO-1', __path: `${args[0].__collection}/JRN-AUTO-1` }
      : { id: args[2], __path: `${args[1]}/${args[2]}` }
  ),
  runTransaction: vi.fn(async (_db, callback) => {
    const tx = {
      get: async (ref) => {
        h.log.push({ op: 'get', path: ref.__path })
        const data = h.store[ref.id]
        return { exists: () => data !== undefined, data: () => data }
      },
      set: (ref, data) => { h.log.push({ op: 'set', path: ref.__path, data }) },
      update: (ref, data) => { h.log.push({ op: 'update', path: ref.__path, data }) },
    }
    const hasil = await callback(tx)
    // Penanda commit: apa pun yang tercatat setelah ini terjadi di luar transaksi.
    h.log.push({ op: 'commit' })
    return hasil
  }),
  addDoc: vi.fn(async (col, data) => {
    h.log.push({ op: 'audit', path: col.__collection, data })
    return { id: 'AUDIT-1' }
  }),
  updateDoc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(async () => ({ docs: [] })),
  query: vi.fn(), where: vi.fn(), orderBy: vi.fn(),
  Timestamp: {}, writeBatch: vi.fn(), limit: vi.fn(), setDoc: vi.fn(),
}))

import { recordMultiInvoicePayment } from '../accounting'

// ===== helper =====

const seedInvoice = (id, over = {}) => {
  h.store[id] = {
    invoiceNo: `INV-${id}`,
    customerId: 'CUST_1',
    amount: 1_000_000,
    totalPaid: 0,
    status: 'unpaid',
    payments: [],
    ...over,
  }
}

const row = (over = {}) => ({
  invoiceId: 'INV_A',
  invoiceNo: 'INV-001',
  truckId: 'TRK_1',
  amount: 1_000_000,
  totalPaid: 0,
  selected: true,
  jumlahBayar: 1_000_000,
  pph: 0,
  ...over,
})

const args = (rows, over = {}) => ({
  rows,
  account: '1112',
  date: '2026-08-21',
  keterangan: 'Terima transfer BCA',
  createdBy: 'uid-kasir',
  ...over,
})

const writes = () => h.log.filter(e => e.op === 'set' || e.op === 'update')
const journalWrite = () => h.log.find(e => e.op === 'set' && e.path.startsWith('journals/'))
const invoiceWrite = (id) => h.log.find(e => e.op === 'update' && e.path === `invoices/${id}`)

// stripUndefined() hanya bekerja di level teratas; pemeriksaan ini sengaja
// menelusuri ke dalam array payments[] tempat entri bersarang berada.
const adaUndefined = (v) => {
  if (v === undefined) return true
  if (Array.isArray(v)) return v.some(adaUndefined)
  if (v && typeof v === 'object') return Object.values(v).some(adaUndefined)
  return false
}

beforeEach(() => {
  h.store = {}
  h.log = []
})

// ===== validasi sebelum menyentuh Firestore =====

describe('recordMultiInvoicePayment — validasi sebelum I/O', () => {
  it('tidak ada baris tercentang: memakai formError dan tidak membuka transaksi', async () => {
    await expect(
      recordMultiInvoicePayment(args([row({ selected: false })]))
    ).rejects.toThrow('Pilih minimal satu invoice')

    expect(h.log).toEqual([])
  })

  it('kesalahan per baris: pesan memuat label invoice + alasannya, err.errors terisi', async () => {
    // Baris melewati sisa tagihannya sendiri -> validateAllocations() mengisi
    // errors[invoiceId], sementara formError tetap '' (kesalahan tingkat baris).
    const promise = recordMultiInvoicePayment(
      args([row({ jumlahBayar: 2_000_000 })])
    )

    await expect(promise).rejects.toThrow(/INV-001/)
    await expect(promise).rejects.toThrow(/melebihi sisa tagihan/)

    const err = await promise.catch(e => e)
    expect(err.errors).toEqual({ INV_A: 'Jumlah bayar melebihi sisa tagihan' })
    // Bukan lagi string generik yang membuang seluruh detail
    expect(err.message).not.toBe('Alokasi pembayaran tidak valid')
    expect(h.log).toEqual([])
  })

  it('kesalahan per baris tanpa invoiceNo: label jatuh ke potongan invoiceId', async () => {
    const err = await recordMultiInvoicePayment(
      args([row({ invoiceId: 'ABCDEFGH1234567', invoiceNo: '', pph: 999_999_999 })])
    ).catch(e => e)

    expect(err.message).toContain('ABCDEFGH')
    expect(err.message).toContain('PPh tidak valid')
    expect(err.errors.ABCDEFGH1234567).toBe('PPh tidak valid')
  })

  it('invoiceId duplikat ditolak sebelum ada get() apa pun', async () => {
    await expect(
      recordMultiInvoicePayment(args([
        row({ jumlahBayar: 400_000 }),
        row({ jumlahBayar: 400_000 }),
      ]))
    ).rejects.toThrow('tercantum lebih dari satu kali')

    expect(h.log).toEqual([])
  })

  it('invoiceId kosong ditolak dengan pesannya sendiri, bukan pesan duplikat', async () => {
    // Dua baris tanpa invoiceId dulunya menciut jadi ukuran 1 di Set dan
    // dilaporkan sebagai "duplikat"; satu baris kosong lolos sepenuhnya lalu
    // meledak di dalam transaksi pada doc(db, 'invoices', undefined).
    const dua = await recordMultiInvoicePayment(args([
      row({ invoiceId: undefined, jumlahBayar: 400_000 }),
      row({ invoiceId: undefined, jumlahBayar: 400_000 }),
    ])).catch(e => e)
    expect(dua.message).toContain('tanpa invoiceId')
    expect(dua.message).not.toMatch(/lebih dari satu kali/)

    const satu = await recordMultiInvoicePayment(args([
      row({ invoiceId: undefined, jumlahBayar: 400_000 }),
    ])).catch(e => e)
    expect(satu.message).toContain('tanpa invoiceId')

    expect(h.log).toEqual([])
  })

  it('lebih dari 50 invoice ditolak (batas write per transaksi)', async () => {
    const banyak = Array.from({ length: 51 }, (_, i) =>
      row({ invoiceId: `INV_${i}`, invoiceNo: `INV-${i}`, jumlahBayar: 1_000 })
    )

    await expect(recordMultiInvoicePayment(args(banyak)))
      .rejects.toThrow('Maksimal 50 invoice per pembayaran')

    expect(h.log).toEqual([])

    // 50 baris masih boleh lewat: batasnya inklusif, bukan off-by-one.
    const pas = banyak.slice(0, 50)
    pas.forEach(r => seedInvoice(r.invoiceId, { invoiceNo: r.invoiceNo }))
    await expect(recordMultiInvoicePayment(args(pas))).resolves.toBeTruthy()
  })
})

// ===== di dalam transaksi =====

describe('recordMultiInvoicePayment — transaksi', () => {
  it('seluruh get() selesai sebelum write pertama', async () => {
    // Firestore menolak read setelah write di dalam runTransaction. Tanpa test
    // ini, regresi urutan hanya terlihat di produksi.
    ;['INV_A', 'INV_B', 'INV_C'].forEach((id, i) =>
      seedInvoice(id, { invoiceNo: `INV-00${i + 1}` })
    )

    await recordMultiInvoicePayment(args([
      row({ invoiceId: 'INV_A', jumlahBayar: 400_000 }),
      row({ invoiceId: 'INV_B', invoiceNo: 'INV-002', jumlahBayar: 400_000 }),
      row({ invoiceId: 'INV_C', invoiceNo: 'INV-003', jumlahBayar: 400_000 }),
    ]))

    const ops = h.log.map(e => e.op)
    const getTerakhir = ops.lastIndexOf('get')
    const writePertama = ops.findIndex(o => o === 'set' || o === 'update')

    expect(getTerakhir).toBe(2)          // tiga get berurutan di awal
    expect(writePertama).toBeGreaterThan(getTerakhir)
    expect(writes()).toHaveLength(4)     // 1 jurnal + 3 invoice
  })

  it('invoice sudah lunas di server: melempar TANPA satu pun write', async () => {
    seedInvoice('INV_A', { invoiceNo: 'INV-001', status: 'paid', totalPaid: 1_000_000 })
    seedInvoice('INV_B', { invoiceNo: 'INV-002' })

    await expect(recordMultiInvoicePayment(args([
      row({ invoiceId: 'INV_A', jumlahBayar: 500_000 }),
      row({ invoiceId: 'INV_B', invoiceNo: 'INV-002', jumlahBayar: 500_000 }),
    ]))).rejects.toThrow(/sudah berstatus "paid"/)

    // Jaminan tanpa partial write: invoice kedua yang masih valid pun tidak ditulis.
    expect(writes()).toEqual([])
    expect(h.log.some(e => e.op === 'commit')).toBe(false)
    expect(h.log.some(e => e.op === 'audit')).toBe(false)
  })

  it('sisa tagihan di server sudah berkurang: melempar TANPA satu pun write', async () => {
    // Baris di modal masih mengira totalPaid = 0 (dibuka sebelum ada pembayaran
    // lain), padahal di server sudah terbayar 600.000.
    seedInvoice('INV_A', {
      invoiceNo: 'INV-001',
      status: 'partial',
      totalPaid: 600_000,
      payments: [{ journalId: 'JRN-LAMA', jumlahBayar: 600_000 }],
    })

    await expect(recordMultiInvoicePayment(args([
      row({ invoiceId: 'INV_A', totalPaid: 0, jumlahBayar: 1_000_000 }),
    ]))).rejects.toThrow(/melebihi sisa tagihan terkini/)

    expect(writes()).toEqual([])
    expect(h.log.some(e => e.op === 'audit')).toBe(false)
  })

  it('totalPaid diakumulasi dari payments[] server dan entri lama dipertahankan', async () => {
    seedInvoice('INV_A', {
      invoiceNo: 'INV-001',
      status: 'partial',
      totalPaid: 300_000,
      payments: [{ journalId: 'JRN-LAMA', jumlahBayar: 300_000, date: '2026-07-01' }],
    })

    await recordMultiInvoicePayment(args([
      row({ invoiceId: 'INV_A', totalPaid: 300_000, jumlahBayar: 200_000 }),
    ]))

    const payload = invoiceWrite('INV_A').data
    expect(payload.payments).toHaveLength(2)
    expect(payload.payments[0].journalId).toBe('JRN-LAMA')   // entri lama utuh
    expect(payload.payments[1].jumlahBayar).toBe(200_000)
    expect(payload.totalPaid).toBe(500_000)                  // 300.000 + 200.000
    expect(payload.status).toBe('partial')
  })

  it('pembayaran sebagian: paidDate tidak ikut ditulis', async () => {
    seedInvoice('INV_A', { invoiceNo: 'INV-001' })

    await recordMultiInvoicePayment(args([
      row({ invoiceId: 'INV_A', jumlahBayar: 250_000 }),
    ]))

    const payload = invoiceWrite('INV_A').data
    expect(payload.status).toBe('partial')
    expect('paidDate' in payload).toBe(false)
  })

  it('sisa pecahan 0,4 rupiah: status dibulatkan jadi paid dan paidDate diisi', async () => {
    // computeInvoiceStatus() membandingkan nilai yang DIBULATKAN untuk 'paid'
    // tetapi nilai mentah untuk 'partial'. Asimetri ini disengaja; test mengunci
    // supaya tidak ada yang "merapikan" salah satu sisi diam-diam.
    seedInvoice('INV_A', { invoiceNo: 'INV-001', amount: 1_000_000.4 })

    await recordMultiInvoicePayment(args([
      row({ invoiceId: 'INV_A', amount: 1_000_000.4, jumlahBayar: 1_000_000 }),
    ]))

    const payload = invoiceWrite('INV_A').data
    expect(payload.totalPaid).toBe(1_000_000)
    expect(payload.totalPaid).toBeLessThan(1_000_000.4)  // mentah: masih kurang bayar
    expect(payload.status).toBe('paid')                  // dibulatkan: lunas
    expect(payload.paidDate).toBe('2026-08-21')
  })

  it('createdAt jurnal sama persis dengan createdAt tiap entri payments[]', async () => {
    seedInvoice('INV_A', { invoiceNo: 'INV-001' })
    seedInvoice('INV_B', { invoiceNo: 'INV-002' })

    await recordMultiInvoicePayment(args([
      row({ invoiceId: 'INV_A', jumlahBayar: 400_000 }),
      row({ invoiceId: 'INV_B', invoiceNo: 'INV-002', jumlahBayar: 400_000 }),
    ]))

    const jurnal = journalWrite().data
    expect(typeof jurnal.createdAt).toBe('string')

    for (const id of ['INV_A', 'INV_B']) {
      const baru = invoiceWrite(id).data.payments.at(-1)
      expect(baru.createdAt).toBe(jurnal.createdAt)
      expect(baru.journalId).toBe('JRN-AUTO-1')
      expect(baru.paymentGroupId).toBe(jurnal.paymentGroupId)
    }
  })

  it('keterangan tidak diisi: tidak ada undefined di jurnal maupun di dalam payments[]', async () => {
    seedInvoice('INV_A', { invoiceNo: 'INV-001' })

    const { journalId, paymentGroupId } = await recordMultiInvoicePayment({
      rows: [row({ invoiceId: 'INV_A', jumlahBayar: 400_000 })],
      account: '1112',
      date: '2026-08-21',
      // keterangan sengaja dihilangkan (mis. user tidak mengisi catatan)
      createdBy: 'uid-kasir',
    })

    const jurnal = journalWrite().data
    const payload = invoiceWrite('INV_A').data

    expect(adaUndefined(jurnal)).toBe(false)
    expect(jurnal.description).toBe('')
    // Bagian yang tidak bisa dijangkau stripUndefined(): objek di dalam array.
    expect(adaUndefined(payload)).toBe(false)
    expect(payload.payments.at(-1).keterangan).toBe('')

    expect(journalId).toBe('JRN-AUTO-1')
    expect(typeof paymentGroupId).toBe('string')
    expect(paymentGroupId.length).toBeGreaterThan(0)
  })

  it('audit log ditulis setelah commit, bukan di dalam transaksi', async () => {
    seedInvoice('INV_A', { invoiceNo: 'INV-001' })

    await recordMultiInvoicePayment(args([
      row({ invoiceId: 'INV_A', jumlahBayar: 400_000 }),
    ]))

    const ops = h.log.map(e => e.op)
    expect(ops.indexOf('audit')).toBeGreaterThan(ops.indexOf('commit'))

    const audit = h.log.find(e => e.op === 'audit')
    expect(audit.path).toBe('audit_log')
    expect(audit.data.journalId).toBe('JRN-AUTO-1')
    expect(audit.data.invoiceIds).toEqual(['INV_A'])
  })
})
