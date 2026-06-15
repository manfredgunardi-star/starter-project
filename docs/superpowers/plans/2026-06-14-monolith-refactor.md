# Monolith Refactor Navigator Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Dispatch each task subagent with **model `sonnet`**.

**Goal:** Build the `monolith-refactor` subagent that incrementally decomposes oversized `App.jsx` monoliths into focused components without changing behavior, using a `map` phase (decomposition analysis) and an `extract` phase (one unit per draft PR, validated by build + Playwright E2E).

**Architecture:** A single Claude Code subagent definition file at `.claude/agents/monolith-refactor.md`, sibling to the existing `finance-auditor.md`. The file is a system prompt with YAML frontmatter plus body sections: safety rules, target/parameters, a MAP phase with a decomposition-map template, an EXTRACT phase with the 5-step procedure and golden flows, behavior-preservation rules, and an output contract. Verification is structural (required sections present, frontmatter parses) plus one functional smoke dispatch of the `map` phase against bul-monitor (read-only, no source changes).

**Tech Stack:** Markdown + YAML frontmatter (Claude Code agent format). Git-bash for verification (`grep`, `python` for YAML parse). The agent itself uses `npm run build` + Playwright MCP at runtime for the extract phase; the MAP smoke test needs neither.

**Source spec:** [docs/superpowers/specs/2026-06-14-monolith-refactor-agent-design.md](../specs/2026-06-14-monolith-refactor-agent-design.md)

---

## File Structure

- **Create:** `.claude/agents/monolith-refactor.md` — the entire subagent definition (frontmatter + all body sections). Built up section-by-section across Tasks 1–5.
- **Create:** `docs/refactor/.gitkeep` — ensures the decomposition-map output directory exists and is tracked.

All work happens on branch `claude/upbeat-tu-00534c` (already checked out in this worktree; currently in sync with main). Commit after each task.

**Note on the subagent's own model:** frontmatter omits `model:` so the agent inherits the caller's model. Independent of the model used to *execute this plan*.

**Playwright tools:** the frontmatter lists the Playwright MCP browser tools the EXTRACT phase needs. If that MCP server is unavailable at runtime, the agent must fall back to documenting manual golden-flow steps for the human and must NOT skip the safety check silently.

---

## Task 1: Scaffold file — frontmatter + safety rules

**Files:**
- Create: `.claude/agents/monolith-refactor.md`

- [ ] **Step 1: Create the file with frontmatter and safety rules**

Create `.claude/agents/monolith-refactor.md` with exactly this content:

````markdown
---
name: monolith-refactor
description: Use to incrementally decompose oversized App.jsx monoliths (bul-monitor ~7249 lines, sj-monitor ~4213 lines) into focused components WITHOUT changing behavior. Two modes — `map` (produce a read-only decomposition map) and `extract` (move one unit to its own file, validate with build + Playwright E2E, open a draft PR). Never touches financial logic or already-modular apps (bul-accounting, erp-acc). Invoke for "map <app> App.jsx" or "extract <unit> from <app>".
tools: Read, Grep, Glob, Bash, Edit, Write, mcp__plugin_playwright_playwright__browser_navigate, mcp__plugin_playwright_playwright__browser_snapshot, mcp__plugin_playwright_playwright__browser_take_screenshot, mcp__plugin_playwright_playwright__browser_click, mcp__plugin_playwright_playwright__browser_fill_form, mcp__plugin_playwright_playwright__browser_wait_for, mcp__plugin_playwright_playwright__browser_console_messages
---

# Monolith Refactor Navigator — Safe App.jsx Decomposition Agent

## CRITICAL SAFETY RULES — READ FIRST

1. **NEVER `firebase deploy`** — not staging, not production, never.
2. **NEVER commit or push to `main`** — all writes go through a branch + draft PR.
3. **NEVER modify** `firestore.rules`, `firebase-config.js` / `firebase.js`, or any auth file.
4. **NEVER change financial logic during a refactor.** Extraction is a pure structural move. If a unit contains money logic (`hargaPerRute`, `uangMuka`, `uangJalan`, `pajak`, `ppn`, `pph`, `debit`, `kredit`, `invoice`, `pembayaran`), move the UI shell but keep those functions byte-identical, and flag them for human review.
5. **`mode=map` writes NOTHING except the decomposition map** under `docs/refactor/`. Zero source changes.
6. **NEVER modify** `CLAUDE.md`, `.claude/settings.json`, or any workflow file.
7. **Only target monoliths that need it:** `bul-monitor` and `sj-monitor` App.jsx. NEVER restructure already-modular apps (`bul-accounting`, `erp-acc`).

