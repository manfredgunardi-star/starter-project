# Worktree Lifecycle Audit and Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menginventarisasi semua worktree, mengarantina pekerjaan yang belum aman, dan membersihkan hanya worktree clean yang telah disetujui user melalui operasi Git non-paksa.

**Architecture:** Script PowerShell read-only menghasilkan snapshot JSON konsisten dari Git. Snapshot diterjemahkan menjadi proposal cleanup yang memisahkan remove candidates, quarantine, dan needs-user-decision; eksekusi berhenti untuk approval sebelum removal satu per satu dan verifikasi akhir.

**Tech Stack:** Git worktree, PowerShell, JSON, Markdown.

## Global Constraints

- Plan ini dijalankan hanya setelah plan kebijakan dan permission selesai serta sudah di-merge atau tersedia pada execution branch.
- Tidak menggunakan `git worktree remove --force`, `git branch -D`, `Remove-Item -Recurse`, atau penghapusan filesystem langsung.
- Dirty worktree, unmerged branch, dan detached HEAD dengan commit unik selalu dikarantina.
- Perubahan user tidak boleh dibuang, di-stash, di-commit, atau dipindah tanpa persetujuan eksplisit.
- Checkout utama `C:\Project` tidak dibersihkan dalam plan ini.
- User harus menyetujui manifest cleanup final sebelum Task 4.
- Tidak ada deployment, migration, perubahan aplikasi, atau external data write.

---

## File Map

**Create:**

- `scripts/worktree-audit.ps1` — audit read-only semua registered worktree.
- `scripts/tests/worktree-audit-smoke.ps1` — smoke test schema output dan absence of destructive verbs.
- `docs/worktree-audits/2026-07-13-inventory.json` — snapshot machine-readable.
- `docs/worktree-audits/2026-07-13-inventory.md` — klasifikasi dan bukti human-readable.
- `docs/worktree-audits/2026-07-13-cleanup-manifest.json` — keputusan per candidate dengan default `approved: false`.
- `docs/worktree-audits/2026-07-13-cleanup-result.md` — hasil aktual setelah approval dan cleanup.

**Modify:**

- `docs/agent-policy/worktree-lifecycle.md` hanya jika audit menemukan aturan yang ambigu atau tidak dapat dieksekusi.

**Do not modify:**

- Semua source app, worktree dirty/quarantined, checkout utama, deployment config, database config, dan branch yang belum merged.

---

### Task 1: Build the Read-Only Worktree Auditor

**Files:**

- Create: `scripts/tests/worktree-audit-smoke.ps1`
- Create: `scripts/worktree-audit.ps1`

**Interfaces:**

- CLI: `powershell -File scripts/worktree-audit.ps1 -RepoRoot C:\Project`.
- Produces JSON array with `path`, `branch`, `head`, `exists`, `dirtyCount`, `isMerged`, `isAncestorOfMain`, `ahead`, `behind`, and `lastCommitDate`.
- Script performs no Git write operation.

- [ ] **Step 1: Write the failing smoke test**

Create `scripts/tests/worktree-audit-smoke.ps1`:

```powershell
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$scriptPath = Join-Path $repoRoot 'scripts\worktree-audit.ps1'

if (-not (Test-Path -LiteralPath $scriptPath)) {
    throw "Missing audit script: $scriptPath"
}

$source = Get-Content -LiteralPath $scriptPath -Raw
$forbidden = @('worktree remove', 'worktree prune', 'branch -D', 'Remove-Item')
foreach ($token in $forbidden) {
    if ($source.Contains($token)) { throw "Destructive token found: $token" }
}

$json = & powershell -NoProfile -File $scriptPath -RepoRoot $repoRoot
$rows = $json | ConvertFrom-Json
if (@($rows).Count -lt 1) { throw 'Expected at least the primary worktree' }

$required = @('path', 'branch', 'head', 'exists', 'dirtyCount', 'isMerged', 'isAncestorOfMain', 'ahead', 'behind', 'lastCommitDate')
foreach ($name in $required) {
    if ($rows[0].PSObject.Properties.Name -notcontains $name) { throw "Missing property: $name" }
}

Write-Output "PASS: audited $(@($rows).Count) worktrees"
```

- [ ] **Step 2: Run the smoke test and verify it fails**

```powershell
powershell -NoProfile -File scripts/tests/worktree-audit-smoke.ps1
```

Expected: FAIL with `Missing audit script`.

- [ ] **Step 3: Implement the read-only auditor**

Create `scripts/worktree-audit.ps1`:

