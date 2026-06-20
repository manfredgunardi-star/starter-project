# AI Agent Role (`ai_agent`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a create-only `ai_agent` role to the `firestore.rules` of bul-monitor and bul-accounting so one scoped client-SDK identity can create Surat Jalan + uang-jalan transaksi + Invoice (bul-monitor) and Jurnal (bul-accounting), while the database itself blocks every edit/delete.

**Architecture:** Pure `firestore.rules` change in two independent Firebase projects, driven by automated rules tests running against the local Firebase emulator (`@firebase/rules-unit-testing`). A self-contained test harness lives at `tests/firestore-rules/` so neither app's (test-less) package is touched. Provisioning of the actual agent account is a documented operational runbook. **Claude never deploys** — the user runs `firebase deploy --only firestore:rules`.

**Tech Stack:** Firebase Firestore Security Rules, Firebase Emulator Suite, `@firebase/rules-unit-testing` v3, Vitest, Node 24.

Spec: [docs/superpowers/specs/2026-06-20-ai-agent-role-design.md](../specs/2026-06-20-ai-agent-role-design.md)

---

## File Structure

**Created (test harness — isolated, repo root):**
- `tests/firestore-rules/package.json` — deps + `test` script wrapping `firebase emulators:exec`.
- `tests/firestore-rules/firebase.json` — emulator config (firestore port, multi-project).
- `tests/firestore-rules/firestore.rules` — deny-all placeholder the emulator boots with (per-test rules override it).
- `tests/firestore-rules/helpers.mjs` — `makeEnv()` loads a real app rules file into a test environment.
- `tests/firestore-rules/smoke.rules.test.mjs` — proves the harness wiring against *current* bul-monitor rules.
- `tests/firestore-rules/bul-monitor.rules.test.mjs` — `ai_agent` allow/deny matrix for bul-monitor.
- `tests/firestore-rules/bul-accounting.rules.test.mjs` — `ai_agent` allow/deny matrix for bul-accounting.

**Modified:**
- `apps/bul-monitor/firestore.rules` — add `isAiAgent()` helper + extend SJ / transaksi / invoice / history clauses.
- `apps/bul-accounting/firestore.rules` — add `isAiAgent()` helper + extend `journals` create clause.

**Created (runbook):**
- `docs/superpowers/ai-agent-provisioning.md` — how to create the agent account + assign the role in both projects, and the deploy commands.

---

## Task 1: Test harness scaffold + smoke test

Proves the emulator + `@firebase/rules-unit-testing` wiring works against the **current** bul-monitor rules (no rules changes yet).

**Files:**
- Create: `tests/firestore-rules/package.json`
- Create: `tests/firestore-rules/firebase.json`
- Create: `tests/firestore-rules/firestore.rules`
- Create: `tests/firestore-rules/helpers.mjs`
- Create: `tests/firestore-rules/smoke.rules.test.mjs`

- [ ] **Step 1: Create `tests/firestore-rules/package.json`**

```json
{
  "name": "firestore-rules-tests",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "firebase emulators:exec --only firestore --project demo-bul-rules \"vitest run\""
  },
  "devDependencies": {
    "@firebase/rules-unit-testing": "^3.0.4",
    "firebase": "^10.14.1",
    "vitest": "^2.1.9"
  }
}
```

- [ ] **Step 2: Create `tests/firestore-rules/firebase.json`**

```json
{
  "firestore": {
    "rules": "firestore.rules"
  },
  "emulators": {
    "firestore": { "port": 8080 },
    "singleProjectMode": false,
    "ui": { "enabled": false }
  }
}
```

- [ ] **Step 3: Create `tests/firestore-rules/firestore.rules` (deny-all placeholder)**

The emulator needs a rules file to boot; every test overrides it per project via `initializeTestEnvironment`.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} { allow read, write: if false; }
  }
}
```

- [ ] **Step 4: Create `tests/firestore-rules/helpers.mjs`**

```js
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function rulesPath(rel) {
  return resolve(__dirname, rel);
}

// Boot a test environment for one app's real rules file.
export async function makeEnv(projectId, rulesRelPath) {
  return initializeTestEnvironment({
    projectId,
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: readFileSync(rulesPath(rulesRelPath), 'utf8'),
    },
  });
}
```

- [ ] **Step 5: Create `tests/firestore-rules/smoke.rules.test.mjs`**

These assertions hold against the **current** (unmodified) bul-monitor rules: a `reader` cannot create a Surat Jalan, a `superadmin` can.

```js
import { beforeAll, afterAll, beforeEach, describe, test } from 'vitest';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { makeEnv } from './helpers.mjs';

