import { isWithinDateRange } from './dateRange.js';

export function inferNormalBalance(account, accountCode = '') {
  if (account?.saldoNormal) return account.saldoNormal;

  const accountPrefix = String(account?.kode || accountCode || '').slice(0, 1);
  return ['2', '3', '4'].includes(accountPrefix) ? 'Credit' : 'Debit';
}

export function normalBalanceAmount({ debit, credit, normalBalance }) {
  return normalBalance === 'Credit' ? Number(credit || 0) - Number(debit || 0) : Number(debit || 0) - Number(credit || 0);
}

export function buildAccountBalances({ journals, coaAccounts, startDate = '', endDate = '' }) {
  const accountById = new Map(coaAccounts.map((account) => [account.id, account]));
  const rowsByAccount = new Map();
  const postedJournals = journals.filter(
    (journal) => journal.status === 'Posted' && journal.isActive !== false && isWithinDateRange(journal.date, startDate, endDate)
  );

  postedJournals.forEach((journal) => {
    (journal.lines || []).forEach((line) => {
      const account = accountById.get(line.accountId);
      const key = line.accountId || line.accountCode;
      const current = rowsByAccount.get(key) || {
        id: key,
        accountCode: account?.kode || line.accountCode,
        accountName: account?.nama || line.accountName,
        accountType: account?.tipe || '-',
        normalBalance: inferNormalBalance(account, line.accountCode),
        debit: 0,
        credit: 0,
      };

      current.debit += Number(line.debit || 0);
      current.credit += Number(line.credit || 0);
      rowsByAccount.set(key, current);
    });
  });

  return [...rowsByAccount.values()]
    .map((row) => ({
      ...row,
      balance: normalBalanceAmount(row),
    }))
    .filter((row) => row.debit || row.credit || row.balance)
    .sort((a, b) => String(a.accountCode || '').localeCompare(String(b.accountCode || ''), 'id-ID'));
}
