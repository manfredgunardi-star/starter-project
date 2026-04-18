import { useCallback, useEffect, useMemo, useState } from 'react';
import { isFirebaseConfigured } from '../firebase.js';
import { postCashBankTransaction, saveCashBankDraft, subscribeCashBankTransactions } from '../services/cashBankService.js';
import { useAuth } from './useAuth.js';
import { useCompany } from './useCompany.js';

export function useCashBankTransactions() {
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
    return subscribeCashBankTransactions({
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

  const saveDraft = useCallback(
    async (transaction) => {
      setError('');
      const saved = await saveCashBankDraft({
        companyId: activeCompany.id,
        actor,
        transaction,
      });
      if (!isFirebaseConfigured) reloadLocal();
      return saved;
    },
    [activeCompany?.id, actor, reloadLocal]
  );

  const post = useCallback(
    async (transaction) => {
      setError('');
      const result = await postCashBankTransaction({
        companyId: activeCompany.id,
        actor,
        transaction,
      });
      if (!isFirebaseConfigured) reloadLocal();
      return result;
    },
    [activeCompany?.id, actor, reloadLocal]
  );

  return {
    error,
    items,
    loading,
    post,
    saveDraft,
  };
}
