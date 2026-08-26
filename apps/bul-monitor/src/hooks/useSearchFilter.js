import { useMemo } from 'react';
import { filterBySearch } from '../utils/searchFilter.js';

/**
 * Bungkus useMemo di atas filterBySearch.
 *
 * PENTING: `fields` harus berupa konstanta level-modul (bukan array literal
 * inline), supaya referensinya stabil antar-render dan useMemo benar-benar
 * mencegah perhitungan ulang.
 */
export function useSearchFilter(list, searchTerm, fields) {
  return useMemo(
    () => filterBySearch(list, searchTerm, fields),
    [list, searchTerm, fields]
  );
}
