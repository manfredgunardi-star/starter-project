# Edit SJ + Cascade (Superadmin-Only) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Beri superadmin kemampuan mengedit semua field `surat_jalan` dan mencascade perubahan secara atomic & teraudit ke transaksi, invoice, dan data terkait, dengan pola preview→confirm→write.

**Architecture:** Pendekatan A — pisahkan perhitungan dampak (pure, testable) dari eksekusi (Firestore `writeBatch`). `computeCascadePlan()` menghasilkan preview tanpa menulis; `executeCascadePlan()` menulis atomic + audit. Formula total invoice diekstrak ke util bersama agar tidak ada formula uang baru.

**Tech Stack:** React 18, Firebase Firestore (`writeBatch`), Vitest 4 + Testing Library, ESLint 9, Tailwind (Liquid Glass design system), Framer Motion.

**Spec:** `docs/superpowers/specs/2026-06-05-edit-sj-cascade-design.md`

---

## Model & Effort Guidance

Setiap task punya rekomendasi **model + effort** untuk dua engine. Eksekutor **boleh menaikkan/menurunkan** effort jika menganggap task lebih/kurang berat dari estimasi — anotasi ini titik awal, bukan kunci mati.

| Engine | Model berat (kompleks/finansial/security) | Model ringan (mekanis/UI/glue) |
|---|---|---|
| **Claude** | Opus 4.8 (`claude-opus-4-8`) | Sonnet 4.6 (`claude-sonnet-4-6`) |
| **Codex** | GPT‑5.5 (reasoning: high) | GPT‑5.4 (reasoning: medium) |

**Effort scale:** `low` (mekanis, pola jelas) · `medium` (perlu desain lokal) · `high` (logika finansial/keamanan, ketelitian tinggi, banyak edge case).

**Assignment** menunjukkan siapa yang mengerjakan task. Task milik **Codex** disertai **prompt copy‑paste** di akhir task.

---

## File Structure

- Create `apps/sj-monitor/src/utils/invoiceTotals.js` — formula total invoice (ekstraksi, behavior-preserving).
- Create `apps/sj-monitor/src/utils/__tests__/invoiceTotals.test.js`
- Create `apps/sj-monitor/src/utils/sjCascadeHelpers.js` — diff field + recompute denormalisasi.
- Create `apps/sj-monitor/src/utils/__tests__/sjCascadeHelpers.test.js`
- Create `apps/sj-monitor/src/services/sjCascadeService.js` — `computeCascadePlan` + `executeCascadePlan`.
- Create `apps/sj-monitor/src/services/__tests__/sjCascadeService.test.js`
- Create `apps/sj-monitor/src/components/EditSJModal.jsx` — UI form + preview.
- Modify `apps/sj-monitor/src/App.jsx` — pakai `invoiceTotals.js`; tombol+state+handler Edit SJ.
- Modify `apps/sj-monitor/firestore.rules` — superadmin-only full edit; admin_sj dibatasi.

---

## Task 1: Ekstrak formula total invoice (DRY, behavior-preserving)

> **Execute with:** Claude — Opus 4.8, effort **high** · Alt (Codex): GPT‑5.5, reasoning **high**
> **Why this effort:** menyentuh formula uang invoice — wajib identik dengan perilaku lama (guardrail keuangan).
> **Assignment:** **Claude (this session)**

**Files:**
- Create: `apps/sj-monitor/src/utils/invoiceTotals.js`
- Test: `apps/sj-monitor/src/utils/__tests__/invoiceTotals.test.js`
- Modify: `apps/sj-monitor/src/App.jsx` (ganti inline formula di `addInvoice` ~542-581 & `editInvoice` ~660-700 dengan pemanggilan helper)

- [ ] **Step 1: Tulis failing test**

```js
// apps/sj-monitor/src/utils/__tests__/invoiceTotals.test.js
import { describe, it, expect } from 'vitest';
import { computeInvoiceTotals } from '../invoiceTotals.js';

const sjs = [
  { id: 'SJ-1', rute: 'A-B', qtyBongkar: 10 },
  { id: 'SJ-2', rute: 'A-B', qtyBongkar: 5 },
  { id: 'SJ-3', rute: 'A-C', qtyBongkar: 4 },
];
const ruteHarga = { 'A-B': 1000, 'A-C': 2000 };
const uangMuka = [{ sjId: 'SJ-1', jumlah: 3000 }, { sjId: 'SJ-3', jumlah: 1000 }];

describe('computeInvoiceTotals', () => {
  it('menghitung totalQty, totalHarga, totalUM, totalHargaAfterUM', () => {
    const r = computeInvoiceTotals(sjs, ruteHarga, uangMuka);
    expect(r.totalQty).toBe(19);
    expect(r.totalHarga).toBe(15 * 1000 + 4 * 2000); // 23000
    expect(r.totalUM).toBe(4000);
    expect(r.totalHargaAfterUM).toBe(23000 - 4000);
  });

  it('aman saat input kosong/null', () => {
    const r = computeInvoiceTotals([], {}, []);
    expect(r).toEqual({ totalQty: 0, totalHarga: 0, totalUM: 0, totalHargaAfterUM: 0 });
  });
});
```

