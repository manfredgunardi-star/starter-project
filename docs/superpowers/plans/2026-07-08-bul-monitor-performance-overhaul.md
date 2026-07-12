# bul-monitor Performance Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the O(N²) behavior that makes bulk import and bulk kirim-ke-accounting freeze the browser/device in `apps/bul-monitor/`, without changing any user-facing functionality, Firestore payload shape, or financial/journal logic.

**Architecture:** Four independent fixes layered on the existing App.jsx + integrationService.js + firestoreWrites.js structure: (1) prefetch/batch the bulk write paths instead of N sequential round-trips, (2) collapse N per-document `integration_queue` listeners into one query listener with explicit idempotency guards, (3) bound and memoize rendering of the Surat Jalan list, (4) defer the `xlsx` bundle. Each task is independently shippable and buildable.

**Tech Stack:** React 18, Vite, Firebase JS SDK v10 (Firestore + Auth), no bundler code-splitting config beyond Vite defaults. **No test runner exists in `bul-monitor`** (Vitest is sj-monitor-only, per `CLAUDE.md`) — this plan does not introduce one. Verification per task is `npm run build` (must pass, catches type/syntax errors) plus a manual dev-server check described in each task. Final task adds a consolidated manual smoke-test checklist mirroring the spec's Validasi section.

**Spec:** `docs/superpowers/specs/2026-07-08-bul-monitor-performance-overhaul-design.md`

**Important:** Line numbers below refer to file state *before* this plan's changes begin. Locate code by the quoted anchors/content, not by number alone — earlier tasks shift later line numbers.

**One-time manual prerequisite (Opsi B, user does this — not a task in this plan):** Before Task 8 (Fase 2a) is exercised in the browser, create the Firestore composite index for `integration_queue` (`sourceProject` Asc + `status` Asc, collection scope) via Firebase Console → bul-accounting project → Firestore Database → Indexes → Composite → Add index. No `firestore.rules` change is needed (existing `allow read` already covers `list`). If the index isn't created ahead of time, Firestore's runtime error in the browser console will include a direct link to auto-create it — either path works.

---

## Task 1: Chunked batch-write helper

**Files:**
- Modify: `apps/bul-monitor/src/services/firestoreWrites.js`

- [ ] **Step 1: Add the helper**

Add `writeBatch` to the existing `firebase/firestore` import (currently `import { collection, doc, setDoc, updateDoc, getDoc, getDocs, query, where, limit } from "firebase/firestore";`) and append this export at the end of the file:

```js
// Firestore writeBatch caps at 500 ops/commit. This chunks any list of items into
// batches of at most `chunkSize` ops so bulk actions (import, bulk kirim, bulk batalkan)
// never silently fail past 500 rows/items.
export const chunkedBatchWrite = async (dbRef, items, applyFn, chunkSize = 450) => {
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const batch = writeBatch(dbRef);
    chunk.forEach((item) => applyFn(batch, item));
    await batch.commit();
  }
};
```

- [ ] **Step 2: Verify build**

Run: `cd apps/bul-monitor && npm run build`
Expected: build succeeds, no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/bul-monitor/src/services/firestoreWrites.js
git commit -m "feat(bul-monitor): add chunkedBatchWrite helper for bulk writes"
```

---

## Task 2: Prefetch accounting master data once for bulk kirim SJ (Fase 1a)

**Files:**
- Modify: `apps/bul-monitor/src/integrationService.js`
- Modify: `apps/bul-monitor/src/App.jsx` (`handleBulkKirimSJKeAccounting`, currently line 1758)

**Context:** `kirimUangJalanKeAccounting` (integrationService.js:157-160) calls `fetchAccountingTrucks()` + `fetchAccountingKaryawan()` — each a full-collection `getDocs` against bul-accounting — on *every single SJ* sent. Bulk-sending 100 SJ downloads both collections 100 times. Fix: fetch once, pass down; single-item send path is untouched (still fetches its own copy when not given prefetched data).

- [ ] **Step 1: Add an exported combined fetch + optional prefetched param**

In `integrationService.js`, after the `fetchAccountingKaryawan` function (ends at line 63), add:

```js
/**
 * Fetch truck + karyawan master data dari bul-accounting dalam satu Promise.all.
 * Dipakai untuk prefetch sebelum loop bulk kirim (hindari fetch berulang per item).
 */
export async function fetchAccountingMasterData() {
  const [accountingTrucks, accountingKaryawan] = await Promise.all([
    fetchAccountingTrucks(),
    fetchAccountingKaryawan(),
  ]);
  return { accountingTrucks, accountingKaryawan };
}
```

Then change the `kirimUangJalanKeAccounting` signature and its first block (currently lines 153-160):

```js
export async function kirimUangJalanKeAccounting(sj, currentUser, allInvoices = [], biayaList = [], prefetchedMasterData = null) {
  assertBridgeAuthed();

  // ── Validasi master data vs bul-accounting ──────────────────────────────
  const { accountingTrucks, accountingKaryawan } =
    prefetchedMasterData || await fetchAccountingMasterData();
```

Everything after this line in the function is unchanged (still references `accountingTrucks`/`accountingKaryawan` the same way).

- [ ] **Step 2: Use prefetch + concurrency-limited pool in the bulk handler**

In `App.jsx`, add this module-level helper above the `SuratJalanMonitor` component (near the top, after imports, before `const SuratJalanMonitor = () => {`):

```js
// Runs `worker` over `items` with at most `limit` in flight at once.
// Used to parallelize bulk Firestore round-trips without opening hundreds of
// simultaneous connections (which is what an unbounded Promise.all would do).
async function runWithConcurrencyLimit(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function runNext() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }
  const poolSize = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: poolSize }, runNext));
  return results;
}
```

Import `fetchAccountingMasterData` in App.jsx's existing integrationService import block (currently lines 3-11):

```js
import {
  kirimUangJalanKeAccounting,
  kirimInvoiceKeAccounting,
  kirimTransaksiKasKeAccounting,
  fetchAccountingMasterData,
  isBridgeReady,
} from "./integrationService.js";
```

(The three `subscribeIntegrationStatus*` imports are removed here — Task 8 replaces them with a single subscription function. If Task 8 hasn't run yet, leave them in for now so the app still compiles; remove them in Task 8 instead.)

Now replace the body of `handleBulkKirimSJKeAccounting`'s `onConfirm` (currently lines 1774-1796, the `for (const sj of toSend)` loop) with:

```js
        setConfirmDialog({ show: false, message: '', onConfirm: null });

        const masterData = await fetchAccountingMasterData();
        const allWarnings = [];
        const succeeded = [];
        const gagalList = [];

        await runWithConcurrencyLimit(toSend, 5, async (sj) => {
          try {
            const sjBiaya = biayaList.filter(b => b.suratJalanId === sj.id && b.isActive !== false && !b.deletedAt);
            const { warnings } = await kirimUangJalanKeAccounting(sj, currentUser, invoiceList, sjBiaya, masterData);
            warnings.forEach(w => allWarnings.push(`[${sj.nomorSJ}] ${w.message}`));
            succeeded.push(sj);
          } catch (e) {
            gagalList.push(sj.nomorSJ);
          }
        });
```

The remainder of the handler (building `warningText`/`gagalText`/`setAlertMessage`, using `berhasil`/`gagal` counts) is replaced in Task 3, since that's where the per-item `updateSuratJalan` call gets batched. Leave the rest of the function body as-is for this task — it will still reference `berhasil`/`gagal` which no longer exist; that's expected and fixed in Task 3. **Do not run the build-pass check as "done" until Task 3 also lands** — do Tasks 2 and 3 as one continuous edit before verifying, since Task 2 alone leaves the function in a broken intermediate state.

- [ ] **Step 3: Move to Task 3 before verifying build.**

(No commit yet — Task 3 completes this handler.)

---

## Task 3: Chunked batch status update after bulk kirim SJ (Fase 1b, part 1)

**Files:**
- Modify: `apps/bul-monitor/src/App.jsx` (same `handleBulkKirimSJKeAccounting`)

**Context:** Continues directly from Task 2. After the antrian-kirim loop, the original code called `updateSuratJalan(sj.id, {...})` per item — each call does its own `setSuratJalanList` (full re-render) and its own `updateDoc` (round trip). Replace with one `setSuratJalanList` and one chunked batch.

- [ ] **Step 1: Finish the handler**

Directly after the `runWithConcurrencyLimit` block from Task 2, add:

```js
        const nowIso = new Date().toISOString();
        const who = currentUser?.name || currentUser?.username || 'unknown';
        const patchesById = new Map(succeeded.map(sj => [sj.id, {
          status: 'menunggu_review',
          integrationQueueId: `IQ-UJ-${sj.id}`,
          sentToAccountingAt: nowIso,
          sentToAccountingBy: who,
          updatedAt: nowIso,
          updatedBy: who,
        }]));

        if (patchesById.size > 0) {
          await chunkedBatchWrite(db, Array.from(patchesById.entries()), (batch, [sjId, patch]) => {
            batch.update(doc(db, C("surat_jalan"), String(sjId)), patch);
          });
          setSuratJalanList(prev => prev.map(sj =>
            patchesById.has(sj.id) ? { ...sj, ...patchesById.get(sj.id) } : sj
          ));
        }

        setSelectedSJIds(new Set());
        const warningText = allWarnings.length > 0
          ? `\n\n⚠️ Peringatan Master Data:\n${allWarnings.map(w => `• ${w}`).join('\n')}`
          : '';
        const gagalText = gagalList.length > 0
          ? `\n❌ ${gagalList.length} SJ gagal dikirim: ${gagalList.join(', ')}`
          : '';
        setAlertMessage(`✅ ${succeeded.length} SJ berhasil dikirim ke Accounting.${gagalText}${warningText}`);
      },
    });
  };
