import { useState } from 'react'
import { jsPDF } from 'jspdf'
import { applyPlugin } from 'jspdf-autotable'
applyPlugin(jsPDF)
import * as XLSX from 'xlsx'
import { getAccountBalances } from '../../services/reportService'
import { formatCurrency } from '../../utils/currency'
import Button from '../../components/ui/Button'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import DateInput from '../../components/ui/DateInput'
import { Download, FileText, Search } from 'lucide-react'
import { Button as AntButton, Space, Row, Col, Card, Typography, Alert, Statistic, Table } from 'antd'

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
        locale={{ emptyText: 'â€”' }}
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

  const totalPendapatan = (data || []).filter(a => a.type === 'revenue').reduce((s, a) => s + (Number(a.balance) || 0), 0)
  const totalBeban = (data || []).filter(a => a.type === 'expense').reduce((s, a) => s + (Number(a.balance) || 0), 0)
  const labaBerjalan = totalPendapatan - totalBeban

  const equityAccounts = labaBerjalan !== 0
    ? [...byType('equity'), { coa_id: '__laba_berjalan__', code: '', name: 'Laba (Rugi) Berjalan', balance: labaBerjalan }]
    : byType('equity')

  const totalAset = byType('asset').reduce((s, a) => s + a.balance, 0)
  const totalKewajiban = byType('liability').reduce((s, a) => s + a.balance, 0)
  const totalModal = equityAccounts.reduce((s, a) => s + a.balance, 0)
  const selisih = Math.abs(totalAset - totalKewajiban - totalModal)

  const exportPDF = () => {
    const doc = new jsPDF()
    doc.setFontSize(16)
    doc.text('Neraca (Balance Sheet)', 14, 15)
    doc.setFontSize(10)
    doc.text(`Per Tanggal: ${endDate}`, 14, 23)

    let y = 32
    const addSection = (title, accounts, total) => {
      doc.setFontSize(12)
      doc.text(title, 14, y)
      y += 5
      doc.autoTable({
        startY: y,
        head: [['Kode', 'Nama Akun', 'Saldo']],
        body: accounts.map(account => [
          account.code,
          account.name,
          formatCurrency(account.balance),
        ]),
        foot: [['', `Total ${title}`, formatCurrency(total)]],
        styles: { fontSize: 9 },
        headStyles: { fillColor: [52, 73, 94] },
        footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' },
      })
      y = doc.lastAutoTable.finalY + 10
    }

    addSection('ASET', byType('asset'), totalAset)
    addSection('KEWAJIBAN', byType('liability'), totalKewajiban)
    addSection('MODAL / EKUITAS', equityAccounts, totalModal)

    doc.setFontSize(10)
    doc.text(`Status: ${selisih < 0.01 ? 'Seimbang' : `Selisih ${formatCurrency(selisih)}`}`, 14, y)
    doc.save(`neraca-${endDate}.pdf`)
  }

  const exportExcel = () => {
    const rows = [
      ['Neraca (Balance Sheet)'],
      [`Per Tanggal: ${endDate}`],
      [],
    ]

    const addSection = (title, accounts, total) => {
      rows.push([title])
      rows.push(['Kode', 'Nama Akun', 'Saldo'])
      accounts.forEach(account => rows.push([account.code, account.name, account.balance]))
      rows.push(['', `Total ${title}`, total])
      rows.push([])
    }

    addSection('ASET', byType('asset'), totalAset)
    addSection('KEWAJIBAN', byType('liability'), totalKewajiban)
    addSection('MODAL / EKUITAS', equityAccounts, totalModal)
    rows.push(['Status', selisih < 0.01 ? 'Seimbang' : `Selisih ${selisih}`])

    const ws = XLSX.utils.aoa_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Neraca')
    XLSX.writeFile(wb, `neraca-${endDate}.xlsx`)
  }

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
          <Space>
            <AntButton icon={<FileText size={14} />} onClick={exportPDF}>
              Export PDF
            </AntButton>
            <AntButton icon={<Download size={14} />} onClick={exportExcel}>
              Export Excel
            </AntButton>
          </Space>

          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Section title="ASET" accounts={byType('asset')} />
            </Col>
            <Col xs={24} md={12}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Section title="KEWAJIBAN" accounts={byType('liability')} />
                <Section title="MODAL / EKUITAS" accounts={equityAccounts} />
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
                ? <Alert type="success" message="Neraca seimbang â€” Aset = Kewajiban + Modal" showIcon />
                : <Alert type="error" message={`Selisih: ${formatCurrency(selisih)}`} showIcon />
              }
            </div>
          </Card>
        </Space>
      )}
    </Space>
  )
}