- [ ] **Step 2: Jalankan test — harus FAIL**

Run: `cd apps/sj-monitor && npx vitest run src/utils/__tests__/invoiceTotals.test.js`
Expected: FAIL — `computeInvoiceTotals is not a function` / module not found.

- [ ] **Step 3: Implementasi minimal (copy formula PERSIS dari App.jsx)**

```js
// apps/sj-monitor/src/utils/invoiceTotals.js
// Formula diekstrak verbatim dari App.jsx addInvoice (542-581). JANGAN ubah aritmetika.
export function computeInvoiceTotals(selectedSJs = [], ruteHarga = {}, uangMukaList = []) {
  const sjs = selectedSJs || [];
  const totalQty = sjs.reduce((sum, sj) => sum + Number(sj.qtyBongkar || 0), 0);

  const ruteQtys = {};
  sjs.forEach((sj) => {
    if (!ruteQtys[sj.rute]) ruteQtys[sj.rute] = 0;
    ruteQtys[sj.rute] += Number(sj.qtyBongkar || 0);
  });
  const totalHarga = Object.entries(ruteHarga || {}).reduce(
    (sum, [rute, harga]) => sum + (ruteQtys[rute] || 0) * Number(harga || 0),
    0
  );

  const totalUM = sjs.reduce((sum, sj) => {
    const umForSJ = (uangMukaList || []).filter((um) => um.sjId === sj.id);
    return sum + umForSJ.reduce((s, um) => s + Number(um.jumlah || 0), 0);
  }, 0);

  return { totalQty, totalHarga, totalUM, totalHargaAfterUM: totalHarga - totalUM };
}
```

- [ ] **Step 4: Jalankan test — harus PASS**

Run: `cd apps/sj-monitor && npx vitest run src/utils/__tests__/invoiceTotals.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Refactor App.jsx pakai helper (behavior-preserving)**

Di `apps/sj-monitor/src/App.jsx`: `import { computeInvoiceTotals } from './utils/invoiceTotals.js';` lalu ganti blok IIFE `totalQty`/`totalHarga`/`totalUM`/`totalHargaAfterUM` di `addInvoice` (~542-581) dan `editInvoice` (~660-700) dengan:

```js
// contoh di addInvoice — selectedSJs sudah ada di scope
const { totalQty, totalHarga, totalUM, totalHargaAfterUM } =
  computeInvoiceTotals(
    suratJalanList.filter(sj => data.selectedSJIds.includes(sj.id)),
    data.ruteHarga || {},
    uangMukaList
  );
```
Sisipkan keempat nilai ke object invoice (`totalQty,` dst). Hapus IIFE lama.

- [ ] **Step 6: Validasi build + test**

Run: `cd apps/sj-monitor && npx vitest run && npm run build`
Expected: semua test PASS, build 0 error. (Verifikasi nilai invoice tidak berubah secara manual jika ragu.)

- [ ] **Step 7: Commit**

```bash
git add apps/sj-monitor/src/utils/invoiceTotals.js apps/sj-monitor/src/utils/__tests__/invoiceTotals.test.js apps/sj-monitor/src/App.jsx
git commit -m "refactor(sj-monitor): extract computeInvoiceTotals helper (DRY, behavior-preserving)"
```

---

## Task 2: Helper diff field + recompute denormalisasi

> **Execute with:** Claude — Opus 4.8, effort **medium** · Alt (Codex): GPT‑5.4, reasoning **medium**
> **Why:** logika pure murni, pola jelas; tapi harus cermin persis `addSuratJalan`.
> **Assignment:** **Claude (this session)**

**Files:**
- Create: `apps/sj-monitor/src/utils/sjCascadeHelpers.js`
- Test: `apps/sj-monitor/src/utils/__tests__/sjCascadeHelpers.test.js`

- [ ] **Step 1: Tulis failing test**

```js
import { describe, it, expect } from 'vitest';
import { diffSJFields, recomputeDenormalizedSJ, EDITABLE_SJ_FIELDS } from '../sjCascadeHelpers.js';

