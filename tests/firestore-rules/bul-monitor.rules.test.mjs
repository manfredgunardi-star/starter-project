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
