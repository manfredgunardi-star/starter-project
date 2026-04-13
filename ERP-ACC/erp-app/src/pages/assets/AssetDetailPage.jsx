import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Edit2, Trash2 } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { getAssetWithSchedule } from '../../services/assetService'
import { supabase } from '../../lib/supabase'
import { formatCurrency } from '../../utils/currency'
import { formatDate } from '../../utils/date'
import DepreciationScheduleTable from '../../components/assets/DepreciationScheduleTable'

const STATUS_BADGE = {
  active: 'bg-blue-100 text-blue-700',
  fully_depreciated: 'bg-yellow-100 text-yellow-700',
  disposed: 'bg-gray-100 text-gray-600',
}

const SOURCE_BADGE = {
  auto: 'bg-purple-100 text-purple-600',
  manual: 'bg-blue-100 text-blue-600',
  asset_acquisition: 'bg-green-100 text-green-600',
  asset_depreciation: 'bg-orange-100 text-orange-600',
  asset_disposal: 'bg-red-100 text-red-600',
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
      <div className="p-6">
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

  return (
    <div className="space-y-6 p-6">
      {/* Header + Navigation */}
      <button
        onClick={() => navigate('/assets')}
        className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft size={18} /> Kembali
      </button>

      {/* Asset Info Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{asset.code}</h1>
            <p className="text-gray-500">{asset.name}</p>
          </div>
          <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${STATUS_BADGE[asset.status] ?? 'bg-gray-100 text-gray-600'}`}>
            {asset.status === 'active' ? 'Aktif' : asset.status === 'fully_depreciated' ? 'Penyusutan Selesai' : 'Dilepas'}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div>
            <div className="text-xs text-gray-500 uppercase">Kategori</div>
            <div className="text-sm font-medium text-gray-900">{asset.category?.name}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase">Tanggal Perolehan</div>
            <div className="text-sm font-medium text-gray-900">{formatDate(asset.acquisition_date)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase">Harga Perolehan</div>
            <div className="text-sm font-medium text-gray-900">{formatCurrency(asset.acquisition_cost)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase">Umur Manfaat</div>
            <div className="text-sm font-medium text-gray-900">{asset.useful_life_months} bulan</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase">Nilai Residu</div>
            <div className="text-sm font-medium text-gray-900">{formatCurrency(asset.salvage_value)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase">Lokasi</div>
            <div className="text-sm font-medium text-gray-900">{asset.location || '—'}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase">Deskripsi</div>
            <div className="text-sm font-medium text-gray-900 truncate">{asset.description || '—'}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase">Mulai Penyusutan</div>
            <div className="text-sm font-medium text-gray-900">{formatDate(asset.depreciation_start_date)}</div>
          </div>
        </div>

        <div className="flex gap-3">
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
        </div>
      </div>

      {/* Right Sidebar: Current Book Value */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="text-center">
          <div className="text-gray-500 text-sm mb-2">Nilai Buku Saat Ini</div>
          <div className="text-3xl font-bold text-gray-900">{formatCurrency(currentBookValue)}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg border border-gray-200">
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

        <div className="p-6">
          {activeTab === 'schedule' && (
            <DepreciationScheduleTable schedule={asset.schedule} />
          )}

          {activeTab === 'journals' && (
            <div className="space-y-2">
              {journals.length === 0 ? (
                <p className="text-sm text-gray-400 py-4">Tidak ada jurnal.</p>
              ) : (
                journals.map(j => (
                  <div key={j.id} className="border border-gray-200 rounded p-3 hover:bg-gray-50 cursor-pointer transition-colors" onClick={() => navigate(`/accounting/journals/${j.id}`)}>
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium text-gray-900">{j.journal_number}</div>
                        <div className="text-sm text-gray-500">{j.description}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-gray-500">{formatDate(j.date)}</div>
                        <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium ${SOURCE_BADGE[j.source] ?? 'bg-gray-100 text-gray-600'}`}>
                          {j.source}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'audit' && (
            <div className="space-y-2">
              {auditLogs.length === 0 ? (
                <p className="text-sm text-gray-400 py-4">Tidak ada riwayat perubahan.</p>
              ) : (
                auditLogs.map(log => (
                  <div key={log.id} className="border border-gray-200 rounded p-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium text-gray-900 capitalize">{log.action}</div>
                        <div className="text-xs text-gray-500 mt-1">{log.table_name}</div>
                      </div>
                      <div className="text-right text-sm text-gray-500">
                        {formatDate(log.created_at)}
                      </div>
                    </div>
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
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
