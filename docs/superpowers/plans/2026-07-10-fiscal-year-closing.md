# Fiscal Year Closing (Jurnal Penutup) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin close a fully-past fiscal year in erp-acc, posting a real closing journal that zeroes out that year's Revenue/Expense accounts into the existing "Laba Ditahan" equity account (COA `3-12000`), so the Balance Sheet's Modal/Ekuitas section balances correctly without double-counting prior years' profit.

**Architecture:** One new Postgres migration adds a `fiscal_year_closings` tracking table plus three `SECURITY DEFINER` RPCs (`preview_fiscal_year_closing`, `close_fiscal_year`, `reverse_fiscal_year_closing`, `list_fiscal_years_status`). The closing journal is dated **1 January of the following year** (not Dec 31 of the closed year) so historical Income Statement queries for that year are unaffected — only Balance Sheet queries with an end date in/after the following year pick it up. Closing also locks all 12 months of that year via the existing `company_settings.closed_periods` mechanism; reversal (admin-only, most-recently-closed year only) undoes both. A new admin-only settings page (`FiscalYearClosingPage.jsx`) drives this, following the exact UI pattern of the existing `ClosingPeriodPage.jsx`.

**Tech Stack:** PostgreSQL/PL-pgSQL (Supabase), React + Ant Design, existing `supabase.rpc()` service-layer pattern.

---

## Context You Need

- COA account for Laba Ditahan: **code `3-12000`** (confirmed by user, already exists — do not create it).
- `journals.source` has a CHECK constraint allowing only `'auto'` or `'manual'` ([007_cashbank_accounting.sql:40](apps/erp-acc/erp-app/supabase/migrations/007_cashbank_accounting.sql)) — closing/reversal journals must use `source = 'auto'` and distinguish themselves via `reference_type` instead (`'fiscal_year_closing'` / `'fiscal_year_closing_reversal'`). Do not touch the CHECK constraint.
- `journal_items` requires exactly one of debit/credit to be `> 0` per row ([007_cashbank_accounting.sql:57-59](apps/erp-acc/erp-app/supabase/migrations/007_cashbank_accounting.sql)) — never insert a row with both zero or both positive.
- `company_settings.closed_periods` is a `jsonb` **array** of `"YYYY-MM"` strings (see `src/services/companySettingsService.js:48-76`). `jsonb_array || jsonb_scalar` appends the scalar as a new array element in Postgres — used to lock/unlock 12 months at once.
- `is_admin()` (returns boolean, checks `profiles.role = 'admin'`) already exists in [009_rls_policies.sql:37](apps/erp-acc/erp-app/supabase/migrations/009_rls_policies.sql) — reuse it, do not redefine.
- `generate_number('JRN')` already exists in [010_helper_functions.sql:17](apps/erp-acc/erp-app/supabase/migrations/010_helper_functions.sql) — reuse it for the closing/reversal journal numbers.
- Sibling feature to copy UI conventions from: [ClosingPeriodPage.jsx](apps/erp-acc/erp-app/src/pages/settings/ClosingPeriodPage.jsx) (Ant Design `Card`/`Table`/`Popconfirm`, `useToast()`, `Button`/`LoadingSpinner` from `components/ui/`).
- Routing: `App.jsx` lazy-imports pages around line 101 and declares routes around line 234; `Sidebar.jsx` lists Settings menu items around line 135.
- erp-acc has **no automated test framework** (per `apps/erp-acc/.claude/CLAUDE.md`) — verification for the SQL layer is done by applying the migration to a temporary Supabase branch and running assertions via SQL, not Vitest.
- **Financial guardrail:** this touches double-entry bookkeeping and COA-linked logic. The design was already approved by the user in this conversation (Pendekatan 1: real closing journal dated 1 Jan next year). Do not deviate from the approved formulas below.

---

## Task 1: Migration — schema + RPCs

