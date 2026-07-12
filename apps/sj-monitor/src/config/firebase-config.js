import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence, connectAuthEmulator } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator } from 'firebase/firestore';
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
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

// ─── Firebase Local Emulator (Development Only) ────────────────────────────
// Aktifkan dengan menambahkan VITE_USE_EMULATOR=true di file .env.local
// Lalu jalankan: npm run emulator  (di terminal terpisah)
// Kemudian:      npm run dev
//
// Emulator berjalan di localhost — 0 write ke production Firestore.
// ⚠️  Emulator butuh Java 11+. Install dari: https://adoptium.net/
// Emulator HANYA aktif saat MODE === 'development' (npm run dev).
//   MODE='development' → npm run dev          ✅ emulator boleh aktif
//   MODE='test'        → npm test (vitest)    ❌ emulator off (mock-friendly)
//   MODE='staging'     → npm run build:staging ❌ emulator off
//   MODE='production'  → npm run build         ❌ emulator off
// Dengan ini, .env.local boleh berisi VITE_USE_EMULATOR=true tanpa merusak
// build produksi/staging maupun test suite.
const USE_EMULATOR = import.meta.env.VITE_USE_EMULATOR === 'true' && import.meta.env.MODE === 'development';

if (USE_EMULATOR) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: false });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  console.info('[firebase-config] 🧪 Emulator mode aktif — Firestore & Auth → localhost');
}

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

