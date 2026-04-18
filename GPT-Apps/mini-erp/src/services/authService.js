import { getAuthModule, getCachedAuth, getFirebaseServices, isFirebaseConfigured } from '../firebase.js';

export function ensureAuthed() {
  const user = getCachedAuth()?.currentUser;

  if (!user) {
    throw new Error('User belum login.');
  }

  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName || user.email || user.uid,
  };
}

export async function subscribeAuthState(onChange, onError) {
  if (!isFirebaseConfigured) {
    onChange(null);
    return () => {};
  }

  try {
    const [{ auth }, { onAuthStateChanged }] = await Promise.all([getFirebaseServices(), getAuthModule()]);
    return onAuthStateChanged(auth, onChange, onError);
  } catch (error) {
    onError?.(error);
    return () => {};
  }
}

export async function signInWithEmailPassword(email, password) {
  const [{ auth }, { signInWithEmailAndPassword }] = await Promise.all([getFirebaseServices(), getAuthModule()]);
  return signInWithEmailAndPassword(auth, email, password);
}

export async function signOutCurrentUser() {
  const [{ auth }, { signOut }] = await Promise.all([getFirebaseServices(), getAuthModule()]);
  return signOut(auth);
}