If a requested action conflicts with these rules, STOP and report instead of acting.
````

- [ ] **Step 2: Verify frontmatter parses and required fields exist**

Run:
```bash
cd "C:\Project\apps\.claude\worktrees\upbeat-tu-00534c"
python -c "import yaml; t=open('.claude/agents/monolith-refactor.md',encoding='utf-8').read(); d=yaml.safe_load(t.split('---')[1]); assert d['name']=='monolith-refactor'; assert 'description' in d and 'tools' in d; print('frontmatter OK:', list(d.keys()))"
```
Expected: `frontmatter OK: ['name', 'description', 'tools']`

- [ ] **Step 3: Verify all 7 safety rules are present**

Run:
```bash
grep -c "^[0-9]\." .claude/agents/monolith-refactor.md
```
Expected: `7`

- [ ] **Step 4: Commit**

```bash
git add .claude/agents/monolith-refactor.md
git commit -m "feat(agent): scaffold monolith-refactor subagent with safety rules"
```

---

## Task 2: Target, parameters, and app map

**Files:**
- Modify: `.claude/agents/monolith-refactor.md` (append)

- [ ] **Step 1: Append the target/parameters section**

Append to `.claude/agents/monolith-refactor.md`:

````markdown

## Target & Parameters

Read these from the dispatch prompt. Apply defaults if unspecified.

- `target`: `bul-monitor` (default — App.jsx ~7249 lines) | `sj-monitor` (~4213 lines).
  `bul-accounting` and `erp-acc` are OUT OF SCOPE (already modular).
- `mode`: `map` (default — produce a read-only decomposition map) | `extract` (move one unit, validate, draft PR).
- `unit`: the unit id from the map (required when `mode=extract`).

Default: `target=bul-monitor`, `mode=map`.

## App Layout

| App | Monolith | Existing modular structure to mirror |
|---|---|---|
| bul-monitor | `apps/bul-monitor/src/App.jsx` | none yet — use sj-monitor as the template |
| sj-monitor | `apps/sj-monitor/src/App.jsx` | `apps/sj-monitor/src/pages/` and `apps/sj-monitor/src/components/` |

**Template reference (how to carve):** `apps/sj-monitor/src/pages/MasterDataPage.jsx`, `pages/LaporanKasPage.jsx`, `pages/InvoicePage.jsx`, `components/DockNav.jsx`. Follow these patterns for file placement, prop passing, and import style. Do not invent new conventions.
````

- [ ] **Step 2: Verify parameters and template anchors**

Run:
```bash
grep -c "target:\|mode:\|unit:\|Template reference" .claude/agents/monolith-refactor.md
grep -c "apps/sj-monitor/src/pages/\|apps/bul-monitor/src/App.jsx" .claude/agents/monolith-refactor.md
```
Expected: first prints at least `4`; second prints at least `1`.

- [ ] **Step 3: Commit**

```bash
git add .claude/agents/monolith-refactor.md
git commit -m "feat(agent): add monolith-refactor target, parameters, and app layout"
```

---

## Task 3: MAP phase + decomposition-map template

**Files:**
- Modify: `.claude/agents/monolith-refactor.md` (append)

- [ ] **Step 1: Append the MAP phase and map template**

Append to `.claude/agents/monolith-refactor.md`:

````markdown

## Phase: MAP (default — read-only analysis)

1. Read the target `App.jsx`. Use `Grep` to locate component/function definitions, `useState`/`useEffect` groups, and large inline JSX blocks.
2. Identify **seams** — cohesive units that could become their own file (a rendered section, an inline sub-component, a cluster of related helpers + their state).
3. For each unit record: kind, approximate line range, coupling (low/med/high based on shared state and props), and whether it touches financial logic.
4. Determine a **safe extraction order** — lowest-coupling / leaf units first.
5. Write the map to `docs/refactor/<target>-decomposition-map.md` using the template below.
6. **Do NOT modify any source file.** The only write is the map.
7. Return to the caller: number of units found, how many are financial, and the recommended first unit.

## Decomposition Map Template

```markdown
# Decomposition Map — <target>/src/App.jsx

**Generated:** <YYYY-MM-DD>   **Source size:** <N> lines
**Template reference:** sj-monitor `pages/` + `components/`

## Seams (extractable units)

| ID | Unit | Kind | Lines (approx) | Coupling | Financial? |
|----|------|------|----------------|----------|------------|
| U1 | <name> | component / section / helper | <start>–<end> | low/med/high | yes/no |

## Dependencies per unit

- **U1:** state used (`<...>`); props needed (`<...>`); context (`<...>`); imports (`<...>`)

## Safe extraction order

1. **U<x>** — <why first: leaf / lowest coupling>

## Financial units (require human review)

- **U<n>:** touches `<hargaPerRute/uangMuka/...>` — extract the UI shell only; keep money logic byte-identical.
```
````

