import { useState } from 'react'
import { jsPDF } from 'jspdf'
import { applyPlugin } from 'jspdf-autotable'
applyPlugin(jsPDF)
import * as XLSX from 'xlsx'
import { getARAgingData, getAPAgingData } from '../../services/reportService'
import { formatCurrency } from '../../utils/currency'
import { formatDate, today } from '../../utils/date'
import Button from '../../components/ui/Button'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import DateInput from '../../components/ui/DateInput'
import { Download, FileText, Search } from 'lucide-react'
import {
  Button as AntButton, Space, Card, Typography, Alert, Statistic, Table, Tabs, Row, Col, Tag
} from 'antd'

const { Title, Text } = Typography

const BUCKETS = ['current', '1-30', '31-60', '61-90', '90+']
const BUCKET_LABELS = {
  current: 'Belum Jatuh Tempo',
  '1-30': '1â€“30 Hari',
  '31-60': '31â€“60 Hari',
  '61-90': '61â€“90 Hari',
  '90+': '> 90 Hari',
}
const BUCKET_COLORS = {
  current: 'green',
  '1-30': 'blue',
  '31-60': 'orange',
  '61-90': 'volcano',
  '90+': 'red',
}

function getAgingBucket(dueDate, asOfDate) {
  if (!dueDate) return 'current'
  const days = Math.floor(
    (new Date(asOfDate) - new Date(dueDate)) / (1000 * 60 * 60 * 24)
  )
  if (days <= 0) return 'current'
  if (days <= 30) return '1-30'
  if (days <= 60) return '31-60'
  if (days <= 90) return '61-90'
  return '90+'
}

function buildRows(invoices, partyKey, asOfDate) {
  const grouped = {}
  for (const inv of invoices) {
    const party = inv[partyKey]
    const partyName = party?.name || '(Tidak Diketahui)'
    const balance = Number(inv.total) - Number(inv.amount_paid)
    const bucket = getAgingBucket(inv.due_date, asOfDate)
    if (!grouped[partyName]) {
      grouped[partyName] = { partyName, invoices: [], totals: {} }
      for (const b of BUCKETS) grouped[partyName].totals[b] = 0
    }
    grouped[partyName].invoices.push({ ...inv, balance, bucket })
    grouped[partyName].totals[bucket] += balance
  }

  const rows = []
  for (const group of Object.values(grouped)) {
    rows.push({
      key: `group-${group.partyName}`,
      isGroupHeader: true,
      partyName: group.partyName,
      totals: group.totals,
      grandBalance: Object.values(group.totals).reduce((s, v) => s + v, 0),
    })
    for (const inv of group.invoices) {
      rows.push({
        key: inv.id,
        isGroupHeader: false,
        invoiceNumber: inv.invoice_number,
        date: inv.date,
        dueDate: inv.due_date,
        total: Number(inv.total),
        amountPaid: Number(inv.amount_paid),
        balance: inv.balance,
        bucket: inv.bucket,
      })
    }
  }
  return rows
}

function buildColumns() {
  return [
    {
      title: 'Nomor Invoice',
      dataIndex: 'invoiceNumber',
      key: 'invoice',
      render: (v, row) =>
        row.isGroupHeader ? (
          <Text strong>{row.partyName}</Text>
        ) : (
          <Text code>{v}</Text>
        ),
    },
    {
      title: 'Tgl Invoice',
      dataIndex: 'date',
      key: 'date',
      width: 110,
      render: (v, row) => (row.isGroupHeader ? null : formatDate(v)),
    },
    {
      title: 'Jatuh Tempo',
      dataIndex: 'dueDate',
      key: 'dueDate',
      width: 110,
      render: (v, row) => (row.isGroupHeader ? null : (v ? formatDate(v) : 'â€”')),
    },
    {
      title: 'Total Invoice',
      dataIndex: 'total',
      key: 'total',
      align: 'right',
      width: 140,
      render: (v, row) => (row.isGroupHeader ? null : formatCurrency(v)),
    },
    {
      title: 'Sudah Dibayar',
      dataIndex: 'amountPaid',
      key: 'amountPaid',
      align: 'right',
      width: 140,
      render: (v, row) => (row.isGroupHeader ? null : formatCurrency(v)),
    },
    {
      title: 'Sisa Tagihan',
      dataIndex: 'balance',
      key: 'balance',
      align: 'right',
      width: 150,
      render: (v, row) => {
        if (row.isGroupHeader) {
          return <Text strong>{formatCurrency(row.grandBalance)}</Text>
        }
        return <Text strong type="warning">{formatCurrency(v)}</Text>
      },
    },
    {
      title: 'Bucket',
      dataIndex: 'bucket',
      key: 'bucket',
      width: 160,
      render: (v, row) => {
        if (row.isGroupHeader) return null
        return <Tag color={BUCKET_COLORS[v]}>{BUCKET_LABELS[v]}</Tag>
      },
    },
  ]
}

function SummaryStats({ rows }) {
  const allInvoiceRows = rows.filter(r => !r.isGroupHeader)
  const total = allInvoiceRows.reduce((s, r) => s + r.balance, 0)
  const overdue = allInvoiceRows
    .filter(r => r.bucket !== 'current')
    .reduce((s, r) => s + r.balance, 0)
  const longOverdue = allInvoiceRows
    .filter(r => r.bucket === '90+')
    .reduce((s, r) => s + r.balance, 0)
  return (
    <Row gutter={16}>
      <Col span={8}>
        <Statistic title="Total Outstanding" value={total} formatter={v => formatCurrency(v)} />
      </Col>
      <Col span={8}>
        <Statistic
          title="Sudah Jatuh Tempo"
          value={overdue}
          formatter={v => formatCurrency(v)}
          valueStyle={{ color: '#d97706' }}
        />
      </Col>
      <Col span={8}>
        <Statistic
          title="Lebih dari 90 Hari"
          value={longOverdue}
          formatter={v => formatCurrency(v)}
          valueStyle={{ color: '#dc2626' }}
        />
      </Col>
    </Row>
  )
}

