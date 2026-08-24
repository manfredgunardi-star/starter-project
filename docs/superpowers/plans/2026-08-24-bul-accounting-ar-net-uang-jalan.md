# Piutang Bersih Setelah Potongan Uang Jalan — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menyelaraskan subledger AR (`invoices`) dengan GL 1121 dengan menyimpan piutang bersih setelah potongan uang jalan, lalu mengoreksi 35 invoice historis yang terlanjur bruto.

**Architecture:** Satu helper murni (`resolvePiutangNet`) menjadi sumber tunggal aturan bruto→net, dipakai oleh jalur tulis (`approveIntegrationItem`), jalur tampilan (`PenjualanPage`), dan perencana backfill. Backfill dipisah menjadi modul murni yang teruji vitest dan runner Firestore setipis mungkin dengan `DRY_RUN` default menyala.

**Tech Stack:** React 18 + Vite, Firebase Firestore (client SDK v10), Vitest 4 + jsdom, Node >= 20 + `@google-cloud/firestore` untuk runner.

**Spec:** `docs/superpowers/specs/2026-08-24-bul-accounting-ar-net-uang-jalan-design.md`

## Global Constraints

- Komentar kode, pesan UI, dan teks laporan memakai Bahasa Indonesia. Pesan commit memakai English conventional commit (`feat:`, `fix:`, `test:`, `docs:`, `chore:`).
- Angka rupiah disimpan sebagai `number`; pemformatan hanya terjadi saat render lewat `formatCurrency`.
- Dilarang hard-delete data bisnis. Seluruh penghapusan memakai soft delete (`status: 'deleted'` / `'cancelled'` + `deletedAt`).
- Dilarang mengubah apa pun di `apps/bul-monitor` — sisi pengirim sudah benar.
- Dilarang mengubah `firestore.rules`, COA di `src/data/chartOfAccounts.js`, dan seluruh baris debit/kredit jurnal. Task ini hanya menyentuh nilai `amount` pada subledger, bukan jurnal.
- Urutan resolusi piutang bersih persis: `piutangNet` bila berupa angka berhingga → selain itu `totalNilai − totalUJ` → selain itu `totalNilai`.
- Field yang ditulis pada dokumen invoice bridge persis tiga: `amount` (bersih), `amountGross` (bruto), `totalUJ`.
- Backfill wajib idempoten dan wajib melewati invoice yang sudah punya pembayaran.
- `DRY_RUN` pada runner backfill default `true`. Menulis hanya bila `DRY_RUN=false` di-set eksplisit.
- Validasi wajib dijalankan dari `apps/bul-accounting`: `npm test` dan `npm run build`. Build/test lokal tidak memberikan izin deployment. Production deployment dilarang.

## File Structure

| File | Tanggung jawab |
|---|---|
| `apps/bul-accounting/src/utils/invoiceAmounts.js` | **Baru.** Sumber tunggal aturan bruto→net: `resolvePiutangNet`, `describeInvoiceGross`. Murni, tanpa I/O, tanpa import firebase. |
| `apps/bul-accounting/src/utils/integrationUtils.js` | **Ubah.** `approveIntegrationItem` menulis `amount`/`amountGross`/`totalUJ`. |
| `apps/bul-accounting/src/pages/PenjualanPage.jsx` | **Ubah.** Menampilkan rincian "Bruto − UJ" pada kartu invoice dan modal pembayaran. |
| `apps/bul-accounting/src/utils/invoiceAmountBackfill.js` | **Baru.** Perencana backfill murni: `planInvoiceAmountFix(queueItems, invoices)`. Tanpa I/O. |
| `scripts/bul-accounting-backfill/index.js` | **Baru.** Runner Firestore setipis mungkin. Membaca, memanggil perencana, menulis CSV, menulis Firestore hanya bila `DRY_RUN=false`. |
| `shared/bul-bridge/README.md` | **Ubah.** Kontrak bridge sebenarnya: field, mapping akun, aturan bruto vs net. |

## Fase & Pembagian Model

| Fase | Task | Sifat kerja | Model implementer | Effort |
|---|---|---|---|---|
| 0 | Cleanup 7 dokumen produksi | Manual UI, butuh kredensial | — (user) | — |
| 1 | Task 1–2 | Transkripsi kode lengkap, 1–2 file per task | `haiku` | low |
| 2 | Task 3 | Logika murni + tabel kasus uji | `sonnet` | medium |
| 3 | Task 4–5 | Integrasi runner + dokumentasi kontrak | `sonnet` | medium |
| 4 | Eksekusi backfill produksi | Manual, butuh kredensial | — (user/Codex) | — |

