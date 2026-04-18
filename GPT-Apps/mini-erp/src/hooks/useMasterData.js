import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  restoreMasterDataItem,
  saveMasterDataItem,
  softDeleteMasterDataItem,
  subscribeMasterData,
} from '../services/masterDataService.js';
import { isFirebaseConfigured } from '../firebase.js';
import { useAuth } from './useAuth.js';
import { useCompany } from './useCompany.js';

export function useMasterData(collectionName, options = {}) {
  const { user } = useAuth();
  const { activeCompany } = useCompany();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const usesRealtime = isFirebaseConfigured;

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
    return subscribeMasterData({
      companyId: activeCompany.id,
      collectionName,
      onData: (nextItems) => {
        setItems(nextItems);
        setLoading(false);
      },
      onError: (nextError) => {
        setError(nextError.message);
        setLoading(false);
      },
    });
  }, [activeCompany.id, collectionName]);

  useEffect(() => {
    setError('');
    const unsubscribe = reloadLocal();
    return unsubscribe;
  }, [reloadLocal]);

  const save = useCallback(
    async (data) => {
      setError('');
      const saved = await saveMasterDataItem({
        companyId: activeCompany.id,
        collectionName,
        data,
        actor,
        prefix: options.prefix || 'md',
      });
      if (!usesRealtime) reloadLocal();
      return saved;
    },
    [activeCompany.id, actor, collectionName, options.prefix, reloadLocal, usesRealtime]
  );

  const remove = useCallback(
    async (id) => {
      setError('');
      await softDeleteMasterDataItem({ companyId: activeCompany.id, collectionName, id, actor });
      if (!usesRealtime) reloadLocal();
    },
    [activeCompany.id, actor, collectionName, reloadLocal, usesRealtime]
  );

  const restore = useCallback(
    async (id) => {
      setError('');
      await restoreMasterDataItem({ companyId: activeCompany.id, collectionName, id, actor });
      if (!usesRealtime) reloadLocal();
    },
    [activeCompany.id, actor, collectionName, reloadLocal, usesRealtime]
  );

  return {
    items,
    loading,
    error,
    save,
    remove,
    restore,
  };
}
