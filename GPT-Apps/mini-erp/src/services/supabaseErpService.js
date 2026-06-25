import { getSupabaseClient } from '../supabase.js';
import { nowIso } from '../utils/date.js';

const accountTypeToUi = {
  asset: 'Asset',
  liability: 'Liability',
  equity: 'Equity',
  revenue: 'Revenue',
  expense: 'Expense',
};

const accountTypeToDb = {
  Asset: 'asset',
  Liability: 'liability',
  Equity: 'equity',
  Revenue: 'revenue',
  Expense: 'expense',
};

const normalBalanceToUi = {
  debit: 'Debit',
  credit: 'Credit',
};

const normalBalanceToDb = {
  Debit: 'debit',
  Credit: 'credit',
};

const documentStatusToUi = {
  draft: 'Draft',
  posted: 'Posted',
  void: 'Void',
};

const documentStatusToDb = {
  Draft: 'draft',
  Posted: 'posted',
  Void: 'void',
};

const approvalStatusToUi = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

const approvalStatusToDb = {
  Pending: 'pending',
  Approved: 'approved',
  Rejected: 'rejected',
};

const cashBankTypeToUi = {
  in: 'Masuk',
  out: 'Keluar',
};

const cashBankTypeToDb = {
  Masuk: 'in',
  Keluar: 'out',
};

const masterDataConfig = {
  pelanggan: { table: 'business_partners', partnerType: 'customer', order: 'code' },
  supplier: { table: 'business_partners', partnerType: 'supplier', order: 'code' },
  satuan: { table: 'units', order: 'code' },
  kategoriProduk: { table: 'product_categories', order: 'code' },
  produk: { table: 'products', order: 'code' },
  costCenters: { table: 'cost_centers', order: 'code' },
  coaAccounts: { table: 'accounts', order: 'code' },
};

const validMemberRoles = new Set(['owner', 'admin', 'accounting', 'staff', 'reader']);
const supportedExtraMemberPermissions = new Set(['approval:self-approve']);

function assertSupabaseOk({ data, error }) {
  if (error) throw error;
  return data;
}

function nullable(value) {
  return value || null;
}

function maybeId(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''))
    ? value
    : undefined;
}

function compactTimestamp(value) {
  return value
    .replaceAll('-', '')
    .replaceAll(':', '')
    .replaceAll('.', '')
    .replaceAll('T', '')
    .replaceAll('Z', '');
}

function byId(items) {
  return new Map((items || []).map((item) => [item.id, item]));
}

export function normalizeSupabaseCompanyMemberInput(member) {
  const identifier = String(member?.userId || member?.email || member?.id || '').trim().toLowerCase();
  const role = member?.role || 'reader';
  const extraPermissions = [...new Set(member?.permissions || [])].sort();
  const unsupportedPermissions = extraPermissions.filter((permission) => !supportedExtraMemberPermissions.has(permission));

  if (!identifier) throw new Error('User ID atau email wajib diisi.');
  if (!validMemberRoles.has(role)) throw new Error('Role tidak didukung.');
  if (unsupportedPermissions.length) {
    throw new Error(`Permission tambahan tidak didukung: ${unsupportedPermissions.join(', ')}`);
  }

  return {
    identifier,
    role,
    extraPermissions,
    isActive: member?.isActive !== false,
  };
}

function mapCommonFromSupabase(row) {
  return cleanUndefined({
    id: row.id,
    isActive: row.is_active !== false && !row.deleted_at,
    createdAt: row.created_at,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    deletedAt: row.deleted_at,
    deletedBy: row.deleted_by,
  });
}

function mapCommonToSupabase({ companyId, actorId, data }) {
  const payload = {
    company_id: companyId,
    is_active: data.isActive !== false,
    updated_by: actorId,
  };

  if (data.id && maybeId(data.id)) payload.id = data.id;
  if (!data.id) payload.created_by = actorId;

  return payload;
}

export function mapSupabaseAccountToUi(row) {
  return {
    ...mapCommonFromSupabase(row),
    kode: row.code,
    nama: row.name,
    tipe: accountTypeToUi[row.account_type] || row.account_type,
    saldoNormal: normalBalanceToUi[row.normal_balance] || row.normal_balance,
    isCashBank: row.is_cash_bank,
    catatan: row.notes || '',
  };
}

