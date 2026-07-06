# AI Agent — Operations Guide

Operational spec for the scoped **`ai_agent`** identity that creates Surat Jalan +
Invoice (bul-monitor) and Jurnal (bul-accounting). Pair this with
`ai-agent-system-prompt.md` (the system prompt) and
`docs/superpowers/ai-agent-provisioning.md` (account + rules deployment).

## Operating model: "live but locked"

- The agent creates **live** records. They take effect immediately.
- The agent **cannot edit or delete** anything it creates — the Firestore rules
  enforce this at the database level. Only a **superadmin** (you) can correct or
  remove a record.
- Your role is **correction-after**, not approval-before. Review what the agent
  created and fix/delete via your superadmin account when needed.

## Pre-flight (must be true before the agent runs)

1. Rules deployed in **both** projects (`firebase deploy --only firestore:rules`).
2. Auth user `ai-agent@bul.internal` exists in both projects, each with a user
   doc whose `role` = `ai_agent` (`bul_users/{uid}` in bul-monitor, `users/{uid}`
   in bul-accounting). See the provisioning runbook.
3. Credentials available to the agent process as env vars (never in code):
   - bul-monitor: `BULMON_AI_AGENT_EMAIL`, `BULMON_AI_AGENT_PASSWORD`, plus that project's Firebase web config.
   - bul-accounting: `BULACC_AI_AGENT_EMAIL`, `BULACC_AI_AGENT_PASSWORD`, plus that project's Firebase web config.

## Auth (client SDK only — never Admin SDK)

```js
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const app = initializeApp(firebaseConfig);          // per project
const auth = getAuth(app);
const db = getFirestore(app);
await signInWithEmailAndPassword(auth, EMAIL, PASSWORD); // ID token ~1h, auto-refresh
```

Using the Admin SDK would bypass the rules and void the entire security model —
do not use it.

## Write contracts

The agent writes documents with **deterministic IDs** (idempotent retries). Field
shapes below match what the apps produce; deviating will be rejected by the rules
(transaksi) or break the apps' listeners (invoice/SJ).

### 1. Surat Jalan — `bul_surat_jalan` (bul-monitor)

Doc id: `SJ-<epoch_ms>`. All `*Id` and denormalized label fields come from existing
master data (look them up; never invent IDs).

```json
{
  "id": "SJ-1718888888888",
  "nomorSJ": "001/VI/2026",
  "tanggalSJ": "2026-06-20",
  "truckId": "<from bul_trucks>",
  "nomorPolisi": "<truck.nomorPolisi>",
  "supirId": "<from bul_supir>",
  "namaSupir": "<supir.namaSupir>",
  "pt": "<supir.pt>",
  "ruteId": "<from bul_rute>",
  "rute": "<rute.rute>",
  "uangJalan": 100000,
  "materialId": "<from bul_material>",
  "material": "<material.material>",
  "satuan": "<material.satuan>",
  "qtyIsi": 10,
  "tglTerkirim": null,
  "qtyBongkar": null,
  "status": "pending",
  "createdAt": "2026-06-20T00:00:00.000Z",
  "createdBy": "ai_agent",
  "isActive": true
}
```

### 2. Uang Jalan transaksi — `bul_transaksi` (bul-monitor) — only if `rute.uangJalan > 0`

Doc id: `TX-UJ-<sjId>`. **The rules enforce this exact shape** — all keys
required, `tipe` must be `pengeluaran`, `nominal` an integer ≥ 0, `isActive` true,
`suratJalanId` a string. Create this right after the SJ so the SJ is consistent.

```json
{
  "id": "TX-UJ-SJ-1718888888888",
  "tipe": "pengeluaran",
  "nominal": 100000,
  "pt": "<sj.pt>",
  "tanggal": "2026-06-20",
  "keterangan": "Uang Jalan - 001/VI/2026 (<rute.rute>)",
  "createdAt": "2026-06-20T00:00:00.000Z",
  "createdBy": "ai_agent",
  "isActive": true,
  "suratJalanId": "SJ-1718888888888"
}
```

