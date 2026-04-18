import { getDb, getFirestoreModule } from '../firebase.js';
import { createId } from '../utils/ids.js';
import { nowIso } from '../utils/date.js';
import { sanitizeForFirestore } from '../utils/sanitize.js';

export async function addHistoryLog({ companyId, actor, action, collectionName, documentId, before = null, after = null, metadata = {} }) {
  if (!companyId) throw new Error('companyId wajib diisi untuk audit log.');

  const id = createId('log');
  const db = await getDb();
  const { doc, setDoc } = await getFirestoreModule();
  const payload = sanitizeForFirestore({
    id,
    action,
    actorId: actor?.uid || actor?.id || null,
    actorName: actor?.displayName || actor?.email || null,
    collectionName,
    documentId,
    before,
    after,
    metadata,
    createdAt: nowIso(),
  });

  await setDoc(doc(db, 'companies', companyId, 'auditLogs', id), payload);
  return payload;
}
