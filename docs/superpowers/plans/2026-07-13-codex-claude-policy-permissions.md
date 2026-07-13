# Codex–Claude Policy and Permissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menyelaraskan kebijakan Codex dan Claude untuk empat aplikasi, memisahkan peran implementer/reviewer, serta menghapus permission eksternal yang terlalu luas tanpa mengubah aplikasi bisnis.

**Architecture:** Root `AGENTS.md` dan `CLAUDE.md` memuat invariant bersama, sedangkan pasangan file pada setiap root aplikasi memuat aturan domain dan validation matrix. Dokumen rinci hidup di `docs/agent-policy`, reviewer Claude memakai profile read-only, dan script Node memverifikasi keberadaan aturan kritis serta absennya permission berbahaya.

**Tech Stack:** Markdown, Claude Code project settings JSON, Node.js built-in modules, Git, PowerShell.

## Global Constraints

- Bahasa diskusi dan penjelasan adalah Bahasa Indonesia.
- Git commit message menggunakan English conventional commit style.
- Production deployment dilarang bagi workflow agen standar.
- Staging deployment hanya dijalankan jika task contract atau user memintanya.
- Financial logic, schema, auth, security rules, audit behavior, dan data bisnis memerlukan persetujuan user.
- Satu task memiliki satu implementer, satu branch, dan satu worktree.
- Reviewer bersifat read-only dan tidak boleh edit, commit, push, deploy, atau menjalankan migration.
- Jangan menyentuh perubahan user yang sudah ada di checkout utama.
- Eksekusi plan harus dimulai di isolated worktree yang dibuat melalui `superpowers:using-git-worktrees`.
- Fase ini tidak menghapus worktree lama dan tidak mengubah source code aplikasi.

---

## File Map

**Create:**

- `scripts/validate-agent-policy.mjs` — validator kebijakan dan permission tanpa dependency tambahan.
- `scripts/tests/validate-agent-policy.test.mjs` — unit test validator dengan `node:test`.
- `docs/agent-policy/repository-map.md` — peta empat aplikasi dan backend aktual.
- `docs/agent-policy/shared-safety.md` — global safety dan approval gates.
- `docs/agent-policy/validation-matrix.md` — perintah validasi per aplikasi.
- `docs/agent-policy/worktree-lifecycle.md` — lifecycle dan retention worktree.
- `docs/agent-policy/manual-collaboration.md` — task contract dan alur implementer/reviewer.
- `apps/sj-monitor/AGENTS.md` — instruksi Codex khusus sj-monitor.
- `apps/bul-monitor/AGENTS.md` — instruksi Codex khusus bul-monitor.
- `apps/bul-accounting/AGENTS.md` — instruksi Codex khusus bul-accounting.
- `apps/erp-acc/erp-app/AGENTS.md` — instruksi Codex khusus ERP-ACC.
- `apps/erp-acc/erp-app/CLAUDE.md` — instruksi Claude aktual pada root aplikasi ERP-ACC.
- `apps/sj-monitor/docs/agent-policy/ui-design-system.md` — detail Liquid Glass yang dipindahkan dari entrypoint.
- `.claude/agents/code-reviewer.md` — reviewer umum read-only.
- `.claude/agents/security-reviewer.md` — reviewer auth/RBAC/RLS read-only.
- `.claude/agents/accounting-reviewer.md` — reviewer finansial read-only.

**Modify:**

- `AGENTS.md` — root policy Codex yang akurat.
- `CLAUDE.md` — root policy Claude yang semantik dengan AGENTS.md.
- `apps/sj-monitor/CLAUDE.md` — ringkas dan pisahkan instruksi reviewer/UI detail.
- `apps/bul-monitor/CLAUDE.md` — hapus deploy umum dan output-review global.
- `apps/bul-accounting/CLAUDE.md` — perbaiki path dan hapus deploy umum.
- `apps/erp-acc/CLAUDE.md` — ubah menjadi pointer ke root aplikasi aktual.
- `.claude/agents/finance-auditor.md` — jadikan benar-benar read-only; hilangkan draft-fix writer mode.
- `.claude/settings.json` — ganti historical allowlist dengan baseline minimum dan deny list.
- `apps/sj-monitor/.claude/settings.json` — hapus permission yang tidak perlu.
- `apps/sj-monitor/.claude/settings.local.json` — hapus `Bash(firebase:*)` dan `Bash(npm run:*)` broad allow.
- `apps/bul-accounting/.claude/settings.local.json` — hapus semua deployment dan historical filesystem permissions.
- `apps/erp-acc/.claude/settings.json` — hapus destructive, push, dan Supabase deployment permissions.
- `apps/erp-acc/.claude/settings.local.json` — sisakan read-only inspection yang relevan atau kosongkan allowlist.
- `apps/erp-acc/.claude/agents/pre-deploy-checker.md` — perbaiki path dan tegaskan checker tidak melakukan deploy.

