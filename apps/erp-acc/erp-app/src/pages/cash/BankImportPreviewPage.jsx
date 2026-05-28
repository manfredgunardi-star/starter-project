import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle, XCircle, SkipForward } from 'lucide-react'
import {
  Space, Card, Typography, Button, Table, Tag, Alert,
  Statistic, Row, Col, Flex, Popconfirm,
} from 'antd'
import { useToast } from '../../components/ui/ToastContext'
import {
  getImportSession, getImportRows, skipImportRow, confirmImport, cancelImport,
} from '../../services/bankImportService'
import { formatCurrency } from '../../utils/currency'

const { Title, Text } = Typography

const STATUS_CONFIG = {
  matched: { bg: '#f6ffed', label: 'Cocok', tag: 'success' },
  uncertain: { bg: '#fffbe6', label: 'Tidak Pasti', tag: 'warning' },
  unmatched: { bg: '#fff1f0', label: 'Tidak Cocok', tag: 'error' },
  skipped: { bg: '#fafafa', label: 'Dilewati', tag: 'default' },
}

export default function BankImportPreviewPage() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()

  const [session, setSession] = useState(null)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [cancelLoading, setCancelLoading] = useState(false)

  useEffect(() => {
    Promise.all([getImportSession(sessionId), getImportRows(sessionId)])
      .then(([sessionData, rowData]) => {
        setSession(sessionData)
        setRows(rowData || [])
      })
      .catch(err => toast.error(err.message))
      .finally(() => setLoading(false))
  }, [sessionId, toast])

  async function handleSkip(rowId) {
    try {
      await skipImportRow(rowId)
      setRows(prev => prev.map(row => (
        row.id === rowId ? { ...row, match_status: 'skipped' } : row
      )))
    } catch (err) {
      toast.error(err.message)
    }
  }

  async function handleConfirm() {
    setConfirmLoading(true)
    try {
      await confirmImport(sessionId)
      toast.success('Import dikonfirmasi')
      navigate('/cash/accounts')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setConfirmLoading(false)
    }
  }

  async function handleCancel() {
    setCancelLoading(true)
    try {
      await cancelImport(sessionId)
      toast.success('Import dibatalkan')
      navigate('/cash/accounts')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setCancelLoading(false)
    }
  }

  const columns = [
    { title: 'Baris', dataIndex: 'row_number', key: 'row_number', width: 60 },
    { title: 'Tanggal', dataIndex: 'statement_date', key: 'statement_date', width: 110 },
    { title: 'Keterangan', dataIndex: 'description', key: 'description', ellipsis: true },
    {
      title: 'Jumlah',
      dataIndex: 'amount',
      key: 'amount',
      align: 'right',
      width: 130,
      render: value => (
        <Text style={{ color: value > 0 ? '#52c41a' : '#ff4d4f' }}>
          {value > 0 ? '+' : ''}{formatCurrency(value)}
        </Text>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'match_status',
      key: 'match_status',
      width: 120,
      render: status => {
        const config = STATUS_CONFIG[status] || STATUS_CONFIG.unmatched
        return <Tag color={config.tag}>{config.label}</Tag>
      },
    },
    {
      title: 'Pembayaran Cocok',
      key: 'payment',
      render: (_, row) => (row.payment
        ? <Text type="secondary">{row.payment.payment_number} - {formatCurrency(row.payment.amount)}</Text>
        : null),
    },
    {
      title: 'Confidence',
      dataIndex: 'confidence',
      key: 'confidence',
      width: 90,
      align: 'center',
      render: value => (value != null ? `${Math.round(value * 100)}%` : '-'),
    },
    {
      title: '',
      key: 'action',
      width: 90,
      render: (_, row) => (
        row.match_status === 'unmatched' ? (
          <Button
            size="small"
            icon={<SkipForward size={12} />}
            onClick={() => handleSkip(row.id)}
          >
            Lewati
          </Button>
        ) : null
      ),
    },
  ]

  const matchedCount = rows.filter(row => row.match_status === 'matched').length
  const uncertainCount = rows.filter(row => row.match_status === 'uncertain').length
  const unmatchedCount = rows.filter(row => row.match_status === 'unmatched').length

  const isConfirmed = session?.status === 'confirmed'
  const isCancelled = session?.status === 'cancelled'

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Flex align="center" gap={12}>
        <Button icon={<ArrowLeft size={16} />} onClick={() => navigate('/cash/accounts')} />
        <Title level={2} style={{ margin: 0 }}>Preview Import Rekening Koran</Title>
      </Flex>

      {session && (
        <Row gutter={16}>
          <Col xs={12} sm={6}>
            <Statistic title="Total Baris" value={session.total_rows} />
          </Col>
          <Col xs={12} sm={6}>
            <Statistic title="Cocok" value={matchedCount} valueStyle={{ color: '#52c41a' }} />
          </Col>
          <Col xs={12} sm={6}>
            <Statistic title="Tidak Pasti" value={uncertainCount} valueStyle={{ color: '#faad14' }} />
          </Col>
          <Col xs={12} sm={6}>
            <Statistic title="Tidak Cocok" value={unmatchedCount} valueStyle={{ color: '#ff4d4f' }} />
          </Col>
        </Row>
      )}

      {session && (
        <Alert
          message={`File: ${session.file_name} - Akun: ${session.account?.name}`}
          description="Baris bertanda Cocok sudah diverifikasi dengan pembayaran di sistem. Tidak Pasti perlu dikonfirmasi manual. Tidak Cocok berarti belum ada pembayaran yang sesuai."
          type="info"
          showIcon
        />
      )}

      {(isConfirmed || isCancelled) && (
        <Alert
          message={isConfirmed ? 'Import sudah dikonfirmasi' : 'Import dibatalkan'}
          type={isConfirmed ? 'success' : 'warning'}
          showIcon
        />
      )}

      <Card size="small">
        <Table
          dataSource={rows}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 50 }}
          size="small"
          onRow={row => ({
            style: { backgroundColor: STATUS_CONFIG[row.match_status]?.bg || 'white' },
          })}
        />
      </Card>

      {session?.status === 'pending' && (
        <Flex justify="flex-end" gap={8}>
          <Popconfirm
            title="Batalkan import?"
            description="Import akan ditandai sebagai dibatalkan."
            onConfirm={handleCancel}
            okText="Ya, Batalkan"
            cancelText="Tidak"
          >
            <Button loading={cancelLoading} disabled={confirmLoading} icon={<XCircle size={14} />}>Batalkan Import</Button>
          </Popconfirm>
          <Popconfirm
            title="Konfirmasi import?"
            description={`${unmatchedCount} baris tidak cocok akan diabaikan. Lanjutkan?`}
            onConfirm={handleConfirm}
            okText="Ya, Konfirmasi"
            cancelText="Tidak"
          >
            <Button type="primary" loading={confirmLoading} disabled={cancelLoading} icon={<CheckCircle size={14} />}>
              Konfirmasi Import
            </Button>
          </Popconfirm>
        </Flex>
      )}
    </Space>
  )
}
