# Multi-Invoice Payment (AR) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. One fresh subagent per task, two-stage review between tasks. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Memungkinkan satu penerimaan pembayaran dari pelanggan melunasi beberapa invoice sekaligus dalam satu jurnal dan satu transaksi atomik.

**Architecture:** Logika alokasi murni diisolasi di `src/utils/payments.js` (tanpa Firestore, tanpa React) sehingga bisa diuji penuh; `src/utils/accounting.js` menyediakan satu fungsi `runTransaction` yang menulis jurnal gabungan dan memperbarui N invoice secara atomik; `src/components/MultiPaymentModal.jsx` murni UI. Perubahan pada model data bersifat aditif — tidak ada field lama yang dihapus atau diubah artinya.

**Tech Stack:** React 18 + Vite 5, Firebase JS SDK v10 (Firestore), Vitest 4 (`jsdom`, `globals: true`), Tailwind 3.

**Spec:** [docs/superpowers/specs/2026-08-20-multi-invoice-payment-ar-design.md](../specs/2026-08-20-multi-invoice-payment-ar-design.md)

## Global Constraints

- Root aplikasi untuk semua perintah: `apps/bul-accounting`. Semua path file dalam plan ini relatif terhadap root repo.
- Bahasa diskusi/penjelasan/handoff: **Bahasa Indonesia**. Pesan commit: **English conventional commit** (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
- Setiap jurnal wajib balance: `totalDebit === totalCredit` (toleransi 0,5).
- Angka rupiah disimpan sebagai `number`, hanya diformat saat render.
- Tanggal disimpan sebagai string ISO `YYYY-MM-DD`.
- Nama domain Indonesia dipertahankan: `jumlahBayar`, `pph`, `netDiterima`, `keterangan`, `sisaTagihan`, `truckId`.
- **Soft delete saja.** Tidak ada hard delete data bisnis.
- **Production deployment DILARANG.** Profil permission Claude memblokir seluruh CLI Firebase/Vercel/Supabase. Perintah deploy diserahkan ke user, tidak dijalankan agen.
- Fitur ini **superadmin-only**, mengikuti `firestore.rules` yang ada. **Jangan mengubah `firestore.rules`.**
- Perubahan di luar scope spec dilarang. Khususnya: **jangan menyentuh sisi AP/`purchase_invoices`/`BiayaPage` selain penggantian daftar akun kas di Task 1**, dan **jangan me-refactor `getInvoices()`**.
- Validasi wajib sebelum commit terakhir tiap task: `npm test` dan `npm run build` dari `apps/bul-accounting`.
- Branch kerja: `claude/multi-payment-invoices-3fbac3` (worktree `erpnext-v16-upgrade-analysis-be2cd3`). Satu implementer, satu branch.

## Struktur File

| File | Tanggung jawab | Fase |
|---|---|---|
| `apps/bul-accounting/src/data/kasAccounts.js` | **Baru.** Sumber tunggal daftar akun kas/bank + pemetaan tipe jurnal. | 1 |
| `apps/bul-accounting/src/utils/payments.js` | **Baru.** Seluruh perhitungan alokasi. Fungsi murni. | 1 |
| `apps/bul-accounting/src/utils/__tests__/payments.test.js` | **Baru.** Unit test `payments.js`. Tanpa mock Firebase. | 1 |
| `apps/bul-accounting/src/utils/accounting.js` | Tambah `getOpenInvoicesByCustomer()` + `recordMultiInvoicePayment()`; alihkan status ke `computeInvoiceStatus()`. | 1, 2 |
| `apps/bul-accounting/firestore.indexes.json` | Tambah satu composite index. | 2 |
| `apps/bul-accounting/src/components/MultiPaymentModal.jsx` | **Baru.** UI saja, tanpa aturan akuntansi. | 3 |
| `apps/bul-accounting/src/pages/PenjualanPage.jsx` | Rewire akun kas; tambah tombol + state modal. | 1, 3 |
| `apps/bul-accounting/src/pages/BiayaPage.jsx` | Rewire akun kas saja. Tidak ada perubahan perilaku. | 1 |
| `apps/bul-accounting/src/pages/JurnalPage.jsx` | Pembalikan jurnal multi-invoice. | 4 |
| `apps/bul-accounting/src/firebase.js` | Ekspos `db` ke `globalThis` khusus mode dev, untuk audit data manual. Dihapus Vite dari build produksi. | 0 |

## Pembagian Fase

Fase dikelompokkan menurut **model dan effort** yang dibutuhkan. Alasannya: fase logika murni dan fase UI punya spesifikasi lengkap dan permukaan kesalahan sempit, sedangkan fase yang menyentuh transaksi Firestore dan pembalikan jurnal menyentuh area finansial terproteksi dan menuntut penalaran lebih dalam.

| Fase | Isi | Task | Model | Effort | Alasan |
|---|---|---|---|---|---|
| **0** | Pengecekan data pra-implementasi | — | — (aksi user) | — | Memerlukan kredensial produksi; CLI Firebase diblokir untuk agen. |
| **1** | Fondasi murni: konstanta + logika alokasi + test | 1–4 | `sonnet` | `medium` | Fungsi murni, spesifikasi lengkap, TDD ketat, nol ambiguitas. |
| **2** | Lapisan Firestore: query + transaksi atomik | 5–6 | `opus` | `high` | Semantik `runTransaction`, urutan read-before-write, korektness finansial. Area terproteksi. |
| **3** | UI: modal + integrasi halaman | 7–8 | `sonnet` | `medium` | Komponen React mengikuti pola yang sudah ada; tidak memuat aturan akuntansi. |
| **4** | Pembalikan jurnal + validasi akhir | 9–10 | `opus` | `high` | Mengubah perilaku hapus jurnal yang sudah berjalan di produksi. Area terproteksi. |

### Aturan wajib akhir fase

**Setiap fase berakhir dengan gerbang berhenti.** Agen yang mengeksekusi sebuah fase WAJIB:

1. Berhenti total setelah task terakhir fase itu selesai dan tervalidasi. **Jangan melanjutkan ke fase berikutnya.**
2. Melaporkan bukti konkret: file yang berubah, perintah validasi yang dijalankan, hasilnya, dan hash commit.
3. Mengeluarkan **prompt lengkap siap-tempel untuk fase berikutnya**, dalam satu blok kode, yang memuat: nomor fase, daftar task, `model` dan `effort` yang harus dipakai, path plan ini, ringkasan keadaan hasil fase sebelumnya (nama fungsi + signature yang sudah ada), dan gerbang berhenti yang sama untuk fase itu.
4. Menyerahkan keputusan lanjut/tidak kepada user.

---

# FASE 0 — Pengecekan Data (aksi user)

**Model:** — · **Effort:** — · **Pelaksana:** user

Gerbang wajib dari spec bagian 9. Query pemilih invoice memakai `where('customerId', '==', ...)`, sehingga invoice open yang `customerId`-nya kosong **tidak akan pernah muncul** di modal. Jumlahnya harus diketahui sebelum Fase 2 dikerjakan.

Fase 0 **tidak memblokir Fase 1** (Fase 1 tidak menyentuh Firestore sama sekali). Fase 0 memblokir Fase 2.

Skrip Node berdiri sendiri **tidak bisa** dipakai di sini: `firestore.rules` mensyaratkan
`request.auth != null` untuk membaca `invoices`, sedangkan konfigurasi Firebase aplikasi
di-hardcode di `src/firebase.js` tanpa kredensial apa pun. Karena itu pengecekan dijalankan
dari sesi browser yang sudah login, lewat dev server lokal.

Agen tidak boleh menangani service account key. Seluruh langkah di bawah dijalankan user.

- [x] **Langkah 1: Ekspos `db` khusus mode dev**

Modify `apps/bul-accounting/src/firebase.js` — tambahkan di akhir file, sebelum
`export default app`:

```js
// Hanya aktif saat `npm run dev`. Vite menghapus blok ini dari build produksi
// karena import.meta.env.DEV bernilai false di sana.
if (import.meta.env.DEV) {
  globalThis.__db = db
}
```

- [x] **Langkah 2: Jalankan dev server dan login**

```bash
cd apps/bul-accounting && npm run dev
```

User membuka URL yang tertera, lalu login sebagai superadmin. Sesi ini memakai project
Firebase yang sama dengan produksi (`bul-accounting`), jadi datanya identik.

- [x] **Langkah 3: Jalankan pengecekan di DevTools Console**

```js
const { collection, getDocs } = await import('firebase/firestore')
const snap = await getDocs(collection(globalThis.__db, 'invoices'))
const open = snap.docs.map(d => ({ id: d.id, ...d.data() }))
  .filter(i => i.status === 'unpaid' || i.status === 'partial')
const missing = open.filter(i => !i.customerId)
console.log('Total invoice open (unpaid/partial):', open.length)
console.log('Tanpa customerId                   :', missing.length)
console.table(missing.map(i => ({
  id: i.id, date: i.date, invoiceNo: i.invoiceNo, customerName: i.customerName, amount: i.amount,
})))
```

Expected: dua baris hitungan, lalu tabel yang idealnya kosong.

- [x] **Langkah 4: Gerbang keputusan**

Jika `Tanpa customerId` bernilai **0** → Fase 2 boleh jalan apa adanya.

Jika **bukan 0** → **BERHENTI.** Laporkan angka dan tabelnya ke user, lalu minta keputusan
antara: (a) perbaiki `customerId` invoice tersebut lebih dulu, atau (b) tambahkan jalur
cadangan di modal untuk invoice tanpa `customerId`. Jangan memilih sendiri — ini menyentuh
data bisnis.

Penyebab yang paling mungkin: `approveIntegrationItem()` menulis
`customerId: customer?.id || null` (`integrationUtils.js:113`), sehingga invoice dari
bul-monitor bisa berakhir tanpa pelanggan bila `findOrCreateCustomer()` gagal.

- [x] **Langkah 5: Commit perubahan dev-only**

```bash
git add apps/bul-accounting/src/firebase.js
git commit -m "chore(bul-accounting): expose firestore db in dev builds for data audits"
```

---

# FASE 1 — Fondasi Murni

**Model:** `sonnet` · **Effort:** `medium` · **Task 1–4**

Seluruh fase ini tidak menyentuh Firestore dan tidak mengubah satu pun perilaku yang terlihat user. Akhir fase: `payments.js` lengkap dan teruji, akun kas punya satu sumber tunggal.

---

### Task 1: Sumber tunggal akun kas/bank

Menghapus duplikasi P1-6. **Perilaku tidak boleh berubah sama sekali** — ini murni pemindahan konstanta.

**Files:**
- Create: `apps/bul-accounting/src/data/kasAccounts.js`
- Modify: `apps/bul-accounting/src/pages/PenjualanPage.jsx` (baris 17, 155–159, 187, dan pemakaian `KAS_NAMES`)
- Modify: `apps/bul-accounting/src/pages/BiayaPage.jsx` (baris 143–147, 157)

**Interfaces:**
- Consumes: —
- Produces: `KAS_ACCOUNTS: Array<{code: string, name: string, type: 'kas'|'bank'}>`, `getKasAccountName(code: string) => string`, `getJournalType(code: string) => 'kas'|'bank'`

- [x] **Step 1: Buat file konstanta**

Create `apps/bul-accounting/src/data/kasAccounts.js`:

```js
// Sumber tunggal daftar akun kas/bank.
// Sebelumnya di-hardcode terpisah di PenjualanPage, BiayaPage, dan AsetPage.
// Isi disalin persis dari PenjualanPage.jsx:155 agar tidak ada perubahan perilaku.

export const KAS_ACCOUNTS = [
  { code: '1111', name: 'Kas Kecil',                type: 'kas'  },
  { code: '1112', name: 'Bank BCA Operasional',     type: 'bank' },
  { code: '1113', name: 'Bank Mandiri Operasional', type: 'bank' },
]

// Nama pendek untuk tampilan riwayat pembayaran.
// Disalin persis dari konstanta KAS_NAMES di PenjualanPage.jsx:17.
export const KAS_SHORT_NAMES = {
  '1111': 'Kas Kecil',
  '1112': 'Bank BCA',
  '1113': 'Bank Mandiri',
}

export const getKasAccountName = (code) => KAS_SHORT_NAMES[code] || code

// Menggantikan dua ekspresi lama yang hasilnya identik untuk ketiga kode di atas:
//   PenjualanPage.jsx:187  account.startsWith('1111') ? 'kas' : 'bank'
//   BiayaPage.jsx:157      account === '1111' ? 'kas' : 'bank'
// Kode tak dikenal jatuh ke 'bank', sama seperti kedua ekspresi lama.
export const getJournalType = (code) =>
  KAS_ACCOUNTS.find(a => a.code === code)?.type || 'bank'
```

- [x] **Step 2: Rewire PenjualanPage.jsx**

Hapus baris 17 seluruhnya:

```js
const KAS_NAMES = { '1111': 'Kas Kecil', '1112': 'Bank BCA', '1113': 'Bank Mandiri' }
```

Tambahkan import setelah blok import `lucide-react` yang ada:

```js
import { KAS_ACCOUNTS, getKasAccountName, getJournalType } from '../data/kasAccounts'
```

Ganti deklarasi `kasOptions` di dalam `PembayaranModal` (baris 155–159) — hapus seluruh blok:

```js
  const kasOptions = [
    { code: '1111', name: 'Kas Kecil' },
    { code: '1112', name: 'Bank BCA Operasional' },
    { code: '1113', name: 'Bank Mandiri Operasional' },
  ]
```

Lalu ganti pemakaiannya di JSX `<select>` dari `kasOptions.map(...)` menjadi:

```jsx
              {KAS_ACCOUNTS.map(o => <option key={o.code} value={o.code}>{o.code} - {o.name}</option>)}
```

Ganti baris 187:

```js
        type: account.startsWith('1111') ? 'kas' : 'bank',
```

menjadi:

```js
        type: getJournalType(account),
```

Ganti pemakaian `KAS_NAMES` di riwayat pembayaran:

```jsx
                                  {KAS_NAMES[p.account] || p.account}
```

menjadi:

```jsx
                                  {getKasAccountName(p.account)}
```

- [x] **Step 3: Rewire BiayaPage.jsx**

Tambahkan import setelah blok import `lucide-react` yang ada:

```js
import { KAS_ACCOUNTS, getJournalType } from '../data/kasAccounts'
```

Hapus blok `kasOptions` di baris 143–147, ganti pemakaiannya di `<select>` menjadi `KAS_ACCOUNTS.map(...)` dengan bentuk `<option>` yang sama persis seperti sebelumnya.

Ganti baris 157:

```js
        type: account === '1111' ? 'kas' : 'bank',
```

menjadi:

```js
        type: getJournalType(account),
```

**Jangan sentuh apa pun lagi di BiayaPage.** Khususnya bug `journalId: journal.id` di baris 168 — itu ditangani task terpisah di luar scope plan ini.

- [x] **Step 4: Verifikasi tidak ada sisa duplikasi di dua file itu**

```bash
cd apps/bul-accounting && grep -n "KAS_NAMES\|kasOptions\|startsWith('1111')\|account === '1111'" src/pages/PenjualanPage.jsx src/pages/BiayaPage.jsx
```

Expected: tidak ada output sama sekali.

- [x] **Step 5: Jalankan validasi**

```bash
cd apps/bul-accounting && npm test && npm run build
```

Expected: seluruh test lulus (jumlah sama seperti sebelum task ini), build sukses.

- [x] **Step 6: Commit**

```bash
git add apps/bul-accounting/src/data/kasAccounts.js apps/bul-accounting/src/pages/PenjualanPage.jsx apps/bul-accounting/src/pages/BiayaPage.jsx
git commit -m "refactor(bul-accounting): extract kas/bank accounts into single source"
```

---

### Task 2: `computeInvoiceStatus` dan `sisaTagihan`

Mengangkat aturan status yang saat ini diduplikasi di `accounting.js:548` dan `accounting.js:563`. **Perilaku harus identik bit-per-bit.**

Perhatikan detail halus di kode lama: perbandingan `paid` memakai nilai yang **dibulatkan**, tetapi pengecekan `partial` memakai `totalPaid` **mentah**. Jangan "merapikan" ini — `totalPaid = 0.4` harus tetap menghasilkan `'partial'`, bukan `'unpaid'`.

**Files:**
- Create: `apps/bul-accounting/src/utils/payments.js`
- Create: `apps/bul-accounting/src/utils/__tests__/payments.test.js`
- Modify: `apps/bul-accounting/src/utils/accounting.js` (baris 548 dan 563)

**Interfaces:**
- Consumes: —
- Produces: `computeInvoiceStatus(amount: number, totalPaid: number) => 'unpaid'|'partial'|'paid'`, `sisaTagihan(invoice: {amount?: number, totalPaid?: number}) => number`, `TOLERANSI_RUPIAH: number`

- [x] **Step 1: Tulis test yang gagal**

Create `apps/bul-accounting/src/utils/__tests__/payments.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { computeInvoiceStatus, sisaTagihan } from '../payments'

describe('computeInvoiceStatus', () => {
  it('belum dibayar sama sekali -> unpaid', () => {
    expect(computeInvoiceStatus(1000000, 0)).toBe('unpaid')
  })

  it('dibayar sebagian -> partial', () => {
    expect(computeInvoiceStatus(1000000, 400000)).toBe('partial')
  })

  it('dibayar penuh -> paid', () => {
    expect(computeInvoiceStatus(1000000, 1000000)).toBe('paid')
  })

  it('kelebihan bayar tetap paid', () => {
    expect(computeInvoiceStatus(1000000, 1000001)).toBe('paid')
  })

  it('selisih pembulatan di bawah 0,5 dianggap lunas', () => {
    expect(computeInvoiceStatus(1000000, 999999.6)).toBe('paid')
  })

  it('nominal mikro tetap partial, bukan unpaid (perilaku lama dipertahankan)', () => {
    expect(computeInvoiceStatus(1000000, 0.4)).toBe('partial')
  })

  it('totalPaid null/undefined diperlakukan sebagai 0', () => {
    expect(computeInvoiceStatus(1000000, null)).toBe('unpaid')
    expect(computeInvoiceStatus(1000000, undefined)).toBe('unpaid')
  })
})

describe('sisaTagihan', () => {
  it('menghitung amount dikurangi totalPaid', () => {
    expect(sisaTagihan({ amount: 1000000, totalPaid: 300000 })).toBe(700000)
  })

  it('field kosong diperlakukan sebagai 0', () => {
    expect(sisaTagihan({ amount: 1000000 })).toBe(1000000)
    expect(sisaTagihan({})).toBe(0)
  })
})
```

- [x] **Step 2: Jalankan test untuk memastikan gagal**

```bash
cd apps/bul-accounting && npx vitest run src/utils/__tests__/payments.test.js
```

Expected: FAIL — `Failed to resolve import "../payments"`.

- [x] **Step 3: Implementasi minimal**

Create `apps/bul-accounting/src/utils/payments.js`:

```js
// Logika alokasi pembayaran multi-invoice.
// Fungsi murni: tanpa Firestore, tanpa React, tanpa efek samping.
// Semua perhitungan uang tinggal di sini agar bisa diuji tanpa mock.

// Toleransi pembulatan rupiah. Nilainya sama dengan yang dipakai saveJournal()
// saat memeriksa balance jurnal (accounting.js:54).
export const TOLERANSI_RUPIAH = 0.5

/**
 * Sisa tagihan sebuah invoice.
 */
export function sisaTagihan(invoice) {
  return (invoice?.amount || 0) - (invoice?.totalPaid || 0)
}

/**
 * Status invoice berdasarkan nominal dan total yang sudah dibayar.
 *
 * Perilaku disalin persis dari accounting.js:548 dan accounting.js:563.
 * Catatan: perbandingan 'paid' memakai nilai yang dibulatkan, tetapi
 * pengecekan 'partial' memakai nilai mentah. Perbedaan ini disengaja dan
 * dipertahankan agar tidak ada invoice lama yang berubah status.
 */
export function computeInvoiceStatus(amount, totalPaid) {
  const paid = totalPaid || 0
  if (Math.round(paid) >= Math.round(amount || 0)) return 'paid'
  return paid > 0 ? 'partial' : 'unpaid'
}
```

- [x] **Step 4: Jalankan test untuk memastikan lulus**

```bash
cd apps/bul-accounting && npx vitest run src/utils/__tests__/payments.test.js
```

Expected: PASS, 9 test.

- [x] **Step 5: Alihkan `accounting.js` ke fungsi bersama**

Tambahkan import di `apps/bul-accounting/src/utils/accounting.js`, tepat setelah import `chartOfAccounts` yang ada:

```js
import { computeInvoiceStatus } from './payments'
```

Di `addInvoicePayment()`, ganti baris 548:

```js
  const status = Math.round(totalPaid) >= Math.round(inv.amount) ? 'paid' : (totalPaid > 0 ? 'partial' : 'unpaid')
```

menjadi:

```js
  const status = computeInvoiceStatus(inv.amount, totalPaid)
```

Hapus juga dua baris komentar tepat di atasnya yang menjelaskan duplikasi pembulatan (baris 546–547), karena alasannya sudah pindah ke `payments.js`.

Di `removeInvoicePayment()`, ganti baris 563 dengan bentuk yang sama persis:

```js
  const status = computeInvoiceStatus(inv.amount, totalPaid)
```

- [x] **Step 6: Jalankan validasi penuh**

```bash
cd apps/bul-accounting && npm test && npm run build
```

Expected: seluruh test lulus termasuk `accounting.test.js` yang sudah ada, build sukses.

- [x] **Step 7: Commit**

```bash
git add apps/bul-accounting/src/utils/payments.js apps/bul-accounting/src/utils/__tests__/payments.test.js apps/bul-accounting/src/utils/accounting.js
git commit -m "refactor(bul-accounting): extract computeInvoiceStatus into payments util"
```

---

### Task 3: Validasi dan ringkasan alokasi

**Files:**
- Modify: `apps/bul-accounting/src/utils/payments.js`
- Modify: `apps/bul-accounting/src/utils/__tests__/payments.test.js`

**Interfaces:**
- Consumes: `sisaTagihan()`, `TOLERANSI_RUPIAH` dari Task 2
- Produces:
  - Bentuk baris alokasi (dipakai seluruh fase berikutnya):
    ```js
    // AllocationRow
    { invoiceId: string, invoiceNo: string, truckId: string|null, date: string,
      amount: number, totalPaid: number,
      selected: boolean, jumlahBayar: number|string, pph: number|string }
    ```
  - `validateAllocations(rows: AllocationRow[]) => { valid: boolean, errors: Record<string,string>, formError: string }`
  - `summarizeAllocations(rows: AllocationRow[]) => { count: number, totalGross: number, totalPph: number, totalNet: number }`

- [x] **Step 1: Tulis test yang gagal**

Tambahkan di akhir `apps/bul-accounting/src/utils/__tests__/payments.test.js`:

```js
import { validateAllocations, summarizeAllocations } from '../payments'

const baris = (over = {}) => ({
  invoiceId: 'inv1', invoiceNo: 'INV-001', truckId: null,
  amount: 1000000, totalPaid: 0,
  selected: true, jumlahBayar: 1000000, pph: 0,
  ...over,
})

describe('validateAllocations', () => {
  it('menolak ketika tidak ada baris tercentang', () => {
    const r = validateAllocations([baris({ selected: false })])
    expect(r.valid).toBe(false)
    expect(r.formError).toBe('Pilih minimal satu invoice')
  })

  it('menerima alokasi penuh yang wajar', () => {
    const r = validateAllocations([baris()])
    expect(r.valid).toBe(true)
    expect(r.errors).toEqual({})
  })

  it('menerima alokasi sebagian', () => {
    const r = validateAllocations([baris({ jumlahBayar: 400000 })])
    expect(r.valid).toBe(true)
  })

  it('menolak jumlah bayar nol', () => {
    const r = validateAllocations([baris({ jumlahBayar: 0 })])
    expect(r.valid).toBe(false)
    expect(r.errors.inv1).toBe('Jumlah bayar harus lebih dari 0')
  })

  it('menolak jumlah bayar negatif', () => {
    const r = validateAllocations([baris({ jumlahBayar: -1 })])
    expect(r.valid).toBe(false)
    expect(r.errors.inv1).toBe('Jumlah bayar harus lebih dari 0')
  })

  it('menolak overpayment di luar toleransi', () => {
    const r = validateAllocations([baris({ jumlahBayar: 1000001 })])
    expect(r.valid).toBe(false)
    expect(r.errors.inv1).toBe('Jumlah bayar melebihi sisa tagihan')
  })

  it('memperhitungkan cicilan yang sudah masuk', () => {
    const r = validateAllocations([baris({ totalPaid: 600000, jumlahBayar: 400001 })])
    expect(r.valid).toBe(false)
    expect(r.errors.inv1).toBe('Jumlah bayar melebihi sisa tagihan')
  })

  it('menoleransi selisih pembulatan 0,5', () => {
    const r = validateAllocations([baris({ jumlahBayar: 1000000.4 })])
    expect(r.valid).toBe(true)
  })

  it('menolak PPh negatif', () => {
    const r = validateAllocations([baris({ pph: -1 })])
    expect(r.valid).toBe(false)
    expect(r.errors.inv1).toBe('PPh tidak valid')
  })

  it('menolak PPh melebihi jumlah bayar', () => {
    const r = validateAllocations([baris({ jumlahBayar: 100000, pph: 100001 })])
    expect(r.valid).toBe(false)
    expect(r.errors.inv1).toBe('PPh tidak valid')
  })

  it('menerima PPh sama dengan jumlah bayar', () => {
    const r = validateAllocations([baris({ jumlahBayar: 100000, pph: 100000 })])
    expect(r.valid).toBe(true)
  })

  it('mengabaikan baris yang tidak tercentang walau nilainya kacau', () => {
    const r = validateAllocations([
      baris(),
      baris({ invoiceId: 'inv2', selected: false, jumlahBayar: 99999999 }),
    ])
    expect(r.valid).toBe(true)
  })

  it('melaporkan error per invoice, bukan hanya yang pertama', () => {
    const r = validateAllocations([
      baris({ invoiceId: 'inv1', jumlahBayar: 0 }),
      baris({ invoiceId: 'inv2', jumlahBayar: 100000, pph: 200000 }),
    ])
    expect(r.valid).toBe(false)
    expect(Object.keys(r.errors).sort()).toEqual(['inv1', 'inv2'])
  })
})

describe('summarizeAllocations', () => {
  it('menjumlahkan hanya baris tercentang', () => {
    const s = summarizeAllocations([
      baris({ invoiceId: 'inv1', jumlahBayar: 1000000, pph: 20000 }),
      baris({ invoiceId: 'inv2', jumlahBayar: 500000, pph: 10000 }),
      baris({ invoiceId: 'inv3', selected: false, jumlahBayar: 999999 }),
    ])
    expect(s).toEqual({ count: 2, totalGross: 1500000, totalPph: 30000, totalNet: 1470000 })
  })

  it('nol baris menghasilkan nol semua', () => {
    expect(summarizeAllocations([])).toEqual({ count: 0, totalGross: 0, totalPph: 0, totalNet: 0 })
  })

  it('menerima input string dari field form', () => {
    const s = summarizeAllocations([baris({ jumlahBayar: '250000', pph: '5000' })])
    expect(s.totalGross).toBe(250000)
    expect(s.totalNet).toBe(245000)
  })
})
```

- [x] **Step 2: Jalankan test untuk memastikan gagal**

```bash
cd apps/bul-accounting && npx vitest run src/utils/__tests__/payments.test.js
```

Expected: FAIL — `No "validateAllocations" export is defined on the module`.

- [x] **Step 3: Implementasi**

Tambahkan di akhir `apps/bul-accounting/src/utils/payments.js`:

```js
/**
 * Baris alokasi yang dipilih user di modal.
 * { invoiceId, invoiceNo, truckId, amount, totalPaid, selected, jumlahBayar, pph }
 */

const angka = (v) => Number(v) || 0

/**
 * Memvalidasi seluruh baris tercentang.
 * errors dipetakan per invoiceId agar modal bisa menandai baris yang bermasalah.
 * formError dipakai untuk kesalahan tingkat form, bukan tingkat baris.
 */
export function validateAllocations(rows) {
  const errors = {}
  const selected = (rows || []).filter(r => r.selected)

  if (selected.length === 0) {
    return { valid: false, errors, formError: 'Pilih minimal satu invoice' }
  }

  for (const r of selected) {
    const bayar = angka(r.jumlahBayar)
    const pph = angka(r.pph)

    if (bayar <= 0) {
      errors[r.invoiceId] = 'Jumlah bayar harus lebih dari 0'
      continue
    }
    if (bayar > sisaTagihan(r) + TOLERANSI_RUPIAH) {
      errors[r.invoiceId] = 'Jumlah bayar melebihi sisa tagihan'
      continue
    }
    if (pph < 0 || pph > bayar) {
      errors[r.invoiceId] = 'PPh tidak valid'
    }
  }

  return { valid: Object.keys(errors).length === 0, errors, formError: '' }
}

/**
 * Ringkasan tiga angka yang ditampilkan di bawah tabel modal.
 * totalNet adalah nominal yang benar-benar masuk ke rekening —
 * angka inilah yang harus cocok dengan mutasi bank.
 */
export function summarizeAllocations(rows) {
  const selected = (rows || []).filter(r => r.selected)
  const totalGross = selected.reduce((s, r) => s + angka(r.jumlahBayar), 0)
  const totalPph = selected.reduce((s, r) => s + angka(r.pph), 0)
  return { count: selected.length, totalGross, totalPph, totalNet: totalGross - totalPph }
}
```

- [x] **Step 4: Jalankan test untuk memastikan lulus**

```bash
cd apps/bul-accounting && npx vitest run src/utils/__tests__/payments.test.js
```

Expected: PASS, 25 test.

- [x] **Step 5: Commit**

```bash
git add apps/bul-accounting/src/utils/payments.js apps/bul-accounting/src/utils/__tests__/payments.test.js
git commit -m "feat(bul-accounting): add allocation validation and summary helpers"
```

---

### Task 4: Pembentuk baris jurnal dan entri pembayaran

Inti akuntansi fitur ini. Invarian yang harus dijaga: `totalDebit === totalCredit` untuk setiap kombinasi input yang valid.

**Files:**
- Modify: `apps/bul-accounting/src/utils/payments.js`
- Modify: `apps/bul-accounting/src/utils/__tests__/payments.test.js`

**Interfaces:**
- Consumes: `summarizeAllocations()` dari Task 3
- Produces:
  - `buildPaymentJournalLines({ rows, account, keterangan }) => Array<{accountCode, debit, credit, keterangan, truckId}>`
  - `buildPaymentEntries({ rows, account, keterangan, date, journalId, paymentGroupId, createdAt }) => Array<{ invoiceId, entry }>`
  - Konstanta akun: `AKUN_PIUTANG = '1121'`, `AKUN_PPH_DIBAYAR_MUKA = '1172'`

- [x] **Step 1: Tulis test yang gagal**

Tambahkan di akhir `apps/bul-accounting/src/utils/__tests__/payments.test.js`:

```js
import { buildPaymentJournalLines, buildPaymentEntries } from '../payments'

const totalDebit = (lines) => lines.reduce((s, l) => s + (l.debit || 0), 0)
const totalCredit = (lines) => lines.reduce((s, l) => s + (l.credit || 0), 0)

describe('buildPaymentJournalLines', () => {
  it('tanpa PPh: dua baris, bank penuh lawan satu piutang', () => {
    const lines = buildPaymentJournalLines({
      rows: [baris({ jumlahBayar: 1000000, pph: 0 })],
      account: '1112',
      keterangan: 'Pembayaran PT ABC',
    })
    expect(lines).toHaveLength(2)
    expect(lines[0]).toEqual({
      accountCode: '1112', debit: 1000000, credit: 0,
      keterangan: 'Pembayaran PT ABC', truckId: null,
    })
    expect(lines[1].accountCode).toBe('1121')
    expect(lines[1].credit).toBe(1000000)
    expect(totalDebit(lines)).toBe(totalCredit(lines))
  })

  it('tidak memunculkan baris 1172 ketika total PPh nol', () => {
    const lines = buildPaymentJournalLines({
      rows: [baris({ pph: 0 })], account: '1112', keterangan: 'x',
    })
    expect(lines.some(l => l.accountCode === '1172')).toBe(false)
  })

  it('dengan PPh: bank berkurang, satu baris 1172 berisi total PPh', () => {
    const lines = buildPaymentJournalLines({
      rows: [
        baris({ invoiceId: 'inv1', invoiceNo: 'INV-001', jumlahBayar: 1000000, pph: 20000 }),
        baris({ invoiceId: 'inv2', invoiceNo: 'INV-002', jumlahBayar: 500000, pph: 10000 }),
      ],
      account: '1112',
      keterangan: 'Pembayaran PT ABC',
    })
    expect(lines[0]).toMatchObject({ accountCode: '1112', debit: 1470000 })
    expect(lines[1]).toMatchObject({ accountCode: '1172', debit: 30000 })
    expect(totalDebit(lines)).toBe(1500000)
    expect(totalCredit(lines)).toBe(1500000)
  })

  it('menggabungkan PPh walau hanya sebagian baris yang dipotong', () => {
    const lines = buildPaymentJournalLines({
      rows: [
        baris({ invoiceId: 'inv1', jumlahBayar: 1000000, pph: 20000 }),
        baris({ invoiceId: 'inv2', jumlahBayar: 500000, pph: 0 }),
      ],
      account: '1112', keterangan: 'x',
    })
    const pphLines = lines.filter(l => l.accountCode === '1172')
    expect(pphLines).toHaveLength(1)
    expect(pphLines[0].debit).toBe(20000)
    expect(totalDebit(lines)).toBe(totalCredit(lines))
  })

  it('memecah kredit piutang per invoice dengan nomor invoice di keterangan', () => {
    const lines = buildPaymentJournalLines({
      rows: [
        baris({ invoiceId: 'inv1', invoiceNo: 'INV-001', jumlahBayar: 100000 }),
        baris({ invoiceId: 'inv2', invoiceNo: 'INV-002', jumlahBayar: 200000 }),
        baris({ invoiceId: 'inv3', invoiceNo: 'INV-003', jumlahBayar: 300000 }),
      ],
      account: '1112', keterangan: 'Setoran 20 Agu',
    })
    const kredit = lines.filter(l => l.accountCode === '1121')
    expect(kredit).toHaveLength(3)
    expect(kredit.map(l => l.credit)).toEqual([100000, 200000, 300000])
    expect(kredit[0].keterangan).toBe('Setoran 20 Agu — INV-001')
  })

  it('meneruskan truckId per baris dan tidak menaruhnya di baris kas', () => {
    const lines = buildPaymentJournalLines({
      rows: [
        baris({ invoiceId: 'inv1', truckId: 'T1', jumlahBayar: 100000 }),
        baris({ invoiceId: 'inv2', truckId: 'T2', jumlahBayar: 200000 }),
      ],
      account: '1112', keterangan: 'x',
    })
    expect(lines[0].truckId).toBe(null)
    const kredit = lines.filter(l => l.accountCode === '1121')
    expect(kredit.map(l => l.truckId)).toEqual(['T1', 'T2'])
  })

  it('memakai potongan invoiceId ketika nomor invoice kosong', () => {
    const lines = buildPaymentJournalLines({
      rows: [baris({ invoiceId: 'abcdefgh1234', invoiceNo: '', jumlahBayar: 100000 })],
      account: '1112', keterangan: 'Setoran',
    })
    expect(lines[1].keterangan).toBe('Setoran — abcdefgh')
  })

  it('tetap balance untuk 20 invoice dengan PPh acak-tetap', () => {
    const rows = Array.from({ length: 20 }, (_, i) => baris({
      invoiceId: `inv${i}`, invoiceNo: `INV-${i}`,
      amount: 1000000, jumlahBayar: 1000000, pph: (i % 5) * 1000,
    }))
    const lines = buildPaymentJournalLines({ rows, account: '1113', keterangan: 'batch' })
    expect(totalDebit(lines)).toBe(totalCredit(lines))
    expect(totalCredit(lines)).toBe(20000000)
  })

  it('satu invoice menghasilkan jurnal setara modal pembayaran lama', () => {
    // PembayaranModal lama, cabang berPPh: Dr kas(net), Dr 1172(pph), Cr 1121(gross)
    const lines = buildPaymentJournalLines({
      rows: [baris({ jumlahBayar: 1000000, pph: 20000 })],
      account: '1112', keterangan: 'Pembayaran INV-001 - PT ABC',
    })
    expect(lines.map(l => l.accountCode)).toEqual(['1112', '1172', '1121'])
    expect(lines[0].debit).toBe(980000)
    expect(lines[1].debit).toBe(20000)
    expect(lines[2].credit).toBe(1000000)
  })
})

describe('buildPaymentEntries', () => {
  it('menghasilkan satu entri per invoice tercentang dengan netDiterima terhitung', () => {
    const out = buildPaymentEntries({
      rows: [
        baris({ invoiceId: 'inv1', jumlahBayar: 1000000, pph: 20000 }),
        baris({ invoiceId: 'inv2', selected: false }),
      ],
      account: '1112',
      keterangan: 'Setoran',
      date: '2026-08-20',
      journalId: 'jrn1',
      paymentGroupId: 'grp1',
      createdAt: '2026-08-20T03:00:00.000Z',
    })
    expect(out).toHaveLength(1)
    expect(out[0].invoiceId).toBe('inv1')
    expect(out[0].entry).toEqual({
      journalId: 'jrn1',
      paymentGroupId: 'grp1',
      date: '2026-08-20',
      jumlahBayar: 1000000,
      pph: 20000,
      netDiterima: 980000,
      account: '1112',
      keterangan: 'Setoran',
      createdAt: '2026-08-20T03:00:00.000Z',
    })
  })

  it('total jumlahBayar entri sama dengan totalGross ringkasan', () => {
    const rows = [
      baris({ invoiceId: 'inv1', jumlahBayar: 300000 }),
      baris({ invoiceId: 'inv2', jumlahBayar: 700000 }),
    ]
    const out = buildPaymentEntries({
      rows, account: '1112', keterangan: 'x', date: '2026-08-20',
      journalId: 'j', paymentGroupId: 'g', createdAt: 'now',
    })
    const total = out.reduce((s, o) => s + o.entry.jumlahBayar, 0)
    expect(total).toBe(summarizeAllocations(rows).totalGross)
  })
})
```

- [x] **Step 2: Jalankan test untuk memastikan gagal**

```bash
cd apps/bul-accounting && npx vitest run src/utils/__tests__/payments.test.js
```

Expected: FAIL — `No "buildPaymentJournalLines" export is defined on the module`.

- [x] **Step 3: Implementasi**

Tambahkan di akhir `apps/bul-accounting/src/utils/payments.js`:

```js
// Akun tetap yang dipakai pembayaran piutang.
// Nilainya menyalin PembayaranModal lama (PenjualanPage.jsx:173-182).
export const AKUN_PIUTANG = '1121'            // Piutang Pelanggan - Proyek
export const AKUN_PPH_DIBAYAR_MUKA = '1172'   // PPh 23 Dibayar Muka

const labelInvoice = (r) => r.invoiceNo || String(r.invoiceId || '').slice(0, 8)

/**
 * Membentuk baris jurnal untuk satu penerimaan pembayaran multi-invoice.
 *
 * Bentuknya:
 *   Dr  <akun kas/bank>   totalNet      (satu baris, cocok dengan mutasi bank)
 *   Dr  1172              totalPph      (hanya jika totalPph > 0)
 *       Cr 1121           per invoice   (agar buku besar piutang tetap detail)
 *
 * truckId diletakkan per baris kredit, bukan di header jurnal, karena satu
 * pembayaran bisa mencakup invoice dari beberapa armada.
 */
export function buildPaymentJournalLines({ rows, account, keterangan }) {
  const selected = (rows || []).filter(r => r.selected)
  const { totalPph, totalNet } = summarizeAllocations(rows)

  const lines = [
    { accountCode: account, debit: totalNet, credit: 0, keterangan, truckId: null },
  ]

  if (totalPph > 0) {
    lines.push({
      accountCode: AKUN_PPH_DIBAYAR_MUKA,
      debit: totalPph,
      credit: 0,
      keterangan: `PPh 23 - ${keterangan}`,
      truckId: null,
    })
  }

  for (const r of selected) {
    lines.push({
      accountCode: AKUN_PIUTANG,
      debit: 0,
      credit: angka(r.jumlahBayar),
      keterangan: `${keterangan} — ${labelInvoice(r)}`,
      truckId: r.truckId || null,
    })
  }

  return lines
}

/**
 * Membentuk entri payments[] per invoice.
 * Bentuk entri sengaja identik dengan yang ditulis addInvoicePayment(),
 * hanya ditambah paymentGroupId, agar riwayat pembayaran di PenjualanPage
 * merender entri baru tanpa perubahan kode.
 */
export function buildPaymentEntries({
  rows, account, keterangan, date, journalId, paymentGroupId, createdAt,
}) {
  return (rows || []).filter(r => r.selected).map(r => {
    const jumlahBayar = angka(r.jumlahBayar)
    const pph = angka(r.pph)
    return {
      invoiceId: r.invoiceId,
      entry: {
        journalId,
        paymentGroupId,
        date,
        jumlahBayar,
        pph,
        netDiterima: jumlahBayar - pph,
        account,
        keterangan,
        createdAt,
      },
    }
  })
}
```

- [x] **Step 4: Jalankan test untuk memastikan lulus**

```bash
cd apps/bul-accounting && npx vitest run src/utils/__tests__/payments.test.js
```

Expected: PASS, 36 test.

- [x] **Step 5: Jalankan validasi penuh**

```bash
cd apps/bul-accounting && npm test && npm run build
```

Expected: seluruh test lulus, build sukses.

- [x] **Step 6: Commit**

```bash
git add apps/bul-accounting/src/utils/payments.js apps/bul-accounting/src/utils/__tests__/payments.test.js
git commit -m "feat(bul-accounting): build combined payment journal lines and entries"
```

---

### 🛑 GERBANG FASE 1

- [x] Jalankan `cd apps/bul-accounting && npm test && npm run build` sekali lagi dan catat hasilnya.
- [x] **BERHENTI. Jangan mulai Fase 2.**
- [x] Laporkan ke user: file yang dibuat/diubah, jumlah test yang lulus, hash 4 commit.
- [x] Keluarkan prompt Fase 2 siap-tempel (model `opus`, effort `high`) sesuai format di bagian "Aturan wajib akhir fase". Prompt itu harus memuat signature yang sudah tersedia: `KAS_ACCOUNTS`, `getKasAccountName()`, `getJournalType()`, `computeInvoiceStatus()`, `sisaTagihan()`, `TOLERANSI_RUPIAH`, `validateAllocations()`, `summarizeAllocations()`, `buildPaymentJournalLines()`, `buildPaymentEntries()`, `AKUN_PIUTANG`, `AKUN_PPH_DIBAYAR_MUKA`.
- [x] Ingatkan user bahwa **Fase 0 harus sudah selesai** sebelum Fase 2 dijalankan.

---

# FASE 2 — Lapisan Firestore

**Model:** `opus` · **Effort:** `high` · **Task 5–6**

Fase paling berisiko. Menyentuh posting jurnal dan pembaruan invoice. **Prasyarat: Fase 0 sudah dijalankan user dan hasilnya sudah diketahui.**

---

### Task 5: Query invoice open per pelanggan + composite index

**Files:**
- Modify: `apps/bul-accounting/src/utils/accounting.js`
- Modify: `apps/bul-accounting/firestore.indexes.json`

**Interfaces:**
- Consumes: —
- Produces: `getOpenInvoicesByCustomer(customerId: string) => Promise<Array<Invoice>>`, terurut menaik berdasarkan `date`

- [x] **Step 1: Tambahkan composite index**

Modify `apps/bul-accounting/firestore.indexes.json` — tambahkan satu objek ke array `indexes`, setelah entri `integration_queue` yang ada:

```json
    {
      "collectionGroup": "invoices",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "customerId", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" }
      ]
    }
```

Pastikan koma antar objek array tetap valid. Verifikasi:

```bash
cd apps/bul-accounting && node -e "JSON.parse(require('fs').readFileSync('firestore.indexes.json','utf8')); console.log('JSON valid')"
```

Expected: `JSON valid`

- [x] **Step 2: Implementasi query**

Tambahkan di `apps/bul-accounting/src/utils/accounting.js`, tepat setelah fungsi `removeInvoicePayment()`:

```js
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
```

`query`, `collection`, `where`, dan `getDocs` semuanya sudah ada di blok import `firebase/firestore` pada baris 2–5. Tidak perlu import baru.

- [x] **Step 3: Jalankan validasi**

```bash
cd apps/bul-accounting && npm test && npm run build
```

Expected: seluruh test lulus, build sukses.

- [x] **Step 4: Commit**

```bash
git add apps/bul-accounting/src/utils/accounting.js apps/bul-accounting/firestore.indexes.json
git commit -m "feat(bul-accounting): query open invoices by customer with composite index"
```

- [x] **Step 5: Catat untuk user**

Index belum aktif sampai di-deploy. CLI Firebase diblokir untuk agen, jadi **catat perintah ini dalam laporan akhir fase** agar user atau Codex menjalankannya sebelum fitur dipakai:

```bash
cd apps/bul-accounting && firebase deploy --only firestore:indexes
```

---

### Task 6: Transaksi atomik pencatatan pembayaran

Inti fitur. Satu `runTransaction` menulis jurnal gabungan dan memperbarui N invoice. Menutup P0-3 (write tidak atomik) dan P1-4 (lost update) untuk jalur baru.

Aturan Firestore yang wajib dipatuhi: **seluruh `tx.get()` harus selesai sebelum `tx.set()`/`tx.update()` pertama.** Melanggar ini menyebabkan error runtime.

**Files:**
- Modify: `apps/bul-accounting/src/utils/accounting.js`
- Modify: `apps/bul-accounting/src/utils/__tests__/accounting.test.js` (hanya menambah `runTransaction` ke mock)

**Interfaces:**
- Consumes: `validateAllocations()`, `buildPaymentJournalLines()`, `buildPaymentEntries()`, `computeInvoiceStatus()` dari Fase 1; `getJournalType()` dari Task 1
- Produces: `recordMultiInvoicePayment({ rows, account, date, keterangan, createdBy }) => Promise<{ journalId: string, paymentGroupId: string }>`

- [x] **Step 1: Tambahkan `runTransaction` ke mock test yang sudah ada**

`accounting.test.js` memakai `vi.mock('firebase/firestore', ...)` dengan factory yang mendaftarkan export satu per satu. Vitest melempar error saat `accounting.js` meng-import nama yang tidak ada di factory tersebut.

Modify `apps/bul-accounting/src/utils/__tests__/accounting.test.js` — di dalam objek yang dikembalikan factory mock, tambahkan satu baris:

```js
    runTransaction: vi.fn(),
```

- [x] **Step 2: Jalankan test untuk memastikan masih hijau sebelum implementasi**

```bash
cd apps/bul-accounting && npm test
```

Expected: seluruh test lulus. Mock tambahan belum dipakai siapa pun.

- [x] **Step 3: Tambahkan import di `accounting.js`**

Tambahkan `runTransaction` ke blok import `firebase/firestore` pada baris 2–5 sehingga menjadi:

```js
import {
  collection, addDoc, updateDoc, doc, getDocs, getDoc,
  query, where, orderBy, Timestamp, writeBatch, limit, setDoc, runTransaction
} from 'firebase/firestore'
```

Perluas import dari `./payments` yang ditambahkan di Task 2 menjadi:

```js
import {
  computeInvoiceStatus,
  validateAllocations,
  buildPaymentJournalLines,
  buildPaymentEntries,
} from './payments'
import { getJournalType } from '../data/kasAccounts'
```

- [x] **Step 4: Implementasi**

Tambahkan di `apps/bul-accounting/src/utils/accounting.js`, tepat setelah `getOpenInvoicesByCustomer()`:

```js
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

  const cek = validateAllocations(rows)
  if (!cek.valid) {
    throw new Error(cek.formError || 'Alokasi pembayaran tidak valid')
  }

  const lines = buildPaymentJournalLines({ rows, account, keterangan })
  const totalDebit = lines.reduce((s, l) => s + (l.debit || 0), 0)
  const totalCredit = lines.reduce((s, l) => s + (l.credit || 0), 0)
  if (Math.abs(totalDebit - totalCredit) > 0.5) {
    throw new Error(`Jurnal tidak balance! Debit: ${totalDebit}, Credit: ${totalCredit}`)
  }

  // Referensi dibuat lebih dulu agar journalId sudah diketahui sebelum commit
  // dan bisa ditulis ke tiap entri payments[].
  const journalRef = doc(collection(db, 'journals'))
  const paymentGroupId = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  const entries = buildPaymentEntries({
    rows, account, keterangan, date,
    journalId: journalRef.id, paymentGroupId, createdAt,
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
      if (entry.jumlahBayar > sisa + 0.5) {
        throw new Error(
          `Invoice ${label}: jumlah bayar melebihi sisa tagihan terkini. ` +
          'Muat ulang daftar invoice dan coba lagi.'
        )
      }
    }

    // FASE WRITE — jurnal dulu, lalu tiap invoice.
    tx.set(journalRef, {
      date,
      description: keterangan,
      type: getJournalType(account),
      truckId: null,
      lines,
      totalDebit,
      totalCredit,
      invoiceIds: entries.map(e => e.invoiceId),
      paymentGroupId,
      createdBy: createdBy || null,
      createdAt,
      status: 'posted',
    })

    for (const { ref, entry, data } of dibaca) {
      const payments = [...(data.payments || []), entry]
      const totalPaid = payments.reduce((s, p) => s + (p.jumlahBayar || 0), 0)
      const status = computeInvoiceStatus(data.amount, totalPaid)
      tx.update(ref, {
        payments,
        totalPaid,
        status,
        ...(status === 'paid' ? { paidDate: date } : {}),
        updatedAt: new Date().toISOString(),
      })
    }
  })

  // Audit ditulis setelah commit. Kegagalan audit tidak boleh membatalkan
  // operasi utama — pola yang sama dipakai writeAuditLog() di seluruh modul ini.
  await writeAuditLog(journalRef.id, 'create', createdBy, {
    description: keterangan,
    invoiceIds: entries.map(e => e.invoiceId),
    paymentGroupId,
  })

  return { journalId: journalRef.id, paymentGroupId }
}
```

- [x] **Step 5: Verifikasi urutan read-before-write secara manual**

```bash
cd apps/bul-accounting && sed -n '/export async function recordMultiInvoicePayment/,/^}/p' src/utils/accounting.js | grep -n "tx.get\|tx.set\|tx.update"
```

Expected: seluruh baris `tx.get` muncul **sebelum** baris `tx.set` dan `tx.update` pertama. Jika tidak, transaksi akan gagal saat runtime.

- [x] **Step 6: Jalankan validasi penuh**

```bash
cd apps/bul-accounting && npm test && npm run build
```

Expected: seluruh test lulus, build sukses.

- [x] **Step 7: Commit**

```bash
git add apps/bul-accounting/src/utils/accounting.js apps/bul-accounting/src/utils/__tests__/accounting.test.js
git commit -m "feat(bul-accounting): record multi-invoice payment in one atomic transaction"
```

---

### 🛑 GERBANG FASE 2

- [x] Jalankan `cd apps/bul-accounting && npm test && npm run build` dan catat hasilnya.
- [x] **BERHENTI. Jangan mulai Fase 3.**
- [x] Laporkan: file yang diubah, hash 2 commit, dan **perintah deploy index yang harus dijalankan user** (`firebase deploy --only firestore:indexes`).
- [x] Keluarkan prompt Fase 3 siap-tempel (model `sonnet`, effort `medium`), memuat signature `getOpenInvoicesByCustomer()` dan `recordMultiInvoicePayment()` beserta bentuk `AllocationRow`.

---

# FASE 3 — Antarmuka Pengguna

**Model:** `sonnet` · **Effort:** `medium` · **Task 7–8**

Komponen React mengikuti pola modal yang sudah ada di `PenjualanPage`. **Modal tidak boleh memuat aturan akuntansi apa pun** — semua perhitungan dipanggil dari `payments.js`.

---

### Task 7: Komponen `MultiPaymentModal`

**Files:**
- Create: `apps/bul-accounting/src/components/MultiPaymentModal.jsx`

**Interfaces:**
- Consumes: `getOpenInvoicesByCustomer()`, `recordMultiInvoicePayment()`, `formatCurrency()`, `formatDate()` dari `accounting.js`; `sisaTagihan()`, `validateAllocations()`, `summarizeAllocations()` dari `payments.js`; `KAS_ACCOUNTS` dari `kasAccounts.js`
- Produces: default export `MultiPaymentModal({ customers, onSaved, onClose })`

- [x] **Step 1: Buat komponen**

Create `apps/bul-accounting/src/components/MultiPaymentModal.jsx`:

```jsx
import React, { useState, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import {
  getOpenInvoicesByCustomer, recordMultiInvoicePayment,
  formatCurrency, formatDate,
} from '../utils/accounting'
import { sisaTagihan, validateAllocations, summarizeAllocations } from '../utils/payments'
import { KAS_ACCOUNTS } from '../data/kasAccounts'
import { X, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react'

/**
 * Menerima satu pembayaran pelanggan yang melunasi beberapa invoice sekaligus.
 * Komponen ini murni UI: seluruh perhitungan dan aturan akuntansi ada di
 * utils/payments.js dan utils/accounting.js.
 */
export default function MultiPaymentModal({ customers, onSaved, onClose }) {
  const { currentUser } = useAuth()

  const [customerId, setCustomerId] = useState('')
  const [rows, setRows]             = useState([])
  const [loadingInv, setLoadingInv] = useState(false)
  const [sudahMuat, setSudahMuat]   = useState(false)

  const [date, setDate]             = useState(new Date().toISOString().slice(0, 10))
  const [account, setAccount]       = useState('1112')
  const [keterangan, setKeterangan] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const selectedCustomer = customers.find(c => c.id === customerId)

  const pilihCustomer = useCallback(async (id) => {
    setCustomerId(id)
    setRows([])
    setError('')
    setSudahMuat(false)
    if (!id) return

    setLoadingInv(true)
    try {
      const inv = await getOpenInvoicesByCustomer(id)
      setRows(inv.map(i => ({
        invoiceId: i.id,
        invoiceNo: i.invoiceNo || '',
        truckId: i.truckId || null,
        date: i.date || '',
        amount: i.amount || 0,
        totalPaid: i.totalPaid || 0,
        selected: false,
        jumlahBayar: '',
        pph: '0',
      })))
      const nama = customers.find(c => c.id === id)?.name || ''
      setKeterangan(`Pembayaran dari ${nama}`)
      setSudahMuat(true)
    } catch (e) {
      setError(e.message || 'Gagal memuat invoice')
    } finally {
      setLoadingInv(false)
    }
  }, [customers])

  const ubahBaris = (invoiceId, patch) =>
    setRows(prev => prev.map(r => (r.invoiceId === invoiceId ? { ...r, ...patch } : r)))

  const toggleBaris = (r) =>
    ubahBaris(r.invoiceId, r.selected
      ? { selected: false, jumlahBayar: '', pph: '0' }
      : { selected: true, jumlahBayar: String(sisaTagihan(r)), pph: '0' })

  const centangSemua = (on) =>
    setRows(prev => prev.map(r => (on
      ? { ...r, selected: true, jumlahBayar: String(sisaTagihan(r)), pph: r.pph || '0' }
      : { ...r, selected: false, jumlahBayar: '', pph: '0' })))

  const cek = validateAllocations(rows)
  const ringkas = summarizeAllocations(rows)
  const semuaTercentang = rows.length > 0 && rows.every(r => r.selected)

  const handleSimpan = async () => {
    setError('')
    if (!cek.valid) return setError(cek.formError || 'Periksa kembali baris yang ditandai merah')
    if (!keterangan.trim()) return setError('Keterangan jurnal wajib diisi')

    setSaving(true)
    try {
      await recordMultiInvoicePayment({
        rows, account, date,
        keterangan: keterangan.trim(),
        createdBy: currentUser?.uid,
      })
      onSaved()
      onClose()
    } catch (e) {
      setError(e.message || 'Gagal menyimpan pembayaran')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b shrink-0">
          <h2 className="text-lg font-semibold text-gray-800">Terima Pembayaran</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <div>
            <label className="label">Pelanggan</label>
            <select value={customerId} onChange={e => pilihCustomer(e.target.value)} className="select-field">
              <option value="">-- Pilih Pelanggan --</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.customerNo} — {c.name}</option>)}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              Menampilkan seluruh invoice yang belum lunas, tanpa dibatasi filter tanggal halaman.
            </p>
          </div>

          {loadingInv && (
            <div className="flex justify-center py-8"><RefreshCw className="w-5 h-5 animate-spin text-brand-500" /></div>
          )}

          {sudahMuat && rows.length === 0 && (
            <div className="text-center py-8 text-gray-400 text-sm">
              {selectedCustomer?.name} tidak punya invoice yang belum lunas.
            </div>
          )}

          {rows.length > 0 && (
            <div className="border border-gray-200 rounded-xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="p-2 w-10">
                      <input type="checkbox" checked={semuaTercentang}
                        onChange={e => centangSemua(e.target.checked)} />
                    </th>
                    <th className="p-2 text-left font-medium">Tanggal</th>
                    <th className="p-2 text-left font-medium">No. Invoice</th>
                    <th className="p-2 text-right font-medium">Tagihan</th>
                    <th className="p-2 text-right font-medium">Sisa</th>
                    <th className="p-2 text-right font-medium w-36">Jumlah Bayar</th>
                    <th className="p-2 text-right font-medium w-32">PPh</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const err = cek.errors[r.invoiceId]
                    return (
                      <tr key={r.invoiceId}
                        className={`border-t border-gray-100 ${err ? 'bg-red-50' : ''}`}>
                        <td className="p-2 text-center">
                          <input type="checkbox" checked={r.selected} onChange={() => toggleBaris(r)} />
                        </td>
                        <td className="p-2 text-gray-500 whitespace-nowrap">{formatDate(r.date)}</td>
                        <td className="p-2 font-mono text-xs">
                          {r.invoiceNo || '-'}
                          {err && <div className="text-red-600 font-sans text-xs mt-0.5">{err}</div>}
                        </td>
                        <td className="p-2 text-right whitespace-nowrap">{formatCurrency(r.amount)}</td>
                        <td className="p-2 text-right whitespace-nowrap font-semibold text-orange-600">
                          {formatCurrency(sisaTagihan(r))}
                        </td>
                        <td className="p-2">
                          <input type="number" min="0" disabled={!r.selected} value={r.jumlahBayar}
                            onChange={e => ubahBaris(r.invoiceId, { jumlahBayar: e.target.value })}
                            className="input-field text-right disabled:bg-gray-50 disabled:text-gray-300" />
                        </td>
                        <td className="p-2">
                          <input type="number" min="0" disabled={!r.selected} value={r.pph}
                            onChange={e => ubahBaris(r.invoiceId, { pph: e.target.value })}
                            className="input-field text-right disabled:bg-gray-50 disabled:text-gray-300" />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {rows.length > 0 && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label">Tanggal Bayar</label>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input-field" />
                </div>
                <div>
                  <label className="label">Diterima di Akun</label>
                  <select value={account} onChange={e => setAccount(e.target.value)} className="select-field">
                    {KAS_ACCOUNTS.map(o => <option key={o.code} value={o.code}>{o.code} - {o.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Keterangan Jurnal</label>
                  <input type="text" value={keterangan} onChange={e => setKeterangan(e.target.value)} className="input-field" />
                </div>
              </div>

              <div className="bg-brand-50 rounded-xl p-4 space-y-1 text-sm">
                <div className="flex justify-between text-brand-600">
                  <span>Total Tagihan ({ringkas.count} invoice)</span>
                  <span className="font-mono">{formatCurrency(ringkas.totalGross)}</span>
                </div>
                <div className="flex justify-between text-brand-600">
                  <span>Total PPh Dipotong</span>
                  <span className="font-mono">{formatCurrency(ringkas.totalPph)}</span>
                </div>
                <div className="flex justify-between font-semibold text-brand-800 border-t border-brand-200 pt-1 mt-1">
                  <span>Net Masuk ke Bank</span>
                  <span className="font-mono">{formatCurrency(ringkas.totalNet)}</span>
                </div>
                <p className="text-xs text-brand-500 pt-1">
                  Angka Net harus cocok dengan mutasi rekening Anda.
                </p>
              </div>
            </>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 px-5 py-4 border-t shrink-0">
          <button onClick={onClose} className="btn-secondary">Batal</button>
          <button onClick={handleSimpan} disabled={saving || !cek.valid}
            className="btn-primary flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
            {saving && <RefreshCw className="w-4 h-4 animate-spin" />}
            <CheckCircle className="w-4 h-4" /> Simpan Pembayaran
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [x] **Step 2: Jalankan validasi**

```bash
cd apps/bul-accounting && npm test && npm run build
```

Expected: seluruh test lulus, build sukses tanpa warning import yang belum terpakai.

- [x] **Step 3: Commit**

```bash
git add apps/bul-accounting/src/components/MultiPaymentModal.jsx
git commit -m "feat(bul-accounting): add multi-invoice payment modal"
```

---

### Task 8: Integrasi ke halaman Penjualan

**Files:**
- Modify: `apps/bul-accounting/src/pages/PenjualanPage.jsx`

**Interfaces:**
- Consumes: `MultiPaymentModal` dari Task 7
- Produces: —

- [x] **Step 1: Tambahkan import**

Tambahkan setelah import `ConfirmDialog` yang ada:

```js
import MultiPaymentModal from '../components/MultiPaymentModal'
```

Tambahkan `Wallet` ke daftar ikon yang diimpor dari `lucide-react`.

- [x] **Step 2: Tambahkan state**

Di dalam `PenjualanPage()`, tepat setelah baris `const [bayarItem, setBayarItem] = useState(null)`:

```js
  const [showMultiPay, setShowMultiPay] = useState(false)
```

- [x] **Step 3: Tambahkan tombol di header**

Ganti blok tombol header (baris 362–367) — yang saat ini hanya berisi satu tombol Tambah Invoice — menjadi:

```jsx
        {isSuperadmin() && (
          <div className="flex gap-2">
            <button onClick={() => setShowMultiPay(true)} className="btn-secondary flex items-center gap-2">
              <Wallet className="w-4 h-4" /> Terima Pembayaran
            </button>
            <button onClick={() => { setEditData(null); setShowForm(true) }} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" /> Tambah Invoice
            </button>
          </div>
        )}
```

- [x] **Step 4: Render modal**

Tambahkan di blok Modals, tepat setelah blok `{bayarItem && (...)}`:

```jsx
      {showMultiPay && (
        <MultiPaymentModal
          customers={customers}
          onSaved={loadData}
          onClose={() => setShowMultiPay(false)}
        />
      )}
```

- [x] **Step 5: Jalankan validasi**

```bash
cd apps/bul-accounting && npm test && npm run build
```

Expected: seluruh test lulus, build sukses.

- [x] **Step 6: Commit**

```bash
git add apps/bul-accounting/src/pages/PenjualanPage.jsx
git commit -m "feat(bul-accounting): wire multi-invoice payment into Penjualan page"
```

---

### 🛑 GERBANG FASE 3

- [x] Jalankan `cd apps/bul-accounting && npm test && npm run build` dan catat hasilnya.
- [x] **BERHENTI. Jangan mulai Fase 4.**
- [x] Laporkan: file yang dibuat/diubah, hash 2 commit.
- [x] **Peringatkan user secara eksplisit: JANGAN deploy sampai Fase 4 selesai.** Pada titik ini fitur sudah bisa membuat jurnal `invoiceIds[]`, tetapi `JurnalPage` masih hanya membalikkan satu invoice. Menghapus jurnal multi-payment sekarang akan meninggalkan invoice lain bertanda lunas tanpa jurnal pendukung. Fase 3 dan Fase 4 harus rilis bersamaan dalam satu PR (spec bagian 13).
- [x] Keluarkan prompt Fase 4 siap-tempel (model `opus`, effort `high`), memuat catatan bahwa jurnal multi-payment sekarang menulis `invoiceIds[]` + `paymentGroupId` dan `JurnalPage` belum bisa membalikkannya.

---

# FASE 4 — Pembalikan Jurnal dan Validasi Akhir

**Model:** `opus` · **Effort:** `high` · **Task 9–10**

Mengubah perilaku hapus jurnal yang sudah berjalan di produksi. Tanpa task ini, menghapus satu jurnal multi-payment akan meninggalkan invoice lain bertanda lunas padahal jurnalnya hilang.

---

### Task 9: Pembalikan jurnal multi-invoice

**Files:**
- Modify: `apps/bul-accounting/src/pages/JurnalPage.jsx` (baris 296–304 dan 409–418)

**Interfaces:**
- Consumes: `removeInvoicePayment()` yang sudah ada
- Produces: —

- [x] **Step 1: Tambahkan state jumlah invoice terdampak**

Di dalam `JurnalPage()`, tepat setelah `const [deleteId, setDeleteId] = useState(null)` (baris 255):

```js
  const [deleteInvoiceCount, setDeleteInvoiceCount] = useState(0)
```

- [x] **Step 2: Isi jumlah itu saat tombol hapus ditekan**

`JournalList` memanggil prop `onDelete` dengan **id saja**, bukan objek jurnal
(`JournalList.jsx:15` mendokumentasikan `fn(id)`, dipanggil di `JournalList.jsx:122`).
Karena itu jumlah invoice harus diambil dengan `getJournal(id)`, bukan dari baris daftar.

Tambahkan kedua helper ini tepat di atas `handleDelete`:

```js
  // Jurnal lama menyimpan satu invoiceId; jurnal multi-payment menyimpan invoiceIds[].
  const invoiceIdsDari = (journal) =>
    journal?.invoiceIds ?? (journal?.invoiceId ? [journal.invoiceId] : [])

  const mintaHapus = async (id) => {
    setDeleteId(id)
    try {
      const journal = await getJournal(id)
      setDeleteInvoiceCount(invoiceIdsDari(journal).length)
    } catch {
      // Gagal memuat jurnal hanya membuat pesan konfirmasi memakai bentuk umum.
      setDeleteInvoiceCount(0)
    }
  }
```

Lalu ganti prop `onDelete` pada `<JournalList>` (baris 384) dari:

```jsx
        onDelete={isSuperadmin() ? (id) => setDeleteId(id) : null}
```

menjadi:

```jsx
        onDelete={isSuperadmin() ? mintaHapus : null}
```

- [x] **Step 3: Ganti `handleDelete` agar meng-unapply seluruh invoice**

Ganti isi `handleDelete` (baris 296–304) menjadi:

```js
  const handleDelete = async () => {
    // Jika jurnal ini adalah pembayaran invoice, revert status seluruh invoice
    // yang dilunasinya. Jurnal lama punya satu invoiceId; jurnal multi-payment
    // punya invoiceIds[].
    const journal = await getJournal(deleteId)
    for (const invoiceId of invoiceIdsDari(journal)) {
      await removeInvoicePayment(invoiceId, deleteId)
    }
    await deleteJournal(deleteId, currentUser?.uid)
    setDeleteId(null)
    setDeleteInvoiceCount(0)
    loadData()
  }
```

- [x] **Step 4: Perjelas pesan konfirmasi**

Ganti blok `ConfirmDialog` di baris 409–418 menjadi:

```jsx
      {deleteId && (
        <ConfirmDialog
          title="Hapus Jurnal"
          message={
            deleteInvoiceCount > 1
              ? `Jurnal ini melunasi ${deleteInvoiceCount} invoice. Seluruhnya akan dikembalikan ke status sebelumnya, dan jurnal dicatat di audit trail. Lanjutkan?`
              : 'Jurnal akan dihapus permanen dan dicatat di audit trail. Lanjutkan?'
          }
          confirmLabel="Hapus"
          confirmVariant="danger"
          onConfirm={handleDelete}
          onCancel={() => { setDeleteId(null); setDeleteInvoiceCount(0) }}
        />
      )}
```

- [x] **Step 5: Verifikasi tidak ada sisa akses `invoiceId` tunggal**

```bash
cd apps/bul-accounting && grep -n "journal.invoiceId\|journal?.invoiceId" src/pages/JurnalPage.jsx
```

Expected: satu-satunya kemunculan ada di dalam helper `invoiceIdsDari`.

- [x] **Step 6: Jalankan validasi**

```bash
cd apps/bul-accounting && npm test && npm run build
```

Expected: seluruh test lulus, build sukses.

- [x] **Step 7: Commit**

```bash
git add apps/bul-accounting/src/pages/JurnalPage.jsx
git commit -m "fix(bul-accounting): revert every invoice when deleting a multi-payment journal"
```

---

### Task 10: Validasi akhir dan penyerahan

**Files:**
- Modify: `docs/superpowers/plans/2026-08-20-multi-invoice-payment-ar.md` (centang seluruh checkbox)

**Interfaces:**
- Consumes: seluruh task sebelumnya
- Produces: —

- [x] **Step 1: Jalankan validasi lengkap dari root aplikasi**

```bash
cd apps/bul-accounting && npm test && npm run build
```

Expected: seluruh test lulus (termasuk 36 test `payments.test.js`), build sukses.

- [x] **Step 2: Periksa tidak ada perubahan di luar scope**

```bash
git diff --stat main...HEAD
```

Expected: hanya file yang terdaftar di bagian "Struktur File" plan ini. Tidak boleh ada perubahan pada `firestore.rules`. Perubahan pada `BiayaPage.jsx` hanya berupa penggantian daftar akun kas dan `getJournalType`. Jika ada file lain, **berhenti dan laporkan ke user.**

- [x] **Step 3: Konfirmasi `firestore.rules` tidak tersentuh**

```bash
git diff main...HEAD -- apps/bul-accounting/firestore.rules
```

Expected: tidak ada output.

- [x] **Step 4: Centang seluruh checkbox plan dan commit**

```bash
git add docs/superpowers/plans/2026-08-20-multi-invoice-payment-ar.md
git commit -m "docs: mark multi-invoice payment plan complete"
```

- [x] **Step 5: Susun daftar smoke test manual untuk user**

Fitur ini belum bisa diuji end-to-end oleh agen karena butuh Firestore hidup dan akun superadmin. Susun laporan berisi langkah berikut agar user menjalankannya setelah index ter-deploy:

1. Pelanggan dengan 3 invoice `unpaid` → centang ketiganya → simpan. Harapan: ketiganya `paid`, terbentuk **satu** jurnal, buku besar `1121` menampilkan 3 baris kredit terpisah.
2. Bayar sebagian pada 2 dari 3 invoice. Harapan: status `partial`, kolom Sisa terhitung benar di halaman Penjualan.
3. Isi PPh pada salah satu baris. Harapan: muncul satu baris `1172`, dan Net Masuk ke Bank berkurang sesuai.
4. Buka expander Riwayat Pembayaran pada salah satu invoice. Harapan: entri baru tampil normal, sama seperti pembayaran tunggal.
5. Hapus jurnal multi-payment di halaman Jurnal. Harapan: dialog menyebut jumlah invoice, dan seluruh invoice kembali ke status sebelumnya.
6. Login sebagai `admin` (bukan superadmin). Harapan: tombol Terima Pembayaran tidak muncul.

---

### 🛑 GERBANG FASE 4 — SELESAI

- [x] **BERHENTI.**
- [x] Laporkan ke user: seluruh file yang berubah, hasil `npm test` dan `npm run build`, daftar seluruh commit, dan daftar smoke test manual dari Task 10 Step 5.
- [x] Sampaikan dua perintah yang **harus dijalankan user** (CLI Firebase diblokir untuk agen):
  ```bash
  cd apps/bul-accounting && firebase deploy --only firestore:indexes
  ```
- [x] Tawarkan langkah berikutnya: `superpowers:requesting-code-review`, lalu `superpowers:finishing-a-development-branch` untuk membuka PR. **Jangan merge tanpa persetujuan user.**

---

## Catatan untuk Reviewer

Empat hal yang paling mudah salah dan harus diperiksa khusus:

1. **`computeInvoiceStatus` (Task 2).** Pengecekan `paid` memakai nilai dibulatkan, `partial` memakai nilai mentah. Jika reviewer "merapikan" jadi konsisten, invoice dengan `totalPaid` sangat kecil akan berubah status.
2. **Urutan read-before-write (Task 6).** Seluruh `tx.get()` harus selesai sebelum `tx.set()` pertama. Firestore melempar error jika dilanggar.
3. **Balance jurnal (Task 4).** `totalDebit` harus persis `totalCredit`. Baris kas memakai `totalNet`, baris `1172` memakai `totalPph`, jumlahnya `totalGross` yang sama dengan total kredit.
4. **`invoiceIds` vs `invoiceId` (Task 9).** Setiap pembaca harus menormalkan lewat `invoiceIdsDari()`. Jurnal lama tidak boleh rusak.