**Do not modify:**

- Semua `src/**`, `firestore.rules`, migration, `.env`, package manifest, Firebase config, Supabase config, dan deployment config.

---

### Task 1: Build the Policy Validation Harness

**Files:**

- Create: `scripts/tests/validate-agent-policy.test.mjs`
- Create: `scripts/validate-agent-policy.mjs`

**Interfaces:**

- Produces: `checkText(text, required, forbidden) -> string[]`.
- Produces: `validateScope(repoRoot, scope) -> { scope: string, failures: string[] }`.
- CLI: `node scripts/validate-agent-policy.mjs --scope root|apps|reviewers|permissions|all`.
- Exit code `0` berarti tidak ada failure; exit code `1` berarti policy belum memenuhi kontrak.

- [ ] **Step 1: Write the failing unit tests**

Create `scripts/tests/validate-agent-policy.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkText } from '../validate-agent-policy.mjs';

test('checkText reports missing required phrases', () => {
  assert.deepEqual(checkText('alpha', ['alpha', 'beta'], []), ['missing: beta']);
});

test('checkText reports forbidden phrases case-insensitively', () => {
  assert.deepEqual(
    checkText('Firebase Deploy --only hosting', [], ['firebase deploy']),
    ['forbidden: firebase deploy'],
  );
});

test('checkText returns no failures for compliant text', () => {
  assert.deepEqual(checkText('reviewer read-only; production deployment dilarang', [
    'reviewer read-only',
    'production deployment dilarang',
  ], ['firebase deploy:*']), []);
});
```

- [ ] **Step 2: Run the test and verify the module is missing**

Run:

```powershell
node --test scripts/tests/validate-agent-policy.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/validate-agent-policy.mjs`.

- [ ] **Step 3: Implement the validator**

Create `scripts/validate-agent-policy.mjs`:

