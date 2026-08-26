# Nilai Kwitansi Net (Sub Total − Uang Jalan) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Dispatch a fresh subagent per task with two-stage review. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tampilkan nilai tagihan invoice di bul-monitor sebagai `Sub Total − Potongan Uang Jalan = Total Akhir`, sesuai kwitansi fisik, tanpa mengubah schema atau data tersimpan.

**Architecture:** Satu util murni `src/utils/invoiceTotals.js` menjadi satu-satunya sumber kebenaran perhitungan tiga angka kwitansi. Uang jalan diresolusi live-first (dari `suratJalanList` yang sedang aktif) dengan fallback ke snapshot `invoice.suratJalanList`, sehingga angka UI identik dengan `totalUJ` yang dipakai bridge ke bul-accounting. `invoice.totalNilai` tetap tersimpan bruto — ia dasar `Cr 4100` di jurnal dan tidak boleh berubah.

**Tech Stack:** React 18, Vite 7, Vitest 4, Tailwind 3. Tidak ada dependency baru.

**Spec:** `docs/superpowers/specs/2026-08-26-bul-monitor-kwitansi-nilai-net-design.md`

## Global Constraints

- Semua perintah dijalankan dari `apps/bul-monitor`. Jangan `cd` keluar worktree.
- **JANGAN** mengubah `src/App.jsx` (`addInvoice`, `editInvoice`) — `totalNilai` wajib tetap bruto.
- **JANGAN** mengubah `src/integrationService.js` — jurnal dan bridge di luar cakupan.
- **JANGAN** menyentuh `apps/bul-accounting` sama sekali. Bug AR bruto punya spec terpisah.
- Tidak ada perubahan schema Firestore, tidak ada migrasi, tidak ada backfill.
- Nama domain Indonesia dipertahankan: `uangJalan`, `suratJalanIds`, `qtyBongkar`, `hargaSatuan`, `totalNilai`.
- Komentar dan nama fungsi baru dalam Bahasa Indonesia, mengikuti gaya `src/utils/invoiceEligibility.js`.
- Format mata uang selalu `toLocaleString('id-ID')`, mengikuti kode sekitarnya.
- Label UI persis: `Sub Total`, `Potongan Uang Jalan`, `Total Akhir`.
- Commit style: English conventional commits (`feat:`, `fix:`, `test:`, `refactor:`).
- Validasi wajib sebelum tiap commit: `npm run test` dan `npm run build` dari `apps/bul-monitor`.

---

# FASE 1 — Util Perhitungan (Task 1)

**Effort: medium · Model: Sonnet**

Logika murni, tertutup, sepenuhnya testable. Tidak ada JSX. TDD ketat.

### Task 1: Util `invoiceTotals.js` + unit test

**Files:**
- Create: `apps/bul-monitor/src/utils/invoiceTotals.js`
- Test: `apps/bul-monitor/src/utils/invoiceTotals.test.js`

**Interfaces:**
- Consumes: tidak ada (task pertama)
- Produces: tiga named export yang dipakai Fase 2 dan Fase 3:
  - `resolveSJInvoice(invoice: object, suratJalanList?: object[]) => { list: Array<{ sj: object, sumber: 'live'|'snapshot' }>, sjHilang: number }`
  - `hitungPotonganUJ(sjs?: object[]) => number`
  - `hitungTotalInvoice(invoice: object, suratJalanList?: object[]) => { subTotal: number, potonganUJ: number, totalAkhir: number, sumberUJ: 'live'|'campuran'|'snapshot', sjHilang: number }`

- [ ] **Step 1: Tulis test yang gagal**