```powershell
param(
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot
)

$ErrorActionPreference = 'Stop'
$resolvedRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
$raw = & git -C $resolvedRoot worktree list --porcelain
if ($LASTEXITCODE -ne 0) { throw 'Unable to list Git worktrees' }

$entries = @()
$current = @{}
foreach ($line in $raw) {
    if ($line -eq '') {
        if ($current.path) { $entries += [pscustomobject]$current }
        $current = @{}
        continue
    }

    $parts = $line -split ' ', 2
    switch ($parts[0]) {
        'worktree' { $current.path = $parts[1] }
        'HEAD' { $current.head = $parts[1] }
        'branch' { $current.branch = $parts[1] -replace '^refs/heads/', '' }
        'detached' { $current.branch = 'DETACHED' }
        'locked' { $current.locked = $true }
        'prunable' { $current.prunable = $parts[1] }
    }
}
if ($current.path) { $entries += [pscustomobject]$current }

$mergedBranches = @(& git -C $resolvedRoot branch --merged main --format='%(refname:short)' | ForEach-Object { $_.Trim() })
$rows = foreach ($entry in $entries) {
    $exists = Test-Path -LiteralPath $entry.path
    $dirtyCount = -1
    $lastCommitDate = $null
    $isAncestor = $false
    $ahead = -1
    $behind = -1

    if ($exists) {
        $dirtyCount = @(& git -C $entry.path status --porcelain).Count
        $lastCommitDate = & git -C $entry.path log -1 --date=short --format='%ad'
        & git -C $resolvedRoot merge-base --is-ancestor $entry.head main
        $isAncestor = $LASTEXITCODE -eq 0
        $ahead = [int](& git -C $resolvedRoot rev-list --count "main..$($entry.head)")
        $behind = [int](& git -C $resolvedRoot rev-list --count "$($entry.head)..main")
    }

    [pscustomobject]@{
        path = $entry.path
        branch = $entry.branch
        head = $entry.head
        exists = $exists
        dirtyCount = $dirtyCount
        isMerged = $mergedBranches -contains $entry.branch
        isAncestorOfMain = $isAncestor
        ahead = $ahead
        behind = $behind
        lastCommitDate = $lastCommitDate
    }
}

$rows | ConvertTo-Json -Depth 4
```

- [ ] **Step 4: Run the smoke test**

```powershell
powershell -NoProfile -File scripts/tests/worktree-audit-smoke.ps1
```

Expected: `PASS: audited 18 worktrees` if the inventory has not changed; otherwise PASS with the current nonzero count.

- [ ] **Step 5: Commit the read-only auditor**

```powershell
git add scripts/worktree-audit.ps1 scripts/tests/worktree-audit-smoke.ps1
git commit -m "feat: add read-only worktree audit tool"
```

### Task 2: Generate and Classify the Inventory

**Files:**

- Create: `docs/worktree-audits/2026-07-13-inventory.json`
- Create: `docs/worktree-audits/2026-07-13-inventory.md`
- Create: `docs/worktree-audits/2026-07-13-cleanup-manifest.json`

**Interfaces:**

- Consumes: JSON schema from Task 1.
- Produces: auditable classification and approval manifest consumed by Task 4.

- [ ] **Step 1: Capture the current JSON snapshot**

```powershell
powershell -NoProfile -File scripts/worktree-audit.ps1 -RepoRoot C:\Project | Set-Content -Encoding utf8 docs/worktree-audits/2026-07-13-inventory.json
```

Expected: valid JSON containing the primary checkout and every registered worktree.

- [ ] **Step 2: Validate the snapshot**

```powershell
$rows = Get-Content docs/worktree-audits/2026-07-13-inventory.json -Raw | ConvertFrom-Json
@($rows).Count
```

Expected: current worktree count; baseline audit on 2026-07-13 found `18`.

- [ ] **Step 3: Write the Markdown classification**

`docs/worktree-audits/2026-07-13-inventory.md` must include:

```text
Summary counts: total, clean, dirty, detached, merged, unmerged.
REMOVE CANDIDATE: clean, commit ancestor of main, no unique work.
QUARANTINE: dirty, unmerged, or detached with unique history.
NEEDS USER DECISION: ambiguous ownership or generated files mixed with possible source/docs.
Evidence per row: path, branch, dirtyCount, merged, ancestor, ahead/behind, last commit.
Explicit statement: classification is not deletion authorization.
```

Recheck the baseline candidates `jovial-mclaren-3371ad`, `funny-khayyam-bf4bf9`, `project-debug-repair-b06abd`, `compassionate-williamson-5fba67`, and `gl-sync-upsert-consulting`; classify from fresh evidence rather than copying the old result blindly.

- [ ] **Step 4: Create the default-deny cleanup manifest**

Create `docs/worktree-audits/2026-07-13-cleanup-manifest.json` with the baseline candidates below. Before saving, remove any entry that no longer qualifies according to the fresh inventory; do not add a new candidate unless its evidence satisfies the same clean/ancestor checks:

```json
{
  "base": "main",
  "approvedByUser": false,
  "items": [
    {
      "path": "C:/Project/.claude/worktrees/jovial-mclaren-3371ad",
      "branch": "claude/github-project-recovery-11aed0",
      "head": "c0fbfee7cf41f0ce21ebd82dd3efda3f9fc92775",
      "reason": "clean and commit already contained in main",
      "approved": false
    },
    {
      "path": "C:/Project/apps/bul-monitor/.claude/worktrees/funny-khayyam-bf4bf9",
      "branch": "DETACHED",
      "head": "10678288945330634ba9a581b4a82c6fe61e7501",
      "reason": "clean and commit already contained in main",
      "approved": false
    },
    {
      "path": "C:/Project/apps/sj-monitor/.claude/worktrees/project-debug-repair-b06abd",
      "branch": "DETACHED",
      "head": "76f19f9860f8e32204697813036e85ac02aadc4c",
      "reason": "clean and commit already contained in main",
      "approved": false
    },
    {
      "path": "C:/Project/VPS/.claude/worktrees/compassionate-williamson-5fba67",
      "branch": "DETACHED",
      "head": "6f096859f73da16414dcfec4028555e3f0805030",
      "reason": "clean and commit already contained in main",
      "approved": false
    },
    {
      "path": "C:/Users/m3m31/.config/superpowers/worktrees/Project/gl-sync-upsert-consulting",
      "branch": "codex/gl-sync-upsert-consulting",
      "head": "ddcb7246f43c0cc22441ed39d73a1b64655a2fb8",
      "reason": "clean and commit already contained in main",
      "approved": false
    }
  ]
}
```

Do not include dirty, unmerged, or unique detached worktrees in `items`.

- [ ] **Step 5: Verify no Git state changed during audit**

```powershell
git -C C:\Project worktree list --porcelain
git -C C:\Project status --short
```

Expected: worktree registry and existing checkout changes are unchanged; only audit files/scripts are new on the execution branch.

- [ ] **Step 6: Commit the inventory**

```powershell
git add docs/worktree-audits/2026-07-13-inventory.json docs/worktree-audits/2026-07-13-inventory.md docs/worktree-audits/2026-07-13-cleanup-manifest.json
git commit -m "docs: inventory and classify legacy worktrees"
```

### Task 3: User Approval Gate

**Files:**

- Modify after explicit approval: `docs/worktree-audits/2026-07-13-cleanup-manifest.json`

**Interfaces:**

- Consumes: remove candidates and evidence from Task 2.
- Produces: explicit approved set; no cleanup command may consume entries with `approved: false`.

- [ ] **Step 1: Present the inventory and candidate list to the user**

Report each candidate with path, branch/detached state, head, dirty count, ancestor result, and intended action. Report every quarantined worktree separately and state that it will remain untouched.

- [ ] **Step 2: STOP and request explicit approval**

Do not run any removal, prune, branch deletion, switch, reset, stash, or filesystem cleanup command in the same turn as the request.

- [ ] **Step 3: Record only the user's approved items**

After a later explicit response, set top-level `approvedByUser` to `true` and set `approved: true` only for the paths named or accepted by the user. Leave all others `false`.

- [ ] **Step 4: Commit the approval record**

```powershell
git add docs/worktree-audits/2026-07-13-cleanup-manifest.json
git commit -m "docs: record approved worktree cleanup set"
```

### Task 4: Remove Only Approved Clean Worktrees

**Files:**

- Consume: `docs/worktree-audits/2026-07-13-cleanup-manifest.json`
- Create later: `docs/worktree-audits/2026-07-13-cleanup-result.md`

**Interfaces:**

- Consumes: manifest with `approvedByUser: true`.
- Produces: reduced Git worktree registry; quarantined worktrees unchanged.

- [ ] **Step 1: Verify the approval manifest is enabled**

```powershell
$manifest = Get-Content docs/worktree-audits/2026-07-13-cleanup-manifest.json -Raw | ConvertFrom-Json
if (-not $manifest.approvedByUser) { throw 'Cleanup has not been approved by the user' }
$approved = @($manifest.items | Where-Object { $_.approved })
if ($approved.Count -eq 0) { throw 'No approved worktrees in manifest' }
```

Expected: nonzero approved count.

- [ ] **Step 2: Revalidate every approved entry immediately before removal**

Run this dry revalidation and inspect every emitted object:

```powershell
$manifest = Get-Content docs/worktree-audits/2026-07-13-cleanup-manifest.json -Raw | ConvertFrom-Json
foreach ($item in @($manifest.items | Where-Object { $_.approved })) {
    $status = @(& git -C $item.path status --porcelain)
    $actualHead = & git -C $item.path rev-parse HEAD
    & git -C C:\Project merge-base --is-ancestor $item.head main
    [pscustomobject]@{
        path = $item.path
        clean = $status.Count -eq 0
        headMatches = $actualHead -eq $item.head
        ancestorOfMain = $LASTEXITCODE -eq 0
    }
}
```