**Files:**
- Create: `apps/erp-acc/erp-app/supabase/migrations/038_fiscal_year_closing.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================
-- Migration 038: Fiscal Year Closing (Jurnal Penutup)
-- Closes a fully-past fiscal year by posting a real closing
-- journal (dated 1 Jan of the following year) that zeroes out
-- that year's Revenue/Expense balances into Laba Ditahan
-- (COA 3-12000), and locks all 12 months of that year via the
-- existing closed_periods mechanism. Reversible (LIFO only).
-- ============================================================

create table fiscal_year_closings (
  id uuid primary key default gen_random_uuid(),
  fiscal_year int not null unique,
  closing_journal_id uuid references journals(id),
  total_revenue numeric(15,2) not null default 0,
  total_expense numeric(15,2) not null default 0,
  net_income numeric(15,2) not null default 0,
  status text not null default 'closed' check (status in ('closed', 'reversed')),
  closed_at timestamptz not null default now(),
  closed_by uuid references auth.users(id),
  reversed_at timestamptz,
  reversed_by uuid references auth.users(id),
  reversal_journal_id uuid references journals(id)
);

alter table fiscal_year_closings enable row level security;

create policy "Authenticated read fiscal_year_closings"
  on fiscal_year_closings for select to authenticated using (true);

create trigger audit_fiscal_year_closings
  after insert or update or delete on fiscal_year_closings
  for each row execute function fn_audit_log();

-- ------------------------------------------------------------
-- Read-only preview: per-account Revenue/Expense balances for
-- a calendar year, for the "preview before confirm" UI step.
-- ------------------------------------------------------------
create or replace function preview_fiscal_year_closing(p_year int)
returns table (
  coa_id uuid,
  code text,
  name text,
  type text,
  balance numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  select
    c.id as coa_id,
    c.code,
    c.name,
    c.type,
    case c.normal_balance
      when 'debit' then coalesce(sum(ji.debit), 0) - coalesce(sum(ji.credit), 0)
      when 'credit' then coalesce(sum(ji.credit), 0) - coalesce(sum(ji.debit), 0)
    end as balance
  from coa c
  left join journal_items ji on ji.coa_id = c.id
  left join journals j on ji.journal_id = j.id
    and j.is_posted = true
    and j.date between make_date(p_year, 1, 1) and make_date(p_year, 12, 31)
  where c.type in ('revenue', 'expense') and c.is_active = true
  group by c.id, c.code, c.name, c.type, c.normal_balance
  having case c.normal_balance
      when 'debit' then coalesce(sum(ji.debit), 0) - coalesce(sum(ji.credit), 0)
      when 'credit' then coalesce(sum(ji.credit), 0) - coalesce(sum(ji.debit), 0)
    end != 0
  order by c.code;
end;
$$;

-- ------------------------------------------------------------
-- List every fiscal year that has Revenue/Expense activity,
-- with its current closing status, for the status table UI.
-- ------------------------------------------------------------
create or replace function list_fiscal_years_status()
returns table (
  fiscal_year int,
  status text,
  closed_at timestamptz,
  net_income numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  with years as (
    select distinct extract(year from j.date)::int as fy
    from journals j
    join journal_items ji on ji.journal_id = j.id
    join coa c on c.id = ji.coa_id
    where j.is_posted = true
      and c.type in ('revenue', 'expense')
      and coalesce(j.reference_type, '') not in ('fiscal_year_closing', 'fiscal_year_closing_reversal')
  )
  select
    y.fy,
    coalesce(fyc.status, 'open'),
    fyc.closed_at,
    fyc.net_income
  from years y
  left join fiscal_year_closings fyc on fyc.fiscal_year = y.fy and fyc.status = 'closed'
  order by y.fy;
end;
$$;

-- ------------------------------------------------------------
-- Close a fiscal year: post the closing journal + lock 12 months.
-- ------------------------------------------------------------
create or replace function close_fiscal_year(p_year int)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_year int := extract(year from current_date)::int;
  v_earliest_open int;
  v_row record;
  v_total_revenue numeric := 0;
  v_total_expense numeric := 0;
  v_net numeric;
  v_journal_id uuid;
  v_coa_laba_ditahan uuid;
  v_closing_date date;
  v_has_lines boolean := false;
  v_settings_id uuid;
  v_closed jsonb;
  v_month int;
  v_key text;
begin
  if not is_admin() then
    raise exception 'permission denied: hanya admin yang bisa menutup tahun buku';
  end if;

  if p_year >= v_current_year then
    raise exception 'hanya tahun yang sudah lewat penuh yang bisa ditutup (tahun berjalan: %)', v_current_year;
  end if;

  if exists (select 1 from fiscal_year_closings where fiscal_year = p_year and status = 'closed') then
    raise exception 'tahun % sudah ditutup', p_year;
  end if;

  select min(sub.fy) into v_earliest_open
  from (
    select distinct extract(year from j.date)::int as fy
    from journals j
    join journal_items ji on ji.journal_id = j.id
    join coa c on c.id = ji.coa_id
    where j.is_posted = true
      and c.type in ('revenue', 'expense')
      and coalesce(j.reference_type, '') not in ('fiscal_year_closing', 'fiscal_year_closing_reversal')
      and extract(year from j.date)::int < p_year
  ) sub
  where sub.fy not in (select fiscal_year from fiscal_year_closings where status = 'closed');

  if v_earliest_open is not null then
    raise exception 'tutup tahun % terlebih dahulu sebelum menutup tahun %', v_earliest_open, p_year;
  end if;

  select id into v_coa_laba_ditahan from coa where code = '3-12000';
  if v_coa_laba_ditahan is null then
    raise exception 'akun Laba Ditahan (3-12000) tidak ditemukan di COA';
  end if;

  v_closing_date := make_date(p_year + 1, 1, 1);
  v_journal_id := gen_random_uuid();

  insert into journals (id, journal_number, date, description, source, reference_type, reference_id, is_posted, created_by)
    values (v_journal_id, generate_number('JRN'), v_closing_date,
      'Jurnal Penutup Tahun Buku ' || p_year, 'auto', 'fiscal_year_closing', null, true, auth.uid());

  for v_row in
    select
      c.id as coa_id,
      c.type,
      case c.normal_balance
        when 'debit' then coalesce(sum(ji.debit), 0) - coalesce(sum(ji.credit), 0)
        when 'credit' then coalesce(sum(ji.credit), 0) - coalesce(sum(ji.debit), 0)
      end as balance
    from coa c
    left join journal_items ji on ji.coa_id = c.id
    left join journals j on ji.journal_id = j.id
      and j.is_posted = true
      and j.date between make_date(p_year, 1, 1) and make_date(p_year, 12, 31)
    where c.type in ('revenue', 'expense') and c.is_active = true
    group by c.id, c.type, c.normal_balance
  loop
    if v_row.balance = 0 then
      continue;
    end if;
    v_has_lines := true;
    if v_row.type = 'revenue' then
      v_total_revenue := v_total_revenue + v_row.balance;
      insert into journal_items (journal_id, coa_id, debit, credit, description)
        values (v_journal_id, v_row.coa_id, v_row.balance, 0, 'Tutup saldo pendapatan ' || p_year);
    else
      v_total_expense := v_total_expense + v_row.balance;
      insert into journal_items (journal_id, coa_id, debit, credit, description)
        values (v_journal_id, v_row.coa_id, 0, v_row.balance, 'Tutup saldo beban ' || p_year);
    end if;
  end loop;

  v_net := v_total_revenue - v_total_expense;

  if v_has_lines then
    if v_net > 0 then
      insert into journal_items (journal_id, coa_id, debit, credit, description)
        values (v_journal_id, v_coa_laba_ditahan, 0, v_net, 'Laba tahun ' || p_year || ' ke Laba Ditahan');
    elsif v_net < 0 then
      insert into journal_items (journal_id, coa_id, debit, credit, description)
        values (v_journal_id, v_coa_laba_ditahan, -v_net, 0, 'Rugi tahun ' || p_year || ' dari Laba Ditahan');
    end if;
  else
    delete from journals where id = v_journal_id;
    v_journal_id := null;
  end if;

  select id, coalesce(closed_periods, '[]'::jsonb) into v_settings_id, v_closed
    from company_settings limit 1;

  for v_month in 1..12 loop
    v_key := to_char(make_date(p_year, v_month, 1), 'YYYY-MM');
    if not (v_closed ? v_key) then
      v_closed := v_closed || to_jsonb(v_key);
    end if;
  end loop;

  update company_settings set closed_periods = v_closed, updated_at = now() where id = v_settings_id;

  insert into fiscal_year_closings (fiscal_year, closing_journal_id, total_revenue, total_expense, net_income, status, closed_by)
    values (p_year, v_journal_id, v_total_revenue, v_total_expense, v_net, 'closed', auth.uid());

  return v_journal_id;
end;
$$;

-- ------------------------------------------------------------
-- Reverse the most-recently-closed fiscal year (LIFO only).
-- ------------------------------------------------------------
create or replace function reverse_fiscal_year_closing(p_year int)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_closing record;
  v_reversal_journal_id uuid;
  v_item record;
  v_settings_id uuid;
  v_closed jsonb;
  v_latest_closed int;
begin
  if not is_admin() then
    raise exception 'permission denied: hanya admin yang bisa membatalkan penutupan tahun buku';
  end if;

  select * into v_closing from fiscal_year_closings where fiscal_year = p_year and status = 'closed';
  if v_closing is null then
    raise exception 'tahun % belum ditutup atau sudah dibatalkan', p_year;
  end if;

  select max(fiscal_year) into v_latest_closed from fiscal_year_closings where status = 'closed';
  if v_latest_closed != p_year then
    raise exception 'hanya penutupan tahun terakhir (%) yang bisa dibatalkan', v_latest_closed;
  end if;

  if v_closing.closing_journal_id is not null then
    v_reversal_journal_id := gen_random_uuid();
    insert into journals (id, journal_number, date, description, source, reference_type, reference_id, is_posted, created_by)
      values (v_reversal_journal_id, generate_number('JRN'), current_date,
        'Pembatalan Jurnal Penutup Tahun Buku ' || p_year, 'auto', 'fiscal_year_closing_reversal',
        v_closing.closing_journal_id, true, auth.uid());

    for v_item in
      select coa_id, debit, credit, description from journal_items where journal_id = v_closing.closing_journal_id
    loop
      insert into journal_items (journal_id, coa_id, debit, credit, description)
        values (v_reversal_journal_id, v_item.coa_id, v_item.credit, v_item.debit, 'Reversal: ' || v_item.description);
    end loop;
  end if;

  select id, coalesce(closed_periods, '[]'::jsonb) into v_settings_id, v_closed
    from company_settings limit 1;

  select coalesce(jsonb_agg(elem), '[]'::jsonb) into v_closed
    from jsonb_array_elements_text(v_closed) as elem
    where elem not like (p_year::text || '-%');

  update company_settings set closed_periods = v_closed, updated_at = now() where id = v_settings_id;

  update fiscal_year_closings
    set status = 'reversed', reversed_at = now(), reversed_by = auth.uid(), reversal_journal_id = v_reversal_journal_id
    where fiscal_year = p_year;

  return v_reversal_journal_id;
end;
$$;
```