const masters = {
  truckList: [{ id: 'T1', nomorPolisi: 'B 1' }, { id: 'T2', nomorPolisi: 'B 2' }],
  supirList: [{ id: 'S1', namaSupir: 'Budi', pt: 'PT A' }, { id: 'S2', namaSupir: 'Andi', pt: 'PT B' }],
  ruteList:  [{ id: 'R1', rute: 'A-B', uangJalan: 100 }, { id: 'R2', rute: 'A-C', uangJalan: 200 }],
  materialList: [{ id: 'M1', material: 'Pasir', satuan: 'm3' }, { id: 'M2', material: 'Batu', satuan: 'ton' }],
};
const baseSJ = {
  id: 'SJ-1', nomorSJ: '001', tanggalSJ: '2026-06-01',
  truckId: 'T1', nomorPolisi: 'B 1', supirId: 'S1', namaSupir: 'Budi', pt: 'PT A',
  ruteId: 'R1', rute: 'A-B', uangJalan: 100, materialId: 'M1', material: 'Pasir', satuan: 'm3',
  qtyIsi: 10, qtyBongkar: 9, status: 'terkirim',
};

describe('recomputeDenormalizedSJ', () => {
  it('menghitung ulang field turunan dari master saat ID berubah', () => {
    const out = recomputeDenormalizedSJ({ ...baseSJ, ruteId: 'R2', supirId: 'S2' }, masters);
    expect(out.rute).toBe('A-C');
    expect(out.uangJalan).toBe(200);
    expect(out.namaSupir).toBe('Andi');
    expect(out.pt).toBe('PT B');
    // field non-master tidak berubah
    expect(out.qtyBongkar).toBe(9);
  });
});

describe('diffSJFields', () => {
  it('hanya melaporkan field yang benar-benar berubah', () => {
    const after = recomputeDenormalizedSJ({ ...baseSJ, ruteId: 'R2' }, masters);
    const d = diffSJFields(baseSJ, after);
    const fields = d.map(x => x.field).sort();
    expect(fields).toEqual(['rute', 'ruteId', 'uangJalan'].sort());
    expect(d.find(x => x.field === 'uangJalan')).toMatchObject({ before: 100, after: 200 });
  });

  it('EDITABLE_SJ_FIELDS memuat field identity & master & operasional', () => {
    ['nomorSJ','tanggalSJ','ruteId','supirId','truckId','materialId','qtyIsi','qtyBongkar','status']
      .forEach(f => expect(EDITABLE_SJ_FIELDS).toContain(f));
  });
});
```

- [ ] **Step 2: Jalankan test — FAIL**

Run: `cd apps/sj-monitor && npx vitest run src/utils/__tests__/sjCascadeHelpers.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implementasi**

```js
// apps/sj-monitor/src/utils/sjCascadeHelpers.js

// Field yang boleh diedit superadmin (identity + master-linked + operasional).
export const EDITABLE_SJ_FIELDS = [
  'nomorSJ', 'tanggalSJ',
  'truckId', 'supirId', 'ruteId', 'materialId',
  'qtyIsi', 'qtyBongkar', 'status', 'tglTerkirim', 'quantityLoss', 'abolishPenalty',
];

// Recompute field denormalisasi dari master — cermin addSuratJalan (App.jsx:1408-1427).
export function recomputeDenormalizedSJ(sj, masters) {
  const { truckList = [], supirList = [], ruteList = [], materialList = [] } = masters || {};
  const truck = truckList.find(t => t.id === sj.truckId);
  const supir = supirList.find(s => s.id === sj.supirId);
  const rute = ruteList.find(r => r.id === sj.ruteId);
  const material = materialList.find(m => m.id === sj.materialId);
  return {
    ...sj,
    nomorPolisi: truck?.nomorPolisi ?? sj.nomorPolisi ?? '',
    namaSupir: supir?.namaSupir ?? sj.namaSupir ?? '',
    pt: supir?.pt ?? sj.pt ?? '',
    rute: rute?.rute ?? sj.rute ?? '',
    uangJalan: rute ? Number(rute.uangJalan || 0) : Number(sj.uangJalan || 0),
    material: material?.material ?? sj.material ?? '',
    satuan: material?.satuan ?? sj.satuan ?? '',
  };
}

// Diff dangkal antar dua SJ. Mengembalikan [{field, before, after}].
export function diffSJFields(oldSJ, newSJ) {
  const keys = new Set([...Object.keys(oldSJ || {}), ...Object.keys(newSJ || {})]);
  const out = [];
  keys.forEach((k) => {
    if (k === 'updatedAt' || k === 'updatedBy') return;
    const a = oldSJ?.[k];
    const b = newSJ?.[k];
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ field: k, before: a, after: b });
  });
  return out;
}
```

