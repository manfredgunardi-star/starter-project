import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'

export default function SortableHeader({ label, sortKey, activeKey, direction, onSort, align = 'left' }) {
  const isActive = sortKey === activeKey
  return (
    <th
      onClick={() => onSort(sortKey)}
      style={{
        padding: '12px 24px',
        textAlign: align,
        fontSize: 14,
        fontWeight: 500,
        cursor: 'pointer',
        userSelect: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {label}{' '}
      {isActive
        ? direction === 'asc'
          ? <ChevronUp size={14} style={{ verticalAlign: 'middle', color: '#3b82f6' }} />
          : <ChevronDown size={14} style={{ verticalAlign: 'middle', color: '#3b82f6' }} />
        : <ChevronsUpDown size={14} style={{ verticalAlign: 'middle', color: '#9ca3af' }} />
      }
    </th>
  )
}