- [ ] **Step 2: Verify MAP phase and template anchors**

Run:
```bash
grep -c "Phase: MAP\|Decomposition Map Template\|docs/refactor/\|Safe extraction order\|Financial units" .claude/agents/monolith-refactor.md
```
Expected: `5`.

- [ ] **Step 3: Commit**

```bash
git add .claude/agents/monolith-refactor.md
git commit -m "feat(agent): add monolith-refactor MAP phase and map template"
```

---

## Task 4: EXTRACT phase + golden flows

**Files:**
- Modify: `.claude/agents/monolith-refactor.md` (append)

- [ ] **Step 1: Append the EXTRACT phase and golden flows**

Append to `.claude/agents/monolith-refactor.md`:

````markdown

## Phase: EXTRACT (only when `mode=extract`, one unit per run)

Precondition: a decomposition map exists for the target (run `map` first if not). The caller supplies `unit`.

1. **Pre-flight** — ensure the working tree is clean. Create branch `claude/refactor-<target>-<unit>-<YYYY-MM-DD>` (never work on `main`).
2. **Baseline E2E** — start the app locally (`cd apps/<target> && npm run dev`). Run the golden flows via Playwright MCP and save baseline artifacts (screenshot + DOM snapshot + console + key network calls). If Playwright MCP is unavailable, STOP and report — do not extract without a safety net.
3. **Extract** — move the unit to a new file under `pages/` or `components/` (mirroring sj-monitor), wire imports/props. **Pure structural move: no logic changes, no business-symbol renames, no incidental "improvements".**
4. **Validate** — `cd apps/<target> && npm run build` must pass. Re-run the golden flows and compare to baseline. Any behavioral divergence → revert the change and report. (sj-monitor additionally: `npm test && npm run lint`.)
5. **Draft PR** — `gh pr create --draft` with the unit diff, build result, and the before/after E2E comparison. No auto-merge, no deploy.

## Golden Flows

A small, key set (not full E2E — avoid flakiness). Confirm the final list while mapping. Candidates for bul-monitor:
login → list SJ → create SJ → edit SJ → generate invoice → uang muka → integration sync.

Note: bul-monitor has no staging environment (only sj-monitor does), so golden flows run against the local dev server.
````

- [ ] **Step 2: Verify EXTRACT phase anchors**

Run:
```bash
grep -c "Phase: EXTRACT\|claude/refactor-\|Baseline E2E\|gh pr create --draft\|Golden Flows" .claude/agents/monolith-refactor.md
```
Expected: `5`.

- [ ] **Step 3: Commit**

```bash
git add .claude/agents/monolith-refactor.md
git commit -m "feat(agent): add monolith-refactor EXTRACT phase and golden flows"
```

---

## Task 5: Behavior-preservation rules + output contract

**Files:**
- Modify: `.claude/agents/monolith-refactor.md` (append)

- [ ] **Step 1: Append the final two sections**

Append to `.claude/agents/monolith-refactor.md`:

````markdown

## Behavior-Preservation Rules (core)

- Extraction = **structural move only**; zero behavior/logic change.
- **NEVER** touch or alter financial logic during a refactor. If a unit contains money logic, move the UI shell but keep those functions byte-identical and flag them for human review.
- Follow existing patterns (sj-monitor structure as the template). Do not introduce new conventions.
- One unit per PR. Keep each change small and reviewable.

## Output Contract (what to return to the caller)

- `mode=map`: map path + `{total units, financial units}` counts + recommended first unit id.
- `mode=extract`: branch name, draft PR URL, unit moved, build result, E2E comparison verdict (match / divergence-reverted).
````

- [ ] **Step 2: Verify final anchors**

Run:
```bash
grep -c "Behavior-Preservation Rules\|Output Contract" .claude/agents/monolith-refactor.md
```
Expected: `2`.

- [ ] **Step 3: Whole-file sanity check (all sections present in order)**

Run:
```bash
python -c "t=open('.claude/agents/monolith-refactor.md',encoding='utf-8').read(); req=['CRITICAL SAFETY RULES','Target & Parameters','App Layout','Phase: MAP','Decomposition Map Template','Phase: EXTRACT','Golden Flows','Behavior-Preservation Rules','Output Contract']; missing=[s for s in req if s not in t]; print('MISSING:',missing) if missing else print('ALL SECTIONS PRESENT')"
```
Expected: `ALL SECTIONS PRESENT`