Reviewer per task: `sonnet`. Review whole-branch terakhir: `opus`, effort high.

---

### Task 1: Helper piutang bersih + jalur tulis approve

**Files:**
- Create: `apps/bul-accounting/src/utils/invoiceAmounts.js`
- Create: `apps/bul-accounting/src/utils/__tests__/invoiceAmounts.test.js`
- Create: `apps/bul-accounting/src/utils/__tests__/integrationInvoiceNet.test.js`
- Modify: `apps/bul-accounting/src/utils/integrationUtils.js:108-125`

**Interfaces:**
- Consumes: `saveInvoice(invoiceData)` dari `../accounting` — sudah ada, menerima objek bebas dan mengembalikan `DocumentReference`.
- Produces:
  - `resolvePiutangNet(item) => number` — dipakai Task 3.
  - `describeInvoiceGross(invoice) => { gross: number, uj: number } | null` — dipakai Task 2.

- [ ] **Step 1: Tulis test yang gagal untuk helper**

Buat `apps/bul-accounting/src/utils/__tests__/invoiceAmounts.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { resolvePiutangNet, describeInvoiceGross } from '../invoiceAmounts'

describe('resolvePiutangNet', () => {
  it('memakai piutangNet bila tersedia', () => {
    expect(resolvePiutangNet({ piutangNet: 7844060, totalNilai: 12324060, totalUJ: 4480000 }))
      .toBe(7844060)
  })

  it('jatuh ke totalNilai dikurangi totalUJ bila piutangNet tidak ada', () => {
    expect(resolvePiutangNet({ totalNilai: 12324060, totalUJ: 4480000 })).toBe(7844060)
  })

  it('jatuh ke totalNilai bila totalUJ juga tidak ada', () => {
    expect(resolvePiutangNet({ totalNilai: 12324060 })).toBe(12324060)
  })

  it('mengabaikan piutangNet yang bukan angka berhingga', () => {
    expect(resolvePiutangNet({ piutangNet: null, totalNilai: 1000, totalUJ: 400 })).toBe(600)
    expect(resolvePiutangNet({ piutangNet: NaN, totalNilai: 1000, totalUJ: 400 })).toBe(600)
  })

  it('mengembalikan nilai negatif apa adanya ketika uang jalan melebihi nilai invoice', () => {
    expect(resolvePiutangNet({ totalNilai: 1000, totalUJ: 1500 })).toBe(-500)
  })

  it('mengembalikan 0 untuk item kosong', () => {
    expect(resolvePiutangNet(undefined)).toBe(0)
    expect(resolvePiutangNet({})).toBe(0)
  })
})

describe('describeInvoiceGross', () => {
  it('mengembalikan rincian ketika invoice punya potongan uang jalan', () => {
    expect(describeInvoiceGross({ amount: 7844060, amountGross: 12324060, totalUJ: 4480000 }))
      .toEqual({ gross: 12324060, uj: 4480000 })
  })

  it('mengembalikan null untuk invoice manual tanpa uang jalan', () => {
    expect(describeInvoiceGross({ amount: 500000 })).toBeNull()
    expect(describeInvoiceGross({ amount: 500000, totalUJ: 0 })).toBeNull()
  })

  it('mengembalikan null ketika amountGross belum di-backfill', () => {
    expect(describeInvoiceGross({ amount: 12324060, totalUJ: 4480000 })).toBeNull()
  })

  it('mengembalikan null untuk input kosong', () => {
    expect(describeInvoiceGross(undefined)).toBeNull()
  })
})
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run: `cd apps/bul-accounting && npx vitest run src/utils/__tests__/invoiceAmounts.test.js`
Expected: FAIL — `Failed to resolve import "../invoiceAmounts"`

- [ ] **Step 3: Tulis implementasi minimal**

Buat `apps/bul-accounting/src/utils/invoiceAmounts.js`:

```js
/**
 * invoiceAmounts.js
 * Sumber tunggal aturan bruto → bersih untuk invoice yang berasal dari bul-monitor.
 *
 * Uang jalan adalah uang muka pelanggan: jurnal bridge mengakui pendapatan bruto
 * (Cr 4100) tetapi piutang bersih (Dr 1121 = totalNilai − totalUJ). Subledger
 * `invoices` harus memakai angka bersih yang sama agar cocok dengan buku besar.
 *
 * Modul ini murni — tanpa I/O dan tanpa import firebase — supaya bisa dipakai
 * ulang oleh runner backfill di luar aplikasi.
 */