function mapSupabaseBusinessPartnerToUi(row) {
  return {
    ...mapCommonFromSupabase(row),
    kode: row.code,
    nama: row.name,
    telepon: row.phone || '',
    email: row.email || '',
    alamat: row.address || '',
    npwp: row.tax_number || '',
    catatan: row.notes || '',
  };
}

function mapSupabaseUnitToUi(row) {
  return {
    ...mapCommonFromSupabase(row),
    kode: row.code,
    nama: row.name,
    simbol: row.symbol || '',
    catatan: row.notes || '',
  };
}

function mapSupabaseCategoryToUi(row) {
  return {
    ...mapCommonFromSupabase(row),
    kode: row.code,
    nama: row.name,
    deskripsi: row.description || '',
    catatan: row.notes || '',
  };
}

function mapSupabaseProductToUi(row, unitMap = new Map(), accountMap = new Map()) {
  const unit = unitMap.get(row.unit_id);
  const revenueAccount = accountMap.get(row.revenue_account_id);

  return {
    ...mapCommonFromSupabase(row),
    kode: row.code,
    nama: row.name,
    tipe: row.product_type === 'product' ? 'Produk' : 'Jasa',
    satuan: unit?.symbol || unit?.name || '',
    hargaJual: Number(row.sale_price || 0),
    akunPendapatan: revenueAccount?.code || '',
    catatan: row.notes || '',
  };
}

function mapSupabaseCostCenterToUi(row) {
  return {
    ...mapCommonFromSupabase(row),
    kode: row.code,
    nama: row.name,
    catatan: row.notes || '',
  };
}

export function mapUiMasterDataToSupabase({ collectionName, companyId, actorId, data }) {
  const base = mapCommonToSupabase({ companyId, actorId, data });

  if (collectionName === 'pelanggan' || collectionName === 'supplier') {
    return {
      ...base,
      code: data.kode,
      name: data.nama,
      partner_type: collectionName === 'pelanggan' ? 'customer' : 'supplier',
      phone: data.telepon || null,
      email: data.email || null,
      address: data.alamat || null,
      tax_number: data.npwp || null,
      notes: data.catatan || null,
      created_by: data.id ? undefined : actorId,
    };
  }

  if (collectionName === 'satuan') {
    return {
      ...base,
      code: data.kode,
      name: data.nama,
      symbol: data.simbol || null,
      notes: data.catatan || null,
      created_by: data.id ? undefined : actorId,
    };
  }

  if (collectionName === 'kategoriProduk') {
    return {
      ...base,
      code: data.kode,
      name: data.nama,
      description: data.deskripsi || null,
      notes: data.catatan || null,
      created_by: data.id ? undefined : actorId,
    };
  }

  if (collectionName === 'produk') {
    return {
      ...base,
      code: data.kode,
      name: data.nama,
      product_type: data.tipe === 'Produk' ? 'product' : 'service',
      sale_price: Number(data.hargaJual || 0),
      notes: data.catatan || null,
      created_by: data.id ? undefined : actorId,
    };
  }

  if (collectionName === 'costCenters') {
    return {
      ...base,
      code: data.kode,
      name: data.nama,
      notes: data.catatan || null,
      created_by: data.id ? undefined : actorId,
    };
  }

  if (collectionName === 'coaAccounts') {
    return {
      ...base,
      code: data.kode,
      name: data.nama,
      account_type: accountTypeToDb[data.tipe] || 'asset',
      normal_balance: normalBalanceToDb[data.saldoNormal] || 'debit',
      is_cash_bank: data.isCashBank || /kas|bank/i.test(`${data.kode || ''} ${data.nama || ''}`),
      notes: data.catatan || null,
      created_by: data.id ? undefined : actorId,
    };
  }

  throw new Error(`Collection Supabase belum didukung: ${collectionName}`);
}

function cleanUndefined(payload) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
}