Buat `apps/bul-monitor/src/utils/invoiceTotals.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { resolveSJInvoice, hitungPotonganUJ, hitungTotalInvoice } from './invoiceTotals.js';

const sjA = { id: 'sj-a', nomorSJ: '330002', qtyBongkar: 10, uangJalan: 500000 };
const sjB = { id: 'sj-b', nomorSJ: '330015', qtyBongkar: 5, uangJalan: 300000 };

// Snapshot sengaja memuat uangJalan lama yang berbeda dari live,
// supaya test membuktikan live yang menang.
const invoice = {
  id: 'INV-1',
  totalNilai: 2000000,
  suratJalanIds: ['sj-a', 'sj-b'],
  suratJalanList: [
    { ...sjA, uangJalan: 111111 },
    { ...sjB, uangJalan: 222222 },
  ],
};

describe('hitungPotonganUJ', () => {
  it('menjumlahkan uangJalan', () => {
    expect(hitungPotonganUJ([sjA, sjB])).toBe(800000);
  });

  it('mengembalikan 0 untuk list kosong atau tidak diisi', () => {
    expect(hitungPotonganUJ([])).toBe(0);
    expect(hitungPotonganUJ()).toBe(0);
  });

  it('memperlakukan uangJalan hilang, null, dan string angka dengan benar', () => {
    expect(hitungPotonganUJ([{ id: 'x' }, { id: 'y', uangJalan: null }])).toBe(0);
    expect(hitungPotonganUJ([{ id: 'z', uangJalan: '250000' }])).toBe(250000);
  });
});

describe('resolveSJInvoice', () => {
  it('memakai SJ live saat tersedia', () => {
    const { list, sjHilang } = resolveSJInvoice(invoice, [sjA, sjB]);
    expect(sjHilang).toBe(0);
    expect(list).toHaveLength(2);
    expect(list.every(x => x.sumber === 'live')).toBe(true);
    expect(list[0].sj.uangJalan).toBe(500000);
  });

  it('jatuh ke snapshot untuk SJ yang tidak ada di live', () => {
    const { list, sjHilang } = resolveSJInvoice(invoice, [sjA]);
    expect(sjHilang).toBe(0);
    expect(list[0].sumber).toBe('live');
    expect(list[1].sumber).toBe('snapshot');
    expect(list[1].sj.uangJalan).toBe(222222);
  });

  it('menghitung SJ yang hilang di live maupun snapshot', () => {
    const inv = { ...invoice, suratJalanIds: ['sj-a', 'sj-hantu'], suratJalanList: [] };
    const { list, sjHilang } = resolveSJInvoice(inv, [sjA]);
    expect(list).toHaveLength(1);
    expect(sjHilang).toBe(1);
  });

  it('aman untuk invoice null dan argumen kedua tidak diisi', () => {
    expect(resolveSJInvoice(null)).toEqual({ list: [], sjHilang: 0 });
    expect(resolveSJInvoice({ suratJalanIds: [] })).toEqual({ list: [], sjHilang: 0 });
  });
});

describe('hitungTotalInvoice', () => {
  it('menghitung tiga angka kwitansi dari SJ live', () => {
    expect(hitungTotalInvoice(invoice, [sjA, sjB])).toEqual({
      subTotal: 2000000,
      potonganUJ: 800000,
      totalAkhir: 1200000,
      sumberUJ: 'live',
      sjHilang: 0,
    });
  });

  it('menandai sumberUJ campuran saat sebagian dari snapshot', () => {
    const hasil = hitungTotalInvoice(invoice, [sjA]);
    expect(hasil.potonganUJ).toBe(722222);
    expect(hasil.totalAkhir).toBe(1277778);
    expect(hasil.sumberUJ).toBe('campuran');
  });

  it('menandai sumberUJ snapshot saat semua dari snapshot', () => {
    const hasil = hitungTotalInvoice(invoice, []);
    expect(hasil.potonganUJ).toBe(333333);
    expect(hasil.sumberUJ).toBe('snapshot');
  });

  it('menganggap invoice tanpa SJ sebagai sumberUJ live dengan potongan 0', () => {
    const hasil = hitungTotalInvoice({ totalNilai: 500000, suratJalanIds: [] }, []);
    expect(hasil).toEqual({
      subTotal: 500000,
      potonganUJ: 0,
      totalAkhir: 500000,
      sumberUJ: 'live',
      sjHilang: 0,
    });
  });

  it('memperlakukan totalNilai hilang sebagai 0', () => {
    const hasil = hitungTotalInvoice({ suratJalanIds: ['sj-a'] }, [sjA]);
    expect(hasil.subTotal).toBe(0);
    expect(hasil.totalAkhir).toBe(-500000);
  });

  it('aman untuk invoice null', () => {
    expect(hitungTotalInvoice(null)).toEqual({
      subTotal: 0,
      potonganUJ: 0,
      totalAkhir: 0,
      sumberUJ: 'live',
      sjHilang: 0,
    });
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan GAGAL**

```bash
cd apps/bul-monitor && npm run test -- invoiceTotals
```

Expected: FAIL — `Failed to resolve import "./invoiceTotals.js"`.

- [ ] **Step 3: Tulis implementasi minimal**

Buat `apps/bul-monitor/src/utils/invoiceTotals.js`:

```js
/**
 * Satu-satunya sumber kebenaran untuk tiga angka kwitansi:
 * Sub Total (bruto) − Potongan Uang Jalan = Total Akhir (net).
 *
 * Kwitansi fisik di lapangan memakai format "SUB Total − Pengurangan UJ =
 * Total Akhir", sementara dokumen invoice di Firestore hanya menyimpan angka
 * bruto pada `totalNilai`. Uang jalan tinggal di dokumen Surat Jalan dan tidak
 * pernah diagregasi kecuali saat kirim ke accounting.
 *
 * Uang jalan diresolusi LIVE-FIRST: dokumen Surat Jalan yang sedang aktif
 * dipakai lebih dulu, snapshot `invoice.suratJalanList` hanya jadi cadangan.
 * Ini disengaja supaya angka yang tampil di layar identik dengan `totalUJ`
 * yang dihitung `integrationService.kirimInvoiceKeAccounting()` — kalau UI
 * memakai snapshot beku sementara jurnal memakai SJ live, kwitansi dan buku
 * besar akan berpisah diam-diam, persis bug yang util ini perbaiki.
 */

