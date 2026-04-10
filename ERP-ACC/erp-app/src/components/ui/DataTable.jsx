export default function DataTable({
  columns,
  data,
  onRowClick,
  emptyMessage = 'Data tidak ditemukan'
}) {
  return (
    <div className="overflow-x-auto border border-gray-200 rounded-lg">
      <table className="w-full border-collapse">
        <thead className="bg-gray-100 border-b border-gray-200">
          <tr>
            {columns.map(col => (
              <th
                key={col.key}
                className="px-6 py-3 text-left text-sm font-medium text-gray-900 whitespace-nowrap"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data && data.length > 0 ? (
            data.map((row, rowIdx) => (
              <tr
                key={rowIdx}
                onClick={() => onRowClick && onRowClick(row)}
                className={`border-b border-gray-200 ${
                  onRowClick ? 'hover:bg-gray-50 cursor-pointer' : ''
                }`}
              >
                {columns.map(col => (
                  <td
                    key={col.key}
                    className="px-6 py-3 text-sm text-gray-700"
                  >
                    {col.render ? col.render(row[col.key], row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td
                colSpan={columns.length}
                className="px-6 py-8 text-center text-sm text-gray-500"
              >
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