- [ ] **Step 4: Jalankan test — PASS**

Run: `cd apps/sj-monitor && npx vitest run src/utils/__tests__/sjCascadeHelpers.test.js`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
cd apps/sj-monitor && npm run lint
git add apps/sj-monitor/src/utils/sjCascadeHelpers.js apps/sj-monitor/src/utils/__tests__/sjCascadeHelpers.test.js
git commit -m "feat(sj-monitor): add SJ cascade helpers (diff + denormalize recompute)"
```

---

## Task 3: `computeCascadePlan` — preview engine (no write)

> **Execute with:** Claude — Opus 4.8, effort **high** · Alt (Codex): GPT‑5.5, reasoning **high**
> **Why:** inti cascade finansial, banyak edge case (gagal, terinvoice, UJ create/update/delete).
> **Assignment:** **Claude (this session)**

**Files:**
- Create: `apps/sj-monitor/src/services/sjCascadeService.js`
- Test: `apps/sj-monitor/src/services/__tests__/sjCascadeService.test.js`

- [ ] **Step 1: Tulis failing test**

```js
import { describe, it, expect } from 'vitest';
import { computeCascadePlan } from '../sjCascadeService.js';

const masters = {
  truckList: [{ id: 'T1', nomorPolisi: 'B 1' }],
  supirList: [{ id: 'S1', namaSupir: 'Budi', pt: 'PT A' }],
  ruteList:  [{ id: 'R1', rute: 'A-B', uangJalan: 100 }, { id: 'R2', rute: 'A-C', uangJalan: 250 }],
  materialList: [{ id: 'M1', material: 'Pasir', satuan: 'm3' }],
};
const sj = {
  id: 'SJ-1', nomorSJ: '001', tanggalSJ: '2026-06-01', truckId: 'T1', nomorPolisi: 'B 1',
  supirId: 'S1', namaSupir: 'Budi', pt: 'PT A', ruteId: 'R1', rute: 'A-B', uangJalan: 100,
  materialId: 'M1', material: 'Pasir', satuan: 'm3', qtyIsi: 10, qtyBongkar: 9, status: 'terkirim', isActive: true,
};
const ctx = {
  masters,
  transaksiList: [{ id: 'TX-UJ-SJ-1', suratJalanId: 'SJ-1', nominal: 100, keterangan: 'Uang Jalan - 001 (A-B)', tanggal: '2026-06-01', isActive: true }],
  invoiceList: [], uangMukaList: [], biayaList: [],
};

describe('computeCascadePlan', () => {
  it('mengubah rute → recompute SJ + impact transaksi uang jalan, tanpa menulis', () => {
    const plan = computeCascadePlan(sj, { ruteId: 'R2' }, ctx);
    expect(plan.sjAfter.rute).toBe('A-C');
    expect(plan.sjAfter.uangJalan).toBe(250);
    const tx = plan.impacts.find(i => i.collection === 'transaksi');
    expect(tx.op).toBe('update');
    expect(tx.changes.find(c => c.field === 'nominal')).toMatchObject({ before: 100, after: 250 });
  });

  it('status → gagal: transaksi uang jalan di-soft-delete', () => {
    const plan = computeCascadePlan(sj, { status: 'gagal' }, ctx);
    const tx = plan.impacts.find(i => i.collection === 'transaksi');
    expect(tx.op).toBe('softDelete');
  });

  it('SJ terinvoice → ada warning + impact invoice (finance)', () => {
    const ctx2 = {
      ...ctx,
      invoiceList: [{ id: 'INV-9', noInvoice: 'INV-9', statusInvoice: 'terinvoice', suratJalanIds: ['SJ-1'],
        ruteHarga: { 'A-B': 1000, 'A-C': 1000 }, suratJalanList: [sj] }],
    };
    const plan = computeCascadePlan(sj, { qtyBongkar: 12 }, ctx2);
    expect(plan.warnings.join(' ')).toMatch(/INV-9/);
    const inv = plan.impacts.find(i => i.collection === 'invoice');
    expect(inv.severity).toBe('finance');
  });
});
```

- [ ] **Step 2: Jalankan test — FAIL**

Run: `cd apps/sj-monitor && npx vitest run src/services/__tests__/sjCascadeService.test.js`
Expected: FAIL — `computeCascadePlan is not a function`.

- [ ] **Step 3: Implementasi `computeCascadePlan`**

```js
// apps/sj-monitor/src/services/sjCascadeService.js
import { recomputeDenormalizedSJ, diffSJFields } from '../utils/sjCascadeHelpers.js';
import { computeInvoiceTotals } from '../utils/invoiceTotals.js';