```js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function checkText(text, required = [], forbidden = []) {
  const normalized = text.toLowerCase();
  return [
    ...required
      .filter((phrase) => !normalized.includes(phrase.toLowerCase()))
      .map((phrase) => `missing: ${phrase}`),
    ...forbidden
      .filter((phrase) => normalized.includes(phrase.toLowerCase()))
      .map((phrase) => `forbidden: ${phrase}`),
  ];
}

const scopeFiles = {
  root: [
    ['AGENTS.md', ['empat aplikasi', 'production deployment dilarang', 'reviewer read-only', 'satu implementer'], []],
    ['CLAUDE.md', ['empat aplikasi', 'production deployment dilarang', 'reviewer read-only', 'satu implementer'], []],
    ['docs/agent-policy/repository-map.md', ['apps/erp-acc/erp-app', 'supabase', 'vercel'], []],
    ['docs/agent-policy/shared-safety.md', ['financial logic', 'security rules', 'persetujuan user'], []],
    ['docs/agent-policy/validation-matrix.md', ['npm run build', 'playwright', 'staging'], []],
    ['docs/agent-policy/worktree-lifecycle.md', ['created', 'quarantined', 'git worktree remove'], ['--force']],
    ['docs/agent-policy/manual-collaboration.md', ['task contract', 'implementer', 'reviewer'], []],
  ],
  apps: [
    ['apps/sj-monitor/AGENTS.md', ['firestore write safety', 'npm run build', 'staging_deploy'], []],
    ['apps/sj-monitor/CLAUDE.md', ['firestore write safety', 'npm run build', 'staging_deploy'], []],
    ['apps/bul-monitor/AGENTS.md', ['bul_*', 'npm run build', 'production deployment dilarang'], []],
    ['apps/bul-monitor/CLAUDE.md', ['bul_*', 'npm run build', 'production deployment dilarang'], ['firebase deploy --only hosting,firestore:rules']],
    ['apps/bul-accounting/AGENTS.md', ['debit', 'kredit', 'npm test'], []],
    ['apps/bul-accounting/CLAUDE.md', ['debit', 'kredit', 'npm test'], ['c:\\project\\apps\\bul-acc']],
    ['apps/erp-acc/erp-app/AGENTS.md', ['supabase', 'rls', 'npm run lint'], []],
    ['apps/erp-acc/erp-app/CLAUDE.md', ['supabase', 'rls', 'npm run lint'], ['firebase deploy']],
  ],
  reviewers: [
    ['.claude/agents/code-reviewer.md', ['tools: read, grep, glob, bash', 'read-only'], ['tools: read, grep, glob, bash, edit']],
    ['.claude/agents/security-reviewer.md', ['tools: read, grep, glob, bash', 'read-only'], ['tools: read, grep, glob, bash, edit']],
    ['.claude/agents/accounting-reviewer.md', ['tools: read, grep, glob, bash', 'read-only'], ['tools: read, grep, glob, bash, edit']],
    ['.claude/agents/finance-auditor.md', ['tools: read, grep, glob, bash', 'read-only'], ['draft-fix', 'tools: read, grep, glob, bash, edit']],
  ],
  permissions: [
    ['.claude/settings.json', [], ['firebase deploy:*', 'git push:*', 'git reset:*', 'rm -rf']],
    ['apps/sj-monitor/.claude/settings.json', [], ['firebase:*', 'firebase deploy']],
    ['apps/sj-monitor/.claude/settings.local.json', [], ['firebase:*', 'npm run:*']],
    ['apps/bul-accounting/.claude/settings.local.json', [], ['firebase deploy', 'firebase deploy:*']],
    ['apps/erp-acc/.claude/settings.json', [], ['rm -rf', 'git reset:*', 'git push:*', 'deploy_edge_function']],
    ['apps/erp-acc/.claude/settings.local.json', [], ['git push:*', 'firebase deploy', 'deploy_edge_function']],
  ],
};

const requiredRootDeny = [
  'Bash(firebase deploy:*)',
  'Bash(npx firebase deploy:*)',
  'Bash(vercel deploy --prod:*)',
  'Bash(npx vercel deploy --prod:*)',
  'Bash(supabase db push:*)',
  'Bash(npx supabase db push:*)',
  'Bash(git push --force:*)',
  'Bash(git reset --hard:*)',
  'Bash(rm -rf:*)',
];

function readUtf8(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

export function validateScope(repoRoot, scope = 'all') {
  const selected = scope === 'all' ? Object.keys(scopeFiles) : [scope];
  const failures = [];

  for (const selectedScope of selected) {
    if (!scopeFiles[selectedScope]) {
      failures.push(`unknown scope: ${selectedScope}`);
      continue;
    }

    for (const [relativePath, required, forbidden] of scopeFiles[selectedScope]) {
      const absolutePath = path.join(repoRoot, relativePath);
      if (!fs.existsSync(absolutePath)) {
        failures.push(`${relativePath}: missing file`);
        continue;
      }
      const rawText = readUtf8(absolutePath);
      const parsedSettings = selectedScope === 'permissions' ? JSON.parse(rawText) : null;
      const inspectedText = parsedSettings
        ? JSON.stringify(parsedSettings.permissions?.allow ?? [])
        : rawText;
      for (const failure of checkText(inspectedText, required, forbidden)) {
        failures.push(`${relativePath}: ${failure}`);
      }
      if (selectedScope === 'permissions' && relativePath === '.claude/settings.json') {
        const denyText = JSON.stringify(parsedSettings.permissions?.deny ?? []);
        for (const failure of checkText(denyText, requiredRootDeny, [])) {
          failures.push(`${relativePath} deny: ${failure}`);
        }
      }
    }
  }

  return { scope, failures };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const scopeIndex = process.argv.indexOf('--scope');
  const scope = scopeIndex >= 0 ? process.argv[scopeIndex + 1] : 'all';
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const result = validateScope(repoRoot, scope);
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.failures.length === 0 ? 0 : 1;
}
```