export default function ARAPAgingPage() {
  const [asOfDate, setAsOfDate] = useState(today())
  const [arData, setArData] = useState(null)
  const [apData, setApData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleLoad = async () => {
    setLoading(true)
    setError(null)
    try {
      const [ar, ap] = await Promise.all([
        getARAgingData(asOfDate),
        getAPAgingData(asOfDate),
      ])
      setArData(ar || [])
      setApData(ap || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const arRows = arData ? buildRows(arData, 'customer', asOfDate) : []
  const apRows = apData ? buildRows(apData, 'supplier', asOfDate) : []
  const columns = buildColumns()

  const exportPDF = () => {
    const doc = new jsPDF('landscape')
    doc.setFontSize(16)
    doc.text('Laporan AR/AP Aging', 14, 15)
    doc.setFontSize(10)
    doc.text(`Per Tanggal: ${asOfDate}`, 14, 23)

    let y = 32
    const addSection = (title, rows) => {
      doc.setFontSize(12)
      doc.text(title, 14, y)
      y += 5
      doc.autoTable({
        startY: y,
        head: [['Invoice/Pihak', 'Tanggal', 'Jatuh Tempo', 'Total', 'Dibayar', 'Sisa', 'Bucket']],
        body: rows.map(row => {
          if (row.isGroupHeader) {
            return [row.partyName, '', '', '', '', formatCurrency(row.grandBalance), 'Subtotal']
          }
          return [
            row.invoiceNumber,
            formatDate(row.date),
            row.dueDate ? formatDate(row.dueDate) : '-',
            formatCurrency(row.total),
            formatCurrency(row.amountPaid),
            formatCurrency(row.balance),
            BUCKET_LABELS[row.bucket],
          ]
        }),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [52, 73, 94] },
      })
      y = doc.lastAutoTable.finalY + 10
    }

    addSection('Piutang / AR', arRows)
    if (y > 150) {
      doc.addPage()
      y = 20
    }
    addSection('Utang / AP', apRows)

    doc.save(`ar-ap-aging-${asOfDate}.pdf`)
  }

  const exportExcel = () => {
    const makeRows = (rows) => [
      ['Invoice/Pihak', 'Tanggal', 'Jatuh Tempo', 'Total', 'Dibayar', 'Sisa', 'Bucket'],
      ...rows.map(row => {
        if (row.isGroupHeader) {
          return [row.partyName, '', '', '', '', row.grandBalance, 'Subtotal']
        }
        return [
          row.invoiceNumber,
          row.date,
          row.dueDate || '',
          row.total,
          row.amountPaid,
          row.balance,
          BUCKET_LABELS[row.bucket],
        ]
      }),
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(makeRows(arRows)), 'Piutang AR')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(makeRows(apRows)), 'Utang AP')
    XLSX.writeFile(wb, `ar-ap-aging-${asOfDate}.xlsx`)
  }

  const tabItems = [
    {
      key: 'ar',
      label: `Piutang / AR (${arData ? arData.length : 0})`,
      children: arData && !loading ? (
        <Space direction="vertical" style={{ width: '100%' }}>
          <SummaryStats rows={arRows} />
          <Card
            title={<Text strong style={{ color: '#1d4ed8' }}>Aging Piutang per Customer</Text>}
            size="small"
            styles={{ body: { padding: 0 } }}
          >
            <Table
              dataSource={arRows}
              columns={columns}
              rowKey="key"
              pagination={false}
              size="small"
              rowClassName={row => row.isGroupHeader ? 'aging-group-header' : ''}
              locale={{ emptyText: 'Tidak ada piutang outstanding' }}
            />
          </Card>
        </Space>
      ) : null,
    },
    {
      key: 'ap',
      label: `Utang / AP (${apData ? apData.length : 0})`,
      children: apData && !loading ? (
        <Space direction="vertical" style={{ width: '100%' }}>
          <SummaryStats rows={apRows} />
          <Card
            title={<Text strong style={{ color: '#991b1b' }}>Aging Utang per Supplier</Text>}
            size="small"
            styles={{ body: { padding: 0 } }}
          >
            <Table
              dataSource={apRows}
              columns={columns}
              rowKey="key"
              pagination={false}
              size="small"
              rowClassName={row => row.isGroupHeader ? 'aging-group-header' : ''}
              locale={{ emptyText: 'Tidak ada utang outstanding' }}
            />
          </Card>
        </Space>
      ) : null,
    },
  ]

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Title level={2}>Laporan AR/AP Aging</Title>

      <Space align="end">
        <DateInput
          label="Per Tanggal"
          value={asOfDate}
          onChange={e => setAsOfDate(e.target.value)}
        />
        <Button variant="primary" onClick={handleLoad} loading={loading}>
          <Search size={16} /> Tampilkan
        </Button>
      </Space>

      {loading && <LoadingSpinner message="Memuat data aging..." />}
      {error && <Alert type="error" message={error} showIcon />}

      {(arData || apData) && !loading && (
        <Space direction="vertical" style={{ width: '100%' }}>
          <Space>
            <AntButton icon={<FileText size={14} />} onClick={exportPDF}>
              Export PDF
            </AntButton>
            <AntButton icon={<Download size={14} />} onClick={exportExcel}>
              Export Excel
            </AntButton>
          </Space>

          <Tabs defaultActiveKey="ar" items={tabItems} />
        </Space>
      )}
    </Space>
  )
}
