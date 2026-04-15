import { Table } from 'antd'

export default function DataTable({
  columns,
  data,
  onRowClick,
  emptyMessage = 'Data tidak ditemukan',
  loading = false,
  pagination
}) {
  const antdColumns = (columns || []).map(col => ({
    key: col.key,
    title: col.label,
    dataIndex: col.key,
    render: col.render ? (value, row) => col.render(value, row) : undefined
  }))

  return (
    <Table
      columns={antdColumns}
      dataSource={(data || []).map((row, idx) => ({ ...row, __key: row.id ?? idx }))}
      rowKey="__key"
      loading={loading}
      pagination={pagination === false ? false : { pageSize: 20, showSizeChanger: true, ...(pagination || {}) }}
      locale={{ emptyText: emptyMessage }}
      onRow={onRowClick ? (record) => ({
        onClick: () => onRowClick(record),
        style: { cursor: 'pointer' }
      }) : undefined}
      size="middle"
    />
  )
}
