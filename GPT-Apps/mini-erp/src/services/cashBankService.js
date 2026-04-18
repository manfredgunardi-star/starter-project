import { getDb, getFirestoreModule, isFirebaseConfigured } from '../firebase.js';
import { nowIso } from '../utils/date.js';
import { createId } from '../utils/ids.js';
import { sanitizeForFirestore } from '../utils/sanitize.js';
import { validateJournalEntry } from './accountingService.js';
import { addHistoryLog } from './auditService.js';

const demoCashBankTransactions = [];

function storageKey(companyId) {
  return `mini-erp:${companyId}:cashBankTransactions`;
}

function journalStorageKey(companyId) {
  return `mini-erp:${companyId}:journalEntries`;
}

function compactTimestamp(value) {
  return value
    .replaceAll('-', '')
    .replaceAll(':', '')
    .replaceAll('.', '')
    .replaceAll('T', '')
    .replaceAll('Z', '');
}

function sortTransactions(items) {
  return [...items].sort((a, b) => {
    const dateCompare = String(b.date || '').localeCompare(String(a.date || ''));
    if (dateCompare !== 0) return dateCompare;
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  });
}

function readLocalTransactions(companyId) {
  if (typeof localStorage === 'undefined') return demoCashBankTransactions;

  const key = storageKey(companyId);
  const raw = localStorage.getItem(key);
  if (raw) return JSON.parse(raw);

  localStorage.setItem(key, JSON.stringify(demoCashBankTransactions));
  return demoCashBankTransactions;
}

function writeLocalTransactions(companyId, items) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(storageKey(companyId), JSON.stringify(sortTransactions(items)));
}

function readLocalJournals(companyId) {
  if (typeof localStorage === 'undefined') return [];
  const raw = localStorage.getItem(journalStorageKey(companyId));
  return raw ? JSON.parse(raw) : [];
}

function writeLocalJournals(companyId, items) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(journalStorageKey(companyId), JSON.stringify(sortTransactions(items)));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('mini-erp:journalEntriesChanged'));
  }
}

function buildJournalFromTransaction({ transaction, actor, timestamp }) {
  const journalId = createId('jrn');
  const amount = Number(transaction.amount || 0);
  const isMoneyIn = transaction.type === 'Masuk';
  const lines = [
    {
      id: createId('line'),
      accountId: transaction.cashAccountId,
      accountCode: transaction.cashAccountCode,
      accountName: transaction.cashAccountName,
      debit: isMoneyIn ? amount : 0,
      credit: isMoneyIn ? 0 : amount,
      description: transaction.description,
      costCenterId: transaction.costCenterId || '',
      costCenterCode: transaction.costCenterCode || '',
      costCenterName: transaction.costCenterName || '',
    },
    {
      id: createId('line'),
      accountId: transaction.counterAccountId,
      accountCode: transaction.counterAccountCode,
      accountName: transaction.counterAccountName,
      debit: isMoneyIn ? 0 : amount,
      credit: isMoneyIn ? amount : 0,
      description: transaction.description,
      costCenterId: transaction.costCenterId || '',
      costCenterCode: transaction.costCenterCode || '',
      costCenterName: transaction.costCenterName || '',
    },
  ];
  const validation = validateJournalEntry({ lines });

  if (!validation.valid) {
    throw new Error(validation.message);
  }

  return sanitizeForFirestore({
    id: journalId,
    journalNumber: `JV-KB-${compactTimestamp(timestamp).slice(0, 14)}`,
    date: transaction.date,
    description: `Kas/Bank ${transaction.type}: ${transaction.description}`,
    status: 'Posted',
    debit: validation.totals.debit,
    credit: validation.totals.credit,
    totalDebit: validation.totals.debit,
    totalCredit: validation.totals.credit,
    lines,
    source: 'cashBank',
    sourceTransactionId: transaction.id,
    isActive: true,
    createdAt: timestamp,
    createdBy: actor.uid,
    updatedAt: timestamp,
    updatedBy: actor.uid,
    postedAt: timestamp,
    postedBy: actor.uid,
  });
}

