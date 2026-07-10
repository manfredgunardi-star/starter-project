import { useState, useEffect } from 'react'
import { Space, Typography, Card, Table, Tag, Alert, Modal, Popconfirm } from 'antd'
import { Lock, Unlock } from 'lucide-react'
import { useToast } from '../../components/ui/ToastContext'
import Button from '../../components/ui/Button'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { formatCurrency } from '../../utils/currency'
import {
  listFiscalYearsStatus,
  previewFiscalYearClosing,
  closeFiscalYear,
  reverseFiscalYearClosing,
} from '../../services/fiscalYearClosingService'

const { Title, Text } = Typography

export default function FiscalYearClosingPage() {
  const toast = useToast()
  const [years, setYears] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [previewYear, setPreviewYear] = useState(null)
  const [previewData, setPreviewData] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      const data = await listFiscalYearsStatus()
      setYears(data || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const currentYear = new Date().getFullYear()
  const openYears = years.filter(y => y.status === 'open' && y.fiscal_year < currentYear).sort((a, b) => a.fiscal_year - b.fiscal_year)
  const closedYears = years.filter(y => y.status === 'closed').sort((a, b) => b.fiscal_year - a.fiscal_year)
  const nextToClose = openYears[0] ?? null
  const lastClosed = closedYears[0] ?? null

  async function openPreview(year) {
    setPreviewYear(year)
    setPreviewLoading(true)
    try {
      const data = await previewFiscalYearClosing(year)
      setPreviewData(data || [])
    } catch (err) {
      toast.error(err.message)
      setPreviewYear(null)
    } finally {
      setPreviewLoading(false)
    }
  }

  async function handleConfirmClose() {
    setActionLoading(true)
    try {
      await closeFiscalYear(previewYear)
      toast.success(`Tahun buku ${previewYear} berhasil ditutup`)
      setPreviewYear(null)
      setPreviewData(null)
      await loadData()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setActionLoading(false)
    }
  }

  async function handleReverse(year) {
    setActionLoading(true)
    try {
      await reverseFiscalYearClosing(year)
      toast.success(`Penutupan tahun buku ${year} berhasil dibatalkan`)
      await loadData()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setActionLoading(false)
    }
  }

  const totalRevenue = (previewData || []).filter(a => a.type === 'revenue').reduce((s, a) => s + Number(a.balance), 0)
  const totalExpense = (previewData || []).filter(a => a.type === 'expense').reduce((s, a) => s + Number(a.balance), 0)
  const netIncome = totalRevenue - totalExpense

  const columns = [
    { title: 'Tahun', dataIndex: 'fiscal_year', key: 'fiscal_year', width: 100 },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 160,
      render: status => status === 'closed'
        ? <Tag color="red" icon={<Lock size={12} style={{ marginRight: 4 }} />}>Ditutup</Tag>
        : <Tag color="green" icon={<Unlock size={12} style={{ marginRight: 4 }} />}>Terbuka</Tag>,
    },
    {
      title: 'Laba (Rugi) Bersih',
      dataIndex: 'net_income',
      key: 'net_income',
      render: v => v == null ? '—' : formatCurrency(v),
    },
    {
      title: 'Aksi',
      key: 'action',
      width: 200,
      render: (_, row) => {
        if (row.status === 'open' && nextToClose && row.fiscal_year === nextToClose.fiscal_year) {
          return (
            <Button variant="primary" size="sm" onClick={() => openPreview(row.fiscal_year)}>
              Preview & Tutup
            </Button>
          )
        }
        if (row.status === 'closed' && lastClosed && row.fiscal_year === lastClosed.fiscal_year) {
          return (
            <Popconfirm
              title={`Batalkan penutupan tahun ${row.fiscal_year}?`}
              description="Jurnal penutup akan dibalik dan 12 bulan tahun ini dibuka kembali."
              onConfirm={() => handleReverse(row.fiscal_year)}
              okText="Ya, Batalkan"
              cancelText="Batal"
            >
              <Button variant="danger" size="sm" loading={actionLoading}>Batalkan Penutupan</Button>
            </Popconfirm>
          )
        }
        return <Text type="secondary">—</Text>
      },
    },
  ]

  if (loading) return <LoadingSpinner message="Memuat status tahun buku..." />

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={24}>
      <Title level={3} style={{ margin: 0 }}>Tutup Tahun Buku</Title>

      <Alert
        type="info"
        showIcon
        message="Menutup tahun buku memindahkan saldo Pendapatan dan Beban tahun tersebut ke akun Laba Ditahan (3-12000) lewat jurnal penutup bertanggal 1 Januari tahun berikutnya, dan mengunci 12 bulan tahun itu dari transaksi baru. Hanya tahun yang sudah lewat penuh yang bisa ditutup, dan harus berurutan."
      />

      {error && <Alert type="error" message={error} showIcon />}

      <Card title="Status Tahun Buku" size="small">
        <Table
          dataSource={years}
          columns={columns}
          rowKey="fiscal_year"
          pagination={false}
          size="small"
        />
      </Card>

      <Modal
        title={`Preview Jurnal Penutup Tahun ${previewYear}`}
        open={previewYear !== null}
        onCancel={() => { setPreviewYear(null); setPreviewData(null) }}
        onOk={handleConfirmClose}
        okText="Tutup Tahun Buku"
        cancelText="Batal"
        confirmLoading={actionLoading}
        okButtonProps={{ danger: true }}
      >
        {previewLoading ? (
          <LoadingSpinner message="Menghitung..." />
        ) : (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Table
              dataSource={previewData || []}
              rowKey="coa_id"
              pagination={false}
              size="small"
              columns={[
                { title: 'Kode', dataIndex: 'code', width: 90 },
                { title: 'Nama Akun', dataIndex: 'name' },
                { title: 'Tipe', dataIndex: 'type', width: 90 },
                { title: 'Saldo', dataIndex: 'balance', align: 'right', render: v => formatCurrency(v) },
              ]}
              locale={{ emptyText: 'Tidak ada transaksi Pendapatan/Beban tahun ini' }}
            />
            <Text strong>Total Pendapatan: {formatCurrency(totalRevenue)}</Text>
            <Text strong>Total Beban: {formatCurrency(totalExpense)}</Text>
            <Text strong style={{ fontSize: 16 }}>
              {netIncome >= 0 ? 'Laba Bersih' : 'Rugi Bersih'}: {formatCurrency(Math.abs(netIncome))} → akan masuk ke akun 3-12000 (Laba Ditahan)
            </Text>
          </Space>
        )}
      </Modal>
    </Space>
  )
}
