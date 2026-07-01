import { useMemo } from 'react';

export function useSearchFilter(list, searchTerm, fields) {
  return useMemo(() => {
    const items = Array.isArray(list) ? list : [];
    const term = (searchTerm || '').trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) =>
      fields.some((field) => String(item?.[field] ?? '').toLowerCase().includes(term))
    );
  }, [list, searchTerm, fields]);
}
