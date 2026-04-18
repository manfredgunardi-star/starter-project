import { getDb, getFirestoreModule, isFirebaseConfigured } from '../firebase.js';
import { nowIso } from '../utils/date.js';
import { createId } from '../utils/ids.js';
import { sanitizeForFirestore } from '../utils/sanitize.js';
import { validateJournalEntry } from './accountingService.js';
import { addHistoryLog } from './auditService.js';

const demoJournalEntries = [
  {
    id: 'jrn-001',
    journalNumber: 'JV-2026-0001',
    date: '2026-04-17',
    description: 'Saldo awal kas',
    debit: 25000000,
    credit: 25000000,
    totalDebit: 25000000,
    totalCredit: 25000000,
    status: 'Draft',
    lines: [
      { id: 'line-demo-1', accountId: 'coa-1100', accountCode: '1-1000', accountName: 'Kas', debit: 25000000, credit: 0 },
      { id: 'line-demo-2', accountId: 'coa-3100', accountCode: '3-1000', accountName: 'Modal', debit: 0, credit: 25000000 },
    ],
    isActive: true,
    createdAt: '2026-04-17T00:00:00.000Z',
    createdBy: 'demo-user',
    updatedAt: '2026-04-17T00:00:00.000Z',
    updatedBy: 'demo-user',
  },
  {
    id: 'jrn-002',
    journalNumber: 'JV-2026-0002',
    date: '2026-04-17',
    description: 'Setoran modal awal',
    debit: 50000000,
    credit: 50000000,
    totalDebit: 50000000,
    totalCredit: 50000000,
    status: 'Posted',
    lines: [
      { id: 'line-demo-3', accountId: 'coa-1200', accountCode: '1-2000', accountName: 'Bank', debit: 50000000, credit: 0 },
      { id: 'line-demo-4', accountId: 'coa-3100', accountCode: '3-1000', accountName: 'Modal', debit: 0, credit: 50000000 },
    ],
    isActive: true,
    createdAt: '2026-04-17T00:00:00.000Z',
    createdBy: 'demo-user',
    updatedAt: '2026-04-17T00:00:00.000Z',
    updatedBy: 'demo-user',
    postedAt: '2026-04-17T00:00:00.000Z',
    postedBy: 'demo-user',
  },
];

function storageKey(companyId) {
  return `mini-erp:${companyId}:journalEntries`;
}

function sortJournalEntries(items) {
  return [...items].sort((a, b) => {
    const dateCompare = String(b.date || '').localeCompare(String(a.date || ''));
    if (dateCompare !== 0) return dateCompare;
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  });
}

function compactTimestamp(value) {
  return value
    .replaceAll('-', '')
    .replaceAll(':', '')
    .replaceAll('.', '')
    .replaceAll('T', '')
    .replaceAll('Z', '');
}

function readLocalJournalEntries(companyId) {
  if (typeof localStorage === 'undefined') return demoJournalEntries;

  const key = storageKey(companyId);
  const raw = localStorage.getItem(key);
  if (raw) return JSON.parse(raw);

  localStorage.setItem(key, JSON.stringify(demoJournalEntries));
  return demoJournalEntries;
}

function writeLocalJournalEntries(companyId, items) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(storageKey(companyId), JSON.stringify(sortJournalEntries(items)));
}

