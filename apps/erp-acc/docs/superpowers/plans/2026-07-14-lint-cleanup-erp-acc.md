# ERP-ACC Lint Cleanup (Bug-Hunter Findings) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clear all 87 ESLint findings (73 errors, 14 warnings) reported by the bug-hunter pipeline in `apps/erp-acc/erp-app`, without changing any observable runtime behavior.

**Architecture:** No new abstractions. Each task is an independent, narrowly-scoped fix verified by running ESLint on just the files it touches, ending with a full `npm run lint` (expect `0 problems`) and `npm run build`. Two categories of fix:
1. **Config fixes** (missing Node globals for test files, relaxed unused-arg patterns) that eliminate whole classes of findings at once.
2. **Targeted code fixes** — some are genuine bugs (StockCardPage, CreditNotesPage), some are dead code removal, some are deliberate lint-suppression because the "textbook" fix would touch 40+ files for a dev-only warning with zero runtime impact.

**Tech Stack:** React 18, Vite, ESLint 9 (flat config), eslint-plugin-react-hooks v7, eslint-plugin-react-refresh, antd v6.

## Global Constraints

- Every task must leave `apps/erp-acc/erp-app` building cleanly: `npm run build` (run from `apps/erp-acc/erp-app`).
- Do not change any financial calculation, journal posting, tax, COA, or stock valuation logic. None of the findings in this report require touching those — if a task ever seems to need it, STOP and ask the user first (per `apps/erp-acc/erp-app/CLAUDE.md`).
- Do not restructure files beyond what's specified in a task. No drive-by refactors.
- Do not add new npm dependencies.
- Every `useEffect` dependency-array change must preserve identical runtime behavior — verified by reasoning given in each task, not just by silencing the linter. Where a step's safety depends on a specific fact (e.g. "this value is referentially stable"), that fact has already been verified against the actual source during planning — it is stated in the task, not something to re-derive.
- Run all commands from `apps/erp-acc/erp-app` unless stated otherwise.
- One commit per task, conventional commit style (`fix:`, `chore:`).
- **Execute tasks in numeric order, 1 through 10, with no exceptions.** Task 5 depends on Task 3 already being done (Task 3 deliberately leaves its effect's dependency array as `[partyType]`, with one intentional residual `toast` exhaustive-deps warning — Task 5 is the task that adds `toast` to it, finishing what Task 3 left open). Task 6 depends on Task 5 already being done (three of its four `useCallback`s are only safe to give a `[toast]` dependency once Task 5 has stabilized `useToast()`; the fourth, `loadData`, has no such dependency since it never calls `toast`). Numeric order already satisfies both dependencies — do not reorder or parallelize Tasks 3, 5, 6.

## Model & Effort Assignment (for Codex execution)

| Task | Model | Why |
|---|---|---|
| 1. ESLint config | GPT-5.5 | Mechanical config edit, one file. |
| 2. StockCardPage immutability fix | GPT-5.6 | Requires understanding why the reduce rewrite is numerically identical to the original mutable-accumulator loop before touching a real (if non-financial) calculation. |
| 3. CreditNotesPage set-state-in-effect fix | GPT-5.6 | Requires preserving the `cancelled`-flag cleanup semantics exactly while restructuring control flow. |
| 4. React-refresh suppressions | GPT-5.5 | Three one-line inline-disable comments, no logic change. |
| 5. Stabilize useToast + wire 8 dependency arrays | GPT-5.6 | Correctness depends on understanding *why* `message` is stable (antd source-level fact) — a model that mechanically "adds the missing dep everywhere" without understanding this could get it wrong on a file this plan didn't anticipate. Also carries the mandatory network-loop smoke test. |
| 6. useCallback-wrap 4 loader functions | GPT-5.6 | Same class of risk as Task 5 (wrong deps reintroduce infinite-fetch bugs), plus a declaration-ordering constraint (`useCallback` must be declared before the effect that references it, or it's a TDZ `ReferenceError` at runtime — not something ESLint catches here) that a model applying the pattern mechanically could easily get backwards. |
| 7. currency.js regex fix | GPT-5.5 | Single-character mechanical fix. |
| 8. Unused vars (production files) | GPT-5.5 | Mechanical, but Codex must follow the plan's explicit instruction to suppress (not delete) `DashboardPage.jsx`'s `Icon` — flag this constraint clearly when dispatching. |
| 9. Unused vars (Playwright tests) | GPT-5.5 | Mechanical, lowest risk in the whole plan (test-only files). |
| 10. Final verification | GPT-5.5 | Runs two commands and reports output — no judgment calls. |

Tasks 5 and 6 are the only ones with genuine runtime-regression risk (infinite loops) if done carelessly — everything else is either config, mechanical deletion, or a fix already verified against the actual source during planning.

---

## Pre-flight: verified facts this plan depends on

These were checked against the actual codebase while writing this plan (not assumptions):

1. `AntdApp.useApp()` (antd v6, `node_modules/antd/es/app/App.js`) returns `message` wrapped in `React.useMemo(() => ({ message: messageApi, ... }), [messageApi, notificationApi, ModalApi])` — i.e. `message` is referentially stable across re-renders of the same `<App>` provider instance. This is why Task 5's `useMemo`-wrapped `useToast()` is safe to add to dependency arrays without causing re-render loops.
2. `react-router-dom`'s `useSearchParams()` memoizes the returned `URLSearchParams` on `location.search` — safe to add `searchParams` to a dependency array (PaymentFormPage, Task 5).
3. `loadCOAList`, `loadLists`, `loadCategories` (AssetCategoryFormModal, AssetPaymentFields, AssetCategoriesPage) take no reactive arguments *other than* `toast` (which they each call internally for error reporting) — safe to wrap in `useCallback(fn, [toast])` **once Task 5 has stabilized `useToast()`**, which is why Task 6 must run after Task 5. `loadData` (AssetDetailPage) closes over `id` only (never calls `toast`) — `useCallback(fn, [id])`, no ordering dependency on Task 5. In all four cases, **the `useCallback` declaration must appear before the `useEffect` that references it in its dependency array** — the dependency array is evaluated immediately as part of the `useEffect(...)` call, unlike the effect's callback body (which only runs after the whole component function finishes executing), so referencing a not-yet-initialized `const` there throws `ReferenceError: Cannot access '...' before initialization`. This was caught during review of the first draft of this plan (Codex flagged it pre-flight, before any file was touched) and is now reflected correctly in Task 6's steps.
4. `DashboardPage.jsx`'s flagged `Icon` (line 40) **is genuinely used** in JSX at line 45 (`<Icon size={22} .../>`). It is flagged only because this project's ESLint config has no `eslint-plugin-react` (only `react-hooks` + `react-refresh`), so plain `no-unused-vars` doesn't track JSX-element-name usage for destructured/renamed bindings. **Do not delete `Icon`** — doing so breaks the Dashboard's metric card icons at runtime. Fix is a targeted suppression (Task 8), not deletion.
5. `AssetPaymentFields.jsx`'s `isPaymentValid` export is not imported anywhere else in `src/` (checked via project-wide grep) — the `react-refresh/only-export-components` warning there is about Fast Refresh only, not dead-export cleanup. Do not delete it; it may be used by future code or was left as a public helper deliberately. Out of scope to investigate further.
6. `useAuth` (44 importers) and `useToast` (38 importers) are consumed across nearly the whole app. Splitting their hooks into separate files to satisfy `react-refresh/only-export-components` "properly" would require updating 80+ import statements for a rule that only affects Vite Fast Refresh during `npm run dev` — it has zero production runtime effect. This plan deliberately suppresses those 3 warnings inline instead (Task 4) rather than doing the large refactor. This was a judgment call made during planning, not an oversight — flag to the user if a future reviewer disagrees.

---

### Task 1: ESLint config — Node/Playwright globals + relaxed unused-arg patterns

**Files:**
- Modify: `apps/erp-acc/erp-app/eslint.config.js`
- Modify: `apps/erp-acc/erp-app/tests/master-data-tier1.spec.js:2`

**Interfaces:** None (config only).

**Context (added after this task was first executed):** `tests/master-data-tier1.spec.js` was not part of the original 87 findings — it was already lint-clean *before* this task, because it carries its own local `/* global process */` comment declaring `process` as a known global. That comment becomes redundant, and conflicts, once this task's config change declares `process` (via `globals.node`) for every file under `tests/`: ESLint's `no-redeclare` rule (part of `eslint:recommended`) then flags the comment as redeclaring a global that's already declared. This was caught by Codex during execution, verified against the actual file during this revision (confirmed via `npx eslint`: the file is clean before this task, produces exactly one `no-redeclare` error after only the config change, and is clean again once the comment is removed), and the whole `tests/`/`playwright/` tree was re-swept for any other occurrence of `/* global ... */` or `/* eslint-env ... */` comments — this is the only one in the codebase, so no other file needs this fix.

- [ ] **Step 1: Update the config**

Replace the full contents of `apps/erp-acc/erp-app/eslint.config.js` with:

```js
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', {
        varsIgnorePattern: '^[A-Z_]',
        argsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
    },
  },
  {
    files: ['playwright.config.js', 'playwright/**/*.js', 'tests/**/*.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
])
```

This is a two-part change:
- `argsIgnorePattern: '^_'` and `caughtErrorsIgnorePattern: '^_'` let intentionally-unused function/catch parameters be named with a leading underscore instead of being flagged (used by Tasks 8 and 9).
- The new second config block adds Node globals (`process`, etc.) for `playwright.config.js`, everything under `playwright/`, and everything under `tests/` — these run under Node via the Playwright test runner, not in a browser.

- [ ] **Step 2: Remove the now-redundant global comment in master-data-tier1.spec.js**

In `apps/erp-acc/erp-app/tests/master-data-tier1.spec.js`, change:

```js
// erp-app/tests/master-data-tier1.spec.js
/* global process */
import { test, expect } from '@playwright/test'
```

to:

```js
// erp-app/tests/master-data-tier1.spec.js
import { test, expect } from '@playwright/test'
```

- [ ] **Step 3: Verify it clears every `no-undef 'process'` finding and the new no-redeclare**

Run: `npx eslint playwright.config.js playwright/ tests/`
Expected: zero `no-undef` and zero `no-redeclare` errors remain. (Some `no-unused-vars` findings in these same files will still show — those are handled in Task 9.)

- [ ] **Step 4: Commit**

```bash
git add eslint.config.js tests/master-data-tier1.spec.js
git commit -m "chore(erp-acc): add Node globals for test files and relax unused-arg lint pattern"
```

---

### Task 2: Fix StockCardPage.jsx immutability violation

**Files:**
- Modify: `apps/erp-acc/erp-app/src/pages/inventory/StockCardPage.jsx:1,25-40`

**Context:** ESLint flags `runningBalance += ...` (line 31) as reassigning a variable during render (`react-hooks/immutability`), even though it's already inside `useMemo`. The fix below was verified during planning: it produces byte-identical `balance` values (same cumulative sum, same order) using `Array.prototype.reduce` instead of a mutable outer `let`, and was confirmed via `npx eslint` to clear the error with zero other regressions.

- [ ] **Step 1: Remove the unused import and rewrite the balance calculation**

In `apps/erp-acc/erp-app/src/pages/inventory/StockCardPage.jsx`, change line 4 from:

```js
import { formatDate, formatDateInput, today } from '../../utils/date'
```

to:

```js
import { formatDate, today } from '../../utils/date'
```

Then replace:

```js
  // Compute running balance
  const movementsWithBalance = useMemo(() => {
    let runningBalance = 0
    return movements.map(m => {
      const incoming = m.type === 'in' ? m.quantity_original : 0
      const outgoing = m.type === 'out' ? m.quantity_original : 0

      runningBalance += m.type === 'in' ? m.quantity_original : -m.quantity_original

      return {
        ...m,
        incoming,
        outgoing,
        balance: runningBalance,
      }
    })
  }, [movements])
```

with:

```js
  // Compute running balance
  const movementsWithBalance = useMemo(() => {
    return movements.reduce((acc, m) => {
      const incoming = m.type === 'in' ? m.quantity_original : 0
      const outgoing = m.type === 'out' ? m.quantity_original : 0
      const prevBalance = acc.length > 0 ? acc[acc.length - 1].balance : 0
      const balance = prevBalance + (m.type === 'in' ? m.quantity_original : -m.quantity_original)
      acc.push({ ...m, incoming, outgoing, balance })
      return acc
    }, [])
  }, [movements])
```

- [ ] **Step 2: Verify**

Run: `npx eslint src/pages/inventory/StockCardPage.jsx`
Expected: no output (0 problems).

- [ ] **Step 3: Manual smoke test**

Run `npm run dev`, open the app, navigate to Kartu Stok (Stock Card), pick any product with movements. Confirm the "Saldo" (balance) column values are identical to before the change (same cumulative pattern: increases on "Masuk", decreases on "Keluar"). This is a pure refactor — the arithmetic is unchanged, only the accumulation mechanism.

- [ ] **Step 4: Commit**

```bash
git add src/pages/inventory/StockCardPage.jsx
git commit -m "fix(erp-acc): compute stock card running balance without mutating a render-scoped variable"
```

---

### Task 3: Fix CreditNotesPage.jsx set-state-in-effect violation

**Files:**
- Modify: `apps/erp-acc/erp-app/src/pages/shared/CreditNotesPage.jsx:18-34`

**Context:** `setLoading(true)` was called as the first synchronous statement in the effect body. `react-hooks/set-state-in-effect` flags any direct `setState` call at the top level of an effect body — it does NOT flag it when the same call happens one level down, inside a named function invoked by the effect (this is exactly why the existing `useQuery.js` hook — same "loading" pattern — is never flagged: its `setLoading(true)` lives inside a `useCallback`-wrapped function, not directly in the effect). The fix wraps the existing logic in a local async function, preserving the `cancelled` cleanup-flag pattern exactly. Verified via `npx eslint` during planning: clears the error with 0 other problems (only the pre-existing `toast` exhaustive-deps warning remains, which Task 5 also fixes on this same file).

- [ ] **Step 1: Rewrite the effect**

In `apps/erp-acc/erp-app/src/pages/shared/CreditNotesPage.jsx`, replace:

```js
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getCreditNotes({ partyType })
      .then(async data => {
        if (cancelled) return
        setRows(data)
        const ids = [...new Set(data.map(r => r.party_id))]
        const nameMap = partyType === 'customer'
          ? await getCustomerNames(ids)
          : await getSupplierNames(ids)
        if (!cancelled) setNames(nameMap)
      })
      .catch(err => toast.error(err.message))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [partyType])
```

with:

```js
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const data = await getCreditNotes({ partyType })
        if (cancelled) return
        setRows(data)
        const ids = [...new Set(data.map(r => r.party_id))]
        const nameMap = partyType === 'customer'
          ? await getCustomerNames(ids)
          : await getSupplierNames(ids)
        if (!cancelled) setNames(nameMap)
      } catch (err) {
        if (!cancelled) toast.error(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [partyType])
```

Note: the dependency array stays `[partyType]` here — do **not** add `toast` in this task. `toast` is currently a new object on every render (not yet stabilized), so adding it now would make this effect re-run on every render. Task 5 stabilizes `useToast()` and adds `toast` to this same dependency array as one of its own steps. Tasks in this plan run in numeric order (1→10), so Task 5 always executes after this task — by the time Task 5 runs, this file already has the `load()` restructuring in place, and Task 5 only needs to change the dependency array.

- [ ] **Step 2: Verify**

Run: `npx eslint src/pages/shared/CreditNotesPage.jsx`
Expected: exactly one remaining warning: `React Hook useEffect has a missing dependency: 'toast'`. This is expected and intentional — Task 5 resolves it. Confirm the `set-state-in-effect` error is gone and no other error/warning appears.

- [ ] **Step 3: Manual smoke test**

Run `npm run dev`, navigate to the Credit Notes page, switch between "Customer"/"Supplier" toggle a few times. Confirm the list reloads correctly each time and the loading spinner still appears/disappears as before.

- [ ] **Step 4: Commit**

```bash
git add src/pages/shared/CreditNotesPage.jsx
git commit -m "fix(erp-acc): move CreditNotesPage data fetch into a named async function to avoid synchronous setState in effect"
```

---

### Task 4: Suppress react-refresh warnings (deliberate, not a file split)

**Files:**
- Modify: `apps/erp-acc/erp-app/src/contexts/AuthContext.jsx:73`
- Modify: `apps/erp-acc/erp-app/src/components/ui/ToastContext.jsx:7`
- Modify: `apps/erp-acc/erp-app/src/components/assets/AssetPaymentFields.jsx:406`

**Context:** See "Pre-flight fact 6" above — these 3 hooks/helpers are each imported by dozens of files. `react-refresh/only-export-components` only affects Vite's Hot Module Replacement during `npm run dev` (state resets on save) — it has no effect on production builds or runtime correctness. Splitting each into its own file would mean updating 40+ (AuthContext), 38+ (ToastContext), and 1 (AssetPaymentFields — low-risk but grouped here for consistency) import statements for a DX-only warning. This task suppresses the 3 specific lines instead. Verified via `npx eslint` during planning: all 3 clear to 0 errors.

- [ ] **Step 1: Suppress in AuthContext.jsx**

In `apps/erp-acc/erp-app/src/contexts/AuthContext.jsx`, change:

```js
export const useAuth = () => useContext(AuthContext)
```

to:

```js
// eslint-disable-next-line react-refresh/only-export-components -- HMR-only rule; splitting this hook into a separate file means updating 40+ import sites for zero runtime benefit
export const useAuth = () => useContext(AuthContext)
```

- [ ] **Step 2: Suppress in ToastContext.jsx**

In `apps/erp-acc/erp-app/src/components/ui/ToastContext.jsx`, change:

```js
export function useToast() {
```

to:

```js
// eslint-disable-next-line react-refresh/only-export-components -- HMR-only rule; splitting this hook into a separate file means updating 38+ import sites for zero runtime benefit
export function useToast() {
```

(This edit will be superseded by Task 5, which rewrites this same function body — apply Task 5 right after this step, or do them in the same commit.)

- [ ] **Step 3: Suppress in AssetPaymentFields.jsx**

In `apps/erp-acc/erp-app/src/components/assets/AssetPaymentFields.jsx`, change:

```js
export function isPaymentValid(payment, totalAmount) {
```

to:

```js
// eslint-disable-next-line react-refresh/only-export-components -- HMR-only rule; this helper is only used together with the default export
export function isPaymentValid(payment, totalAmount) {
```

- [ ] **Step 4: Verify**

Run: `npx eslint src/contexts/AuthContext.jsx src/components/ui/ToastContext.jsx src/components/assets/AssetPaymentFields.jsx`
Expected: no `react-refresh/only-export-components` errors. (AssetPaymentFields will still show its pre-existing `loadLists` exhaustive-deps warning — fixed in Task 6.)

- [ ] **Step 5: Commit**

```bash
git add src/contexts/AuthContext.jsx src/components/ui/ToastContext.jsx src/components/assets/AssetPaymentFields.jsx
git commit -m "chore(erp-acc): suppress react-refresh HMR warnings for widely-shared hooks

Splitting useAuth/useToast into separate files would require updating 80+
import sites for a dev-only Fast Refresh warning with no production impact."
```

---

### Task 5: Stabilize useToast() and wire it into missing dependency arrays

**Files:**
- Modify: `apps/erp-acc/erp-app/src/components/ui/ToastContext.jsx`
- Modify: `apps/erp-acc/erp-app/src/pages/shared/CreditNotesPage.jsx` (if not already done as part of Task 3)
- Modify: `apps/erp-acc/erp-app/src/pages/accounting/ManualJournalFormPage.jsx:58-72`
- Modify: `apps/erp-acc/erp-app/src/pages/cash/PaymentFormPage.jsx:55-84`
- Modify: `apps/erp-acc/erp-app/src/pages/purchase/PurchaseInvoiceFormPage.jsx:50-137`
- Modify: `apps/erp-acc/erp-app/src/pages/sales/SalesInvoiceFormPage.jsx:58-154`

**Context:** `useToast()` currently returns a brand-new object literal on every render, so ESLint correctly refuses to let callers add `toast` to a dependency array (it would re-run the effect on every render). Per "Pre-flight fact 1", `AntdApp.useApp()`'s `message` is already referentially stable, so wrapping the returned object in `useMemo` keyed on `message` makes `toast` stable too — verified via `npx eslint` during planning (0 problems after the change) and via reading antd v6's own source (`node_modules/antd/es/app/App.js`) to confirm `message` itself doesn't change identity across renders of the same `<App>` provider.

- [ ] **Step 1: Stabilize useToast()**

In `apps/erp-acc/erp-app/src/components/ui/ToastContext.jsx`, replace the full file with:

```js
import { useMemo } from 'react'
import { App as AntdApp } from 'antd'

export function ToastProvider({ children }) {
  return <>{children}</>
}

// eslint-disable-next-line react-refresh/only-export-components -- HMR-only rule; splitting this hook into a separate file means updating 38+ import sites for zero runtime benefit
export function useToast() {
  const { message } = AntdApp.useApp()
  return useMemo(() => ({
    success: (msg) => message.success(msg),
    error: (msg) => message.error(msg),
    info: (msg) => message.info(msg),
    warning: (msg) => message.warning(msg)
  }), [message])
}
```

- [ ] **Step 2: CreditNotesPage — add toast to the effect from Task 3**

Task 3 already restructured this effect into a `load()` function but deliberately left the dependency array as `[partyType]`. In `apps/erp-acc/erp-app/src/pages/shared/CreditNotesPage.jsx`, change:

```js
    load()
    return () => { cancelled = true }
  }, [partyType])
```

to:

```js
    load()
    return () => { cancelled = true }
  }, [partyType, toast])
```

- [ ] **Step 3: ManualJournalFormPage — add toast dependency**

In `apps/erp-acc/erp-app/src/pages/accounting/ManualJournalFormPage.jsx`, change:

```js
  }, [id, isNew])
```

(the effect ending at line 72, which loads the journal being edited) to:

```js
  }, [id, isNew, toast])
```

- [ ] **Step 4: PaymentFormPage — add searchParams and toast dependencies**

In `apps/erp-acc/erp-app/src/pages/cash/PaymentFormPage.jsx`, change:

```js
  useEffect(() => {
    const invoiceId = searchParams.get('invoice')
    const paymentType = searchParams.get('type')
    if (invoiceId && paymentType === 'outgoing') {
      getPurchaseInvoice(invoiceId)
        .then(inv => {
          setForm(f => ({ ...f, supplier_id: inv.supplier_id }))
        })
        .catch(err => toast.error(err.message))
    }
  }, [])
```

to:

```js
  useEffect(() => {
    const invoiceId = searchParams.get('invoice')
    const paymentType = searchParams.get('type')
    if (invoiceId && paymentType === 'outgoing') {
      getPurchaseInvoice(invoiceId)
        .then(inv => {
          setForm(f => ({ ...f, supplier_id: inv.supplier_id }))
        })
        .catch(err => toast.error(err.message))
    }
  }, [searchParams, toast])
```

And change:

```js
  }, [form.customer_id, form.supplier_id, form.type])
```

(the second `useEffect`, currently ending at line 84) to:

```js
  }, [form.customer_id, form.supplier_id, form.type, toast])
```

- [ ] **Step 5: PurchaseInvoiceFormPage — add toast to 3 effects**

In `apps/erp-acc/erp-app/src/pages/purchase/PurchaseInvoiceFormPage.jsx`, change each of these three dependency arrays (leave the effect bodies untouched):

```js
  }, [])
```
(the first one, ending the `getPaymentTerms()` effect at line 54) to:
```js
  }, [toast])
```

```js
  }, [id, isNew])
```
(ending the `getPurchaseInvoice` effect at line 90) to:
```js
  }, [id, isNew, toast])
```

```js
  }, [header.supplier_id])
```
(ending the `getAvailableCredit` effect at line 137) to:
```js
  }, [header.supplier_id, toast])
```

Do **not** touch the effect at line 106 (`}, [] // eslint-disable-line react-hooks/exhaustive-deps`) — it's already deliberately suppressed for a different reason (runs once on mount by design) and is not part of the 87 findings.

- [ ] **Step 6: SalesInvoiceFormPage — add toast to 3 effects**

In `apps/erp-acc/erp-app/src/pages/sales/SalesInvoiceFormPage.jsx`, apply the same pattern as Step 5 (this file mirrors PurchaseInvoiceFormPage):

```js
  }, [])
```
(ending the `getPaymentTerms()` effect at line 62) to:
```js
  }, [toast])
```

```js
  }, [id, isNew])
```
(ending the `getSalesInvoice` effect at line 106) to:
```js
  }, [id, isNew, toast])
```

```js
  }, [header.customer_id])
```
(ending the `getAvailableCredit` effect at line 154) to:
```js
  }, [header.customer_id, toast])
```

Leave the line-122 effect (`}, [] // eslint-disable-line react-hooks/exhaustive-deps`) untouched.

- [ ] **Step 7: Verify**

Run: `npx eslint src/components/ui/ToastContext.jsx src/pages/shared/CreditNotesPage.jsx src/pages/accounting/ManualJournalFormPage.jsx src/pages/cash/PaymentFormPage.jsx src/pages/purchase/PurchaseInvoiceFormPage.jsx src/pages/sales/SalesInvoiceFormPage.jsx`
Expected: no `toast`-related `exhaustive-deps` warnings remain in any of these files. (`ManualJournalFormPage.jsx` and `PurchaseInvoiceFormPage.jsx`/`SalesInvoiceFormPage.jsx` may still show unrelated warnings/errors handled in other tasks — only confirm the `toast` ones are gone.)

- [ ] **Step 8: Manual smoke test (important — this is a runtime risk, not just a lint check)**

Run `npm run dev`, open browser DevTools Network tab, and for each of: Credit Notes page, Manual Journal form, Payment form (both incoming and outgoing), Purchase Invoice form, Sales Invoice form — load the page and watch for 10 seconds. Confirm there is **no repeating/looping network request** (e.g. the same `getPurchaseInvoice`/`getSalesInvoice`/`getCreditNotes` call firing over and over). One request per page load is expected; a loop means `toast` is not actually stable and this task must be reverted and re-investigated before proceeding.

- [ ] **Step 9: Commit**

```bash
git add src/components/ui/ToastContext.jsx src/pages/shared/CreditNotesPage.jsx src/pages/accounting/ManualJournalFormPage.jsx src/pages/cash/PaymentFormPage.jsx src/pages/purchase/PurchaseInvoiceFormPage.jsx src/pages/sales/SalesInvoiceFormPage.jsx
git commit -m "fix(erp-acc): stabilize useToast() return value and add it to effect dependency arrays"
```

---

### Task 6: Wrap loader functions in useCallback and fix their effect dependencies

**Files:**
- Modify: `apps/erp-acc/erp-app/src/components/assets/AssetCategoryFormModal.jsx:1,34-58,60`
- Modify: `apps/erp-acc/erp-app/src/components/assets/AssetPaymentFields.jsx:1,41-43,45`
- Modify: `apps/erp-acc/erp-app/src/pages/assets/AssetCategoriesPage.jsx:1,26-28,30`
- Modify: `apps/erp-acc/erp-app/src/pages/assets/AssetDetailPage.jsx:1,38-40,42`

**Context:** Each of these effects calls a loader function (`loadCOAList`, `loadLists`, `loadCategories`, `loadData`) that is recreated on every render (plain `const fn = async () => {...}` or `async function fn() {...}`, not memoized). Adding the function directly to the effect's dependency array without memoizing it first would make the effect re-run on every render (infinite fetch loop), because the function reference changes every time. Per "Pre-flight fact 3": `loadCOAList`, `loadLists`, `loadCategories` each call `toast.error(...)` internally, so once wrapped in `useCallback` they need `useCallback(fn, [toast])` — safe only after Task 5 has stabilized `useToast()` (this is why this task runs after Task 5). `loadData` closes over `id` only, never calls `toast`, and needs `useCallback(fn, [id])` — no dependency on Task 5. In all four cases the `useCallback` declaration must be moved to appear *before* the `useEffect` that references it, to avoid a TDZ `ReferenceError` (see Step 1 below for why).

- [ ] **Step 1: AssetCategoryFormModal.jsx**

Add `useCallback` to the React import (line 1):

```js
import { useState, useEffect, useCallback } from 'react'
```

**This task must run after Task 5** — the fix below adds `toast` to a `useCallback` dependency array, which is only safe once `useToast()` is stabilized (Task 5). Since tasks run in numeric order, Task 5 has already landed by the time this runs.

Wrap the loader in `useCallback`, **moving its declaration to appear before the `useEffect` that calls it** (a `const` referenced in a dependency array is evaluated immediately at that point in the render — unlike a plain function call inside a deferred effect callback — so if the `useCallback` declaration stayed below the effect, referencing it in the effect's dependency array would throw `ReferenceError: Cannot access 'loadCOAList' before initialization`, a real runtime bug, not just a lint issue). Change:

```js
  // Load COA list when modal opens
  useEffect(() => {
    if (open) {
      loadCOAList()
      if (editData) {
        setFormData({
          code: editData.code || '',
          name: editData.name || '',
          default_useful_life_months: editData.default_useful_life_months || '',
          asset_account_id: editData.asset_account_id || '',
          accumulated_depreciation_account_id: editData.accumulated_depreciation_account_id || '',
          depreciation_expense_account_id: editData.depreciation_expense_account_id || ''
        })
      } else {
        setFormData({
          code: '',
          name: '',
          default_useful_life_months: '',
          asset_account_id: '',
          accumulated_depreciation_account_id: '',
          depreciation_expense_account_id: ''
        })
      }
      setFormErrors({})
    }
  }, [open, editData])

  const loadCOAList = async () => {
    try {
      setLoadingCOA(true)
      const { data, error } = await supabase
        .from('coa')
        .select('id, code, name')
        .eq('is_active', true)
        .order('code')
      if (error) throw error
      setCoaList(data || [])
    } catch (err) {
      toast.error(`Gagal memuat daftar akun: ${err.message}`)
    } finally {
      setLoadingCOA(false)
    }
  }
```

to (note the loader now comes *first*, and its own `useCallback` dependency array is `[toast]`, not `[]` — it calls `toast.error(...)` internally, so ESLint's exhaustive-deps rule checks `useCallback` bodies too, and would otherwise flag a brand-new missing-dependency warning that didn't exist before this refactor):

```js
  const loadCOAList = useCallback(async () => {
    try {
      setLoadingCOA(true)
      const { data, error } = await supabase
        .from('coa')
        .select('id, code, name')
        .eq('is_active', true)
        .order('code')
      if (error) throw error
      setCoaList(data || [])
    } catch (err) {
      toast.error(`Gagal memuat daftar akun: ${err.message}`)
    } finally {
      setLoadingCOA(false)
    }
  }, [toast])

  // Load COA list when modal opens
  useEffect(() => {
    if (open) {
      loadCOAList()
      if (editData) {
        setFormData({
          code: editData.code || '',
          name: editData.name || '',
          default_useful_life_months: editData.default_useful_life_months || '',
          asset_account_id: editData.asset_account_id || '',
          accumulated_depreciation_account_id: editData.accumulated_depreciation_account_id || '',
          depreciation_expense_account_id: editData.depreciation_expense_account_id || ''
        })
      } else {
        setFormData({
          code: '',
          name: '',
          default_useful_life_months: '',
          asset_account_id: '',
          accumulated_depreciation_account_id: '',
          depreciation_expense_account_id: ''
        })
      }
      setFormErrors({})
    }
  }, [open, editData, loadCOAList])
```

- [ ] **Step 2: AssetPaymentFields.jsx**

Add `useCallback` to the React import (line 1):

```js
import { useState, useEffect, useCallback } from 'react'
```

**This task must run after Task 5**, same reason as Step 1.

Change (declaration moves before the effect, dependency array becomes `[toast]`):

```js
  // Load COA and suppliers on mount
  useEffect(() => {
    loadLists()
  }, [])

  const loadLists = async () => {
    try {
      setLoadingData(true)

      // Load COA accounts
      const { data: coaData, error: coaError } = await supabase
        .from('coa')
        .select('id, code, name')
        .eq('is_active', true)
        .order('code')
      if (coaError) throw coaError

      // Load Suppliers
      const { data: supplierData, error: supplierError } = await supabase
        .from('suppliers')
        .select('id, name')
        .eq('is_active', true)
        .order('name')
      if (supplierError) throw supplierError

      setCoaList(coaData || [])
      setSupplierList(supplierData || [])
    } catch (err) {
      toast.error(`Gagal memuat data: ${err.message}`)
    } finally {
      setLoadingData(false)
    }
  }
```

to:

```js
  const loadLists = useCallback(async () => {
    try {
      setLoadingData(true)

      // Load COA accounts
      const { data: coaData, error: coaError } = await supabase
        .from('coa')
        .select('id, code, name')
        .eq('is_active', true)
        .order('code')
      if (coaError) throw coaError

      // Load Suppliers
      const { data: supplierData, error: supplierError } = await supabase
        .from('suppliers')
        .select('id, name')
        .eq('is_active', true)
        .order('name')
      if (supplierError) throw supplierError

      setCoaList(coaData || [])
      setSupplierList(supplierData || [])
    } catch (err) {
      toast.error(`Gagal memuat data: ${err.message}`)
    } finally {
      setLoadingData(false)
    }
  }, [toast])

  // Load COA and suppliers on mount
  useEffect(() => {
    loadLists()
  }, [loadLists])
```

- [ ] **Step 3: AssetCategoriesPage.jsx**

Add `useCallback` to the React import (line 1):

```js
import { useState, useEffect, useCallback } from 'react'
```

**This task must run after Task 5**, same reason as Step 1.

Change (declaration moves before the effect, dependency array becomes `[toast]`):

```js
  // Load categories on mount
  useEffect(() => {
    loadCategories()
  }, [])

  const loadCategories = async () => {
    try {
      setLoading(true)
      const data = await svc.listCategories()
      setCategories(data || [])
    } catch (err) {
      toast.error(`Gagal memuat kategori aset: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }
```

to:

```js
  const loadCategories = useCallback(async () => {
    try {
      setLoading(true)
      const data = await svc.listCategories()
      setCategories(data || [])
    } catch (err) {
      toast.error(`Gagal memuat kategori aset: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [toast])

  // Load categories on mount
  useEffect(() => {
    loadCategories()
  }, [loadCategories])
```

- [ ] **Step 4: AssetDetailPage.jsx**

Add `useCallback` to the React import (line 1):

```js
import { useEffect, useState, useCallback } from 'react'
```

Change:

```js
  useEffect(() => {
    loadData()
  }, [id])

  async function loadData() {
    try {
      setLoading(true)
      setError('')

      // Load asset with schedule
      const assetData = await getAssetWithSchedule(id)
      setAsset(assetData)

      // Load journals
      const journalIds = [
        assetData.acquisition_journal_id,
        assetData.disposal_journal_id,
        ...assetData.schedule.filter(s => s.journal_id).map(s => s.journal_id),
      ].filter(Boolean)

      if (journalIds.length > 0) {
        const { data: jData, error: jErr } = await supabase
          .from('journals')
          .select('id, journal_number, date, source, description')
          .in('id', journalIds)
          .order('date', { ascending: false })
        if (jErr) throw jErr
        setJournals(jData)
      }

      // Load audit logs
      const { data: aData, error: aErr } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('table_name', 'assets')
        .eq('record_id', id)
        .order('created_at', { ascending: false })
      if (aErr) throw aErr
      setAuditLogs(aData)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }
```

to (declaration moved *before* the effect — same TDZ reason as Steps 1-3, even though this one doesn't need `toast` in its own dependency array since `loadData` never calls `toast`, only `setError`):

```js
  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError('')

      // Load asset with schedule
      const assetData = await getAssetWithSchedule(id)
      setAsset(assetData)

      // Load journals
      const journalIds = [
        assetData.acquisition_journal_id,
        assetData.disposal_journal_id,
        ...assetData.schedule.filter(s => s.journal_id).map(s => s.journal_id),
      ].filter(Boolean)

      if (journalIds.length > 0) {
        const { data: jData, error: jErr } = await supabase
          .from('journals')
          .select('id, journal_number, date, source, description')
          .in('id', journalIds)
          .order('date', { ascending: false })
        if (jErr) throw jErr
        setJournals(jData)
      }

      // Load audit logs
      const { data: aData, error: aErr } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('table_name', 'assets')
        .eq('record_id', id)
        .order('created_at', { ascending: false })
      if (aErr) throw aErr
      setAuditLogs(aData)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    loadData()
  }, [id, loadData])
```

Note: unlike Steps 1-3, this step has **no task-ordering dependency on Task 5** — `loadData` never calls `toast`, so its `useCallback` dependency array is just `[id]`, unaffected by whether `useToast()` is stabilized yet.

- [ ] **Step 5: Verify**

Run: `npx eslint src/components/assets/AssetCategoryFormModal.jsx src/components/assets/AssetPaymentFields.jsx src/pages/assets/AssetCategoriesPage.jsx src/pages/assets/AssetDetailPage.jsx`
Expected: no `react-hooks/exhaustive-deps` warnings about `loadCOAList`/`loadLists`/`loadCategories`/`loadData` remain, and no `toast`-missing-dependency warning on the 3 `useCallback`s that use it. (`AssetPaymentFields.jsx` will also show 0 errors now since Task 4 already suppressed its `react-refresh` finding.)

**This lint pass alone does NOT prove the code is correct.** This project's ESLint config has no `no-use-before-define` rule, so a `useCallback` declaration referenced in an earlier dependency array (the exact TDZ mistake this task's instructions guard against by ordering) would pass `npx eslint` cleanly and only fail at runtime with `ReferenceError: Cannot access '...' before initialization`. Step 6 is not optional.

- [ ] **Step 6: Manual smoke test (required — catches what lint cannot)**

Run `npm run dev`. Open: Asset Categories page (list + "add category" modal) and the Asset acquisition form that uses `AssetPaymentFields`. For each, confirm:
1. The page renders without a `ReferenceError` in the browser console (this is the specific failure mode this task's declaration-ordering exists to prevent).
2. Each page's data loads exactly once per open (check Network tab — no repeated/looping requests).
3. Opening/closing the category modal repeatedly still reloads the COA list correctly every time it opens.

**Asset Detail page — reduced-coverage test, explicitly authorized by the user (resolved 2026-07-14):** the `assets` table in this environment is empty (verified via a read-only `select count(*) from assets` against the Supabase project — 0 rows), and this project has no separate staging/dev Supabase project (`.env` and `.env.test` both point at the same project used in production). Creating even a "disposable" test asset through the app's normal save flow calls `create_asset_acquisition_journal`, which posts a real journal entry to the general ledger — there is no reversal/cancel RPC for assets, so a soft-deleted test asset would leave a permanent, uncorrected journal entry in the books. Inserting a row via raw SQL to dodge that RPC was also rejected — it bypasses the application's real code path (so the test wouldn't validate real behavior) and is itself an unreviewed write to protected financial data.

Given the code change here is a straight reorder-plus-`useCallback`-wrap with an unchanged function body (no `toast` coupling, unlike Steps 1-3) and the exact same class of risk (TDZ ReferenceError, request loop) has already been validated end-to-end on 3 sibling fixes in this same task, the user accepted an **error-path-only test** instead:

1. Run `npm run dev`, navigate directly to `/assets/00000000-0000-0000-0000-000000000000` (or any syntactically-valid but non-existent UUID).
2. Confirm no `ReferenceError` appears in the browser console (proves the declaration reordering is correct).
3. Confirm the page settles into its existing "not found" / error state (per the component's existing `error || !asset` branch) without looping requests in the Network tab.
4. This explicitly does **not** exercise the happy-path (`getAssetWithSchedule` successfully returning data, journals/audit-logs rendering) — that gap is accepted, not silently skipped. Record in the Task 10 final report that this specific smoke test ran in reduced form and why.

- [ ] **Step 7: Commit**

```bash
git add src/components/assets/AssetCategoryFormModal.jsx src/components/assets/AssetPaymentFields.jsx src/pages/assets/AssetCategoriesPage.jsx src/pages/assets/AssetDetailPage.jsx
git commit -m "fix(erp-acc): memoize asset page loader functions and add them to effect dependencies"
```

---

### Task 7: Fix no-useless-escape in currency.js

**Files:**
- Modify: `apps/erp-acc/erp-app/src/utils/currency.js:24`

**Context:** In the character class `[^0-9,\-]`, the hyphen is the last character before the closing `]`, where a raw `-` is already interpreted literally (no escaping needed) — the `\` is redundant. Removing it does not change what the regex matches.

- [ ] **Step 1: Fix the regex**

In `apps/erp-acc/erp-app/src/utils/currency.js`, change:

```js
  const stripped = s.replace(/[^0-9,\-]/g, '')
```

to:

```js
  const stripped = s.replace(/[^0-9,-]/g, '')
```

- [ ] **Step 2: Verify**

Run: `npx eslint src/utils/currency.js`
Expected: no output (0 problems).

- [ ] **Step 3: Manual smoke test**

The fix removes an unnecessary escape character — it does not change what the regex matches. Confirm this directly, rather than assuming the stripped string is unchanged: periods (`.`) are not digits, commas, or minus signs, so both the old and new regex strip them identically. `'1.234.567,89'` is expected to become `'1234567,89'` after stripping (periods removed, comma kept) — this is pre-existing behavior, unaffected by this fix.

Run:

```bash
node -e "
const s = '1.234.567,89';
const stripped = s.replace(/[^0-9,-]/g, '');
console.log(stripped);
"
```

Expected output: `1234567,89`

Then confirm the actual exported function produces the same result before and after the edit:

```bash
node --input-type=module -e "import { parseCurrency } from './src/utils/currency.js'; console.log(parseCurrency('1.234.567,89'))"
```

Expected output: `1234567.89`

- [ ] **Step 4: Commit**

```bash
git add src/utils/currency.js
git commit -m "fix(erp-acc): remove unnecessary escape character in parseCurrency regex"
```

---

### Task 8: Remove dead code / unused imports (production files)

**Files:**
- Modify: `apps/erp-acc/erp-app/src/pages/DashboardPage.jsx:40`
- Modify: `apps/erp-acc/erp-app/src/pages/accounting/LedgerPage.jsx:1`
- Modify: `apps/erp-acc/erp-app/src/pages/assets/AssetsPage.jsx:1`
- Modify: `apps/erp-acc/erp-app/src/pages/accounting/ManualJournalFormPage.jsx:159`
- Modify: `apps/erp-acc/erp-app/src/pages/assets/AssetCategoriesPage.jsx:23,79`
- Modify: `apps/erp-acc/erp-app/src/pages/assets/AssetFormPage.jsx:174`
- Modify: `apps/erp-acc/erp-app/src/services/dashboardService.js:2`
- Modify: `apps/erp-acc/erp-app/src/utils/pdfRenderers/proformaRenderer.js:15`

**Context:** All of these were verified during planning by grepping each file for other usages of the flagged name. Only `DashboardPage.jsx`'s `Icon` is a false positive (see "Pre-flight fact 4") — every other one below is genuinely dead and safe to delete.

- [ ] **Step 1: DashboardPage.jsx — suppress the Icon false positive (do NOT delete)**

Change:

```js
function MetricCard({ icon: Icon, label, value, color, sub }) {
```

to:

```js
// eslint-disable-next-line no-unused-vars -- Icon IS used in the JSX below; this project's ESLint config has no eslint-plugin-react, so it doesn't track JSX-element-name usage for renamed destructured props
function MetricCard({ icon: Icon, label, value, color, sub }) {
```

- [ ] **Step 2: LedgerPage.jsx — remove unused useEffect import**

Change:

```js
import { useState, useEffect } from 'react'
```

to:

```js
import { useState } from 'react'
```

- [ ] **Step 3: AssetsPage.jsx — remove unused useMemo import**

Change:

```js
import { useState, useEffect, useMemo } from 'react'
```

to:

```js
import { useState, useEffect } from 'react'
```

- [ ] **Step 4: ManualJournalFormPage.jsx — remove unused coaOptions**

Delete this line entirely (verified: `coaOptions` is never referenced again after this declaration):

```js
  const coaOptions = coa.filter(c => !c.children?.length).map(c => ({ value: c.id, label: `${c.code} — ${c.name}` }))
```

- [ ] **Step 5: AssetCategoriesPage.jsx — two fixes**

For the unused `isDeleting` state value (the setter `setIsDeleting` IS actively called in `handleDelete` — this looks like an unfinished UI wiring, e.g. a delete button `loading` prop that was never added; that's a separate potential enhancement, out of scope here). Rename to satisfy the existing `varsIgnorePattern: '^[A-Z_]'` convention without changing behavior. Change:

```js
  const [isDeleting, setIsDeleting] = useState(false)
```

to:

```js
  const [_isDeleting, setIsDeleting] = useState(false)
```

For the unused `category` parameter, change:

```js
  const handleModalSaved = (category) => {
    loadCategories()
    handleModalClose()
  }
```

to:

```js
  const handleModalSaved = () => {
    loadCategories()
    handleModalClose()
  }
```

Then find the call site that invokes `handleModalSaved` as a prop (likely `onSaved={handleModalSaved}` on `AssetCategoryFormModal`) and confirm it doesn't rely on receiving an argument — since the function ignored its argument entirely before this change, removing the parameter is behavior-preserving regardless of what the caller passes.

- [ ] **Step 6: AssetFormPage.jsx — unused field parameter**

Change:

```js
  const financialFieldProps = (field) =>
```

to:

```js
  const financialFieldProps = (_field) =>
```

- [ ] **Step 7: dashboardService.js — remove unused today import**

Change:

```js
import { supabase } from '../lib/supabase'
import { today } from '../utils/date'
```

to:

```js
import { supabase } from '../lib/supabase'
```

- [ ] **Step 8: proformaRenderer.js — remove unused drawDocTitle import**

Read the multi-line import block starting at line 3 (`import { A4, MARGIN, CONTENT, COLOR, FONT, formatCurrency, ... } from ...`) and delete just the `drawDocTitle,` line from it. Do not touch any of the other named imports in that block — they are used elsewhere in the file (a comment at line 51 even references `drawDocTitle`'s internal behavior in prose, but the import itself is never called — leave that comment as-is, it's documentation about a design decision, not a usage).

- [ ] **Step 9: Verify**

Run: `npx eslint src/pages/DashboardPage.jsx src/pages/accounting/LedgerPage.jsx src/pages/assets/AssetsPage.jsx src/pages/accounting/ManualJournalFormPage.jsx src/pages/assets/AssetCategoriesPage.jsx src/pages/assets/AssetFormPage.jsx src/services/dashboardService.js src/utils/pdfRenderers/proformaRenderer.js`
Expected: no `no-unused-vars` errors remain in any of these files (some may still show unrelated warnings from other tasks not yet applied, e.g. `AssetCategoriesPage.jsx`'s `loadCategories` exhaustive-deps warning if Task 6 hasn't landed yet).

- [ ] **Step 10: Manual smoke test**

Run `npm run dev`. Open the Dashboard (confirm all metric card icons still render — this is the one that would visibly break if `Icon` were wrongly deleted instead of suppressed), the Ledger page, Assets list, a Manual Journal form, Asset Categories page (add/edit a category), and an Asset form. Confirm nothing crashes and no visual regression.

- [ ] **Step 11: Commit**

```bash
git add src/pages/DashboardPage.jsx src/pages/accounting/LedgerPage.jsx src/pages/assets/AssetsPage.jsx src/pages/accounting/ManualJournalFormPage.jsx src/pages/assets/AssetCategoriesPage.jsx src/pages/assets/AssetFormPage.jsx src/services/dashboardService.js src/utils/pdfRenderers/proformaRenderer.js
git commit -m "chore(erp-acc): remove unused imports/variables flagged by eslint"
```

---

### Task 9: Remove dead code / unused vars (Playwright test files)

**Files:**
- Modify: `apps/erp-acc/erp-app/tests/ar-ap-aging.spec.js:30,44`
- Modify: `apps/erp-acc/erp-app/tests/closing-period.spec.js:174`
- Modify: `apps/erp-acc/erp-app/tests/invoice-print.spec.js:5,41,46,47`
- Modify: `apps/erp-acc/erp-app/tests/po-print.spec.js:22`

**Context:** These are Playwright E2E test files, not production code — lowest risk in this plan. All verified during planning: each flagged name has no other reference in its file.

- [ ] **Step 1: ar-ap-aging.spec.js**

Change:

```js
  test.beforeAll(async ({ browser }) => {
```

to:

```js
  test.beforeAll(async () => {
```

And delete this block entirely (the query has no side effect and its result is never used):

```js
    // Buat COA dummy untuk AR/AP (ambil akun yang sudah ada)
    const { data: arCoa } = await supabase
      .from('coa').select('id').limit(1).single()

```

- [ ] **Step 2: closing-period.spec.js**

Change:

```js
    const { data: num } = await supabase.rpc('generate_number', { p_prefix: 'JRN' })
```

to:

```js
    await supabase.rpc('generate_number', { p_prefix: 'JRN' })
```

(Keeping the call itself, since it may be exercising the RPC as part of the test setup — only dropping the unused destructured result.)

- [ ] **Step 3: invoice-print.spec.js**

Change:

```js
  test.beforeEach(async ({ page, context }) => {
```

to:

```js
  test.beforeEach(async ({ context }) => {
```

Delete this line entirely:

```js
    const loginIndicator = page.locator('text=Login');
```

And delete these two lines entirely:

```js
      const printButton = page.locator('button:has-text("Print")').first();
      const pdfButton = page.locator('button:has-text("PDF")').first();
```

- [ ] **Step 4: po-print.spec.js**

Change:

```js
  test.beforeAll(async ({ browser }) => {
```

to:

```js
  test.beforeAll(async () => {
```

- [ ] **Step 5: Verify**

Run: `npx eslint tests/`
Expected: `0 problems` for all files under `tests/`.

- [ ] **Step 6: Commit**

```bash
git add tests/ar-ap-aging.spec.js tests/closing-period.spec.js tests/invoice-print.spec.js tests/po-print.spec.js
git commit -m "chore(erp-acc): remove unused variables and parameters in Playwright tests"
```

---

### Task 10: Final full verification

**Files:** None (verification only).

- [ ] **Step 1: Full lint**

Run: `npm run lint`
Expected: `✖ 0 problems (0 errors, 0 warnings)` — i.e. the command exits 0 with no findings.

If any findings remain, they were not covered by this plan's analysis — stop and report them rather than guessing a fix.

- [ ] **Step 2: Full build**

Run: `npm run build`
Expected: build completes successfully (matches the bug-hunter report's original finding that build already passed — this confirms no task introduced a build break).

- [ ] **Step 3: Report**

Summarize: total findings before (87) vs after (0), list of files touched, and confirmation that all manual smoke tests in Tasks 2, 3, 5, 6, 7, 8 were performed with no regressions observed. Explicitly call out that the Asset Detail page smoke test in Task 6 ran in its user-authorized reduced form (error-path only, not the happy path) and why.
