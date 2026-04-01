// src/hooks/useSettings.js
import { useState, useEffect, useRef } from 'react';
import { doc, onSnapshot, setDoc, writeBatch } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { auth, db, ensureAuthed } from '../config/firebase-config.js';
import { sanitizeForFirestore } from '../firestoreService.js';

export const useSettings = ({ currentUser, setAlertMessage, onForcedLogout }) => {
  const [appSettings, setAppSettings] = useState({
    companyName: '',
    logoUrl: '',
    loginFooterText: 'Masuk untuk mengakses dashboard monitoring',
  });
  const [forceLogoutConfig, setForceLogoutConfig] = useState(null);
  const [forceLogoutBanner, setForceLogoutBanner] = useState(null);

  const shownWarningThresholdsRef = useRef(new Set());
  const prevForceLogoutScheduledAtRef = useRef(null);
  const forceLogoutExecutedRef = useRef(false);

  // App settings subscription
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'settings', 'app'),
      (snap) => {
        const data = snap.exists() ? (snap.data() || {}) : null;
        if (data) setAppSettings(data);
      },
      (err) => { console.warn('Failed to fetch settings/app:', err); }
    );
    return () => { try { unsub(); } catch {} };
  }, []);

  // Force logout config subscription
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'settings', 'forceLogout'),
      (snap) => {
        const data = snap.exists() ? (snap.data() || {}) : null;
        const newScheduledAt = data?.scheduledAt ?? null;
        if (newScheduledAt !== prevForceLogoutScheduledAtRef.current) {
          prevForceLogoutScheduledAtRef.current = newScheduledAt;
          shownWarningThresholdsRef.current = new Set();
          setForceLogoutBanner(null);
          forceLogoutExecutedRef.current = false;
        }
        if (!data?.enabled) {
          setForceLogoutBanner(null);
          shownWarningThresholdsRef.current = new Set();
        }
        setForceLogoutConfig(data);
      },
      (err) => { console.warn('Failed to fetch settings/forceLogout:', err); }
    );
    return () => { try { unsub(); } catch {} };
  }, []);

  // Force logout timer
  useEffect(() => {
    if (!currentUser || !forceLogoutConfig?.enabled || !forceLogoutConfig?.scheduledAt) return;

    const tick = () => {
      const diffMs = new Date(forceLogoutConfig.scheduledAt).getTime() - Date.now();
      const diffMin = diffMs / 60000;

      if (diffMs <= 0) {
        if (currentUser.role !== 'superadmin') {
          executeForcedLogout();
        }
        return;
      }

      for (const threshold of [20, 15, 10, 5]) {
        if (diffMin <= threshold && !shownWarningThresholdsRef.current.has(threshold)) {
          shownWarningThresholdsRef.current.add(threshold);
          const scheduledAtLocal = new Date(forceLogoutConfig.scheduledAt)
            .toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });
          setForceLogoutBanner({
            minutesRemaining: Math.ceil(diffMin),
            reason: forceLogoutConfig.reason || '',
            scheduledAtLocal,
          });
          break;
        }
      }
    };

    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [forceLogoutConfig, currentUser]);

  const executeForcedLogout = async () => {
    if (forceLogoutExecutedRef.current) return;
    forceLogoutExecutedRef.current = true;
    setForceLogoutBanner(null);
    try {
      await setDoc(doc(db, 'settings', 'forceLogout'),
        { executedAt: new Date().toISOString() }, { merge: true });
    } catch (_) {}
    signOut(auth).catch(() => {});
    if (typeof onForcedLogout === 'function') onForcedLogout();
  };

  const updateSettings = async (newSettings, who) => {
    const payload = {
      ...(newSettings || {}),
      updatedAt: new Date().toISOString(),
      updatedBy: who || 'system',
    };
    setAppSettings(payload);
    try {
      await ensureAuthed();
      const batch = writeBatch(db);
      batch.set(doc(db, 'settings', 'app'), sanitizeForFirestore(payload), { merge: true });
      await batch.commit();
    } catch (e) {
      console.error('updateSettings -> Firestore failed', e);
      if (e?.code === 'NOT_AUTHENTICATED') {
        setAlertMessage('Sesi login Firebase tidak terdeteksi. Silakan Logout lalu Login lagi, kemudian coba simpan ulang.');
      } else {
        setAlertMessage('Gagal menyimpan settings ke Firebase. Settings tersimpan di cache lokal.');
      }
    }
  };

  const updateForceLogoutConfig = async (config, who) => {
    const payload = sanitizeForFirestore({
      enabled: config.enabled ?? false,
      scheduledAt: config.enabled ? (config.scheduledAt || null) : null,
      reason: config.reason || '',
      updatedAt: new Date().toISOString(),
      updatedBy: who || 'superadmin',
      executedAt: config.executedAt ?? null,
    });
    try {
      await ensureAuthed();
      await setDoc(doc(db, 'settings', 'forceLogout'), payload, { merge: true });
    } catch (e) {
      console.error('updateForceLogoutConfig failed', e);
      setAlertMessage('Gagal menyimpan konfigurasi Force Logout ke Firebase.');
    }
  };

  return {
    appSettings,
    setAppSettings,
    forceLogoutConfig,
    forceLogoutBanner,
    executeForcedLogout,
    updateSettings,
    updateForceLogoutConfig,
  };
};
