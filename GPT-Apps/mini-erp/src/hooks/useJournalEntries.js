import { useCallback, useEffect, useMemo, useState } from 'react';
import { isFirebaseConfigured } from '../firebase.js';
import { postJournalEntry, saveJournalDraft, subscribeJournalEntries, voidJournalWithReversal } from '../services/journalService.js';
import { useAuth } from './useAuth.js';
import { useCompany } from './useCompany.js';

export function useJournalEntries() {
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
    return subscribeJournalEntries({
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

  useEffect(() => {
    if (isFirebaseConfigured || typeof window === 'undefined') return undefined;

    function handleJournalEntriesChanged() {
      reloadLocal();
    }

    window.addEventListener('mini-erp:journalEntriesChanged', handleJournalEntriesChanged);
    return () => window.removeEventListener('mini-erp:journalEntriesChanged', handleJournalEntriesChanged);
  }, [reloadLocal]);

  const saveDraft = useCallback(
    async ({ journal, totals }) => {
      setError('');
      const saved = await saveJournalDraft({
        companyId: activeCompany.id,
        actor,
        journal,
        totals,
      });
      if (!isFirebaseConfigured) reloadLocal();
      return saved;
    },
    [activeCompany?.id, actor, reloadLocal]
  );

  const post = useCallback(
    async (journal) => {
      setError('');
      const posted = await postJournalEntry({
        companyId: activeCompany.id,
        actor,
        journal,
      });
      if (!isFirebaseConfigured) reloadLocal();
      return posted;
    },
    [activeCompany?.id, actor, reloadLocal]
  );

  const voidJournal = useCallback(
    async ({ journal, reason }) => {
      setError('');
      const result = await voidJournalWithReversal({
        companyId: activeCompany.id,
        actor,
        journal,
        reason,
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
    voidJournal,
  };
}