const buildUJId = (sjId) => `TX-UJ-${String(sjId)}`;
const ujKeterangan = (sj) => `Uang Jalan - ${sj.nomorSJ} (${sj.rute || ''})`;

export function computeCascadePlan(oldSJ, changes, ctx) {
  const { masters, transaksiList = [], invoiceList = [], uangMukaList = [], biayaList = [] } = ctx || {};

  const merged = { ...oldSJ, ...changes };
  const sjAfter = recomputeDenormalizedSJ(merged, masters);
  const fieldChanges = diffSJFields(oldSJ, sjAfter);

  const impacts = [];
  const warnings = [];

  // --- Transaksi Uang Jalan ---
  const ujId = buildUJId(oldSJ.id);
  const existingUJ = transaksiList.find((t) => t.id === ujId);
  const statusAfter = String(sjAfter.status || '').toLowerCase();
  const nominalAfter = Number(sjAfter.uangJalan || 0);
  const ujInactive = statusAfter === 'gagal' || sjAfter.isActive === false || !(nominalAfter > 0);

  if (existingUJ && ujInactive) {
    impacts.push({ collection: 'transaksi', docId: ujId, label: 'Transaksi Uang Jalan',
      op: 'softDelete', severity: 'finance',
      changes: [{ field: 'isActive', before: existingUJ.isActive !== false, after: false }] });
  } else if (!ujInactive) {
    const changesUJ = [];
    if (Number(existingUJ?.nominal || 0) !== nominalAfter) changesUJ.push({ field: 'nominal', before: Number(existingUJ?.nominal || 0), after: nominalAfter });
    const ketAfter = ujKeterangan(sjAfter);
    if ((existingUJ?.keterangan || '') !== ketAfter) changesUJ.push({ field: 'keterangan', before: existingUJ?.keterangan || '', after: ketAfter });
    if ((existingUJ?.tanggal || '') !== sjAfter.tanggalSJ) changesUJ.push({ field: 'tanggal', before: existingUJ?.tanggal || '', after: sjAfter.tanggalSJ });
    if (changesUJ.length) {
      impacts.push({ collection: 'transaksi', docId: ujId, label: 'Transaksi Uang Jalan',
        op: existingUJ ? 'update' : 'create', severity: 'finance', changes: changesUJ });
    }
  }

  // --- Invoice (snapshot + total) ---
  invoiceList.forEach((inv) => {
    const ids = inv.suratJalanIds || [];
    if (!ids.includes(oldSJ.id)) return;
    const newSJList = (inv.suratJalanList || []).map((s) => (s.id === oldSJ.id ? sjAfter : s));
    const before = computeInvoiceTotals(inv.suratJalanList || [], inv.ruteHarga || {}, uangMukaList);
    const after = computeInvoiceTotals(newSJList, inv.ruteHarga || {}, uangMukaList);
    const changes = [];
    ['totalQty', 'totalHarga', 'totalUM', 'totalHargaAfterUM'].forEach((k) => {
      if (Number(before[k]) !== Number(after[k])) changes.push({ field: k, before: before[k], after: after[k] });
    });
    impacts.push({ collection: 'invoice', docId: inv.id, label: `Invoice ${inv.noInvoice || inv.id}`,
      op: 'update', severity: 'finance', changes, newSJList, newTotals: after });
    warnings.push(`SJ ini sudah masuk Invoice ${inv.noInvoice || inv.id}. Mengedit akan mengubah snapshot & total tagihan.`);
  });

  // --- Payslip (computed, no write) ---
  if (fieldChanges.some((c) => ['ruteId', 'supirId', 'qtyBongkar', 'status', 'uangJalan'].includes(c.field))) {
    warnings.push('Perhitungan gaji supir (payslip) untuk periode ini akan ikut berubah.');
  }

  return { sjId: oldSJ.id, sjBefore: oldSJ, sjAfter, fieldChanges, impacts, warnings };
}
```

- [ ] **Step 4: Jalankan test — PASS**

Run: `cd apps/sj-monitor && npx vitest run src/services/__tests__/sjCascadeService.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Lint + commit**

```bash
cd apps/sj-monitor && npm run lint
git add apps/sj-monitor/src/services/sjCascadeService.js apps/sj-monitor/src/services/__tests__/sjCascadeService.test.js
git commit -m "feat(sj-monitor): add computeCascadePlan preview engine"
```

---

## Task 4: `executeCascadePlan` — atomic write + audit

