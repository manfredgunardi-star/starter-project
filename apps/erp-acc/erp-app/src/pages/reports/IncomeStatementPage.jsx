import { useState } from 'react'
import { jsPDF } from 'jspdf'
import 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { getAccountBalances } from '../../services/reportService'
import { formatCurrency } from '../../utils/currency'
import Button from '../../components/ui/Button'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import DateInput from '../../components/ui/DateInput'
import { Download, FileText, Search } from 'lucide-react'
import { Button as AntButton, Space, Card, Row, Col, Typography, Alert, Statistic, Divider } from 'antd'

const { Title, Text } = Typography

function yearStart() {
  return new Date().getFullYear() + '-01-01'
}
function today() {
  return new Date().toISOString().slice(0, 10)
}

function Section({ title, accounts, totalLabel, totalType }) {
  const total = accounts.reduce((s, a) => s + (Number(a.balance) || 0), 0)
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Text strong style={{ textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e5e7eb', display: 'block', paddingBottom: 4 }}>
        {title}
      </Text>
      {accounts.map(a => (
        <Row key={a.coa_id} justify="space-between">
          <Col><Text style={{ paddingLeft: 16 }}>{a.code} — {a.name}</Text></Col>
          <Col><Text strong>{formatCurrency(a.balance)}</Text></Col>
        </Row>
      ))}
      {accounts.length === 0 && <Text type="secondary" style={{ paddingLeft: 16 }}>—</Text>}
      <Divider style={{ margin: '4px 0' }} />
      <Row justify="space-between">
        <Col><Text strong>{totalLabel}</Text></Col>
        <Col><Text strong type={totalType}>{formatCurrency(total)}</Text></Col>
      </Row>
    </Space>
  )
}

export default function IncomeStatementPage() {
  const [startDate, setStartDate] = useState(yearStart())
  const [endDate, setEndDate] = useState(today())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleLoad = async () => {
    setLoading(true)
    setError(null)
    try {
      const balances = await getAccountBalances(startDate, endDate)
      setData(balances || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const byType = (type) => (data || []).filter(a => a.type === type && a.balance !== 0)

  const totalRevenue = byType('revenue').reduce((s, a) => s + a.balance, 0)
  const totalExpense = byType('expense').reduce((s, a) => s + a.balance, 0)
  const netIncome = totalRevenue - totalExpense

  const exportPDF = () => {
    const doc = new jsPDF()
    doc.setFontSize(16)
    doc.text('Laba Rugi (Income Statement)', 14, 15)
    doc.setFontSize(10)
    doc.text(`Periode: ${startDate} s/d ${endDate}`, 14, 23)

    let y = 32
    const addSection = (title, accounts, totalLabel, total) => {
      doc.setFontSize(12)
      doc.text(title, 14, y)
      y += 5
      doc.autoTable({
        startY: y,
        head: [['Kode', 'Nama Akun', 'Jumlah']],
        body: accounts.map(account => [
          account.code,
          account.name,
          formatCurrency(account.balance),
        ]),
        foot: [['', totalLabel, formatCurrency(total)]],
        styles: { fontSize: 9 },
        headStyles: { fillColor: [52, 73, 94] },
        footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' },
      })
      y = doc.lastAutoTable.finalY + 10
    }

    addSection('Pendapatan', byType('revenue'), 'Total Pendapatan', totalRevenue)
    addSection('Beban', byType('expense'), 'Total Beban', totalExpense)

    doc.setFontSize(12)
    doc.text(`${netIncome >= 0 ? 'Laba Bersih' : 'Rugi Bersih'}: ${formatCurrency(Math.abs(netIncome))}`, 14, y)
    doc.save(`laba-rugi-${startDate}-${endDate}.pdf`)
  }

  const exportExcel = () => {
    const rows = [
      ['Laba Rugi (Income Statement)'],
      [`Periode: ${startDate} s/d ${endDate}`],
      [],
    ]

    const addSection = (title, accounts, totalLabel, total) => {
      rows.push([title])
      rows.push(['Kode', 'Nama Akun', 'Jumlah'])
      accounts.forEach(account => rows.push([account.code, account.name, account.balance]))
      rows.push(['', totalLabel, total])
      rows.push([])
    }

    addSection('Pendapatan', byType('revenue'), 'Total Pendapatan', totalRevenue)
    addSection('Beban', byType('expense'), 'Total Beban', totalExpense)
    rows.push([netIncome >= 0 ? 'Laba Bersih' : 'Rugi Bersih', Math.abs(netIncome)])

    const ws = XLSX.utils.aoa_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Laba Rugi')
    XLSX.writeFile(wb, `laba-rugi-${startDate}-${endDate}.xlsx`)
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Title level={2}>Laba Rugi (Income Statement)</Title>

      <Space align="end">
        <DateInput
          label="Dari Tanggal"
          value={startDate}
          onChange={e => setStartDate(e.target.value)}
        />
        <DateInput
          label="Hingga Tanggal"
          value={endDate}
          onChange={e => setEndDate(e.target.value)}
        />
        <Button variant="primary" onClick={handleLoad} loading={loading}>
          <Search size={16} /> Tampilkan
        </Button>
      </Space>

      {loading && <LoadingSpinner message="Memuat laporan laba rugi..." />}
      {error && <Alert type="error" message={error} showIcon />}

      {data && !loading && (
        <Card style={{ maxWidth: 640 }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Space>
              <AntButton icon={<FileText size={14} />} onClick={exportPDF}>
                Export PDF
              </AntButton>
              <AntButton icon={<Download size={14} />} onClick={exportExcel}>
                Export Excel
              </AntButton>
            </Space>

            <Section
              title="Pendapatan"
              accounts={byType('revenue')}
              totalLabel="Total Pendapatan"
              totalType="success"
            />

            <Section
              title="Beban"
              accounts={byType('expense')}
              totalLabel="Total Beban"
              totalType="danger"
            />

            <Divider style={{ borderTopWidth: 2, margin: '4px 0' }} />
            <Row justify="space-between">
              <Col>
                <Text strong style={{ fontSize: 16 }}>
                  {netIncome >= 0 ? 'Laba Bersih' : 'Rugi Bersih'}
                </Text>
              </Col>
              <Col>
                <Text strong type={netIncome >= 0 ? 'success' : 'danger'} style={{ fontSize: 16 }}>
                  {formatCurrency(Math.abs(netIncome))}
                </Text>
              </Col>
            </Row>

            <Row gutter={12} style={{ marginTop: 8 }}>
              <Col span={8}>
                <Statistic
                  title="Total Pendapatan"
                  value={totalRevenue}
                  formatter={v => formatCurrency(v)}
                  valueStyle={{ color: '#16a34a', fontSize: 14 }}
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title="Total Beban"
                  value={totalExpense}
                  formatter={v => formatCurrency(v)}
                  valueStyle={{ color: '#dc2626', fontSize: 14 }}
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title={netIncome >= 0 ? 'Laba Bersih' : 'Rugi Bersih'}
                  value={Math.abs(netIncome)}
                  formatter={v => formatCurrency(v)}
                  valueStyle={{ color: netIncome >= 0 ? '#1d4ed8' : '#ea580c', fontSize: 14 }}
                />
              </Col>
            </Row>
          </Space>
        </Card>
      )}
    </Space>
  )
}