- [ ] **Step 2: Self-check the balance math**

For any year: `sum(debit)` on the closing journal = `total_revenue + max(-v_net, 0)`, `sum(credit)` = `total_expense + max(v_net, 0)`. Since `v_net = total_revenue - total_expense`, both sides always reduce to the same value — the journal is balanced by construction for profit, loss, and break-even cases. No `validate_journal_balance()` call is needed because these three cases are exhaustive and proven equal (do not skip re-deriving this by hand before moving on — it is the entire correctness argument for this migration).

- [ ] **Step 3: Commit**

```bash
git add apps/erp-acc/erp-app/supabase/migrations/038_fiscal_year_closing.sql
git commit -m "feat(erp-acc): add fiscal year closing schema and RPCs"
```

---

## Task 2: Verify the migration on a throwaway Supabase branch

No test framework exists for erp-acc, so verification happens by applying the migration to an isolated Supabase branch and asserting behavior with SQL — not by writing Vitest tests.

**Tools:** Supabase MCP tools (`mcp__55d0a906-48b8-47eb-aa54-8d78b1b99700__*`) — load them first with `ToolSearch` using query `"select:mcp__55d0a906-48b8-47eb-aa54-8d78b1b99700__list_projects,mcp__55d0a906-48b8-47eb-aa54-8d78b1b99700__create_branch,mcp__55d0a906-48b8-47eb-aa54-8d78b1b99700__apply_migration,mcp__55d0a906-48b8-47eb-aa54-8d78b1b99700__execute_sql,mcp__55d0a906-48b8-47eb-aa54-8d78b1b99700__delete_branch"`.

