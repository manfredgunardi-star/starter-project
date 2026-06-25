import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeCompanyMemberRequest } from '../../netlify/functions/company-members.js';

test('normalizes company member invite request payload', () => {
  const request = normalizeCompanyMemberRequest({
    companyId: 'company-id',
    email: '  USER@Company.Com ',
    displayName: '  User Company ',
    role: 'accounting',
    permissions: ['approval:self-approve'],
    isActive: true,
  });

  assert.deepEqual(request, {
    companyId: 'company-id',
    identifier: 'user@company.com',
    email: 'user@company.com',
    displayName: 'User Company',
    role: 'accounting',
    permissions: ['approval:self-approve'],
    isActive: true,
  });
});

test('rejects company member invite request without target identifier', () => {
  assert.throws(
    () =>
      normalizeCompanyMemberRequest({
        companyId: 'company-id',
        role: 'reader',
      }),
    /Email atau user ID target wajib diisi/
  );
});

test('rejects company member invite request with unsupported role', () => {
  assert.throws(
    () =>
      normalizeCompanyMemberRequest({
        companyId: 'company-id',
        email: 'user@company.com',
        role: 'superuser',
      }),
    /Role tidak didukung/
  );
});
