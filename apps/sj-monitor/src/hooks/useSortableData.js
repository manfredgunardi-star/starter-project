import { useMemo, useState, useCallback } from 'react';

export function useSortableData(list, initialSort = null) {
  const [sortConfig, setSortConfig] = useState(initialSort);

  const toggleSort = useCallback((field) => {
    setSortConfig((current) => {
      if (!current || current.field !== field) {
        return { field, direction: 'asc' };
      }
      return { field, direction: current.direction === 'asc' ? 'desc' : 'asc' };
    });
  }, []);

  const sorted = useMemo(() => {
    const items = Array.isArray(list) ? [...list] : [];
    if (!sortConfig) return items;
    const { field, direction } = sortConfig;
    items.sort((a, b) => {
      const valA = a?.[field];
      const valB = b?.[field];
      if (valA == null && valB == null) return 0;
      if (valA == null) return direction === 'asc' ? -1 : 1;
      if (valB == null) return direction === 'asc' ? 1 : -1;
      if (typeof valA === 'number' && typeof valB === 'number') {
        return direction === 'asc' ? valA - valB : valB - valA;
      }
      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();
      if (strA < strB) return direction === 'asc' ? -1 : 1;
      if (strA > strB) return direction === 'asc' ? 1 : -1;
      return 0;
    });
    return items;
  }, [list, sortConfig]);

  return { sorted, sortConfig, toggleSort };
}