Expected: status output empty, HEAD exactly matches manifest, and ancestor check exits `0`. If any assertion differs, skip that item and move it to quarantine; do not update the manifest to hide the mismatch.

- [ ] **Step 3: Remove each verified worktree through Git**

Revalidate inside the removal loop so state cannot change between checking and removal:

```powershell
$manifest = Get-Content docs/worktree-audits/2026-07-13-cleanup-manifest.json -Raw | ConvertFrom-Json
foreach ($item in @($manifest.items | Where-Object { $_.approved })) {
    $status = @(& git -C $item.path status --porcelain)
    $actualHead = & git -C $item.path rev-parse HEAD
    & git -C C:\Project merge-base --is-ancestor $item.head main
    $ancestor = $LASTEXITCODE -eq 0

    if ($status.Count -ne 0 -or $actualHead -ne $item.head -or -not $ancestor) {
        Write-Warning "Skipped unsafe candidate: $($item.path)"
        continue
    }

    & git -C C:\Project worktree remove $item.path
    if ($LASTEXITCODE -ne 0) { throw "Removal failed: $($item.path)" }
    & git -C C:\Project worktree list
}
```

Expected: removal exits `0`; the path no longer appears; all non-approved paths still appear. Never add `--force`.

- [ ] **Step 4: Delete only merged named branches with safe deletion**

For approved entries whose branch is not `DETACHED` and whose worktree path is no longer registered:

```powershell
$manifest = Get-Content docs/worktree-audits/2026-07-13-cleanup-manifest.json -Raw | ConvertFrom-Json
$registered = @(& git -C C:\Project worktree list --porcelain |
    Select-String '^worktree ' |
    ForEach-Object { $_.Line.Substring(9) })

foreach ($item in @($manifest.items | Where-Object { $_.approved -and $_.branch -ne 'DETACHED' })) {
    if ($registered -contains $item.path) {
        Write-Warning "Branch retained because worktree remains: $($item.branch)"
        continue
    }
    & git -C C:\Project branch -d $item.branch
    if ($LASTEXITCODE -ne 0) { Write-Warning "Safe branch deletion rejected: $($item.branch)" }
}
```

Expected: branch deletion succeeds. If Git rejects the deletion, retain the branch and record the rejection; never use `-D`.

- [ ] **Step 5: Prune stale metadata after normal removals**

```powershell
git -C C:\Project worktree prune --verbose
```

Expected: command exits `0`; no registered active/quarantined worktree is removed.

### Task 5: Verify and Document Cleanup Results

**Files:**

- Create: `docs/worktree-audits/2026-07-13-cleanup-result.md`

**Interfaces:**

- Consumes: before snapshot, approval manifest, and current Git state.
- Produces: final audit trail for removed, skipped, retained, and quarantined worktrees.

- [ ] **Step 1: Regenerate the after snapshot in memory**

```powershell
$after = powershell -NoProfile -File scripts/worktree-audit.ps1 -RepoRoot C:\Project | ConvertFrom-Json
@($after).Count
```

Expected: original count minus successful removals.

- [ ] **Step 2: Confirm quarantined paths remain registered**

Compare every `QUARANTINE` path in `2026-07-13-inventory.md` against `$after.path`. Any missing quarantined path is a blocking incident and must be reported immediately.

- [ ] **Step 3: Confirm checkout main was not cleaned or rewritten**

```powershell
git -C C:\Project status --short
git -C C:\Project log -1 --oneline
```

Expected: pre-existing dirty entries remain unless separately changed by their owner; no reset or cleanup commit occurred.

- [ ] **Step 4: Write the cleanup result**

Include:

```text
User approval reference.
Removed paths and branches.
Skipped paths with exact reason.
Branches retained because safe deletion failed.
Quarantined paths confirmed present.
Before/after worktree counts.
Confirmation: no force removal, no branch -D, no filesystem deletion, no deployment.
```

- [ ] **Step 5: Run documentation checks**

```powershell
powershell -NoProfile -File scripts/tests/worktree-audit-smoke.ps1
git diff --check -- docs/worktree-audits scripts/worktree-audit.ps1 scripts/tests/worktree-audit-smoke.ps1
```

Expected: smoke test PASS; diff check has no output.

- [ ] **Step 6: Commit the cleanup record**

```powershell
git add docs/worktree-audits/2026-07-13-cleanup-result.md
git commit -m "docs: record approved worktree cleanup results"
```

- [ ] **Step 7: Prepare final handoff**

Report removed count, retained count, quarantined count, branch cleanup results, current worktree list, and any follow-up decisions. Do not propose cleaning the dirty main checkout as an implicit continuation; that remains a separate user-authorized task.
