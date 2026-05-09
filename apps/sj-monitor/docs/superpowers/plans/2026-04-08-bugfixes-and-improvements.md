# Bugfixes & Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all identified bugs (async modal submit, string concatenation in financial calculations, missing error handling, silent error swallowing, missing isActive in bulk imports, negative value validation) and apply improvements.

**Architecture:** All changes are in `src/App.jsx`. Each task is a self-contained fix that can be verified independently. No new files, no structural changes — just targeted fixes.

**Tech Stack:** React, Firebase Firestore, Tailwind CSS (existing)

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/App.jsx:2808-2809` | Add `await` to `addSuratJalan` in modal submit |
| Modify | `src/App.jsx:1028,1043,1148,1163` | Wrap `um.jumlah` with `Number()` in all UM reduce calls |
| Modify | `src/App.jsx:610-625` | Wrap `addHistoryLog` body in try-catch |
| Modify | `src/App.jsx:986` | Replace `Promise.all` with `Promise.allSettled` in `persistInvoiceWithFallback` |
| Modify | `src/App.jsx:769,820` | Replace silent `.catch(() => {})` with proper error handling in delete functions |
| Modify | `src/App.jsx:4349-4357` | Add negative value validation for Rute financial fields |
| Modify | `src/App.jsx:4297-4299` | Add zero/negative validation for Transaksi nominal |
| Modify | `src/App.jsx:1770-1777,1816-1822` | Add `isActive: true` to rute and material bulk import |
| Modify | `src/App.jsx:1131` | Wrap `sj.qtyBongkar` with `Number()` in editInvoice totalQty |

---

### Task 1: Fix missing `await` on `addSuratJalan` in modal submit

**Files:**
- Modify: `src/App.jsx:2808-2810`

- [ ] **Step 1: Add `await` to `addSuratJalan(data)`**

In `src/App.jsx`, find the modal onSubmit handler (around line 2807-2810). Find this exact code:

```javascript
            if (modalType === 'addSJ') {
              addSuratJalan(data);
              setShowModal(false);
```

Change to:

```javascript
            if (modalType === 'addSJ') {
              await addSuratJalan(data);
              setShowModal(false);
```

- [ ] **Step 2: Verify the app builds**

Run: `cd /c/Project/sj-monitor && npm run build 2>&1 | tail -5`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
cd /c/Project/sj-monitor
git add src/App.jsx
git commit -m "fix: await addSuratJalan in modal submit to prevent premature close"
```

---

### Task 2: Fix `um.jumlah` string concatenation in all invoice UM calculations

There are 4 places where `um.jumlah` is used in a reduce without `Number()` wrapping. If `um.jumlah` is stored as a string in Firestore (e.g. from manual edits or imports), `s + (um.jumlah || 0)` will concatenate instead of add.

**Files:**
- Modify: `src/App.jsx:1028,1043,1148,1163`

- [ ] **Step 1: Fix `addInvoice` — `totalUM` calculation (line 1028)**

Find this exact code (around line 1026-1029):

```javascript
        return selectedSJs.reduce((sum, sj) => {
          const umForSJ = uangMukaList.filter(um => um.sjId === sj.id);
          return sum + umForSJ.reduce((s, um) => s + (um.jumlah || 0), 0);
        }, 0);
```

Change to:

```javascript
        return selectedSJs.reduce((sum, sj) => {
          const umForSJ = uangMukaList.filter(um => um.sjId === sj.id);
          return sum + umForSJ.reduce((s, um) => s + Number(um.jumlah || 0), 0);
        }, 0);
```

- [ ] **Step 2: Fix `addInvoice` — `totalHargaAfterUM` calculation (line 1043)**

Find this exact code (around line 1041-1044):

```javascript
        const totalUMVal = selectedSJs.reduce((sum, sj) => {
          const umForSJ = uangMukaList.filter(um => um.sjId === sj.id);
          return sum + umForSJ.reduce((s, um) => s + (um.jumlah || 0), 0);
        }, 0);
```

Change to:

```javascript
        const totalUMVal = selectedSJs.reduce((sum, sj) => {
          const umForSJ = uangMukaList.filter(um => um.sjId === sj.id);
          return sum + umForSJ.reduce((s, um) => s + Number(um.jumlah || 0), 0);
        }, 0);
```

- [ ] **Step 3: Fix `editInvoice` — `totalUM` calculation (line 1148)**

Find this exact code (around line 1146-1149):

```javascript
        return selectedSJs.reduce((sum, sj) => {
          const umForSJ = uangMukaList.filter(um => um.sjId === sj.id);
          return sum + umForSJ.reduce((s, um) => s + (um.jumlah || 0), 0);
        }, 0);
```

This is the second occurrence of this pattern (inside `editInvoice`). Change to:

```javascript
        return selectedSJs.reduce((sum, sj) => {
          const umForSJ = uangMukaList.filter(um => um.sjId === sj.id);
          return sum + umForSJ.reduce((s, um) => s + Number(um.jumlah || 0), 0);
        }, 0);
```

- [ ] **Step 4: Fix `editInvoice` — `totalHargaAfterUM` calculation (line 1163)**

Find this exact code (around line 1161-1164):

```javascript
        const totalUMVal = selectedSJs.reduce((sum, sj) => {
          const umForSJ = uangMukaList.filter(um => um.sjId === sj.id);
          return sum + umForSJ.reduce((s, um) => s + (um.jumlah || 0), 0);
        }, 0);
```

This is the second occurrence of the `totalUMVal` pattern (inside `editInvoice`). Change to:

```javascript
        const totalUMVal = selectedSJs.reduce((sum, sj) => {
          const umForSJ = uangMukaList.filter(um => um.sjId === sj.id);
          return sum + umForSJ.reduce((s, um) => s + Number(um.jumlah || 0), 0);
        }, 0);
```

- [ ] **Step 5: Fix `editInvoice` — `totalQty` missing Number() (line 1131)**

Find this exact code (around line 1129-1131):

```javascript
      totalQty: updatedSJList
        .filter(sj => newSJIds.includes(sj.id))
        .reduce((sum, sj) => sum + (sj.qtyBongkar || 0), 0),
```

Change to:

```javascript
      totalQty: updatedSJList
        .filter(sj => newSJIds.includes(sj.id))
        .reduce((sum, sj) => sum + Number(sj.qtyBongkar || 0), 0),
```

- [ ] **Step 6: Verify the app builds**

Run: `cd /c/Project/sj-monitor && npm run build 2>&1 | tail -5`
Expected: Build succeeds with no errors.

- [ ] **Step 7: Commit**

```bash
cd /c/Project/sj-monitor
git add src/App.jsx
git commit -m "fix: wrap um.jumlah and qtyBongkar with Number() to prevent string concatenation in invoice calculations"
```

---

### Task 3: Add try-catch to `addHistoryLog`

**Files:**
- Modify: `src/App.jsx:610-625`

- [ ] **Step 1: Wrap addHistoryLog body in try-catch**

Find this exact code (lines 610-625):

```javascript
  const addHistoryLog = async (action, suratJalanId, suratJalanNo, details = {}) => {
    const newLog = {
      id: 'LOG-' + Date.now(),
      action, // 'mark_gagal', 'restore_from_gagal', 'mark_terkirim', 'create_invoice', etc
      suratJalanId,
      suratJalanNo,
      details, // Additional info
      timestamp: new Date().toISOString(),
      user: currentUser.name,
      userRole: currentUser.role
    };
    
    const newHistoryLog = [...historyLog, newLog];
    setHistoryLog(newHistoryLog);
await upsertItemToFirestore(db, "history_log", { ...newLog, isActive: true });
  };
```

Change to:

```javascript
  const addHistoryLog = async (action, suratJalanId, suratJalanNo, details = {}) => {
    const newLog = {
      id: 'LOG-' + Date.now(),
      action, // 'mark_gagal', 'restore_from_gagal', 'mark_terkirim', 'create_invoice', etc
      suratJalanId,
      suratJalanNo,
      details, // Additional info
      timestamp: new Date().toISOString(),
      user: currentUser?.name || 'system',
      userRole: currentUser?.role || 'unknown'
    };
    
    const newHistoryLog = [...historyLog, newLog];
    setHistoryLog(newHistoryLog);
    try {
      await upsertItemToFirestore(db, "history_log", { ...newLog, isActive: true });
    } catch (err) {
      console.error('[addHistoryLog] Firestore error:', err);
    }
  };
```

- [ ] **Step 2: Verify the app builds**

Run: `cd /c/Project/sj-monitor && npm run build 2>&1 | tail -5`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
cd /c/Project/sj-monitor
git add src/App.jsx
git commit -m "fix: add try-catch to addHistoryLog and use optional chaining for currentUser"
```

---

### Task 4: Fix `persistInvoiceWithFallback` — use `Promise.allSettled` for SJ updates

**Files:**
- Modify: `src/App.jsx:986-996`

- [ ] **Step 1: Replace Promise.all with Promise.allSettled**

Find this exact code (lines 986-996):

```javascript
    const resolved = await Promise.all((sjIdsToPersist || []).map(async (sjId) => ({ sjId, ref: await resolveSuratJalanDocRef(db, sjId) })));
    for (const { sjId, ref } of resolved) {
      if (!ref) continue;
      await setDoc(ref, sanitizeForFirestore({
        statusInvoice: 'terinvoice',
        invoiceId: invoiceDoc.id,
        invoiceNo: invoiceDoc.noInvoice,
        updatedAt: nowIso,
        updatedBy: who,
      }), { merge: true });
    }
```

Change to:

```javascript
    const resolveResults = await Promise.allSettled((sjIdsToPersist || []).map(async (sjId) => ({ sjId, ref: await resolveSuratJalanDocRef(db, sjId) })));
    const resolved = resolveResults
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value);
    const failedResolves = resolveResults.filter(r => r.status === 'rejected');
    if (failedResolves.length > 0) {
      console.warn(`[persistInvoice] ${failedResolves.length} SJ gagal resolve:`, failedResolves.map(r => r.reason));
    }
    for (const { sjId, ref } of resolved) {
      if (!ref) continue;
      try {
        await setDoc(ref, sanitizeForFirestore({
          statusInvoice: 'terinvoice',
          invoiceId: invoiceDoc.id,
          invoiceNo: invoiceDoc.noInvoice,
          updatedAt: nowIso,
          updatedBy: who,
        }), { merge: true });
      } catch (err) {
        console.error(`[persistInvoice] Gagal update SJ ${sjId}:`, err);
      }
    }
```

- [ ] **Step 2: Verify the app builds**

Run: `cd /c/Project/sj-monitor && npm run build 2>&1 | tail -5`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
cd /c/Project/sj-monitor
git add src/App.jsx
git commit -m "fix: use Promise.allSettled in persistInvoiceWithFallback to prevent all-or-nothing SJ update failures"
```

---

### Task 5: Replace silent `.catch(() => {})` in delete functions with proper error handling

**Files:**
- Modify: `src/App.jsx:764-778` (deleteTruck)
- Modify: `src/App.jsx:814-828` (deleteSupir)

- [ ] **Step 1: Fix `deleteTruck` — add error handling and conditional UI update**

Find this exact code (lines 764-778):

```javascript
  const deleteTruck = async (id) => {
    setConfirmDialog({
      show: true,
      message: "Yakin ingin menghapus truck ini?",
      onConfirm: async () => {
        await softDeleteItemInFirestore(db, "trucks", id, currentUser?.name || "system").catch(() => {});

        setTruckList((prevList) => {
          const newList = prevList.filter((t) => t.id !== id);
return newList;
        });

        setConfirmDialog({ show: false, message: "", onConfirm: null });
      },
    });
  };
```

Change to:

```javascript
  const deleteTruck = async (id) => {
    setConfirmDialog({
      show: true,
      message: "Yakin ingin menghapus truck ini?",
      onConfirm: async () => {
        try {
          await softDeleteItemInFirestore(db, "trucks", id, currentUser?.name || "system");
          setTruckList((prevList) => prevList.filter((t) => t.id !== id));
        } catch (err) {
          console.error('[deleteTruck] Firestore error:', err);
          setAlertMessage("⚠️ Gagal menghapus truck. Cek koneksi / Console (F12).");
        }
        setConfirmDialog({ show: false, message: "", onConfirm: null });
      },
    });
  };
```

- [ ] **Step 2: Fix `deleteSupir` — remove redundant try-catch-catch and add proper error handling**

Find this exact code (lines 814-828):

```javascript
  const deleteSupir = async (id) => {
    setConfirmDialog({
      show: true,
      message: "Yakin ingin menghapus supir ini?",
      onConfirm: async () => {
        try {
          await softDeleteItemInFirestore(db, "supir", id, currentUser?.name || "system").catch(() => {});
        } catch (err) {
          console.error("Error soft-deleting supir:", err);
        }

        setSupirList((prevList) => prevList.filter((s) => s.id !== id));
        setConfirmDialog({ show: false, message: "", onConfirm: null });
      },
    });
  };
```

Change to:

```javascript
  const deleteSupir = async (id) => {
    setConfirmDialog({
      show: true,
      message: "Yakin ingin menghapus supir ini?",
      onConfirm: async () => {
        try {
          await softDeleteItemInFirestore(db, "supir", id, currentUser?.name || "system");
          setSupirList((prevList) => prevList.filter((s) => s.id !== id));
        } catch (err) {
          console.error('[deleteSupir] Firestore error:', err);
          setAlertMessage("⚠️ Gagal menghapus supir. Cek koneksi / Console (F12).");
        }
        setConfirmDialog({ show: false, message: "", onConfirm: null });
      },
    });
  };
```

- [ ] **Step 3: Verify the app builds**

Run: `cd /c/Project/sj-monitor && npm run build 2>&1 | tail -5`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
cd /c/Project/sj-monitor
git add src/App.jsx
git commit -m "fix: replace silent .catch(() => {}) in delete functions with proper error handling and user alerts"
```

---

### Task 6: Add negative value validation for financial fields

**Files:**
- Modify: `src/App.jsx:4348-4357` (Rute submit validation)
- Modify: `src/App.jsx:4297-4299` (Transaksi submit validation)

- [ ] **Step 1: Add negative validation for Rute fields**

Find this exact code (around lines 4347-4357):

```javascript
    } else if (type === 'addRute' || type === 'editRute') {
      if (!formData.rute || !formData.uangJalan) {
        setAlertMessage('Rute dan Uang Jalan harus diisi!');
        return;
      }
      onSubmit({
        rute: formData.rute,
        uangJalan: parseFloat(formData.uangJalan),
        ritasi: parseFloat(formData.ritasi) || 0,
        uangMuka: parseFloat(formData.uangMuka) || 0
      });
```

Change to:

```javascript
    } else if (type === 'addRute' || type === 'editRute') {
      if (!formData.rute || !formData.uangJalan) {
        setAlertMessage('Rute dan Uang Jalan harus diisi!');
        return;
      }
      if (parseFloat(formData.uangJalan) < 0 || parseFloat(formData.ritasi) < 0 || parseFloat(formData.uangMuka) < 0) {
        setAlertMessage('Uang Jalan, Ritasi, dan Uang Muka tidak boleh negatif!');
        return;
      }
      onSubmit({
        rute: formData.rute,
        uangJalan: parseFloat(formData.uangJalan),
        ritasi: parseFloat(formData.ritasi) || 0,
        uangMuka: parseFloat(formData.uangMuka) || 0
      });
```

- [ ] **Step 2: Add zero/negative validation for Transaksi nominal**

Find this exact code (around lines 4297-4300):

```javascript
      if (!formData.tipe || !formData.pt || !formData.nominal || !formData.keteranganTransaksi) {
        setAlertMessage('Semua field harus diisi!');
        return;
      }
```

Change to:

```javascript
      if (!formData.tipe || !formData.pt || !formData.nominal || !formData.keteranganTransaksi) {
        setAlertMessage('Semua field harus diisi!');
        return;
      }
      if (parseFloat(formData.nominal) <= 0) {
        setAlertMessage('Nominal harus lebih besar dari 0!');
        return;
      }
```

- [ ] **Step 3: Verify the app builds**

Run: `cd /c/Project/sj-monitor && npm run build 2>&1 | tail -5`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
cd /c/Project/sj-monitor
git add src/App.jsx
git commit -m "fix: add negative value validation for Rute financial fields and Transaksi nominal"
```

---

### Task 7: Add missing `isActive: true` to Rute and Material bulk imports

**Files:**
- Modify: `src/App.jsx:1770-1777` (Rute bulk import)
- Modify: `src/App.jsx:1816-1822` (Material bulk import)

- [ ] **Step 1: Add `isActive: true` to Rute bulk import**

Find this exact code (around lines 1770-1777):

```javascript
                const newRute = {
                  id: 'RUT-' + Date.now() + '-' + i + '-' + Math.random().toString(36).substr(2, 9),
                  rute: values[0],
                  uangJalan: uangJalan,
                  uangMuka: uangMuka,
                  createdAt: new Date().toISOString(),
                  createdBy: currentUser.name
                };
```

Change to:

```javascript
                const newRute = {
                  id: 'RUT-' + Date.now() + '-' + i + '-' + Math.random().toString(36).substr(2, 9),
                  rute: values[0],
                  uangJalan: uangJalan,
                  uangMuka: uangMuka,
                  isActive: true,
                  createdAt: new Date().toISOString(),
                  createdBy: currentUser.name
                };
```

- [ ] **Step 2: Add `isActive: true` to Material bulk import**

Find this exact code (around lines 1816-1822):

```javascript
                const newMaterial = {
                  id: 'MTR-' + Date.now() + '-' + i + '-' + Math.random().toString(36).substr(2, 9),
                  material: values[0],
                  satuan: values[1],
                  createdAt: new Date().toISOString(),
                  createdBy: currentUser.name
                };
```

Change to:

```javascript
                const newMaterial = {
                  id: 'MTR-' + Date.now() + '-' + i + '-' + Math.random().toString(36).substr(2, 9),
                  material: values[0],
                  satuan: values[1],
                  isActive: true,
                  createdAt: new Date().toISOString(),
                  createdBy: currentUser.name
                };
```

- [ ] **Step 3: Verify the app builds**

Run: `cd /c/Project/sj-monitor && npm run build 2>&1 | tail -5`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
cd /c/Project/sj-monitor
git add src/App.jsx
git commit -m "fix: add missing isActive field to Rute and Material bulk CSV imports"
```

---

### Task 8: Final build verification and deploy

- [ ] **Step 1: Run final build**

Run: `cd /c/Project/sj-monitor && npm run build 2>&1 | tail -10`
Expected: Build succeeds with no errors.

- [ ] **Step 2: Deploy to Firebase**

Run: `cd /c/Project/sj-monitor && npx firebase-tools deploy --only hosting,firestore:rules 2>&1`
Expected: Deploy complete with hosting and firestore rules released.

---

## Summary of All Fixes

| # | Type | Fix | Lines |
|---|------|-----|-------|
| 1 | Bug | `await addSuratJalan(data)` — prevent modal closing before Firestore write | 2808-2809 |
| 2 | Bug | `Number(um.jumlah || 0)` in all 4 UM reduce calls + `Number(sj.qtyBongkar)` in editInvoice | 1028,1043,1131,1148,1163 |
| 3 | Bug | try-catch in `addHistoryLog` + optional chaining for `currentUser` | 610-625 |
| 4 | Bug | `Promise.allSettled` + per-SJ try-catch in `persistInvoiceWithFallback` | 986-996 |
| 5 | Bug | Replace `.catch(() => {})` with proper try-catch + alert in `deleteTruck`/`deleteSupir` | 764-828 |
| 6 | Improvement | Negative value validation for Rute fields + zero/negative for Transaksi nominal | 4297,4348 |
| 7 | Bug | Add `isActive: true` to Rute and Material bulk import objects | 1770,1816 |
| 8 | Deploy | Final build + deploy to Firebase | — |

Total: 7 tasks + deploy, all in `src/App.jsx`.
