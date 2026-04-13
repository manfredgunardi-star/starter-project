import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { getJournals } from '../../services/journalService'
import { useAuth } from '../../contexts/AuthContext'
import { formatDate } from '../../utils/date'
import Button from '../../components/ui/Button'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { Plus, Search } from 'lucide-react'

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
  if (error) return <div className="text-red-600">{error}</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Jurnal</h1>
        {canPost && (
          <Button variant="primary" onClick={() => navigate('/accounting/journals/new')}>
            <Plus size={20} /> Jurnal Manual
          </Button>
        )}
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari no. jurnal atau deskripsi..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
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
      </div>

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
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      j.source === 'manual' ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {j.source === 'manual' ? 'Manual' : 'Otomatis'}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-sm">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      j.is_posted ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {j.is_posted ? 'Posted' : 'Draft'}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
