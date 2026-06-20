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
