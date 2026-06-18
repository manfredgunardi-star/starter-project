import { useState, useMemo, useCallback } from 'react'
import { compareValues } from '../utils/sort'

export function useSortableData(data, sortConfig, defaultSort = { key: 'date', direction: 'desc' }) {
  const [sortKey, setSortKey] = useState(defaultSort.key)
  const [sortDirection, setSortDirection] = useState(defaultSort.direction)

  const requestSort = useCallback((key) => {
    if (key === sortKey) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDirection(key === 'date' ? 'desc' : 'asc')
    }
  }, [sortKey])

  const sorted = useMemo(() => {
    const config = sortConfig[sortKey]
    if (!config) return data
    return [...data].sort((a, b) => {
      const cmp = compareValues(config.accessor(a), config.accessor(b), config.type)
      return sortDirection === 'asc' ? cmp : -cmp
    })
  }, [data, sortKey, sortDirection, sortConfig])

  return { sorted, sortKey, sortDirection, requestSort }
}
