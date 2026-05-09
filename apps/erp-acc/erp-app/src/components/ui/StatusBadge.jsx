import { Tag } from 'antd'

const statusConfig = {
  draft: { color: 'default', label: 'Draft' },
  posted: { color: 'success', label: 'Posted' },
  confirmed: { color: 'blue', label: 'Confirmed' },
  paid: { color: 'blue', label: 'Paid' },
  partial: { color: 'warning', label: 'Partial' },
  pending: { color: 'orange', label: 'Pending' },
  completed: { color: 'success', label: 'Completed' },
  cancelled: { color: 'error', label: 'Cancelled' }
}

export default function StatusBadge({ status }) {
  const config = statusConfig[status] || statusConfig.draft
  return <Tag color={config.color}>{config.label}</Tag>
}