/**
 * Resolusi `suratJalanIds` sebuah invoice menjadi dokumen Surat Jalan.
 *
 * @param {object} invoice Dokumen invoice.
 * @param {object[]} [suratJalanList] Daftar Surat Jalan yang sedang aktif.
 * @returns {{ list: Array<{ sj: object, sumber: 'live'|'snapshot' }>, sjHilang: number }}
 */
export function resolveSJInvoice(invoice, suratJalanList = []) {
  const ids = invoice?.suratJalanIds || [];
  const snapshot = invoice?.suratJalanList || [];
  const snapshotById = new Map(snapshot.map((sj) => [sj?.id, sj]));

  const list = [];
  let sjHilang = 0;

  for (const id of ids) {
    const live = suratJalanList.find((sj) => sj?.id === id);
    if (live) {
      list.push({ sj: live, sumber: 'live' });
      continue;
    }
    const snap = snapshotById.get(id);
    if (snap) {
      list.push({ sj: snap, sumber: 'snapshot' });
      continue;
    }
    sjHilang += 1;
  }

  return { list, sjHilang };
}

/**
 * Jumlahkan uangJalan dari sederet dokumen Surat Jalan.
 *
 * @param {object[]} [sjs] Dokumen Surat Jalan.
 * @returns {number}
 */
export function hitungPotonganUJ(sjs = []) {
  return sjs.reduce((total, sj) => total + (Number(sj?.uangJalan) || 0), 0);
}

/**
 * Hitung tiga angka kwitansi untuk satu invoice tersimpan.
 *
 * `subTotal` selalu diambil apa adanya dari `invoice.totalNilai` — nilai itu
 * bruto dan menjadi dasar pengakuan pendapatan Cr 4100, jadi tidak boleh
 * dihitung ulang di sini.
 *
 * @param {object} invoice Dokumen invoice.
 * @param {object[]} [suratJalanList] Daftar Surat Jalan yang sedang aktif.
 * @returns {{ subTotal: number, potonganUJ: number, totalAkhir: number, sumberUJ: 'live'|'campuran'|'snapshot', sjHilang: number }}
 */
