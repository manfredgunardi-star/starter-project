import test from 'node:test';
import assert from 'node:assert/strict';
import { checkText } from '../validate-agent-policy.mjs';

test('checkText reports missing required phrases', () => {
  assert.deepEqual(checkText('alpha', ['alpha', 'beta'], []), ['missing: beta']);
});

test('checkText reports forbidden phrases case-insensitively', () => {
  assert.deepEqual(
    checkText('Firebase Deploy --only hosting', [], ['firebase deploy']),
    ['forbidden: firebase deploy'],
  );
});

test('checkText returns no failures for compliant text', () => {
  assert.deepEqual(
    checkText(
      'reviewer read-only; production deployment dilarang',
      ['reviewer read-only', 'production deployment dilarang'],
      ['firebase deploy:*'],
    ),
    [],
  );
});