async function enrichProductPayload({ client, companyId, payload, data }) {
  const nextPayload = { ...payload };

  if (data.satuan) {
    const units = assertSupabaseOk(
      await client
        .from('units')
        .select('id, code, name, symbol')
        .eq('company_id', companyId)
        .or(`code.eq.${data.satuan},name.eq.${data.satuan},symbol.eq.${data.satuan}`)
        .limit(1)
    );
    nextPayload.unit_id = units[0]?.id || null;
  }

  if (data.akunPendapatan) {
    const accounts = assertSupabaseOk(
      await client
        .from('accounts')
        .select('id, code')
        .eq('company_id', companyId)
        .eq('code', data.akunPendapatan)
        .limit(1)
    );
    nextPayload.revenue_account_id = accounts[0]?.id || null;
  }

  return nextPayload;
}

export async function fetchSupabaseCompanyMemberships(userId) {
  const client = getSupabaseClient();
  const memberships = assertSupabaseOk(
    await client
      .from('company_members')
      .select('company_id, role, extra_permissions, is_active')
      .eq('user_id', userId)
      .eq('is_active', true)
      .is('deleted_at', null)
  );
  const companyIds = memberships.map((item) => item.company_id);

  if (!companyIds.length) return [];

  const companies = assertSupabaseOk(
    await client
      .from('companies')
      .select('id, code, name, is_active')
      .in('id', companyIds)
      .eq('is_active', true)
  );
  const companyMap = byId(companies);

  return memberships.map((membership) => {
    const company = companyMap.get(membership.company_id) || {};
    return {
      id: membership.company_id,
      code: company.code,
      name: company.name || company.code || membership.company_id,
      role: membership.role || 'reader',
      permissions: membership.extra_permissions || [],
      isActive: membership.is_active !== false && company.is_active !== false,
    };
  });
}

export async function fetchSupabaseCompanyMembers(companyId) {
  const client = getSupabaseClient();
  const members = assertSupabaseOk(
    await client
      .from('company_members')
      .select('company_id, user_id, role, extra_permissions, is_active, created_at, created_by, updated_at, updated_by, deleted_at, deleted_by')
      .eq('company_id', companyId)
      .order('role', { ascending: true })
  );
  const profileIds = members.map((member) => member.user_id);
  const profiles = profileIds.length
    ? assertSupabaseOk(await client.from('profiles').select('id, display_name, email').in('id', profileIds))
    : [];
  const profileMap = byId(profiles);

  return members.map((member) => {
    const profile = profileMap.get(member.user_id) || {};
    return {
      id: member.user_id,
      userId: member.user_id,
      displayName: profile.display_name || profile.email || member.user_id,
      email: profile.email || '',
      role: member.role,
      permissions: member.extra_permissions || [],
      isActive: member.is_active !== false && !member.deleted_at,
      createdAt: member.created_at,
      createdBy: member.created_by,
      updatedAt: member.updated_at,
      updatedBy: member.updated_by,
      deletedAt: member.deleted_at,
      deletedBy: member.deleted_by,
    };
  });
}

export async function saveSupabaseCompanyMember({ companyId, actor, member }) {
  const client = getSupabaseClient();
  const input = normalizeSupabaseCompanyMemberInput(member);
  const apiMember = await saveSupabaseCompanyMemberViaApi({ client, companyId, member, input });

  if (apiMember) {
    const members = await fetchSupabaseCompanyMembers(companyId);
    return members.find((item) => item.userId === apiMember.user_id || item.email?.toLowerCase() === input.identifier || item.userId === input.identifier);
  }

  assertSupabaseOk(
    await client.rpc('save_company_member', {
      p_company_id: companyId,
      p_identifier: input.identifier,
      p_role: input.role,
      p_extra_permissions: input.extraPermissions,
      p_is_active: input.isActive,
    })
  );

  const members = await fetchSupabaseCompanyMembers(companyId);
  return members.find((item) => item.userId === member.id || item.email?.toLowerCase() === input.identifier || item.userId === input.identifier);
}