> **Execute with:** Claude — Opus 4.8, effort **high** · Alt (Codex): GPT‑5.5, reasoning **high**
> **Why:** menulis ke Firestore (uang), atomicity & audit kritikal.
> **Assignment:** **Claude (this session)**

**Files:**
- Modify: `apps/sj-monitor/src/services/sjCascadeService.js`
- Modify: `apps/sj-monitor/src/services/__tests__/sjCascadeService.test.js`

- [ ] **Step 1: Tulis failing test (mock writeBatch)**

```js
import { describe, it, expect, vi } from 'vitest';

const batchMock = { set: vi.fn(), update: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) };
vi.mock('firebase/firestore', () => ({
  writeBatch: () => batchMock,
  doc: (_db, col, id) => ({ col, id }),
  collection: (_db, col) => ({ col }),
}));
vi.mock('../../config/firebase-config.js', () => ({ db: {}, ensureAuthed: vi.fn().mockResolvedValue(undefined) }));

import { executeCascadePlan } from '../sjCascadeService.js';

describe('executeCascadePlan', () => {
  it('menulis SJ + impact + history dalam satu batch lalu commit', async () => {
    const plan = {
      sjId: 'SJ-1', sjBefore: { id: 'SJ-1' }, sjAfter: { id: 'SJ-1', rute: 'A-C' },
      fieldChanges: [{ field: 'rute', before: 'A-B', after: 'A-C' }],
      impacts: [{ collection: 'transaksi', docId: 'TX-UJ-SJ-1', op: 'update', changes: [{ field: 'nominal', before: 100, after: 250 }] }],
      warnings: [],
    };
    await executeCascadePlan(plan, { currentUser: { name: 'Boss' } });
    expect(batchMock.set).toHaveBeenCalled();   // SJ + history_log
    expect(batchMock.update).toHaveBeenCalled(); // transaksi
    expect(batchMock.commit).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Jalankan — FAIL**

Run: `cd apps/sj-monitor && npx vitest run src/services/__tests__/sjCascadeService.test.js`
Expected: FAIL — `executeCascadePlan is not a function`.

- [ ] **Step 3: Implementasi**

Tambahkan di `sjCascadeService.js`:

```js
import { writeBatch, doc, collection } from 'firebase/firestore';
import { db, ensureAuthed } from '../config/firebase-config.js';
import { sanitizeForFirestore } from '../firestoreService.js';

