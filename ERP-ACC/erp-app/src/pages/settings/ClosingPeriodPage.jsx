import { useState, useEffect } from 'react'
import {
  Space, Typography, Card, Table, Tag, Alert, Select, Row, Col, Popconfirm
} from 'antd'
import { Lock, Unlock } from 'lucide-react'
import { useToast } from '../../components/ui/ToastContext'
import Button from '../../components/ui/Button'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import {
  getClosedPeriods,
  closeAccountingPeriod,
  reopenAccountingPeriod,
} from '../../services/companySettingsService'
import { formatPeriodKey } from '../../utils/periodUtils'

const { Title, Text } = Typography

const MONTHS_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
]

function buildPeriodRows(closedPeriods) {
  const currentYear = new Date().getFullYear()
  const rows = []
  for (let y = currentYear; y >= currentYear - 2; y--) {
    for (let m = 12; m >= 1; m--) {
      const key = formatPeriodKey(y, m)
      rows.push({
        key,
        year: y,
        month: m,
        label: `${MONTHS_ID[m - 1]} ${y}`,
        closed: closedPeriods.includes(key),
      })
    }
  }
  return rows
}

export default function ClosingPeriodPage() {
  const toast = useToast()
  const [closedPeriods, setClosedPeriods] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionLoading, setActionLoading] = useState(null)

  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      const { closedPeriods: cp } = await getClosedPeriods()
      setClosedPeriods(cp)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleClose(periodKey) {
    setActionLoading(periodKey)
    try {
      await closeAccountingPeriod(periodKey)
      toast.success(`Periode ${periodKey} berhasil ditutup`)
      await loadData()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setActionLoading(null)
    }
  }

  async function handleReopen(periodKey) {
    setActionLoading(periodKey)
    try {
      await reopenAccountingPeriod(periodKey)
      toast.success(`Periode ${periodKey} berhasil dibuka kembali`)
      await loadData()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setActionLoading(null)
    }
  }

  const currentYear = new Date().getFullYear()
  const yearOptions = [currentYear, currentYear - 1, currentYear - 2].map(y => ({
    label: String(y), value: y
  }))
  const monthOptions = MONTHS_ID.map((label, i) => ({ label, value: i + 1 }))

  const rows = closedPeriods ? buildPeriodRows(closedPeriods) : []

  const columns = [
    {
      title: 'Periode',
      dataIndex: 'label',
      key: 'label',
      render: (label, row) => (
        <Text strong={row.closed}>{label}</Text>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'closed',
      key: 'status',
      width: 140,
      render: closed => closed
        ? <Tag color="red" icon={<Lock size={12} style={{ marginRight: 4 }} />}>Ditutup</Tag>
        : <Tag color="green" icon={<Unlock size={12} style={{ marginRight: 4 }} />}>Terbuka</Tag>,
    },
    {
      title: 'Aksi',
      key: 'action',
      width: 160,
      render: (_, row) =>
        row.closed ? (
          <Popconfirm
            title={`Buka kembali periode ${row.label}?`}
            description="Transaksi baru akan bisa diposting ke periode ini."
            onConfirm={() => handleReopen(row.key)}
            okText="Ya, Buka"
            cancelText="Batal"
          >
            <Button
              variant="secondary"
              size="sm"
              loading={actionLoading === row.key}
            >
              Buka Kembali
            </Button>
          </Popconfirm>
        ) : (
          <Popconfirm
            title={`Tutup periode ${row.label}?`}
            description="Tidak ada transaksi baru yang bisa diposting ke periode ini."
            onConfirm={() => handleClose(row.key)}
            okText="Ya, Tutup"
            cancelText="Batal"
          >
            <Button
              variant="danger"
              size="sm"
              loading={actionLoading === row.key}
            >
              Tutup Periode
            </Button>
          </Popconfirm>
        ),
    },
  ]

  if (loading) return <LoadingSpinner message="Memuat data periode..." />

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={24}>
      <Title level={3} style={{ margin: 0 }}>Closing Period</Title>

      <Alert
        type="info"
        showIcon
        message="Periode yang ditutup tidak bisa menerima transaksi baru (jurnal, invoice, pembayaran). Admin dapat membuka kembali periode yang sudah ditutup jika diperlukan."
      />

      {error && <Alert type="error" message={error} showIcon />}

      <Card title="Tutup Periode Cepat" size="small">
        <Row gutter={12} align="middle">
          <Col>
            <Select
              value={selectedMonth}
              options={monthOptions}
              onChange={setSelectedMonth}
              style={{ width: 150 }}
            />
          </Col>
          <Col>
            <Select
              value={selectedYear}
              options={yearOptions}
              onChange={setSelectedYear}
              style={{ width: 100 }}
            />
          </Col>
          <Col>
            <Popconfirm
              title={`Tutup periode ${MONTHS_ID[selectedMonth - 1]} ${selectedYear}?`}
              description="Transaksi tidak bisa diposting ke periode ini setelah ditutup."
              onConfirm={() => handleClose(formatPeriodKey(selectedYear, selectedMonth))}
              okText="Ya, Tutup"
              cancelText="Batal"
            >
              <Button
                variant="primary"
                loading={actionLoading === formatPeriodKey(selectedYear, selectedMonth)}
              >
                Tutup Periode
              </Button>
            </Popconfirm>
          </Col>
        </Row>
      </Card>

      <Card title="Status Periode (3 Tahun Terakhir)" size="small">
        <Table
          dataSource={rows}
          columns={columns}
          pagination={false}
          size="small"
          rowClassName={row => row.closed ? 'ant-table-row-disabled' : ''}
        />
      </Card>
    </Space>
  )
}