export function subscribeCashBankTransactions({ companyId, onData, onError }) {
  if (!companyId) {
    onData([]);
    return () => {};
  }

  if (!isFirebaseConfigured) {
    onData(sortTransactions(readLocalTransactions(companyId)));
    return () => {};
  }

  let unsubscribe = () => {};
  let cancelled = false;

  Promise.all([getDb(), getFirestoreModule()])
    .then(([db, firestore]) => {
      if (cancelled) return;
      const ref = firestore.collection(db, 'companies', companyId, 'cashBankTransactions');
      const q = firestore.query(ref, firestore.orderBy('date', 'desc'));

      unsubscribe = firestore.onSnapshot(
        q,
        (snapshot) => {
          onData(snapshot.docs.map((document) => ({ id: document.id, ...document.data() })));
        },
        onError
      );
    })
    .catch(onError);

  return () => {
    cancelled = true;
    unsubscribe();
  };
}

export async function saveCashBankDraft({ companyId, actor, transaction }) {
  const timestamp = nowIso();
  const id = transaction.id || createId('kb');
  const payload = sanitizeForFirestore({
    ...transaction,
    id,
    transactionNumber: transaction.transactionNumber || `KB-DRAFT-${compactTimestamp(timestamp).slice(0, 14)}`,
    amount: Number(transaction.amount || 0),
    status: 'Draft',
    isActive: true,
    createdAt: transaction.createdAt || timestamp,
    createdBy: transaction.createdBy || actor.uid,
    updatedAt: timestamp,
    updatedBy: actor.uid,
  });

  if (payload.amount <= 0) {
    throw new Error('Nominal transaksi wajib lebih dari nol.');
  }

  if (isFirebaseConfigured) {
    const db = await getDb();
    const { doc, setDoc } = await getFirestoreModule();
    await setDoc(doc(db, 'companies', companyId, 'cashBankTransactions', id), payload, { merge: true });
    await addHistoryLog({
      companyId,
      actor,
      action: 'cash_bank_draft_create',
      collectionName: 'cashBankTransactions',
      documentId: id,
      after: payload,
    });
    return payload;
  }

  const items = readLocalTransactions(companyId);
  writeLocalTransactions(companyId, [payload, ...items.filter((item) => item.id !== id)]);
  return payload;
}

export async function postCashBankTransaction({ companyId, actor, transaction }) {
  if (!transaction?.id) {
    throw new Error('Transaksi kas/bank wajib dipilih.');
  }
  if (transaction.status !== 'Draft') {
    throw new Error('Hanya transaksi kas/bank draft yang bisa diposting.');
  }

  const timestamp = nowIso();
  const journal = buildJournalFromTransaction({ transaction, actor, timestamp });
  const postedTransaction = sanitizeForFirestore({
    ...transaction,
    status: 'Posted',
    journalId: journal.id,
    journalNumber: journal.journalNumber,
    postedAt: timestamp,
    postedBy: actor.uid,
    updatedAt: timestamp,
    updatedBy: actor.uid,
  });

  if (isFirebaseConfigured) {
    const db = await getDb();
    const { doc, getDoc, writeBatch } = await getFirestoreModule();
    const transactionRef = doc(db, 'companies', companyId, 'cashBankTransactions', transaction.id);
    const journalRef = doc(db, 'companies', companyId, 'journalEntries', journal.id);
    const snapshot = await getDoc(transactionRef);
    const before = snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
    const batch = writeBatch(db);

    batch.update(transactionRef, postedTransaction);
    batch.set(journalRef, journal);
    await batch.commit();

    await addHistoryLog({
      companyId,
      actor,
      action: 'cash_bank_post',
      collectionName: 'cashBankTransactions',
      documentId: transaction.id,
      before,
      after: { postedTransaction, journal },
    });
    return { postedTransaction, journal };
  }

  const transactions = readLocalTransactions(companyId);
  writeLocalTransactions(
    companyId,
    transactions.map((item) => (item.id === transaction.id ? postedTransaction : item))
  );
  writeLocalJournals(companyId, [journal, ...readLocalJournals(companyId)]);
  return { postedTransaction, journal };
}
