import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Space, Flex, Typography, Card, Tag, Tooltip, Alert, Table, Modal, Button as AntdButton } from 'antd'
import { Plus, Play, Pause, Trash2, History, RefreshCw, Edit2 } from 'lucide-react'
import Button from '../../components/ui/Button'
import {
  listRecurringTemplates,
  getRecurringInstances,
  pauseRecurringTemplate,
  resumeRecurringTemplate,
  softDeleteRecurringTemplate,
  runNow,
} from '../../services/recurringService'
import { useAuth } from '../../contexts/AuthContext'

const { Title, Text } = Typography

const STATUS_COLOR = { active: 'green', paused: 'orange', completed: 'default' }
const STATUS_LABEL = { active: 'Aktif', paused: 'Dijeda', completed: 'Selesai' }
const TYPE_LABEL   = { invoice: 'Invoice', journal: 'Jurnal' }
const INTERVAL_LABEL = { daily: 'Harian', weekly: 'Mingguan', monthly: 'Bulanan', yearly: 'Tahunan' }

export default function RecurringPage() {
  const navigate  = useNavigate()
  const { canWrite } = useAuth()

  const [templates,  setTemplates]  = useState([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)
  const [actionId,   setActionId]   = useState(null)
  const [histModal,  setHistModal]  = useState(null)
  const [instances,  setInstances]  = useState([])
  const [histLoading, setHistLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setTemplates(await listRecurringTemplates())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleRunNow(tmpl) {
    setActionId(tmpl.id)
    setError(null)
    try {
      const result = await runNow(tmpl.id)
      await load()
      Modal.success({
        title: 'Berhasil',
        content: `Transaksi dibuat: ${result?.doc_number ?? '-'}`,
      })
    } catch (e) {
      setError(e.message)
    } finally {
      setActionId(null)
    }
  }

  async function handleTogglePause(tmpl) {
    setActionId(tmpl.id)
    try {
      if (tmpl.status === 'active') await pauseRecurringTemplate(tmpl.id)
      else await resumeRecurringTemplate(tmpl.id)
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setActionId(null)
    }
  }

  function handleDelete(tmpl) {
    Modal.confirm({
      title: 'Hapus Template',
      content: `Hapus template "${tmpl.name}"?`,
      okText: 'Hapus',
      okButtonProps: { danger: true },
      cancelText: 'Batal',
      onOk: async () => {
        setActionId(tmpl.id)
        try {
          await softDeleteRecurringTemplate(tmpl.id)
          await load()
        } catch (e) {
          setError(e.message)
        } finally {
          setActionId(null)
        }
      },
    })
  }

  async function openHistory(tmpl) {
    setHistModal({ id: tmpl.id, name: tmpl.name })
    setHistLoading(true)
    try {
      setInstances(await getRecurringInstances(tmpl.id))
    } catch (e) {
      setError(e.message)
    } finally {
      setHistLoading(false)
    }
  }

  const columns = [
    {
      title: 'Nama', dataIndex: 'name', key: 'name',
      render: (v, r) => (
        <Space direction="vertical" size={0}>
          <Text strong>{v}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {TYPE_LABEL[r.type]} · {INTERVAL_LABEL[r.interval_type]}
          </Text>
        </Space>
      ),
    },
    { title: 'Run Berikutnya', dataIndex: 'next_run', key: 'next_run',
      render: v => v ?? '-',
    },
    { title: 'Terakhir Run', dataIndex: 'last_run', key: 'last_run',
      render: v => v ?? '-',
    },
    { title: 'Status', dataIndex: 'status', key: 'status',
      render: v => <Tag color={STATUS_COLOR[v]}>{STATUS_LABEL[v]}</Tag>,
    },
    canWrite && {
      title: 'Aksi', key: 'actions',
      render: (_, r) => {
        const busy = actionId === r.id
        return (
          <Space>
            <Tooltip title="Run Sekarang">
              <AntdButton
                size="small" icon={<RefreshCw size={14} />}
                loading={busy} disabled={r.status !== 'active'}
                onClick={() => handleRunNow(r)}
              />
            </Tooltip>
            <Tooltip title={r.status === 'active' ? 'Jeda' : 'Aktifkan'}>
              <AntdButton
                size="small"
                icon={r.status === 'active' ? <Pause size={14} /> : <Play size={14} />}
                loading={busy} disabled={r.status === 'completed'}
                onClick={() => handleTogglePause(r)}
              />
            </Tooltip>
            <Tooltip title="Riwayat">
              <AntdButton size="small" icon={<History size={14} />}
                onClick={() => openHistory(r)}
              />
            </Tooltip>
            <Tooltip title="Edit">
              <AntdButton size="small" icon={<Edit2 size={14} />}
                onClick={() => navigate(`/accounting/recurring/${r.id}`)}
              />
            </Tooltip>
            <Tooltip title="Hapus">
              <AntdButton size="small" danger icon={<Trash2 size={14} />}
                loading={busy} onClick={() => handleDelete(r)}
              />
            </Tooltip>
          </Space>
        )
      },
    },
  ].filter(Boolean)

  const instanceColumns = [
    { title: 'Tanggal Run', dataIndex: 'run_date',         key: 'run_date' },
    { title: 'Tipe',        dataIndex: 'transaction_type', key: 'type' },
    { title: 'Status', dataIndex: 'status', key: 'status',
      render: v => <Tag color={v === 'created' ? 'green' : 'red'}>{v}</Tag>,
    },
    { title: 'Error', dataIndex: 'error_message', key: 'error',
      render: v => v ? <Text type="danger" style={{ fontSize: 12 }}>{v}</Text> : '-',
    },
  ]

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Flex justify="space-between" align="center">
        <Title level={4} style={{ margin: 0 }}>Transaksi Berulang</Title>
        {canWrite && (
          <Button variant="primary" icon={<Plus size={16} />}
            onClick={() => navigate('/accounting/recurring/new')}
          >
            Tambah Template
          </Button>
        )}
      </Flex>

      {error && <Alert type="error" message={error} showIcon closable onClose={() => setError(null)} />}

      <Card>
        <Table
          columns={columns}
          dataSource={templates}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 20, showSizeChanger: true }}
          locale={{ emptyText: 'Belum ada template berulang' }}
        />
      </Card>

      <Modal
        open={!!histModal}
        title={`Riwayat: ${histModal?.name ?? ''}`}
        onCancel={() => setHistModal(null)}
        footer={null}
        width={700}
        destroyOnClose
      >
        <Table
          columns={instanceColumns}
          dataSource={instances}
          rowKey="id"
          loading={histLoading}
          size="small"
          pagination={{ pageSize: 10 }}
        />
      </Modal>
    </Space>
  )
}