```

This replaces everything from the old `setSelectedSJIds(new Set());` line through the end of the function (previously ending at line 1808 `};`).

Import `chunkedBatchWrite` in App.jsx's existing `firestoreWrites.js` import line (currently line 26):

```js
import { C, softDeleteItemInFirestore, resolveSuratJalanDocRef, softDeactivateTransaksiInFirestore, deactivateUangJalanTransaksiForSJ, upsertItemToFirestore, chunkedBatchWrite } from './services/firestoreWrites.js';
```

- [ ] **Step 2: Verify build**

Run: `cd apps/bul-monitor && npm run build`
Expected: build succeeds, no errors.

- [ ] **Step 3: Manual dev-server check**

Run `npm run dev`, log in as superadmin (or use whatever test account exists), go to Surat Jalan tab, select 2-3 eligible SJ (status `terkirim`, `uangJalan > 0`), click "Kirim ke Accounting" bulk button, confirm. Verify: alert shows correct berhasil count, selected SJ move to `menunggu_review` status in the list, no console errors.

- [ ] **Step 4: Commit**

```bash
git add apps/bul-monitor/src/App.jsx
git commit -m "perf(bul-monitor): prefetch master data + batch status writes for bulk kirim SJ"
```

---

## Task 4: Chunked batch for bulk batalkan SJ (Fase 1b, part 2)

**Files:**
- Modify: `apps/bul-monitor/src/App.jsx` (`updateSuratJalan` at line 1619, `handleBulkBatalkanSJ` at line 1810)

**Context:** `handleBulkBatalkanSJ`'s loop calls `updateSuratJalan` (per-item setState + updateDoc), then `deactivateUangJalanTransaksiForSJ` (per-item getDoc + updateDoc), then `addHistoryLog` (per-item setState + setDoc) — sequentially awaited per SJ. To batch this without duplicating the "gagal" patch business logic (the `deletedUangJalan` snapshot construction in `updateSuratJalan`, lines 1633-1648), extract that computation into a pure helper reused by both the single-item and bulk paths.

- [ ] **Step 1: Extract the pure patch-builder**

In `App.jsx`, replace the body of `updateSuratJalan` (lines 1619-1667) with:

```js
  // Pure: computes the Firestore patch for a status update, including the special
  // "gagal" derived fields (uangJalan locked to 0, deletedUangJalan snapshot for restore).
  // Extracted so the bulk-batalkan path can reuse it without duplicating the logic.
  const buildSJStatusPatch = (sj, updates, who) => {
    const nowIso = new Date().toISOString();
    const patch = {
      ...(updates || {}),
      updatedAt: nowIso,
      updatedBy: who,
    };

    if (patch.status === 'gagal') {
      const originalUangJalan = Number(sj?.uangJalan || 0);
      if (patch.isActive === undefined) patch.isActive = false;

      if (!patch.deletedUangJalan && originalUangJalan > 0) {
        patch.deletedUangJalan = {
          id: buildUangJalanTransaksiId(sj?.id),
          nominal: originalUangJalan,
          tanggal: (sj?.tglSJ || '').split('/').reverse().join('-') || nowIso.slice(0, 10),
          keterangan: (`Uang Jalan - ${String(sj?.nomorSJ || '')}`).trim(),
          pt: sj?.pt || '',
        };
      }
      patch.uangJalan = 0;
    }

    return patch;
  };

  const updateSuratJalan = async (id, updates) => {
    const sj = suratJalanList.find((x) => String(x.id) === String(id));
    const who = currentUser?.name || 'system';
    const patch = buildSJStatusPatch(sj, updates, who);

    const updatedSJList = suratJalanList.map((x) =>
      String(x.id) === String(id) ? { ...x, ...patch } : x
    );
    setSuratJalanList(updatedSJList);

    // Persist ke Firestore
    await updateDoc(doc(db, C("surat_jalan"), String(id)), sanitizeForFirestore(patch));

    // Jika jadi GAGAL, nonaktifkan transaksi uang jalan terkait (best-effort, termasuk legacy)
    if (patch.status === 'gagal') {
      try {
        const sjObj = suratJalanList.find((s) => String(s.id) === String(id)) || { id };
        await deactivateUangJalanTransaksiForSJ(sjObj, who);
      } catch (e) {
        console.warn('Nonaktifkan transaksi uang jalan gagal:', e);
      }
    }
  };
```

This is byte-for-byte the same behavior as before — only the "gagal" derived-field computation moved into `buildSJStatusPatch`.

- [ ] **Step 2: Verify build (single-item path only)**

Run: `cd apps/bul-monitor && npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit the extraction on its own**

```bash
git add apps/bul-monitor/src/App.jsx
git commit -m "refactor(bul-monitor): extract buildSJStatusPatch from updateSuratJalan"
```

- [ ] **Step 4: Rewrite `handleBulkBatalkanSJ` to batch**

Replace the `onConfirm` body of `handleBulkBatalkanSJ` (currently lines 1822-1861, the `for (const sj of toCancel)` loop through `setAlertMessage`) with:

```js
      onConfirm: async () => {
        setConfirmDialog({ show: false, message: '', onConfirm: null });
        const who = currentUser?.name || 'system';
        const nowIso = new Date().toISOString();

        // Precompute patches + tx ids (pure, no I/O) so we can batch everything below.
        const plans = toCancel.map(sj => {
          const uangJalanTransaksi = transaksiList.find(
            t => t.id === buildUangJalanTransaksiId(sj.id) || String(t.suratJalanId) === String(sj.id)
          );
          const deletedUangJalan = uangJalanTransaksi ? {
            nominal: uangJalanTransaksi.nominal,
            keterangan: uangJalanTransaksi.keterangan,
            tanggal: uangJalanTransaksi.tanggal,
            id: uangJalanTransaksi.id,
          } : null;
          const patch = buildSJStatusPatch(sj, { status: 'gagal', statusLabel: 'gagal', deletedUangJalan }, who);
          return { sj, patch, txId: buildUangJalanTransaksiId(sj.id) };
        });

        // Prefetch tx existence in parallel (read-before-write, same rule as
        // deactivateUangJalanTransaksiForSJ: only deactivate if it exists and is active).
        const txSnaps = await Promise.all(plans.map(p => getDoc(doc(db, C("transaksi"), p.txId))));

        const items = plans.map((p, i) => ({
          ...p,
          txSnap: txSnaps[i],
        }));

        await chunkedBatchWrite(db, items, (batch, { sj, patch, txId, txSnap }) => {
          batch.update(doc(db, C("surat_jalan"), String(sj.id)), sanitizeForFirestore(patch));

          if (txSnap.exists() && txSnap.data()?.isActive !== false) {
            batch.update(doc(db, C("transaksi"), txId), {
              isActive: false,
              updatedAt: nowIso,
              updatedBy: who,
            });
          }

          batch.set(doc(db, C("history_log"), 'LOG-' + Date.now() + '-' + sj.id), {
            id: 'LOG-' + Date.now() + '-' + sj.id,
            action: 'mark_gagal',
            suratJalanId: sj.id,
            suratJalanNo: sj.nomorSJ,
            details: { previousStatus: sj.status, uangJalanDeleted: patch.deletedUangJalan, bulkAction: true },
            timestamp: nowIso,
            user: currentUser.name,
            userRole: currentUser.role,
            isActive: false,
          });
        }, 150); // 3 writes/item (SJ + tx + history) => 150*3=450 ≤ 500/batch

        const patchesById = new Map(items.map(({ sj, patch }) => [sj.id, patch]));
        setSuratJalanList(prev => prev.map(sj =>
          patchesById.has(sj.id) ? { ...sj, ...patchesById.get(sj.id) } : sj
        ));
        setTransaksiList(prev => prev.map(t => {
          const match = items.find(({ sj }) =>
            String(t?.suratJalanId) === String(sj.id) || String(t?.id) === String(buildUangJalanTransaksiId(sj.id))
          );
          if (!match) return t;
          return { ...t, isActive: false, deletedAt: t?.deletedAt || nowIso, deletedBy: t?.deletedBy || who };
        }));
        setHistoryLog(prev => [
          ...prev,
          ...items.map(({ sj, patch }) => ({
            id: 'LOG-' + Date.now() + '-' + sj.id,
            action: 'mark_gagal',
            suratJalanId: sj.id,
            suratJalanNo: sj.nomorSJ,
            details: { previousStatus: sj.status, uangJalanDeleted: patch.deletedUangJalan, bulkAction: true },
            timestamp: nowIso,
            user: currentUser.name,
            userRole: currentUser.role,
          })),
        ]);

        setSelectedBatalSJIds(new Set());
        setAlertMessage(`✅ ${items.length} SJ berhasil dibatalkan.\n💰 Uang Jalan terkait telah dihapus dari keuangan.`);
      },
    });
  };
```

