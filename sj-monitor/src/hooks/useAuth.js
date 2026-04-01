// src/hooks/useAuth.js
import { useState, useEffect, useRef } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../config/firebase-config';
import { generateSessionId } from '../utils/session.js';

export const useAuth = () => {
  const [currentUser, setCurrentUser] = useState(null);
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [alertMessage, setAlertMessage] = useState('');
  const activeSessionIdRef = useRef(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => { isMountedRef.current = false; };
  }, []);

  useEffect(() => {
    let unsubUser = null;

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (typeof unsubUser === 'function') {
        try { unsubUser(); } catch (_) {}
        unsubUser = null;
      }

      setFirebaseUser(user || null);

      if (!user) {
        setCurrentUser(null);
        activeSessionIdRef.current = null;
        setAuthReady(true);
        setIsLoading(false);
        return;
      }

      try {
        const userRef = doc(db, 'users', user.uid);
        const snap = await getDoc(userRef);

        if (!snap.exists()) {
          const email = user.email || '';
          const username = email.includes('@') ? email.split('@')[0] : (user.displayName || 'user');
          await setDoc(userRef, {
            username,
            name: user.displayName || username,
            email,
            role: 'reader',
            isActive: true,
            createdAt: new Date().toISOString(),
            createdBy: 'self-bootstrap',
          }, { merge: true });
        }

        const sessionId = generateSessionId();
        activeSessionIdRef.current = sessionId;
        await setDoc(userRef, {
          activeSessionId: sessionId,
          activeSessionAt: new Date().toISOString(),
          activeSessionUA: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        }, { merge: true });

        unsubUser = onSnapshot(doc(db, 'users', user.uid), (d) => {
          if (!isMountedRef.current) return;
          const data = d.data() || {};

          const activeId = data.activeSessionId;
          if (activeId && activeSessionIdRef.current && activeId !== activeSessionIdRef.current) {
            if (isMountedRef.current) setAlertMessage('Sesi Anda berakhir karena akun ini login di perangkat lain.');
            activeSessionIdRef.current = null;
            signOut(auth).catch(() => {});
            return;
          }

          if (data.isActive === false) {
            if (isMountedRef.current) setAlertMessage('Akun Anda dinonaktifkan. Hubungi administrator.');
            signOut(auth).catch(() => {});
            return;
          }

          if (isMountedRef.current) {
            setCurrentUser({
              id: user.uid,
              username: data.username || (user.email ? user.email.split('@')[0] : ''),
              name: data.name || user.displayName || data.username || 'User',
              role: data.role || 'reader',
              email: user.email || data.email || '',
              isActive: data.isActive !== false,
            });
          }
        });

        if (isMountedRef.current) {
          setAlertMessage('');
          setAuthReady(true);
          setIsLoading(false);
        }
      } catch (err) {
        console.error('Auth bootstrap error:', err);
        if (isMountedRef.current) {
          setAlertMessage(`Auth error: ${err?.message || 'Unknown error'}`);
          setCurrentUser(null);
          setAuthReady(true);
          setIsLoading(false);
        }
      }
    });

    return () => {
      try { if (typeof unsubUser === 'function') unsubUser(); } catch (_) {}
      unsubAuth();
    };
  }, []);

  const handleLogin = async (username, password) => {
    try {
      const u = (username || '').trim();
      const p = (password || '').trim();
      if (!u || !p) {
        setAlertMessage('Username/Email dan Password wajib diisi.');
        return;
      }
      const email = u.includes('@') ? u : `${u}@app.local`;
      await signInWithEmailAndPassword(auth, email, p);
      setAlertMessage('');
    } catch (err) {
      const code = err?.code || '';
      if (code.includes('auth/invalid-credential') || code.includes('auth/wrong-password')) {
        setAlertMessage('Login gagal: password salah / akun tidak ditemukan.');
      } else if (code.includes('auth/user-disabled')) {
        setAlertMessage('Login gagal: akun dinonaktifkan.');
      } else {
        setAlertMessage(`Login gagal: ${err?.message || 'Unknown error'}`);
      }
    }
  };

  const handleLogout = async () => {
    try { await signOut(auth); } catch (err) { console.error('Logout error:', err); }
    finally {
      setCurrentUser(null);
      setFirebaseUser(null);
    }
  };

  return {
    currentUser,
    firebaseUser,
    authReady,
    isLoading,
    alertMessage,
    setAlertMessage,
    handleLogin,
    handleLogout,
  };
};