async function saveSupabaseCompanyMemberViaApi({ client, companyId, member, input }) {
  if (typeof fetch !== 'function') return null;

  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;

  const token = sessionData.session?.access_token;
  if (!token) return null;

  const response = await fetch('/api/admin/company-members', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      companyId,
      identifier: input.identifier,
      email: input.identifier.includes('@') ? input.identifier : undefined,
      displayName: member.displayName || member.email || input.identifier,
      role: input.role,
      permissions: input.extraPermissions,
      isActive: input.isActive,
    }),
  });

  const contentType = response.headers.get('content-type') || '';

  if (response.status === 404 || !contentType.includes('application/json')) {
    return null;
  }

  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Gagal menyimpan company member.');

  return payload.member || null;
}

export async function fetchSupabaseMasterData({ companyId, collectionName }) {
  const client = getSupabaseClient();
  const config = masterDataConfig[collectionName];
  if (!config) throw new Error(`Collection Supabase belum didukung: ${collectionName}`);

  let query = client.from(config.table).select('*').eq('company_id', companyId);
  if (config.partnerType) query = query.eq('partner_type', config.partnerType);
  if (config.order) query = query.order(config.order, { ascending: true });

  const rows = assertSupabaseOk(await query);

  if (collectionName === 'produk') {
    const unitIds = [...new Set(rows.map((row) => row.unit_id).filter(Boolean))];
    const accountIds = [...new Set(rows.map((row) => row.revenue_account_id).filter(Boolean))];
    const units = unitIds.length ? assertSupabaseOk(await client.from('units').select('id, code, name, symbol').in('id', unitIds)) : [];
    const accounts = accountIds.length ? assertSupabaseOk(await client.from('accounts').select('id, code, name').in('id', accountIds)) : [];
    const unitMap = byId(units);
    const accountMap = byId(accounts);
    return rows.map((row) => mapSupabaseProductToUi(row, unitMap, accountMap));
  }

  if (collectionName === 'pelanggan' || collectionName === 'supplier') return rows.map(mapSupabaseBusinessPartnerToUi);
  if (collectionName === 'satuan') return rows.map(mapSupabaseUnitToUi);
  if (collectionName === 'kategoriProduk') return rows.map(mapSupabaseCategoryToUi);
  if (collectionName === 'costCenters') return rows.map(mapSupabaseCostCenterToUi);
  if (collectionName === 'coaAccounts') return rows.map(mapSupabaseAccountToUi);

  return rows;
}

export async function saveSupabaseMasterDataItem({ companyId, collectionName, data, actor }) {
  const client = getSupabaseClient();
  const config = masterDataConfig[collectionName];
  if (!config) throw new Error(`Collection Supabase belum didukung: ${collectionName}`);

  let payload = mapUiMasterDataToSupabase({ collectionName, companyId, actorId: actor.uid, data });
  if (collectionName === 'produk') {
    payload = await enrichProductPayload({ client, companyId, payload, data });
  }

  const id = maybeId(data.id);
  const response = id
    ? await client.from(config.table).update(cleanUndefined(payload)).eq('company_id', companyId).eq('id', id).select().single()
    : await client.from(config.table).insert(cleanUndefined(payload)).select().single();

  assertSupabaseOk(response);
  return (await fetchSupabaseMasterData({ companyId, collectionName })).find((item) => item.id === response.data.id);
}

export async function softDeleteSupabaseMasterDataItem({ companyId, collectionName, id, actor }) {
  const client = getSupabaseClient();
  const config = masterDataConfig[collectionName];
  if (!config) throw new Error(`Collection Supabase belum didukung: ${collectionName}`);

  assertSupabaseOk(
    await client
      .from(config.table)
      .update({ is_active: false, deleted_at: nowIso(), deleted_by: actor.uid, updated_by: actor.uid })
      .eq('company_id', companyId)
      .eq('id', id)
  );
}

export async function restoreSupabaseMasterDataItem({ companyId, collectionName, id, actor }) {
  const client = getSupabaseClient();
  const config = masterDataConfig[collectionName];
  if (!config) throw new Error(`Collection Supabase belum didukung: ${collectionName}`);

  assertSupabaseOk(
    await client
      .from(config.table)
      .update({ is_active: true, deleted_at: null, deleted_by: null, updated_by: actor.uid })
      .eq('company_id', companyId)
      .eq('id', id)
  );
}