export function hitungTotalInvoice(invoice, suratJalanList = []) {
  const { list, sjHilang } = resolveSJInvoice(invoice, suratJalanList);

  const dariSnapshot = list.filter((x) => x.sumber === 'snapshot').length;
  const dariLive = list.length - dariSnapshot;

  let sumberUJ = 'campuran';
  if (dariSnapshot === 0) sumberUJ = 'live';
  else if (dariLive === 0) sumberUJ = 'snapshot';

  const subTotal = Number(invoice?.totalNilai) || 0;
  const potonganUJ = hitungPotonganUJ(list.map((x) => x.sj));

  return { subTotal, potonganUJ, totalAkhir: subTotal - potonganUJ, sumberUJ, sjHilang };
}
```

- [ ] **Step 4: Jalankan test, pastikan LULUS**

```bash
cd apps/bul-monitor && npm run test -- invoiceTotals
```

Expected: PASS, 13 test.

- [ ] **Step 5: Jalankan seluruh test dan build**

```bash
cd apps/bul-monitor && npm run test && npm run build
```

Expected: seluruh test PASS, build sukses.

- [ ] **Step 6: Commit**

```bash
git add apps/bul-monitor/src/utils/invoiceTotals.js apps/bul-monitor/src/utils/invoiceTotals.test.js && git commit -m "feat(bul-monitor): add invoiceTotals util for net kwitansi value"
```

**BERHENTI DI SINI.** Jangan mulai Fase 2. Lapor ke user dan sertakan prompt, model, serta effort untuk Fase 2.

---

# FASE 2 — Kartu Invoice & Export Excel (Task 2, Task 3)

**Effort: medium · Model: Sonnet**

Integrasi util ke `InvoiceManagement.jsx`. Dua task terpisah karena reviewer bisa menolak salah satunya tanpa menolak yang lain.

### Task 2: Tiga baris kwitansi di kartu invoice

**Files:**
- Modify: `apps/bul-monitor/src/components/InvoiceManagement.jsx` (import di baris 1-2, blok "Nilai Invoice" di baris 372-380)

**Interfaces:**
- Consumes: `hitungTotalInvoice(invoice, suratJalanList)` dari Task 1
- Produces: tidak ada API baru

Catatan: komponen sudah menerima prop `suratJalanList` (`InvoiceManagement.jsx:6`) dan sudah di-pass dari `App.jsx:3109`. Tidak perlu mengubah App.jsx.

- [ ] **Step 1: Tambahkan import**

Setelah baris 2 (`import { Send, Lock, ... } from 'lucide-react';`), sisipkan:

```js
import { hitungTotalInvoice } from '../utils/invoiceTotals.js';
```

- [ ] **Step 2: Ganti blok "Nilai Invoice"**

Cari blok persis ini (sekitar baris 372-380):

```jsx
                          <div>
                            <p className="text-gray-600">Nilai Invoice:</p>
                            <p className="font-bold text-blue-700">
                              Rp {Number(invoice.totalNilai || 0).toLocaleString('id-ID')}
                            </p>
                          </div>
```

Ganti seluruhnya dengan:

```jsx
                          <div>
                            {(() => {
                              const t = hitungTotalInvoice(invoice, suratJalanList);
                              return (
                                <>
                                  <div className="flex justify-between text-gray-600">
                                    <span>Sub Total:</span>
                                    <span className="font-semibold text-gray-800">
                                      Rp {t.subTotal.toLocaleString('id-ID')}
                                    </span>
                                  </div>
                                  <div className="flex justify-between text-gray-600">
                                    <span>Potongan Uang Jalan:</span>
                                    <span className="font-semibold text-orange-700">
                                      − Rp {t.potonganUJ.toLocaleString('id-ID')}
                                    </span>
                                  </div>
                                  <div className="flex justify-between border-t border-gray-200 mt-1 pt-1">
                                    <span className="text-gray-700 font-semibold">Total Akhir:</span>
                                    <span className="font-bold text-blue-700">
                                      Rp {t.totalAkhir.toLocaleString('id-ID')}
                                    </span>
                                  </div>
                                  {(t.sumberUJ !== 'live' || t.sjHilang > 0) && (
                                    <p className="text-xs text-amber-700 mt-1">
                                      ⚠️ Sebagian uang jalan diambil dari data arsip
                                      {t.sjHilang > 0 ? ` — ${t.sjHilang} Surat Jalan tidak ditemukan` : ''}.
                                    </p>
                                  )}
                                </>
                              );
                            })()}
                          </div>