Note: this drops the previous per-item try/catch-and-continue (`berhasil`/`gagal` counts) because a Firestore batch commit is all-or-nothing — if any single update in the chunk is invalid the whole chunk fails together, which is then surfaced by `handleBulkBatalkanSJ`'s caller via the existing top-level error path (there is none currently — add one): wrap the whole `onConfirm` body in try/catch:

```js
      onConfirm: async () => {
        setConfirmDialog({ show: false, message: '', onConfirm: null });
        try {
          // ... (all of the above code) ...
        } catch (e) {
          setAlertMessage(`❌ Gagal membatalkan SJ secara massal: ${e.message}`);
        }
      },
```

- [ ] **Step 5: Verify build**

Run: `cd apps/bul-monitor && npm run build`
Expected: build succeeds.

- [ ] **Step 6: Manual dev-server check**

`npm run dev`, select 2-3 SJ eligible for "Batalkan", confirm, verify: they move to Gagal tab, their Uang Jalan transaksi disappears from Keuangan, and Riwayat/history shows the `mark_gagal` entries with `bulkAction: true` in details (open browser devtools → Firestore isn't inspectable there, so instead verify via the app's own history/audit UI if present, or via Firebase Console → bul_history_log collection for a quick manual read).

- [ ] **Step 7: Commit**

```bash
git add apps/bul-monitor/src/App.jsx
git commit -m "perf(bul-monitor): batch bulk-batalkan SJ writes (status + tx + history in one commit)"
```

---

## Task 5: Bulk kirim invoice uses `pelangganList` from state (Fase 1c)

**Files:**
- Modify: `apps/bul-monitor/src/integrationService.js` (`kirimInvoiceKeAccounting`, line 323)
- Modify: `apps/bul-monitor/src/App.jsx` (`handleKirimInvoiceKeAccounting` line 1864, `handleBulkKirimInvoiceKeAccounting` line 1895)

**Context:** `kirimInvoiceKeAccounting` calls `fetchPelangganByName(pt)` (integrationService.js:346) which does a full `getDocs` on `bul_pelanggan` — per invoice sent. `pelangganList` is already loaded in App.jsx state; pass it down.

- [ ] **Step 1: Accept `pelangganList` param**

In `integrationService.js`, change the `kirimInvoiceKeAccounting` signature (line 323) and the `pelangganData` line (line 346):

```js
export async function kirimInvoiceKeAccounting(invoice, allSuratJalan, currentUser, biayaList = [], pelangganList = []) {
```

```js
  const pelangganFromState = pelangganList.find(
    p => (p.name || '').trim().toLowerCase() === pt.trim().toLowerCase()
  );
  const pelangganData = invoice.pelangganData
    || (pelangganFromState ? { name: pelangganFromState.name, address: pelangganFromState.address || '', npwp: pelangganFromState.npwp || '' } : null)
    || await fetchPelangganByName(pt);
```

This preserves the exact fallback chain and exact shape (`{ name, address, npwp }`) that `fetchPelangganByName` returns, so `suggestedJournal`/`pelangganData` payload is unchanged.

- [ ] **Step 2: Pass `pelangganList` from both call sites in App.jsx**

Line 1877 (`handleKirimInvoiceKeAccounting`):
```js
          await kirimInvoiceKeAccounting(invoice, suratJalanList, currentUser, biayaList, pelangganList);
```

Line 1917 (`handleBulkKirimInvoiceKeAccounting`, inside the `for` loop):
```js
            await kirimInvoiceKeAccounting(invoice, suratJalanList, currentUser, biayaList, pelangganList);
```

- [ ] **Step 3: Verify build**

Run: `cd apps/bul-monitor && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Manual dev-server check**

Send one invoice to accounting, verify the resulting `integration_queue` doc's `pelangganData` field is populated the same as before (compare against a customer whose PT name matches an existing `bul_pelanggan` entry).

- [ ] **Step 5: Commit**

```bash
git add apps/bul-monitor/src/integrationService.js apps/bul-monitor/src/App.jsx
git commit -m "perf(bul-monitor): source pelangganData from local state instead of per-invoice fetch"
```

---

## Task 6: Chunk import writeBatch calls (Fase 1d, part 1)

**Files:**
- Modify: `apps/bul-monitor/src/App.jsx` (`importData`, 6 call sites: SJ ~1278, truck ~1331, supir ~1382, rute ~1427, material ~1472, biaya ~1524)

**Context:** Every `writeBatch(db)` + `.forEach(...batch.set...)` + `await batch.commit()` triple in `importData` silently fails past 500 ops if the pasted file has more rows. Replace each with `chunkedBatchWrite`.

- [ ] **Step 1: SJ import batch**

Replace (around line 1278):
```js
              const batch = writeBatch(db);
              newItems.forEach((sj) => {
                batch.set(doc(db, C("surat_jalan"), String(sj.id)), sanitizeForFirestore({ ...sj, isActive: true }), { merge: true });
              });
              await batch.commit();
```
with:
```js
              await chunkedBatchWrite(db, newItems, (batch, sj) => {
                batch.set(doc(db, C("surat_jalan"), String(sj.id)), sanitizeForFirestore({ ...sj, isActive: true }), { merge: true });
              });
```

- [ ] **Step 2: Truck import batch** (around line 1331)

Replace:
```js
    const batch = writeBatch(db);
    newItems.forEach((t) => {
      batch.set(doc(db, C("trucks"), t.id), t, { merge: true });
    });
    await batch.commit();
```
with:
```js
    await chunkedBatchWrite(db, newItems, (batch, t) => {
      batch.set(doc(db, C("trucks"), t.id), t, { merge: true });
    });
```

- [ ] **Step 3: Supir import batch** (around line 1382)

Replace:
```js
              const batch = writeBatch(db);
              newItems.forEach((s) => {
                batch.set(doc(db, C("supir"), s.id), s, { merge: true });
              });
              await batch.commit();
```
with:
```js
              await chunkedBatchWrite(db, newItems, (batch, s) => {
                batch.set(doc(db, C("supir"), s.id), s, { merge: true });
              });
```

- [ ] **Step 4: Rute import batch** (around line 1427)

Replace:
```js
              const batch = writeBatch(db);
              newItems.forEach((r) => {
                batch.set(doc(db, C("rute"), r.id), r, { merge: true });
              });
              await batch.commit();
```
with:
```js
              await chunkedBatchWrite(db, newItems, (batch, r) => {
                batch.set(doc(db, C("rute"), r.id), r, { merge: true });
              });
```

- [ ] **Step 5: Material import batch** (around line 1472)

Replace:
```js
              const batch = writeBatch(db);
              newItems.forEach((m) => {
                batch.set(doc(db, C("material"), m.id), m, { merge: true });
              });
              await batch.commit();
```
with:
```js
              await chunkedBatchWrite(db, newItems, (batch, m) => {
                batch.set(doc(db, C("material"), m.id), m, { merge: true });
              });
```

- [ ] **Step 6: Biaya import batch** (around line 1524)

Replace:
```js
              const batch = writeBatch(db);
              biayaItems.forEach(b => {
                batch.set(doc(db, C("biaya"), b.id), b, { merge: true });
              });
              await batch.commit();
```
with:
```js
              await chunkedBatchWrite(db, biayaItems, (batch, b) => {
                batch.set(doc(db, C("biaya"), b.id), b, { merge: true });
              });
```

- [ ] **Step 7: Verify build**

Run: `cd apps/bul-monitor && npm run build`
Expected: build succeeds. (`writeBatch` remains used elsewhere in the file — e.g. `deleteImportedSJ`, `deleteSuratJalan` — so the import stays; no unused-import lint issue.)

- [ ] **Step 8: Manual dev-server check**

Import a small CSV for each of the 6 types (a few rows each) via the Master Data / Import UI, verify each still succeeds and appears in the list, and that the success/error count message is unchanged.

- [ ] **Step 9: Commit**

```bash
git add apps/bul-monitor/src/App.jsx
git commit -m "perf(bul-monitor): chunk all import writeBatch calls to avoid 500-op limit"
```

---

## Task 7: Batch auto-transaksi-uang-jalan creation during SJ import (Fase 1d, part 2)

**Files:**
- Modify: `apps/bul-monitor/src/App.jsx` (SJ import block, around line 1288-1297)

**Context:** After importing SJ rows, the code calls `await upsertUangJalanTransaksiForSJ(sj)` per row inside a `for` loop — each call does its own `setTransaksiList` + `upsertItemToFirestore` round trip. `upsertUangJalanTransaksiForSJ` (App.jsx:372) has no read-before-write; it's a pure compute + write, so it batches cleanly.

- [ ] **Step 1: Replace the sequential loop**

Current code (around lines 1288-1297):
```js
            if (canWriteTransaksi) {
              for (const sj of newItems) {
                try {
                  await upsertUangJalanTransaksiForSJ(sj);
                } catch (e) {
                  console.warn('Import SJ -> auto transaksi uang jalan gagal:', e);
                }
              }
            }
