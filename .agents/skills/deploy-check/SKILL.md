---
name: deploy-check
description: Pre-deploy verification checklist. Run before ANY Firebase or Vercel deployment to catch the recurring failures — unpushed branch, missing env vars, wrong Firebase plan, partial deploy scope.
---

# Deploy Check

Run ALL steps before executing any deploy command.

## Step 1: Git State

```bash
git status
git log origin/$(git branch --show-current)..HEAD --oneline
```

Expected: working tree clean, empty log output (no unpushed commits).
If log shows commits: run `git push` first, then re-run this check.

## Step 2: Build Verification

```bash
cd <project-dir> && npm run build
```

Must complete with **exit code 0** and no errors. Fix all errors before continuing.

## Step 3: Environment Variables

**For Firebase/Vite apps** — verify `.env` exists and has all keys:

```bash
diff <(grep -o '^VITE_[A-Z_]*' .env.example | sort) <(grep -o '^VITE_[A-Z_]*' .env | sort)
```

Expected: no diff output. Any missing `VITE_` key = the app will break in production (Vite embeds at build time).

**For Vercel apps:**

```bash
vercel env ls
```

Compare every key in `.env.example` against the Vercel list. Missing keys = deploy will fail silently.

## Step 4: Firebase Plan Check (only if deploying Cloud Functions)

```bash
firebase projects:list
```

Confirm the active project is on **Blaze (pay-as-you-go)** plan. Spark plan blocks Cloud Functions.
If on Spark: notify user and stop — do NOT attempt functions deploy.

## Step 5: Deploy Scope

For Firebase, **always deploy hosting AND rules together**:

```bash
firebase deploy --only hosting,firestore:rules
```

Never `--only firestore:rules` alone (leaves app on stale build).
Never `--only hosting` alone (leaves rules out of sync with app).

## Step 6: Confirm with User

Before executing the deploy command, show the user:
- Target URL
- What's being deployed (hosting / rules / functions)
- Build output size
- Which env vars are set

Then say:

> "Semua pre-deploy checks passed. Siap deploy ke [URL]? Konfirmasi: ya/tidak"

Only proceed after explicit user confirmation.
