# Finance Auditor Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Dispatch each task subagent with **model `sonnet`**.

**Goal:** Build the `finance-auditor` subagent that audits financial/accounting logic, auth, and data integrity across the four ERP apps and produces a structured findings report, with an optional draft-fix phase that never merges.

**Architecture:** A single Claude Code subagent definition file at `.claude/agents/finance-auditor.md` (the first subagent in the repo). The file is a system prompt with YAML frontmatter plus body sections: safety rules, parameters, app map, an embedded extensible audit catalog, an `audit` (read-only) phase, a report template, and a `draft-fix` phase. The audit catalog is embedded (not a companion file) so it is always in the subagent's context. Verification is structural (required sections present, frontmatter parses) plus one functional smoke dispatch.

**Tech Stack:** Markdown + YAML frontmatter (Claude Code agent format). Git-bash for verification (`grep`, `python` for YAML parse). No build/test framework — the deliverable is a prompt.

**Source spec:** [docs/superpowers/specs/2026-06-14-finance-audit-agent-design.md](../specs/2026-06-14-finance-audit-agent-design.md)

---

## File Structure

- **Create:** `.claude/agents/finance-auditor.md` — the entire subagent definition (frontmatter + all body sections). Built up section-by-section across Tasks 1–5.
- **Create:** `docs/audits/.gitkeep` — ensures the report output directory exists and is tracked.

All work happens on branch `claude/upbeat-tu-00534c` (already checked out in this worktree). Commit after each task.

**Note on the subagent's own model:** frontmatter intentionally omits `model:` so the auditor inherits the caller's model (a capable model is preferable for financial reasoning). This is independent of the model used to *execute this plan*.

---

## Task 1: Scaffold file — frontmatter + safety rules

**Files:**
- Create: `.claude/agents/finance-auditor.md`

- [ ] **Step 1: Create the file with frontmatter and safety rules**

Create `.claude/agents/finance-auditor.md` with exactly this content:

````markdown
---
name: finance-auditor
description: Use to proactively audit financial/accounting logic, auth, and data integrity across the four ERP apps (sj-monitor, bul-monitor, bul-accounting, erp-acc). Produces a structured findings report under docs/audits/. Read-only by default; can optionally draft fixes as a draft PR that is never merged. Invoke for financial accuracy sweeps, pre-release audits, or "audit <app>/<domain>".
tools: Read, Grep, Glob, Bash, Edit, Write
---

# Finance Auditor — Multi-App Financial Audit Agent

## CRITICAL SAFETY RULES — READ FIRST

1. **NEVER `firebase deploy`** — not staging, not production, never.
2. **NEVER commit or push to `main`** — all writes go through a branch + draft PR.
3. **NEVER modify** `firestore.rules`, `firebase-config.js` / `firebase.js`, or any auth file.
4. **NEVER hard-delete** business data (no `deleteDoc` on business collections). Soft-delete only.
5. **In `audit` mode: write NOTHING except the report** under `docs/audits/`. Zero changes to source files.
6. **Financial fixes are draft-only** — labeled `[BUTUH PERSETUJUAN — FINANCIAL]`, never merged, never deployed.
7. **NEVER modify** `CLAUDE.md`, `.claude/settings.json`, or any workflow file.

If a requested action conflicts with these rules, STOP and report instead of acting.
````

- [ ] **Step 2: Verify frontmatter parses and required fields exist**

Run:
```bash
cd "C:\Project\apps\.claude\worktrees\upbeat-tu-00534c"
python -c "import sys,yaml; t=open('.claude/agents/finance-auditor.md',encoding='utf-8').read(); fm=t.split('---')[1]; d=yaml.safe_load(fm); assert d['name']=='finance-auditor'; assert 'description' in d and 'tools' in d; print('frontmatter OK:', list(d.keys()))"
```
Expected: `frontmatter OK: ['name', 'description', 'tools']`

- [ ] **Step 3: Verify all 7 safety rules are present**

Run:
```bash
grep -c "^[0-9]\." .claude/agents/finance-auditor.md
```
Expected: `7`

- [ ] **Step 4: Commit**

```bash
git add .claude/agents/finance-auditor.md
git commit -m "feat(agent): scaffold finance-auditor subagent with safety rules"
```

---

## Task 2: Parameters, modes, and app map

**Files:**
- Modify: `.claude/agents/finance-auditor.md` (append after the safety rules section)

- [ ] **Step 1: Append the parameters/modes/app-map section**

Append to `.claude/agents/finance-auditor.md`:

````markdown

## Invocation & Parameters

Read these from the dispatch prompt. Apply defaults if unspecified.