function mapSupabaseJournalLineToUi(line, accountMap = new Map(), costCenterMap = new Map()) {
  const account = line.accounts || accountMap.get(line.account_id) || {};
  const costCenter = line.cost_centers || costCenterMap.get(line.cost_center_id) || {};

  return {
    id: line.id,
    accountId: line.account_id || account.id || '',
    accountCode: account.code || '',
    accountName: account.name || '',
    debit: Number(line.debit || 0),
    credit: Number(line.credit || 0),
    description: line.description || '',
    costCenterId: line.cost_center_id || '',
    costCenterCode: costCenter.code || '',
    costCenterName: costCenter.name || '',
    linePosition: line.line_position,
    isActive: line.is_active !== false,
  };
}

export function mapSupabaseJournalToUi(row, accountMap = new Map(), costCenterMap = new Map()) {
  const lines = (row.journal_entry_lines || [])
    .filter((line) => line.is_active !== false)
    .sort((a, b) => Number(a.line_position || 0) - Number(b.line_position || 0))
    .map((line) => mapSupabaseJournalLineToUi(line, accountMap, costCenterMap));

  return {
    id: row.id,
    journalNumber: row.journal_number,
    date: row.journal_date,
    description: row.description,
    status: documentStatusToUi[row.status] || row.status,
    approvalStatus: approvalStatusToUi[row.approval_status] || row.approval_status,
    debit: Number(row.total_debit || 0),
    credit: Number(row.total_credit || 0),
    totalDebit: Number(row.total_debit || 0),
    totalCredit: Number(row.total_credit || 0),
    lines,
    isActive: row.is_active !== false,
    createdAt: row.created_at,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    approvedAt: row.approved_at,
    approvedBy: row.approved_by,
    postedAt: row.posted_at,
    postedBy: row.posted_by,
    voidedAt: row.voided_at,
    voidedBy: row.voided_by,
    voidReason: row.void_reason,
    reversalJournalId: row.reversal_entry_id,
  };
}

async function fetchJournalLines({ client, companyId, journalIds }) {
  if (!journalIds.length) return new Map();

  const lines = assertSupabaseOk(
    await client
      .from('journal_entry_lines')
      .select('*')
      .eq('company_id', companyId)
      .in('journal_entry_id', journalIds)
      .order('line_position', { ascending: true })
  );
  const accountIds = [...new Set(lines.map((line) => line.account_id).filter(Boolean))];
  const costCenterIds = [...new Set(lines.map((line) => line.cost_center_id).filter(Boolean))];
  const accounts = accountIds.length ? assertSupabaseOk(await client.from('accounts').select('id, code, name').in('id', accountIds)) : [];
  const costCenters = costCenterIds.length
    ? assertSupabaseOk(await client.from('cost_centers').select('id, code, name').in('id', costCenterIds))
    : [];
  const accountMap = byId(accounts);
  const costCenterMap = byId(costCenters);
  const linesByJournalId = new Map();

  lines.forEach((line) => {
    const nextLine = {
      ...line,
      accounts: accountMap.get(line.account_id),
      cost_centers: costCenterMap.get(line.cost_center_id),
    };
    const rows = linesByJournalId.get(line.journal_entry_id) || [];
    rows.push(nextLine);
    linesByJournalId.set(line.journal_entry_id, rows);
  });

  return linesByJournalId;
}

async function fetchSupabaseJournalById({ companyId, journalId }) {
  const client = getSupabaseClient();
  const journal = assertSupabaseOk(
    await client.from('journal_entries').select('*').eq('company_id', companyId).eq('id', journalId).single()
  );
  const linesByJournalId = await fetchJournalLines({ client, companyId, journalIds: [journalId] });
  return mapSupabaseJournalToUi({ ...journal, journal_entry_lines: linesByJournalId.get(journalId) || [] });
}

export async function fetchSupabaseJournalEntries({ companyId }) {
  const client = getSupabaseClient();
  const journals = assertSupabaseOk(
    await client
      .from('journal_entries')
      .select('*')
      .eq('company_id', companyId)
      .order('journal_date', { ascending: false })
      .order('created_at', { ascending: false })
  );
  const journalIds = journals.map((journal) => journal.id);
  const linesByJournalId = await fetchJournalLines({ client, companyId, journalIds });
  return journals.map((journal) => mapSupabaseJournalToUi({ ...journal, journal_entry_lines: linesByJournalId.get(journal.id) || [] }));
}

