import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { getJournals } from '../../services/journalService'
import { useAuth } from '../../contexts/AuthContext'
import { formatDate } from '../../utils/date'
import Button from '../../components/ui/Button'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { Plus, Search } from 'lucide-react'
import { Space, Flex, Tag, Typography, Alert } from 'antd'

export default function JournalsPage() {
  const navigate = useNavigate()
  const { canPost } = useAuth()
  const [journals, setJournals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')

  useEffect(() => {
    getJournals()
      .then(setJournals)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    return journals.filter(j => {
      const matchSearch = !search ||
        j.journal_number?.toLowerCase().includes(search.toLowerCase()) ||
        j.description?.toLowerCase().includes(search.toLowerCase())
      const matchSource = !sourceFilter || j.source === sourceFilter
      return matchSearch && matchSource
    })
  }, [journals, search, sourceFilter])

  if (loading) return <LoadingSpinner message="Memuat jurnal..." />
  if (error) return <Alert type="error" message={error} showIcon />

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Flex justify="space-between" align="center">
        <Typography.Title level={2} style={{ margin: 0 }}>Jurnal</Typography.Title>
        {canPost && (
          <Button variant="primary" onClick={() => navigate('/accounting/journals/new')}>
            <Plus size={20} /> Jurnal Manual
          </Button>
        )}
      </Flex>

      <Space>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari no. jurnal atau deskripsi..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            style={{ minWidth: 280 }}
          />
        </div>
        <select
          value={sourceFilter}
          onChange={e => setSourceFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
        >
          <option value="">Semua Tipe</option>
          <option value="manual">Manual</option>
          <option value="auto">Otomatis</option>
        </select>
      </Space>

      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="w-full border-collapse">
          <thead className="bg-gray-100 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-900">No. Jurnal</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-900">Tanggal</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-900">Deskripsi</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-900">Tipe</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-900">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-500">
                  Belum ada data jurnal
                </td>
              </tr>
            ) : (
              filtered.map(j => (
                <tr
                  key={j.id}
                  className="border-b border-gray-200 hover:bg-gray-50 cursor-pointer"
                  onClick={() => j.source === 'manual' ? navigate(`/accounting/journals/${j.id}`) : null}
                >
                  <td className="px-6 py-3 text-sm font-mono text-blue-600">{j.journal_number}</td>
                  <td className="px-6 py-3 text-sm text-gray-700">{formatDate(j.date)}</td>
                  <td className="px-6 py-3 text-sm text-gray-900">{j.description || '—'}</td>
                  <td className="px-6 py-3 text-sm">
                    <Tag color={j.source === 'manual' ? 'purple' : 'default'}>
                      {j.source === 'manual' ? 'Manual' : 'Otomatis'}
                    </Tag>
                  </td>
                  <td className="px-6 py-3 text-sm">
                    <Tag color={j.is_posted ? 'success' : 'warning'}>
                      {j.is_posted ? 'Posted' : 'Draft'}
                    </Tag>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Space>
  )
}
