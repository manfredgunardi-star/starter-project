import { getDb, getFirestoreModule } from '../firebase.js';
import { nowIso } from '../utils/date.js';
import { createId } from '../utils/ids.js';
import { sanitizeForFirestore } from '../utils/sanitize.js';
import { addHistoryLog } from './auditService.js';
import { ensureAuthed } from './authService.js';

export async function companyCollection(companyId, collectionName) {
  if (!companyId) throw new Error('companyId wajib diisi.');
  const db = await getDb();
  if (!db) throw new Error('Firebase belum dikonfigurasi.');
  const { collection } = await getFirestoreModule();
  return collection(db, 'companies', companyId, collectionName);
}

export async function companyDocument(companyId, collectionName, id) {
  if (!id) throw new Error('Document id wajib diisi.');
  const { doc } = await getFirestoreModule();
  return doc(await companyCollection(companyId, collectionName), id);
}

export async function upsertItemToFirestore({ companyId, collectionName, data, actor = ensureAuthed() }) {
  if (!data?.id) {
    throw new Error('data.id wajib diisi untuk upsert.');
  }

  const { getDoc, setDoc } = await getFirestoreModule();
  const ref = await companyDocument(companyId, collectionName, data.id);
  const snapshot = await getDoc(ref);
  const existing = snapshot.exists() ? snapshot.data() : null;
  const timestamp = nowIso();
  const payload = sanitizeForFirestore({
    ...data,
    isActive: data.isActive ?? true,
    createdAt: existing?.createdAt || timestamp,
    createdBy: existing?.createdBy || actor.uid,
    updatedAt: timestamp,
    updatedBy: actor.uid,
  });

  await setDoc(ref, payload, { merge: true });
  await addHistoryLog({
    companyId,
    actor,
    action: existing ? 'update' : 'create',
    collectionName,
    documentId: data.id,
    before: existing,
    after: payload,
  });

  return payload;
}

export async function createMasterDataItem({ companyId, collectionName, data, prefix = 'md', actor = ensureAuthed() }) {
  return upsertItemToFirestore({
    companyId,
    collectionName,
    actor,
    data: {
      id: data.id || createId(prefix),
      ...data,
    },
  });
}

export async function softDeleteItemInFirestore({ companyId, collectionName, id, actor = ensureAuthed() }) {
  const { getDoc, updateDoc } = await getFirestoreModule();
  const ref = await companyDocument(companyId, collectionName, id);
  const snapshot = await getDoc(ref);

  if (!snapshot.exists()) {
    throw new Error('Data tidak ditemukan.');
  }

  const before = snapshot.data();
  const payload = sanitizeForFirestore({
    isActive: false,
    deletedAt: nowIso(),
    deletedBy: actor.uid,
    updatedAt: nowIso(),
    updatedBy: actor.uid,
  });

  await updateDoc(ref, payload);
  await addHistoryLog({
    companyId,
    actor,
    action: 'soft_delete',
    collectionName,
    documentId: id,
    before,
    after: { ...before, ...payload },
  });
}

export async function restoreItemInFirestore({ companyId, collectionName, id, actor = ensureAuthed() }) {
  const { getDoc, updateDoc } = await getFirestoreModule();
  const ref = await companyDocument(companyId, collectionName, id);
  const snapshot = await getDoc(ref);

  if (!snapshot.exists()) {
    throw new Error('Data tidak ditemukan.');
  }

  const before = snapshot.data();
  const payload = sanitizeForFirestore({
    isActive: true,
    deletedAt: null,
    deletedBy: null,
    updatedAt: nowIso(),
    updatedBy: actor.uid,
  });

  await updateDoc(ref, payload);
  await addHistoryLog({
    companyId,
    actor,
    action: 'restore',
    collectionName,
    documentId: id,
    before,
    after: { ...before, ...payload },
  });
}