```

- [ ] **Step 3: Verifikasi label lama sudah tergantikan**

```bash
cd apps/bul-monitor && grep -n "Nilai Invoice" src/components/InvoiceManagement.jsx
```

Expected: tidak ada hasil.

- [ ] **Step 4: Jalankan test dan build**

```bash
cd apps/bul-monitor && npm run test && npm run build
```

Expected: seluruh test PASS, build sukses.

- [ ] **Step 5: Commit**

```bash
git add apps/bul-monitor/src/components/InvoiceManagement.jsx && git commit -m "feat(bul-monitor): show Sub Total, Potongan Uang Jalan, Total Akhir on invoice card"
```

### Task 3: Export Excel memuat uang jalan dan tiga baris total

**Files:**
- Modify: `apps/bul-monitor/src/components/InvoiceManagement.jsx` (fungsi `exportInvoiceToExcel`, baris 96-129)

**Interfaces:**
- Consumes: `hitungTotalInvoice`, `resolveSJInvoice` dari Task 1
- Produces: tidak ada API baru

- [ ] **Step 1: Perluas import**

Ubah baris import yang ditambahkan di Task 2:

```js
import { hitungTotalInvoice } from '../utils/invoiceTotals.js';
```

menjadi:

```js
import { hitungTotalInvoice, resolveSJInvoice } from '../utils/invoiceTotals.js';
```

- [ ] **Step 2: Ganti isi `exportInvoiceToExcel`**

Ganti blok dari `const headers = [...]` sampai baris `csvContent += ...TOTAL...` (baris 97-119) dengan:

```js
    const headers = ['No SJ', 'Tgl SJ', 'No. Polisi', 'Nama Supir', 'Rute', 'Material', 'Qty Bongkar', 'Satuan', 'Harga/Satuan', 'Nilai', 'Uang Jalan'];
    const hargaSatuan = Number(invoice.hargaSatuan) || 0;
    const { list } = resolveSJInvoice(invoice, suratJalanList);
    const rows = list.map(({ sj }) => [
      sj.nomorSJ,
      new Date(sj.tanggalSJ).toLocaleDateString('id-ID'),
      sj.nomorPolisi,
      sj.namaSupir,
      sj.rute,
      sj.material,
      sj.qtyBongkar,
      sj.satuan,
      hargaSatuan,
      (Number(sj.qtyBongkar) || 0) * hargaSatuan,
      Number(sj.uangJalan) || 0
    ]);

    let csvContent = headers.join(';') + '\n';
    rows.forEach(row => {
      csvContent += row.join(';') + '\n';
    });
    const t = hitungTotalInvoice(invoice, suratJalanList);
    // 11 kolom: Qty Bongkar di kolom 7, Nilai di kolom 10.
    // Baris TOTAL yang lama meleset satu kolom; penomoran di bawah sudah dikoreksi.
    csvContent += `\nSUB TOTAL;;;;;;${invoice.totalQty.toFixed(2)};;;${t.subTotal}\n`;
    csvContent += `POTONGAN UANG JALAN;;;;;;;;;${t.potonganUJ}\n`;
    csvContent += `TOTAL AKHIR;;;;;;;;;${t.totalAkhir}`;
```

Penjelasan penomoran, supaya implementer bisa memverifikasi sendiri: header punya 11 kolom (`No SJ`=1 … `Qty Bongkar`=7 … `Nilai`=10 … `Uang Jalan`=11). `N` titik-koma menghasilkan `N+1` kolom. Jadi `SUB TOTAL` + 6 titik-koma menaruh `totalQty` di kolom 7, lalu 3 titik-koma menaruh `subTotal` di kolom 10. Dua baris berikutnya memakai 9 titik-koma agar nilainya jatuh di kolom 10 juga.

- [ ] **Step 3: Jalankan test dan build**

```bash
cd apps/bul-monitor && npm run test && npm run build
```

Expected: seluruh test PASS, build sukses.

- [ ] **Step 4: Commit**

```bash
git add apps/bul-monitor/src/components/InvoiceManagement.jsx && git commit -m "feat(bul-monitor): add uang jalan column and net total rows to invoice Excel export"
```

**BERHENTI DI SINI.** Jangan mulai Fase 3. Lapor ke user dan sertakan prompt, model, serta effort untuk Fase 3.

---

# FASE 3 — Preview Modal Buat/Edit Invoice (Task 4)

**Effort: high · Model: Sonnet**

Effort lebih tinggi karena JSX di `Modal.jsx` berada di dalam IIFE bercabang (grup tunggal vs multi grup) dengan indentasi dalam. Salah menempatkan kurung akan merusak render form invoice.

### Task 4: Ringkasan net di preview modal

**Files:**
- Modify: `apps/bul-monitor/src/components/Modal.jsx` (import baris 10, blok grup tunggal baris ~756-780, blok multi grup baris ~783-833)

**Interfaces:**
- Consumes: `hitungPotonganUJ(sjs)` dari Task 1
- Produces: tidak ada API baru

Catatan: `selectedSJs` sudah dihitung di dalam IIFE (`Modal.jsx:750`) sebagai `suratJalanList.filter(sj => formData.selectedSJIds.includes(sj.id))` — itu sudah SJ live, jadi tidak perlu fallback snapshot di sini (invoice belum tersimpan).

- [ ] **Step 1: Tambahkan import**

Setelah baris 10 (`import { isSJEligibleForInvoice } from '../utils/invoiceEligibility.js';`), sisipkan:

```js
import { hitungPotonganUJ } from '../utils/invoiceTotals.js';
```

- [ ] **Step 2: Grup tunggal — hitung potongan**

Cari baris:

```js
                  const totalNilai = totalQty * harga;
