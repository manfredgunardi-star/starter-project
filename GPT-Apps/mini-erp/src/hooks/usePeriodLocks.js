import { useCallback, useEffect, useMemo, useState } from 'react';
import { isFirebaseConfigured } from '../firebase.js';
import { lockAccountingPeriod, subscribePeriodLocks, unlockAccountingPeriod } from '../services/periodLockService.js';
import { useAuth } from './useAuth.js';
import { useCompany } from './useCompany.js';

export function usePeriodLocks() {
  const { user } = useAuth();
  const { activeCompany } = useCompany();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const actor = useMemo(
    () => ({
      uid: user.id,
      id: user.id,
      email: user.email,
      displayName: user.displayName,
    }),
    [user]
  );

  const reloadLocal = useCallback(() => {
    setLoading(true);
    return subscribePeriodLocks({
      companyId: activeCompany?.id,
      onData: (nextItems) => {
        setItems(nextItems);
        setLoading(false);
      },
      onError: (nextError) => {
        setError(nextError.message);
        setLoading(false);
      },
    });
  }, [activeCompany?.id]);

  useEffect(() => {
    setError('');
    const unsubscribe = reloadLocal();
    return unsubscribe;
  }, [reloadLocal]);

  const lockPeriod = useCallback(
    async ({ period, note }) => {
      setError('');
      const saved = await lockAccountingPeriod({
        companyId: activeCompany.id,
        actor,
        period,
        note,
      });
      if (!isFirebaseConfigured) reloadLocal();
      return saved;
    },
    [activeCompany?.id, actor, reloadLocal]
  );

  const unlockPeriod = useCallback(
    async (period) => {
      setError('');
      const saved = await unlockAccountingPeriod({
        companyId: activeCompany.id,
        actor,
        period,
      });
      if (!isFirebaseConfigured) reloadLocal();
      return saved;
    },
    [activeCompany?.id, actor, reloadLocal]
  );

  return {
    error,
    items,
    loading,
    lockPeriod,
    unlockPeriod,
  };
}
