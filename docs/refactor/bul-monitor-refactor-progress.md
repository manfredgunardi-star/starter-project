# bul-monitor App.jsx — Refactor Progress

**Last updated:** 2026-06-17
**origin/main tip:** `cb0f7f5`
**Goal:** Incrementally decompose `apps/bul-monitor/src/App.jsx` (monolith) into focused
files **without changing behavior**, per the `monolith-refactor` agent + decomposition map
([`docs/refactor/bul-monitor-decomposition-map.md`](./bul-monitor-decomposition-map.md)).

---

## ✅ Done (merged to `main`)

| Unit | What | File created | PR | Squash commit |
|------|------|--------------|----|---------------|
| U2 | `StatCard` | `src/components/StatCard.jsx` | #28 | `766c3f2` |
| U1 | `SearchableSelect` | `src/components/SearchableSelect.jsx` | #29 | `f266aa9` |
| U4 | `UsersManagement` | `src/components/UsersManagement.jsx` | #30 | `06d0483` |
| U5 | `SettingsManagement` | `src/components/SettingsManagement.jsx` | #31 | `235fac1` |
| U3 | `LoginScreen` | `src/components/LoginScreen.jsx` | #32 | `5994c59` |
| U12a | Pure helpers (`formatCurrency`, `formatTanggalID`, `generateSessionId`, `buildUangJalanTransaksiId`, `sanitizeForFirestore`, `downloadSJRecapToExcel`) | `src/utils/formatters.js` | #33 | `9f343bc` |
| U6 | `MasterDataManagement` | `src/components/MasterDataManagement.jsx` | #34 | `7a94954` |
| **U12b** | Firestore-write helpers (`C`, `softDeleteItemInFirestore`, `resolveSuratJalanDocRef`, `softDeactivateTransaksiInFirestore`, `deactivateUangJalanTransaksiForSJ`, `upsertItemToFirestore`) | `src/services/firestoreWrites.js` | #36 | `84dc91e` |
| **U7** | `LaporanKas` (kas report, read-only aggregation) | `src/components/LaporanKas.jsx` | #39 | `cf83fa7` |
| **U8** | `KeuanganManagement` (kas totals, read-only display) | `src/components/KeuanganManagement.jsx` | #41 | `954fe0d` |
| **U9** | `InvoiceManagement` (invoice display + CSV export, render-only E2E) | `src/components/InvoiceManagement.jsx` | #42 | `d31ce4f` |
| **U10** | `SuratJalanCard` (SJ card: uangJalan display + lock guards) | `src/components/SuratJalanCard.jsx` | #43 | `2506241` |
| **U11a** | `Modal` (~1100 lines, 24 type branches) — whole-component extract | `src/components/Modal.jsx` | #44 | `48ea41e` |
| **U11b** | Master-data modal forms split (Truck/Supir/Pelanggan/Rute/Material) | `src/components/modals/*.jsx` | #45 | `cb0f7f5` |

**Also merged (related cleanups / fixes found during the work):**

| What | PR | Squash commit |
|------|----|---------------|
| Remove dead pre-namespace `firestoreService.js` (footgun: wrote to un-namespaced collections) | #37 | `dcfb2f7` |
| Fix: gagal Surat Jalan unrecoverable via UI — superadmin Restore button was unreachable after refresh (added "Gagal" filter + separate list; UI-only, no money-formula change) | #38 | `bff9cff` |

**Current layout of `apps/bul-monitor/src/`:** `App.jsx` (now the `SuratJalanMonitor`
container + module-scope helpers/subscriptions only) +
`components/` (11 files: StatCard, SearchableSelect, UsersManagement, SettingsManagement,
LoginScreen, MasterDataManagement, LaporanKas, KeuanganManagement, InvoiceManagement,
SuratJalanCard, **Modal**) + `components/modals/` (5 master-data form fields:
TruckFormFields, SupirFormFields, PelangganFormFields, RuteFormFields, MaterialFormFields) +
`utils/formatters.js` + `services/firestoreWrites.js`. **All U1–U11 map units extracted.**