```

Ganti dengan:

```js
                  const totalNilai = totalQty * harga;
                  const potonganUJ = hitungPotonganUJ(selectedSJs);
```

- [ ] **Step 3: Grup tunggal — ganti ringkasan**

Cari blok persis ini:

```jsx
                      {formData.selectedSJIds.length > 0 && harga > 0 && (
                        <div className="mt-2 flex justify-between text-sm text-blue-700">
                          <span>Total Qty: <strong>{totalQty.toFixed(2)} {satuan}</strong></span>
                          <span>Nilai Invoice: <strong>Rp {totalNilai.toLocaleString('id-ID')}</strong></span>
                        </div>
                      )}
```

Ganti dengan:

```jsx
                      {formData.selectedSJIds.length > 0 && harga > 0 && (
                        <div className="mt-2 space-y-1 text-sm text-blue-700">
                          <div className="flex justify-between">
                            <span>Total Qty</span>
                            <strong>{totalQty.toFixed(2)} {satuan}</strong>
                          </div>
                          <div className="flex justify-between">
                            <span>Sub Total</span>
                            <strong>Rp {totalNilai.toLocaleString('id-ID')}</strong>
                          </div>
                          <div className="flex justify-between text-orange-700">
                            <span>Potongan Uang Jalan</span>
                            <strong>− Rp {potonganUJ.toLocaleString('id-ID')}</strong>
                          </div>
                          <div className="flex justify-between border-t border-blue-200 pt-1 text-blue-900">
                            <span className="font-semibold">Total Akhir</span>
                            <strong>Rp {(totalNilai - potonganUJ).toLocaleString('id-ID')}</strong>
                          </div>
                        </div>
                      )}
```

- [ ] **Step 4: Multi grup — hitung potongan**

Cari baris:

```js
                let totalNilaiAll = 0;
```

Ganti dengan:

```js
                let totalNilaiAll = 0;
                const potonganUJAll = hitungPotonganUJ(selectedSJs);
```

- [ ] **Step 5: Multi grup — ganti ringkasan total**

Cari blok persis ini:

```jsx
                    {totalNilaiAll > 0 && (
                      <div className="flex justify-end text-sm text-blue-700 font-semibold border-t border-blue-200 pt-2">
                        Total Nilai Invoice: Rp {totalNilaiAll.toLocaleString('id-ID')}
                      </div>
                    )}
```

Ganti dengan:

```jsx
                    {totalNilaiAll > 0 && (
                      <div className="space-y-1 text-sm text-blue-700 border-t border-blue-200 pt-2">
                        <div className="flex justify-between">
                          <span>Sub Total</span>
                          <strong>Rp {totalNilaiAll.toLocaleString('id-ID')}</strong>
                        </div>
                        <div className="flex justify-between text-orange-700">
                          <span>Potongan Uang Jalan</span>
                          <strong>− Rp {potonganUJAll.toLocaleString('id-ID')}</strong>
                        </div>
                        <div className="flex justify-between border-t border-blue-200 pt-1 text-blue-900">
                          <span className="font-semibold">Total Akhir</span>
                          <strong>Rp {(totalNilaiAll - potonganUJAll).toLocaleString('id-ID')}</strong>
                        </div>
                      </div>
                    )}