export async function saveSupabaseJournalDraft({ companyId, actor, journal, totals }) {
  const client = getSupabaseClient();
  const id = maybeId(journal.id);
  const headerPayload = cleanUndefined({
    company_id: companyId,
    journal_number: journal.journalNumber || `JV-DRAFT-${compactTimestamp(nowIso()).slice(0, 17)}`,
    journal_date: journal.date,
    description: journal.description,
    status: 'draft',
    approval_status: approvalStatusToDb[journal.approvalStatus] || 'pending',
    total_debit: Number(totals.debit || 0),
    total_credit: Number(totals.credit || 0),
    is_active: true,
    updated_by: actor.uid,
    created_by: id ? undefined : actor.uid,
  });

  const header = id
    ? assertSupabaseOk(await client.from('journal_entries').update(headerPayload).eq('company_id', companyId).eq('id', id).select().single())
    : assertSupabaseOk(await client.from('journal_entries').insert(headerPayload).select().single());

  const journalId = header.id;
  const existingLines = id
    ? assertSupabaseOk(
        await client
          .from('journal_entry_lines')
          .select('*')
          .eq('company_id', companyId)
          .eq('journal_entry_id', journalId)
          .eq('is_active', true)
          .order('line_position', { ascending: true })
      )
    : [];

  for (let index = 0; index < journal.lines.length; index += 1) {
    const line = journal.lines[index];
    const existing = existingLines[index];
    const linePayload = {
      company_id: companyId,
      journal_entry_id: journalId,
      line_position: index + 1,
      account_id: line.accountId,
      cost_center_id: nullable(line.costCenterId),
      description: line.description || null,
      debit: Number(line.debit || 0),
      credit: Number(line.credit || 0),
      is_active: true,
    };

    if (existing) {
      assertSupabaseOk(await client.from('journal_entry_lines').update(linePayload).eq('company_id', companyId).eq('id', existing.id));
    } else {
      assertSupabaseOk(await client.from('journal_entry_lines').insert(linePayload));
    }
  }

  const staleLines = existingLines.slice(journal.lines.length);
  if (staleLines.length) {
    assertSupabaseOk(
      await client
        .from('journal_entry_lines')
        .update({ is_active: false, deleted_at: nowIso(), deleted_by: actor.uid })
        .eq('company_id', companyId)
        .in('id', staleLines.map((line) => line.id))
    );
  }

  return fetchSupabaseJournalById({ companyId, journalId });
}

export async function approveSupabaseJournalEntry({ companyId, journal }) {
  const client = getSupabaseClient();
  assertSupabaseOk(await client.rpc('approve_journal_entry', { p_company_id: companyId, p_journal_entry_id: journal.id }));
  return fetchSupabaseJournalById({ companyId, journalId: journal.id });
}

export async function postSupabaseJournalEntry({ companyId, journal }) {
  const client = getSupabaseClient();
  assertSupabaseOk(await client.rpc('post_journal_entry', { p_company_id: companyId, p_journal_entry_id: journal.id }));
  return fetchSupabaseJournalById({ companyId, journalId: journal.id });
}

export async function voidSupabaseJournalEntry({ companyId, journal, reason }) {
  const client = getSupabaseClient();
  assertSupabaseOk(await client.rpc('void_journal_entry', { p_company_id: companyId, p_journal_entry_id: journal.id, p_reason: reason }));
  const voidedJournal = await fetchSupabaseJournalById({ companyId, journalId: journal.id });
  return { voidedJournal };
}

