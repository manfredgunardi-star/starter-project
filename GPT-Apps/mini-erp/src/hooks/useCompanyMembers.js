import { useCallback, useEffect, useMemo, useState } from 'react';
import { isFirebaseConfigured } from '../firebase.js';
import { isSupabaseConfigured } from '../supabase.js';
import { saveCompanyMember, subscribeCompanyMembers } from '../services/companyService.js';
import { useAuth } from './useAuth.js';
import { useCompany } from './useCompany.js';

export function useCompanyMembers() {
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
      role: activeCompany?.role || 'reader',
      permissions: activeCompany?.permissions || [],
    }),
    [activeCompany?.permissions, activeCompany?.role, user]
  );

  const reload = useCallback(() => {
    setLoading(true);
    return subscribeCompanyMembers({
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
    const unsubscribe = reload();
    return unsubscribe;
  }, [reload]);

  const save = useCallback(
    async (member) => {
      setError('');
      try {
        const saved = await saveCompanyMember({
          companyId: activeCompany.id,
          actor,
          member,
        });
        if (isSupabaseConfigured || !isFirebaseConfigured) reload();
        return saved;
      } catch (nextError) {
        setError(nextError.message);
        throw nextError;
      }
    },
    [activeCompany?.id, actor, reload]
  );

  return {
    error,
    items,
    loading,
    save,
  };
}