/**
 * Piutang bersih untuk satu item antrian invoice.
 *
 * Dokumen antrian lama (dikirim sebelum bridge menyertakan piutangNet) jatuh ke
 * selisih manual, lalu ke nilai bruto bila totalUJ pun tidak tersedia.
 *
 * @param   {Object} item - Dokumen integration_queue bertipe 'invoice'
 * @returns {number}      - Piutang bersih; boleh negatif bila UJ melebihi nilai invoice
 */
export function resolvePiutangNet(item) {
  const net = Number(item?.piutangNet)
  if (Number.isFinite(net)) return net

  const gross = Number(item?.totalNilai) || 0
  const uj = Number(item?.totalUJ) || 0
  return gross - uj
}

/**
 * Rincian bruto/uang jalan untuk ditampilkan di samping nilai bersih.
 *
 * Mengembalikan null untuk invoice manual (tanpa uang jalan) dan untuk invoice
 * bridge yang belum di-backfill (amountGross belum ada) — dalam dua kasus itu
 * tidak ada rincian yang benar untuk ditampilkan.
 *
 * @param   {Object} invoice - Dokumen invoices
 * @returns {{ gross: number, uj: number } | null}
 */
export function describeInvoiceGross(invoice) {
  const uj = Number(invoice?.totalUJ) || 0
  if (uj <= 0) return null

  const gross = Number(invoice?.amountGross)
  if (!Number.isFinite(gross)) return null

  return { gross, uj }
}
```

- [ ] **Step 4: Jalankan test untuk memastikan lulus**

Run: `cd apps/bul-accounting && npx vitest run src/utils/__tests__/invoiceAmounts.test.js`
Expected: PASS — 10 test lulus

- [ ] **Step 5: Tulis test yang gagal untuk jalur approve**

Buat `apps/bul-accounting/src/utils/__tests__/integrationInvoiceNet.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Regresi: approveIntegrationItem menyimpan nilai BRUTO ke invoices.amount,
// sementara jurnalnya mendebit 1121 dengan nilai BERSIH. Subledger AR dan buku
// besar jadi berselisih sebesar total uang jalan.

vi.mock('../../firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(), doc: vi.fn(), onSnapshot: vi.fn(),
  query: vi.fn(), where: vi.fn(),
  updateDoc: vi.fn(async () => {}),
  getDocs: vi.fn(async () => ({ docs: [] })),
}))

const saveInvoice = vi.fn(async () => ({ id: 'INV-DOC-1' }))
vi.mock('../accounting', () => ({
  saveJournal: vi.fn(async () => 'JRN-1'),
  deleteJournal: vi.fn(async () => {}),
  saveInvoice: (...args) => saveInvoice(...args),
  updateInvoice: vi.fn(async () => {}),
  saveCustomer: vi.fn(async () => ({ id: 'CUST-1' })),
  getNextCustomerNo: vi.fn(async () => 'C-001'),
}))

import { approveIntegrationItem } from '../integrationUtils'

// Angka nyata dari invoice SJT/001/01/2026
const queueItem = {
  id: 'IQ-INV-abc',
  type: 'invoice',
  tanggal: '2026-01-25',
  noInvoice: 'SJT/001/01/2026',
  pt: 'PT. Tunas Maju',
  totalNilai: 12324060,
  totalUJ: 4480000,
  piutangNet: 7844060,
  sourceInvoiceId: 'INV-SRC-1',
}

const journalLines = [
  { accountCode: '1121', debit: 7844060, credit: 0, keterangan: 'Piutang' },
  { accountCode: '4100', debit: 0, credit: 7844060, keterangan: 'Pendapatan' },
]

