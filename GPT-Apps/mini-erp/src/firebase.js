const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.appId
);

let cachedServices = null;
let servicesPromise = null;
let authModulePromise = null;
let firestoreModulePromise = null;

export function getCachedAuth() {
  return cachedServices?.auth || null;
}

export async function getFirestoreModule() {
  if (!firestoreModulePromise) {
    firestoreModulePromise = import('firebase/firestore');
  }

  return firestoreModulePromise;
}

export async function getAuthModule() {
  if (!authModulePromise) {
    authModulePromise = import('firebase/auth');
  }

  return authModulePromise;
}

export async function getFirebaseServices() {
  if (!isFirebaseConfigured) {
    return { firebaseApp: null, auth: null, db: null };
  }

  if (cachedServices) {
    return cachedServices;
  }

  if (!servicesPromise) {
    servicesPromise = Promise.all([
      import('firebase/app'),
      getAuthModule(),
      getFirestoreModule(),
    ]).then(([appModule, authModule, firestoreModule]) => {
      const firebaseApp = appModule.initializeApp(firebaseConfig);
      const auth = authModule.getAuth(firebaseApp);
      const db = firestoreModule.initializeFirestore(firebaseApp, {
        experimentalAutoDetectLongPolling: true,
        localCache: firestoreModule.persistentLocalCache({
          tabManager: firestoreModule.persistentMultipleTabManager(),
        }),
      });

      cachedServices = { firebaseApp, auth, db };
      return cachedServices;
    });
  }

  return servicesPromise;
}

export async function getDb() {
  const { db } = await getFirebaseServices();
  return db;
}
