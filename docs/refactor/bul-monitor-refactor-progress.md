# bul-monitor App.jsx — Refactor Progress

**Last updated:** 2026-06-16
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

**Current layout of `apps/bul-monitor/src/`:** `App.jsx` (shrinking) +
`components/` (6 files above) + `utils/formatters.js`.

Every PR: body **byte-identical** (no logic/symbol change), `npm run build` green,
read-only Playwright E2E before/after = **MATCH**, console 0 errors.

---

## 🔶 Remaining (NOT done) — all touch money / writes, need human review

Line numbers below are from the **original** map snapshot and have shifted — always
re-locate with `grep -n` on the current `App.jsx`.

| Unit | What | Why deferred |
|------|------|--------------|
| **U12b** | Firestore-write helpers: `C`, `softDeleteItemInFirestore`, `resolveSuratJalanDocRef`, `softDeactivateTransaksiInFirestore`, `deactivateUangJalanTransaksiForSJ`, `upsertItemToFirestore` → `src/services/` | Write-path can't be E2E-verified under read-only scope (would write to production Firestore). Currently still inline in `App.jsx`. |
| **U7** | `LaporanKas` (kas report) | Financial: `uangJalan` totals, per-PT kas summaries. Move UI shell only, keep aggregation byte-identical. |
| **U8** | `KeuanganManagement` | Financial: `totalPemasukan`/`totalPengeluaran`/`saldoKas`. |
| **U9** | `InvoiceManagement` | Financial: `hargaSatuan`/`totalNilai`, invoice CSV export, accounting bridge. |
| **U10** | `SuratJalanCard` | Financial display + lock-state guards (`menunggu_review`/`terkunci`). Depends on `getStatusColor`/`getStatusIcon` (defined inside `SuratJalanMonitor`). |
| **U11** | `Modal` (>1100 lines, ~15 modal types) | Largest/most complex; financial form inputs. Recommend splitting per-entity in a later phase, not one shot. |

---

## How we work (process that's been validated)

1. **Branch from `origin/main`** (NOT local `main` — it has diverged un-pushed commits;
   `git checkout -B <branch> origin/main`). One unit per PR.
2. **Baseline E2E:** `cd apps/bul-monitor && npm run dev`, log in via Playwright MCP,
   navigate to where the unit renders, capture a deterministic fingerprint
   (normalized `outerHTML` → length + hash, plus key text/counts).
3. **Extract:** move the unit to `components/` or `utils/`/`services/`. **Pure structural
   move** — body byte-identical, only add the imports the new file needs. For big units,
   build the new file from exact source lines (`sed -n 'A,Bp' App.jsx`) instead of retyping.
4. **Remove inline def from App.jsx:** `grep -n` the boundary, then `sed -i 'A,Bd'`
   (line-number delete is safe with CRLF). Add the import with the Edit tool.
5. **Validate:** `npm run build` (exit 0), reload, re-capture the same fingerprint = MATCH,
   `console all:false` = 0 errors. (A transient HMR 500 mid-edit is harmless — verify the
   final state after a full reload.)
6. **PR + merge:** `gh pr create` (title `[E2E-verified]`) → `gh pr merge <n> --squash --delete-branch`.

## Hard constraints (do not violate)

- **bul-monitor points at PRODUCTION Firebase** — no staging, no emulator
  (`apps/bul-monitor/.env`). **E2E is READ-ONLY**: never trigger create/edit/delete/
  invoice/uang-muka/integration-sync flows (they write to production).
- **Never change financial logic.** Money helpers/components move byte-identical and get
  flagged for accountant review (see CLAUDE.md Finance Guardrails).
- **Login is manual:** the user types credentials into the Playwright MCP browser; the
  session persists in the browser profile. `LoginScreen`-type units (logged-out views)
  should be verified **last** so the session isn't lost mid-batch.
- Never `firebase deploy`; never push to `main` directly; never touch `firestore.rules`,
  auth files, or `firebase-config`.

## Gotchas

- Run `git` from the worktree path.
- `gh pr merge --delete-branch` may warn "not possible to fast-forward" (local `main`
  diverged) — the **remote** squash-merge still succeeds; just branch fresh from `origin/main` next.
- If the merge can't delete the local branch (checked out in a worktree), delete it
  manually after switching away.

## Suggested next step

`U12b` (Firestore-write services) is the natural prerequisite for the financial pages,
**but** it (and U7–U11) need accountant/human review and can't be fully E2E-verified
read-only. Decide per-unit whether to proceed with byte-identical moves + build + flagged
review, or pause for review first.

**Related:** decomposition map (`docs/refactor/bul-monitor-decomposition-map.md`),
agent spec (`.claude/agents/monolith-refactor.md`).