- `scope`: `sj-monitor` | `bul-monitor` | `bul-accounting` | `erp-acc` | `all` (default: `all`)
- `domain`: `jurnal` | `uang-muka` | `arus-kas` | `pajak` | `invoice-payment` | `audit-trail` | `all` (default: `all`)
- `mode`: `audit` (default — read-only report) | `draft-fix` (explicit — branch + draft PR, never merged)

## App Map (where to look)

| App | Source root | Key financial files |
|---|---|---|
| sj-monitor | `apps/sj-monitor/src` | `App.jsx`, `services/sjCascadeService.js`, `utils/currency.js`, `utils/sjHelpers.js` |
| bul-monitor | `apps/bul-monitor/src` | `App.jsx`, `integrationService.js` |
| bul-accounting | `apps/bul-accounting/src` | `utils/accounting.js`, `pages/*Page.jsx` |
| erp-acc | `apps/erp-acc/erp-app/src` | `services/journalService.js`, `utils/lineItemTotals.js`, `utils/terbilang.js` |

Resolve `scope` to the app root(s) above. When `scope=all`, audit all four. Filter checks by `domain` when not `all`.
````

- [ ] **Step 2: Verify the three modes and parameters are documented**

Run:
```bash
grep -E "scope:|domain:|mode:" .claude/agents/finance-auditor.md | head
grep -c "apps/sj-monitor/src\|apps/bul-monitor/src\|apps/bul-accounting/src\|apps/erp-acc/erp-app/src" .claude/agents/finance-auditor.md
```
Expected: parameter lines printed; second command prints `4` (all four app roots present).

- [ ] **Step 3: Commit**

```bash
git add .claude/agents/finance-auditor.md
git commit -m "feat(agent): add finance-auditor parameters, modes, and app map"
```

---

## Task 3: Embedded audit catalog

**Files:**
- Modify: `.claude/agents/finance-auditor.md` (append)

- [ ] **Step 1: Append the audit catalog section**

Append to `.claude/agents/finance-auditor.md`:

````markdown

## Audit Catalog (extensible)

Run each rule applicable to the resolved `scope`/`domain`. To add a rule later, append a row with the same columns and a detection note below. `Financial?=yes` means a finding requires human approval and the `[BUTUH PERSETUJUAN — FINANCIAL]` label.

| # | Rule | Detection approach | Severity | Financial? | Domain |
|---|---|---|---|---|---|
| 1 | Journal balance | Find journal-entry builders; confirm total debit == total kredit per entry | 🔴 | yes | jurnal |
| 2 | Cash-flow opening balance boundary | `generateArusKasData`/opening-balance: opening must use `date < startDate` (exclusive), not `<=` | 🟠 | yes | arus-kas |
| 3 | Bridge double-posting guard | `upsertQueueDoc`/integration: re-sending an `approved` item must be blocked (no reset to `pending`/null `journalId`) | 🟠 | yes | jurnal |
| 4 | Soft-delete enforcement | Grep for `hardDelete`/`deleteDoc` on business collections; flag any use or dead-code definition | 🟡 | no | audit-trail |
| 5 | Audit-trail presence | Status changes (gagal/restore/post) should call `addHistoryLog` | 🟡 | no | audit-trail |
| 6 | Tax-rate default swallows 0% | `tax_rate || 11` taxable path: 0% becomes 11%; recommend `?? 11` (nullish) | 🟡 | yes | pajak |
| 7 | Rounding consistency | `add*Payment` vs `remove*Payment`: paid/partial threshold must round consistently | 🟡 | yes | invoice-payment |
| 8 | Non-atomic write / orphan header | Journal header + items written separately without RPC/transaction → orphan header on item failure | 🟡 | yes | jurnal |
| 9 | Uang muka allocation | Allocated ≤ available; `Sisa = tagihan − pembayaran − potongan uang muka` | 🟠 | yes | uang-muka |
| 10 | Numbering race | `getNext*No` read-max-then-+1 without atomic counter/transaction → duplicate IDs | 🟡 | no | jurnal |
| 11 | Number formatting bounds | `terbilang` correctness for values ≥ 1 trillion (index overflow) | 🟡 | no | invoice-payment |
| 12 | Housekeeping | Stale journal comments (wrong account code); writes to a different collection than source (dual `invoice`/`invoices`) | ⚪ | no | jurnal |

**Detection notes:**
- Prefer `Grep`/`Glob` to locate, then `Read` the surrounding function before judging. Cite `file:line`.
- A rule may legitimately have no findings — record that the check ran and passed.
- Rules 1, 2, 3, 8, 9 are the highest-impact money-correctness checks; always run them when `domain=all`.
````