- [ ] **Step 1: Find the erp-acc production project and create a test branch**

Call `list_projects`, find the project whose name matches the erp-acc / "ERP-MG" project (per project memory). Call `create_branch` on it with a descriptive branch name (e.g. `test-fiscal-year-closing`). Record the returned branch `project_id` — all following steps run against this branch's `project_id`, never the parent.

- [ ] **Step 2: Apply the migration to the branch**

Call `apply_migration` with the branch's `project_id`, using the file content from `apps/erp-acc/erp-app/supabase/migrations/038_fiscal_year_closing.sql`.
Expected: success, no errors.

- [ ] **Step 3: Seed a known-value test year and run `preview_fiscal_year_closing`**

Run via `execute_sql` on the branch:
```sql
-- Confirm 3-12000 exists (it must, per user); if this returns 0 rows, stop — seed it first as a one-off before continuing.
select id, code, name from coa where code = '3-12000';

-- Pick any existing revenue-type and expense-type COA row for the test
select id, code, type from coa where type = 'revenue' and is_active limit 1;
select id, code, type from coa where type = 'expense' and is_active limit 1;
```
Using the returned ids, insert one small posted journal dated `2024-06-15` with revenue 1,000,000 and one dated `2024-07-20` with expense 400,000 (mirror the `insert into journals ... insert into journal_items ...` shape used elsewhere in the migrations, `source='manual'`, `is_posted=true`). Then run:
```sql
select * from preview_fiscal_year_closing(2024);
```
Expected: two rows, the revenue account balance = 1000000, the expense account balance = 400000.