The only later change the agent may make to this doc is a **soft-delete**:
`update` changing **only** `isActive`, `updatedAt`, `updatedBy`. It may never
change `nominal` or any other field.

### 3. Invoice — `bul_invoices` (bul-monitor, canonical/plural)

Doc id: `INV-<epoch_ms>`. After creating the invoice, mark each included SJ as
invoiced by updating **only** these keys on the SJ doc: `statusInvoice`,
`invoiceId`, `invoiceNo`, `invoiceTanggal`, `updatedAt`, `updatedBy` (the rules
reject any other changed key from the agent).

```json
{
  "id": "INV-1718999999999",
  "noInvoice": "INV/2026/06/001",
  "tglInvoice": "2026-06-20",
  "suratJalanIds": ["SJ-1718888888888"],
  "suratJalanList": [ /* full SJ objects included */ ],
  "totalQty": 10,
  "hargaSatuan": 50000,
  "hargaPerGroup": null,
  "totalNilai": 500000,
  "pelangganId": "<from bul_pelanggan>",
  "pelangganData": { "name": "...", "address": "...", "npwp": "..." },
  "createdAt": "2026-06-20T00:00:00.000Z",
  "createdBy": "ai_agent",
  "isActive": true
}
```

`totalNilai` is `totalQty * hargaSatuan`, or the sum over `hargaPerGroup`
(`qtyBongkar * hargaSatuan` per `material|rute`) when group pricing is used.
**This is invoice pricing logic — get it exactly right, or flag for human review.**

### 4. Jurnal — `journals` (bul-accounting)

Doc id: auto-generated (use `addDoc`). **Double-entry must balance**: total `debit`
== total `credit`. Each line needs a valid `accountCode` (from COA) and a non-empty
`keterangan`. App convention stamps `status: 'posted'`, `totalDebit`, `totalCredit`,
`createdAt`.

```json
{
  "date": "2026-06-20",
  "description": "optional summary",
  "truckId": null,
  "type": "<journal type>",
  "lines": [
    { "accountCode": "1101", "debit": 500000, "credit": 0, "keterangan": "Kas masuk", "truckId": null },
    { "accountCode": "4101", "debit": 0, "credit": 500000, "keterangan": "Pendapatan", "truckId": null }
  ],
  "totalDebit": 500000,
  "totalCredit": 500000,
  "createdAt": "2026-06-20T00:00:00.000Z",
  "createdBy": "ai_agent",
  "status": "posted"
}
```

## Hard rules for the agent

1. **Create-only.** Never attempt edit/delete of journals, SJ (except the invoice
   fields above), or any other record. The one allowed mutation is the transaksi
   soft-delete (isActive only).
2. **Balanced journals.** Refuse to write a journal unless `totalDebit == totalCredit`
   and every line has `accountCode` + `keterangan` + a non-zero debit or credit.
3. **No invented master data.** Look up real `truckId/supirId/ruteId/materialId/
   pelangganId/accountCode`. Never fabricate IDs or create master data (the rules
   forbid it anyway).
4. **Idempotent IDs.** Use the deterministic ID schemes above so a retry overwrites
   rather than duplicates.
5. **A `PERMISSION_DENIED` means you are out of scope.** Do not retry or work around
   it — stop and surface it for human review.
6. **Financial accuracy is human-gated.** For invoice pricing and journal account
   mapping, if you are not certain, do not guess — produce a draft summary and flag
   it for the superadmin instead of writing.

## What the agent cannot do (enforced by rules)

Delete anything · edit journals · edit SJ beyond invoice fields · edit transaksi
beyond isActive soft-delete · write master data, settings, COA, accounting
invoices/assets/customers/suppliers · read or write other users' role docs ·
escalate its own role.
