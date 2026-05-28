import { useState } from 'react'
import { jsPDF } from 'jspdf'
import 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { getTrialBalance } from '../../services/reportService'
import { formatCurrency } from '../../utils/currency'
import { today } from '../../utils/date'
import Button from '../../components/ui/Button'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import DateInput from '../../components/ui/DateInput'
import { Download, FileText, Search } from 'lucide-react'
import {
  Button as AntButton, Space, Card, Typography, Alert, Table, Row, Col, Statistic,
} from 'antd'

const { Title, Text } = Typography

export default function TrialBalancePage() {
  const [asOfDate, setAsOfDate] = useState(today())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleLoad() {
    setLoading(true)
    setError(null)
    try {
      const rows = await getTrialBalance(asOfDate)
      setData(rows || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const totalDebit = data ? data.reduce((sum, row) => sum + Number(row.total_debit), 0) : 0
  const totalCredit = data ? data.reduce((sum, row) => sum + Number(row.total_credit), 0) : 0
  const isBalanced = data && data.length > 0 && Math.abs(totalDebit - totalCredit) < 0.01
  const isEmpty = data && data.length === 0

  const exportPDF = () => {
    const doc = new jsPDF()
    doc.setFontSize(16)
    doc.text('Neraca Saldo (Trial Balance)', 14, 15)
    doc.setFontSize(10)
    doc.text(`Per Tanggal: ${asOfDate}`, 14, 23)

    doc.autoTable({
      startY: 32,
      head: [['Kode', 'Nama Akun', 'Tipe', 'Debit', 'Kredit', 'Saldo']],
      body: data.map(row => [
        row.code,
        row.name,
        row.type,
        formatCurrency(row.total_debit),
        formatCurrency(row.total_credit),
        formatCurrency(row.balance),
      ]),
      foot: [['', '', 'Total', formatCurrency(totalDebit), formatCurrency(totalCredit), '']],
      styles: { fontSize: 8 },
      headStyles: { fillColor: [52, 73, 94] },
      footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' },
    })

    doc.save(`neraca-saldo-${asOfDate}.pdf`)
  }

  const exportExcel = () => {
    const rows = [
      ['Neraca Saldo (Trial Balance)'],
      [`Per Tanggal: ${asOfDate}`],
      [],
      ['Kode', 'Nama Akun', 'Tipe', 'Debit', 'Kredit', 'Saldo'],
      ...data.map(row => [
        row.code,
        row.name,
        row.type,
        Number(row.total_debit),
        Number(row.total_credit),
        Number(row.balance),
      ]),
      ['', '', 'Total', totalDebit, totalCredit, ''],
    ]

    const ws = XLSX.utils.aoa_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Neraca Saldo')
    XLSX.writeFile(wb, `neraca-saldo-${asOfDate}.xlsx`)
  }

  const columns = [
    {
      title: 'Kode',
      dataIndex: 'code',
      key: 'code',
      width: 90,
      render: value => <Text type="secondary">{value}</Text>,
    },
    {
      title: 'Nama Akun',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'Tipe',
      dataIndex: 'type',
      key: 'type',
      width: 120,
      render: value => <Text type="secondary" style={{ textTransform: 'capitalize' }}>{value}</Text>,
    },
    {
      title: 'Debit',
      dataIndex: 'total_debit',
      key: 'total_debit',
      align: 'right',
      width: 150,
      render: value => <Text>{formatCurrency(value)}</Text>,
    },
    {
      title: 'Kredit',
      dataIndex: 'total_credit',
      key: 'total_credit',
      align: 'right',
      width: 150,
      render: value => <Text>{formatCurrency(value)}</Text>,
    },
    {
      title: 'Saldo',
      dataIndex: 'balance',
      key: 'balance',
      align: 'right',
      width: 150,
      render: value => (
        <Text strong style={{ color: Number(value) < 0 ? '#ff4d4f' : undefined }}>
          {formatCurrency(value)}
        </Text>
      ),
    },
  ]

  const footer = () => (
    <Row justify="space-between" align="middle">
      <Col>
        <Text strong>Total</Text>
      </Col>
      <Col style={{ textAlign: 'right', minWidth: 300 }}>
        <Space size="large">
          <Text strong>Debit: {formatCurrency(totalDebit)}</Text>
          <Text strong>Kredit: {formatCurrency(totalCredit)}</Text>
        </Space>
      </Col>
    </Row>
  )

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Title level={2} style={{ margin: 0 }}>Neraca Saldo (Trial Balance)</Title>

      <Card>
        <Space direction="horizontal" size="middle" wrap>
          <div>
            <Text strong>Per Tanggal</Text>
            <div style={{ marginTop: 4 }}>
              <DateInput value={asOfDate} onChange={event => setAsOfDate(event.target.value)} />
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
          {isEmpty ? (
            <Alert message="Tidak ada jurnal terposting untuk periode ini." type="info" showIcon />
          ) : isBalanced ? (
            <Alert message="Pembukuan balance — total debit = total kredit." type="success" showIcon />
          ) : (
            <Alert
              message={`Pembukuan TIDAK balance! Selisih: ${formatCurrency(Math.abs(totalDebit - totalCredit))}`}
              type="error"
              showIcon
            />
          )}

          <Row gutter={16}>
            <Col xs={12} sm={6}>
              <Statistic title="Total Akun Aktif" value={data.length} />
            </Col>
            <Col xs={12} sm={6}>
              <Statistic title="Total Debit" value={formatCurrency(totalDebit)} />
            </Col>
            <Col xs={12} sm={6}>
              <Statistic title="Total Kredit" value={formatCurrency(totalCredit)} />
            </Col>
          </Row>

          {!isEmpty && (
            <Space>
              <AntButton icon={<FileText size={14} />} onClick={exportPDF}>
                Export PDF
              </AntButton>
              <AntButton icon={<Download size={14} />} onClick={exportExcel}>
                Export Excel
              </AntButton>
            </Space>
          )}

          <Card
            title={`Neraca Saldo per ${asOfDate}`}
            styles={{ body: { padding: 0 } }}
          >
            <Table
              dataSource={data}
              columns={columns}
              rowKey="coa_id"
              pagination={false}
              size="small"
              footer={footer}
              locale={{ emptyText: 'Tidak ada data' }}
            />
          </Card>
        </>
      )}
    </Space>
  )
}