- [ ] **Step 4: Run unit tests**

Run:

```powershell
node --test scripts/tests/validate-agent-policy.test.mjs
```

Expected: 3 tests PASS.

- [ ] **Step 5: Confirm the current policy baseline fails**

Run:

```powershell
node scripts/validate-agent-policy.mjs --scope all
```

Expected: exit code `1` with missing paired app policy files and forbidden permission findings.

- [ ] **Step 6: Commit the harness**

```powershell
git add scripts/validate-agent-policy.mjs scripts/tests/validate-agent-policy.test.mjs
git commit -m "test: add agent policy validation harness"
```

### Task 2: Establish Shared Root Policy

**Files:**

- Create: `docs/agent-policy/repository-map.md`
- Create: `docs/agent-policy/shared-safety.md`
- Create: `docs/agent-policy/validation-matrix.md`
- Create: `docs/agent-policy/worktree-lifecycle.md`
- Create: `docs/agent-policy/manual-collaboration.md`
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`

**Interfaces:**

- Produces: repository-wide invariant read by every app policy.
- Produces: task contract fields `task_id`, `project`, `objective`, `implementer`, `reviewer`, `allowed_paths`, `protected_paths`, risk flags, deployment flags, required checks, and acceptance criteria.
- Consumed by: app policies and reviewer profiles in later tasks.

- [ ] **Step 1: Write the five shared documents using the approved spec**

Use these exact responsibilities:

```text
repository-map.md      Four app paths, real stacks, backends, hosting, and cross-app bul bridge.
shared-safety.md       No production deploy; approval gates; soft delete; audit trail; preserve user changes.
validation-matrix.md   Exact npm commands per app; staging separated from local validation.
worktree-lifecycle.md  CREATED/ACTIVE/REVIEW/READY/MERGED/CLOSED/QUARANTINED/REMOVED and retention table.
manual-collaboration.md One writer, read-only reviewer, YAML task contract, two review-cycle limit.
```

Copy the wording and constraints from `docs/superpowers/specs/2026-07-13-codex-claude-manual-collaboration-design.md`; do not introduce new deployment authorization.

- [ ] **Step 2: Rewrite root AGENTS.md**

Required heading order:

```markdown
# AGENTS.md
## Communication
## Repository Map — Empat Aplikasi
## Manual Codex–Claude Operating Model
## Global Safety and Approval Gates
## Worktree Policy
## Validation Matrix
## Coding Conventions
## Instruction Precedence
## Handling Ambiguity
```

Include the exact statements `Production deployment dilarang`, `Reviewer read-only`, `Satu task memiliki satu implementer`, and links to all five `docs/agent-policy` files.

- [ ] **Step 3: Rewrite root CLAUDE.md with semantically identical invariants**

Use the same heading order as root AGENTS.md, changing only Codex-specific references to Claude-specific references. Preserve the autonomous bug-hunter description only as a link to its workflow/skill and state that it is outside the manual implementation workflow.

- [ ] **Step 4: Validate root scope**

Run:

```powershell
node scripts/validate-agent-policy.mjs --scope root
git diff --check -- AGENTS.md CLAUDE.md docs/agent-policy
```

Expected: validator exits `0`; `git diff --check` has no output.

- [ ] **Step 5: Commit root policy**

```powershell
git add AGENTS.md CLAUDE.md docs/agent-policy
git commit -m "docs: align shared Codex and Claude policy"
```

### Task 3: Add Paired Application Policies

**Files:**

- Create: all four app `AGENTS.md` files listed in File Map.
- Modify: `apps/sj-monitor/CLAUDE.md`, `apps/bul-monitor/CLAUDE.md`, `apps/bul-accounting/CLAUDE.md`, `apps/erp-acc/CLAUDE.md`.
- Create: `apps/erp-acc/erp-app/CLAUDE.md`.
- Create: `apps/sj-monitor/docs/agent-policy/ui-design-system.md`.

**Interfaces:**

- Consumes: root invariants and validation matrix from Task 2.
- Produces: nearest-file instructions for each agent at each app root.

- [ ] **Step 1: Create sj-monitor paired policy**

Both files must state:

```text
Domain: surat jalan, invoice, uang muka, kas, laporan truk, payslip, ritasi, master data.
Critical: Firestore write safety, six-role RBAC, rute naming, formatCurrency definition, no write loop.
Local checks: npm test; npm run lint; npm run build.
Staging: npm run smoketest only when task contract has staging_deploy: true or user requests it.
Protected: firestore.rules, auth, firebase config, pricing, uang muka, audit behavior, bulk import.
```

Move the detailed Liquid Glass rules verbatim to `apps/sj-monitor/docs/agent-policy/ui-design-system.md` and leave a concise link in both entrypoints.

- [ ] **Step 2: Create bul-monitor paired policy**

Both files must state prefix `bul_*`, long-polling as intentional, RBAC/listener invariants, bul bridge relationship, `npm run build`, and no default deployment. Remove the global JSON review-output requirement.

- [ ] **Step 3: Create bul-accounting paired policy**

Both files must state the exact path `C:\Project\apps\bul-accounting`, debit equals credit, Truck/Karyawan cost center, financial approval gates, `npm test`, and `npm run build`. Remove all deployment commands and the global JSON review-output requirement.

- [ ] **Step 4: Replace ERP-ACC template with actual paired policy**

Create app-root policies covering React/Vite/Ant Design/Supabase/Vercel, RLS/RPC/migration guardrails, stock/journal/returns/payment integrity, and `npm run lint` plus `npm run build`. Make `apps/erp-acc/CLAUDE.md` a short pointer to `apps/erp-acc/erp-app/CLAUDE.md`; do not retain Firebase claims.

- [ ] **Step 5: Validate app scope**

```powershell
node scripts/validate-agent-policy.mjs --scope apps
git diff --check -- apps/sj-monitor/AGENTS.md apps/sj-monitor/CLAUDE.md apps/sj-monitor/docs/agent-policy/ui-design-system.md apps/bul-monitor/AGENTS.md apps/bul-monitor/CLAUDE.md apps/bul-accounting/AGENTS.md apps/bul-accounting/CLAUDE.md apps/erp-acc/CLAUDE.md apps/erp-acc/erp-app/AGENTS.md apps/erp-acc/erp-app/CLAUDE.md
```

Expected: validator exits `0`; whitespace check has no output.

- [ ] **Step 6: Commit app policies**

```powershell
git add apps/sj-monitor/AGENTS.md apps/sj-monitor/CLAUDE.md apps/sj-monitor/docs/agent-policy/ui-design-system.md apps/bul-monitor/AGENTS.md apps/bul-monitor/CLAUDE.md apps/bul-accounting/AGENTS.md apps/bul-accounting/CLAUDE.md apps/erp-acc/CLAUDE.md apps/erp-acc/erp-app/AGENTS.md apps/erp-acc/erp-app/CLAUDE.md
git commit -m "docs: add paired agent policies for all apps"
```

### Task 4: Separate Read-Only Reviewer Profiles

**Files:**

- Create: `.claude/agents/code-reviewer.md`
- Create: `.claude/agents/security-reviewer.md`
- Create: `.claude/agents/accounting-reviewer.md`
- Modify: `.claude/agents/finance-auditor.md`
- Modify: `apps/erp-acc/.claude/agents/pre-deploy-checker.md`

**Interfaces:**

- Consumes: task contract and shared safety.
- Produces: JSON `{ verdict, findings[] }` with severity, file, line, claim, evidence, suggested_fix, and blocking.

- [ ] **Step 1: Create the general reviewer profile**

Use this frontmatter and safety contract:

```markdown
---
name: code-reviewer
description: Read-only review of one committed task diff against its task contract.
tools: Read, Grep, Glob, Bash
---