- [ ] **Step 4: Close the year and verify the journal balances**

```sql
select close_fiscal_year(2024);
```
Then:
```sql
select coa_id, debit, credit from journal_items where journal_id = (select closing_journal_id from fiscal_year_closings where fiscal_year = 2024);
select sum(debit), sum(credit) from journal_items where journal_id = (select closing_journal_id from fiscal_year_closings where fiscal_year = 2024);
```
Expected: `sum(debit) = sum(credit) = 1000000` (revenue account debited 1,000,000; expense account credited 400,000; `3-12000` credited 600,000 net profit). Then:
```sql
select date from journals where id = (select closing_journal_id from fiscal_year_closings where fiscal_year = 2024);
select closed_periods from company_settings limit 1;
```
Expected: journal date = `2025-01-01`; `closed_periods` now contains `2024-01` through `2024-12`.

- [ ] **Step 5: Verify the period lock actually blocks new postings**

```sql
select post_expense(
  (select id from accounts limit 1),
  (select id from coa where type = 'expense' and is_active limit 1),
  50000, '2024-08-01', 'test post into closed year', null
);
```
Expected: raises `periode 2024-08 sudah ditutup`.

- [ ] **Step 6: Verify sequential-closing enforcement**

```sql
select close_fiscal_year(2025);
```
(assuming no 2023-or-earlier activity was seeded) Expected: succeeds if 2024 is the earliest year with activity; if you seeded any earlier year with revenue/expense in step 3 by mistake, this should instead raise `tutup tahun ... terlebih dahulu`. Confirm the error path once by attempting to close a year before an unclosed earlier year with activity exists.

- [ ] **Step 7: Verify reversal**

```sql
select reverse_fiscal_year_closing(2024);
select status from fiscal_year_closings where fiscal_year = 2024;
select closed_periods from company_settings limit 1;
select sum(debit), sum(credit) from journal_items where journal_id = (select reversal_journal_id from fiscal_year_closings where fiscal_year = 2024);
```
Expected: status = `reversed`, `2024-01`..`2024-12` removed from `closed_periods`, reversal journal's debit/credit sums equal and mirror the original journal's amounts swapped.

- [ ] **Step 8: Tear down the branch**

Call `delete_branch` on the test branch. Do not touch the parent/production project at any point in this task.

- [ ] **Step 9: Commit**

Nothing to commit for this task (verification only, no files changed). Note the verification results in the task's completion summary for the next task's reviewer.

---

## Task 3: Frontend service layer

**Files:**
- Create: `apps/erp-acc/erp-app/src/services/fiscalYearClosingService.js`

- [ ] **Step 1: Write the service file**

```javascript
import { supabase } from '../lib/supabase'

export async function listFiscalYearsStatus() {
  const { data, error } = await supabase.rpc('list_fiscal_years_status')
  if (error) throw error
  return data
}

export async function previewFiscalYearClosing(year) {
  const { data, error } = await supabase.rpc('preview_fiscal_year_closing', { p_year: year })
  if (error) throw error
  return data
}

export async function closeFiscalYear(year) {
  const { data, error } = await supabase.rpc('close_fiscal_year', { p_year: year })
  if (error) throw error
  return data
}

export async function reverseFiscalYearClosing(year) {
  const { data, error } = await supabase.rpc('reverse_fiscal_year_closing', { p_year: year })
  if (error) throw error
  return data
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/erp-acc/erp-app/src/services/fiscalYearClosingService.js
git commit -m "feat(erp-acc): add fiscal year closing service layer"
```

