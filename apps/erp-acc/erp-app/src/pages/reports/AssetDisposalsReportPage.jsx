import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatCurrency } from '../../utils/currency'
import { formatDate } from '../../utils/date'
import { jsPDF } from 'jspdf'
import 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { Download, FileText } from 'lucide-react'
import DateInput from '../../components/ui/DateInput'
import { Space, Card, Typography, Alert, Table, Select, Button, Tag } from 'antd'

const { Title, Text } = Typography

export default function AssetDisposalsReportPage() {
  const [dateFrom, setDateFrom] = useState(new Date(new Date().setFullYear(new Date().getFullYear() - 1)).toISOString().slice(0, 10))
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10))
  const [disposalType, setDisposalType] = useState('all')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLoad() {
    if (!dateFrom || !dateTo) {
      setError('Tanggal from dan to wajib diisi.')
      return
    }
    if (dateFrom > dateTo) {
      setError('Tanggal from tidak boleh setelah date to.')
      return
    }
    setError('')
    setLoading(true)
    try {
      let query = supabase
        .from('asset_disposals')
        .select('disposal_date, disposal_type, sale_price, asset:assets(code, name, acquisition_cost)')
        .gte('disposal_date', dateFrom)
        .lte('disposal_date', dateTo)

      if (disposalType !== 'all') query = query.eq('disposal_type', disposalType)

      const { data, error: dErr } = await query.order('disposal_date', { ascending: false })
      if (dErr) throw dErr

      const result = data.map(d => ({
        disposalDate: d.disposal_date,
        code: d.asset?.code || '—',
        name: d.asset?.name || '—',
        type: d.disposal_type,
        salePrice: d.sale_price || 0,
        acquisitionCost: d.asset?.acquisition_cost || 0,
        bookValue: d.asset?.acquisition_cost || 0,
        gainLoss: d.disposal_type === 'sale' ? (d.sale_price - (d.asset?.acquisition_cost || 0)) : -(d.asset?.acquisition_cost || 0),
      }))
      setRows(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function exportPDF() {
    const doc = new jsPDF()
    doc.setFontSize(14)
    doc.text('Laporan Disposal Aset', 14, 15)
    doc.setFontSize(10)
    doc.text(`${formatDate(dateFrom)} s.d. ${formatDate(dateTo)}`, 14, 22)

    const tableData = rows.map(r => [
      formatDate(r.disposalDate),
      r.code,
      r.name,
      r.type === 'sale' ? 'Penjualan' : 'Penghapusan',
      formatCurrency(r.salePrice),
      r.type === 'sale' ? formatCurrency(r.gainLoss) : '—',
    ])
    doc.autoTable({
      head: [['Tgl', 'Kode', 'Nama', 'Tipe', 'Harga Jual', 'Gain/Loss']],
      body: tableData,
      startY: 28,
      theme: 'grid',
      columnStyles: { 4: { halign: 'right' }, 5: { halign: 'right' } },
    })
    doc.save(`asset-disposals-${dateFrom}-${dateTo}.pdf`)
  }

  function exportExcel() {
    const ws = XLSX.utils.json_to_sheet(rows.map(r => ({
      Tanggal: r.disposalDate,
      Kode: r.code,
      Nama: r.name,
      Tipe: r.type === 'sale' ? 'Penjualan' : 'Penghapusan',
      'Harga Jual': r.salePrice,
      'Gain/Loss': r.gainLoss,
    })))
    ws['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 25 }, { wch: 14 }, { wch: 15 }, { wch: 15 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Disposals')
    XLSX.writeFile(wb, `asset-disposals-${dateFrom}-${dateTo}.xlsx`)
  }

  const totalSalePrice = rows.reduce((s, r) => s + r.salePrice, 0)
  const totalGainLoss = rows.reduce((s, r) => s + r.gainLoss, 0)

  const disposalTypeOptions = [
    { value: 'all', label: 'Semua' },
    { value: 'sale', label: 'Penjualan' },
    { value: 'writeoff', label: 'Penghapusan' },
  ]

  const columns = [
    { title: 'Tanggal', dataIndex: 'disposalDate', key: 'disposalDate', width: 110, render: v => <Text code>{formatDate(v)}</Text> },
    { title: 'Kode', dataIndex: 'code', key: 'code', width: 90, render: v => <Text code>{v}</Text> },
    { title: 'Nama', dataIndex: 'name', key: 'name' },
    {
      title: 'Tipe',
      dataIndex: 'type',
      key: 'type',
      render: v => <Tag color={v === 'sale' ? 'blue' : 'red'}>{v === 'sale' ? 'Penjualan' : 'Penghapusan'}</Tag>,
    },
    { title: 'Harga Jual', dataIndex: 'salePrice', key: 'salePrice', align: 'right', render: v => formatCurrency(v) },
    {
      title: 'Gain/Loss',
      dataIndex: 'gainLoss',
      key: 'gainLoss',
      align: 'right',
      render: v => <Text strong type={v >= 0 ? 'success' : 'danger'}>{formatCurrency(v)}</Text>,
    },
  ]

  return (
    <div style={{ padding: 24 }}>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Title level={2}>Disposal Aset</Title>

        <Space align="end" wrap>
          <DateInput
            label="Dari Tanggal"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
          />
          <DateInput
            label="Sampai Tanggal"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
          />
          <Space direction="vertical" size={4}>
            <Text type="secondary" style={{ fontSize: 12 }}>Tipe Disposal</Text>
            <Select
              value={disposalType}
              onChange={setDisposalType}
              options={disposalTypeOptions}
              style={{ width: 160 }}
            />
          </Space>
          <Button type="primary" onClick={handleLoad} loading={loading}>
            Tampilkan
          </Button>
        </Space>

        {error && <Alert type="error" message={error} showIcon />}

        {rows.length > 0 && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Space>
              <Button icon={<FileText size={14} />} onClick={exportPDF}>Export PDF</Button>
              <Button icon={<Download size={14} />} onClick={exportExcel}>Export Excel</Button>
            </Space>

            <Card styles={{ body: { padding: 0 } }}>
              <Table
                dataSource={rows}
                columns={columns}
                rowKey={(_, i) => i}
                pagination={false}
                size="small"
                summary={() => (
                  <Table.Summary.Row>
                    <Table.Summary.Cell colSpan={4} index={0}>
                      <Text strong>Total ({rows.length})</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={4} align="right">
                      <Text strong>{formatCurrency(totalSalePrice)}</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={5} align="right">
                      <Text strong type={totalGainLoss >= 0 ? 'success' : 'danger'}>
                        {formatCurrency(totalGainLoss)}
                      </Text>
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                )}
              />
            </Card>
          </Space>
        )}

        {rows.length === 0 && !loading && !error && (
          <Text type="secondary" style={{ display: 'block', textAlign: 'center', padding: '32px 0' }}>
            Klik "Tampilkan" untuk melihat laporan.
          </Text>
        )}

        {loading && (
          <Text type="secondary" style={{ display: 'block', textAlign: 'center', padding: '32px 0' }}>
            Memuat...
          </Text>
        )}
      </Space>
    </div>
  )
}