# Code Reviewer

- Read-only: never Edit, Write, commit, push, deploy, migrate, or modify external state.
- Review only the base..head diff and the supplied task contract.
- Return JSON with `verdict` and `findings`.
- Every finding must include file, line, claim, evidence, suggested_fix, and blocking.
- If evidence is insufficient, use `needs_user_decision`; do not guess.
```

- [ ] **Step 2: Create security and accounting reviewer profiles**

Reuse the same read-only/frontmatter contract. Security reviewer adds auth, RBAC, Firestore rules, Supabase RLS/RPC, secret, and privilege-boundary checks. Accounting reviewer adds journal balance, pricing, uang muka, tax, reconciliation, stock valuation, posting state, and audit-trail checks; financial recommendations always set `needs_user_decision` unless the task contract contains explicit approval.

- [ ] **Step 3: Make finance-auditor read-only**

Change frontmatter to `tools: Read, Grep, Glob, Bash`. Remove `draft-fix`, Edit/Write capability, branch creation, and draft PR behavior. Preserve the audit catalog and report-only behavior.

- [ ] **Step 4: Correct the ERP pre-deploy checker**

Update paths from `C:\Project\ERP-ACC` to `C:\Project\apps\erp-acc\erp-app`. Add an explicit rule that the checker verifies readiness but never deploys, migrates, edits, commits, or pushes.

- [ ] **Step 5: Validate reviewer scope**

```powershell
node scripts/validate-agent-policy.mjs --scope reviewers
git diff --check -- .claude/agents apps/erp-acc/.claude/agents/pre-deploy-checker.md
```

Expected: validator exits `0`; whitespace check has no output.

- [ ] **Step 6: Commit reviewer profiles**

```powershell
git add .claude/agents/code-reviewer.md .claude/agents/security-reviewer.md .claude/agents/accounting-reviewer.md .claude/agents/finance-auditor.md apps/erp-acc/.claude/agents/pre-deploy-checker.md
git commit -m "chore: enforce read-only Claude reviewers"
```

### Task 5: Tighten Claude Project Permissions

**Files:**

- Modify: all six settings files listed in File Map.

**Interfaces:**

- Consumes: role constraints from Tasks 2–4.
- Produces: parseable JSON without broad deploy, destructive filesystem, remote migration, reset, or push approvals.

- [ ] **Step 1: Replace the root historical allowlist**

Use this baseline structure in `.claude/settings.json`:

```json
{
  "permissions": {
    "allow": [
      "Read(//c/Project/**)",
      "Bash(git status:*)",
      "Bash(git diff:*)",
      "Bash(git log:*)",
      "Bash(git show:*)",
      "Bash(npm test:*)",
      "Bash(npm run test:*)",
      "Bash(npm run lint:*)",
      "Bash(npm run build:*)"
    ],
    "deny": [
      "Bash(firebase deploy:*)",
      "Bash(npx firebase deploy:*)",
      "Bash(vercel deploy --prod:*)",
      "Bash(npx vercel deploy --prod:*)",
      "Bash(supabase db push:*)",
      "Bash(npx supabase db push:*)",
      "Bash(git push --force:*)",
      "Bash(git reset --hard:*)",
      "Bash(rm -rf:*)"
    ]
  }
}
```

Do not retain historical one-off shell commands, temp access, or broad `npm exec` approval.

- [ ] **Step 2: Tighten sj-monitor settings**

Remove `Bash(firebase:*)`, `Bash(npm run:*)`, process-kill approvals, and browser approvals that are unrelated to baseline policy. Keep only app-specific read-only checks not already covered by root settings. Do not preapprove `npm run smoketest`.

- [ ] **Step 3: Tighten bul-accounting settings**

Remove both exact Firebase deploy commands, `Bash(firebase deploy:*)`, historical VS Code recovery searches, and broad `Bash(npm run:*)`. Keep only safe local inspection if still necessary.

- [ ] **Step 4: Tighten ERP-ACC settings**

Remove `rm -rf`, `mv`, `git reset:*`, `git push:*`, `deploy_edge_function`, package uninstall, and historical one-off commands. Retain only read-only Supabase metadata tools if they cannot change remote state; remote mutations remain unapproved.

- [ ] **Step 5: Parse every JSON file**

```powershell
$files = @(
  '.claude/settings.json',
  'apps/sj-monitor/.claude/settings.json',
  'apps/sj-monitor/.claude/settings.local.json',
  'apps/bul-accounting/.claude/settings.local.json',
  'apps/erp-acc/.claude/settings.json',
  'apps/erp-acc/.claude/settings.local.json'
)
foreach ($file in $files) { Get-Content $file -Raw | ConvertFrom-Json | Out-Null }
```

Expected: exit code `0`, no parser errors.

- [ ] **Step 6: Validate permission scope**

```powershell
node scripts/validate-agent-policy.mjs --scope permissions
git diff --check -- .claude/settings.json apps/sj-monitor/.claude/settings.json apps/sj-monitor/.claude/settings.local.json apps/bul-accounting/.claude/settings.local.json apps/erp-acc/.claude/settings.json apps/erp-acc/.claude/settings.local.json
```

Expected: validator exits `0`; whitespace check has no output.

- [ ] **Step 7: Commit permission changes**

```powershell
git add .claude/settings.json apps/sj-monitor/.claude/settings.json apps/sj-monitor/.claude/settings.local.json apps/bul-accounting/.claude/settings.local.json apps/erp-acc/.claude/settings.json apps/erp-acc/.claude/settings.local.json
git commit -m "chore: restrict Claude project permissions"
```

### Task 6: Validate and Dogfood the Manual Review Workflow

**Files:**

- Modify only if a verified finding requires a correction: policy files from Tasks 1–5.

**Interfaces:**

- Consumes: committed implementation branch and reviewer profile.
- Produces: read-only Claude review JSON and final Codex adjudication.

- [ ] **Step 1: Run all deterministic checks**

```powershell
node --test scripts/tests/validate-agent-policy.test.mjs
node scripts/validate-agent-policy.mjs --scope all
git diff main...HEAD --check
git status --short
```

Expected: tests PASS, policy validator exits `0`, diff check has no output, and status contains no unexpected files.

- [ ] **Step 2: Confirm no application source or deployment files changed**

```powershell
git diff --name-only main...HEAD
```

Expected: only `AGENTS.md`, `CLAUDE.md`, `docs/agent-policy/**`, `scripts/validate-agent-policy.mjs`, `scripts/tests/**`, `.claude/**`, and app-local agent instruction/settings paths listed in this plan.

- [ ] **Step 3: Run Claude as read-only reviewer**

Run from the policy worktree:

```powershell
claude -p --agent code-reviewer --permission-mode plan --tools "Read,Grep,Glob,Bash" --output-format json "Review the committed diff main...HEAD against docs/superpowers/specs/2026-07-13-codex-claude-manual-collaboration-design.md. Do not edit files. Return verdict and evidence-backed findings only."
```

Expected: JSON output; no working-tree changes.

- [ ] **Step 4: Adjudicate every finding**

Record each finding as `accepted`, `rejected_with_evidence`, `needs_user_decision`, or `out_of_scope`. Correct only accepted findings within the plan scope, then rerun Steps 1–3 once. Escalate if a blocking finding remains after the second cycle.

- [ ] **Step 5: Commit accepted review corrections if needed**

```powershell
git add AGENTS.md CLAUDE.md docs/agent-policy scripts/validate-agent-policy.mjs scripts/tests/validate-agent-policy.test.mjs .claude/settings.json .claude/agents/code-reviewer.md .claude/agents/security-reviewer.md .claude/agents/accounting-reviewer.md .claude/agents/finance-auditor.md apps/sj-monitor/AGENTS.md apps/sj-monitor/CLAUDE.md apps/sj-monitor/docs/agent-policy/ui-design-system.md apps/sj-monitor/.claude/settings.json apps/sj-monitor/.claude/settings.local.json apps/bul-monitor/AGENTS.md apps/bul-monitor/CLAUDE.md apps/bul-accounting/AGENTS.md apps/bul-accounting/CLAUDE.md apps/bul-accounting/.claude/settings.local.json apps/erp-acc/CLAUDE.md apps/erp-acc/erp-app/AGENTS.md apps/erp-acc/erp-app/CLAUDE.md apps/erp-acc/.claude/settings.json apps/erp-acc/.claude/settings.local.json apps/erp-acc/.claude/agents/pre-deploy-checker.md
git commit -m "docs: address agent policy review findings"
```

Skip the commit when no file changed.

- [ ] **Step 6: Prepare handoff**

Report branch, worktree path, commits, validator result, Claude verdict, unresolved decisions, and confirmation that no deployment or worktree cleanup occurred.