---

## Task 4: Frontend UI page

**Files:**
- Create: `apps/erp-acc/erp-app/src/pages/settings/FiscalYearClosingPage.jsx`

- [ ] **Step 1: Write the page**

```jsx
import { useState, useEffect } from 'react'
import { Space, Typography, Card, Table, Tag, Alert, Modal, Popconfirm } from 'antd'
import { Lock, Unlock } from 'lucide-react'
import { useToast } from '../../components/ui/ToastContext'
import Button from '../../components/ui/Button'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { formatCurrency } from '../../utils/currency'
import {
  listFiscalYearsStatus,
  previewFiscalYearClosing,
  closeFiscalYear,
  reverseFiscalYearClosing,
} from '../../services/fiscalYearClosingService'

const { Title, Text } = Typography

export default function FiscalYearClosingPage() {
  const toast = useToast()
  const [years, setYears] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [previewYear, setPreviewYear] = useState(null)
  const [previewData, setPreviewData] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      const data = await listFiscalYearsStatus()
      setYears(data || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const currentYear = new Date().getFullYear()
  const openYears = years.filter(y => y.status === 'open' && y.fiscal_year < currentYear).sort((a, b) => a.fiscal_year - b.fiscal_year)
  const closedYears = years.filter(y => y.status === 'closed').sort((a, b) => b.fiscal_year - a.fiscal_year)
  const nextToClose = openYears[0] ?? null
  const lastClosed = closedYears[0] ?? null

  async function openPreview(year) {
    setPreviewYear(year)
    setPreviewLoading(true)
    try {
      const data = await previewFiscalYearClosing(year)
      setPreviewData(data || [])
    } catch (err) {
      toast.error(err.message)
      setPreviewYear(null)
    } finally {
      setPreviewLoading(false)
    }
  }

  async function handleConfirmClose() {
    setActionLoading(true)
    try {
      await closeFiscalYear(previewYear)
      toast.success(`Tahun buku ${previewYear} berhasil ditutup`)
      setPreviewYear(null)
      setPreviewData(null)
      await loadData()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setActionLoading(false)
    }
  }

  async function handleReverse(year) {
    setActionLoading(true)
    try {
      await reverseFiscalYearClosing(year)
      toast.success(`Penutupan tahun buku ${year} berhasil dibatalkan`)
      await loadData()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setActionLoading(false)
    }
  }

  const totalRevenue = (previewData || []).filter(a => a.type === 'revenue').reduce((s, a) => s + Number(a.balance), 0)
  const totalExpense = (previewData || []).filter(a => a.type === 'expense').reduce((s, a) => s + Number(a.balance), 0)
  const netIncome = totalRevenue - totalExpense

  const columns = [
    { title: 'Tahun', dataIndex: 'fiscal_year', key: 'fiscal_year', width: 100 },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 160,
      render: status => status === 'closed'
        ? <Tag color="red" icon={<Lock size={12} style={{ marginRight: 4 }} />}>Ditutup</Tag>
        : <Tag color="green" icon={<Unlock size={12} style={{ marginRight: 4 }} />}>Terbuka</Tag>,
    },
    {
      title: 'Laba (Rugi) Bersih',
      dataIndex: 'net_income',
      key: 'net_income',
      render: v => v == null ? '—' : formatCurrency(v),
    },
    {
      title: 'Aksi',
      key: 'action',
      width: 200,
      render: (_, row) => {
        if (row.status === 'open' && nextToClose && row.fiscal_year === nextToClose.fiscal_year) {
          return (
            <Button variant="primary" size="sm" onClick={() => openPreview(row.fiscal_year)}>
              Preview & Tutup
            </Button>
          )
        }
        if (row.status === 'closed' && lastClosed && row.fiscal_year === lastClosed.fiscal_year) {
          return (
            <Popconfirm
              title={`Batalkan penutupan tahun ${row.fiscal_year}?`}
              description="Jurnal penutup akan dibalik dan 12 bulan tahun ini dibuka kembali."
              onConfirm={() => handleReverse(row.fiscal_year)}
              okText="Ya, Batalkan"
              cancelText="Batal"
            >
              <Button variant="danger" size="sm" loading={actionLoading}>Batalkan Penutupan</Button>
            </Popconfirm>
          )
        }
        return <Text type="secondary">—</Text>
      },
    },
  ]

  if (loading) return <LoadingSpinner message="Memuat status tahun buku..." />

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={24}>
      <Title level={3} style={{ margin: 0 }}>Tutup Tahun Buku</Title>

      <Alert
        type="info"
        showIcon
        message="Menutup tahun buku memindahkan saldo Pendapatan dan Beban tahun tersebut ke akun Laba Ditahan (3-12000) lewat jurnal penutup bertanggal 1 Januari tahun berikutnya, dan mengunci 12 bulan tahun itu dari transaksi baru. Hanya tahun yang sudah lewat penuh yang bisa ditutup, dan harus berurutan."
      />

      {error && <Alert type="error" message={error} showIcon />}

      <Card title="Status Tahun Buku" size="small">
        <Table
          dataSource={years}
          columns={columns}
          rowKey="fiscal_year"
          pagination={false}
          size="small"
        />
      </Card>

      <Modal
        title={`Preview Jurnal Penutup Tahun ${previewYear}`}
        open={previewYear !== null}
        onCancel={() => { setPreviewYear(null); setPreviewData(null) }}
        onOk={handleConfirmClose}
        okText="Tutup Tahun Buku"
        cancelText="Batal"
        confirmLoading={actionLoading}
        okButtonProps={{ danger: true }}
      >
        {previewLoading ? (
          <LoadingSpinner message="Menghitung..." />
        ) : (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Table
              dataSource={previewData || []}
              rowKey="coa_id"
              pagination={false}
              size="small"
              columns={[
                { title: 'Kode', dataIndex: 'code', width: 90 },
                { title: 'Nama Akun', dataIndex: 'name' },
                { title: 'Tipe', dataIndex: 'type', width: 90 },
                { title: 'Saldo', dataIndex: 'balance', align: 'right', render: v => formatCurrency(v) },
              ]}
              locale={{ emptyText: 'Tidak ada transaksi Pendapatan/Beban tahun ini' }}
            />
            <Text strong>Total Pendapatan: {formatCurrency(totalRevenue)}</Text>
            <Text strong>Total Beban: {formatCurrency(totalExpense)}</Text>
            <Text strong style={{ fontSize: 16 }}>
              {netIncome >= 0 ? 'Laba Bersih' : 'Rugi Bersih'}: {formatCurrency(Math.abs(netIncome))} → akan masuk ke akun 3-12000 (Laba Ditahan)
            </Text>
          </Space>
        )}
      </Modal>
    </Space>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/erp-acc/erp-app/src/pages/settings/FiscalYearClosingPage.jsx
git commit -m "feat(erp-acc): add fiscal year closing UI page"
```