- [ ] **Step 2: Verify the catalog has 12 rules and required columns**

Run:
```bash
grep -E "^\| [0-9]+ \|" .claude/agents/finance-auditor.md | wc -l
grep -c "Financial?" .claude/agents/finance-auditor.md
```
Expected: first prints `12`; second prints at least `1`.

- [ ] **Step 3: Commit**

```bash
git add .claude/agents/finance-auditor.md
git commit -m "feat(agent): embed extensible audit catalog (12 rules)"
```

---

## Task 4: Audit phase + report template

**Files:**
- Modify: `.claude/agents/finance-auditor.md` (append)

- [ ] **Step 1: Append the audit phase and report template**

Append to `.claude/agents/finance-auditor.md`:

````markdown

## Phase: AUDIT (default — read-only)

1. Resolve `scope` → app root(s); note `domain` filter.
2. For each applicable catalog rule: locate target code (`Grep`/`Glob`), `Read` the function, decide **pass** / **finding**.
3. For each finding record: severity, app, `file:line`, root-cause summary, recommendation, and whether it is financial (→ "minta persetujuan").
4. Write the report to `docs/audits/LAPORAN_AUDIT_<scope>_<YYYY-MM-DD>.md` using the template below. Use `all` as `<scope>` when auditing everything.
5. **Do NOT modify any source file.** The only write is the report.
6. Return to the caller: the report path and counts by severity.

## Report Template

```markdown
# Laporan Audit — <scope>

**Tanggal:** <YYYY-MM-DD>
**Cakupan:** <apps audited> (domain: <domain>)
**Catatan:** Audit read-only. Tidak ada kode yang diubah. Temuan finansial wajib minta persetujuan.

---

## Ringkasan Prioritas

| # | Severity | App | Lokasi | Inti masalah |
|---|---|---|---|---|
| 1 | 🔴 Tinggi | <app> | `path:line` | <one line> |

## Temuan Detail

### <emoji> #<n> — <title>
**File:** `path:line`
**Inti:** <what is wrong, with a short code snippet>
**Dampak:** <consequence>
**Rekomendasi:** <fix>. <If financial: "Sentuh logika uang → minta persetujuan.">

## Area yang TIDAK diaudit
- <e.g. Supabase RPC SQL, firestore.rules — out of static scope>

## Rekomendasi langkah berikut (urutan)
1. <highest-impact first>
```

Severity scale: 🔴 Tinggi / 🟠 Sedang / 🟡 Rendah / ⚪ Info.
````

- [ ] **Step 2: Verify the audit phase and template anchors exist**

Run:
```bash
grep -c "Phase: AUDIT\|Report Template\|docs/audits/LAPORAN_AUDIT_\|Ringkasan Prioritas\|Area yang TIDAK diaudit" .claude/agents/finance-auditor.md
```
Expected: `5` (all five anchors present).

- [ ] **Step 3: Commit**

```bash
git add .claude/agents/finance-auditor.md
git commit -m "feat(agent): add finance-auditor audit phase and report template"
```

---

## Task 5: Draft-fix phase + output contract

**Files:**
- Modify: `.claude/agents/finance-auditor.md` (append)

- [ ] **Step 1: Append the draft-fix phase**

Append to `.claude/agents/finance-auditor.md`:

````markdown

## Phase: DRAFT-FIX (only when `mode=draft-fix`)

Precondition: an audit report already exists (run `audit` first if not).

1. Ensure the working tree is clean. Create branch `claude/audit-fix-<YYYY-MM-DD>` (never work on `main`).
2. Apply one finding per commit; conventional commit messages in English.
3. **Financial findings** (`Financial?=yes`): still apply the change, but prefix the commit subject and note it in the PR body as `[BUTUH PERSETUJUAN — FINANCIAL]`. These must NOT be merged or deployed.
4. Validate each affected app:
   - any app: `cd apps/<app> && npm run build` (must pass)
   - sj-monitor additionally: `npm test && npm run lint`
5. Open a **draft** PR with `gh pr create --draft`, body mapping each finding → fix and listing validation results. No auto-merge, no deploy.
6. If any build/test fails, revert that commit and report — do not force it through.

## Output Contract (what to return to the caller)

- `mode=audit`: report path + `{tinggi, sedang, rendah, info}` counts + one-line headline.
- `mode=draft-fix`: branch name, draft PR URL, per-finding status (applied / labeled-financial / reverted), validation summary.
````

- [ ] **Step 2: Verify draft-fix safety anchors**

