import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UJI_DOC_ID, nilaiUjiTolak } from '../src/firebase.js';

test('ID dokumen uji tidak memakai pola __x__ yang dicadangkan Firestore', () => {
  assert.doesNotMatch(UJI_DOC_ID, /^__.*__$/);
});

test('nilaiUjiTolak hanya lulus bila rules menolak', () => {
  assert.deepEqual(nilaiUjiTolak({ code: 'permission-denied' }), { ditolak: true, kode: 'permission-denied' });
  assert.throws(() => nilaiUjiTolak({ code: 'not-found' }), /LOLOS rules/);
  assert.throws(() => nilaiUjiTolak({ code: 'invalid-argument', message: 'reserved' }), /tidak meyakinkan/);
  assert.throws(() => nilaiUjiTolak(null), /berhasil/);
});