- [ ] **Step 4: Commit**

```bash
git add .claude/agents/monolith-refactor.md
git commit -m "feat(agent): add monolith-refactor behavior rules and output contract"
```

---

## Task 6: Output directory + functional smoke test (MAP)

**Files:**
- Create: `docs/refactor/.gitkeep`

> **Run-by note:** the dispatch in Step 3 invokes the `monolith-refactor` subagent itself. It must be performed by the orchestrator session (or the human), NOT by a nested task-subagent. The `monolith-refactor` agent type becomes available after Task 1 is merged/registered; if it is not yet selectable as a subagent type, run the smoke test by dispatching a general-purpose subagent instructed to READ `.claude/agents/monolith-refactor.md` and operate per that file.

- [ ] **Step 1: Create the refactor output directory**

```bash
cd "C:\Project\apps\.claude\worktrees\upbeat-tu-00534c"
mkdir -p docs/refactor
printf "" > docs/refactor/.gitkeep
git add docs/refactor/.gitkeep
git commit -m "chore: add docs/refactor output directory for decomposition maps"
```

- [ ] **Step 2: Record the pre-state (no source files should change)**

```bash
git status --short
```
Expected: clean — establishes the baseline before the smoke dispatch.

- [ ] **Step 3: Dispatch monolith-refactor in MAP mode against bul-monitor**

Dispatch with this prompt:
> "mode=map, target=bul-monitor. Analyze `apps/bul-monitor/src/App.jsx`, identify extractable seams with dependencies and a safe extraction order, flag financial units, and write the decomposition map per your template. Do not modify any source file."

Rationale: `bul-monitor/src/App.jsx` (~7249 lines) is the primary target; MAP is read-only, so this exercises the analysis + map-writing path without any risk.

- [ ] **Step 4: Verify the map was produced and no source files changed**

Run:
```bash
ls docs/refactor/bul-monitor-decomposition-map.md
git status --short -- apps/
python -c "t=open('docs/refactor/bul-monitor-decomposition-map.md',encoding='utf-8').read(); req=['Seams','Dependencies per unit','Safe extraction order','Financial units']; print('MAP OK' if all(s in t for s in req) else 'MAP MISSING SECTIONS')"
```
Expected:
- The map file is listed.
- `git status --short -- apps/` prints **nothing** (MAP changed zero source files — safety rule #5 holds).
- Prints `MAP OK`.

- [ ] **Step 5: Commit the smoke-test map as evidence**

```bash
git add docs/refactor/bul-monitor-decomposition-map.md
git commit -m "test(agent): monolith-refactor map-mode smoke output (bul-monitor)"
```

---

## Self-Review (completed by plan author)

**Spec coverage:**
- Bentuk/lokasi subagent (spec §3) → Task 1.
- Target/parameter target/mode/unit + exclusion modular apps (spec §4) → Task 2 + safety rule #7 in Task 1.
- Fase MAP + peta dekomposisi + lokasi `docs/refactor/` + tanda finansial + template sj-monitor (spec §5) → Task 3.
- Fase EXTRACT 5 langkah + golden flows + dev server lokal (spec §6, §7) → Task 4.
- Aturan jaga-perilaku (spec §8) → Task 5 + safety rule #4 in Task 1.
- Safety rules (spec §9) → Task 1.
- Kriteria keberhasilan: MAP menghasilkan peta tanpa ubah source (spec §12) → Task 6 smoke test.

**Out-of-scope items (spec §11)** — performance/logic improvements, modular apps, financial logic changes, component-test framework setup: intentionally NOT in any task; reinforced by safety rules #4 and #7. Correct.

**Placeholder scan:** No TBD/TODO. Every file-changing step contains the full literal content to write. The map template uses `<...>` angle-bracket fill-ins, but those are intended literal template placeholders inside the agent's output template, not plan gaps.

**Type/name consistency:** Section headings referenced in verification steps (`CRITICAL SAFETY RULES`, `Target & Parameters`, `App Layout`, `Phase: MAP`, `Decomposition Map Template`, `Phase: EXTRACT`, `Golden Flows`, `Behavior-Preservation Rules`, `Output Contract`) match exactly the headings written in Tasks 1–5. Map filename pattern `docs/refactor/<target>-decomposition-map.md` is consistent across Task 3, Task 6, and the template (`bul-monitor-decomposition-map.md`). Branch pattern `claude/refactor-<target>-<unit>-<YYYY-MM-DD>` consistent in Task 4.
