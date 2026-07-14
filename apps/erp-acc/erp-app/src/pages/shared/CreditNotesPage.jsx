import { useState, useEffect } from 'react'
import { Space, Typography, Table, Tag, Segmented, Card } from 'antd'
import { getCreditNotes, getCustomerNames, getSupplierNames } from '../../services/creditNoteService'
import { formatCurrency } from '../../utils/currency'
import { useToast } from '../../components/ui/ToastContext'
import LoadingSpinner from '../../components/ui/LoadingSpinner'

const STATUS_COLOR = { open: 'blue', applied: 'green', cancelled: 'red' }
const SOURCE_LABEL = { sales_return: 'Retur Penjualan', purchase_return: 'Retur Pembelian' }

export default function CreditNotesPage() {
  const toast = useToast()
  const [partyType, setPartyType] = useState('customer')
  const [rows, setRows] = useState([])
  const [names, setNames] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const data = await getCreditNotes({ partyType })
        if (cancelled) return
        setRows(data)
        const ids = [...new Set(data.map(r => r.party_id))]
        const nameMap = partyType === 'customer'
          ? await getCustomerNames(ids)
          : await getSupplierNames(ids)
        if (!cancelled) setNames(nameMap)
      } catch (err) {
        if (!cancelled) toast.error(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [partyType])

  const columns = [
    { title: partyType === 'customer' ? 'Customer' : 'Supplier', dataIndex: 'party_id', render: id => names[id] || id },
    { title: 'Sumber', dataIndex: 'source_type', render: t => SOURCE_LABEL[t] || t },
    { title: 'Jumlah', dataIndex: 'amount', align: 'right', render: formatCurrency },
    { title: 'Sisa', dataIndex: 'remaining', align: 'right', render: formatCurrency },
    { title: 'Status', dataIndex: 'status', render: s => <Tag color={STATUS_COLOR[s]}>{s}</Tag> },
    { title: 'Dibuat', dataIndex: 'created_at', render: d => new Date(d).toLocaleDateString('id-ID') },
  ]

  if (loading) return <LoadingSpinner message="Memuat saldo kredit..." />

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={24}>
      <Typography.Title level={3} style={{ margin: 0 }}>Saldo Kredit</Typography.Title>
      <Segmented
        value={partyType}
        onChange={setPartyType}
        options={[{ label: 'Customer', value: 'customer' }, { label: 'Supplier', value: 'supplier' }]}
      />
      <Card>
        <Table
          rowKey="id"
          dataSource={rows}
          columns={columns}
          expandable={{
            rowExpanded: () => true,
            expandedRowRender: row => (
              <Table
                size="small"
                pagination={false}
                dataSource={row.applications}
                rowKey="id"
                columns={[
                  { title: 'Invoice', dataIndex: ['invoice', 'invoice_number'] },
                  { title: 'Jumlah Diterapkan', dataIndex: 'amount', align: 'right', render: formatCurrency },
                  { title: 'Tanggal', dataIndex: 'applied_at', render: d => new Date(d).toLocaleDateString('id-ID') },
                ]}
                locale={{ emptyText: 'Belum ada pemakaian' }}
              />
            ),
          }}
        />
      </Card>
    </Space>
  )
}
