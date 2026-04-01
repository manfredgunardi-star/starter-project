import { initializeApp, getApps } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence, signInWithEmailAndPassword } from 'firebase/auth';
import { initializeFirestore, getFirestore, CACHE_SIZE_UNLIMITED } from 'firebase/firestore';

// Firebase config is injected via Vite env so this repo can be safely reused across projects.
// How to set:
// 1) Create a Web App in Firebase Console → Project settings → Your apps → Web app
// 2) Copy the config values into a .env file (see DEPLOYMENT_GUIDE.md)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Minimal guard to surface misconfig early
if (!firebaseConfig.projectId) {
  console.error(
    "[firebase-config] Missing VITE_FIREBASE_PROJECT_ID. Please create .env and rebuild before deploy."
  );
}

console.log("🔥 firebaseConfig projectId:", firebaseConfig.projectId);

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
// pada jaringan/firewall yang memblokir HTTP/3 (QUIC). Secara otomatis fallback ke
// long-polling jika QUIC gagal, sehingga operasi read/write Firestore tetap berjalan normal.
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
  useFetchStreams: false,
});

// NOTE: Offline persistence is intentionally disabled to ensure the app always reflects
// the latest data from Firestore after configuration changes.

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

// =============================================================
// Secondary Firebase App — bul-accounting (untuk integration bridge)
// =============================================================
const BRIDGE_APP_NAME = 'bul-accounting-bridge';

const accountingConfig = {
  apiKey: "AIzaSyAAV179nxAUpMcx8LEti83kxVWdc4fXVuA",
  authDomain: "bul-accounting.firebaseapp.com",
  projectId: "bul-accounting",
  storageBucket: "bul-accounting.firebasestorage.app",
  messagingSenderId: "657310894760",
  appId: "1:657310894760:web:e7225601052f04e556d09d",
};

const existingBridgeApp = getApps().find(a => a.name === BRIDGE_APP_NAME);
const accountingApp = existingBridgeApp || initializeApp(accountingConfig, BRIDGE_APP_NAME);

export const dbAccounting = getFirestore(accountingApp);
export const authAccounting = getAuth(accountingApp);

// Login ke bul-accounting menggunakan bridge service account.
// Dipanggil sekali saat app dimuat; token diperbarui otomatis oleh Firebase SDK.
export async function initBridgeAuth() {
  const email = import.meta.env.VITE_ACCOUNTING_BRIDGE_EMAIL;
  const password = import.meta.env.VITE_ACCOUNTING_BRIDGE_PASSWORD;

  if (!email || !password || password === 'ISI_PASSWORD_DI_SINI') {
    console.warn('[bridge-auth] VITE_ACCOUNTING_BRIDGE_PASSWORD belum diisi di .env — integrasi ke accounting dinonaktifkan.');
    return false;
  }

  try {
    if (!authAccounting.currentUser) {
      await signInWithEmailAndPassword(authAccounting, email, password);
    }
    console.log('[bridge-auth] Login ke bul-accounting berhasil.');
    return true;
  } catch (err) {
    console.error('[bridge-auth] Gagal login ke bul-accounting:', err.message);
    return false;
  }
}

// =============================================================
// Secondary Firebase App — untuk membuat user baru tanpa logout
// Menggunakan config yang SAMA (bul-monitor project)
// createUserWithEmailAndPassword di secondary app tidak mempengaruhi main auth session
// =============================================================
const USER_CREATOR_APP_NAME = 'bul-monitor-user-creator';
const existingCreatorApp = getApps().find(a => a.name === USER_CREATOR_APP_NAME);
const userCreatorApp = existingCreatorApp || initializeApp(firebaseConfig, USER_CREATOR_APP_NAME);
export const authUserCreator = getAuth(userCreatorApp);

