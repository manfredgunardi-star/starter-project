import { useState, useMemo } from 'react'
import { compareValues } from '../utils/sort'

export function useSortableData(data = [], sortConfig = {}, defaultSort = {}) {
  const [sortState, setSortState] = useState(defaultSort)

  const sorted = useMemo(() => {
    const { key, direction } = sortState
    if (!key || !sortConfig[key]) return data

    const config = sortConfig[key]
    const sorted = [...data].sort((a, b) => {
      const aVal = config.accessor(a)
      const bVal = config.accessor(b)
      return compareValues(aVal, bVal, config.type, direction)
    })

    return sorted
  }, [data, sortState, sortConfig])

  const requestSort = (key) => {
    let newDirection = 'asc'
    if (sortState.key === key && sortState.direction === 'asc') {
      newDirection = 'desc'
    }
    setSortState({ key, direction: newDirection })
  }

  return {
    sorted,
    sortKey: sortState.key,
    sortDirection: sortState.direction,
    requestSort,
  }
}
