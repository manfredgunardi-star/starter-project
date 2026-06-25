import { getDb, getFirestoreModule, isFirebaseConfigured } from '../firebase.js';
import { isSupabaseConfigured } from '../supabase.js';
import { nowIso } from '../utils/date.js';
import { sanitizeForFirestore } from '../utils/sanitize.js';
import { addHistoryLog } from './auditService.js';
import {
  fetchSupabasePeriodLocks,
  lockSupabaseAccountingPeriod,
  unlockSupabaseAccountingPeriod,
} from './supabaseErpService.js';

const demoPeriodLocks = [];

function storageKey(companyId) {
  return `mini-erp:${companyId}:periodLocks`;
}

function periodFromDate(date) {
  return String(date || '').slice(0, 7);
}

function sortLocks(items) {
  return [...items].sort((a, b) => String(b.period || '').localeCompare(String(a.period || '')));
}

function readLocalLocks(companyId) {
  if (typeof localStorage === 'undefined') return demoPeriodLocks;

  const key = storageKey(companyId);
  const raw = localStorage.getItem(key);
  if (raw) return JSON.parse(raw);

  localStorage.setItem(key, JSON.stringify(demoPeriodLocks));
  return demoPeriodLocks;
}

function writeLocalLocks(companyId, items) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(storageKey(companyId), JSON.stringify(sortLocks(items)));
}

export function isDateLockedByPeriodLocks(date, locks) {
  const period = periodFromDate(date);
  if (!period) return false;
  return locks.some((lock) => lock.period === period && lock.status === 'Locked' && lock.isActive !== false);
}

export async function assertDateNotLocked({ companyId, date }) {
  const period = periodFromDate(date);
  if (!period) return;

  if (isSupabaseConfigured) {
    const locks = await fetchSupabasePeriodLocks({ companyId });
    if (isDateLockedByPeriodLocks(date, locks)) {
      throw new Error(`Periode ${period} terkunci. Posting, void, dan reversal tidak diizinkan.`);
    }
    return;
  }

  if (!isFirebaseConfigured) {
    if (isDateLockedByPeriodLocks(date, readLocalLocks(companyId))) {
      throw new Error(`Periode ${period} terkunci. Posting, void, dan reversal tidak diizinkan.`);
    }
    return;
  }

  const db = await getDb();
  const { doc, getDoc } = await getFirestoreModule();
  const ref = doc(db, 'companies', companyId, 'periodLocks', period);
  const snapshot = await getDoc(ref);
  const lock = snapshot.exists() ? snapshot.data() : null;

  if (lock?.status === 'Locked' && lock?.isActive !== false) {
    throw new Error(`Periode ${period} terkunci. Posting, void, dan reversal tidak diizinkan.`);
  }
}

export function subscribePeriodLocks({ companyId, onData, onError }) {
  if (!companyId) {
    onData([]);
    return () => {};
  }

  if (isSupabaseConfigured) {
    fetchSupabasePeriodLocks({ companyId })
      .then(onData)
      .catch(onError);
    return () => {};
  }

  if (!isFirebaseConfigured) {
    onData(sortLocks(readLocalLocks(companyId)));
    return () => {};
  }

  let unsubscribe = () => {};
  let cancelled = false;

  Promise.all([getDb(), getFirestoreModule()])
    .then(([db, firestore]) => {
      if (cancelled) return;
      const ref = firestore.collection(db, 'companies', companyId, 'periodLocks');
      const q = firestore.query(ref, firestore.orderBy('period', 'desc'));

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

export async function lockAccountingPeriod({ companyId, actor, period, note = '' }) {
  if (isSupabaseConfigured) {
    return lockSupabaseAccountingPeriod({ companyId, period, note });
  }

  const timestamp = nowIso();
  const payload = sanitizeForFirestore({
    id: period,
    period,
    status: 'Locked',
    note,
    isActive: true,
    lockedAt: timestamp,
    lockedBy: actor.uid,
    updatedAt: timestamp,
    updatedBy: actor.uid,
  });

  if (isFirebaseConfigured) {
    const db = await getDb();
    const { doc, setDoc } = await getFirestoreModule();
    await setDoc(doc(db, 'companies', companyId, 'periodLocks', period), payload, { merge: true });
    await addHistoryLog({
      companyId,
      actor,
      action: 'period_lock',
      collectionName: 'periodLocks',
      documentId: period,
      after: payload,
    });
    return payload;
  }

  const items = readLocalLocks(companyId);
  writeLocalLocks(companyId, [payload, ...items.filter((item) => item.period !== period)]);
  await addHistoryLog({
    companyId,
    actor,
    action: 'period_lock',
    collectionName: 'periodLocks',
    documentId: period,
    after: payload,
  });
  return payload;
}

export async function unlockAccountingPeriod({ companyId, actor, period }) {
  if (isSupabaseConfigured) {
    return unlockSupabaseAccountingPeriod({ companyId, period });
  }

  const timestamp = nowIso();
  const payload = sanitizeForFirestore({
    status: 'Unlocked',
    unlockedAt: timestamp,
    unlockedBy: actor.uid,
    updatedAt: timestamp,
    updatedBy: actor.uid,
  });

  if (isFirebaseConfigured) {
    const db = await getDb();
    const { doc, updateDoc } = await getFirestoreModule();
    await updateDoc(doc(db, 'companies', companyId, 'periodLocks', period), payload);
    await addHistoryLog({
      companyId,
      actor,
      action: 'period_unlock',
      collectionName: 'periodLocks',
      documentId: period,
      after: payload,
    });
    return { id: period, period, ...payload };
  }

  const items = readLocalLocks(companyId);
  const nextItems = items.map((item) => (item.period === period ? { ...item, ...payload } : item));
  writeLocalLocks(companyId, nextItems);
  await addHistoryLog({
    companyId,
    actor,
    action: 'period_unlock',
    collectionName: 'periodLocks',
    documentId: period,
    after: payload,
  });
  return { id: period, period, ...payload };
}
