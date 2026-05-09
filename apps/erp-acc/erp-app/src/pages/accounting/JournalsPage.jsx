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
        <div style={{ position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari no. jurnal atau deskripsi..."
            style={{ width: '100%', paddingLeft: 36, paddingRight: 12, paddingTop: 8, paddingBottom: 8, border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14 }}
          />
        </div>
        <select
          value={sourceFilter}
          onChange={e => setSourceFilter(e.target.value)}
          style={{ border: '1px solid #d1d5db', borderRadius: 8, paddingLeft: 12, paddingRight: 12, paddingTop: 8, paddingBottom: 8, fontSize: 14 }}
        >
          <option value="">Semua Tipe</option>
          <option value="manual">Manual</option>
          <option value="auto">Otomatis</option>
        </select>
      </Space>

      <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ backgroundColor: '#f3f4f6', borderBottom: '1px solid #e5e7eb' }}>
            <tr>
              <th style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12, textAlign: 'left', fontSize: 14, fontWeight: 500, color: '#111827' }}>No. Jurnal</th>
              <th style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12, textAlign: 'left', fontSize: 14, fontWeight: 500, color: '#111827' }}>Tanggal</th>
              <th style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12, textAlign: 'left', fontSize: 14, fontWeight: 500, color: '#111827' }}>Deskripsi</th>
              <th style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12, textAlign: 'left', fontSize: 14, fontWeight: 500, color: '#111827' }}>Tipe</th>
              <th style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12, textAlign: 'left', fontSize: 14, fontWeight: 500, color: '#111827' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 32, paddingBottom: 32, textAlign: 'center', fontSize: 14, color: '#6b7280' }}>
                  Belum ada data jurnal
                </td>
              </tr>
            ) : (
              filtered.map(j => (
                <tr
                  key={j.id}
                  style={{ borderBottom: '1px solid #e5e7eb', cursor: 'pointer' }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  onClick={() => j.source === 'manual' ? navigate(`/accounting/journals/${j.id}`) : null}
                >
                  <td style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12, fontSize: 14, fontFamily: 'monospace', color: '#2563eb' }}>{j.journal_number}</td>
                  <td style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12, fontSize: 14, color: '#374151' }}>{formatDate(j.date)}</td>
                  <td style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12, fontSize: 14, color: '#111827' }}>{j.description || '—'}</td>
                  <td style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12, fontSize: 14 }}>
                    <Tag color={j.source === 'manual' ? 'purple' : 'default'}>
                      {j.source === 'manual' ? 'Manual' : 'Otomatis'}
                    </Tag>
                  </td>
                  <td style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 12, paddingBottom: 12, fontSize: 14 }}>
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