let testEnv;

const validSJ = {
  id: 'SJ-1', nomorSJ: '001', tanggalSJ: '2026-06-20', status: 'pending',
  isActive: true, createdAt: '2026-06-20T00:00:00.000Z', createdBy: 'tester',
};

beforeAll(async () => {
  testEnv = await makeEnv('demo-bul-monitor', '../../apps/bul-monitor/firestore.rules');
});
afterAll(async () => { await testEnv.cleanup(); });

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'bul_users/super'), { role: 'superadmin' });
    await setDoc(doc(db, 'bul_users/reader'), { role: 'reader' });
  });
});

describe('harness smoke (current rules)', () => {
  test('reader CANNOT create Surat Jalan', async () => {
    const db = testEnv.authenticatedContext('reader').firestore();
    await assertFails(setDoc(doc(db, 'bul_surat_jalan/SJ-1'), validSJ));
  });

  test('superadmin CAN create Surat Jalan', async () => {
    const db = testEnv.authenticatedContext('super').firestore();
    await assertSucceeds(setDoc(doc(db, 'bul_surat_jalan/SJ-1'), validSJ));
  });
});
```

- [ ] **Step 6: Install dependencies**

Run: `cd tests/firestore-rules && npm install`
Expected: installs `@firebase/rules-unit-testing`, `firebase`, `vitest` with no errors.

- [ ] **Step 7: Run the smoke test**

Run: `cd tests/firestore-rules && npm test`
Expected: Firebase emulator boots, Vitest runs, **2 passed**. (First run may download the Firestore emulator jar.)

- [ ] **Step 8: Commit**

```bash
git add tests/firestore-rules
git commit -m "test: add firestore rules emulator harness + smoke test"
```

---

## Task 2: `ai_agent` role in bul-monitor

**Files:**
- Test: `tests/firestore-rules/bul-monitor.rules.test.mjs` (create)
- Modify: `apps/bul-monitor/firestore.rules`

- [ ] **Step 1: Write the failing test — `tests/firestore-rules/bul-monitor.rules.test.mjs`**

```js
import { beforeAll, afterAll, beforeEach, describe, test } from 'vitest';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { makeEnv } from './helpers.mjs';

let testEnv;

const validSJ = {
  id: 'SJ-1', nomorSJ: '001', tanggalSJ: '2026-06-20', status: 'pending',
  isActive: true, createdAt: '2026-06-20T00:00:00.000Z', createdBy: 'agent',
};

const validUJ = {
  id: 'TX-UJ-SJ-1', tipe: 'pengeluaran', nominal: 100000, pt: 'PT A',
  tanggal: '2026-06-20', keterangan: 'Uang Jalan - 001',
  createdAt: '2026-06-20T00:00:00.000Z', createdBy: 'agent',
  isActive: true, suratJalanId: 'SJ-1',
};

beforeAll(async () => {
  testEnv = await makeEnv('demo-bul-monitor', '../../apps/bul-monitor/firestore.rules');
});
afterAll(async () => { await testEnv.cleanup(); });

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'bul_users/agent'), { role: 'ai_agent' });
  });
});

function agentDb() {
  return testEnv.authenticatedContext('agent').firestore();
}

async function seedSJ() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'bul_surat_jalan/SJ-1'), validSJ);
  });
}

describe('bul-monitor ai_agent — ALLOWED', () => {
  test('create Surat Jalan', async () => {
    await assertSucceeds(setDoc(doc(agentDb(), 'bul_surat_jalan/SJ-1'), validSJ));
  });

  test('create valid uang-jalan transaksi', async () => {
    await assertSucceeds(setDoc(doc(agentDb(), 'bul_transaksi/TX-UJ-SJ-1'), validUJ));
  });

  test('create then update Invoice', async () => {
    await assertSucceeds(setDoc(doc(agentDb(), 'bul_invoice/INV-1'), { id: 'INV-1', total: 1000 }));
    await assertSucceeds(updateDoc(doc(agentDb(), 'bul_invoice/INV-1'), { total: 2000 }));
  });

  test('mark SJ invoiced (sjInvoiceFieldsOnly)', async () => {
    await seedSJ();
    await assertSucceeds(updateDoc(doc(agentDb(), 'bul_surat_jalan/SJ-1'), {
      statusInvoice: 'sudah', invoiceId: 'INV-1', invoiceNo: '001',
      updatedAt: 'x', updatedBy: 'agent', invoiceTanggal: '2026-06-20',
    }));
  });

  test('create history log', async () => {
    await assertSucceeds(setDoc(doc(agentDb(), 'bul_history_log/H1'), { id: 'H1', action: 'create' }));
  });

  test('soft-delete uang-jalan transaksi (isActive only)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'bul_transaksi/TX-UJ-SJ-1'), validUJ);
    });
    await assertSucceeds(updateDoc(doc(agentDb(), 'bul_transaksi/TX-UJ-SJ-1'), {
      isActive: false, updatedAt: 'x', updatedBy: 'agent',
    }));
  });
});

