---
name: pr
description: Create a pull request safely. Enforces the correct order — branch → push → PR → review → merge — preventing the premature-merge mistake that makes PR creation impossible (no diff).
---

# PR Workflow

CRITICAL RULE: Never merge to main before creating the PR. Merging first eliminates the diff and makes `gh pr create` fail with "already up to date."

## Step 1: Verify You Are on a Feature Branch

```bash
git branch --show-current
```

If output is `main` or `master`: **STOP**. You cannot create a PR from main.
Action: create a feature branch with `git checkout -b feat/<name>`, then re-run from Step 1.

## Step 2: Check That Unique Commits Exist

```bash
git log main..HEAD --oneline
```

If output is **empty**: no unique commits exist on this branch (already merged, or no changes made). **STOP** and notify user — PR creation will fail.

## Step 3: Push Branch to GitHub

```bash
git push -u origin $(git branch --show-current)
```

Confirm push succeeded (exit code 0, shows remote URL).

## Step 4: Create Pull Request

```bash
gh pr create --fill
```

Show the PR URL to the user.

## Step 5: Wait for Approval — DO NOT MERGE YET

**STOP here.** Do not run `gh pr merge`, `git merge`, or any equivalent.

Wait for the user to explicitly say one of: "merge", "approve", "lgtm", "gabung", "ok merge".

## Step 6: Merge (only after user approval)

```bash
gh pr merge --merge
```

After merge, confirm with:

```bash
git log --oneline -3
```
