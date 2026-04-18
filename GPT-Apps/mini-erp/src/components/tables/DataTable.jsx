import { ChevronRight } from 'lucide-react';

export function DataTable({ columns, rows, onRowClick }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-ios-separator bg-white shadow-ios-subtle">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-ios-separator">
          <thead className="bg-ios-grouped/70">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em] text-ios-secondary"
                >
                  {column.label}
                </th>
              ))}
              {onRowClick ? <th className="w-12 px-4 py-3" aria-label="Aksi" /> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-ios-separator bg-white">
            {rows.map((row) => (
              <tr
                key={row.id}
                className={onRowClick ? 'cursor-pointer transition hover:bg-ios-grouped/60' : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((column) => (
                  <td key={column.key} className="whitespace-nowrap px-4 py-4 text-sm text-ios-label">
                    {column.render ? column.render(row) : row[column.key]}
                  </td>
                ))}
                {onRowClick ? (
                  <td className="px-4 py-4 text-ios-secondary">
                    <ChevronRight size={18} aria-hidden="true" />
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