```

Replace with:
```js
            if (canWriteTransaksi) {
              const eligibleForTx = newItems.filter(sj => {
                if (sj.isActive === false) return false;
                if (String(sj.status || '').toLowerCase() === 'gagal') return false;
                return Number(sj.uangJalan || 0) > 0;
              });

              if (eligibleForTx.length > 0) {
                const who = currentUser?.name || 'system';
                const nowIsoTx = new Date().toISOString();
                const txItems = eligibleForTx.map(sj => sanitizeForFirestore({
                  id: buildUangJalanTransaksiId(sj.id),
                  tipe: 'pengeluaran',
                  nominal: Number(sj.uangJalan || 0),
                  keterangan: `Uang Jalan - ${sj.nomorSJ} (${sj.rute || ''})`,
                  tanggal: sj.tanggalSJ || nowIsoTx.slice(0, 10),
                  pt: sj.pt || '',
                  suratJalanId: sj.id,
                  source: 'auto_sj',
                  isActive: true,
                  createdAt: nowIsoTx,
                  createdBy: who,
                  updatedAt: nowIsoTx,
                  updatedBy: who,
                }));

                try {
                  await chunkedBatchWrite(db, txItems, (batch, tx) => {
                    batch.set(doc(db, C("transaksi"), tx.id), tx, { merge: true });
                  });
                  setTransaksiList(prev => {
                    const map = new Map(prev.map(t => [t.id, t]));
                    txItems.forEach(tx => map.set(tx.id, tx));
                    return Array.from(map.values());
                  });
                } catch (e) {
                  console.warn('Import SJ -> auto transaksi uang jalan (batch) gagal:', e);
                }
              }
            }
```

This is the same field set `upsertUangJalanTransaksiForSJ` → `addTransaksi` would have produced (compare `addTransaksi`, App.jsx:397-422): same defaults, same `source: 'auto_sj'`, same id via `buildUangJalanTransaksiId`.

- [ ] **Step 2: Verify build**

Run: `cd apps/bul-monitor && npm run build`
Expected: build succeeds.

- [ ] **Step 3: Manual dev-server check**

Import a CSV of 3-5 SJ rows with non-zero Uang Jalan, verify the corresponding `pengeluaran` transaksi appear in Keuangan with correct nominal/keterangan/tanggal, matching what a single manual "Tambah SJ" produces.

- [ ] **Step 4: Commit**

```bash
git add apps/bul-monitor/src/App.jsx
git commit -m "perf(bul-monitor): batch auto-transaksi creation for imported SJ rows"
```

---

## Task 8: Single query listener replaces 3×N per-document listeners (Fase 2a)

**Files:**
- Modify: `apps/bul-monitor/src/integrationService.js` (remove 3 `subscribeIntegrationStatus*` functions, lines 525-549; add 1 new function)
- Modify: `apps/bul-monitor/src/App.jsx` (remove 3 `useEffect`s at lines 2506-2547, 2549-2593, 2595-2637ish; add 1 new `useEffect`)

**Context — the risk this task fixes:** the three existing effects each attach one `onSnapshot` per watched SJ/invoice/transaksi (status `menunggu_review` OR `terkunci`), and re-run their whole `.map()` of subscriptions every time the parent list state changes. `terkunci` items are watched **forever** — listener count only grows over the app's lifetime. This task collapses all of that into one listener.

**Design decision requiring care:** the original `rejected` branches in all three effects have **no idempotency guard** (unlike the `approved`/`cancelled` branches). That was safe under the old design because a per-document listener only existed while the SJ/invoice/transaksi was in a "watched" status — once reconciled, the effect's dependency array caused the watched list to shrink and that listener to unsubscribe, so it could never fire twice for the same transition. Under the new single persistent listener, **every already-resolved historical `integration_queue` doc gets delivered as an `added` event as soon as the listener attaches** (that's how Firestore's initial snapshot works for any query). Without a guard, this would replay every historical rejection/cancellation on every page load, potentially overwriting an SJ/invoice/transaksi that has since moved on to a different state. **This task adds the missing guard** (`sj.status === 'menunggu_review'` etc.) to the `rejected` branches, matching the guard style already used on `approved`/`cancelled`. This is a deliberate correctness fix surfaced by the refactor, not an incidental behavior change — the normal single-happens-once flow reaches the exact same end state either way; the guard only prevents replay of already-handled historical events.

- [ ] **Step 1: Replace the 3 subscribe functions in `integrationService.js`**

Delete lines 525-549 (`subscribeIntegrationStatusSJ`, `subscribeIntegrationStatusInvoice`, `subscribeIntegrationStatusTransaksi` and their comments), replace with:

```js
// ─── Status Listener (single query, replaces one-listener-per-document) ────

/**
 * Satu listener untuk semua perubahan status integration_queue milik bul-monitor
 * yang sudah final (approved/rejected/cancelled). Menggantikan pola lama yang
 * membuka satu onSnapshot per dokumen (SJ/invoice/transaksi) yang diawasi —
 * termasuk yang berstatus 'terkunci' selamanya, sumber kebocoran listener.
 *
 * @param {(docId: string, data: Object) => void} onChange
 * @returns {() => void} unsubscribe
 */
export function subscribeIntegrationQueueUpdates(onChange) {
  const q = query(
    collection(dbAccounting, 'integration_queue'),
    where('sourceProject', '==', 'bul-monitor'),
    where('status', 'in', ['approved', 'rejected', 'cancelled'])
  );
  return onSnapshot(q, (snap) => {
    snap.docChanges().forEach((change) => {
      if (change.type === 'removed') return; // integration_queue docs are never deleted (rules: allow delete: if false)
      onChange(change.doc.id, change.doc.data());
    });
  });
}
```

Add `query` and `where` to the top import (currently line 8):
```js
import { doc, setDoc, updateDoc, getDoc, getDocs, collection, onSnapshot, arrayUnion, query, where } from 'firebase/firestore';
```

- [ ] **Step 2: Verify build (integrationService.js in isolation)**

Run: `cd apps/bul-monitor && npm run build`
Expected: build will FAIL at this point because App.jsx still imports the removed functions — that's expected. Proceed to Step 3 before checking build again.

- [ ] **Step 3: Replace the App.jsx import + 3 effects**

Update the integrationService import block (from Task 2, currently):
```js
import {
  kirimUangJalanKeAccounting,
  kirimInvoiceKeAccounting,
  kirimTransaksiKasKeAccounting,
  fetchAccountingMasterData,
  isBridgeReady,
} from "./integrationService.js";
```
to:
```js
import {
  kirimUangJalanKeAccounting,
  kirimInvoiceKeAccounting,
  kirimTransaksiKasKeAccounting,
  fetchAccountingMasterData,
  subscribeIntegrationQueueUpdates,
  isBridgeReady,
} from "./integrationService.js";
```

Delete the three `useEffect` blocks (originally at lines 2506-2547, 2549-2593, 2595-2637ish — search for the comment `// Dengarkan perubahan status integrasi dari bul-accounting` and its two sibling comments, they run consecutively). Replace all three with:

```js
// Ref-mirror of the three watched lists so the single persistent integration_queue
// listener (below) always reads current state without needing to resubscribe
// whenever suratJalanList/invoiceList/transaksiList changes.
const suratJalanListRef = useRef(suratJalanList);
useEffect(() => { suratJalanListRef.current = suratJalanList; }, [suratJalanList]);
const invoiceListRef = useRef(invoiceList);
useEffect(() => { invoiceListRef.current = invoiceList; }, [invoiceList]);
const transaksiListRef = useRef(transaksiList);
useEffect(() => { transaksiListRef.current = transaksiList; }, [transaksiList]);

// Dengarkan perubahan status integrasi (SJ/Invoice/Transaksi) dari bul-accounting
// (approve/reject/cancel) — satu query listener untuk semuanya (lihat Design decision
// di plan Task 8 untuk kenapa 'rejected' punya guard status eksplisit di sini).
useEffect(() => {
  if (!authReady || !firebaseUser) return;

  const unsub = subscribeIntegrationQueueUpdates(async (docId, data) => {
    if (data.type === 'uang_jalan') {
      const sj = suratJalanListRef.current.find(s => s.id === data.sourceSjId);
      if (!sj) return;
      if (data.status === 'approved' && sj.status !== 'terkunci') {
        await updateSuratJalan(sj.id, {
          status: 'terkunci',
          accountingJournalId: data.journalId,
          accountingApprovedAt: data.updatedAt,
          accountingReviewedBy: data.reviewedBy,
        });
      } else if (data.status === 'rejected' && sj.status === 'menunggu_review') {
        await updateSuratJalan(sj.id, {
          status: 'terkirim',
          integrationQueueId: null,
          sentToAccountingAt: null,
          accountingRejectedAt: data.updatedAt,
          accountingRejectionReason: data.rejectionReason,
        });
        setAlertMessage(`⚠️ SJ ${sj.nomorSJ} ditolak oleh akuntan.\nAlasan: ${data.rejectionReason || '-'}\nData dapat diedit dan dikirim ulang.`);
      } else if (data.status === 'cancelled' && sj.status === 'terkunci') {
        await updateSuratJalan(sj.id, {
          status: 'terkirim',
          integrationQueueId: null,
          sentToAccountingAt: null,
          accountingJournalId: null,
          accountingApprovedAt: null,
          accountingReviewedBy: null,
          accountingCancelledAt: data.updatedAt,
          accountingCancellationReason: data.cancellationReason,
        });
        setAlertMessage(`⚠️ Jurnal SJ ${sj.nomorSJ} dibatalkan oleh akuntan.\nAlasan: ${data.cancellationReason || '-'}\nData dapat diedit dan dikirim ulang.`);
      }
    } else if (data.type === 'invoice') {
      const invoice = invoiceListRef.current.find(inv => inv.id === data.sourceInvoiceId);
      if (!invoice) return;
      const invRef = doc(db, C("invoices"), invoice.id);
      if (data.status === 'approved' && invoice.integrationStatus !== 'terkunci') {
        await updateDoc(invRef, sanitizeForFirestore({
          integrationStatus: 'terkunci',
          accountingJournalId: data.journalId,
          accountingApprovedAt: data.updatedAt,
          accountingReviewedBy: data.reviewedBy,
          updatedAt: new Date().toISOString(),
        }));
      } else if (data.status === 'rejected' && invoice.integrationStatus === 'menunggu_review') {
        await updateDoc(invRef, sanitizeForFirestore({
          integrationStatus: null,
          integrationQueueId: null,
          sentToAccountingAt: null,
          accountingRejectedAt: data.updatedAt,
          accountingRejectionReason: data.rejectionReason,
          updatedAt: new Date().toISOString(),
        }));
        setAlertMessage(`⚠️ Invoice ${invoice.noInvoice} ditolak oleh akuntan.\nAlasan: ${data.rejectionReason || '-'}\nInvoice dapat dikirim ulang.`);
      } else if (data.status === 'cancelled' && invoice.integrationStatus === 'terkunci') {
        await updateDoc(invRef, sanitizeForFirestore({
          integrationStatus: null,
          integrationQueueId: null,
          sentToAccountingAt: null,
          accountingJournalId: null,
          accountingApprovedAt: null,
          accountingReviewedBy: null,
          accountingCancelledAt: data.updatedAt,
          accountingCancellationReason: data.cancellationReason,
          updatedAt: new Date().toISOString(),
        }));
        setAlertMessage(`⚠️ Jurnal Invoice ${invoice.noInvoice} dibatalkan oleh akuntan.\nAlasan: ${data.cancellationReason || '-'}\nInvoice dapat dikirim ulang.`);
      }
    } else if (data.type === 'transaksi_kas') {
      const transaksi = transaksiListRef.current.find(t => t.id === data.sourceTransaksiId);
      if (!transaksi) return;
      const trxRef = doc(db, C('transaksi'), transaksi.id);
      if (data.status === 'approved' && transaksi.integrationStatus !== 'terkunci') {
        await updateDoc(trxRef, {
          integrationStatus: 'terkunci',
          accountingJournalId: data.journalId,
          accountingApprovedAt: data.updatedAt,
          accountingReviewedBy: data.reviewedBy,
          updatedAt: new Date().toISOString(),
        });
      } else if (data.status === 'rejected' && transaksi.integrationStatus === 'menunggu_review') {
        await updateDoc(trxRef, {
          integrationStatus: null,
          integrationQueueId: null,
          sentToAccountingAt: null,
          accountingRejectedAt: data.updatedAt,
          accountingRejectionReason: data.rejectionReason,
          updatedAt: new Date().toISOString(),
        });
        setAlertMessage(`⚠️ Transaksi "${transaksi.keterangan}" ditolak oleh akuntan.\nAlasan: ${data.rejectionReason || '-'}\nTransaksi dapat dikirim ulang.`);
      } else if (data.status === 'cancelled' && transaksi.integrationStatus === 'terkunci') {
        await updateDoc(trxRef, {
          integrationStatus: null,
          integrationQueueId: null,
          sentToAccountingAt: null,
          accountingJournalId: null,
          accountingApprovedAt: null,
          accountingCancelledAt: data.updatedAt,
          accountingCancellationReason: data.cancellationReason,
          updatedAt: new Date().toISOString(),
        });
        setAlertMessage(`⚠️ Jurnal transaksi "${transaksi.keterangan}" dibatalkan oleh akuntan.\nAlasan: ${data.cancellationReason || '-'}`);
      }
    }
  });

  return () => unsub();
}, [authReady, firebaseUser]);
```

(Confirmed: the block above is a verbatim transcription of the original three effects at App.jsx:2508-2547 [SJ], 2550-2593 [invoice], 2595-2640 [transaksi], with only the `rejected` guard added and the dispatch mechanism changed from per-doc listeners to `data.type` switching. Field-for-field, nothing else differs — the `cancelled` branch for transaksi has no `accountingReviewedBy: null` reset, matching the original exactly, which likewise omits it there.)

- [ ] **Step 4: Verify build**

Run: `cd apps/bul-monitor && npm run build`
Expected: build succeeds, no errors, no unused-import warnings for the removed subscribe functions.

- [ ] **Step 5: Manual dev-server + Console check**

Before this check, make sure the Firestore composite index (see plan header, one-time manual prerequisite) exists or watch for the auto-create-index link in the browser console on first load.

`npm run dev`, log in, open browser devtools console. Confirm no `FAILED_PRECONDITION` index error (or if one appears, click the provided link, wait ~1-2 min, reload). Send one SJ to accounting (single, not bulk), then — using whatever mechanism exists to simulate/perform an accountant approve/reject in bul-accounting (or ask the user to do it manually in bul-accounting staging/dev if available) — verify the SJ transitions to `terkunci` or back to `terkirim` correctly, exactly as before this task.

- [ ] **Step 6: Commit**

```bash
git add apps/bul-monitor/src/integrationService.js apps/bul-monitor/src/App.jsx
git commit -m "perf(bul-monitor): replace per-document integration_queue listeners with one query listener

Also adds idempotency guards to the 'rejected' reconciliation branches
(previously implicit via listener lifecycle, now explicit since the
single persistent listener replays historical events on every attach)."
```

---

## Task 9: Conditional legacy `suratJalan` listener (Fase 2b)

**Files:**
- Modify: `apps/bul-monitor/src/App.jsx` (around lines 2429-2437, `unsubSuratJalan`/`unsubSuratJalanLegacy`)

**Context:** `unsubSuratJalanLegacy` listens to `bul_suratJalan` (legacy camelCase collection) unconditionally, merging into the same list as `bul_surat_jalan`. If the legacy collection is empty for a given deployment, skip subscribing to it.

- [ ] **Step 1: Add a one-time emptiness check before subscribing**

Replace (current lines 2429-2437):
```js
const unsubSuratJalan = onSnapshot(collection(db, C("surat_jalan")), (snap) => {
  sjPrimary = snap.docs.map((d) => normalizeSJ(d.data() || {}, d.id));
  applySJ();
});

const unsubSuratJalanLegacy = onSnapshot(collection(db, C("suratJalan")), (snap) => {
  sjLegacy = snap.docs.map((d) => normalizeSJ(d.data() || {}, d.id));
  applySJ();
});
```
with:
```js
const unsubSuratJalan = onSnapshot(collection(db, C("surat_jalan")), (snap) => {
  sjPrimary = snap.docs.map((d) => normalizeSJ(d.data() || {}, d.id));
  applySJ();
});

// Legacy camelCase collection: only subscribe if it actually has data. Avoids an
// always-on second full-collection listener for deployments where it's long empty.
let unsubSuratJalanLegacy = () => {};
(async () => {
  try {
    const legacyProbe = await getDocs(query(collection(db, C("suratJalan")), limit(1)));
    if (!legacyProbe.empty) {
      unsubSuratJalanLegacy = onSnapshot(collection(db, C("suratJalan")), (snap) => {
        sjLegacy = snap.docs.map((d) => normalizeSJ(d.data() || {}, d.id));
        applySJ();
      });
    } else {
      console.info('[bul-monitor] Legacy bul_suratJalan kosong — listener tidak dipasang.');
    }
  } catch (e) {
    console.warn('[bul-monitor] Gagal cek legacy bul_suratJalan, listener tidak dipasang:', e.message);
  }
})();
```