describe('approveIntegrationItem — invoice', () => {
  beforeEach(() => { saveInvoice.mockClear() })

  it('menyimpan piutang bersih ke amount, bukan nilai bruto', async () => {
    await approveIntegrationItem(queueItem, journalLines, '2026-01-25', 'Invoice', 'uid1')

    expect(saveInvoice).toHaveBeenCalledTimes(1)
    expect(saveInvoice.mock.calls[0][0]).toMatchObject({
      amount: 7844060,
      amountGross: 12324060,
      totalUJ: 4480000,
    })
  })

  it('jatuh ke selisih manual ketika piutangNet tidak dikirim', async () => {
    const { piutangNet, ...tanpaNet } = queueItem
    await approveIntegrationItem(tanpaNet, journalLines, '2026-01-25', 'Invoice', 'uid1')

    expect(saveInvoice.mock.calls[0][0]).toMatchObject({
      amount: 7844060,
      amountGross: 12324060,
      totalUJ: 4480000,
    })
  })

  it('menyimpan totalUJ 0 untuk invoice tanpa uang jalan', async () => {
    await approveIntegrationItem(
      { ...queueItem, totalUJ: 0, piutangNet: 12324060 },
      journalLines, '2026-01-25', 'Invoice', 'uid1',
    )

    expect(saveInvoice.mock.calls[0][0]).toMatchObject({
      amount: 12324060,
      amountGross: 12324060,
      totalUJ: 0,
    })
  })
})
```

- [ ] **Step 6: Jalankan test untuk memastikan gagal**

Run: `cd apps/bul-accounting && npx vitest run src/utils/__tests__/integrationInvoiceNet.test.js`
Expected: FAIL pada test pertama — `amount` bernilai `12324060`, bukan `7844060`

- [ ] **Step 7: Ubah jalur tulis approve**

Di `apps/bul-accounting/src/utils/integrationUtils.js`, tambahkan import tepat di bawah import `./accounting` yang sudah ada:

```js
import { resolvePiutangNet } from './invoiceAmounts';
```

Lalu ganti blok invoice (baris 108-125) menjadi:

```js
  // 2. Jika tipe invoice → auto-sync pelanggan + buat invoice di Penjualan
  //    amount memakai piutang BERSIH agar cocok dengan Dr 1121 di jurnal.
  //    Nilai bruto disimpan terpisah untuk ditampilkan sebagai rincian.
  let accountingInvoiceId = null;
  if (item.type === 'invoice') {
    const customer = await findOrCreateCustomer(item.pelangganData, item.pt, createdBy);
    const invRef = await saveInvoice({
      date: item.tanggal || date,
      invoiceNo: item.noInvoice || '',
      customerId: customer?.id || null,
      customerName: customer?.name || item.pt || '',
      amount: resolvePiutangNet(item),
      amountGross: Number(item.totalNilai) || 0,
      totalUJ: Number(item.totalUJ) || 0,
      description: `Invoice ${item.noInvoice} - ${item.pt} (dari BUL-Monitor)`,
      status: 'unpaid',
      sourceIntegration: item.id,
      sourceInvoiceId: item.sourceInvoiceId || null,
      createdBy,
    });
    accountingInvoiceId = invRef.id;
  }
```

- [ ] **Step 8: Jalankan test untuk memastikan lulus**

Run: `cd apps/bul-accounting && npx vitest run src/utils/__tests__/`
Expected: PASS — seluruh test di folder lulus, termasuk 3 test baru dan test lama yang sudah ada

- [ ] **Step 9: Jalankan build**

Run: `cd apps/bul-accounting && npm run build`
Expected: build sukses tanpa error

- [ ] **Step 10: Commit**

```bash
git add apps/bul-accounting/src/utils/invoiceAmounts.js apps/bul-accounting/src/utils/integrationUtils.js apps/bul-accounting/src/utils/__tests__/invoiceAmounts.test.js apps/bul-accounting/src/utils/__tests__/integrationInvoiceNet.test.js
git commit -m "fix(bul-accounting): record net receivable after uang jalan on bridge invoices"
```

---

### Task 2: Tampilkan rincian bruto dan uang jalan di halaman Penjualan

**Files:**
- Modify: `apps/bul-accounting/src/pages/PenjualanPage.jsx` — blok import di bagian atas, modal pembayaran (sekitar baris 216-220), kartu invoice (sekitar baris 434-440)

**Interfaces:**
- Consumes: `describeInvoiceGross(invoice) => { gross: number, uj: number } | null` dari `../utils/invoiceAmounts` (Task 1).
- Produces: tidak ada — task ini murni presentasi.

- [ ] **Step 1: Tambahkan import**

Di `apps/bul-accounting/src/pages/PenjualanPage.jsx`, tambahkan tepat setelah blok import dari `../utils/accounting` yang sudah ada:

```js
import { describeInvoiceGross } from '../utils/invoiceAmounts'
```

- [ ] **Step 2: Tambahkan rincian di modal pembayaran**

Cari blok ini (sekitar baris 216-220):

```jsx
            <div className="flex justify-between text-brand-600">
              <span>Total tagihan</span><span>{formatCurrency(invoice.amount)}</span>
            </div>
```

Ganti menjadi:

```jsx
            <div className="flex justify-between text-brand-600">
              <span>Total tagihan</span><span>{formatCurrency(invoice.amount)}</span>
            </div>
            {describeInvoiceGross(invoice) && (
              <div className="flex justify-between text-xs text-brand-500">
                <span>Bruto {formatCurrency(describeInvoiceGross(invoice).gross)} − uang jalan</span>
                <span>({formatCurrency(describeInvoiceGross(invoice).uj)})</span>
              </div>
            )}
