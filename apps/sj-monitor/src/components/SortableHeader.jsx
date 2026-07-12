import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

export default function SortableHeader({ field, label, sortConfig, onToggle, align = 'left', className = '' }) {
  const isActive = sortConfig?.field === field;
  const Icon = isActive ? (sortConfig.direction === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown;
  const alignClass = align === 'right' ? 'text-right justify-end' : 'text-left justify-start';

  return (
    <th className={`px-2 py-2 sm:px-6 sm:py-3 text-xs font-medium text-gray-500 uppercase ${alignClass} ${className}`}>
      <button
        type="button"
        onClick={() => onToggle(field)}
        aria-sort={isActive ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
        className={`inline-flex items-center gap-1 hover:text-gray-700 w-full ${alignClass}`}
      >
        <span>{label}</span>
        <Icon className="w-3.5 h-3.5 shrink-0" />
      </button>
    </th>
  );
}