Every PR: body **byte-identical** (no logic/symbol change), `npm run build` green,
read-only Playwright E2E before/after = **MATCH**, console 0 errors.

### U12b — write-path manually verified (post-merge)

U12b moves **write-path** helpers, which a read-only E2E cannot exercise. After merge, a
**manual write test was performed against production** (local dev server running the merged
code + the user clicking the write actions; verification done read-only via the Firestore
REST API with the user's session token). **Result — all core helpers PASS:**
`upsertItemToFirestore` (create+update, landed in `bul_*` namespaced collections, not raw),
`softDeleteItemInFirestore` (`isActive:false` + audit fields), and **`deactivateUangJalanTransaksiForSJ`**
(SJ→gagal flips `TX-UJ-<id>` to `isActive:false`, nominal intact, no extra fields).
`resolveSuratJalanDocRef` (invoice path) and `softDeactivateTransaksiInFirestore` (no
call-sites) were not exercised. **Still recommended:** accountant review of the
uang-jalan deactivation behavior (evidence captured in session).

### U8 — read-only E2E verified

`KeuanganManagement` moved **byte-identical** (`diff` of body = empty). It is a read-only
display: `totalPemasukan`/`totalPengeluaran`/`saldoKas` computed from props; all mutations
stay in App.jsx via parent callbacks. Removed now-orphan `DollarSign` from the App.jsx
lucide import. Keuangan-tab fingerprint **baseline == after**: Pemasukan `Rp 0` /
Pengeluaran `Rp 233.300.000` / Saldo `-Rp 233.300.000`; 487 tx cards; panel `len 733876`,
`djb2 506290839`; `npm run build` green; 0 console errors. Financial component — flagged for
accountant review (no money formula changed).

### U9 — render-only E2E verified

`InvoiceManagement` moved **byte-identical** (`diff` of body = empty; App.jsx 33–494). The map
flagged it high-coupling, but reading the full body it is actually **self-contained**: no
module-scope deps, no `db`/`C()`/Firestore writes, and **no XLSX** (the "Export Excel" button
builds a CSV `Blob` by hand). All mutations stay in App.jsx via parent callbacks
(`onAddInvoice`/`onDeleteInvoice`/`onKirimInvoiceKeAccounting`/`onBulkKirimInvoiceKeAccounting`).
The `formatCurrency` prop is passed but **unused** in the body — kept byte-identical, not
imported. Added imports: `{ useState, useEffect }` + lucide `{ Send, Lock, Plus, Clock,
CheckCircle, FileText, Package, XCircle }`; **no orphan** lucide left in App.jsx (all 8 still
used). Invoicing tab fingerprint **baseline == after** on both filters: *Belum Terinvoice*
stats 18/184/303, `len 126489`/`djb2 1387670884`; *Sudah Terinvoice* 18 cards,
`len 192460`/`djb2 1382809739`; build green; 0 console errors. E2E strictly render-only —
the tab's "kirim ke accounting" + bulk actions write to production and were **not** triggered.
Financial component — flagged for accountant review (no money formula changed).

### U10 — render-only E2E verified

`SuratJalanCard` moved **byte-identical** (`diff` of body = empty; App.jsx 3389–3617). Confirmed
de-risked: `getStatusColor`/`getStatusIcon` **and** `formatCurrency` are all received as **props**
(already wired at the render site), so no module-scope promotion was needed. No `db`/`C()`/
Firestore writes; all mutations via parent callbacks (`onUpdate`/`onMarkGagal`/`onRestore`/
`onEditTerkirim`/`onKirimKeAccounting`/select toggles); only local state is `expanded`. Added
imports: `{ useState }` + lucide `{ CheckCircle, Edit, XCircle, RefreshCw, Send, Lock, Eye }`;
removed now-orphan `RefreshCw` + `Eye` from the App.jsx lucide import. SJ-list fingerprint
**baseline == after**: 487 cards rendered, combined outerHTML `len 1203775`, `djb2 2826146173`,
sample SJ `06504` / Uang Jalan `Rp 270.000`; build green; 0 console errors. E2E strictly
render-only (no mark-gagal/restore/edit/kirim). Financial display — flagged for accountant
review (no money formula changed).

### U11a — Modal whole-component extract (render-only E2E verified)

`Modal` (~1100 lines, 24 `type` branches) moved **byte-identical** (`diff` of body = empty;
App.jsx 3390–4495) into `components/Modal.jsx`. Scan of the block: **no `db`/`C()`/Firestore
calls and no references to any App.jsx module-scope helper** — the only component dependency is
`SearchableSelect` (U1). All submit logic delegates to the parent `onSubmit` (data shape
untouched). App.jsx: added `Modal` import, removed now-orphan `SearchableSelect` import (Modal
was its only remaining consumer) + `Search` from the lucide import. New file imports
`React, { useState, useEffect }` + lucide `{ Package, CheckCircle, XCircle, Search }` +
`SearchableSelect`. Render-only E2E **baseline (inline) == after (extracted)** for 3 modal
types opened (never submitted): addSJ `len 4811`/`djb2 3368551750`, addInvoice
`len 178983`/`djb2 660210977`, addTruck `len 1122`/`djb2 2122576305`; build green; 0 console
errors. Financial form component — flagged for accountant review.

### U11b — master-data modal forms split (render-only E2E verified)

Behavior-preserving split of the **5 non-financial master-data form blocks** out of `Modal.jsx`
into per-entity presentational sub-components under `components/modals/` (Truck/Supir/Pelanggan/
Rute/Material), each taking `{ formData, setFormData }`. `Modal.jsx` keeps `formData` +
`handleSubmit` + **all** financial branches; submit/validation logic and data shape **unchanged**.
Scoped to master-data only (maintainer decision) — financial sub-modals (SJ/Invoice/Transaksi/
Biaya) and the entangled `User` form stay in `Modal.jsx`. Note: the Rute form has a master
`uangJalan` (default-rate) input — markup only; its addRute/editRute submit stays byte-identical.
Render-only E2E **baseline (inline) == after (split)** for all 5 master modals: addTruck
`1122`/`2122576305`, addSupir `1354`/`948811654`, addRute `1119`/`2361446401`, addMaterial
`1087`/`4123302731`, addPelanggan `1352`/`2318103960`; financial control addSJ unchanged
(`4811`/`3368551750`); build green; 0 console errors both states.

---

## 🔶 Remaining (NOT done) — financial Modal internals only

All U1–U11 decomposition-map units are extracted. What remains is an **optional, deferred**
further split of the **financial** branches still living inside `components/Modal.jsx`.

| Item | What | Why deferred |
|------|------|--------------|
| Modal financial sub-modals | Split `addSJ`/`markTerkirim`/`editTerkirim`, `addInvoice`/`editInvoice`, `addTransaksi`, `biaya` (and the entangled `addUser`/`editUser`) out of `Modal.jsx` | Their **submit payloads are money/data-shape-critical and cannot be verified read-only** (submit writes to production). Needs accountant review + a deliberate manual write test before any split. Render-only fingerprints prove the form *renders* the same but not that it *submits* the same. |

### If/when resuming the financial Modal split
- Keep `Modal.jsx` as the owner of `formData` + `handleSubmit`; extract only **presentational field fragments** (`{ formData, setFormData }` + any list/currentUser props) so the submit shape stays byte-identical — same pattern as U11b.
- The `User` form is inside the financial ternary chain (App.jsx render ~880–933 in the pre-extract numbering) — extracting it means touching that chain's structure; do it carefully and fingerprint addUser/editUser.
- Verify each with render-only fingerprints **and** a user-driven manual submit test against production (see U12b precedent), with accountant sign-off on the resulting Firestore payloads.

---

## How we work (validated process)

1. **Branch from `origin/main`** (NOT local `main` — it has diverged un-pushed commits):
   `git checkout -b <branch> origin/main`. One unit per PR.
2. **Baseline E2E:** `cd apps/bul-monitor && npm run dev`, log in via Playwright MCP,
   navigate to where the unit renders, capture a deterministic fingerprint (normalized
   text/`outerHTML` → length + djb2 hash, plus key currency values/counts).
3. **Extract:** move the unit to `components/`/`utils/`/`services/`. **Pure structural move**
   — body byte-identical, only add the imports the new file needs. Build big files from exact
   source lines (`sed -n 'A,Bp' App.jsx`) instead of retyping; `diff` the body to prove identity.
4. **Remove inline def from App.jsx:** `grep -n` the boundary, then `sed -i 'A,Bd'`
   (line-number delete is CRLF-safe). Add the import with the Edit tool. Drop any now-orphan import.
5. **Validate:** `npm run build` (exit 0), reload, re-capture the same fingerprint = MATCH,
   `console all:false` = 0 errors.
6. **PR + merge:** `gh pr create --draft` (title `[E2E-verified]`) → `gh pr ready <n>` →
   `gh pr merge <n> --squash --delete-branch`.

## Hard constraints (do not violate)

- **bul-monitor points at PRODUCTION Firebase** — no staging/emulator (`apps/bul-monitor/.env`).
  **E2E is READ-ONLY**: never trigger create/edit/delete/invoice/uang-muka/integration-sync
  (they write to production). Exception: a deliberate, user-driven post-merge manual write test
  for write-path units (see U12b above).
- **Never change financial logic.** Money helpers/components move byte-identical and get
  flagged for accountant review (CLAUDE.md Finance Guardrails).
- **Login is manual:** the user types credentials into the Playwright MCP browser; the session
  persists in the browser profile. Logged-out (`LoginScreen`-type) units verified **last**.
- Never `firebase deploy`; never push to `main` directly; never touch `firestore.rules`,
  auth files, or `firebase-config`.

## Gotchas

- Run `git` from the worktree path.
- **Worktree builds need setup:** a fresh worktree has **no `node_modules` and no `.env`**
  (both gitignored). To build/run there: create a junction
  `New-Item -ItemType Junction -Path <wt>/apps/bul-monitor/node_modules -Target C:\Project\apps\bul-monitor\node_modules`,
  and `cp C:\Project\apps\bul-monitor\.env <wt>/apps/bul-monitor/.env`. Vite must be restarted
  to pick up `.env`. Remove the junction + stop dev when done.
- **Read-only Firestore verification (no Console needed):** in the running app's page context,
  `const cfg = await import('/src/config/firebase-config.js')`, get a token via
  `cfg.auth.currentUser.getIdToken()`, then `fetch` the Firestore REST API
  (`https://firestore.googleapis.com/v1/projects/<projectId>/databases/(default)/documents/<coll>/<id>`)
  with `Authorization: Bearer <token>`. Confirms the `bul_` namespace + raw field values, read-only.
- **Merge from a worktree:** detach first (`git checkout --detach`) so
  `gh pr merge --delete-branch` can delete the local branch; the remote squash-merge succeeds
  even when the local/remote branch deletion step errors on detached HEAD — clean up branches
  manually (`git branch -D` + `git push origin --delete`) afterward.

## Suggested next step

**Decomposition of all U1–U11 map units is complete** (origin/main `cb0f7f5`). `App.jsx` is now
the `SuratJalanMonitor` container + module-scope helpers/subscriptions; every section/component/
modal lives under `components/` (+ `components/modals/`, `utils/`, `services/`).

Remaining optional work (no longer on the critical path):
- **Financial Modal sub-split** (deferred) — split SJ/Invoice/Transaksi/Biaya/User branches out
  of `Modal.jsx`; gated on accountant review + manual submit test (see "Remaining" above).
- **Accountant review backlog** — money components moved byte-identical across U7–U11 + U12b;
  none changed a formula, but all are flagged for an accountant pass.
- Optional: further slim `App.jsx` (e.g. extract the Firestore subscription cluster / helpers
  into `services/`), if desired.

**Related:** decomposition map (`docs/refactor/bul-monitor-decomposition-map.md`),
agent spec (`.claude/agents/monolith-refactor.md`).
