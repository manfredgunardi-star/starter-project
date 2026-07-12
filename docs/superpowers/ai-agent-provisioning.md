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
