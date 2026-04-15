import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatCurrency } from '../../utils/currency'
import { jsPDF } from 'jspdf'
import 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { Download, FileText } from 'lucide-react'
import DateInput from '../../components/ui/DateInput'
import { Space, Card, Typography, Alert, Table, Button } from 'antd'

const { Title, Text } = Typography

export default function AssetsSummaryReportPage() {
  const [cutOffDate, setCutOffDate] = useState(new Date().toISOString().slice(0, 10))
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLoad() {
    if (!cutOffDate) {
      setError('Tanggal cutoff wajib diisi.')
      return
    }
    setError('')
    setLoading(true)
    try {
      const { data: assets, error: aErr } = await supabase
        .from('assets')
        .select('id, acquisition_cost, category_id, category:asset_categories(id, code, name)')
        .eq('is_active', true)
      if (aErr) throw aErr

      const byCategory = {}
      await Promise.all(
        assets.map(async (asset) => {
          const catKey = asset.category?.id || 'unknown'
          if (!byCategory[catKey]) {
            byCategory[catKey] = {
              code: asset.category?.code || '—',
              name: asset.category?.name || '—',
              count: 0,
              totalAcquisition: 0,
              totalAccumulated: 0,
            }
          }

          const { data: schedules } = await supabase
            .from('depreciation_schedules')
            .select('amount')
            .eq('asset_id', asset.id)
            .eq('status', 'posted')
            .lte('period', cutOffDate.slice(0, 7))

          const accumulated = schedules?.reduce((s, r) => s + Number(r.amount), 0) || 0
          byCategory[catKey].count += 1
          byCategory[catKey].totalAcquisition += Number(asset.acquisition_cost)
          byCategory[catKey].totalAccumulated += accumulated
        })
      )

      const result = Object.values(byCategory)
        .map(r => ({
          ...r,
          bookValue: r.totalAcquisition - r.totalAccumulated,
        }))
        .sort((a, b) => a.code.localeCompare(b.code))

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
    doc.text('Ringkasan Aset Tetap per Kategori', 14, 15)
    doc.setFontSize(10)
    doc.text(`Per: ${cutOffDate}`, 14, 22)

    const tableData = rows.map(r => [
      r.code,
      r.name,
      r.count.toString(),
      formatCurrency(r.totalAcquisition),
      formatCurrency(r.totalAccumulated),
      formatCurrency(r.bookValue),
    ])

    doc.autoTable({
      head: [['Kode', 'Kategori', 'Jumlah', 'Total Harga', 'Total Akum', 'Nilai Buku']],
      body: tableData,
      startY: 28,
      theme: 'grid',
      columnStyles: {
        2: { halign: 'center' },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
      },
    })

    doc.save(`assets-summary-${cutOffDate}.pdf`)
  }

  function exportExcel() {
    const ws = XLSX.utils.json_to_sheet(rows.map(r => ({
      Kategori: r.name,
      'Jumlah Aset': r.count,
      'Total Harga Perolehan': r.totalAcquisition,
      'Total Akumulasi': r.totalAccumulated,
      'Nilai Buku': r.bookValue,
    })))
    ws['!cols'] = [{ wch: 20 }, { wch: 14 }, { wch: 20 }, { wch: 18 }, { wch: 15 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Summary')
    XLSX.writeFile(wb, `assets-summary-${cutOffDate}.xlsx`)
  }

  const totals = {
    count: rows.reduce((s, r) => s + r.count, 0),
    acquisition: rows.reduce((s, r) => s + r.totalAcquisition, 0),
    accumulated: rows.reduce((s, r) => s + r.totalAccumulated, 0),
    bookValue: rows.reduce((s, r) => s + r.bookValue, 0),
  }

  const columns = [
    {
      title: 'Kategori',
      key: 'kategori',
      render: (_, r) => <><Text code>{r.code}</Text> {r.name}</>,
    },
    {
      title: 'Jumlah Aset',
      dataIndex: 'count',
      key: 'count',
      align: 'center',
      render: v => <Text type="secondary">{v}</Text>,
    },
    {
      title: 'Total Harga Perolehan',
      dataIndex: 'totalAcquisition',
      key: 'totalAcquisition',
      align: 'right',
      render: v => formatCurrency(v),
    },
    {
      title: 'Total Akumulasi',
      dataIndex: 'totalAccumulated',
      key: 'totalAccumulated',
      align: 'right',
      render: v => formatCurrency(v),
    },
    {
      title: 'Nilai Buku',
      dataIndex: 'bookValue',
      key: 'bookValue',
      align: 'right',
      render: v => <Text strong>{formatCurrency(v)}</Text>,
    },
  ]

  return (
    <div style={{ padding: 24 }}>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Title level={2}>Ringkasan Aset Tetap per Kategori</Title>

        <Space align="end" wrap>
          <DateInput
            label="Cutoff Date"
            value={cutOffDate}
            onChange={e => setCutOffDate(e.target.value)}
          />
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
                    <Table.Summary.Cell index={0}>
                      <Text strong>Total ({totals.count} aset)</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={1} align="center">
                      <Text strong>{totals.count}</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={2} align="right">
                      <Text strong>{formatCurrency(totals.acquisition)}</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={3} align="right">
                      <Text strong>{formatCurrency(totals.accumulated)}</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={4} align="right">
                      <Text strong>{formatCurrency(totals.bookValue)}</Text>
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
