import { useState } from 'react'
import { jsPDF } from 'jspdf'
import { applyPlugin } from 'jspdf-autotable'
applyPlugin(jsPDF)
import * as XLSX from 'xlsx'
import { getCashFlowData } from '../../services/reportService'
import { formatCurrency } from '../../utils/currency'
import { formatDate } from '../../utils/date'
import Button from '../../components/ui/Button'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import DateInput from '../../components/ui/DateInput'
import { Download, FileText, Search } from 'lucide-react'
import { Button as AntButton, Space, Row, Col, Card, Typography, Alert, Statistic, Table } from 'antd'

const { Title, Text } = Typography

function yearStart() {
  return new Date().getFullYear() + '-01-01'
}
function today() {
  return new Date().toISOString().slice(0, 10)
}

export default function CashFlowPage() {
  const [startDate, setStartDate] = useState(yearStart())
  const [endDate, setEndDate] = useState(today())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleLoad = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await getCashFlowData(startDate, endDate)
      setData(result || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const incoming = data ? data.filter(p => p.type === 'incoming') : []
  const outgoing = data ? data.filter(p => p.type === 'outgoing') : []
  const totalIn = incoming.reduce((s, p) => s + Number(p.amount), 0)
  const totalOut = outgoing.reduce((s, p) => s + Number(p.amount), 0)
  const netCash = totalIn - totalOut

  const exportPDF = () => {
    const doc = new jsPDF()
    doc.setFontSize(16)
    doc.text('Arus Kas (Cash Flow)', 14, 15)
    doc.setFontSize(10)
    doc.text(`Periode: ${startDate} s/d ${endDate}`, 14, 23)

    let y = 32
    const addSection = (title, rows, total) => {
      doc.setFontSize(12)
      doc.text(title, 14, y)
      y += 5
      doc.autoTable({
        startY: y,
        head: [['Tanggal', 'Pihak', 'Akun', 'Ref. Invoice', 'Jumlah']],
        body: rows.map(row => [
          formatDate(row.date),
          row.customer?.name || row.supplier?.name || '-',
          row.account?.name || '-',
          row.invoice?.invoice_number || '-',
          formatCurrency(row.amount),
        ]),
        foot: [['', '', '', 'Total', formatCurrency(total)]],
        styles: { fontSize: 8 },
        headStyles: { fillColor: [52, 73, 94] },
        footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' },
      })
      y = doc.lastAutoTable.finalY + 10
    }

    addSection('Kas Masuk', incoming, totalIn)
    addSection('Kas Keluar', outgoing, totalOut)

    doc.setFontSize(12)
    doc.text(`Arus Kas Bersih: ${formatCurrency(netCash)}`, 14, y)
    doc.save(`arus-kas-${startDate}-${endDate}.pdf`)
  }

  const exportExcel = () => {
    const rows = [
      ['Arus Kas (Cash Flow)'],
      [`Periode: ${startDate} s/d ${endDate}`],
      [],
    ]

    const addSection = (title, items, total) => {
      rows.push([title])
      rows.push(['Tanggal', 'Pihak', 'Akun', 'Ref. Invoice', 'Jumlah'])
      items.forEach(item => rows.push([
        item.date,
        item.customer?.name || item.supplier?.name || '-',
        item.account?.name || '-',
        item.invoice?.invoice_number || '-',
        Number(item.amount),
      ]))
      rows.push(['', '', '', 'Total', total])
      rows.push([])
    }

    addSection('Kas Masuk', incoming, totalIn)
    addSection('Kas Keluar', outgoing, totalOut)
    rows.push(['Arus Kas Bersih', netCash])

    const ws = XLSX.utils.aoa_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Arus Kas')
    XLSX.writeFile(wb, `arus-kas-${startDate}-${endDate}.xlsx`)
  }

  const incomingColumns = [
    { title: 'Tanggal', dataIndex: 'date', key: 'date', width: 110, render: v => formatDate(v) },
    { title: 'Customer', dataIndex: 'customer', key: 'customer', render: v => v?.name || 'â€”' },
    { title: 'Akun', dataIndex: 'account', key: 'account', render: v => v?.name || 'â€”' },
    { title: 'Ref. Invoice', dataIndex: 'invoice', key: 'invoice', render: v => <Text code>{v?.invoice_number || 'â€”'}</Text> },
    {
      title: 'Jumlah',
      dataIndex: 'amount',
      key: 'amount',
      align: 'right',
      render: v => <Text type="success">{formatCurrency(v)}</Text>,
    },
  ]

  const outgoingColumns = [
    { title: 'Tanggal', dataIndex: 'date', key: 'date', width: 110, render: v => formatDate(v) },
    { title: 'Supplier', dataIndex: 'supplier', key: 'supplier', render: v => v?.name || 'â€”' },
    { title: 'Akun', dataIndex: 'account', key: 'account', render: v => v?.name || 'â€”' },
    { title: 'Ref. Invoice', dataIndex: 'invoice', key: 'invoice', render: v => <Text code>{v?.invoice_number || 'â€”'}</Text> },
    {
      title: 'Jumlah',
      dataIndex: 'amount',
      key: 'amount',
      align: 'right',
      render: v => <Text type="danger">{formatCurrency(v)}</Text>,
    },
  ]

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Title level={2}>Arus Kas (Cash Flow)</Title>

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

      {loading && <LoadingSpinner message="Memuat arus kas..." />}
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
            <Col span={8}>
              <Statistic
                title="Total Kas Masuk"
                value={totalIn}
                formatter={v => formatCurrency(v)}
                valueStyle={{ color: '#16a34a' }}
              />
            </Col>
            <Col span={8}>
              <Statistic
                title="Total Kas Keluar"
                value={totalOut}
                formatter={v => formatCurrency(v)}
                valueStyle={{ color: '#dc2626' }}
              />
            </Col>
            <Col span={8}>
              <Statistic
                title={netCash >= 0 ? 'Arus Kas Bersih (+)' : 'Arus Kas Bersih (-)'}
                value={Math.abs(netCash)}
                formatter={v => formatCurrency(v)}
                valueStyle={{ color: netCash >= 0 ? '#1d4ed8' : '#ea580c' }}
              />
            </Col>
          </Row>

          <Card
            title={
              <Text strong style={{ color: '#166534' }}>
                Kas Masuk (dari Customer) â€” {incoming.length} transaksi
              </Text>
            }
            size="small"
            styles={{ body: { padding: 0 } }}
          >
            <Table
              dataSource={incoming}
              columns={incomingColumns}
              rowKey={(_, i) => i}
              pagination={false}
              size="small"
              summary={() => incoming.length > 0 ? (
                <Table.Summary.Row>
                  <Table.Summary.Cell colSpan={4} index={0}>
                    <Text strong style={{ float: 'right' }}>Total Masuk</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={4} align="right">
                    <Text strong type="success">{formatCurrency(totalIn)}</Text>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              ) : null}
              locale={{ emptyText: 'Tidak ada transaksi' }}
            />
          </Card>

          <Card
            title={
              <Text strong style={{ color: '#991b1b' }}>
                Kas Keluar (ke Supplier) â€” {outgoing.length} transaksi
              </Text>
            }
            size="small"
            styles={{ body: { padding: 0 } }}
          >
            <Table
              dataSource={outgoing}
              columns={outgoingColumns}
              rowKey={(_, i) => i}
              pagination={false}
              size="small"
              summary={() => outgoing.length > 0 ? (
                <Table.Summary.Row>
                  <Table.Summary.Cell colSpan={4} index={0}>
                    <Text strong style={{ float: 'right' }}>Total Keluar</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={4} align="right">
                    <Text strong type="danger">{formatCurrency(totalOut)}</Text>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              ) : null}
              locale={{ emptyText: 'Tidak ada transaksi' }}
            />
          </Card>
        </Space>
      )}
    </Space>
  )
}
