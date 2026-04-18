import { getDb, getFirestoreModule } from '../firebase.js';
import { nowIso } from '../utils/date.js';
import { sanitizeForFirestore } from '../utils/sanitize.js';

export const demoCompany = {
  id: 'company-demo',
  name: 'Demo Company',
  role: 'owner',
};

export async function createCompany({ company, actor }) {
  if (!company?.id) throw new Error('company.id wajib diisi.');

  const timestamp = nowIso();
  const db = await getDb();
  const { doc, setDoc } = await getFirestoreModule();
  const payload = sanitizeForFirestore({
    ...company,
    isActive: true,
    createdAt: timestamp,
    createdBy: actor.uid,
    updatedAt: timestamp,
    updatedBy: actor.uid,
  });

  await setDoc(doc(db, 'companies', company.id), payload);
  await setDoc(doc(db, 'companies', company.id, 'members', actor.uid), {
    userId: actor.uid,
    role: 'owner',
    isActive: true,
    createdAt: timestamp,
    createdBy: actor.uid,
  });

  return payload;
}

export async function getCompany(companyId) {
  const db = await getDb();
  const { doc, getDoc } = await getFirestoreModule();
  const snapshot = await getDoc(doc(db, 'companies', companyId));
  return snapshot.exists() ? snapshot.data() : null;
}

export async function subscribeCompanyMemberships({ userId, onData, onError }) {
  if (!userId) {
    onData([]);
    return () => {};
  }

  let unsubscribe = () => {};
  let cancelled = false;

  try {
    const db = await getDb();
    const firestore = await getFirestoreModule();
    const q = firestore.query(
      firestore.collectionGroup(db, 'members'),
      firestore.where('userId', '==', userId),
      firestore.where('isActive', '==', true)
    );

    unsubscribe = firestore.onSnapshot(
      q,
      async (snapshot) => {
        try {
          const memberships = await Promise.all(
            snapshot.docs.map(async (memberDoc) => {
              const companyRef = memberDoc.ref.parent.parent;
              const companySnapshot = companyRef ? await firestore.getDoc(companyRef) : null;
              const company = companySnapshot?.exists() ? companySnapshot.data() : {};
              const member = memberDoc.data();

              return {
                id: companyRef?.id || member.companyId,
                name: company.name || member.companyName || companyRef?.id || 'Company',
                role: member.role || 'reader',
                permissions: member.permissions || [],
                isActive: member.isActive !== false,
              };
            })
          );

          if (!cancelled) onData(memberships);
        } catch (error) {
          onError?.(error);
        }
      },
      onError
    );
  } catch (error) {
    onError?.(error);
  }

  return () => {
    cancelled = true;
    unsubscribe();
  };
}
