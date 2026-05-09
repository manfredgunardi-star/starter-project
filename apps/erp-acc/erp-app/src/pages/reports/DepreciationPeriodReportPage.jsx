import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { listCategories } from '../../services/assetCategoryService'
import { formatCurrency } from '../../utils/currency'
import { jsPDF } from 'jspdf'
import 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { Download, FileText } from 'lucide-react'
import { Space, Card, Typography, Alert, Table, Select, Button } from 'antd'

const { Title, Text } = Typography

export default function DepreciationPeriodReportPage() {
  const [periodFrom, setPeriodFrom] = useState(new Date().getFullYear() + '-01')
  const [periodTo, setPeriodTo] = useState(new Date().toISOString().slice(0, 7))
  const [categoryId, setCategoryId] = useState('')
  const [categories, setCategories] = useState([])
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    listCategories().then(setCategories)
  }, [])

  async function handleLoad() {
    if (!periodFrom || !periodTo) {
      setError('Period from dan to wajib diisi.')
      return
    }
    if (periodFrom > periodTo) {
      setError('Period from tidak boleh setelah period to.')
      return
    }
    setError('')
    setLoading(true)
    try {
      let query = supabase
        .from('depreciation_schedules')
        .select('period, amount, asset_id, asset:assets(category_id, category:asset_categories(code, name))')
        .eq('status', 'posted')
        .gte('period', periodFrom)
        .lte('period', periodTo)

      const { data, error: dErr } = await query.order('period')
      if (dErr) throw dErr

      const grouped = {}
      data.forEach(d => {
        if (categoryId && d.asset.category_id !== categoryId) return
        const key = `${d.period}|${d.asset.category?.code || 'Unknown'}`
        if (!grouped[key]) {
          grouped[key] = {
            period: d.period,
            categoryCode: d.asset.category?.code || '—',
            categoryName: d.asset.category?.name || '—',
            count: 0,
            total: 0,
          }
        }
        grouped[key].count += 1
        grouped[key].total += Number(d.amount)
      })

      setRows(Object.values(grouped).sort((a, b) => {
        if (a.period !== b.period) return a.period.localeCompare(b.period)
        return a.categoryCode.localeCompare(b.categoryCode)
      }))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function exportPDF() {
    const doc = new jsPDF()
    doc.setFontSize(14)
    doc.text('Penyusutan per Periode', 14, 15)
    doc.setFontSize(10)
    doc.text(`${periodFrom} s.d. ${periodTo}`, 14, 22)

    const tableData = rows.map(r => [r.period, r.categoryCode, r.categoryName, r.count.toString(), formatCurrency(r.total)])
    doc.autoTable({
      head: [['Periode', 'Kat', 'Kategori', 'Jumlah', 'Total']],
      body: tableData,
      startY: 28,
      theme: 'grid',
      columnStyles: { 3: { halign: 'center' }, 4: { halign: 'right' } },
    })
    doc.save(`depreciation-period-${periodFrom}-${periodTo}.pdf`)
  }

  function exportExcel() {
    const ws = XLSX.utils.json_to_sheet(rows.map(r => ({
      Periode: r.period,
      Kategori: r.categoryName,
      'Jumlah Aset': r.count,
      'Total Penyusutan': r.total,
    })))
    ws['!cols'] = [{ wch: 12 }, { wch: 20 }, { wch: 14 }, { wch: 18 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Depreciation')
    XLSX.writeFile(wb, `depreciation-period-${periodFrom}-${periodTo}.xlsx`)
  }

  const totalAmount = rows.reduce((s, r) => s + r.total, 0)

  const categoryOptions = [
    { value: '', label: 'Semua' },
    ...categories.map(c => ({ value: c.id, label: c.name })),
  ]

  const columns = [
    { title: 'Periode', dataIndex: 'period', key: 'period', width: 110, render: v => <Text code>{v}</Text> },
    {
      title: 'Kategori',
      key: 'kategori',
      render: (_, r) => r.categoryName,
    },
    {
      title: 'Jumlah Aset',
      dataIndex: 'count',
      key: 'count',
      align: 'center',
      render: v => <Text type="secondary">{v}</Text>,
    },
    {
      title: 'Total Penyusutan',
      dataIndex: 'total',
      key: 'total',
      align: 'right',
      render: v => formatCurrency(v),
    },
  ]

  return (
    <div style={{ padding: 24 }}>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Title level={2}>Penyusutan per Periode</Title>

        <Space align="end" wrap>
          <Space direction="vertical" size={4}>
            <Text type="secondary" style={{ fontSize: 12 }}>Dari Periode</Text>
            <input
              type="month"
              value={periodFrom}
              onChange={e => setPeriodFrom(e.target.value)}
              style={{ border: '1px solid #d9d9d9', borderRadius: 6, padding: '4px 11px', fontSize: 14 }}
            />
          </Space>
          <Space direction="vertical" size={4}>
            <Text type="secondary" style={{ fontSize: 12 }}>Sampai Periode</Text>
            <input
              type="month"
              value={periodTo}
              onChange={e => setPeriodTo(e.target.value)}
              style={{ border: '1px solid #d9d9d9', borderRadius: 6, padding: '4px 11px', fontSize: 14 }}
            />
          </Space>
          <Space direction="vertical" size={4}>
            <Text type="secondary" style={{ fontSize: 12 }}>Kategori</Text>
            <Select
              value={categoryId}
              onChange={setCategoryId}
              options={categoryOptions}
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
                    <Table.Summary.Cell colSpan={3} index={0}>
                      <Text strong>Total</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={3} align="right">
                      <Text strong>{formatCurrency(totalAmount)}</Text>
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
