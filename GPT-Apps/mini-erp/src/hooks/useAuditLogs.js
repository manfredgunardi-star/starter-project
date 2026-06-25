import { useCallback, useEffect, useState } from 'react';
import { subscribeAuditLogs } from '../services/auditService.js';
import { useCompany } from './useCompany.js';

export function useAuditLogs() {
  const { activeCompany } = useCompany();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(() => {
    setLoading(true);
    return subscribeAuditLogs({
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

  return {
    error,
    items,
    loading,
  };
}
