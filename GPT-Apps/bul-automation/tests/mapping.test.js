import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRuleIndex, classifyTransactions, parseAccountCode } from '../src/mapping.js';

const rows = [
  { id: 'T1', tanggal: '2026-04-01', keterangan: 'Pembelian BBM B 9140 SAL', nominal: 100000, akunDebit: '5110-BBM Armada', akunKredit: '1111-Kas Kecil' },
  { id: 'T2', tanggal: '2026-04-02', keterangan: 'Biaya Admin Asuransi', nominal: 25000, akunDebit: '6210-Administrasi Bank', akunKredit: '1111-Kas Kecil' },
  { id: 'T3', tanggal: '2026-04-03', keterangan: 'Biaya Admin Asuransi', nominal: 30000, akunDebit: '6210-Administrasi Bank', akunKredit: '2153-Hutang Pemegang Saham' }
];

test('parseAccountCode extracts the first 4-digit account code', () => {
  assert.equal(parseAccountCode('5110-BBM Armada'), '5110');
  assert.equal(parseAccountCode('1111 Kas Kecil'), '1111');
  assert.equal(parseAccountCode(''), '');
});

test('buildRuleIndex creates exact rules and marks conflicting descriptions', () => {
  const index = buildRuleIndex(rows);

  assert.deepEqual(index.exact.get('pembelian bbm b 9140 sal'), { debit: '5110', credit: '1111', source: 'seed' });
  assert.equal(index.conflicts.has('biaya admin asuransi'), true);
});

test('classifyTransactions keeps confirmed rules ready and conflicts in review', () => {
  const index = buildRuleIndex(rows);
  const result = classifyTransactions([
    { id: 'A001', tanggal: '2026-04-10', keterangan: 'Pembelian BBM B 9140 SAL', nominal: 150000 },
    { id: 'A002', tanggal: '2026-04-11', keterangan: 'Biaya Admin Asuransi', nominal: 25000 },
    { id: 'A003', tanggal: '2026-04-12', keterangan: 'Transaksi Baru', nominal: 99999 }
  ], index);

  assert.equal(result.ready.length, 1);
  assert.equal(result.ready[0].debitAccount, '5110');
  assert.equal(result.ready[0].creditAccount, '1111');
  assert.deepEqual(result.review.map((row) => row.reason), ['mapping_conflict', 'mapping_missing']);
});
