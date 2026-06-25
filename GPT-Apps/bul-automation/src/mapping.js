export function parseAccountCode(account) {
  const match = /^(\d{4})/.exec(String(account || '').trim());
  return match ? match[1] : '';
}

export function normalizeDescription(description) {
  return String(description || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function buildRuleIndex(seedRows = [], confirmedRules = []) {
  const candidates = new Map();

  for (const row of seedRows) {
    const key = normalizeDescription(row.keterangan || row.description);
    const debit = parseAccountCode(row.akunDebit || row.debitAccount || row.debit);
    const credit = parseAccountCode(row.akunKredit || row.creditAccount || row.credit);
    if (!key || !debit || !credit) continue;
    if (!candidates.has(key)) candidates.set(key, new Set());
    candidates.get(key).add(`${debit}/${credit}`);
  }

  const exact = new Map();
  const conflicts = new Set();
  for (const [key, pairs] of candidates.entries()) {
    if (pairs.size === 1) {
      const [pair] = [...pairs];
      const [debit, credit] = pair.split('/');
      exact.set(key, { debit, credit, source: 'seed' });
    } else {
      conflicts.add(key);
    }
  }

  for (const rule of confirmedRules) {
    const key = normalizeDescription(rule.keterangan || rule.pattern || rule.description);
    const debit = parseAccountCode(rule.akunDebit || rule.debitAccount || rule.debit);
    const credit = parseAccountCode(rule.akunKredit || rule.creditAccount || rule.credit);
    if (!key || !debit || !credit) continue;
    conflicts.delete(key);
    exact.set(key, { debit, credit, source: 'confirmed' });
  }

  return { exact, conflicts };
}

export function classifyTransactions(transactions = [], ruleIndex) {
  const ready = [];
  const review = [];

  for (const transaction of transactions) {
    const key = normalizeDescription(transaction.keterangan || transaction.description);
    if (ruleIndex.conflicts.has(key)) {
      review.push({ ...transaction, reason: 'mapping_conflict' });
      continue;
    }

    const rule = ruleIndex.exact.get(key);
    if (!rule) {
      review.push({ ...transaction, reason: 'mapping_missing' });
      continue;
    }

    ready.push({
      ...transaction,
      debitAccount: rule.debit,
      creditAccount: rule.credit,
      mappingSource: rule.source
    });
  }

  return { ready, review };
}

export function buildJournalImportRows(readyTransactions = []) {
  const rows = [];
  for (const [index, item] of readyTransactions.entries()) {
    const ref = item.ref || `AUTO-${String(index + 1).padStart(4, '0')}`;
    const date = String(item.tanggal || item.date || '').slice(0, 10);
    const description = item.keterangan || item.description || ref;
    const nominal = Number(item.nominal || item.amount || 0);
    if (!date || !nominal || !item.debitAccount || !item.creditAccount) continue;
    rows.push([ref, date, description, item.debitAccount, nominal, '', description]);
    rows.push([ref, date, description, item.creditAccount, '', nominal, description]);
  }
  return rows;
}
