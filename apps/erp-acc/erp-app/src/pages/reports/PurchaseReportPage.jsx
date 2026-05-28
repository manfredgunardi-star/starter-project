import { useEffect, useState } from 'react'
import { getPurchaseReport } from '../../services/reportService'
import { supabase } from '../../lib/supabase'
import { formatCurrency } from '../../utils/currency'
import { today } from '../../utils/date'
import Button from '../../components/ui/Button'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import DateInput from '../../components/ui/DateInput'
import { Search } from 'lucide-react'
import {
  Space, Card, Typography, Alert, Table, Tag, Row, Col, Statistic, Select,
} from 'antd'

const { Title, Text } = Typography

function firstOfMonth() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`
}

const STATUS_MAP = {
  paid: { color: 'success', label: 'Lunas' },
  partial: { color: 'processing', label: 'Sebagian' },
  posted: { color: 'warning', label: 'Terposting' },
  draft: { color: 'default', label: 'Draft' },
}

export default function PurchaseReportPage() {
  const [startDate, setStartDate] = useState(firstOfMonth())
  const [endDate, setEndDate] = useState(today())
  const [supplierId, setSupplierId] = useState(null)
  const [suppliers, setSuppliers] = useState([])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    supabase
      .from('suppliers')
      .select('id, name')
      .eq('is_active', true)
      .order('name')
      .then(({ data: rows }) => setSuppliers(rows || []))
  }, [])

  async function handleLoad() {
    setLoading(true)
    setError(null)
    try {
      const rows = await getPurchaseReport(startDate, endDate, supplierId)
      setData(rows || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const totalSubtotal = data ? data.reduce((sum, row) => sum + Number(row.subtotal), 0) : 0
  const totalTax = data ? data.reduce((sum, row) => sum + Number(row.tax_amount), 0) : 0
  const totalAmount = data ? data.reduce((sum, row) => sum + Number(row.total), 0) : 0
  const totalPaid = data ? data.reduce((sum, row) => sum + Number(row.amount_paid), 0) : 0
  const totalOutstanding = totalAmount - totalPaid

  const columns = [
    { title: 'No. Invoice', dataIndex: 'invoice_number', key: 'invoice_number', width: 150 },
    { title: 'Tanggal', dataIndex: 'date', key: 'date', width: 110 },
    {
      title: 'Supplier',
      key: 'supplier',
      render: (_, row) => row.supplier?.name || '-',
    },
    {
      title: 'Subtotal',
      dataIndex: 'subtotal',
      key: 'subtotal',
      align: 'right',
      width: 130,
      render: value => formatCurrency(value),
    },
    {
      title: 'PPN',
      dataIndex: 'tax_amount',
      key: 'tax_amount',
      align: 'right',
      width: 110,
      render: value => formatCurrency(value),
    },
    {
      title: 'Total',
      dataIndex: 'total',
      key: 'total',
      align: 'right',
      width: 130,
      render: value => <Text strong>{formatCurrency(value)}</Text>,
    },
    {
      title: 'Terbayar',
      dataIndex: 'amount_paid',
      key: 'amount_paid',
      align: 'right',
      width: 130,
      render: value => <Text type="success">{formatCurrency(value)}</Text>,
    },
    {
      title: 'Sisa',
      key: 'outstanding',
      align: 'right',
      width: 130,
      render: (_, row) => {
        const outstanding = Number(row.total) - Number(row.amount_paid)
        return <Text type={outstanding > 0 ? 'danger' : 'secondary'}>{formatCurrency(outstanding)}</Text>
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: status => {
        const config = STATUS_MAP[status] || { color: 'default', label: status }
        return <Tag color={config.color}>{config.label}</Tag>
      },
    },
  ]

  const footer = () => (
    <Row justify="end">
      <Col>
        <Space size="large">
          <Text strong>Subtotal: {formatCurrency(totalSubtotal)}</Text>
          <Text strong>PPN: {formatCurrency(totalTax)}</Text>
          <Text strong>Total: {formatCurrency(totalAmount)}</Text>
          <Text strong style={{ color: '#52c41a' }}>Terbayar: {formatCurrency(totalPaid)}</Text>
          <Text strong style={{ color: '#ff4d4f' }}>Hutang: {formatCurrency(totalOutstanding)}</Text>
        </Space>
      </Col>
    </Row>
  )

  const supplierOptions = [
    { value: null, label: '- Semua Supplier -' },
    ...suppliers.map(supplier => ({ value: supplier.id, label: supplier.name })),
  ]

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Title level={2} style={{ margin: 0 }}>Laporan Pembelian</Title>

      <Card>
        <Space direction="horizontal" size="middle" wrap>
          <div>
            <Text strong>Dari Tanggal</Text>
            <div style={{ marginTop: 4 }}>
              <DateInput value={startDate} onChange={event => setStartDate(event.target.value)} />
            </div>
          </div>
          <div>
            <Text strong>Sampai Tanggal</Text>
            <div style={{ marginTop: 4 }}>
              <DateInput value={endDate} onChange={event => setEndDate(event.target.value)} />
            </div>
          </div>
          <div>
            <Text strong>Supplier</Text>
            <div style={{ marginTop: 4 }}>
              <Select
                style={{ width: 220 }}
                options={supplierOptions}
                value={supplierId}
                onChange={setSupplierId}
              />
            </div>
          </div>
          <Button
            style={{ marginTop: 20 }}
            onClick={handleLoad}
            icon={<Search size={14} />}
            loading={loading}
          >
            Tampilkan
          </Button>
        </Space>
      </Card>

      {loading && <LoadingSpinner />}
      {error && <Alert message={error} type="error" showIcon />}

      {data && !loading && (
        <>
          <Row gutter={16}>
            <Col xs={12} sm={4}>
              <Statistic title="Total Invoice" value={data.length} />
            </Col>
            <Col xs={12} sm={5}>
              <Statistic title="Total Nilai" value={formatCurrency(totalAmount)} />
            </Col>
            <Col xs={12} sm={5}>
              <Statistic title="Terbayar" value={formatCurrency(totalPaid)} />
            </Col>
            <Col xs={12} sm={5}>
              <Statistic title="Hutang" value={formatCurrency(totalOutstanding)} />
            </Col>
          </Row>

          <Card
            title={`Laporan Pembelian ${startDate} s/d ${endDate}`}
            styles={{ body: { padding: 0 } }}
          >
            <Table
              dataSource={data}
              columns={columns}
              rowKey="id"
              pagination={{ pageSize: 50 }}
              size="small"
              footer={data.length > 0 ? footer : undefined}
              locale={{ emptyText: 'Tidak ada data untuk periode ini' }}
            />
          </Card>
        </>
      )}
    </Space>
  )
}