---

## Task 5: Wire routing and sidebar

**Files:**
- Modify: `apps/erp-acc/erp-app/src/App.jsx:101` (lazy import block) and `:234` (route block)
- Modify: `apps/erp-acc/erp-app/src/components/layout/Sidebar.jsx:135` (Settings menu items)

- [ ] **Step 1: Add the lazy import in `App.jsx`**

Find this exact line (currently line 101):
```javascript
const ClosingPeriodPage = lazy(() => import('./pages/settings/ClosingPeriodPage'))
```
Add immediately after it:
```javascript
const FiscalYearClosingPage = lazy(() => import('./pages/settings/FiscalYearClosingPage'))
```

- [ ] **Step 2: Add the route in `App.jsx`**

Find this exact line (currently line 234):
```javascript
<Route path="settings/closing-period" element={<RoleGuard require="canPost"><ClosingPeriodPage /></RoleGuard>} />
```
Add immediately after it:
```javascript
<Route path="settings/fiscal-year-closing" element={<RoleGuard require="canPost"><FiscalYearClosingPage /></RoleGuard>} />
```

- [ ] **Step 3: Add the sidebar menu item in `Sidebar.jsx`**

Find this exact line (currently line 135):
```javascript
{ label: 'Closing Period', path: '/settings/closing-period', minRole: 'admin' },
```
Add immediately after it:
```javascript
{ label: 'Tutup Tahun Buku', path: '/settings/fiscal-year-closing', minRole: 'admin' },
```

