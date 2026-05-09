import { useState } from 'react'
import { getAccountBalances } from '../../services/reportService'
import { formatCurrency } from '../../utils/currency'
import Button from '../../components/ui/Button'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import DateInput from '../../components/ui/DateInput'
import { Search } from 'lucide-react'
import { Space, Row, Col, Card, Typography, Alert, Statistic, Table } from 'antd'

const { Title, Text } = Typography

function today() {
  return new Date().toISOString().slice(0, 10)
}

function Section({ title, accounts }) {
  const total = accounts.reduce((s, a) => s + (Number(a.balance) || 0), 0)

  const columns = [
    { dataIndex: 'code', key: 'code', width: 100, render: v => <Text type="secondary">{v}</Text> },
    { dataIndex: 'name', key: 'name', render: v => <Text>{v}</Text> },
    {
      dataIndex: 'balance',
      key: 'balance',
      align: 'right',
      render: v => <Text strong>{formatCurrency(v)}</Text>,
    },
  ]

  const footer = () => (
    <Row justify="space-between">
      <Col><Text strong>Total {title}</Text></Col>
      <Col><Text strong>{formatCurrency(total)}</Text></Col>
    </Row>
  )

  return (
    <Card
      title={<Text strong>{title}</Text>}
      size="small"
      styles={{ body: { padding: 0 } }}
    >
      <Table
        dataSource={accounts}
        columns={columns}
        rowKey="coa_id"
        pagination={false}
        size="small"
        showHeader={false}
        footer={footer}
        locale={{ emptyText: '—' }}
      />
    </Card>
  )
}

export default function BalanceSheetPage() {
  const [endDate, setEndDate] = useState(today())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleLoad = async () => {
    setLoading(true)
    setError(null)
    try {
      const balances = await getAccountBalances('2000-01-01', endDate)
      setData(balances || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const byType = (type) => (data || []).filter(a => a.type === type && a.balance !== 0)

  const totalAset = byType('asset').reduce((s, a) => s + a.balance, 0)
  const totalKewajiban = byType('liability').reduce((s, a) => s + a.balance, 0)
  const totalModal = byType('equity').reduce((s, a) => s + a.balance, 0)
  const selisih = Math.abs(totalAset - totalKewajiban - totalModal)

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Title level={2}>Neraca (Balance Sheet)</Title>

      <Space align="end">
        <DateInput
          label="Per Tanggal"
          value={endDate}
          onChange={e => setEndDate(e.target.value)}
        />
        <Button variant="primary" onClick={handleLoad} loading={loading}>
          <Search size={16} /> Tampilkan
        </Button>
      </Space>

      {loading && <LoadingSpinner message="Memuat neraca..." />}
      {error && <Alert type="error" message={error} showIcon />}

      {data && !loading && (
        <Space direction="vertical" style={{ width: '100%' }}>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Section title="ASET" accounts={byType('asset')} />
            </Col>
            <Col xs={24} md={12}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Section title="KEWAJIBAN" accounts={byType('liability')} />
                <Section title="MODAL / EKUITAS" accounts={byType('equity')} />
              </Space>
            </Col>
          </Row>

          <Card>
            <Row gutter={16}>
              <Col span={8}>
                <Statistic title="Total Aset" value={totalAset} formatter={v => formatCurrency(v)} valueStyle={{ color: '#1d4ed8' }} />
              </Col>
              <Col span={8}>
                <Statistic title="Total Kewajiban" value={totalKewajiban} formatter={v => formatCurrency(v)} valueStyle={{ color: '#dc2626' }} />
              </Col>
              <Col span={8}>
                <Statistic title="Total Modal" value={totalModal} formatter={v => formatCurrency(v)} valueStyle={{ color: '#16a34a' }} />
              </Col>
            </Row>
            <div style={{ marginTop: 12 }}>
              {selisih < 0.01
                ? <Alert type="success" message="Neraca seimbang — Aset = Kewajiban + Modal" showIcon />
                : <Alert type="error" message={`Selisih: ${formatCurrency(selisih)}`} showIcon />
              }
            </div>
          </Card>
        </Space>
      )}
    </Space>
  )
}
