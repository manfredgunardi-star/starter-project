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
