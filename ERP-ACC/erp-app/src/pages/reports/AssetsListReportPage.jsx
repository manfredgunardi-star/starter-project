import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { listCategories } from '../../services/assetCategoryService'
import { formatCurrency } from '../../utils/currency'
import { formatDate } from '../../utils/date'
import { jsPDF } from 'jspdf'
import 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { Download, FileText } from 'lucide-react'
import DateInput from '../../components/ui/DateInput'
import { Space, Card, Row, Col, Typography, Alert, Table, Select, Button } from 'antd'

const { Title, Text } = Typography

export default function AssetsListReportPage() {
  const [cutOffDate, setCutOffDate] = useState(new Date().toISOString().slice(0, 10))
  const [categoryId, setCategoryId] = useState('')
  const [status, setStatus] = useState('all')
  const [categories, setCategories] = useState([])
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    listCategories().then(setCategories)
  }, [])

  async function handleLoad() {
    if (!cutOffDate) {
      setError('Tanggal cutoff wajib diisi.')
      return
    }
    setError('')
    setLoading(true)
    try {
      let query = supabase
        .from('assets')
        .select('id, code, name, acquisition_date, acquisition_cost, status, category_id, category:asset_categories(name)')
        .eq('is_active', true)

      if (categoryId) query = query.eq('category_id', categoryId)
      if (status !== 'all') query = query.eq('status', status)

      const { data: assets, error: aErr } = await query.order('code')
      if (aErr) throw aErr

      const result = await Promise.all(
        assets.map(async (asset) => {
          const { data: schedules, error: sErr } = await supabase
            .from('depreciation_schedules')
            .select('amount')
            .eq('asset_id', asset.id)
            .eq('status', 'posted')
            .lte('period', cutOffDate.slice(0, 7))
          if (sErr) throw sErr

          const accumulated = schedules.reduce((sum, s) => sum + Number(s.amount), 0)
          const bookValue = asset.acquisition_cost - accumulated

          return {
            code: asset.code,
            name: asset.name,
            category: asset.category?.name || '—',
            acquisitionDate: asset.acquisition_date,
            acquisitionCost: asset.acquisition_cost,
            accumulated,
            bookValue,
            status: asset.status,
          }
        })
      )
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
    doc.text('Daftar Aset Tetap', 14, 15)
    doc.setFontSize(10)
    doc.text(`Per: ${formatDate(cutOffDate)}`, 14, 22)

    const tableData = rows.map(r => [
      r.code,
      r.name,
      r.category,
      formatDate(r.acquisitionDate),
      formatCurrency(r.acquisitionCost),
      formatCurrency(r.accumulated),
      formatCurrency(r.bookValue),
    ])

    doc.autoTable({
      head: [['Kode', 'Nama', 'Kategori', 'Tgl Perolehan', 'Harga', 'Akumulasi', 'Nilai Buku']],
      body: tableData,
      startY: 28,
      theme: 'grid',
      columnStyles: {
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right' },
      },
    })

    doc.save(`assets-list-${cutOffDate}.pdf`)
  }

  function exportExcel() {
    const ws = XLSX.utils.json_to_sheet(
      rows.map(r => ({
        Kode: r.code,
        Nama: r.name,
        Kategori: r.category,
        'Tgl Perolehan': r.acquisitionDate,
        'Harga Perolehan': r.acquisitionCost,
        'Akumulasi Penyusutan': r.accumulated,
        'Nilai Buku': r.bookValue,
      }))
    )
    ws['!cols'] = [{ wch: 12 }, { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 18 }, { wch: 15 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Assets')
    XLSX.writeFile(wb, `assets-list-${cutOffDate}.xlsx`)
  }

  const total = {
    acquisitionCost: rows.reduce((s, r) => s + r.acquisitionCost, 0),
    accumulated: rows.reduce((s, r) => s + r.accumulated, 0),
    bookValue: rows.reduce((s, r) => s + r.bookValue, 0),
  }

  const columns = [
    { title: 'Kode', dataIndex: 'code', key: 'code', width: 100, render: v => <Text code>{v}</Text> },
    { title: 'Nama', dataIndex: 'name', key: 'name' },
    { title: 'Kategori', dataIndex: 'category', key: 'category', render: v => <Text type="secondary">{v}</Text> },
    { title: 'Tgl Perolehan', dataIndex: 'acquisitionDate', key: 'acquisitionDate', render: v => <Text code>{formatDate(v)}</Text> },
    { title: 'Harga Perolehan', dataIndex: 'acquisitionCost', key: 'acquisitionCost', align: 'right', render: v => formatCurrency(v) },
    { title: 'Akumulasi', dataIndex: 'accumulated', key: 'accumulated', align: 'right', render: v => formatCurrency(v) },
    { title: 'Nilai Buku', dataIndex: 'bookValue', key: 'bookValue', align: 'right', render: v => <Text strong>{formatCurrency(v)}</Text> },
  ]

  const categoryOptions = [
    { value: '', label: 'Semua' },
    ...categories.map(c => ({ value: c.id, label: c.name })),
  ]

  const statusOptions = [
    { value: 'all', label: 'Semua' },
    { value: 'active', label: 'Aktif' },
    { value: 'disposed', label: 'Dilepas' },
    { value: 'fully_depreciated', label: 'Penyusutan Selesai' },
  ]

  return (
    <div style={{ padding: 24 }}>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Title level={2}>Daftar Aset Tetap</Title>

        <Space align="end" wrap>
          <DateInput
            label="Cutoff Date"
            value={cutOffDate}
            onChange={e => setCutOffDate(e.target.value)}
          />
          <Space direction="vertical" size={4}>
            <Text type="secondary" style={{ fontSize: 12 }}>Kategori</Text>
            <Select
              value={categoryId}
              onChange={setCategoryId}
              options={categoryOptions}
              style={{ width: 160 }}
            />
          </Space>
          <Space direction="vertical" size={4}>
            <Text type="secondary" style={{ fontSize: 12 }}>Status</Text>
            <Select
              value={status}
              onChange={setStatus}
              options={statusOptions}
              style={{ width: 200 }}
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
                      <Text strong>Total ({rows.length} aset)</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={4} align="right">
                      <Text strong>{formatCurrency(total.acquisitionCost)}</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={5} align="right">
                      <Text strong>{formatCurrency(total.accumulated)}</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={6} align="right">
                      <Text strong>{formatCurrency(total.bookValue)}</Text>
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