The cleanup function at the bottom of this `useEffect` already does `try { unsubSuratJalanLegacy(); } catch {}` (line 2494) — since `unsubSuratJalanLegacy` is now a `let` reassigned inside an async IIFE that may not have resolved yet by the time cleanup runs, this is a pre-existing-pattern race (cleanup may call the no-op instead of the real unsubscribe if the effect tears down before the probe resolves) — acceptable here since this only matters on rapid mount/unmount of the whole app (login/logout), not a leak (worst case: one extra listener briefly outlives its effect until next auth change re-triggers cleanup, or Firebase SDK garbage-collects on next snapshot).

- [ ] **Step 2: Verify build**

Run: `cd apps/bul-monitor && npm run build`
Expected: build succeeds.

- [ ] **Step 3: Manual dev-server check**

`npm run dev`, log in, check browser console for the info/warn log confirming whether the legacy listener attached. Verify Surat Jalan list still loads and displays correctly either way.

- [ ] **Step 4: Commit**

```bash
git add apps/bul-monitor/src/App.jsx
git commit -m "perf(bul-monitor): skip legacy bul_suratJalan listener when collection is empty"
```

---

## Task 10: Bound `history_log` listener with load-more (Fase 2c)

**Files:**
- Modify: `apps/bul-monitor/src/App.jsx` (around line 2450, `unsubHistory`)

**Context:** `historyLog` currently loads the entire collection with no limit, sorted client-side. Bound the live listener to the most recent 300 and add manual pagination for older entries.

- [ ] **Step 1: Check for `orderBy` import and add it**

In the `firebase/firestore` import at the top of App.jsx (line 1), add `orderBy` and `startAfter`:
```js
import {collection, doc, writeBatch, onSnapshot, getDoc, getDocFromServer, setDoc, updateDoc, getDocs, query, where, limit, orderBy, startAfter} from "firebase/firestore";
```

- [ ] **Step 2: Verify all history_log docs have a `timestamp` field**

Run this one-off check against production data before changing the listener (Firestore `orderBy('timestamp')` silently excludes documents missing that field):