describe('bul-monitor ai_agent — DENIED', () => {
  test('cannot create transaksi with wrong tipe', async () => {
    await assertFails(setDoc(doc(agentDb(), 'bul_transaksi/TX-2'), { ...validUJ, id: 'TX-2', tipe: 'pemasukan' }));
  });

  test('cannot update SJ non-invoice fields', async () => {
    await seedSJ();
    await assertFails(updateDoc(doc(agentDb(), 'bul_surat_jalan/SJ-1'), { status: 'terkirim' }));
  });

  test('cannot delete SJ', async () => {
    await seedSJ();
    await assertFails(deleteDoc(doc(agentDb(), 'bul_surat_jalan/SJ-1')));
  });

  test('cannot delete Invoice', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'bul_invoice/INV-1'), { id: 'INV-1' });
    });
    await assertFails(deleteDoc(doc(agentDb(), 'bul_invoice/INV-1')));
  });

  test('cannot write master data (trucks)', async () => {
    await assertFails(setDoc(doc(agentDb(), 'bul_trucks/T1'), { id: 'T1', nomorPolisi: 'B1' }));
  });

  test('cannot write settings', async () => {
    await assertFails(setDoc(doc(agentDb(), 'bul_settings/app'), { foo: 'bar' }));
  });

  test('cannot write another user role doc', async () => {
    await assertFails(setDoc(doc(agentDb(), 'bul_users/victim'), { role: 'superadmin' }));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd tests/firestore-rules && npx vitest run bul-monitor.rules.test.mjs` (start the emulator first, or just run `npm test` which wraps it).
Full command: `cd tests/firestore-rules && npm test`
Expected: the ALLOWED tests **FAIL** (current rules don't know `ai_agent`, so creates are denied), DENIED tests pass. Net: failures present.

- [ ] **Step 3: Add the `isAiAgent()` helper to `apps/bul-monitor/firestore.rules`**

Insert after the `isAdminKeu()` line (currently line 28):

```
    function isAiAgent() { return signedIn() && myRole() == 'ai_agent'; }
```

- [ ] **Step 4: Extend the Surat Jalan clauses**

In `match /bul_surat_jalan/{id}`, change `create` and `update`:

```
      allow create: if isSuperAdmin() || isAdminSJ() || isAiAgent();
      allow update: if isSuperAdmin() || isAdminSJ() || ((isAdminInv() || isAiAgent()) && sjInvoiceFieldsOnly());
```

Apply the **same two changes** in the backward-compat block `match /bul_suratJalan/{id}`.

- [ ] **Step 5: Extend the Invoice clauses**

In both `match /bul_invoice/{id}` and `match /bul_invoices/{id}`, change:

```
      allow create, update: if isSuperAdmin() || isAdminInv() || isAiAgent();
```

- [ ] **Step 6: Extend the constrained transaksi clauses**

In `match /bul_transaksi/{id}`, change the Admin-SJ `create` guard and the Admin-SJ `update` guard so `ai_agent` shares them (keep every field-shape condition unchanged):

```
      allow create: if (isAdminSJ() || isAiAgent())
        && request.resource.data.keys().hasAll(['id','tipe','nominal','pt','tanggal','keterangan','createdAt','createdBy','isActive','suratJalanId'])
        && request.resource.data.tipe == 'pengeluaran'
        && request.resource.data.isActive == true
        && request.resource.data.nominal is int
        && request.resource.data.nominal >= 0
        && request.resource.data.suratJalanId is string;

      allow update: if (isAdminSJ() || isAiAgent())
        && resource.data.suratJalanId is string
        && request.resource.data.diff(resource.data).changedKeys().hasOnly(['isActive','updatedAt','updatedBy']);
```

- [ ] **Step 7: Extend the history-log create clause**

In `match /bul_history_log/{id}`, add `'ai_agent'` to the `create` role list:

```
      allow create: if signedIn() && inRoles(['superadmin','admin_sj','admin_invoice','admin_keuangan','ai_agent']);
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `cd tests/firestore-rules && npm test`
Expected: **all bul-monitor tests pass** (ALLOWED + DENIED), smoke tests still pass.

- [ ] **Step 9: Commit**

```bash
git add tests/firestore-rules/bul-monitor.rules.test.mjs apps/bul-monitor/firestore.rules
git commit -m "feat(bul-monitor): add create-only ai_agent role to firestore.rules"
```

---

## Task 3: `ai_agent` role in bul-accounting

**Files:**
- Test: `tests/firestore-rules/bul-accounting.rules.test.mjs` (create)
- Modify: `apps/bul-accounting/firestore.rules`

- [ ] **Step 1: Write the failing test — `tests/firestore-rules/bul-accounting.rules.test.mjs`**

```js
import { beforeAll, afterAll, beforeEach, describe, test } from 'vitest';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { makeEnv } from './helpers.mjs';

let testEnv;

beforeAll(async () => {
  testEnv = await makeEnv('demo-bul-accounting', '../../apps/bul-accounting/firestore.rules');
});
afterAll(async () => { await testEnv.cleanup(); });

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users/agent'), { role: 'ai_agent' });
  });
});

function agentDb() {
  return testEnv.authenticatedContext('agent').firestore();
}

async function seedJournal() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'journals/J1'), { id: 'J1', desc: 'seed' });
  });
}

describe('bul-accounting ai_agent — ALLOWED', () => {
  test('create journal', async () => {
    await assertSucceeds(setDoc(doc(agentDb(), 'journals/J1'), { id: 'J1', desc: 'test' }));
  });

  test('create audit log', async () => {
    await assertSucceeds(setDoc(doc(agentDb(), 'audit_log/L1'), { id: 'L1' }));
  });
});

describe('bul-accounting ai_agent — DENIED', () => {
  test('cannot update journal', async () => {
    await seedJournal();
    await assertFails(updateDoc(doc(agentDb(), 'journals/J1'), { desc: 'x' }));
  });

  test('cannot delete journal', async () => {
    await seedJournal();
    await assertFails(deleteDoc(doc(agentDb(), 'journals/J1')));
  });

  test('cannot create invoice', async () => {
    await assertFails(setDoc(doc(agentDb(), 'invoices/I1'), { id: 'I1' }));
  });

  test('cannot create asset', async () => {
    await assertFails(setDoc(doc(agentDb(), 'assets/A1'), { id: 'A1' }));
  });

  test('cannot create coa account', async () => {
    await assertFails(setDoc(doc(agentDb(), 'coa/C1'), { id: 'C1' }));
  });

  test('cannot write another user role doc', async () => {
    await assertFails(setDoc(doc(agentDb(), 'users/victim'), { role: 'superadmin' }));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd tests/firestore-rules && npm test`
Expected: `create journal` **FAILS** (current rules only allow `admin`/`superadmin` to create journals), DENIED tests pass. Net: failure present.

- [ ] **Step 3: Add the `isAiAgent()` helper to `apps/bul-accounting/firestore.rules`**

Insert after the `isAdminOrAbove()` function (currently ends line 21):

```
    function isAiAgent() {
      return isAuth() && getUserRole() == 'ai_agent';
    }
```

- [ ] **Step 4: Extend the journals create clause**

In `match /journals/{journalId}`, change `create` only (leave `update, delete` superadmin-only):

```
      allow create: if isAdminOrAbove() || isAiAgent();
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd tests/firestore-rules && npm test`
Expected: **all tests pass** across all three test files (smoke + bul-monitor + bul-accounting).

- [ ] **Step 6: Commit**

```bash
git add tests/firestore-rules/bul-accounting.rules.test.mjs apps/bul-accounting/firestore.rules
git commit -m "feat(bul-accounting): add create-only ai_agent role for journals"
```

---

## Task 4: Provisioning runbook

Operational documentation for creating the agent account and assigning the role. No automated test (it's a manual/console procedure executed by the owner).

**Files:**
- Create: `docs/superpowers/ai-agent-provisioning.md`

- [ ] **Step 1: Write `docs/superpowers/ai-agent-provisioning.md`**

````markdown
# AI Agent Account — Provisioning Runbook

One logical identity, e.g. `ai-agent@bul.internal`, scoped with the `ai_agent`
role in **both** Firebase projects. The agent authenticates as a normal
client-SDK user (email + password) — never the Admin SDK.

## 1. Create the Auth user (each project)

For **bul-monitor** and **bul-accounting** separately, in the respective
Firebase Console → Authentication → Users → Add user:

- Email: `ai-agent@bul.internal`
- Password: generate a strong password; store it in your secret manager.

Record the generated **UID** for each project (they differ).

## 2. Assign the `ai_agent` role (user doc)

The role lives in a Firestore user doc. The human UI has no `ai_agent` option,
so create the doc directly in the Firebase Console → Firestore:

- **bul-monitor**: collection `bul_users`, document id = the bul-monitor UID,
  field `role` (string) = `ai_agent`.
- **bul-accounting**: collection `users`, document id = the bul-accounting UID,
  field `role` (string) = `ai_agent`.

## 3. Deploy the rules (owner action — Claude does NOT deploy)

From each app directory, after reviewing the diff:

```bash
cd apps/bul-monitor && firebase deploy --only firestore:rules
cd apps/bul-accounting && firebase deploy --only firestore:rules
```

## 4. Agent runtime auth

The agent process signs in with the client SDK at session start:

```js
import { signInWithEmailAndPassword } from 'firebase/auth';
await signInWithEmailAndPassword(auth, process.env.AI_AGENT_EMAIL, process.env.AI_AGENT_PASSWORD);
```

The resulting ID token lasts ~1 hour and is auto-refreshed by the SDK. Keep the
credentials in a secret manager, never in the repo. Even if leaked, the role can
only *create* SJ / transaksi-uang-jalan / invoice / jurnal — never edit or delete.

## What the agent can and cannot do

| Can (create-only) | Cannot |
|---|---|
| bul-monitor: Surat Jalan, uang-jalan transaksi (field-shape locked), Invoice (create+update), mark SJ invoiced, history log | delete anything; edit SJ except invoice fields; master data; settings; user docs |
| bul-accounting: Jurnal, audit log | edit/delete journals; invoices; assets; COA; customers; suppliers |
````

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/ai-agent-provisioning.md
git commit -m "docs: add ai_agent account provisioning runbook"
```

---

## Task 5: Full-suite verification

- [ ] **Step 1: Run the complete rules suite**

Run: `cd tests/firestore-rules && npm test`
Expected: all three test files pass — smoke (2), bul-monitor (ALLOWED + DENIED), bul-accounting (ALLOWED + DENIED). Zero failures.

- [ ] **Step 2: Confirm no app build was broken**

Rules changes don't touch app code, but confirm the rules files are syntactically valid by re-running the suite (the emulator rejects malformed rules at `initializeTestEnvironment`). If either rules file were invalid, every test in that file would error at `beforeAll`.

- [ ] **Step 3: Final status note**

Report to the user:
- Branch + commits created.
- That deployment (`firebase deploy --only firestore:rules` per app) and Auth-user/role-doc creation are **their** manual steps per the runbook.
- The agent's own orchestration logic (what it decides to write) is out of scope here — this delivered only the permission boundary.

---

## Self-Review

**1. Spec coverage:**
- Identitas & provisioning → Task 4 runbook. ✓
- `ai_agent` bul-monitor (SJ, transaksi uang-jalan, invoice, sjInvoiceFieldsOnly, history) → Task 2. ✓
- `ai_agent` bul-accounting (journals, audit_log) → Task 3. ✓
- "TEGAS dilarang" (delete/edit/master/settings/user) → DENIED test blocks in Tasks 2 & 3. ✓
- Client-SDK auth → documented in Task 4 runbook. ✓
- Audit & pengujian (emulator rules tests) → Tasks 1-3, 5. ✓
- Claude does not deploy → Task 4 §3 + Task 5 §3. ✓
- Out-of-scope (draft flow, bridge queue, UI dropdown, agent orchestration) → not implemented, noted in Task 5. ✓

**2. Placeholder scan:** No TBD/TODO; every code + rules step shows full content. The deny-all `firestore.rules` placeholder in Task 1 is intentional (emulator boot file), not a gap.

**3. Type / name consistency:** `makeEnv(projectId, rulesRelPath)` defined in Task 1 Step 4, called identically in Tasks 1-3. Collection names (`bul_users`, `bul_surat_jalan`, `bul_transaksi`, `bul_invoice`, `bul_history_log`, `users`, `journals`, `audit_log`) match the real rules files. Helper names `isAiAgent()` consistent across both rules files. Uang-jalan field list in the test (`validUJ`) matches the `hasAll([...])` list in Task 2 Step 6.