- [ ] **Step 4: Commit**

```bash
git add apps/erp-acc/erp-app/src/App.jsx apps/erp-acc/erp-app/src/components/layout/Sidebar.jsx
git commit -m "feat(erp-acc): wire up fiscal year closing route and menu"
```

---

## Task 6: Build verification

**Files:** none (verification only)

- [ ] **Step 1: Run the production build**

```bash
cd apps/erp-acc/erp-app && npm run build
```
Expected: exit 0, `✓ built in ...`, no errors. If this worktree's `node_modules` is missing, create a junction to the sibling checkout's `node_modules` first (this was done earlier in the session at `C:\Project\.claude\worktrees\jovial-mclaren-3371ad\apps\erp-acc\erp-app\node_modules` → `C:\Project\apps\erp-acc\erp-app\node_modules`; reuse it, don't reinstall).

- [ ] **Step 2: Note the manual-QA gap**

This worktree has no `.env.local` (no Supabase credentials), so the dev server cannot log in to render the new page in a browser here. Record in the task summary that a logged-in manual click-through of `/settings/fiscal-year-closing` (preview modal, close, reverse) still needs to happen in an environment with real credentials before this ships — this was already true for the earlier Balance Sheet fix in this same conversation and remains an open item for the user, not something to silently skip.

- [ ] **Step 3: Commit**

Nothing to commit (verification only).

---

## Task 7: Open the PR

**Files:** none (git/GitHub operations only)

- [ ] **Step 1: Push the branch**

```bash
git push -u origin claude/balance-sheet-equity-reconciliation-ac506a
```

- [ ] **Step 2: Create the PR**

```bash
gh pr create --title "feat(erp-acc): fiscal year closing (jurnal penutup) + balance sheet equity fix" --body "$(cat <<'EOF'
## Summary
- Balance Sheet now shows a computed "Laba (Rugi) Berjalan" line in Modal/Ekuitas for the still-open current year (see earlier commit on this branch).
- Adds Fiscal Year Closing: admin-only page to close a fully-past year, posting a real closing journal (dated 1 Jan of the following year) that zeroes that year's Revenue/Expense into Laba Ditahan (COA 3-12000), and locks all 12 months of that year. Reversible for the most-recently-closed year only.
- New table `fiscal_year_closings` + RPCs `preview_fiscal_year_closing`, `close_fiscal_year`, `reverse_fiscal_year_closing`, `list_fiscal_years_status` (migration 038).

## Test plan
- [x] Migration verified end-to-end on a throwaway Supabase branch (preview, close, period-lock enforcement, sequential-closing enforcement, reversal) — branch deleted after.
- [x] `npm run build` passes in `apps/erp-acc/erp-app`.
- [ ] Manual click-through in a real logged-in environment (this worktree has no Supabase credentials) — **please verify before merging**.
- [ ] Migration 038 has **not** been applied to the production Supabase project — see deploy instructions below.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Report the PR URL and the deploy commands to the user**

Do not run any of the following — hand them to the user verbatim, since applying a migration to the production database and merging to `main` are production actions outside what Claude may execute on this project:

```bash
# 1. Apply migration 038 to the PRODUCTION Supabase project (run from apps/erp-acc/erp-app):
supabase db push --project-ref <production-project-ref>

# 2. Merge the PR (triggers Vercel auto-deploy of the frontend from main):
gh pr merge <PR-number> --squash
```

---

## Self-Review Notes (already applied above)

- Spec coverage: schema ✓, preview RPC ✓, close RPC (sequential + period-lock + admin-only + Jan-1 dating) ✓, reverse RPC (LIFO-only, admin-only) ✓, UI page mirroring `ClosingPeriodPage.jsx` ✓, routing/sidebar wiring ✓, Supabase-branch verification in place of unit tests ✓, PR + non-executed deploy commands ✓.
- Fixed one internal contradiction while writing this plan: initial draft used `source = 'fiscal_year_closing'`, which violates the existing `journals.source` CHECK constraint (`'auto'`/`'manual'` only) — corrected to `source = 'auto'` with `reference_type = 'fiscal_year_closing'` / `'fiscal_year_closing_reversal'` throughout (RPCs and the `list_fiscal_years_status` activity-detection query both updated consistently).
- No placeholders remain; every step has literal file paths, complete SQL/JS, and exact commands.
