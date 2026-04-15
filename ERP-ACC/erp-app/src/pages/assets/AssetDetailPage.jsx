import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Edit2, Trash2 } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { getAssetWithSchedule } from '../../services/assetService'
import { supabase } from '../../lib/supabase'
import { formatCurrency } from '../../utils/currency'
import { formatDate } from '../../utils/date'
import DepreciationScheduleTable from '../../components/assets/DepreciationScheduleTable'
import { Space, Card, Flex, Tag, Descriptions, Typography, Statistic } from 'antd'

const STATUS_TAG_COLOR = {
  active: 'blue',
  fully_depreciated: 'gold',
  disposed: 'default',
}

const SOURCE_TAG_COLOR = {
  auto: 'purple',
  manual: 'blue',
  asset_acquisition: 'green',
  asset_depreciation: 'orange',
  asset_disposal: 'red',
}

export default function AssetDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { canWrite, isAdmin } = useAuth()

  const [asset, setAsset] = useState(null)
  const [journals, setJournals] = useState([])
  const [auditLogs, setAuditLogs] = useState([])
  const [activeTab, setActiveTab] = useState('schedule')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadData()
  }, [id])

  async function loadData() {
    try {
      setLoading(true)
      setError('')

      // Load asset with schedule
      const assetData = await getAssetWithSchedule(id)
      setAsset(assetData)

      // Load journals
      const journalIds = [
        assetData.acquisition_journal_id,
        assetData.disposal_journal_id,
        ...assetData.schedule.filter(s => s.journal_id).map(s => s.journal_id),
      ].filter(Boolean)

      if (journalIds.length > 0) {
        const { data: jData, error: jErr } = await supabase
          .from('journals')
          .select('id, journal_number, date, source, description')
          .in('id', journalIds)
          .order('date', { ascending: false })
        if (jErr) throw jErr
        setJournals(jData)
      }

      // Load audit logs
      const { data: aData, error: aErr } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('table_name', 'assets')
        .eq('record_id', id)
        .order('created_at', { ascending: false })
      if (aErr) throw aErr
      setAuditLogs(aData)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-400">Memuat data...</div>
      </div>
    )
  }

  if (error || !asset) {
    return (
      <div style={{ padding: 24 }}>
        <button
          onClick={() => navigate('/assets')}
          className="mb-4 flex items-center gap-2 text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft size={18} /> Kembali
        </button>
        <div className="text-red-600">{error || 'Aset tidak ditemukan'}</div>
      </div>
    )
  }

  // Hitung current book value
  const postedSchedules = asset.schedule.filter(s => s.status === 'posted')
  const currentBookValue = asset.acquisition_cost - (postedSchedules.reduce((sum, s) => sum + Number(s.accumulated_amount), 0) || 0)

  const statusLabel = asset.status === 'active' ? 'Aktif' : asset.status === 'fully_depreciated' ? 'Penyusutan Selesai' : 'Dilepas'

  return (
    <Space direction="vertical" style={{ width: '100%', padding: 24 }} size="large">
      {/* Back button */}
      <button
        onClick={() => navigate('/assets')}
        className="flex items-center gap-2 text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft size={18} /> Kembali
      </button>

      {/* Asset Info Header */}
      <Card>
        <Flex justify="space-between" align="flex-start" style={{ marginBottom: 24 }}>
          <div>
            <Typography.Title level={4} style={{ margin: 0 }}>{asset.code}</Typography.Title>
            <Typography.Text type="secondary">{asset.name}</Typography.Text>
          </div>
          <Tag color={STATUS_TAG_COLOR[asset.status] ?? 'default'}>{statusLabel}</Tag>
        </Flex>

        <Descriptions size="small" column={4} style={{ marginBottom: 24 }}>
          <Descriptions.Item label="Kategori">{asset.category?.name}</Descriptions.Item>
          <Descriptions.Item label="Tanggal Perolehan">{formatDate(asset.acquisition_date)}</Descriptions.Item>
          <Descriptions.Item label="Harga Perolehan">{formatCurrency(asset.acquisition_cost)}</Descriptions.Item>
          <Descriptions.Item label="Umur Manfaat">{asset.useful_life_months} bulan</Descriptions.Item>
          <Descriptions.Item label="Nilai Residu">{formatCurrency(asset.salvage_value)}</Descriptions.Item>
          <Descriptions.Item label="Lokasi">{asset.location || '—'}</Descriptions.Item>
          <Descriptions.Item label="Deskripsi">{asset.description || '—'}</Descriptions.Item>
          <Descriptions.Item label="Mulai Penyusutan">{formatDate(asset.depreciation_start_date)}</Descriptions.Item>
        </Descriptions>

        <Space>
          {canWrite && (
            <button
              onClick={() => navigate(`/assets/${id}/edit`)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              <Edit2 size={16} /> Edit
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => navigate(`/assets/${id}/dispose`)}
              disabled={asset.status === 'disposed'}
              className={`flex items-center gap-2 px-4 py-2 rounded transition-colors ${
                asset.status === 'disposed'
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-red-100 text-red-600 hover:bg-red-200'
              }`}
            >
              <Trash2 size={16} /> Lepas Aset
            </button>
          )}
        </Space>
      </Card>

      {/* Current Book Value */}
      <Card>
        <div className="text-center">
          <Statistic
            title="Nilai Buku Saat Ini"
            value={currentBookValue}
            formatter={(val) => formatCurrency(Number(val))}
            valueStyle={{ fontSize: 28, fontWeight: 700 }}
          />
        </div>
      </Card>

      {/* Tabs */}
      <Card bodyStyle={{ padding: 0 }}>
        <div className="border-b border-gray-200 flex">
          <button
            onClick={() => setActiveTab('schedule')}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === 'schedule'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Jadwal Penyusutan
          </button>
          <button
            onClick={() => setActiveTab('journals')}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === 'journals'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Riwayat Jurnal
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === 'audit'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Audit Log
          </button>
        </div>

        <div style={{ padding: 24 }}>
          {activeTab === 'schedule' && (
            <DepreciationScheduleTable schedule={asset.schedule} />
          )}

          {activeTab === 'journals' && (
            <Space direction="vertical" style={{ width: '100%' }}>
              {journals.length === 0 ? (
                <Typography.Text type="secondary">Tidak ada jurnal.</Typography.Text>
              ) : (
                journals.map(j => (
                  <div key={j.id} className="border border-gray-200 rounded p-3 hover:bg-gray-50 cursor-pointer transition-colors" onClick={() => navigate(`/accounting/journals/${j.id}`)}>
                    <Flex justify="space-between" align="flex-start">
                      <div>
                        <div className="font-medium text-gray-900">{j.journal_number}</div>
                        <Typography.Text type="secondary" style={{ fontSize: 13 }}>{j.description}</Typography.Text>
                      </div>
                      <div className="text-right">
                        <Typography.Text type="secondary" style={{ fontSize: 13 }}>{formatDate(j.date)}</Typography.Text>
                        <div style={{ marginTop: 4 }}>
                          <Tag color={SOURCE_TAG_COLOR[j.source] ?? 'default'}>{j.source}</Tag>
                        </div>
                      </div>
                    </Flex>
                  </div>
                ))
              )}
            </Space>
          )}

          {activeTab === 'audit' && (
            <Space direction="vertical" style={{ width: '100%' }}>
              {auditLogs.length === 0 ? (
                <Typography.Text type="secondary">Tidak ada riwayat perubahan.</Typography.Text>
              ) : (
                auditLogs.map(log => (
                  <div key={log.id} className="border border-gray-200 rounded p-3">
                    <Flex justify="space-between" align="flex-start">
                      <div>
                        <div className="font-medium text-gray-900 capitalize">{log.action}</div>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>{log.table_name}</Typography.Text>
                      </div>
                      <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                        {formatDate(log.created_at)}
                      </Typography.Text>
                    </Flex>
                    {log.action !== 'create' && log.old_data && (
                      <div className="text-xs text-gray-400 mt-2">
                        <span className="font-mono text-red-600">- {JSON.stringify(log.old_data).slice(0, 50)}</span>
                      </div>
                    )}
                    {log.new_data && (
                      <div className="text-xs text-gray-400">
                        <span className="font-mono text-green-600">+ {JSON.stringify(log.new_data).slice(0, 50)}</span>
                      </div>
                    )}
                  </div>
                ))
              )}
            </Space>
          )}
        </div>
      </Card>
    </Space>
  )
}
