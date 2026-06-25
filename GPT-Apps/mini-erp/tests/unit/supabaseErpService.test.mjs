import assert from 'node:assert/strict';
import test from 'node:test';

import {
  mapSupabaseAccountToUi,
  mapSupabaseJournalToUi,
  normalizeSupabaseCompanyMemberInput,
  mapUiMasterDataToSupabase,
} from '../../src/services/supabaseErpService.js';

test('maps Supabase account rows to the existing UI master-data shape', () => {
  const account = mapSupabaseAccountToUi({
    id: '2a45a8f8-2a37-4e63-98f1-ef97fe1f26c7',
    code: '1-1000',
    name: 'Kas',
    account_type: 'asset',
    normal_balance: 'debit',
    is_cash_bank: true,
    notes: 'Akun kas utama',
    is_active: true,
    created_at: '2026-04-18T01:02:03.000Z',
    created_by: 'owner-id',
    updated_at: '2026-04-18T04:05:06.000Z',
    updated_by: 'owner-id',
  });

  assert.deepEqual(account, {
    id: '2a45a8f8-2a37-4e63-98f1-ef97fe1f26c7',
    kode: '1-1000',
    nama: 'Kas',
    tipe: 'Asset',
    saldoNormal: 'Debit',
    isCashBank: true,
    catatan: 'Akun kas utama',
    isActive: true,
    createdAt: '2026-04-18T01:02:03.000Z',
    createdBy: 'owner-id',
    updatedAt: '2026-04-18T04:05:06.000Z',
    updatedBy: 'owner-id',
  });
});

test('maps UI cost center payload to Supabase insert/update columns', () => {
  const payload = mapUiMasterDataToSupabase({
    collectionName: 'costCenters',
    companyId: 'company-id',
    actorId: 'actor-id',
    data: {
      kode: 'CC-001',
      nama: 'Operasional',
      catatan: 'Pusat biaya operasional',
      isActive: true,
    },
  });

  assert.deepEqual(payload, {
    company_id: 'company-id',
    code: 'CC-001',
    name: 'Operasional',
    notes: 'Pusat biaya operasional',
    is_active: true,
    created_by: 'actor-id',
    updated_by: 'actor-id',
  });
});

test('maps Supabase journal rows with nested lines to the existing UI journal shape', () => {
  const journal = mapSupabaseJournalToUi({
    id: 'journal-id',
    journal_number: 'JV-2026-0001',
    journal_date: '2026-04-18',
    description: 'Saldo awal',
    status: 'posted',
    approval_status: 'approved',
    total_debit: 25000000,
    total_credit: 25000000,
    created_at: '2026-04-18T01:02:03.000Z',
    created_by: 'owner-id',
    updated_at: '2026-04-18T04:05:06.000Z',
    updated_by: 'owner-id',
    posted_at: '2026-04-18T04:05:06.000Z',
    posted_by: 'owner-id',
    journal_entry_lines: [
      {
        id: 'line-1',
        line_position: 1,
        description: 'Debit kas',
        debit: 25000000,
        credit: 0,
        accounts: { id: 'account-1', code: '1-1000', name: 'Kas' },
        cost_centers: { id: 'cost-center-1', code: 'CC-001', name: 'Operasional' },
      },
      {
        id: 'line-2',
        line_position: 2,
        description: 'Kredit modal',
        debit: 0,
        credit: 25000000,
        accounts: { id: 'account-2', code: '3-1000', name: 'Modal' },
        cost_centers: null,
      },
    ],
  });

  assert.equal(journal.status, 'Posted');
  assert.equal(journal.approvalStatus, 'Approved');
  assert.equal(journal.totalDebit, 25000000);
  assert.equal(journal.lines[0].accountCode, '1-1000');
  assert.equal(journal.lines[0].costCenterCode, 'CC-001');
  assert.equal(journal.lines[1].accountName, 'Modal');
});

test('normalizes company member identifier before RPC save', () => {
  const input = normalizeSupabaseCompanyMemberInput({
    userId: '  OWNER@Company.Com  ',
    role: 'admin',
    permissions: ['approval:self-approve'],
    isActive: true,
  });

  assert.deepEqual(input, {
    identifier: 'owner@company.com',
    role: 'admin',
    extraPermissions: ['approval:self-approve'],
    isActive: true,
  });
});

test('rejects unsupported extra permissions for company member RPC save', () => {
  assert.throws(
    () =>
      normalizeSupabaseCompanyMemberInput({
        userId: 'owner@company.com',
        role: 'reader',
        permissions: ['users:manage'],
      }),
    /Permission tambahan tidak didukung/
  );
});
