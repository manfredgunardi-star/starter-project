import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

// Firebase config dibaca dari environment variables (.env)
// Salin .env.example → .env lalu isi dengan nilai dari Firebase Console
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Auth
export const auth = getAuth(app);

// Pastikan sesi login tidak mudah hilang (terutama setelah hard refresh / incognito)
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn('[firebase-config] setPersistence failed:', err);
});

// Initialize Firestore
// experimentalAutoDetectLongPolling: true → mencegah ERR_QUIC_PROTOCOL_ERROR / QUIC_PEER_GOING_AWAY
// pada jaringan/ISP yang memblokir HTTP/3 (QUIC). Auto-fallback ke long-polling jika QUIC gagal.
// enableIndexedDbPersistence dihapus: API ini deprecated di Firebase 9+ modular SDK dan
// menyebabkan BloomFilterError warning serta konflik multi-tab.
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
  useFetchStreams: false,
});

/**
 * Helper: pastikan user authenticated sebelum operasi write.
 * Jika auth.currentUser null, Firestore akan balas "Missing or insufficient permissions".
 */
export const ensureAuthed = async () => {
  const u = auth.currentUser;
  if (!u) {
    const e = new Error('NOT_AUTHENTICATED');
    e.code = 'NOT_AUTHENTICATED';
    throw e;
  }
  await u.getIdToken();
  return u;
};

export default app;
export const firebaseProjectId = firebaseConfig.projectId;

// Initialize Functions
export const functions = getFunctions(app);
export const createUserWithRoleFn = httpsCallable(functions, 'createUserWithRole');
export const setUserRoleFn = httpsCallable(functions, 'setUserRole');

