# Security & Hygiene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove leaked credentials, clean up the repo, and delete dead code.

**Architecture:** All changes are in `C:/project/sj-monitor`. No new dependencies. Pure file edits and git operations.

**Tech Stack:** Git, plain text files.

---

## Task 1: Add `env.txt` to .gitignore and remove it from git tracking

**Files:**
- Modify: `sj-monitor/.gitignore`
- Also modify: root `C:/project/.gitignore`

The file `env.txt` in the repo root of `C:/project` contains live Firebase credentials and was pushed to GitHub. We must stop tracking it immediately, then the user must rotate the keys in Firebase Console.

- [ ] **Step 1: Add `env.txt` to sj-monitor's .gitignore**

Open `C:/project/sj-monitor/.gitignore`. It already contains `.env`. Add after that line:

```
# dotenv environment variables file
.env
env.txt
build.log
```

The file currently ends at line 70. The `.env` entry is already on line 66. Add `env.txt` and `build.log` on separate lines directly below it.

- [ ] **Step 2: Add `env.txt` to the root project .gitignore**

Open `C:/project/.gitignore`. It already has:
```
node_modules/
dist/
*.zip
.env
.env.*
```

Add two lines:
```
env.txt
build.log
```

- [ ] **Step 3: Remove env.txt from git tracking (do NOT delete the file)**

```bash
cd "C:/project"
git rm --cached env.txt
```

Expected output:
```
rm 'env.txt'
```

- [ ] **Step 4: Commit the .gitignore update and untrack**

```bash
cd "C:/project"
git add .gitignore sj-monitor/.gitignore
git commit -m "security: stop tracking env.txt containing Firebase credentials"
```

- [ ] **Step 5: MANUAL ACTION REQUIRED — Rotate Firebase API keys**

The Firebase API key in `env.txt` has been public since the push. The user must:

1. Go to [Firebase Console](https://console.firebase.google.com) → Project `bul-monitor`
2. Project Settings → General → Web API Key
3. Click the three-dot menu next to the API key → "Regenerate key"
4. Copy the new key
5. Update `C:/project/sj-monitor/src/config/firebase-config.js` — the file reads from env vars, so actually update the `.env` file (not `env.txt`) with the new value:
   - `VITE_FIREBASE_API_KEY=<new-value>`
6. Rebuild and redeploy: `npm run build && firebase deploy --only hosting`

> Note: The other values in `env.txt` (authDomain, projectId, etc.) are not secrets — they are safe to leave as-is. Only the `apiKey` needs rotation.

---

## Task 2: Remove `console.log` from firebase-config.js

**Files:**
- Modify: `src/config/firebase-config.js:17`

- [ ] **Step 1: Remove the debug log line**

In `src/config/firebase-config.js`, find and delete line 17:

```js
// DELETE this line:
console.log("🔥 firebaseConfig projectId:", firebaseConfig.projectId);
```

The file should go from:
```js
const app = initializeApp(firebaseConfig);

console.log("🔥 firebaseConfig projectId:", firebaseConfig.projectId);

// Initialize Auth
```
To:
```js
const app = initializeApp(firebaseConfig);

// Initialize Auth
```

- [ ] **Step 2: Verify the app still builds**

```bash
cd "C:/project/sj-monitor"
npm run build
```

Expected: Build completes with no errors. The `dist/` folder is updated.

- [ ] **Step 3: Commit**

```bash
cd "C:/project/sj-monitor"
git add src/config/firebase-config.js
git commit -m "fix: remove console.log leaking projectId on every page load"
```

---

## Task 3: Delete `App_Original.jsx`

**Files:**
- Delete: `src/App_Original.jsx`

This 5,109-line file is a legacy backup. It is never imported anywhere; its only purpose is to confuse. Git history preserves the content if you ever need it back.

- [ ] **Step 1: Verify it is not imported anywhere**

```bash
cd "C:/project/sj-monitor"
grep -r "App_Original" src/
```

Expected output: nothing (empty). If something imports it, do not delete it — investigate first.

- [ ] **Step 2: Delete the file**

```bash
cd "C:/project/sj-monitor"
git rm src/App_Original.jsx
```

Expected:
```
rm 'src/App_Original.jsx'
```

- [ ] **Step 3: Commit**

```bash
cd "C:/project/sj-monitor"
git commit -m "chore: delete App_Original.jsx legacy backup (preserved in git history)"
```

---

## Task 4: Clean root-level clutter

**Files:**
- Modify: `C:/project/.gitignore`
- The `rules terupdate.txt` file in project root is loose notes — move or ignore it

- [ ] **Step 1: Add loose files to root .gitignore**

Open `C:/project/.gitignore` and ensure these are present (add any missing):

```gitignore
node_modules/
dist/
*.zip
.env
.env.*
env.txt
build.log
*.txt
```

Wait — `*.txt` would hide `rules terupdate.txt` but might be too broad. Use a specific entry instead:

```gitignore
node_modules/
dist/
*.zip
.env
.env.*
env.txt
build.log
"rules terupdate.txt"
```

Actually Git doesn't support quoted paths in .gitignore with spaces — use a backslash or just the exact name:

```
rules terupdate.txt
```

- [ ] **Step 2: Remove from git tracking**

```bash
cd "C:/project"
git rm --cached "rules terupdate.txt" 2>/dev/null || echo "not tracked"
git rm --cached "package-lock.json" 2>/dev/null || echo "not tracked"
```

The root `package-lock.json` is also suspicious (there's no root `package.json` defining a project) — check if it belongs to something before removing.

```bash
cd "C:/project"
cat package-lock.json | head -5
```

If it says `"name": "root"` or similar and has no matching `package.json`, remove it:

```bash
git rm --cached package-lock.json
```

- [ ] **Step 3: Commit cleanup**

```bash
cd "C:/project"
git add .gitignore
git commit -m "chore: gitignore loose files at project root"
```

---

## Verification Checklist

After all tasks:

- [ ] `git status` in `C:/project` shows no tracked `env.txt`
- [ ] `git log --oneline -5` shows 3-4 new commits
- [ ] `npm run dev` in `C:/project/sj-monitor` starts the app without errors
- [ ] Browser console shows NO `🔥 firebaseConfig projectId:` log line
- [ ] `ls src/` in `sj-monitor` shows no `App_Original.jsx`
- [ ] User has rotated the Firebase API key (manual step)