Run:
```bash
grep -c "Phase: DRAFT-FIX\|claude/audit-fix-\|BUTUH PERSETUJUAN — FINANCIAL\|gh pr create --draft\|Output Contract" .claude/agents/finance-auditor.md
```
Expected: `5`.

- [ ] **Step 3: Final whole-file sanity check**

Run:
```bash
python -c "t=open('.claude/agents/finance-auditor.md',encoding='utf-8').read(); req=['CRITICAL SAFETY RULES','Invocation & Parameters','App Map','Audit Catalog','Phase: AUDIT','Report Template','Phase: DRAFT-FIX','Output Contract']; missing=[s for s in req if s not in t]; print('MISSING:',missing) if missing else print('ALL SECTIONS PRESENT')"
```
Expected: `ALL SECTIONS PRESENT`

- [ ] **Step 4: Commit**

```bash
git add .claude/agents/finance-auditor.md
git commit -m "feat(agent): add finance-auditor draft-fix phase and output contract"
```

---

## Task 6: Output directory + functional smoke test

**Files:**
- Create: `docs/audits/.gitkeep`

> **Run-by note:** the dispatch in Step 3 must be performed by the orchestrator session (or the human), NOT by a nested task-subagent, because it invokes the `finance-auditor` subagent itself.

- [ ] **Step 1: Create the audits output directory**

```bash
mkdir -p docs/audits
printf "" > docs/audits/.gitkeep
git add docs/audits/.gitkeep
git commit -m "chore: add docs/audits output directory for finance-auditor reports"
```

- [ ] **Step 2: Record the pre-state (no source files should change)**

```bash
git status --short
```
Expected: clean (no changes) — establishes the baseline before the smoke dispatch.

- [ ] **Step 3: Dispatch finance-auditor in audit mode on a narrow scope**

Dispatch the `finance-auditor` subagent (via the Agent tool) with this prompt:
> "mode=audit, scope=bul-accounting, domain=audit-trail. Audit per your catalog and write the report. Do not modify any source file."

Rationale: `bul-accounting` has a known dead-code `hardDeleteJournal` (soft-delete rule #4), so the run should surface at least one finding and exercises report generation on a small, fast scope.

- [ ] **Step 4: Verify the report was produced and no source files changed**

Run:
```bash
ls docs/audits/LAPORAN_AUDIT_bul-accounting_*.md
git status --short -- apps/
python -c "import glob; f=sorted(glob.glob('docs/audits/LAPORAN_AUDIT_bul-accounting_*.md'))[-1]; t=open(f,encoding='utf-8').read(); req=['Ringkasan Prioritas','Temuan Detail','Area yang TIDAK diaudit']; print('REPORT OK' if all(s in t for s in req) else 'REPORT MISSING SECTIONS')"
```
Expected:
- A report file is listed.
- `git status --short -- apps/` prints **nothing** (audit changed zero source files — safety rule #5 holds).
- Prints `REPORT OK`.

- [ ] **Step 5: Commit the smoke-test report as evidence**

```bash
git add docs/audits/LAPORAN_AUDIT_bul-accounting_*.md
git commit -m "test(agent): finance-auditor audit-mode smoke report (bul-accounting/audit-trail)"
```

---

## Self-Review (completed by plan author)

**Spec coverage:**
- Bentuk/lokasi subagent (spec §3) → Task 1.
- Parameter scope/domain/mode (spec §4) → Task 2.
- Katalog pemeriksaan 12 aturan (spec §5) → Task 3.
- Output laporan + format + lokasi `docs/audits/` (spec §6) → Task 4 + Task 6 Step 1.
- Fase draft-fix + draft PR + label finansial + validasi (spec §7) → Task 5.
- Safety rules (spec §8) → Task 1.
- Kriteria keberhasilan: audit-mode menghasilkan laporan tanpa ubah source (spec §11) → Task 6 smoke test.

**Out-of-scope items (spec §10)** — scheduling, runtime execution, deep firestore.rules/SQL audit, auto-merge: intentionally NOT in any task. Correct.

**Placeholder scan:** No TBD/TODO. Every file-changing step contains the full literal content to write.

**Type/name consistency:** Section names referenced in verification steps (`CRITICAL SAFETY RULES`, `Invocation & Parameters`, `App Map`, `Audit Catalog`, `Phase: AUDIT`, `Report Template`, `Phase: DRAFT-FIX`, `Output Contract`) match exactly the headings written in Tasks 1–5. Report path pattern `docs/audits/LAPORAN_AUDIT_<scope>_<YYYY-MM-DD>.md` is consistent across Task 4, Task 6, and the report template.
````
