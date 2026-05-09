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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div style={{ color: '#9ca3af' }}>Memuat data...</div>
      </div>
    )
  }

  if (error || !asset) {
    return (
      <div style={{ padding: 24 }}>
        <button
          onClick={() => navigate('/assets')}
          style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#6b7280', marginBottom: 16, background: 'none', border: 'none', cursor: 'pointer' }}
          onMouseEnter={(e) => e.target.style.color = '#374151'}
          onMouseLeave={(e) => e.target.style.color = '#6b7280'}
        >
          <ArrowLeft size={18} /> Kembali
        </button>
        <div style={{ color: '#dc2626' }}>{error || 'Aset tidak ditemukan'}</div>
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
        style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer' }}
        onMouseEnter={(e) => e.target.style.color = '#374151'}
        onMouseLeave={(e) => e.target.style.color = '#6b7280'}
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
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', backgroundColor: '#2563eb', color: 'white', borderRadius: 4, border: 'none', cursor: 'pointer' }}
              onMouseEnter={(e) => e.target.style.backgroundColor = '#1d4ed8'}
              onMouseLeave={(e) => e.target.style.backgroundColor = '#2563eb'}
            >
              <Edit2 size={16} /> Edit
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => navigate(`/assets/${id}/dispose`)}
              disabled={asset.status === 'disposed'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 16px',
                borderRadius: 4,
                border: 'none',
                cursor: asset.status === 'disposed' ? 'not-allowed' : 'pointer',
                backgroundColor: asset.status === 'disposed' ? '#f3f4f6' : '#fee2e2',
                color: asset.status === 'disposed' ? '#9ca3af' : '#dc2626',
              }}
              onMouseEnter={(e) => asset.status !== 'disposed' && (e.target.style.backgroundColor = '#fecaca')}
              onMouseLeave={(e) => asset.status !== 'disposed' && (e.target.style.backgroundColor = '#fee2e2')}
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
        <div style={{ borderBottom: '1px solid #e5e7eb', display: 'flex' }}>
          <button
            onClick={() => setActiveTab('schedule')}
            style={{
              padding: '12px 24px',
              fontWeight: 500,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: activeTab === 'schedule' ? '#2563eb' : '#6b7280',
              borderBottom: activeTab === 'schedule' ? '2px solid #2563eb' : 'none',
              marginBottom: activeTab === 'schedule' ? 0 : 2,
            }}
            onMouseEnter={(e) => activeTab !== 'schedule' && (e.target.style.color = '#374151')}
            onMouseLeave={(e) => activeTab !== 'schedule' && (e.target.style.color = '#6b7280')}
          >
            Jadwal Penyusutan
          </button>
          <button
            onClick={() => setActiveTab('journals')}
            style={{
              padding: '12px 24px',
              fontWeight: 500,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: activeTab === 'journals' ? '#2563eb' : '#6b7280',
              borderBottom: activeTab === 'journals' ? '2px solid #2563eb' : 'none',
              marginBottom: activeTab === 'journals' ? 0 : 2,
            }}
            onMouseEnter={(e) => activeTab !== 'journals' && (e.target.style.color = '#374151')}
            onMouseLeave={(e) => activeTab !== 'journals' && (e.target.style.color = '#6b7280')}
          >
            Riwayat Jurnal
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            style={{
              padding: '12px 24px',
              fontWeight: 500,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: activeTab === 'audit' ? '#2563eb' : '#6b7280',
              borderBottom: activeTab === 'audit' ? '2px solid #2563eb' : 'none',
              marginBottom: activeTab === 'audit' ? 0 : 2,
            }}
            onMouseEnter={(e) => activeTab !== 'audit' && (e.target.style.color = '#374151')}
            onMouseLeave={(e) => activeTab !== 'audit' && (e.target.style.color = '#6b7280')}
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
                  <div key={j.id} style={{ border: '1px solid #e5e7eb', borderRadius: 4, padding: 12, cursor: 'pointer' }} onClick={() => navigate(`/accounting/journals/${j.id}`)} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                    <Flex justify="space-between" align="flex-start">
                      <div>
                        <div style={{ fontWeight: 500, color: '#111827' }}>{j.journal_number}</div>
                        <Typography.Text type="secondary" style={{ fontSize: 13 }}>{j.description}</Typography.Text>
                      </div>
                      <div style={{ textAlign: 'right' }}>
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
                  <div key={log.id} style={{ border: '1px solid #e5e7eb', borderRadius: 4, padding: 12 }}>
                    <Flex justify="space-between" align="flex-start">
                      <div>
                        <div style={{ fontWeight: 500, color: '#111827', textTransform: 'capitalize' }}>{log.action}</div>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>{log.table_name}</Typography.Text>
                      </div>
                      <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                        {formatDate(log.created_at)}
                      </Typography.Text>
                    </Flex>
                    {log.action !== 'create' && log.old_data && (
                      <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 8 }}>
                        <span style={{ fontFamily: 'monospace', color: '#dc2626' }}>- {JSON.stringify(log.old_data).slice(0, 50)}</span>
                      </div>
                    )}
                    {log.new_data && (
                      <div style={{ fontSize: 12, color: '#9ca3af' }}>
                        <span style={{ fontFamily: 'monospace', color: '#16a34a' }}>+ {JSON.stringify(log.new_data).slice(0, 50)}</span>
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