export function subscribeJournalEntries({ companyId, onData, onError }) {
  if (!companyId) {
    onData([]);
    return () => {};
  }

  if (!isFirebaseConfigured) {
    onData(sortJournalEntries(readLocalJournalEntries(companyId)));
    return () => {};
  }

  let unsubscribe = () => {};
  let cancelled = false;

  Promise.all([getDb(), getFirestoreModule()])
    .then(([db, firestore]) => {
      if (cancelled) return;
      const ref = firestore.collection(db, 'companies', companyId, 'journalEntries');
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

export async function saveJournalDraft({ companyId, actor, journal, totals }) {
  const timestamp = nowIso();
  const id = journal.id || createId('jrn');
  const payload = sanitizeForFirestore({
    id,
    journalNumber: journal.journalNumber || `JV-DRAFT-${compactTimestamp(timestamp).slice(0, 14)}`,
    date: journal.date,
    description: journal.description,
    status: 'Draft',
    debit: totals.debit,
    credit: totals.credit,
    totalDebit: totals.debit,
    totalCredit: totals.credit,
    lines: journal.lines.map((line) => ({
      ...line,
      id: line.id || createId('line'),
      debit: Number(line.debit || 0),
      credit: Number(line.credit || 0),
    })),
    isActive: true,
    createdAt: journal.createdAt || timestamp,
    createdBy: journal.createdBy || actor.uid,
    updatedAt: timestamp,
    updatedBy: actor.uid,
  });

  if (isFirebaseConfigured) {
    const db = await getDb();
    const { doc, setDoc } = await getFirestoreModule();
    await setDoc(doc(db, 'companies', companyId, 'journalEntries', id), payload, { merge: true });
    await addHistoryLog({
      companyId,
      actor,
      action: 'journal_draft_create',
      collectionName: 'journalEntries',
      documentId: id,
      after: payload,
    });
    return payload;
  }

  const items = readLocalJournalEntries(companyId);
  writeLocalJournalEntries(companyId, [payload, ...items.filter((item) => item.id !== id)]);
  return payload;
}

export async function postJournalEntry({ companyId, actor, journal }) {
  if (!journal?.id) {
    throw new Error('Journal id wajib diisi.');
  }
  if (journal.status !== 'Draft') {
    throw new Error('Hanya jurnal draft yang bisa diposting.');
  }

  const validation = validateJournalEntry({ lines: journal.lines || [] });
  if (!validation.valid) {
    throw new Error(validation.message);
  }

  const timestamp = nowIso();
  const payload = sanitizeForFirestore({
    ...journal,
    status: 'Posted',
    postedAt: timestamp,
    postedBy: actor.uid,
    updatedAt: timestamp,
    updatedBy: actor.uid,
    debit: validation.totals.debit,
    credit: validation.totals.credit,
    totalDebit: validation.totals.debit,
    totalCredit: validation.totals.credit,
  });

  if (isFirebaseConfigured) {
    const db = await getDb();
    const { doc, getDoc, updateDoc } = await getFirestoreModule();
    const ref = doc(db, 'companies', companyId, 'journalEntries', journal.id);
    const snapshot = await getDoc(ref);
    const before = snapshot.exists() ? snapshot.data() : null;

    await updateDoc(ref, payload);
    await addHistoryLog({
      companyId,
      actor,
      action: 'journal_post',
      collectionName: 'journalEntries',
      documentId: journal.id,
      before,
      after: payload,
    });
    return payload;
  }

  const items = readLocalJournalEntries(companyId);
  writeLocalJournalEntries(
    companyId,
    items.map((item) => (item.id === journal.id ? payload : item))
  );
  return payload;
}

export async function voidJournalWithReversal({ companyId, actor, journal, reason = 'Void journal dari UI accounting.' }) {
  if (!journal?.id) {
    throw new Error('Journal id wajib diisi.');
  }
  if (journal.status !== 'Posted') {
    throw new Error('Hanya jurnal posted yang bisa dibuat reversal.');
  }
  if (journal.reversalJournalId || journal.voidedAt) {
    throw new Error('Jurnal ini sudah memiliki reversal.');
  }

  const timestamp = nowIso();
  const reversalId = createId('jrn');
  const reversalLines = (journal.lines || []).map((line) => ({
    ...line,
    id: createId('line'),
    debit: Number(line.credit || 0),
    credit: Number(line.debit || 0),
    description: line.description ? `Reversal - ${line.description}` : 'Reversal line',
  }));
  const validation = validateJournalEntry({ lines: reversalLines });

  if (!validation.valid) {
    throw new Error(validation.message);
  }

  const voidedJournal = sanitizeForFirestore({
    ...journal,
    status: 'Void',
    voidedAt: timestamp,
    voidedBy: actor.uid,
    voidReason: reason,
    reversalJournalId: reversalId,
    updatedAt: timestamp,
    updatedBy: actor.uid,
  });
  const reversalJournal = sanitizeForFirestore({
    id: reversalId,
    journalNumber: `JV-REV-${compactTimestamp(timestamp).slice(0, 14)}`,
    date: timestamp.slice(0, 10),
    description: `Reversal: ${journal.description}`,
    status: 'Posted',
    debit: validation.totals.debit,
    credit: validation.totals.credit,
    totalDebit: validation.totals.debit,
    totalCredit: validation.totals.credit,
    lines: reversalLines,
    reversalOf: journal.id,
    sourceJournalNumber: journal.journalNumber,
    voidReason: reason,
    isActive: true,
    createdAt: timestamp,
    createdBy: actor.uid,
    updatedAt: timestamp,
    updatedBy: actor.uid,
    postedAt: timestamp,
    postedBy: actor.uid,
  });

  if (isFirebaseConfigured) {
    const db = await getDb();
    const { doc, getDoc, writeBatch } = await getFirestoreModule();
    const journalRef = doc(db, 'companies', companyId, 'journalEntries', journal.id);
    const reversalRef = doc(db, 'companies', companyId, 'journalEntries', reversalId);
    const snapshot = await getDoc(journalRef);
    const before = snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
    const batch = writeBatch(db);

    batch.update(journalRef, voidedJournal);
    batch.set(reversalRef, reversalJournal);
    await batch.commit();

    await addHistoryLog({
      companyId,
      actor,
      action: 'journal_void_reversal',
      collectionName: 'journalEntries',
      documentId: journal.id,
      before,
      after: { voidedJournal, reversalJournal },
    });
    return { voidedJournal, reversalJournal };
  }

  const items = readLocalJournalEntries(companyId);
  writeLocalJournalEntries(
    companyId,
    [reversalJournal, ...items.map((item) => (item.id === journal.id ? voidedJournal : item))]
  );
  return { voidedJournal, reversalJournal };
}
