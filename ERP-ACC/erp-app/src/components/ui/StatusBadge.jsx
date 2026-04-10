export default function StatusBadge({ status }) {
  const statusConfig = {
    draft: { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Draft' },
    posted: { bg: 'bg-green-100', text: 'text-green-800', label: 'Posted' },
    confirmed: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Confirmed' },
    paid: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Paid' },
    partial: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Partial' },
    pending: { bg: 'bg-orange-100', text: 'text-orange-800', label: 'Pending' },
    completed: { bg: 'bg-green-100', text: 'text-green-800', label: 'Completed' },
    cancelled: { bg: 'bg-red-100', text: 'text-red-800', label: 'Cancelled' }
  }

  const config = statusConfig[status] || statusConfig.draft
  const label = config.label

  return (
    <span className={`inline-block px-3 py-1 text-sm font-medium rounded-full ${config.bg} ${config.text}`}>
      {label}
    </span>
  )
}
