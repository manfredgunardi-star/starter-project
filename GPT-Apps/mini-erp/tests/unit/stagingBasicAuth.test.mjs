import assert from 'node:assert/strict';
import test from 'node:test';

import { isBasicAuthAuthorized } from '../../netlify/edge-functions/staging-basic-auth.js';
import { isBasicAuthAuthorizedByHash } from '../../netlify/edge-functions/staging-basic-auth.js';

function basicAuth(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`;
}

test('allows request when staging basic auth credentials match', () => {
  assert.equal(
    isBasicAuthAuthorized({
      authorizationHeader: basicAuth('erp', 'secret-pass'),
      expectedUsername: 'erp',
      expectedPassword: 'secret-pass',
    }),
    true
  );
});

test('rejects request when staging basic auth password does not match', () => {
  assert.equal(
    isBasicAuthAuthorized({
      authorizationHeader: basicAuth('erp', 'wrong-pass'),
      expectedUsername: 'erp',
      expectedPassword: 'secret-pass',
    }),
    false
  );
});

test('rejects request when staging basic auth password is not configured', () => {
  assert.equal(
    isBasicAuthAuthorized({
      authorizationHeader: basicAuth('erp', 'secret-pass'),
      expectedUsername: 'erp',
      expectedPassword: '',
    }),
    false
  );
});

test('allows request when staging basic auth password hash matches', async () => {
  assert.equal(
    await isBasicAuthAuthorizedByHash({
      authorizationHeader: basicAuth('erp', 'secret-pass'),
      expectedUsername: 'erp',
      expectedPasswordHash: 'f38eb016088980f10dcbffce49bc7d0d476d198c43a6fa8a343416709049c9db',
    }),
    true
  );
});