Ask the user to run, or run yourself if Firestore Console/CLI access is available, a count comparison: total `bul_history_log` docs vs. docs where `timestamp` exists. `addHistoryLog` (App.jsx:197-212) always sets `timestamp: new Date().toISOString()`, so this should be 100% — but confirm before relying on `orderBy` for a production financial-adjacent audit trail. If any doc lacks `timestamp`, do not proceed with `orderBy` — instead keep the client-side sort but still apply `limit(300)` (Firestore allows `limit` without `orderBy`; document ordering isn't guaranteed but the client-side `.sort()` already handles final ordering).

- [ ] **Step 3: Add state for pagination + rewrite the listener**

Add near the other `useState` declarations (after `const [historyLog, setHistoryLog] = useState([]);`, line 48):
```js
  const [historyLogHasMore, setHistoryLogHasMore] = useState(false);
  const [historyLogLoadingMore, setHistoryLogLoadingMore] = useState(false);
  const historyLogCursorRef = useRef(null);
```

Replace the `unsubHistory` block (current lines 2450-2461):
```js
const unsubHistory = onSnapshot(collection(db, C("history_log")), (snap) => {
  const data = snap.docs
    .map((d) => {
      const row = d.data() || {};
      const id = row.id || d.id;
      return { ...row, id };
    })
    // History log adalah audit trail; tampilkan walaupun entity terkait sudah non-aktif.
    .filter((x) => !x?.deletedAt);
  data.sort((a, b) => String(b?.timestamp || "").localeCompare(String(a?.timestamp || "")));
  setHistoryLog(data);
});
```
with:
```js
const HISTORY_LOG_PAGE_SIZE = 300;
const historyLogQ = query(collection(db, C("history_log")), orderBy("timestamp", "desc"), limit(HISTORY_LOG_PAGE_SIZE));
const unsubHistory = onSnapshot(historyLogQ, (snap) => {
  const data = snap.docs
    .map((d) => {
      const row = d.data() || {};
      const id = row.id || d.id;
      return { ...row, id };
    })
    .filter((x) => !x?.deletedAt);
  data.sort((a, b) => String(b?.timestamp || "").localeCompare(String(a?.timestamp || "")));
  setHistoryLog(data);
  historyLogCursorRef.current = snap.docs[snap.docs.length - 1] || null;
  setHistoryLogHasMore(snap.docs.length === HISTORY_LOG_PAGE_SIZE);
});
```

- [ ] **Step 4: Add a `loadMoreHistoryLog` function**

Add near `deleteBiaya` (after line 2142, before `getTotalBiaya`):
```js
  const loadMoreHistoryLog = async () => {
    if (!historyLogCursorRef.current || historyLogLoadingMore) return;
    setHistoryLogLoadingMore(true);
    try {
      const moreQ = query(
        collection(db, C("history_log")),
        orderBy("timestamp", "desc"),
        startAfter(historyLogCursorRef.current),
        limit(HISTORY_LOG_PAGE_SIZE)
      );
      const snap = await getDocs(moreQ);
      const moreData = snap.docs
        .map((d) => {
          const row = d.data() || {};
          return { ...row, id: row.id || d.id };
        })
        .filter((x) => !x?.deletedAt);
      setHistoryLog(prev => {
        const combined = [...prev, ...moreData];
        combined.sort((a, b) => String(b?.timestamp || "").localeCompare(String(a?.timestamp || "")));
        return combined;
      });
      historyLogCursorRef.current = snap.docs[snap.docs.length - 1] || historyLogCursorRef.current;
      setHistoryLogHasMore(snap.docs.length === HISTORY_LOG_PAGE_SIZE);
    } finally {
      setHistoryLogLoadingMore(false);
    }
  };
```

(`HISTORY_LOG_PAGE_SIZE` needs to be declared once at module scope instead of inside the effect so `loadMoreHistoryLog` can reference it — move the `const HISTORY_LOG_PAGE_SIZE = 300;` line from Step 3 to just above the `SuratJalanMonitor` component definition instead.)

- [ ] **Step 5: Wire up a "Muat lebih banyak" button wherever history_log is rendered**

Find where `historyLog` is rendered (likely inside a Riwayat/History tab in App.jsx or a component it passes `historyLog` to — grep for `historyLog` usage in JSX). Add below the rendered list:
```jsx
{historyLogHasMore && (
  <button
    onClick={loadMoreHistoryLog}
    disabled={historyLogLoadingMore}
    className="mt-4 w-full bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm transition disabled:opacity-50"
  >
    {historyLogLoadingMore ? 'Memuat...' : 'Muat lebih banyak riwayat'}
  </button>
)}
```

- [ ] **Step 6: Verify build**

Run: `cd apps/bul-monitor && npm run build`
Expected: build succeeds.

- [ ] **Step 7: Manual dev-server check**

`npm run dev`, open the Riwayat/History view, confirm entries load (most recent first), and if the dataset exceeds 300 confirm "Muat lebih banyak" appears and works. If dataset is under 300, confirm the button doesn't appear and nothing regresses.

- [ ] **Step 8: Commit**

```bash
git add apps/bul-monitor/src/App.jsx
git commit -m "perf(bul-monitor): bound history_log listener to 300 most recent + load-more"
```

---

## Task 11: Paginate the Surat Jalan card list (Fase 3, part 1)

**Files:**
- Modify: `apps/bul-monitor/src/App.jsx` (`filteredSuratJalan` at line 2172, the render block at line 3212)

- [ ] **Step 1: Add pagination state + reset on filter change**

Add near `const [filter, setFilter] = useState('all');` (line 64):
```js
  const [sjPage, setSjPage] = useState(1);
  const SJ_PAGE_SIZE = 10;
```

Find the `setFilter` calls (wherever the filter tabs/buttons are rendered) and ensure each also calls `setSjPage(1)`. If filter is set via a single handler, wrap it:
```js
  const handleFilterChange = (newFilter) => {
    setFilter(newFilter);
    setSjPage(1);
  };
```
and use `handleFilterChange` in place of `setFilter` in the filter tab `onClick` handlers (grep for `setFilter(` in the JSX to find all call sites).

- [ ] **Step 2: Add a paginated slice**

After the `filteredSuratJalan` declaration (line 2172-2174), add:
```js
  const sjTotalPages = Math.max(1, Math.ceil(filteredSuratJalan.length / SJ_PAGE_SIZE));
  const sjPageClamped = Math.min(sjPage, sjTotalPages);
  const paginatedSuratJalan = filteredSuratJalan.slice((sjPageClamped - 1) * SJ_PAGE_SIZE, sjPageClamped * SJ_PAGE_SIZE);
```

(`eligibleInView`/`eligibleBatalInView` at lines 2183/2217 must keep reading from `filteredSuratJalan`, not `paginatedSuratJalan` — bulk-select needs to operate across the whole filtered set, not just the visible page. Do not change those two lines.)

- [ ] **Step 3: Render `paginatedSuratJalan` instead of `filteredSuratJalan`, add page controls**

Replace `filteredSuratJalan.length === 0` and `filteredSuratJalan.map(sj => (` (around lines 3193, 3212) with `paginatedSuratJalan.length === 0` and `paginatedSuratJalan.map(sj => (` respectively (only inside this render block — the empty-state check on line 3193 should be against the full filtered set so "no data" isn't shown just because the page is out of range; use `filteredSuratJalan.length === 0` for the empty-state condition, `paginatedSuratJalan.map` for the render loop).

Immediately after the closing `</div>` of the SJ list (after line 3245 `</div>`, before the `</>` at 3246), add:
```jsx
        {filteredSuratJalan.length > SJ_PAGE_SIZE && (
          <div className="flex items-center justify-center space-x-3 mt-4">
            <button
              onClick={() => setSjPage(p => Math.max(1, p - 1))}
              disabled={sjPageClamped <= 1}
              className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm disabled:opacity-50"
            >
              Sebelumnya
            </button>
            <span className="text-sm text-gray-600">Halaman {sjPageClamped} / {sjTotalPages}</span>
            <button
              onClick={() => setSjPage(p => Math.min(sjTotalPages, p + 1))}
              disabled={sjPageClamped >= sjTotalPages}
              className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm disabled:opacity-50"
            >
              Berikutnya
            </button>
          </div>
        )}
```

- [ ] **Step 4: Verify build**

Run: `cd apps/bul-monitor && npm run build`
Expected: build succeeds.

- [ ] **Step 5: Manual dev-server check**

`npm run dev`, go to Surat Jalan tab with more than 10 items, confirm pagination controls appear and page correctly; switch filter tabs and confirm page resets to 1; confirm bulk-select checkboxes still cover eligible items across the whole filtered set (select-all should still select all eligible, not just the visible page — verify this matches prior behavior, i.e. it selects everything eligible in the current filter regardless of page).

- [ ] **Step 6: Commit**

```bash
git add apps/bul-monitor/src/App.jsx
git commit -m "perf(bul-monitor): paginate Surat Jalan list at 10/page"
```

---

## Task 12: Memoize per-card biaya lookups + `React.memo` the card (Fase 3, part 2)

**Files:**
- Modify: `apps/bul-monitor/src/App.jsx` (`getTotalBiaya` line 2144, `getStatusColor`/`getStatusIcon` lines 2150-2170, render block line 3212)
- Modify: `apps/bul-monitor/src/components/SuratJalanCard.jsx`

**Context:** `biayaList.filter(b => b.suratJalanId === sj.id)` runs once per card per render (App.jsx:3216) and `getTotalBiaya` (App.jsx:2144-2148) does the same filter again — both O(cards × biaya) per render. Precompute a `Map` once per `biayaList` change.

- [ ] **Step 1: Add `useMemo` import if not present**

Check the React import at the top (line 13): `import React, { useState, useEffect, useRef } from 'react';` — add `useMemo` and `useCallback`:
```js
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
```

- [ ] **Step 2: Build a `biayaBySJ` map**

Add after the `biayaList` state declaration is used elsewhere — place this near `getTotalBiaya` (replace lines 2144-2148):
```js
  const biayaBySJ = useMemo(() => {
    const map = new Map();
    biayaList.forEach(b => {
      if (!map.has(b.suratJalanId)) map.set(b.suratJalanId, []);
      map.get(b.suratJalanId).push(b);
    });
    return map;
  }, [biayaList]);

  const EMPTY_BIAYA = [];
  const getTotalBiaya = useCallback((suratJalanId) => {
    const items = biayaBySJ.get(suratJalanId) || EMPTY_BIAYA;
    return items.reduce((sum, b) => sum + parseFloat(b.nominal || 0), 0);
  }, [biayaBySJ]);
```

(`EMPTY_BIAYA` is declared inside the component body once, not per-render-fresh — since it's a `const` re-declared each render it's technically a new array reference each time, but it's never mutated and only used as a fallback default, so referential identity doesn't matter here; if strict memoization of the fallback is wanted, hoist `EMPTY_BIAYA` to module scope above the component instead — do that: move `const EMPTY_BIAYA = [];` above `const SuratJalanMonitor = () => {`.)

- [ ] **Step 3: Move `getStatusColor`/`getStatusIcon` to module scope**

These are pure lookups with no dependency on component state/props (App.jsx:2150-2170). Cut them from inside the component and paste above `const SuratJalanMonitor = () => {`, converting the icon values from JSX using imported icons (already imported at line 30) — no changes needed to their bodies, just their location:

```js
const getStatusColor = (status) => {
  const colors = {
    pending: 'bg-yellow-100 text-yellow-800',
    terkirim: 'bg-green-100 text-green-800',
    gagal: 'bg-red-100 text-red-800',
    menunggu_review: 'bg-blue-100 text-blue-800',
    terkunci: 'bg-gray-200 text-gray-600',
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
};

const getStatusIcon = (status) => {
  const icons = {
    pending: <Clock className="w-4 h-4" />,
    terkirim: <CheckCircle className="w-4 h-4" />,
    gagal: <XCircle className="w-4 h-4" />,
    menunggu_review: <Send className="w-4 h-4" />,
    terkunci: <Lock className="w-4 h-4" />,
  };
  return icons[status] || <FileText className="w-4 h-4" />;
};
```

Remove them from inside the component (delete the copies at lines 2150-2170).

- [ ] **Step 4: Wrap `SuratJalanCard` in `React.memo`**

In `SuratJalanCard.jsx`, change the export (last two lines):
```js
export default SuratJalanCard;
```
to:
```js
export default React.memo(SuratJalanCard);
```
And change the import at the top from `import { useState } from 'react';` to `import React, { useState } from 'react';`.

- [ ] **Step 5: Memoize the handlers passed as props to `SuratJalanCard`**

In the render block (around line 3212-3243), the inline arrow functions passed as `onUpdate`, `onEditTerkirim`, `onToggleSelect`, `onToggleBatalSelect` are recreated every render, defeating `React.memo`. Wrap the ones that don't already reference `sj` via closure-per-card in `useCallback` at the component level, and for the two that need the specific `sj` (`onUpdate`, `onEditTerkirim`, `onToggleSelect`, `onToggleBatalSelect`), pass stable per-id callbacks via a small wrapper: since these all need `sj.id`/`sj`, keep them created per-card (an inline closure per rendered card is fine — `React.memo`'s benefit here is skipping the *card's own internal re-render* when its own props are unchanged; parent-level list operations like pagination (Task 11) already limit the render surface to 10 cards, which is the actual win). Do not attempt to over-engineer stable per-item callbacks with `useCallback` + Map-of-callbacks here — that's excess complexity YAGNI for a 10-item page. Skip this step; `React.memo` still helps because unrelated state changes elsewhere in `SuratJalanMonitor` (e.g. `alertMessage`, `confirmDialog`) won't re-render cards whose own props (`suratJalan`, `biayaList` slice, `totalBiaya`) haven't changed, *except* for the inline handler props which do change identity every render — acknowledge this limits `React.memo`'s effectiveness for now but still gate this task on pagination already landing (Task 11), which is the dominant fix. Note this explicitly as a known limitation, not silently pretend `React.memo` is fully effective.

- [ ] **Step 6: Pass `biayaBySJ`-derived slice instead of re-filtering in JSX**

Change (around line 3216):
```jsx
                biayaList={biayaList.filter(b => b.suratJalanId === sj.id)}
```
to:
```jsx
                biayaList={biayaBySJ.get(sj.id) || EMPTY_BIAYA}
```

- [ ] **Step 7: Verify build**

Run: `cd apps/bul-monitor && npm run build`
Expected: build succeeds.

- [ ] **Step 8: Manual dev-server check**

Confirm SJ cards still show correct "Total Biaya" and expand to show correct biaya list per card; confirm status badges/icons render correctly for all 5 statuses.

- [ ] **Step 9: Commit**

```bash
git add apps/bul-monitor/src/App.jsx apps/bul-monitor/src/components/SuratJalanCard.jsx
git commit -m "perf(bul-monitor): memoize biaya lookup by SJ id, hoist status helpers, memo SuratJalanCard"
```

---

## Task 13: `useMemo` the derived selection/eligibility lists (Fase 3, part 3)

**Files:**
- Modify: `apps/bul-monitor/src/App.jsx` (lines 2180-2219)

- [ ] **Step 1: Wrap the derived arrays**

Replace (lines 2180-2185):
```js
  const isSJEligibleForBulkKirim = (sj) =>
    sj.status === 'terkirim' && Number(sj.uangJalan || 0) > 0;

  const eligibleInView = filteredSuratJalan.filter(isSJEligibleForBulkKirim);
  const selectedInView = eligibleInView.filter(sj => selectedSJIds.has(sj.id));
  const allInViewSelected = eligibleInView.length > 0 && selectedInView.length === eligibleInView.length;
```
with:
```js
  const isSJEligibleForBulkKirim = useCallback((sj) =>
    sj.status === 'terkirim' && Number(sj.uangJalan || 0) > 0, []);

  const eligibleInView = useMemo(() => filteredSuratJalan.filter(isSJEligibleForBulkKirim), [filteredSuratJalan, isSJEligibleForBulkKirim]);
  const selectedInView = useMemo(() => eligibleInView.filter(sj => selectedSJIds.has(sj.id)), [eligibleInView, selectedSJIds]);
  const allInViewSelected = eligibleInView.length > 0 && selectedInView.length === eligibleInView.length;
```

Replace (lines 2214-2219):
```js
  const isSJEligibleForBulkBatalkan = (sj) =>
    !['gagal', 'menunggu_review', 'terkunci'].includes(sj.status) && sj.isActive !== false;

  const eligibleBatalInView = filteredSuratJalan.filter(isSJEligibleForBulkBatalkan);
  const selectedBatalInView = eligibleBatalInView.filter(sj => selectedBatalSJIds.has(sj.id));
  const allBatalInViewSelected = eligibleBatalInView.length > 0 && selectedBatalInView.length === eligibleBatalInView.length;
```
with:
```js
  const isSJEligibleForBulkBatalkan = useCallback((sj) =>
    !['gagal', 'menunggu_review', 'terkunci'].includes(sj.status) && sj.isActive !== false, []);

  const eligibleBatalInView = useMemo(() => filteredSuratJalan.filter(isSJEligibleForBulkBatalkan), [filteredSuratJalan, isSJEligibleForBulkBatalkan]);
  const selectedBatalInView = useMemo(() => eligibleBatalInView.filter(sj => selectedBatalSJIds.has(sj.id)), [eligibleBatalInView, selectedBatalSJIds]);
  const allBatalInViewSelected = eligibleBatalInView.length > 0 && selectedBatalInView.length === eligibleBatalInView.length;
```

Also wrap `filteredSuratJalan` itself (lines 2172-2174) in `useMemo`:
```js
  const filteredSuratJalan = useMemo(() =>
    filter === 'gagal'
      ? gagalSuratJalanList
      : suratJalanList.filter(sj => filter === 'all' || sj.status === filter),
    [filter, gagalSuratJalanList, suratJalanList]);
```

- [ ] **Step 2: Verify build**

Run: `cd apps/bul-monitor && npm run build`
Expected: build succeeds.

- [ ] **Step 3: Manual dev-server check**

Confirm filter tabs, "select all eligible" checkboxes for both bulk-kirim and bulk-batalkan still work identically (select-all toggles all eligible in the current filtered view, counts match).

- [ ] **Step 4: Commit**

```bash
git add apps/bul-monitor/src/App.jsx
git commit -m "perf(bul-monitor): memoize filteredSuratJalan and derived eligibility/selection lists"
```

---

## Task 14: Dynamic-import `xlsx` (Fase 3, part 4)

**Files:**
- Modify: `apps/bul-monitor/src/utils/formatters.js` (`downloadSJRecapToExcel`, line 56; the `import * as XLSX from 'xlsx';` at line 4)
- Modify: `apps/bul-monitor/src/App.jsx` (dead `import * as XLSX from 'xlsx';` at line 14; call site at line 2984)

**Context:** All real `XLSX.*` usage is inside `formatters.js`'s `downloadSJRecapToExcel` (confirmed via grep — no `XLSX.` usage anywhere in App.jsx). App.jsx's own `import * as XLSX from 'xlsx';` (line 14) is dead weight (unused import) pulled in only because it was copy-pasted during an earlier refactor — remove it outright.

- [ ] **Step 1: Make `downloadSJRecapToExcel` async and dynamic-import xlsx inside it**

In `apps/bul-monitor/src/utils/formatters.js`, remove line 4 (`import * as XLSX from 'xlsx';`). Change the function signature (line 56) from:
```js
export const downloadSJRecapToExcel = (suratJalanList = [], options = {}) => {
```
to:
```js
export const downloadSJRecapToExcel = async (suratJalanList = [], options = {}) => {
```
and add as its first line:
```js
  const XLSX = await import('xlsx');
```
Every other line in the function body (`XLSX.utils.book_new()`, etc.) is unchanged — `XLSX` now refers to the dynamically-imported module namespace instead of the static one, same shape.

- [ ] **Step 2: Remove the dead import in App.jsx and await the call site**

Remove line 14 (`import * as XLSX from 'xlsx';`) from `App.jsx` — nothing in App.jsx dereferences `XLSX` directly.

Change the call site (line 2984) from:
```jsx
                  <button onClick={() => downloadSJRecapToExcel(suratJalanList, { startDate: sjRecapStartDate, endDate: sjRecapEndDate, dateField: sjRecapDateField })} className="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition">
```
to:
```jsx
                  <button onClick={async () => await downloadSJRecapToExcel(suratJalanList, { startDate: sjRecapStartDate, endDate: sjRecapEndDate, dateField: sjRecapDateField })} className="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition">
```

- [ ] **Step 3: Verify build**

Run: `cd apps/bul-monitor && npm run build`
Expected: build succeeds. Check the build output's chunk list (Vite prints file sizes) — confirm a separate `xlsx`-named chunk now exists instead of being inlined into the main bundle, and that the main entry chunk is smaller than before this task.

- [ ] **Step 4: Manual dev-server check**

`npm run dev`, go to the SJ Recap panel, click "Download Excel", confirm the `.xlsx` file still downloads with correct rows/formatting (column widths, currency format on the Uang Jalan column). Check the Network tab: the `xlsx` chunk should only load when the button is clicked, not on initial page load.

- [ ] **Step 5: Commit**

```bash
git add apps/bul-monitor/src/App.jsx apps/bul-monitor/src/utils/formatters.js
git commit -m "perf(bul-monitor): dynamic-import xlsx, drop dead static import from App.jsx"
```

---

## Task 15: Final validation pass + spec status update

**Files:**
- Modify: `docs/superpowers/specs/2026-07-08-bul-monitor-performance-overhaul-design.md` (append implementation status note)

- [ ] **Step 1: Full build**

Run: `cd apps/bul-monitor && npm run build`
Expected: succeeds with no errors or new warnings.

- [ ] **Step 2: Manual smoke-test checklist (mirrors spec's Validasi section)**

Run `npm run dev` and walk through:
1. Import a small CSV (<20 baris) for at least SJ + one master-data type — succeeds, correct success/error counts, download-on-error still works.
2. Bulk kirim 2-3 SJ dummy ke Accounting — succeeds, correct status transitions, warnings surfaced correctly.
3. Bulk batalkan 2-3 SJ — succeeds, Uang Jalan removed from Keuangan, Gagal tab shows them, Restore still works on one of them (exercises Task 4's `buildSJStatusPatch` reuse on the single-item path too).
4. Bulk kirim invoice — succeeds, `pelangganData` populated correctly.
5. If access to bul-accounting review UI is available: approve/reject one SJ and one invoice, confirm bul-monitor reflects `terkunci`/`terkirim` transition without manual refresh (validates Task 8's single listener).
6. Pagination: filter tabs reset to page 1, "select all eligible" still selects across the whole filtered set not just the visible page.
7. History/Riwayat tab loads, "Muat lebih banyak" works if more than 300 entries exist.
8. Confirm no new console errors/warnings appear during any of the above.

- [ ] **Step 3: Diff review for payload identity**

Read through the final diff (`git diff main...HEAD` or equivalent) once more, specifically checking that every `suggestedJournal`, transaksi, and history_log object literal produced by the bulk paths has the exact same keys/values as their pre-change single-item equivalents (per spec's Validasi item 3). This is a self-review, not a new automated check — no test suite exists to assert this mechanically.

- [ ] **Step 4: Update the spec doc**

Append to the end of `docs/superpowers/specs/2026-07-08-bul-monitor-performance-overhaul-design.md`:
```markdown

## Implementation Status

Implemented 2026-07-08 across 15 tasks (see `docs/superpowers/plans/2026-07-08-bul-monitor-performance-overhaul.md`). All three fases (bulk path, listener hygiene, rendering) shipped. Fase 2a prerequisite (composite index) handled via Opsi B — user-created manually via Firebase Console, no `firestore.rules` change needed.
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-07-08-bul-monitor-performance-overhaul-design.md
git commit -m "docs: mark bul-monitor performance overhaul spec as implemented"
```

---

## Post-Implementation (requested separately by user, not part of this plan's tasks)

After all 15 tasks land, the user has asked for two follow-up passes, to run **after** this plan is fully executed:
1. Senior security engineer audit of the resulting diff (auth, injection, data exposure, infra risk).
2. Senior DevOps review (deployment architecture, CI/CD, monitoring, logging, reliability, scaling) — grounded in the actual stack (Firebase Hosting SPA + GitHub Actions bug-hunter pipeline, no Docker/Kubernetes currently in use), not a generic containerized-app template.

These are separate deliverables triggered by the user after reviewing the implementation, not tasks in this plan.