function mapSupabaseCashBankTransactionToUi(row, accountMap = new Map(), costCenterMap = new Map(), journalMap = new Map()) {
  const cashAccount = accountMap.get(row.cash_account_id) || {};
  const counterAccount = accountMap.get(row.counter_account_id) || {};
  const costCenter = costCenterMap.get(row.cost_center_id) || {};
  const journal = journalMap.get(row.journal_entry_id) || {};

  return {
    id: row.id,
    transactionNumber: row.transaction_number,
    date: row.transaction_date,
    type: cashBankTypeToUi[row.transaction_type] || row.transaction_type,
    description: row.description,
    amount: Number(row.amount || 0),
    cashAccountId: row.cash_account_id,
    cashAccountCode: cashAccount.code || '',
    cashAccountName: cashAccount.name || '',
    counterAccountId: row.counter_account_id,
    counterAccountCode: counterAccount.code || '',
    counterAccountName: counterAccount.name || '',
    costCenterId: row.cost_center_id || '',
    costCenterCode: costCenter.code || '',
    costCenterName: costCenter.name || '',
    status: documentStatusToUi[row.status] || row.status,
    approvalStatus: approvalStatusToUi[row.approval_status] || row.approval_status,
    journalId: row.journal_entry_id,
    journalNumber: journal.journal_number || '',
    reversalJournalId: row.reversal_journal_entry_id,
    isActive: row.is_active !== false,
    createdAt: row.created_at,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    approvedAt: row.approved_at,
    approvedBy: row.approved_by,
    postedAt: row.posted_at,
    postedBy: row.posted_by,
    voidedAt: row.voided_at,
    voidedBy: row.voided_by,
    voidReason: row.void_reason,
  };
}

async function fetchCashBankLookups({ client, rows }) {
  const accountIds = [...new Set(rows.flatMap((row) => [row.cash_account_id, row.counter_account_id]).filter(Boolean))];
  const costCenterIds = [...new Set(rows.map((row) => row.cost_center_id).filter(Boolean))];
  const journalIds = [...new Set(rows.map((row) => row.journal_entry_id).filter(Boolean))];
  const accounts = accountIds.length ? assertSupabaseOk(await client.from('accounts').select('id, code, name').in('id', accountIds)) : [];
  const costCenters = costCenterIds.length
    ? assertSupabaseOk(await client.from('cost_centers').select('id, code, name').in('id', costCenterIds))
    : [];
  const journals = journalIds.length ? assertSupabaseOk(await client.from('journal_entries').select('id, journal_number').in('id', journalIds)) : [];

  return {
    accountMap: byId(accounts),
    costCenterMap: byId(costCenters),
    journalMap: byId(journals),
  };
}

async function fetchSupabaseCashBankTransactionById({ companyId, transactionId }) {
  const client = getSupabaseClient();
  const row = assertSupabaseOk(
    await client.from('cash_bank_transactions').select('*').eq('company_id', companyId).eq('id', transactionId).single()
  );
  const lookups = await fetchCashBankLookups({ client, rows: [row] });
  return mapSupabaseCashBankTransactionToUi(row, lookups.accountMap, lookups.costCenterMap, lookups.journalMap);
}

export async function fetchSupabaseCashBankTransactions({ companyId }) {
  const client = getSupabaseClient();
  const rows = assertSupabaseOk(
    await client
      .from('cash_bank_transactions')
      .select('*')
      .eq('company_id', companyId)
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false })
  );
  const lookups = await fetchCashBankLookups({ client, rows });
  return rows.map((row) => mapSupabaseCashBankTransactionToUi(row, lookups.accountMap, lookups.costCenterMap, lookups.journalMap));
}

export async function saveSupabaseCashBankDraft({ companyId, actor, transaction }) {
  const client = getSupabaseClient();
  const id = maybeId(transaction.id);
  const payload = cleanUndefined({
    company_id: companyId,
    transaction_number: transaction.transactionNumber || `KB-DRAFT-${compactTimestamp(nowIso()).slice(0, 17)}`,
    transaction_date: transaction.date,
    transaction_type: cashBankTypeToDb[transaction.type] || 'in',
    description: transaction.description,
    amount: Number(transaction.amount || 0),
    cash_account_id: transaction.cashAccountId,
    counter_account_id: transaction.counterAccountId,
    cost_center_id: nullable(transaction.costCenterId),
    status: 'draft',
    approval_status: approvalStatusToDb[transaction.approvalStatus] || 'pending',
    is_active: true,
    updated_by: actor.uid,
    created_by: id ? undefined : actor.uid,
  });
  const row = id
    ? assertSupabaseOk(await client.from('cash_bank_transactions').update(payload).eq('company_id', companyId).eq('id', id).select().single())
    : assertSupabaseOk(await client.from('cash_bank_transactions').insert(payload).select().single());

  return fetchSupabaseCashBankTransactionById({ companyId, transactionId: row.id });
}