```

- [ ] **Step 3: Tambahkan rincian di kartu invoice**

Cari blok ini (sekitar baris 434-440):

```jsx
                      <span className="text-lg font-bold text-brand-700">{formatCurrency(inv.amount)}</span>
                      {inv.status === 'partial' && (
```

Sisipkan rincian di antaranya sehingga menjadi:

```jsx
                      <span className="text-lg font-bold text-brand-700">{formatCurrency(inv.amount)}</span>
                      {describeInvoiceGross(inv) && (
                        <span className="text-xs text-gray-500">
                          Bruto {formatCurrency(describeInvoiceGross(inv).gross)} − UJ {formatCurrency(describeInvoiceGross(inv).uj)}
                        </span>
                      )}
                      {inv.status === 'partial' && (
```

- [ ] **Step 4: Jalankan test**

Run: `cd apps/bul-accounting && npm test`
Expected: PASS — seluruh suite lulus, tidak ada regresi

- [ ] **Step 5: Jalankan build**

Run: `cd apps/bul-accounting && npm run build`
Expected: build sukses tanpa error

- [ ] **Step 6: Commit**

```bash
git add apps/bul-accounting/src/pages/PenjualanPage.jsx
git commit -m "feat(bul-accounting): show gross and uang jalan breakdown on sales invoices"
```

---

### Task 3: Perencana backfill murni

**Files:**
- Create: `apps/bul-accounting/src/utils/invoiceAmountBackfill.js`
- Create: `apps/bul-accounting/src/utils/__tests__/invoiceAmountBackfill.test.js`

**Interfaces:**
- Consumes: `resolvePiutangNet(item) => number` dari `./invoiceAmounts` (Task 1).
- Produces:
  - `SKIP_REASONS` — objek konstanta alasan lewat.
  - `planInvoiceAmountFix(queueItems, invoices) => { updates, skipped, totals }` di mana
    `updates: Array<{ invoiceId, invoiceNo, amountBefore, amountAfter, amountGross, totalUJ }>`,
    `skipped: Array<{ invoiceId, invoiceNo, reason }>`,
    `totals: { updateCount, skipCount, totalUJ, amountDelta }`.
  - Dipakai runner di Task 4.

- [ ] **Step 1: Tulis test yang gagal**

Buat `apps/bul-accounting/src/utils/__tests__/invoiceAmountBackfill.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { planInvoiceAmountFix, SKIP_REASONS } from '../invoiceAmountBackfill'

const queueItem = (over = {}) => ({
  id: 'IQ-INV-1',
  type: 'invoice',
  status: 'approved',
  accountingInvoiceId: 'INV-1',
  noInvoice: 'SJT/001/01/2026',
  totalNilai: 12324060,
  totalUJ: 4480000,
  piutangNet: 7844060,
  ...over,
})

const invoice = (over = {}) => ({
  id: 'INV-1',
  invoiceNo: 'SJT/001/01/2026',
  amount: 12324060,
  status: 'unpaid',
  ...over,
})

describe('planInvoiceAmountFix', () => {
  it('merencanakan koreksi amount bruto menjadi bersih', () => {
    const plan = planInvoiceAmountFix([queueItem()], [invoice()])

    expect(plan.updates).toEqual([{
      invoiceId: 'INV-1',
      invoiceNo: 'SJT/001/01/2026',
      amountBefore: 12324060,
      amountAfter: 7844060,
      amountGross: 12324060,
      totalUJ: 4480000,
    }])
    expect(plan.skipped).toEqual([])
  })

  it('menjumlahkan dampak koreksi', () => {
    const plan = planInvoiceAmountFix([queueItem()], [invoice()])

    expect(plan.totals).toEqual({
      updateCount: 1,
      skipCount: 0,
      totalUJ: 4480000,
      amountDelta: -4480000,
    })
  })

  it('idempoten: melewati invoice yang amountGross-nya sudah terisi', () => {
    const plan = planInvoiceAmountFix(
      [queueItem()],
      [invoice({ amount: 7844060, amountGross: 12324060, totalUJ: 4480000 })],
    )

    expect(plan.updates).toEqual([])
    expect(plan.skipped).toEqual([
      { invoiceId: 'INV-1', invoiceNo: 'SJT/001/01/2026', reason: SKIP_REASONS.ALREADY_BACKFILLED },
    ])
  })

  it('melewati invoice yang sudah punya pembayaran', () => {
    const plan = planInvoiceAmountFix([queueItem()], [invoice({ totalPaid: 1000000 })])

    expect(plan.updates).toEqual([])
    expect(plan.skipped[0].reason).toBe(SKIP_REASONS.HAS_PAYMENT)
  })

  it('melewati invoice yang punya array payments tidak kosong', () => {
    const plan = planInvoiceAmountFix(
      [queueItem()],
      [invoice({ payments: [{ jumlahBayar: 500 }] })],
    )

    expect(plan.skipped[0].reason).toBe(SKIP_REASONS.HAS_PAYMENT)
  })

  it('melewati invoice yang sudah dibatalkan', () => {
    const plan = planInvoiceAmountFix([queueItem()], [invoice({ status: 'cancelled' })])

    expect(plan.skipped[0].reason).toBe(SKIP_REASONS.CANCELLED)
  })

  it('melewati item antrian yang belum approved', () => {
    const plan = planInvoiceAmountFix([queueItem({ status: 'pending' })], [invoice()])

    expect(plan.skipped[0].reason).toBe(SKIP_REASONS.QUEUE_NOT_APPROVED)
  })

  it('melewati item antrian yang dokumen invoice-nya tidak ada', () => {
    const plan = planInvoiceAmountFix([queueItem()], [])

    expect(plan.skipped).toEqual([
      { invoiceId: 'INV-1', invoiceNo: 'SJT/001/01/2026', reason: SKIP_REASONS.INVOICE_MISSING },
    ])
  })

  it('melewati invoice tanpa uang jalan', () => {
    const plan = planInvoiceAmountFix(
      [queueItem({ totalUJ: 0, piutangNet: 12324060 })],
      [invoice()],
    )

    expect(plan.skipped[0].reason).toBe(SKIP_REASONS.NO_UANG_JALAN)
  })

  it('mengabaikan item antrian yang bukan tipe invoice', () => {
    const plan = planInvoiceAmountFix(
      [queueItem({ type: 'uang_jalan' }), queueItem({ type: 'transaksi_kas' })],
      [invoice()],
    )

    expect(plan.updates).toEqual([])
    expect(plan.skipped).toEqual([])
  })

  it('mengabaikan item antrian tanpa accountingInvoiceId', () => {
    const plan = planInvoiceAmountFix([queueItem({ accountingInvoiceId: null })], [invoice()])

    expect(plan.updates).toEqual([])
    expect(plan.skipped).toEqual([])
  })

  it('menangani banyak item sekaligus', () => {
    const plan = planInvoiceAmountFix(
      [
        queueItem(),
        queueItem({ id: 'IQ-INV-2', accountingInvoiceId: 'INV-2', noInvoice: 'SJP/002/02/2026', totalNilai: 8348080, totalUJ: 2000000, piutangNet: 6348080 }),
        queueItem({ id: 'IQ-INV-3', accountingInvoiceId: 'INV-3', noInvoice: 'SJP/003/02/2026', totalNilai: 5000000, totalUJ: 1000000, piutangNet: 4000000 }),
      ],
      [
        invoice(),
        invoice({ id: 'INV-2', invoiceNo: 'SJP/002/02/2026', amount: 8348080 }),
        invoice({ id: 'INV-3', invoiceNo: 'SJP/003/02/2026', amount: 5000000, totalPaid: 100 }),
      ],
    )

    expect(plan.totals).toEqual({
      updateCount: 2,
      skipCount: 1,
      totalUJ: 6480000,
      amountDelta: -6480000,
    })
  })

  it('mengembalikan rencana kosong untuk input kosong', () => {
    expect(planInvoiceAmountFix([], [])).toEqual({
      updates: [],
      skipped: [],
      totals: { updateCount: 0, skipCount: 0, totalUJ: 0, amountDelta: 0 },
    })
  })
})
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run: `cd apps/bul-accounting && npx vitest run src/utils/__tests__/invoiceAmountBackfill.test.js`
Expected: FAIL — `Failed to resolve import "../invoiceAmountBackfill"`

- [ ] **Step 3: Tulis implementasi**

Buat `apps/bul-accounting/src/utils/invoiceAmountBackfill.js`:

```js
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
```

- [ ] **Step 4: Jalankan test untuk memastikan lulus**

Run: `cd apps/bul-accounting && npx vitest run src/utils/__tests__/invoiceAmountBackfill.test.js`
Expected: PASS — 13 test lulus

- [ ] **Step 5: Jalankan seluruh suite**

Run: `cd apps/bul-accounting && npm test`
Expected: PASS — tidak ada regresi

- [ ] **Step 6: Commit**

```bash
git add apps/bul-accounting/src/utils/invoiceAmountBackfill.js apps/bul-accounting/src/utils/__tests__/invoiceAmountBackfill.test.js
git commit -m "feat(bul-accounting): add pure planner for invoice amount backfill"
```

---

### Task 4: Runner backfill Firestore

**Files:**
- Create: `scripts/bul-accounting-backfill/package.json`
- Create: `scripts/bul-accounting-backfill/index.js`
- Create: `scripts/bul-accounting-backfill/README.md`

**Interfaces:**
- Consumes: `planInvoiceAmountFix(queueItems, invoices)` dari
  `../../apps/bul-accounting/src/utils/invoiceAmountBackfill.js` (Task 3). Modul itu murni,
  jadi Node bisa meng-import-nya langsung tanpa bundler.
- Produces: tidak ada — ini titik akhir, dijalankan manual.

**Catatan penting untuk implementer:** jangan menjalankan runner ini. Ia menyentuh Firestore
produksi dan kredensialnya tidak tersedia. Validasi task ini terbatas pada `node --check`
dan test unit modul murni yang sudah ada dari Task 3.

- [ ] **Step 1: Buat package.json**

Buat `scripts/bul-accounting-backfill/package.json`:

```json
{
  "name": "bul-accounting-backfill",
  "version": "1.0.0",
  "description": "Koreksi invoices.amount bruto menjadi piutang bersih setelah potongan uang jalan",
  "type": "module",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "check": "node --check index.js"
  },
  "dependencies": {
    "@google-cloud/firestore": "^7.10.0"
  },
  "engines": {
    "node": ">=20"
  }
}
```

- [ ] **Step 2: Buat runner**

Buat `scripts/bul-accounting-backfill/index.js`:

```js
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
```

- [ ] **Step 3: Verifikasi sintaks**

Run: `node --check scripts/bul-accounting-backfill/index.js`
Expected: tidak ada output (sintaks valid)

- [ ] **Step 4: Buat README**

Buat `scripts/bul-accounting-backfill/README.md`:

````markdown
# Backfill Piutang Bersih Invoice Bridge

Mengoreksi `invoices.amount` dari nilai bruto menjadi piutang bersih setelah
potongan uang jalan, lalu menyimpan nilai bruto ke `amountGross` dan potongannya
ke `totalUJ`.

Seluruh aturan hidup di `apps/bul-accounting/src/utils/invoiceAmountBackfill.js`
dan diuji dengan `npm test` di `apps/bul-accounting`. Script ini hanya lapisan I/O.

## Prasyarat

- Node >= 20
- Application Default Credentials dengan akses tulis ke Firestore project `bul-accounting`
- Tujuh dokumen prasyarat (5 uji coba + 2 duplikat) sudah dibereskan lebih dulu —
  lihat `docs/superpowers/specs/2026-08-24-bul-accounting-ar-net-uang-jalan-design.md` bagian 4

## Dry run (default)

```bash
npm install
FIREBASE_PROJECT_ID=bul-accounting node index.js
```

Menghasilkan dua CSV: daftar invoice yang akan dikoreksi, dan daftar yang dilewati
beserta alasannya. Tidak ada tulisan ke Firestore.

## Eksekusi sungguhan

```bash
FIREBASE_PROJECT_ID=bul-accounting DRY_RUN=false node index.js
```

## Sifat

- **Idempoten** — invoice yang `amountGross`-nya sudah terisi akan dilewati.
- **Aman terhadap pembayaran** — invoice yang sudah punya `totalPaid > 0` atau
  `payments` tidak kosong akan dilewati dan harus diputuskan akuntan secara manual.
- **Tidak menyentuh jurnal** — hanya collection `invoices`.
````

- [ ] **Step 5: Commit**

```bash
git add scripts/bul-accounting-backfill/
git commit -m "feat(scripts): add dry-run-first backfill runner for net receivable"
```

---

### Task 5: Dokumentasikan kontrak bridge

**Files:**
- Modify: `shared/bul-bridge/README.md`

**Interfaces:**
- Consumes: tidak ada.
- Produces: tidak ada — dokumentasi.

Alasan task ini ada: sampai sekarang satu-satunya tempat aturan debit/kredit uang jalan
tertulis adalah komentar di `apps/bul-monitor/src/integrationService.js:317-325`. Bug bruto
vs net bertahan berbulan-bulan sebagian karena kontraknya tidak pernah ditulis.

- [ ] **Step 1: Tambahkan bagian kontrak**

Di `shared/bul-bridge/README.md`, sisipkan tepat sebelum bagian `## Catatan Implementasi` yang sudah ada:

````markdown
## Collection `integration_queue`

bul-monitor menulis ke collection `integration_queue` di Firestore bul-accounting.
Tiga tipe: `uang_jalan`, `invoice`, `transaksi_kas`. ID deterministik supaya idempoten:
`IQ-UJ-{sjId}`, `IQ-INV-{invoiceId}`.

### Mapping akun

| Akun | Nama | Dipakai untuk |
|---|---|---|
| 1121 | Piutang Pelanggan – Proyek | piutang **bersih** setelah potongan uang jalan |
| 1151 | Uang Muka Sopir/Uang Jalan | WIP uang jalan dan biaya non-upah |
| 2122 | Hutang Uang Jalan Sopir | kewajiban biaya tambahan ke sopir |
| 2141 | Uang Muka Pelanggan | uang jalan sebagai uang muka dari pelanggan |
| 4100 | Pendapatan Usaha | pendapatan **bruto** |
| 5130 | Upah Sopir | upah/gaji/honor, diakui langsung saat SJ selesai |
| 5150 | Uang Jalan, Makan & Penginapan Sopir | HPP saat invoice diakui |

### Jurnal saat Surat Jalan dikirim

```
Dr 1151 Uang Muka Sopir/Uang Jalan     uangJalan
   Cr 2141 Uang Muka Pelanggan            uangJalan
Biaya tambahan upah     → Dr 5130 / Cr 2122
Biaya tambahan non-upah → Dr 1151 (WIP) / Cr 2122
```

### Jurnal saat Invoice dikirim

```
Dr 1121 Piutang            totalNilai − totalUJ    ← BERSIH
Dr 2141 Uang Muka Plgn     totalUJ                 ← clearing
   Cr 4100 Pendapatan         totalNilai           ← BRUTO
Dr 5150 HPP / Cr 1151 WIP  totalUJ + biaya non-upah
```

### Aturan bruto vs bersih

Uang jalan adalah uang muka yang sudah diterima dari pelanggan. Karena itu:

- **Pendapatan diakui bruto** — nilai penuh invoice.
- **Piutang diakui bersih** — nilai invoice dikurangi uang jalan.
- **Subledger `invoices` wajib mengikuti angka bersih.** Field `amount` menyimpan
  piutang bersih, `amountGross` menyimpan nilai bruto, `totalUJ` menyimpan potongannya.
  Bila `amount` menyimpan bruto, subledger AR akan berselisih dari saldo GL 1121 tepat
  sebesar total uang jalan.

### Field yang dikirim untuk tipe `invoice`

| Field | Tipe | Catatan |
|---|---|---|
| `totalNilai` | number | nilai invoice bruto |
| `totalUJ` | number | total uang jalan seluruh SJ dalam invoice |
| `piutangNet` | number | `totalNilai − totalUJ`; konsumen wajib menyediakan fallback untuk dokumen lama |
| `totalBiayaLain` | number | biaya non-upah yang perlu di-clear dari WIP |
| `suratJalanList` | object[] | rincian per SJ termasuk `uangJalan` |
| `suggestedJournal` | object | usulan baris jurnal; akuntan boleh mengedit sebelum approve |
````

- [ ] **Step 2: Commit**

```bash
git add shared/bul-bridge/README.md
git commit -m "docs(bul-bridge): document the actual journal contract and gross-vs-net rule"
```

---

## Fase 4 — Eksekusi produksi (di luar jangkauan agen)

Bukan task agen. Butuh kredensial Firestore yang tidak tersedia bagi Claude, dan seluruh
CLI Firebase diblokir profil permission.

- [ ] Fase 0 (cleanup 7 dokumen) sudah selesai
- [ ] `npm install` di `scripts/bul-accounting-backfill`
- [ ] Dry run; periksa kedua CSV
- [ ] **Gerbang go/no-go (utama):** Σ `totalUJ` pada `backfill-updates-*.csv` harus sama dengan Rp 507.025.000 (akumulasi debit 2141 Rp 511.505.000 per data 2026-08-23, dikurangi Rp 4.480.000 dari duplikat `SJT/001/01/2026` yang dibereskan di Fase 0). Bila tidak cocok, **jangan lanjut ke `DRY_RUN=false`** — telusuri selisihnya dulu.
- [ ] Verifikasi sekunder: jumlah baris di `updates` sekitar 34 (40 invoice dikurangi 5 dokumen uji coba dan 1 duplikat `SJT/001` yang dibereskan di Fase 0). Boleh sedikit berbeda bila ada invoice dengan `totalUJ = 0` yang di-skip via `NO_UANG_JALAN` — itu normal, bukan tanda kesalahan. Jumlah ini bukan gerbang keputusan; hanya sanity check kasar.
- [ ] Bandingkan `amountBefore` dengan `amountGross` di setiap baris `backfill-updates-*.csv`: bila berbeda, invoice itu pernah diedit manual setelah masuk sistem dan backfill akan menimpa nilai manual itu. Putuskan per kasus sebelum lanjut — planner tidak punya guard otomatis untuk situasi ini.
- [ ] Jalankan `DRY_RUN=false`
- [ ] Tunggu sync GL harian berikutnya, lalu verifikasi tiga kesetaraan di spec bagian 5