export async function executeCascadePlan(plan, { currentUser } = {}) {
  await ensureAuthed();
  const who = currentUser?.name || 'superadmin';
  const nowIso = new Date().toISOString();
  const batch = writeBatch(db);

  // 1) SJ utama (merge)
  batch.set(doc(db, 'surat_jalan', plan.sjId),
    sanitizeForFirestore({ ...plan.sjAfter, updatedAt: nowIso, updatedBy: who }), { merge: true });

  // 2) Impact per collection
  plan.impacts.forEach((imp) => {
    const ref = doc(db, imp.collection, imp.docId);
    if (imp.op === 'softDelete') {
      batch.update(ref, sanitizeForFirestore({ isActive: false, deletedAt: nowIso, deletedBy: who, updatedAt: nowIso, updatedBy: who }));
    } else if (imp.collection === 'invoice') {
      batch.set(ref, sanitizeForFirestore({ suratJalanList: imp.newSJList, ...imp.newTotals, updatedAt: nowIso, updatedBy: who }), { merge: true });
    } else {
      const patch = { updatedAt: nowIso, updatedBy: who };
      imp.changes.forEach((c) => { patch[c.field] = c.after; });
      if (imp.op === 'create') batch.set(ref, sanitizeForFirestore(patch), { merge: true });
      else batch.update(ref, sanitizeForFirestore(patch));
    }
  });

  // 3) Audit trail (before/after) — history_log
  const logId = `LOG-EDITSJ-${plan.sjId}-${Date.now()}`;
  batch.set(doc(collection(db, 'history_log'), logId), sanitizeForFirestore({
    id: logId, action: 'edit_sj_cascade', suratJalanId: plan.sjId,
    suratJalanNo: plan.sjAfter?.nomorSJ || '',
    details: { fieldChanges: plan.fieldChanges, impacts: plan.impacts.map(i => ({ collection: i.collection, docId: i.docId, op: i.op, changes: i.changes })) },
    createdAt: nowIso, createdBy: who,
  }));

  await batch.commit();
}
```

- [ ] **Step 4: Jalankan — PASS**

Run: `cd apps/sj-monitor && npx vitest run src/services/__tests__/sjCascadeService.test.js`
Expected: PASS (4 tests total).

- [ ] **Step 5: Lint + commit**

```bash
cd apps/sj-monitor && npm run lint
git add apps/sj-monitor/src/services/sjCascadeService.js apps/sj-monitor/src/services/__tests__/sjCascadeService.test.js
git commit -m "feat(sj-monitor): add executeCascadePlan atomic writer with audit log"
```

---

## Task 5: `EditSJModal` — UI form + preview (HANDOFF KE CODEX)

> **Execute with:** Codex — GPT‑5.5, reasoning **medium** · Alt (Claude): Sonnet 4.6, effort **medium**
> **Why:** kerja UI mekanis mengikuti design system; interface ke service sudah jelas dari Task 3/4.
> **Assignment:** **Codex** (prompt copy‑paste di bawah)

**Files:**
- Create: `apps/sj-monitor/src/components/EditSJModal.jsx`

**Interface contract (yang dikonsumsi dari Task 3/4):**
- `computeCascadePlan(oldSJ, changes, ctx)` → `{ sjAfter, fieldChanges, impacts:[{collection,docId,label,op,severity,changes:[{field,before,after}]}], warnings:[] }`
- `executeCascadePlan(plan, { currentUser })` → Promise (atomic write)

**Spesifikasi komponen:**
- Props: `{ sj, masters:{truckList,supirList,ruteList,materialList}, ctx, currentUser, onClose, onDone }`.
  `ctx` = `{ masters, transaksiList, invoiceList, uangMukaList, biayaList }`.
- Dua tahap dalam satu modal:
  1. **Form** — input untuk `EDITABLE_SJ_FIELDS` (dropdown untuk truckId/supirId/ruteId/materialId pakai master; date untuk tanggalSJ/tglTerkirim; number untuk qty; select status). Tombol **"Lihat Dampak"**.
  2. **Preview** — panggil `computeCascadePlan`, tampilkan `fieldChanges`, daftar `impacts` (warna merah bila `severity==='finance'`), dan `warnings` (banner kuning tebal). Checkbox konfirmasi "Saya paham perubahan ini mengubah data keuangan terkait" + tombol **"Simpan & Terapkan"** (disabled sampai checkbox dicentang). Tombol Kembali ke form.
- Saat simpan: `await executeCascadePlan(plan, { currentUser })`, lalu `onDone(plan.sjAfter)`, lalu `onClose()`. Tangani error dengan alert.
- **Design system Liquid Glass** (lihat `apps/sj-monitor/CLAUDE.md`): `rounded-3xl backdrop-blur-xl bg-white/10 border border-white/20 shadow-2xl`, Framer Motion entry `{opacity:0,scale:0.97}→{1,1}` spring `{stiffness:150,damping:20}`.

- [ ] **Step 1:** Buat `EditSJModal.jsx` sesuai spesifikasi (form + preview + konfirmasi).
- [ ] **Step 2:** Pastикан import `computeCascadePlan`, `executeCascadePlan` dari `../services/sjCascadeService.js` dan `EDITABLE_SJ_FIELDS` dari `../utils/sjCascadeHelpers.js`.
- [ ] **Step 3:** `cd apps/sj-monitor && npm run build` → 0 error.
- [ ] **Step 4:** Commit `feat(sj-monitor): add EditSJModal (form + cascade preview UI)`.

---

## Task 6: Wiring di App.jsx (gate superadmin + handler)

> **Execute with:** Claude — Opus 4.8, effort **medium** · Alt (Codex): GPT‑5.5, reasoning **medium**
> **Why:** App.jsx monolitik; perlu konteks state lokal & pola role eksisting.
> **Assignment:** **Claude (this session)**

**Files:**
- Modify: `apps/sj-monitor/src/App.jsx`

- [ ] **Step 1:** Import `EditSJModal`. Tambah state `const [editSJTarget, setEditSJTarget] = useState(null);`.
- [ ] **Step 2:** Di kartu/aksi SJ, render tombol **Edit** hanya bila `effectiveRole === 'superadmin'` (pola sama dengan blok `effectiveRole === 'superadmin'` di App.jsx:2164/2323) yang memanggil `setEditSJTarget(sj)`.
- [ ] **Step 3:** Render modal saat `editSJTarget`:

```jsx
{editSJTarget && effectiveRole === 'superadmin' && (
  <EditSJModal
    sj={editSJTarget}
    masters={{ truckList, supirList, ruteList, materialList }}
    ctx={{ masters: { truckList, supirList, ruteList, materialList }, transaksiList, invoiceList, uangMukaList, biayaList }}
    currentUser={currentUser}
    onClose={() => setEditSJTarget(null)}
    onDone={(sjAfter) => {
      setSuratJalanList((prev) => prev.map((s) => (s.id === sjAfter.id ? { ...s, ...sjAfter } : s)));
    }}
  />
)}
```

- [ ] **Step 4:** `cd apps/sj-monitor && npm run build` → 0 error.
- [ ] **Step 5:** Commit `feat(sj-monitor): wire superadmin-only Edit SJ modal into App`.

---

## Task 7: `firestore.rules` — superadmin-only full edit

> **Execute with:** Claude — Opus 4.8, effort **high** · Alt (Codex): GPT‑5.5, reasoning **high**
> **Why:** Security Guardrail; salah whitelist bisa memblokir admin_sj atau membuka celah.
> **Assignment:** **Claude (this session)** — sudah disetujui user untuk menyentuh rules.

**Files:**
- Modify: `apps/sj-monitor/firestore.rules`

- [ ] **Step 1:** Tambah fungsi whitelist di dekat `sjInvoiceFieldsOnly()` (firestore.rules:34):

```
function sjOperationalFieldsOnly() {
  return request.resource.data.diff(resource.data).changedKeys().hasOnly([
    'status','tglTerkirim','qtyBongkar','quantityLoss','abolishPenalty',
    'bonusAdjustment','isActive','deletedUangJalan',
    'statusInvoice','invoiceId','invoiceNo','invoiceTanggal',
    'updatedAt','updatedBy'
  ]);
}
```

- [ ] **Step 2:** Ubah `allow update` pada `match /surat_jalan/{id}` (firestore.rules:115) dan mirror `match /suratJalan/{id}` (firestore.rules:123) menjadi:

```
allow update: if isSuperAdmin()
  || (isAdminSJ() && sjOperationalFieldsOnly())
  || (isAdminInv() && sjInvoiceFieldsOnly());
