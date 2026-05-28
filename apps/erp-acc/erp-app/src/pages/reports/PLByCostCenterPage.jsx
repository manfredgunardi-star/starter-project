import { useState } from 'react'
import { Space, Card, Typography, Alert, Table, Divider, Row, Col, Statistic } from 'antd'
import { Search } from 'lucide-react'
import { getPLByCostCenter } from '../../services/reportService'
import { formatCurrency } from '../../utils/currency'
import { today } from '../../utils/date'
import Button from '../../components/ui/Button'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import DateInput from '../../components/ui/DateInput'

const { Title, Text } = Typography

function yearStart() {
  return `${new Date().getFullYear()}-01-01`
}

function toNumber(value) {
  return Number(value) || 0
}

function groupByCostCenter(rows) {
  const grouped = new Map()

  for (const row of rows || []) {
    const key = row.cost_center_id
    if (!grouped.has(key)) {
      grouped.set(key, {
        id: row.cost_center_id,
        code: row.cost_center_code,
        name: row.cost_center_name,
        revenue: [],
        expense: [],
      })
    }

    const group = grouped.get(key)
    if (row.coa_type === 'revenue') group.revenue.push(row)
    if (row.coa_type === 'expense') group.expense.push(row)
  }

  return Array.from(grouped.values()).sort((a, b) => {
    const codeA = a.code || ''
    const codeB = b.code || ''
    return codeA.localeCompare(codeB)
  })
}

function buildColumns(amountField, amountTitle) {
  return [
    {
      title: 'Kode',
      dataIndex: 'coa_code',
      key: 'coa_code',
      width: 110,
      render: value => <Text type="secondary">{value}</Text>,
    },
    {
      title: 'Nama Akun',
      dataIndex: 'coa_name',
      key: 'coa_name',
    },
    {
      title: amountTitle,
      dataIndex: amountField,
      key: amountField,
      align: 'right',
      width: 160,
      render: value => formatCurrency(value),
    },
  ]
}

function AccountSummary({ totalLabel, totalValue, valueType }) {
  return (
    <Table.Summary.Row>
      <Table.Summary.Cell index={0} colSpan={2}>
        <Text strong>{totalLabel}</Text>
      </Table.Summary.Cell>
      <Table.Summary.Cell index={2} align="right">
        <Text strong type={valueType}>{formatCurrency(totalValue)}</Text>
      </Table.Summary.Cell>
    </Table.Summary.Row>
  )
}

function CostCenterCard({ costCenter }) {
  const totalRevenue = costCenter.revenue.reduce((sum, row) => sum + toNumber(row.total_credit), 0)
  const totalExpense = costCenter.expense.reduce((sum, row) => sum + toNumber(row.total_debit), 0)
  const netIncome = totalRevenue - totalExpense
  const resultLabel = netIncome >= 0 ? 'Laba Bersih' : 'Rugi Bersih'
  const resultColor = netIncome >= 0 ? '#16a34a' : '#dc2626'

  return (
    <Card
      title={<Text strong>{costCenter.code} - {costCenter.name}</Text>}
      extra={
        <Text strong style={{ color: resultColor, fontSize: 16 }}>
          {resultLabel}: {formatCurrency(Math.abs(netIncome))}
        </Text>
      }
    >
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={8}>
          <Statistic title="Total Pendapatan" value={formatCurrency(totalRevenue)} valueStyle={{ color: '#16a34a' }} />
        </Col>
        <Col xs={24} md={8}>
          <Statistic title="Total Beban" value={formatCurrency(totalExpense)} valueStyle={{ color: '#dc2626' }} />
        </Col>
        <Col xs={24} md={8}>
          <Statistic title={resultLabel} value={formatCurrency(Math.abs(netIncome))} valueStyle={{ color: resultColor }} />
        </Col>
      </Row>

      <Divider orientation="left" style={{ margin: '8px 0 12px' }}>Pendapatan</Divider>
      <Table
        dataSource={costCenter.revenue}
        columns={buildColumns('total_credit', 'Kredit')}
        rowKey="coa_id"
        pagination={false}
        size="small"
        locale={{ emptyText: '-' }}
        summary={() => (
          <AccountSummary totalLabel="Total Pendapatan" totalValue={totalRevenue} valueType="success" />
        )}
      />

      <Divider orientation="left" style={{ margin: '20px 0 12px' }}>Beban</Divider>
      <Table
        dataSource={costCenter.expense}
        columns={buildColumns('total_debit', 'Debit')}
        rowKey="coa_id"
        pagination={false}
        size="small"
        locale={{ emptyText: '-' }}
        summary={() => (
          <AccountSummary totalLabel="Total Beban" totalValue={totalExpense} valueType="danger" />
        )}
      />
    </Card>
  )
}

export default function PLByCostCenterPage() {
  const [startDate, setStartDate] = useState(yearStart())
  const [endDate, setEndDate] = useState(today())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleLoad() {
    setLoading(true)
    setError(null)
    try {
      const rows = await getPLByCostCenter(startDate, endDate)
      setData(rows)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const costCenters = groupByCostCenter(data)

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Title level={2} style={{ margin: 0 }}>Laporan P&L per Cost Center</Title>

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

      {loading && <LoadingSpinner message="Memuat laporan P&L per cost center..." />}
      {error && <Alert message={error} type="error" showIcon />}

      {data && !loading && costCenters.length === 0 && (
        <Alert
          message="Tidak ada data P&L per cost center untuk periode ini."
          description="Pastikan jurnal sudah diposting dan memiliki cost center pada baris akun pendapatan atau beban."
          type="info"
          showIcon
        />
      )}

      {data && !loading && costCenters.map(costCenter => (
        <CostCenterCard key={costCenter.id} costCenter={costCenter} />
      ))}
    </Space>
  )
}
