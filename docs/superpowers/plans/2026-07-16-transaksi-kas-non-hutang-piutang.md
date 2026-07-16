# Transaksi Kas/Bank Non-Hutang-Piutang Implementation Plan

> **For agentic workers (Codex GPT-5.6):** REQUIRED SUB-SKILL: use your own `/subagent-driven-development` for EVERY task below — dispatch a fresh subagent per task, review its diff before moving to the next task. Do not execute multiple tasks inline in one continuous run. Steps use checkbox (`- [ ]`) syntax for tracking; check them off as you go.
>
> **Model/effort per task is explicit in each task header** (`Sol` = highest capacity/effort, `Terra` = medium, `Luna` = low/mechanical — user's own naming, roughly Opus/Sonnet/Haiku-equivalent). **If the next task's header specifies a different model or effort than what you are currently configured with, STOP after committing the current task. Do not reconfigure yourself. Report back to the user with exactly this:**
> `Task <N> selesai dan sudah di-commit. Task <N+1> ("<judul>") butuh model <model> / effort <effort>. Set Codex ke konfigurasi itu, lalu minta prompt task berikutnya ke Claude.`

**Goal:** Let staff and admin record cash/bank transactions that have no AP/AR counterparty (bank fees, prepaid expense, tax expense, etc.) — a jalur that does not exist today — while leaving the existing AR/AP payment flow and admin-only Manual Journal untouched.

**Architecture:** Extract the existing Manual Journal page's line-editing table into a shared `JournalLinesEditor` component. Add a new Supabase RPC `post_general_cash_transaction` (security definer, reuses the existing `_ensure_can_post()` guard which already permits staff) that atomically posts a balanced multi-line journal requiring at least one cash/bank-linked line. Build a new, staff-accessible page on top of the shared component and the new RPC. Reuse the existing unrestricted Jurnal list/detail pages for browsing — no new list page.

**Tech Stack:** React 19 + Vite, Ant Design, Supabase Postgres/RLS/RPC (plpgsql), Playwright (`@playwright/test`) for E2E. **No unit-test framework exists in this repo** (confirmed: no Vitest/Jest dependency, `apps/erp-acc/erp-app/CLAUDE.md` states "No test framework exists yet"). Per-task validation therefore uses `npm run lint` + `npm run build` + explicit manual verification checklists instead of a red/green unit-test cycle; end-to-end behavior is covered once, in Task 6, by Playwright.

## Global Constraints

- Spec: [`docs/superpowers/specs/2026-07-16-transaksi-kas-non-hutang-piutang-design.md`](../specs/2026-07-16-transaksi-kas-non-hutang-piutang-design.md) — read it before starting Task 1.
- All UI copy is Bahasa Indonesia. Commit messages are English conventional commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`).
- New RPC must reuse the existing `_ensure_can_post()` guard (`015_fix_rls_security.sql:73-82` — already checks `is_admin_or_staff()`, not admin-only) and `_ensure_period_open()` (`016_period_lock_enforcement.sql`). Do not invent a new guard function.
- Every posted transaction from the new RPC must be atomic (single security-definer function, one journal header + all lines + account balance updates in one call) — unlike the existing `saveManualJournal()` draft path, which is a known two-step non-atomic gap (see `journalService.js:66-70` comment) that this plan must NOT repeat.
- The new RPC must reject the insert unless: minimum 2 lines, `sum(debit) = sum(credit) > 0`, and at least one line has a non-null `account_id` (a kas/bank leg). All three checks are server-side (defense in depth), not just client-side.
- Staff posts directly — no draft/approval step for this feature (explicit user decision).
- Counterparty COA selection is unrestricted (any COA type: asset/liability/equity/revenue/expense) — do not filter the COA dropdown by type.
- Route guard for the new page is `canWrite` (`RoleGuard require="canWrite"`), not `canPost`.
- **Migration/schema/RPC/seed-data changes require explicit user approval before being applied to any Supabase project (local or remote)** — per `C:\Project\CLAUDE.md` and `apps/erp-acc/erp-app/CLAUDE.md` Protected Areas. Task 0 and Task 1 each end with their migration file written and self-reviewed, NOT applied — applying either is a separate, explicit checkpoint with the user (see Task 0 Step 5, Task 1 Step 5). Apply `043` (Task 0 hotfix) before `044` (Task 1 feature) when the user authorizes it — `044` does not depend on `043` functionally, but `043` fixes a live security/period-lock gap and should not wait behind feature work.
- No production deployment, no remote migration execution, in any task.
- `npm run build` (run from `C:\Project\apps\erp-acc\erp-app`) must pass with zero errors before any task is considered done. `npm run lint` must also pass.
- Out of scope (do not build): automatic prepaid-expense amortization engine (separate future spec — see design spec Bagian 9), any change to `payments`/`post_payment`/AR-AP flow, any approval/review workflow for this feature's postings.
- **Shell compatibility:** this repo's execution shell is Windows PowerShell (confirmed by Codex during Task 0 Step 3 of the first attempt at this plan), which does not support `&&`/`||` as statement separators. All command blocks below are written as plain sequential lines (no `&&` chaining) for this reason — run each line as its own command. If a command block anywhere in this plan is found to still contain `&&`, treat it as a plan bug: run the lines separately instead of guessing a PowerShell-specific rewrite, and flag it back to the user/Claude rather than silently improvising.

## Worktree & Branch Setup (do this once, before Task 1)

This plan is one cohesive, sequential feature (each task depends on the previous one's output) — it is **one task** in the sense of `docs/agent-policy/worktree-lifecycle.md`, executed as 6 commits inside a single worktree/branch. Do not create a separate worktree per task below.

- [ ] **Step 1: Create the worktree**

```bash
git -C "C:\Project" worktree add "C:\Project\.worktrees\erp-acc\non-ap-ar-cash-transaction" -b codex/erp-acc/non-ap-ar-cash-transaction main
```

- [ ] **Step 2: Confirm the worktree is clean and on the right base**

```bash
cd "C:\Project\.worktrees\erp-acc\non-ap-ar-cash-transaction"
git status
git log -1 --oneline
```
Expected: clean tree, `HEAD` matches `main`'s latest commit (which includes the two spec-doc commits).

- [ ] **Step 3: Install dependencies in the worktree's erp-app**

```bash
cd "C:\Project\.worktrees\erp-acc\non-ap-ar-cash-transaction\apps\erp-acc\erp-app"
npm install
```

All file paths in the tasks below are relative to `C:\Project\.worktrees\erp-acc\non-ap-ar-cash-transaction\apps\erp-acc\erp-app\`.

---

### Task 0: Hotfix — restore missing guards to `post_manual_journal`

**Discovered during Task 1 Step 2 (first execution attempt):** `supabase/migrations/032_journal_items_account_id.sql:16` redefines `post_manual_journal(p_journal_id uuid)` (via `create or replace function`) to add `account_id` balance-sync, but the redefinition **drops** the `perform _ensure_can_post();` and `perform _ensure_period_open(...)` guards that `supabase/migrations/016_period_lock_enforcement.sql` had added to this same function. `create or replace function` replaces the entire function body, so the currently-active `post_manual_journal` has **no role check and no closed-period check at all**. Practical impact: draft manual journals can still only be *created* by an admin (RLS on `journal_items` insert is admin-only), but once a draft exists, **any authenticated user** can call `post_manual_journal` via RPC to post it — including for a period that is already closed. This is a pre-existing bug, unrelated to this plan's feature, but it blocks Task 1's self-review (which cites `post_manual_journal` as a reference implementation) and is a real financial-integrity gap on its own — user decision: fix it now, before Task 1, in this same worktree.

**Model/Effort: Sol / high** — same class as Task 1 (posting RPC, financial/period-lock control).

**Files:**
- Create: `supabase/migrations/043_fix_post_manual_journal_guards.sql`

**Interfaces:**
- Consumes: existing `_ensure_can_post()`, `_ensure_period_open(date)`, `validate_journal_balance(uuid)` (all already defined).
- Produces: no new interface — restores `post_manual_journal(p_journal_id uuid) returns void` to its correct, guarded behavior. Nothing downstream in this plan calls this function directly, but Task 1 Step 2's self-review checklist relies on it being a valid reference implementation.

- [ ] **Step 1: Write the hotfix migration**

```sql
-- ============================================================
-- Migration 043: Fix post_manual_journal — restore missing guards
-- Migration 032_journal_items_account_id.sql redefined
-- post_manual_journal() to add account_id balance sync, but the
-- redefinition dropped the _ensure_can_post() and
-- _ensure_period_open() guards that 016_period_lock_enforcement.sql
-- had added. Since then, ANY authenticated user (not just
-- staff/admin) can post an existing draft manual journal, even for
-- a closed accounting period. This restores both guards.
--
-- It also closes three defects the balance-sync side effect (added
-- in 032) introduced that neither the 016 nor the 032 version
-- guarded against, because before 032 there was no non-idempotent
-- side effect to protect: (1) no check that the journal isn't
-- already posted, so a repeat call double-applies the balance delta;
-- (2) no upfront check that source = 'manual', so a non-manual
-- journal id could mutate accounts.balance while the final header
-- UPDATE silently affects zero rows; (3) no row lock, so two
-- concurrent calls on the same journal could both pass the checks
-- before either commits and both apply the balance delta. Fixed by
-- adding `for update` (same locking idiom already used by
-- execute_asset_disposal in 011_posting_functions.sql) plus explicit
-- source/is_posted checks before any mutation.
-- ============================================================

create or replace function post_manual_journal(p_journal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_journal record;
  v_item record;
begin
  perform _ensure_can_post();

  select * into v_journal from journals where id = p_journal_id for update;
  if v_journal is null then raise exception 'journal not found'; end if;
  if v_journal.source != 'manual' then
    raise exception 'journal % bukan jurnal manual (source=%)', p_journal_id, v_journal.source;
  end if;
  if v_journal.is_posted then
    raise exception 'journal % sudah diposting sebelumnya', p_journal_id;
  end if;

  perform _ensure_period_open(v_journal.date);

  if not validate_journal_balance(p_journal_id) then
    raise exception 'Journal is not balanced (total debit != total credit)';
  end if;

  for v_item in
    select account_id, debit, credit
      from journal_items
     where journal_id = p_journal_id
       and account_id is not null
  loop
    update accounts
       set balance = balance + v_item.debit - v_item.credit
     where id = v_item.account_id;
  end loop;

  update journals
     set is_posted = true
   where id = p_journal_id;
end;
$$;
```

- [ ] **Step 2: Self-review against both prior versions, plus idempotency/concurrency**

Open `supabase/migrations/016_period_lock_enforcement.sql` and find its `post_manual_journal` definition (the one with `perform _ensure_can_post();` and `perform _ensure_period_open(v_journal.date);`), and `supabase/migrations/032_journal_items_account_id.sql:16-45` (the one with the `account_id` balance-sync loop, no guards). Confirm the Step 1 SQL above contains **all** of: both guards from the 016 version, the `v_journal` null-check and balance validation from the 016 version, AND the `account_id` balance-sync loop from the 032 version — i.e. it is the union of both, not a revert of 032's feature.

Additionally confirm (these three were missing from an earlier draft of this same migration and were caught in pre-commit review — do not skip):
- [ ] The initial `select * into v_journal from journals where id = p_journal_id for update;` uses `for update` — this locks the row so a second concurrent call on the same `p_journal_id` blocks until the first transaction commits, matching the locking idiom `execute_asset_disposal` already uses in `011_posting_functions.sql` (`select * into v_asset from assets where id = p_asset_id for update;`).
- [ ] There is an explicit `if v_journal.source != 'manual' then raise exception ...` check before any mutation (not just a silent `where source = 'manual'` filter on the final UPDATE) — an auto-sourced journal must be rejected loudly, not partially processed.
- [ ] There is an explicit `if v_journal.is_posted then raise exception ...` check before the balance-sync loop — without it, calling this RPC twice on the same already-posted journal would double-apply `balance = balance + debit - credit` for every line with an `account_id`, silently corrupting `accounts.balance`.

- [ ] **Step 3: File-readability check (no live database available)**

```bash
cd "C:\Project\.worktrees\erp-acc\non-ap-ar-cash-transaction\apps\erp-acc\erp-app"
node -e "require('fs').readFileSync('supabase/migrations/043_fix_post_manual_journal_guards.sql','utf8')"
```
Expected: the command prints nothing and exits with code 0 (silent success — `readFileSync` only throws if the file is missing or unreadable; a thrown error would print a stack trace and exit non-zero). Do not chain a success-only follow-up command after this with `&&` — this repo's shell is Windows PowerShell, where `&&` is not a valid statement separator; run each command as its own line instead. Do not attempt to connect to or apply against any Supabase project (local or remote) — same restriction as Task 1.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/043_fix_post_manual_journal_guards.sql
git commit -m "fix(erp-acc): restore missing guards and add idempotency to post_manual_journal

Migration 032 redefined post_manual_journal to add account_id balance
sync but dropped the _ensure_can_post()/_ensure_period_open() guards
that 016 had added, leaving any authenticated user able to post a
draft manual journal for a closed period. Also adds a for-update row
lock plus explicit source/is_posted checks before mutating balances,
since 032's balance-sync side effect is not idempotent: a repeat or
concurrent call on the same journal would otherwise double-apply the
balance delta. Keeps 032's balance-sync behavior for the normal path.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: STOP — request hotfix approval**

Report to the user: "Hotfix `043_fix_post_manual_journal_guards.sql` ditulis dan di-commit di branch `codex/erp-acc/non-ap-ar-cash-transaction`, TAPI belum diterapkan ke Supabase manapun. Ini memperbaiki bug pre-existing (bukan dari fitur baru), mohon prioritaskan review & approval-nya sebelum Task 1 juga menunggu untuk diterapkan." Do not proceed to apply this migration without explicit sign-off. Continue to Task 1 in the same worktree once this commit is made — Task 1 does not require this hotfix to be *applied*, only to exist as the corrected reference for its Step 2 self-review.

---

### Task 1: Database migration — COA accounts + `post_general_cash_transaction` RPC

**Model/Effort: Sol / high** — financial posting logic + schema/seed change, highest blast radius in this plan.

**Files:**
- Create: `supabase/migrations/044_general_cash_transaction.sql`

**Interfaces:**
- Consumes: existing `_ensure_can_post()`, `_ensure_period_open(date)`, `generate_number('JRN')` functions (all already defined — do not redefine them).
- Produces (consumed by Task 3): RPC `post_general_cash_transaction(p_date date, p_description text, p_lines jsonb, p_user_id uuid) returns uuid`, where `p_lines` is a JSON array of objects `{coa_id: uuid, account_id: uuid|null, debit: number, credit: number, description: string|null}`.
- Produces (consumed by Task 4/5 for dropdown content, no code dependency): new `coa` rows with codes `1-17000` (Biaya Dibayar Dimuka) and `5-20000` (Beban Pajak).

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================
-- Migration 044: General cash/bank transaction (non-AP/AR)
-- Adds COA accounts for prepaid expense and tax expense, and a
-- new RPC post_general_cash_transaction: an atomic, multi-line,
-- staff-postable journal entry for transactions with no AP/AR
-- counterparty (bank fees, prepaid expense, tax expense, bank
-- interest income, etc). At least one line must reference a
-- cash/bank account (account_id) so this cannot be used as a
-- backdoor for arbitrary non-cash reclassification entries —
-- those remain admin-only via post_manual_journal.
-- ============================================================

-- New COA accounts (asset + expense side, following the existing
-- numbering convention: 1-1x000 under "Aset Lancar" (1-10000),
-- 5-xx000 under "BEBAN" (5-00000)).
insert into coa (code, name, type, normal_balance, parent_id) values
  ('1-17000', 'Biaya Dibayar Dimuka', 'asset', 'debit',
    (select id from coa where code = '1-10000')),
  ('5-20000', 'Beban Pajak', 'expense', 'debit',
    (select id from coa where code = '5-00000'));

create or replace function post_general_cash_transaction(
  p_date date,
  p_description text,
  p_lines jsonb,
  p_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_journal_id uuid;
  v_line jsonb;
  v_total_debit numeric := 0;
  v_total_credit numeric := 0;
  v_line_count int := 0;
  v_cash_leg_count int := 0;
  v_debit numeric;
  v_credit numeric;
begin
  perform _ensure_can_post();
  perform _ensure_period_open(p_date);

  if p_description is null or btrim(p_description) = '' then
    raise exception 'Deskripsi wajib diisi';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) != 'array' then
    raise exception 'p_lines harus berupa array';
  end if;

  -- Pass 1: validate every line before writing anything.
  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_line_count := v_line_count + 1;
    v_debit := coalesce((v_line->>'debit')::numeric, 0);
    v_credit := coalesce((v_line->>'credit')::numeric, 0);

    if v_line->>'coa_id' is null then
      raise exception 'Baris % tidak punya coa_id', v_line_count;
    end if;
    if (v_debit > 0 and v_credit > 0) or (v_debit = 0 and v_credit = 0) then
      raise exception 'Baris % harus mengisi tepat satu dari debit atau kredit', v_line_count;
    end if;
    if v_debit < 0 or v_credit < 0 then
      raise exception 'Baris % tidak boleh bernilai negatif', v_line_count;
    end if;
    if v_line->>'account_id' is not null then
      v_cash_leg_count := v_cash_leg_count + 1;
    end if;

    v_total_debit := v_total_debit + v_debit;
    v_total_credit := v_total_credit + v_credit;
  end loop;

  if v_line_count < 2 then
    raise exception 'Minimal 2 baris jurnal';
  end if;
  if v_cash_leg_count < 1 then
    raise exception 'Minimal satu baris harus terhubung ke akun kas/bank';
  end if;
  if v_total_debit != v_total_credit or v_total_debit <= 0 then
    raise exception 'Jurnal tidak seimbang (total debit % != total kredit %)', v_total_debit, v_total_credit;
  end if;

  -- Pass 2: write header, then lines, then sync account balances.
  v_journal_id := gen_random_uuid();
  insert into journals (id, journal_number, date, description, source, reference_type, is_posted, created_by)
    values (v_journal_id, generate_number('JRN'), p_date, p_description,
      'manual', 'general_cash_transaction', true, p_user_id);

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    insert into journal_items (journal_id, coa_id, account_id, debit, credit, description)
      values (
        v_journal_id,
        (v_line->>'coa_id')::uuid,
        (v_line->>'account_id')::uuid,
        coalesce((v_line->>'debit')::numeric, 0),
        coalesce((v_line->>'credit')::numeric, 0),
        v_line->>'description'
      );

    if v_line->>'account_id' is not null then
      update accounts
         set balance = balance
           + coalesce((v_line->>'debit')::numeric, 0)
           - coalesce((v_line->>'credit')::numeric, 0)
       where id = (v_line->>'account_id')::uuid;
    end if;
  end loop;

  return v_journal_id;
end;
$$;
```

- [ ] **Step 2: Self-review the migration against 3 existing analogous RPCs**

Open `supabase/migrations/011_posting_functions.sql` and compare `post_general_cash_transaction` line-by-line against `post_transfer` and `post_expense` (both in that file). Also compare against the corrected `post_manual_journal` from Task 0's `043_fix_post_manual_journal_guards.sql` — **not** the version in `011_posting_functions.sql` or `032_journal_items_account_id.sql`, both of which are superseded (the former lacks the `account_id` sync, the latter lacks the guards; Task 0 fixed this — see its note for detail). Confirm all of the following (check each box mentally, do not skip):
- [ ] Calls `perform _ensure_can_post();` then `perform _ensure_period_open(p_date);` as the first two statements, same as every other posting RPC.
- [ ] Declared `language plpgsql security definer set search_path = public` (matches `post_general_cash_transaction`'s sibling functions defined with the trailing `$$ language plpgsql security definer set search_path = public;` form in 011, or the `language plpgsql / security definer / set search_path = public` block form used by `create_asset_acquisition_journal` in the same file — both forms are equivalent, this migration uses the block form).
- [ ] Uses `generate_number('JRN')` for `journal_number`, `gen_random_uuid()` for the journal id — matches every other RPC.
- [ ] `journal_items` CHECK constraints from `007_cashbank_accounting.sql:56-59` (`debit > 0 or credit > 0`, `not (debit > 0 and credit > 0)`) are satisfied by construction: the validation loop in Pass 1 already rejects any line where both or neither of debit/credit are `> 0`.
- [ ] `accounts.balance` update formula `balance + debit - credit` matches the generic sync logic in `post_manual_journal` (`032_journal_items_account_id.sql`), not the direction-specific `post_expense` formula (which only works because `post_expense` always puts the cash leg on credit — this RPC's cash leg can be debit or credit, so it must use the generic formula).
- [ ] No RLS/GRANT changes needed: confirm by checking `015_fix_rls_security.sql` shows every other posting RPC also has no table-level RLS INSERT policy for `staff` on `journal_items` (only `is_admin()`), yet all work — because `security definer` bypasses table RLS entirely. Do not add a `journal_items` RLS policy for staff.
- [ ] **Idempotency/locking is intentionally NOT needed here, unlike Task 0's fix:** Task 0's `post_manual_journal` needed `for update` + `is_posted`/`source` checks because it re-processes an *existing* journal row supplied by the caller (a repeat call or a race on the same `p_journal_id` re-triggers the same balance mutation). This RPC is different — every call creates a brand-new journal via `gen_random_uuid()` from `p_lines` supplied fresh each time; there is no existing row being re-posted, so there is nothing to double-apply and no row to race on. Do not add `for update` or an `is_posted` check to this RPC — there is no journal row to select until this function creates one. (A double form-submission would create two separate journal entries, the same class of duplicate-data-entry risk that already exists for every other creation flow in this app, e.g. `saveManualJournal`/`post_payment` — out of scope to solve differently here; Task 4's `submitting` state disables the submit button as the existing app-wide mitigation.)

If any box fails, fix the SQL before proceeding — do not move to Step 3 with a known mismatch.

- [ ] **Step 3: Validate SQL syntax without touching any live database**

```bash
cd "C:\Project\.worktrees\erp-acc\non-ap-ar-cash-transaction\apps\erp-acc\erp-app"
node -e "require('fs').readFileSync('supabase/migrations/044_general_cash_transaction.sql','utf8')"
```
Expected: silent success, exit code 0. Run each line as its own command — do not chain with `&&` (this repo's shell is Windows PowerShell, where `&&` is not a valid statement separator). There is no local Postgres instance available in this workflow — do not attempt `supabase db push`, `supabase start`, or any command that connects to a Supabase project (local or remote). Syntax correctness is established by Step 2's structural comparison against working, already-deployed RPCs in the same file, not by execution.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/044_general_cash_transaction.sql
git commit -m "feat(erp-acc): add post_general_cash_transaction RPC and prepaid/tax COA accounts

Adds a third posting path for cash/bank transactions with no AP/AR
counterparty, gated by the existing staff-or-admin _ensure_can_post()
guard. Requires at least one line to touch a cash/bank account.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: STOP — request migration approval**

Report to the user: "Migration `044_general_cash_transaction.sql` ditulis dan di-commit di branch `codex/erp-acc/non-ap-ar-cash-transaction`, TAPI belum diterapkan ke Supabase manapun (kebijakan proteksi schema/migration) — begitu juga hotfix `043_fix_post_manual_journal_guards.sql` dari Task 0. Mohon review kedua SQL ini dan beri tahu kapan boleh diterapkan (berurutan: 043 dulu baru 044), dan ke lingkungan mana (biasanya dev/staging Supabase project dulu, bukan production)." Do not proceed to apply the migration yourself even if you have Supabase CLI credentials configured — this is a hard stop pending explicit user sign-off, independent of which task/model is next.

Then STOP per the model/effort-switch rule at the top of this plan (Task 2 is Terra/medium, different from this task's Sol/high) — report using the exact format specified at the top of this document, substituting Task 2's name, and wait for the user/Claude to hand you the next prompt. Do not self-continue into Task 2 even though it doesn't depend on the migration being applied.

---

### Task 2: Extract `JournalLinesEditor` shared component

**Model/Effort: Terra / medium** — structural refactor of an existing 452-line page; must be behavior-preserving.

**Files:**
- Create: `src/components/journal/JournalLinesEditor.jsx`
- Modify: `src/pages/accounting/ManualJournalFormPage.jsx`

**Interfaces:**
- Consumes: nothing new (pure extraction from existing `ManualJournalFormPage.jsx` lines 19, 76-92, 158-166, 221-380).
- Produces (consumed by Task 4): default export `JournalLinesEditor({ items, onChange, coa, accounts, costCenters, readOnly })`; named export `emptyJournalLine()` returning `{ _key, coa_id: '', account_id: '', description: '', cost_center_id: '', debit: '', credit: '' }`; named export `computeJournalTotals(items)` returning `{ totalDebit: number, totalCredit: number, isBalanced: boolean }`.

- [ ] **Step 1: Create the shared component**

```jsx
// src/components/journal/JournalLinesEditor.jsx
import { formatCurrency } from '../../utils/currency'
import { Plus, Trash2 } from 'lucide-react'
import { Typography } from 'antd'

export const emptyJournalLine = () => ({
  _key: Date.now() + Math.random(),
  coa_id: '',
  account_id: '',
  description: '',
  cost_center_id: '',
  debit: '',
  credit: '',
})

export function computeJournalTotals(items) {
  const totalDebit = items.reduce((s, i) => s + (Number(i.debit) || 0), 0)
  const totalCredit = items.reduce((s, i) => s + (Number(i.credit) || 0), 0)
  const isBalanced = totalDebit > 0 && Math.abs(totalDebit - totalCredit) < 0.01
  return { totalDebit, totalCredit, isBalanced }
}

export default function JournalLinesEditor({ items, onChange, coa, accounts, costCenters, readOnly }) {
  const { totalDebit, totalCredit, isBalanced } = computeJournalTotals(items)

  const allCoaOptions = coa.map(c => ({ value: c.id, label: `${c.code} — ${c.name}` }))
  const getCostCenterName = costCenterId => costCenters.find(cc => cc.id === costCenterId)?.name || '-'
  const getAccountsForCoa = coaId => accounts.filter(a => a.coa_id === coaId)

  const updateItem = (idx, key, value) => {
    onChange(items.map((item, i) => {
      if (i !== idx) return item
      const updated = { ...item, [key]: value }
      if (key === 'coa_id') updated.account_id = ''
      if (key === 'debit' && value) updated.credit = ''
      if (key === 'credit' && value) updated.debit = ''
      return updated
    }))
  }

  return (
    <>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead style={{ backgroundColor: '#f3f4f6', borderBottom: '1px solid #e5e7eb' }}>
          <tr>
            <th style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 8, paddingBottom: 8, textAlign: 'left', fontSize: 12, fontWeight: 500, color: '#374151' }}>Akun (COA)</th>
            <th style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 8, paddingBottom: 8, textAlign: 'left', fontSize: 12, fontWeight: 500, color: '#374151' }}>Keterangan</th>
            <th style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 8, paddingBottom: 8, textAlign: 'left', fontSize: 12, fontWeight: 500, color: '#374151' }}>Cost Center</th>
            <th style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 8, paddingBottom: 8, textAlign: 'right', fontSize: 12, fontWeight: 500, color: '#374151' }}>Debit</th>
            <th style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 8, paddingBottom: 8, textAlign: 'right', fontSize: 12, fontWeight: 500, color: '#374151' }}>Kredit</th>
            {!readOnly && <th style={{ width: 40 }}></th>}
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={item._key} style={{ borderBottom: '1px solid #e5e7eb' }}>
              <td style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 8, paddingBottom: 8, minWidth: 240 }}>
                {readOnly ? (
                  <span style={{ fontSize: 14 }}>{item.coa_code} — {item.coa_name}</span>
                ) : (
                  <select
                    style={{ width: '100%', fontSize: 14, border: '1px solid #d1d5db', borderRadius: 4, paddingLeft: 8, paddingRight: 8, paddingTop: 4, paddingBottom: 4 }}
                    value={item.coa_id}
                    onChange={e => updateItem(idx, 'coa_id', e.target.value)}
                  >
                    <option value="">Pilih akun...</option>
                    {allCoaOptions.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                )}
                {item.coa_id && getAccountsForCoa(item.coa_id).length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 500, color: '#374151' }}>
                      Rekening (opsional)
                    </label>
                    <select
                      style={{ width: '100%', fontSize: 14, border: '1px solid #d1d5db', borderRadius: 4, paddingLeft: 8, paddingRight: 8, paddingTop: 4, paddingBottom: 4 }}
                      value={item.account_id || ''}
                      onChange={e => updateItem(idx, 'account_id', e.target.value)}
                      disabled={readOnly}
                    >
                      <option value="">— tidak dispesifikasi —</option>
                      {getAccountsForCoa(item.coa_id).map(a => (
                        <option key={a.id} value={a.id}>{a.name} ({formatCurrency(a.balance)})</option>
                      ))}
                    </select>
                  </div>
                )}
              </td>
              <td style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 8, paddingBottom: 8 }}>
                {readOnly ? (
                  <span style={{ fontSize: 14, color: '#4b5563' }}>{item.description}</span>
                ) : (
                  <input
                    type="text"
                    style={{ width: '100%', fontSize: 14, border: '1px solid #d1d5db', borderRadius: 4, paddingLeft: 8, paddingRight: 8, paddingTop: 4, paddingBottom: 4 }}
                    value={item.description}
                    onChange={e => updateItem(idx, 'description', e.target.value)}
                    placeholder="Keterangan..."
                  />
                )}
              </td>
              <td style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 8, paddingBottom: 8, minWidth: 180 }}>
                {readOnly ? (
                  <span style={{ fontSize: 14, color: '#4b5563' }}>{getCostCenterName(item.cost_center_id)}</span>
                ) : (
                  <select
                    style={{ width: '100%', fontSize: 14, border: '1px solid #d1d5db', borderRadius: 4, paddingLeft: 8, paddingRight: 8, paddingTop: 4, paddingBottom: 4 }}
                    value={item.cost_center_id}
                    onChange={e => updateItem(idx, 'cost_center_id', e.target.value)}
                  >
                    <option value="">Tanpa CC</option>
                    {costCenters.map(cc => (
                      <option key={cc.id} value={cc.id}>{cc.code} - {cc.name}</option>
                    ))}
                  </select>
                )}
              </td>
              <td style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 8, paddingBottom: 8, width: 144 }}>
                {readOnly ? (
                  <span style={{ fontSize: 14, textAlign: 'right', display: 'block' }}>{item.debit > 0 ? Number(item.debit).toLocaleString('id-ID') : ''}</span>
                ) : (
                  <input
                    type="number"
                    min="0"
                    step="any"
                    style={{ width: '100%', fontSize: 14, border: '1px solid #d1d5db', borderRadius: 4, paddingLeft: 8, paddingRight: 8, paddingTop: 4, paddingBottom: 4, textAlign: 'right' }}
                    value={item.debit}
                    onChange={e => updateItem(idx, 'debit', e.target.value)}
                    placeholder="0"
                  />
                )}
              </td>
              <td style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 8, paddingBottom: 8, width: 144 }}>
                {readOnly ? (
                  <span style={{ fontSize: 14, textAlign: 'right', display: 'block' }}>{item.credit > 0 ? Number(item.credit).toLocaleString('id-ID') : ''}</span>
                ) : (
                  <input
                    type="number"
                    min="0"
                    step="any"
                    style={{ width: '100%', fontSize: 14, border: '1px solid #d1d5db', borderRadius: 4, paddingLeft: 8, paddingRight: 8, paddingTop: 4, paddingBottom: 4, textAlign: 'right' }}
                    value={item.credit}
                    onChange={e => updateItem(idx, 'credit', e.target.value)}
                    placeholder="0"
                  />
                )}
              </td>
              {!readOnly && (
                <td style={{ paddingLeft: 8, paddingRight: 8, paddingTop: 8, paddingBottom: 8 }}>
                  <button
                    onClick={() => onChange(items.filter((_, i) => i !== idx))}
                    style={{ color: '#ef4444' }}
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot style={{ backgroundColor: '#f9fafb', borderTop: '2px solid #d1d5db' }}>
          <tr>
            <td colSpan={3} style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 8, paddingBottom: 8, fontSize: 14, fontWeight: 600, textAlign: 'right', color: '#374151' }}>Total</td>
            <td style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 8, paddingBottom: 8, fontSize: 14, textAlign: 'right' }}>
              <Typography.Text strong>{formatCurrency(totalDebit)}</Typography.Text>
            </td>
            <td style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 8, paddingBottom: 8, fontSize: 14, textAlign: 'right' }}>
              <Typography.Text strong>{formatCurrency(totalCredit)}</Typography.Text>
            </td>
            {!readOnly && <td></td>}
          </tr>
          {!readOnly && (
            <tr>
              <td colSpan={5} className="px-4 py-2">
                <Typography.Text
                  type={isBalanced ? 'success' : totalDebit > 0 ? 'warning' : 'secondary'}
                  style={{ fontSize: 12, fontWeight: 500 }}
                >
                  {isBalanced ? '✓ Seimbang — siap diposting' : totalDebit > 0 ? `Selisih: ${formatCurrency(Math.abs(totalDebit - totalCredit))}` : 'Isi baris jurnal di atas'}
                </Typography.Text>
              </td>
              {!readOnly && <td></td>}
            </tr>
          )}
        </tfoot>
      </table>

      {!readOnly && (
        <div style={{ padding: 12, borderTop: '1px solid #e5e7eb' }}>
          <button
            onClick={() => onChange([...items, emptyJournalLine()])}
            style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#2563eb' }}
          >
            <Plus size={16} /> Tambah Baris
          </button>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 2: Rewire `ManualJournalFormPage.jsx` to use the shared component**

Replace the file's content with this (identical behavior; the table/add-row block from the original lines 221-380 is now `<JournalLinesEditor>`, and the local `emptyRow`, `updateItem`, `allCoaOptions`, `getCostCenterName`, `getAccountsForCoa`, `totalDebit`/`totalCredit`/`isBalanced` are removed since they now live in the shared component):

```jsx
import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../components/ui/ToastContext'
import { useAccounts } from '../../hooks/useCashBank'
import { useCOA } from '../../hooks/useMasterData'
import { saveManualJournal, postManualJournal, getJournal } from '../../services/journalService'
import { createRecurringTemplate } from '../../services/recurringService'
import { listCostCenters } from '../../services/costCenterService'
import { today } from '../../utils/date'
import Button from '../../components/ui/Button'
import DateInput from '../../components/ui/DateInput'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import JournalLinesEditor, { emptyJournalLine, computeJournalTotals } from '../../components/journal/JournalLinesEditor'
import { ArrowLeft, Save, Send, Repeat } from 'lucide-react'
import { Space, Flex, Card, Row, Col, Alert, Typography, Switch, Select as AntdSelect } from 'antd'

export default function ManualJournalFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { canPost } = useAuth()
  const toast = useToast()
  const isNew = !id || id === 'new'
  const { coa } = useCOA()
  const { accounts } = useAccounts()

  const [loading, setLoading] = useState(!isNew)
  const [submitting, setSubmitting] = useState(false)
  const [header, setHeader] = useState({ date: today(), description: '', status: 'draft' })
  const [items, setItems] = useState([emptyJournalLine(), emptyJournalLine()])
  const [costCenters, setCostCenters] = useState([])

  // ----- Recurring template state (only relevant for new journals) -----
  const [makeRecurring, setMakeRecurring] = useState(false)
  const [recurInterval, setRecurInterval] = useState('monthly')
  const [recurDay,      setRecurDay]      = useState(1)
  const [recurStart,    setRecurStart]    = useState('')

  useEffect(() => {
    listCostCenters().then(setCostCenters).catch(() => {})
  }, [])

  useEffect(() => {
    if (!isNew) {
      getJournal(id)
        .then(j => {
          setHeader({
            id: j.id,
            journal_number: j.journal_number,
            date: j.date,
            description: j.description,
            status: j.is_posted ? 'posted' : 'draft',
          })
          setItems(j.journal_items.map(i => ({
            _key: i.id,
            coa_id: i.coa_id,
            account_id: i.account_id || '',
            coa_code: i.coa?.code,
            coa_name: i.coa?.name,
            description: i.description || '',
            cost_center_id: i.cost_center_id || '',
            debit: i.debit > 0 ? i.debit : '',
            credit: i.credit > 0 ? i.credit : '',
          })))
        })
        .catch(err => toast.error(err.message))
        .finally(() => setLoading(false))
    }
  }, [id, isNew, toast])

  const readOnly = (!isNew && header.status === 'posted') || !canPost
  const { isBalanced } = computeJournalTotals(items)

  const round2 = n => Math.round(Number(n || 0) * 100) / 100

  const handleSave = async () => {
    if (!header.date) { toast.error('Tanggal wajib diisi'); return }
    if (!header.description) { toast.error('Deskripsi wajib diisi'); return }
    const validItems = items
      .filter(i => i.coa_id && (Number(i.debit) > 0 || Number(i.credit) > 0))
      .map(i => ({ ...i, cost_center_id: i.cost_center_id || null, debit: round2(i.debit), credit: round2(i.credit) }))
    if (validItems.length < 2) { toast.error('Minimal 2 baris jurnal'); return }
    if (makeRecurring && !recurStart) {
      toast.error('Tanggal mulai untuk template berulang wajib diisi')
      return
    }

    setSubmitting(true)
    try {
      const journalId = await saveManualJournal(header, validItems)

      if (makeRecurring && isNew) {
        try {
          await createRecurringTemplate({
            name:          `Jurnal Berulang – ${header.description ?? 'Jurnal'}`,
            type:          'journal',
            interval_type: recurInterval,
            day_of_month:  recurInterval === 'monthly' ? recurDay : null,
            start_date:    recurStart,
            template_data: {
              description: header.description ?? '',
              items: validItems.map(it => ({
                coa_id:      it.coa_id,
                description: it.description ?? '',
                cost_center_id: it.cost_center_id ?? null,
                debit:       Number(it.debit)  || 0,
                credit:      Number(it.credit) || 0,
              })),
            },
          })
          toast.success('Template berulang dibuat')
        } catch (err) {
          toast.error('Jurnal tersimpan, tapi gagal membuat template berulang: ' + err.message)
        }
      }

      toast.success('Jurnal berhasil disimpan')
      navigate(`/accounting/journals/${journalId}`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handlePost = async () => {
    if (!isBalanced) { toast.error('Jurnal belum seimbang — total debit harus sama dengan total kredit'); return }
    setSubmitting(true)
    try {
      await postManualJournal(id)
      toast.success('Jurnal berhasil diposting')
      setHeader(h => ({ ...h, status: 'posted' }))
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <LoadingSpinner message="Memuat jurnal..." />

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Flex justify="space-between" align="center">
        <Space align="center">
          <button onClick={() => navigate('/accounting/journals')} style={{ color: '#6b7280' }}>
            <ArrowLeft size={20} />
          </button>
          <Typography.Title level={3} style={{ margin: 0 }}>
            {isNew ? 'Jurnal Manual Baru' : `Jurnal ${header.journal_number}`}
          </Typography.Title>
        </Space>
        <Space>
          {!readOnly && canPost && (
            <Button variant="secondary" onClick={handleSave} loading={submitting}>
              <Save size={18} /> Simpan Draft
            </Button>
          )}
          {!isNew && !readOnly && canPost && (
            <Button variant="primary" onClick={handlePost} loading={submitting} disabled={!isBalanced}>
              <Send size={18} /> Post Jurnal
            </Button>
          )}
        </Space>
      </Flex>

      {/* Header */}
      <Card>
        <Row gutter={16}>
          <Col span={12}>
            <DateInput
              label="Tanggal *"
              value={header.date}
              onChange={e => setHeader(h => ({ ...h, date: e.target.value }))}
              disabled={readOnly}
            />
          </Col>
          <Col span={12}>
            <Space direction="vertical" style={{ width: '100%' }} size={4}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151' }}>Deskripsi *</label>
              <input
                type="text"
                value={header.description}
                onChange={e => setHeader(h => ({ ...h, description: e.target.value }))}
                readOnly={readOnly}
                placeholder="Keterangan jurnal..."
                style={{ width: '100%', paddingLeft: 12, paddingRight: 12, paddingTop: 8, paddingBottom: 8, border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14 }}
              />
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Items table */}
      <Card bodyStyle={{ padding: 0 }}>
        <JournalLinesEditor
          items={items}
          onChange={setItems}
          coa={coa}
          accounts={accounts}
          costCenters={costCenters}
          readOnly={readOnly}
        />
      </Card>

      {header.status === 'posted' && (
        <Alert
          type="success"
          message="Jurnal telah diposting dan tidak dapat diubah."
          showIcon
        />
      )}

      {/* Recurring template toggle (only for new journals) */}
      {isNew && !readOnly && canPost && (
        <Card>
          <Flex align="center" gap={12}>
            <Switch
              checked={makeRecurring}
              onChange={setMakeRecurring}
              id="recurring-toggle-journal"
            />
            <label htmlFor="recurring-toggle-journal" style={{ cursor: 'pointer', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Repeat size={16} /> Jadikan Berulang
            </label>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Buat template untuk auto-create jurnal di masa depan.
            </Typography.Text>
          </Flex>

          {makeRecurring && (
            <Row gutter={16} style={{ marginTop: 16 }}>
              <Col xs={24} md={8}>
                <div style={{ marginBottom: 4, fontSize: 14, fontWeight: 500 }}>Interval</div>
                <AntdSelect
                  value={recurInterval}
                  onChange={setRecurInterval}
                  options={[
                    { value: 'daily',   label: 'Harian' },
                    { value: 'weekly',  label: 'Mingguan' },
                    { value: 'monthly', label: 'Bulanan' },
                    { value: 'yearly',  label: 'Tahunan' },
                  ]}
                  style={{ width: '100%' }}
                />
              </Col>
              {recurInterval === 'monthly' && (
                <Col xs={24} md={8}>
                  <div style={{ marginBottom: 4, fontSize: 14, fontWeight: 500 }}>Tanggal ke-</div>
                  <AntdSelect
                    value={recurDay}
                    onChange={setRecurDay}
                    options={[
                      { value: -1, label: 'Hari terakhir bulan' },
                      ...Array.from({ length: 28 }, (_, i) => ({
                        value: i + 1, label: `${i + 1}`,
                      })),
                    ]}
                    style={{ width: '100%' }}
                  />
                </Col>
              )}
              <Col xs={24} md={8}>
                <DateInput
                  label="Mulai Tanggal *"
                  value={recurStart}
                  onChange={e => setRecurStart(e.target.value)}
                />
              </Col>
            </Row>
          )}
        </Card>
      )}
    </Space>
  )
}
```

- [ ] **Step 3: Run lint and build**

```bash
npm run lint
npm run build
```
Expected: both exit 0, no errors. If lint flags unused imports (e.g. `formatCurrency`, `Plus`, `Trash2` no longer used in `ManualJournalFormPage.jsx` since they moved to the new component), remove them — the imports listed in Step 2's code block above already reflect the post-extraction import list; double-check nothing extra remains.

- [ ] **Step 4: Manual regression check (no automated test framework — see Tech Stack note)**

```bash
npm run dev
```
Open `http://localhost:5173/accounting/journals/new` logged in as an admin test user, and confirm, comparing against pre-refactor behavior:
- [ ] Page renders the same header, table, and "Tambah Baris" button.
- [ ] Adding a row, picking a COA with a linked account, seeing the "Rekening (opsional)" sub-select appear, filling debit/credit, and seeing the balance indicator flip to "✓ Seimbang" all work identically to before.
- [ ] Removing a row works.
- [ ] "Simpan Draft" still saves and redirects to `/accounting/journals/:id`.

- [ ] **Step 5: Commit**

```bash
git add src/components/journal/JournalLinesEditor.jsx src/pages/accounting/ManualJournalFormPage.jsx
git commit -m "refactor(erp-acc): extract JournalLinesEditor from ManualJournalFormPage

Pure structural move, no behavior change. Prepares the line-editing
table for reuse by the upcoming general cash transaction form.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Service layer — `saveGeneralCashTransaction()`

**Model/Effort: Luna / low** — mechanical, follows the existing `saveTransfer()` pattern in the same file almost verbatim.

**Files:**
- Modify: `src/services/cashBankService.js`

**Interfaces:**
- Consumes: RPC `post_general_cash_transaction` from Task 1 (must be applied to a reachable Supabase project — coordinate with the user per Task 1 Step 5 before treating this task's manual verification as done; the code itself can be written and committed regardless).
- Produces (consumed by Task 4): `saveGeneralCashTransaction({ date, description, lines })` → `Promise<string>` (the new journal's uuid), where each item of `lines` is `{ coa_id, account_id, debit, credit, description }`.

- [ ] **Step 1: Add the function**

Add this to the end of `src/services/cashBankService.js` (after the existing `saveTransfer` function, following its exact pattern):

```js
export async function saveGeneralCashTransaction({ date, description, lines }) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase.rpc('post_general_cash_transaction', {
    p_date: date,
    p_description: description,
    p_lines: lines.map(l => ({
      coa_id: l.coa_id,
      account_id: l.account_id || null,
      debit: Number(l.debit) || 0,
      credit: Number(l.credit) || 0,
      description: l.description || null,
    })),
    p_user_id: user?.id ?? null,
  })
  if (error) throw error
  return data
}
```

- [ ] **Step 2: Run lint and build**

```bash
npm run lint
npm run build
```
Expected: both exit 0.

- [ ] **Step 3: Manual verification (deferred if Task 1's migration is not yet applied)**

If the user has approved and applied migration `044_general_cash_transaction.sql` (and the `043` hotfix) to a reachable Supabase project by this point: open the browser console on any page of the running app (`npm run dev`) and run:
```js
const { saveGeneralCashTransaction } = await import('/src/services/cashBankService.js')
```
then confirm it's a function (`typeof saveGeneralCashTransaction === 'function'`). Do not actually call it with real data here — Task 4/6 exercises it through the UI.

If the migration is not yet applied: skip the live check, note in the commit message that live verification is pending migration approval, and proceed — the function is a thin, low-risk wrapper whose correctness is evident from matching `saveTransfer`'s already-working pattern.

- [ ] **Step 4: Commit**

```bash
git add src/services/cashBankService.js
git commit -m "feat(erp-acc): add saveGeneralCashTransaction service function

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: New page — `GeneralCashTransactionFormPage`

**Model/Effort: Terra / medium** — new page assembling existing pieces, follows `ManualJournalFormPage`'s pattern closely but with feature-specific validation (cash-leg requirement, no draft/post split).

**Files:**
- Create: `src/pages/cash/GeneralCashTransactionFormPage.jsx`

**Interfaces:**
- Consumes: `JournalLinesEditor`, `emptyJournalLine`, `computeJournalTotals` from Task 2 (`src/components/journal/JournalLinesEditor.jsx`); `saveGeneralCashTransaction` from Task 3 (`src/services/cashBankService.js`); `useAccounts` (`src/hooks/useCashBank.js`), `useCOA` (`src/hooks/useMasterData.js`), `listCostCenters` (`src/services/costCenterService.js`) — all pre-existing.
- Produces (consumed by Task 5): default export `GeneralCashTransactionFormPage` (no props — route-level page component, create-only, no `:id` param).

- [ ] **Step 1: Write the page**

```jsx
// src/pages/cash/GeneralCashTransactionFormPage.jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../../components/ui/ToastContext'
import { useAccounts } from '../../hooks/useCashBank'
import { useCOA } from '../../hooks/useMasterData'
import { saveGeneralCashTransaction } from '../../services/cashBankService'
import { listCostCenters } from '../../services/costCenterService'
import { today } from '../../utils/date'
import Button from '../../components/ui/Button'
import DateInput from '../../components/ui/DateInput'
import JournalLinesEditor, { emptyJournalLine, computeJournalTotals } from '../../components/journal/JournalLinesEditor'
import { ArrowLeft, Send } from 'lucide-react'
import { Space, Flex, Card, Row, Col, Typography } from 'antd'

export default function GeneralCashTransactionFormPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { coa } = useCOA()
  const { accounts } = useAccounts()

  const [date, setDate] = useState(today())
  const [description, setDescription] = useState('')
  const [items, setItems] = useState([emptyJournalLine(), emptyJournalLine()])
  const [costCenters, setCostCenters] = useState([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    listCostCenters().then(setCostCenters).catch(() => {})
  }, [])

  const { isBalanced } = computeJournalTotals(items)
  const hasCashLeg = items.some(i => i.account_id)

  const round2 = n => Math.round(Number(n || 0) * 100) / 100

  const handleSubmit = async () => {
    if (!date) { toast.error('Tanggal wajib diisi'); return }
    if (!description) { toast.error('Deskripsi wajib diisi'); return }
    const validItems = items
      .filter(i => i.coa_id && (Number(i.debit) > 0 || Number(i.credit) > 0))
      .map(i => ({ ...i, debit: round2(i.debit), credit: round2(i.credit) }))
    if (validItems.length < 2) { toast.error('Minimal 2 baris jurnal'); return }
    if (!validItems.some(i => i.account_id)) {
      toast.error('Minimal satu baris harus terhubung ke akun kas/bank')
      return
    }
    const { isBalanced: validBalanced } = computeJournalTotals(validItems)
    if (!validBalanced) {
      toast.error('Jurnal belum seimbang — total debit harus sama dengan total kredit')
      return
    }

    setSubmitting(true)
    try {
      const journalId = await saveGeneralCashTransaction({ date, description, lines: validItems })
      toast.success('Transaksi berhasil diposting')
      navigate(`/accounting/journals/${journalId}`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Flex justify="space-between" align="center">
        <Space align="center">
          <button onClick={() => navigate('/cash/accounts')} style={{ color: '#6b7280' }}>
            <ArrowLeft size={20} />
          </button>
          <Typography.Title level={3} style={{ margin: 0 }}>Transaksi Kas/Bank Lainnya</Typography.Title>
        </Space>
        <Button variant="primary" onClick={handleSubmit} loading={submitting} disabled={!isBalanced || !hasCashLeg}>
          <Send size={18} /> Posting Transaksi
        </Button>
      </Flex>

      <Card>
        <Row gutter={16}>
          <Col span={12}>
            <DateInput label="Tanggal *" value={date} onChange={e => setDate(e.target.value)} />
          </Col>
          <Col span={12}>
            <Space direction="vertical" style={{ width: '100%' }} size={4}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151' }}>Deskripsi *</label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Mis. Biaya admin bank Oktober 2026..."
                style={{ width: '100%', paddingLeft: 12, paddingRight: 12, paddingTop: 8, paddingBottom: 8, border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14 }}
              />
            </Space>
          </Col>
        </Row>
      </Card>

      <Card bodyStyle={{ padding: 0 }}>
        <JournalLinesEditor
          items={items}
          onChange={setItems}
          coa={coa}
          accounts={accounts}
          costCenters={costCenters}
          readOnly={false}
        />
      </Card>

      {!hasCashLeg && (
        <Typography.Text type="warning" style={{ fontSize: 12 }}>
          Minimal satu baris harus terhubung ke akun kas/bank (pilih "Rekening" pada salah satu baris).
        </Typography.Text>
      )}
    </Space>
  )
}
```

- [ ] **Step 2: Run lint and build**

```bash
npm run lint
npm run build
```
Expected: both exit 0.

- [ ] **Step 3: Manual verification**

```bash
npm run dev
```
There is no route wired to this page yet (that's Task 5) — temporarily add `<Route path="cash/general-transactions/new" element={<GeneralCashTransactionFormPage />} />` to `src/App.jsx` locally (do not commit this temporary line), reload, and confirm:
- [ ] Page opens at `/cash/general-transactions/new` without console errors.
- [ ] Picking a COA that has linked accounts shows the "Rekening (opsional)" sub-select, same as in Jurnal Umum.
- [ ] "Posting Transaksi" button is disabled while unbalanced or while no line has a selected account.
- [ ] The warning text about needing a cash/bank line is visible when no line has an account selected.

Remove the temporary route line before committing (Task 5 adds it properly, gated).

- [ ] **Step 4: Commit**

```bash
git add src/pages/cash/GeneralCashTransactionFormPage.jsx
git commit -m "feat(erp-acc): add GeneralCashTransactionFormPage

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Wire routing, sidebar menu, and Jurnal list tag

**Model/Effort: Luna / low** — mechanical wiring across 4 files, no new logic.

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/layout/Sidebar.jsx`
- Modify: `src/services/journalService.js`
- Modify: `src/pages/accounting/JournalsPage.jsx`

**Interfaces:**
- Consumes: `GeneralCashTransactionFormPage` from Task 4.
- Produces: route `/cash/general-transactions/new` (gated `canWrite`); sidebar item "Transaksi Lainnya" under "Kas & Bank"; `JournalsPage` list distinguishes `reference_type = 'general_cash_transaction'` rows with a "Kas Lainnya" tag instead of generic "Manual".

- [ ] **Step 1: Add the lazy import and route in `src/App.jsx`**

Find this line (around line 64):
```jsx
const ManualJournalFormPage = lazy(() => import('./pages/accounting/ManualJournalFormPage'))
```
Add directly after it:
```jsx
const GeneralCashTransactionFormPage = lazy(() => import('./pages/cash/GeneralCashTransactionFormPage'))
```

Find this line (around line 196):
```jsx
<Route path="cash/transfers/new" element={<RoleGuard require="canWrite"><TransferFormPage /></RoleGuard>} />
```
Add directly after it:
```jsx
<Route path="cash/general-transactions/new" element={<RoleGuard require="canWrite"><GeneralCashTransactionFormPage /></RoleGuard>} />
```

- [ ] **Step 2: Add the sidebar menu item in `src/components/layout/Sidebar.jsx`**

Find the "Kas & Bank" group's `items` array (around line 78-84):
```jsx
    items: [
      { label: 'Akun', path: '/cash/accounts' },
      { label: 'Pembayaran', path: '/cash/payments' },
      { label: 'Transfer', path: '/cash/transfers/new', minRole: 'write' },
      { label: 'Rekonsiliasi', path: '/cash/reconciliation' },
      { label: 'Import Rekening Koran', path: '/cash/import', minRole: 'write' }
    ]
```
Replace with:
```jsx
    items: [
      { label: 'Akun', path: '/cash/accounts' },
      { label: 'Pembayaran', path: '/cash/payments' },
      { label: 'Transfer', path: '/cash/transfers/new', minRole: 'write' },
      { label: 'Transaksi Lainnya', path: '/cash/general-transactions/new', minRole: 'write' },
      { label: 'Rekonsiliasi', path: '/cash/reconciliation' },
      { label: 'Import Rekening Koran', path: '/cash/import', minRole: 'write' }
    ]
```

- [ ] **Step 3: Include `reference_type` in `getJournals()` in `src/services/journalService.js`**

Find:
```js
    .select('id, journal_number, date, description, source, is_posted, created_at')
```
Replace with:
```js
    .select('id, journal_number, date, description, source, reference_type, is_posted, created_at')
```

- [ ] **Step 4: Distinguish the tag in `src/pages/accounting/JournalsPage.jsx`**

Find:
```jsx
                  <td style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12, fontSize: 14 }}>
                    <Tag color={j.source === 'manual' ? 'purple' : 'default'}>
                      {j.source === 'manual' ? 'Manual' : 'Otomatis'}
                    </Tag>
                  </td>
```
Replace with:
```jsx
                  <td style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12, fontSize: 14 }}>
                    <Tag color={j.source !== 'manual' ? 'default' : j.reference_type === 'general_cash_transaction' ? 'blue' : 'purple'}>
                      {j.source !== 'manual' ? 'Otomatis' : j.reference_type === 'general_cash_transaction' ? 'Kas Lainnya' : 'Manual'}
                    </Tag>
                  </td>
```

- [ ] **Step 5: Run lint and build**

```bash
npm run lint
npm run build
```
Expected: both exit 0.

- [ ] **Step 6: Manual verification**

```bash
npm run dev
```
Log in as a `staff` test user (not admin) and confirm:
- [ ] Sidebar shows "Kas & Bank > Transaksi Lainnya".
- [ ] Clicking it opens `/cash/general-transactions/new` without an "Akses Ditolak" screen.
- [ ] Sidebar still shows "Pembukuan > Jurnal" (unchanged, no `minRole` on that item), and it opens `JournalsPage` without error.
- [ ] Log in as `admin` and confirm `/accounting/journals/new` (Jurnal Umum) still opens and works — regression check that Task 5's changes to shared files (`App.jsx`) did not break the existing admin-only route.

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx src/components/layout/Sidebar.jsx src/services/journalService.js src/pages/accounting/JournalsPage.jsx
git commit -m "feat(erp-acc): wire routing, sidebar menu, and journal list tag for general cash transactions

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Playwright smoke tests

**Model/Effort: Luna / low** — test boilerplate following the existing `bank-journal-payment-adjustments.spec.js` pattern.

**Files:**
- Create: `playwright/general-cash-transaction.spec.js`

**Interfaces:**
- Consumes: route `/cash/general-transactions/new` from Task 5; existing test scaffolding (`ensureAuthState`, `gotoLive`, `LIVE_URL`, `AUTH_STATE`) — copy the pattern from `playwright/bank-journal-payment-adjustments.spec.js`, do not import from it (that file has no exports).

**Note on scope:** the existing Playwright suite in this repo runs against the LIVE deployed URL (`https://erp-app-bay.vercel.app`) with a real Supabase test account, and — per the file this plan's tests are modeled on — deliberately sticks to non-mutating checks (visibility, disabled-state, validation-blocking) rather than actually submitting and posting real journal entries. This plan follows the same restraint: do not write a test that calls "Posting Transaksi" and actually creates a real posted journal against the live database. A full create-and-verify-balance-update test should be done manually by the user/reviewer once Task 1's migration is approved and applied, not automated here.

- [ ] **Step 1: Write the spec**

```js
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import fs from 'fs'

dotenv.config({ path: '.env.test' })

const LIVE_URL = 'https://erp-app-bay.vercel.app'
const AUTH_STATE = 'playwright/.auth/user.json'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

async function ensureAuthState() {
  if (fs.existsSync(AUTH_STATE)) return
  const { error } = await supabase.auth.signInWithPassword({
    email: process.env.TEST_EMAIL,
    password: process.env.TEST_PASSWORD,
  })
  if (error) throw new Error(`Supabase login gagal: ${error.message}`)
  const { data: sessionData } = await supabase.auth.getSession()
  const session = sessionData.session
  if (!session) throw new Error('Session tidak ada setelah login')
  const projectRef = new URL(process.env.VITE_SUPABASE_URL).hostname.split('.')[0]
  const storageKey = `sb-${projectRef}-auth-token`
  fs.mkdirSync('playwright/.auth', { recursive: true })
  fs.writeFileSync(AUTH_STATE, JSON.stringify({
    cookies: [],
    origins: [{ origin: LIVE_URL, localStorage: [{ name: storageKey, value: JSON.stringify(session) }] }],
  }, null, 2))
}

async function gotoLive(page, route) {
  await page.goto(`${LIVE_URL}${route}`, { waitUntil: 'domcontentloaded' })
}

test.describe('General Cash Transaction (non-AP/AR) — live smoke', () => {
  test.use({ storageState: AUTH_STATE })

  test.beforeAll(async () => {
    await ensureAuthState()
  })

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      fs.mkdirSync('test-results/general-cash-transaction', { recursive: true })
      const safeTitle = testInfo.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
      await page.screenshot({
        path: `test-results/general-cash-transaction/${safeTitle}.png`,
        fullPage: true,
      })
    }
  })

  test('T1: halaman Transaksi Kas/Bank Lainnya terbuka tanpa error', async ({ page }) => {
    await gotoLive(page, '/cash/general-transactions/new')
    await expect(page.getByText('Transaksi Kas/Bank Lainnya')).toBeVisible({ timeout: 8000 })
  })

  test('T2: form punya minimal 2 baris debit/kredit', async ({ page }) => {
    await gotoLive(page, '/cash/general-transactions/new')
    const debitInputs = page.locator('input[placeholder="0"]')
    await expect(debitInputs.first()).toBeVisible({ timeout: 8000 })
    expect(await debitInputs.count()).toBeGreaterThanOrEqual(4) // 2 rows x (debit + credit)
  })

  test('T3: tombol Posting Transaksi disabled saat form kosong', async ({ page }) => {
    await gotoLive(page, '/cash/general-transactions/new')
    await expect(page.getByRole('button', { name: /posting transaksi/i })).toBeDisabled({ timeout: 8000 })
  })

  test('T4: peringatan akun kas/bank tampil saat belum ada baris terhubung rekening', async ({ page }) => {
    await gotoLive(page, '/cash/general-transactions/new')
    await expect(page.getByText(/minimal satu baris harus terhubung ke akun kas\/bank/i)).toBeVisible({ timeout: 8000 })
  })

  test('T5: menu "Transaksi Lainnya" tampil di sidebar Kas & Bank', async ({ page }) => {
    await gotoLive(page, '/cash/accounts')
    await expect(page.getByText('Transaksi Lainnya')).toBeVisible({ timeout: 8000 })
  })

  // ── Regression: existing Jurnal list + Jurnal Umum still work ──

  test('T6: halaman daftar Jurnal tetap terbuka tanpa error', async ({ page }) => {
    await gotoLive(page, '/accounting/journals')
    await expect(page.locator('h2, h3, .ant-typography').filter({ hasText: /jurnal/i }).first()).toBeVisible({ timeout: 8000 })
  })

  test('T7: halaman Tambah Jurnal Manual tetap terbuka tanpa error (regresi pasca-ekstraksi komponen)', async ({ page }) => {
    await gotoLive(page, '/accounting/journals/new')
    await expect(page.locator('h3, h2, .ant-typography').filter({ hasText: /jurnal/i }).first()).toBeVisible({ timeout: 8000 })
    await expect(page.locator('input[placeholder*="0"]').first()).toBeVisible({ timeout: 8000 })
  })
})
```

- [ ] **Step 2: Run the suite**

```bash
npx playwright test playwright/general-cash-transaction.spec.js --reporter=list
```
Expected: all 7 tests pass, provided `.env.test` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `TEST_EMAIL`, `TEST_PASSWORD`) is configured and the test account has at least `staff` role. If Task 1's migration has not yet been applied to the project this `.env.test` points at, T1-T4 may fail only insofar as the route itself works (they don't call the RPC) — but if the route 404s or the page throws because a downstream hook errors, that's a real failure to fix, not an expected one.

- [ ] **Step 3: Commit**

```bash
git add playwright/general-cash-transaction.spec.js
git commit -m "test(erp-acc): add Playwright smoke suite for general cash transaction page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Final report to user**

Report: "Semua task (0-6) selesai dan ter-commit di branch `codex/erp-acc/non-ap-ar-cash-transaction` (worktree `C:\Project\.worktrees\erp-acc\non-ap-ar-cash-transaction`). Migration `043_fix_post_manual_journal_guards.sql` (Task 0, hotfix) dan `044_general_cash_transaction.sql` (Task 1) BELUM diterapkan ke Supabase manapun — masih menunggu persetujuan Anda. Setelah keduanya diterapkan (berurutan) ke lingkungan dev/staging, jalankan ulang `npx playwright test playwright/general-cash-transaction.spec.js` untuk verifikasi penuh, lalu lakukan uji manual end-to-end (posting transaksi sungguhan) sebelum meminta PR/merge."

---

## Self-Review

**Revision note (post first Codex attempt):** Task 0 was added after Codex's first execution attempt on Task 1 found that `post_manual_journal` (as currently defined by migration `032_journal_items_account_id.sql`) is missing the `_ensure_can_post()`/`_ensure_period_open()` guards added by migration `016_period_lock_enforcement.sql` — a pre-existing bug unrelated to this feature, discovered because Task 1's self-review checklist used `post_manual_journal` as a reference implementation. Task 1's migration filename shifted from `043` to `044` to make room for the `043` hotfix. Also fixed: two shell-compatibility issues (`&&` is not valid in this repo's Windows PowerShell). This is not a spec change — the design in `docs/superpowers/specs/2026-07-16-transaksi-kas-non-hutang-piutang-design.md` is unaffected; only this plan's task breakdown and file numbering changed.

**Revision note 2 (Codex pre-commit review of Task 0):** before committing Task 0's own migration, Codex's own review (not user or Claude) caught that the drafted fix restored the two guards but introduced/left a separate correctness gap: the `account_id` balance-sync loop (from migration 032) is not idempotent, and the drafted SQL had no `is_posted` check, no upfront `source` check, and no row lock — so a repeat call or a race on the same journal would double-apply the balance delta, and a non-manual journal id would silently mutate balances while the header update no-opped. Fixed in Task 0 Step 1 by adding `select ... for update` (matching the locking idiom already used by `execute_asset_disposal` in `011_posting_functions.sql`) plus explicit `source`/`is_posted` checks before any mutation. Task 1 Step 2 now also carries an explicit note explaining why `post_general_cash_transaction` does *not* need the same pattern (it always creates a new journal row per call — there is no existing row to double-process or race on).

**Spec coverage:**
- Bagian 5.1 (shared `JournalLinesEditor`) → Task 2. ✓
- Bagian 5.2 (new page, reuse existing list) → Task 4 (page) + spec correction already folded in (no new list page task exists — correctly omitted). ✓
- Bagian 5.3 (routing/access) → Task 5. ✓
- Bagian 5.4 (service layer) → Task 3. ✓
- Bagian 5.5 (RPC) → Task 1. ✓
- Bagian 5.6 (COA additions, reuse `5-18000` decision already applied — only 2 new accounts) → Task 1. ✓
- Bagian 6 (data flow) → covered end-to-end across Tasks 1, 3, 4. ✓
- Bagian 7 (error handling table) → client-side checks in Task 4 Step 1, server-side checks in Task 1 Step 1 (Pass 1 validation loop), period-lock via `_ensure_period_open`, double-submit via `submitting` state disabling the button. ✓
- Bagian 8 (testing) → Task 6, adjusted to the repo's actual no-unit-framework reality (documented in Tech Stack) and to the existing suite's non-mutating convention. ✓
- Bagian 9 (amortization, out of scope) → not built, matches "Bukan Tujuan". ✓
- Bagian 10 (risks) → extraction regression risk mitigated by Task 2 Step 4 + Task 6 T7; RPC misuse risk mitigated by the server-side cash-leg check in Task 1; staff-posts-without-review risk is accepted per explicit user decision, mitigated non-technically by the existing unrestricted Jurnal list serving as an after-the-fact audit trail (Task 5).

**Placeholder scan:** no "TBD"/"TODO"/"add appropriate error handling"/"similar to Task N" phrases anywhere above — every step has complete, runnable code or a concrete command with expected output.

**Type/name consistency check:** `emptyJournalLine()` and `computeJournalTotals()` (Task 2) are imported with those exact names in Task 4's page. `saveGeneralCashTransaction({ date, description, lines })` (Task 3) is called with that exact shape in Task 4. The RPC name `post_general_cash_transaction` and its 4 params (`p_date`, `p_description`, `p_lines`, `p_user_id`) match exactly between Task 1's SQL and Task 3's `supabase.rpc(...)` call. `reference_type = 'general_cash_transaction'` string literal matches exactly between Task 1's SQL insert and Task 5's `JournalsPage.jsx` tag logic.