```

- [ ] **Step 3:** Tinjau ulang manual: pastikan field yang ditulis oleh `addSuratJalan` (create — tidak terpengaruh), `markTerkirim`/`editTerkirim` (`status,tglTerkirim,qtyBongkar,quantityLoss,abolishPenalty`), mark gagal/restore (`status,isActive,deletedUangJalan`), dan `savePayslipBonusAdjustments` (`bonusAdjustment`) semuanya ada di whitelist `sjOperationalFieldsOnly()`. ✅ sudah tercakup.
- [ ] **Step 4:** Commit `feat(sj-monitor): enforce superadmin-only full SJ edit in firestore.rules`.

> Deploy rules dilakukan user (production) / via smoke test staging. Claude TIDAK deploy production.

---

## Task 8: Validasi penuh + smoke test staging

> **Execute with:** Claude — Sonnet 4.6, effort **low** · Alt (Codex): GPT‑5.4, reasoning **low**
> **Why:** menjalankan perintah & verifikasi output; mekanis.
> **Assignment:** **Claude (this session)**

**Files:** none (validation only)

- [ ] **Step 1:** `cd apps/sj-monitor && npx vitest run` → semua test PASS.
- [ ] **Step 2:** `cd apps/sj-monitor && npm run lint` → 0 error.
- [ ] **Step 3:** `cd apps/sj-monitor && npm run build` → 0 error.
- [ ] **Step 4:** `cd apps/sj-monitor && npm run smoketest` → deploy staging, print `https://sj-monitor-staging.web.app`.
- [ ] **Step 5:** Smoke test manual di staging: (a) login superadmin → tombol Edit muncul, edit rute → preview menampilkan impact transaksi+invoice → simpan → cek data konsisten; (b) login admin_sj → tombol Edit tidak muncul, flow markTerkirim/gagal tetap jalan.
- [ ] **Step 6:** Commit catatan hasil (jika ada) & laporkan ke user. **JANGAN deploy production.**

---

## Self-Review (penulis plan)

- **Spec coverage:** semua bagian spec §3–§9 punya task (formula→T1, helper→T2, preview→T3, executor+audit→T4, UI→T5, gate→T6, rules→T7, validasi→T8). ✅
- **Placeholder scan:** tidak ada TBD/TODO; semua step berisi kode/perintah nyata. ✅
- **Type consistency:** `computeInvoiceTotals(sjList,ruteHarga,uangMukaList)`, `computeCascadePlan(oldSJ,changes,ctx)`, `executeCascadePlan(plan,{currentUser})`, `EDITABLE_SJ_FIELDS`, `recomputeDenormalizedSJ`, `diffSJFields` konsisten antar task. ✅
- **Risiko diketahui:** whitelist rules admin_sj (T7) berpotensi regresi — dimitigasi verifikasi manual T8 step 5b.