```

- [ ] **Step 6: Verifikasi label lama sudah hilang**

```bash
cd apps/bul-monitor && grep -n "Nilai Invoice" src/components/Modal.jsx
```

Expected: tidak ada hasil.

- [ ] **Step 7: Jalankan test dan build**

```bash
cd apps/bul-monitor && npm run test && npm run build
```

Expected: seluruh test PASS, build sukses. Build yang gagal di sini hampir selalu berarti kurung JSX tidak seimbang — periksa ulang Step 3 dan Step 5.

- [ ] **Step 8: Commit**

```bash
git add apps/bul-monitor/src/components/Modal.jsx && git commit -m "feat(bul-monitor): show net kwitansi breakdown in invoice create/edit modal"
```

**BERHENTI DI SINI.** Jangan mulai Fase 4. Lapor ke user dan sertakan prompt, model, serta effort untuk Fase 4.

---

# FASE 4 — Verifikasi & Serah Terima (Task 5)

**Effort: low · Model: Haiku**

Tidak ada penulisan kode fitur. Hanya verifikasi, pemeriksaan batas cakupan, dan PR.

### Task 5: Verifikasi akhir dan buka PR

**Files:**
- Modify: tidak ada file sumber

**Interfaces:**
- Consumes: seluruh hasil Fase 1-3
- Produces: satu PR draft

- [ ] **Step 1: Buktikan tidak ada file terlarang yang tersentuh**

```bash
git diff --name-only main...HEAD
```

Expected: **hanya** enam file berikut. Bila ada file lain — terutama `src/App.jsx`, `src/integrationService.js`, atau apa pun di `apps/bul-accounting/` — HENTIKAN dan lapor ke user.

```
apps/bul-monitor/src/components/InvoiceManagement.jsx
apps/bul-monitor/src/components/Modal.jsx
apps/bul-monitor/src/utils/invoiceTotals.js
apps/bul-monitor/src/utils/invoiceTotals.test.js
docs/superpowers/plans/2026-08-26-bul-monitor-kwitansi-nilai-net.md
docs/superpowers/specs/2026-08-26-bul-monitor-kwitansi-nilai-net-design.md
```

- [ ] **Step 2: Buktikan `totalNilai` masih ditulis bruto**

```bash
cd apps/bul-monitor && grep -n "totalNilai = " src/App.jsx
```

Expected: `totalNilai` masih dihitung `qtyBongkar × harga` tanpa pengurangan apa pun (baris 846, 850, 964, 968). Bila ada tanda minus, HENTIKAN dan lapor.

- [ ] **Step 3: Validasi penuh dari nol**

```bash
cd apps/bul-monitor && npm run test && npm run build
```

Expected: seluruh test PASS, build sukses. Catat jumlah test dan waktu build sebagai bukti.

- [ ] **Step 4: Push branch**

```bash
git push -u origin HEAD
```

- [ ] **Step 5: Buka PR draft**

Buat PR draft dengan `gh pr create --draft --base main --title "feat(bul-monitor): tampilkan nilai kwitansi net (Sub Total − Uang Jalan)"` dan body yang memuat:

- **Ringkasan:** nilai tagihan invoice kini tampil `Sub Total − Potongan Uang Jalan = Total Akhir`, sesuai kwitansi fisik. Sebelumnya hanya bruto.
- **Perubahan:** util baru `src/utils/invoiceTotals.js` (uang jalan live-first, fallback snapshot, sehingga angka UI identik dengan `totalUJ` di bridge accounting); kartu invoice, preview modal, dan export Excel memakai util yang sama; 14 unit test baru.
- **Tidak berubah:** `invoice.totalNilai` tetap tersimpan bruto (dasar `Cr 4100`); tanpa perubahan schema, migrasi, atau backfill; `App.jsx`, `integrationService.js`, dan seluruh `apps/bul-accounting` tidak tersentuh.
- **Di luar cakupan:** bug subledger AR bruto di bul-accounting (`integrationUtils.js:117`) ditangani spec terpisah.
- **Validasi:** hasil `npm run test` dan `npm run build` dari `apps/bul-monitor`.
- Tutup dengan baris `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

- [ ] **Step 6: Serahkan ke user**

Lapor: URL PR, daftar file yang berubah, hasil test dan build, serta daftar skenario uji manual yang masih perlu user lakukan di UI:

1. Buka Invoice Management → tab "Sudah Terinvoice" → cek kartu menampilkan tiga baris dan Total Akhir cocok dengan kwitansi fisik.
2. Buat invoice baru dengan satu material/rute → cek ringkasan tiga baris di modal.
3. Buat invoice dengan dua material/rute berbeda → cek ringkasan multi grup.
4. Export Excel satu invoice → cek kolom `Uang Jalan` dan tiga baris total.
5. Bandingkan Total Akhir satu invoice dengan `piutangNet` invoice yang sama di bul-accounting → harus sama persis.
