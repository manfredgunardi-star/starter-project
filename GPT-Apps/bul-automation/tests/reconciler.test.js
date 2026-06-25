import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeSjNumber, reconcileDocumentSets, withinPeriod } from '../src/reconciler.js';

test('normalizeSjNumber keeps only uppercase alphanumeric characters', () => {
  assert.equal(normalizeSjNumber(' SJ-001 / abc '), 'SJ001ABC');
  assert.equal(normalizeSjNumber(null), '');
});

test('reconcileDocumentSets finds missing and out-of-period records', () => {
  const result = reconcileDocumentSets({
    suratJalan: [
      { nomorSJ: '001', tanggal: '2026-04-02' },
      { nomorSJ: '002', tanggal: '2026-03-31' }
    ],
    ritasi: [
      { nomorSJ: '001', tanggal: '2026-04-02' },
      { nomorSJ: '003', tanggal: '2026-04-03' }
    ],
    invoices: [
      { nomorSJ: '001', noInvoice: 'INV-1' }
    ],
    periodStart: '2026-04-01',
    periodEnd: '2026-04-30'
  });

  assert.deepEqual(result.sjNotInRitasi.map((r) => r.nomorSJ), ['002']);
  assert.deepEqual(result.ritasiNotInSj.map((r) => r.nomorSJ), ['003']);
  assert.deepEqual(result.sjWithoutInvoice.map((r) => r.nomorSJ), ['002']);
  assert.deepEqual(result.outOfPeriod.map((r) => r.nomorSJ), ['002']);
});

test('withinPeriod handles short Excel display dates', () => {
  assert.equal(withinPeriod('4/4/26', '2026-04-01', '2026-04-30'), true);
  assert.equal(withinPeriod('3/31/26', '2026-04-01', '2026-04-30'), false);
});