export async function approveSupabaseCashBankTransaction({ companyId, transaction }) {
  const client = getSupabaseClient();
  assertSupabaseOk(await client.rpc('approve_cash_bank_transaction', { p_company_id: companyId, p_transaction_id: transaction.id }));
  return fetchSupabaseCashBankTransactionById({ companyId, transactionId: transaction.id });
}

export async function postSupabaseCashBankTransaction({ companyId, transaction }) {
  const client = getSupabaseClient();
  assertSupabaseOk(await client.rpc('post_cash_bank_transaction', { p_company_id: companyId, p_transaction_id: transaction.id }));
  const postedTransaction = await fetchSupabaseCashBankTransactionById({ companyId, transactionId: transaction.id });
  const journal = postedTransaction.journalId
    ? await fetchSupabaseJournalById({ companyId, journalId: postedTransaction.journalId })
    : null;
  return { postedTransaction, journal };
}

export async function voidSupabaseCashBankTransaction({ companyId, transaction, reason }) {
  const client = getSupabaseClient();
  assertSupabaseOk(await client.rpc('void_cash_bank_transaction', { p_company_id: companyId, p_transaction_id: transaction.id, p_reason: reason }));
  const voidedTransaction = await fetchSupabaseCashBankTransactionById({ companyId, transactionId: transaction.id });
  return { voidedTransaction };
}

export async function fetchSupabasePeriodLocks({ companyId }) {
  const client = getSupabaseClient();
  const rows = assertSupabaseOk(
    await client
      .from('accounting_period_locks')
      .select('*')
      .eq('company_id', companyId)
      .order('period_start', { ascending: false })
  );

  return rows.map((row) => ({
    id: row.period_start?.slice(0, 7) || row.id,
    period: row.period_start?.slice(0, 7),
    status: row.status === 'locked' ? 'Locked' : 'Unlocked',
    note: row.note || '',
    isActive: row.is_active !== false,
    lockedAt: row.locked_at,
    lockedBy: row.locked_by,
    unlockedAt: row.unlocked_at,
    unlockedBy: row.unlocked_by,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  }));
}

export async function lockSupabaseAccountingPeriod({ companyId, period, note }) {
  const client = getSupabaseClient();
  const periodStart = `${period}-01`;
  const row = assertSupabaseOk(await client.rpc('lock_accounting_period', { p_company_id: companyId, p_period_start: periodStart, p_note: note }));
  return {
    id: row.period_start?.slice(0, 7) || period,
    period: row.period_start?.slice(0, 7) || period,
    status: 'Locked',
    note: row.note || '',
    isActive: row.is_active !== false,
    lockedAt: row.locked_at,
    lockedBy: row.locked_by,
  };
}

export async function unlockSupabaseAccountingPeriod({ companyId, period }) {
  const client = getSupabaseClient();
  const periodStart = `${period}-01`;
  const row = assertSupabaseOk(await client.rpc('unlock_accounting_period', { p_company_id: companyId, p_period_start: periodStart }));
  return {
    id: row.period_start?.slice(0, 7) || period,
    period: row.period_start?.slice(0, 7) || period,
    status: 'Unlocked',
    isActive: row.is_active !== false,
    unlockedAt: row.unlocked_at,
    unlockedBy: row.unlocked_by,
  };
}

export async function fetchSupabaseAuditLogs({ companyId }) {
  const client = getSupabaseClient();
  const rows = assertSupabaseOk(
    await client
      .from('audit_logs')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(200)
  );

  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    actorId: row.actor_id,
    actorName: row.actor_name,
    collectionName: row.collection_name,
    documentId: row.document_id,
    before: row.before_data,
    after: row.after_data,
    metadata: row.metadata || {},
    createdAt: row.created_at,
  }));
}
