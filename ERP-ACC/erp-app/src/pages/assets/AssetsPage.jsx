import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import * as assetService from '../../services/assetService'
import * as assetCategoryService from '../../services/assetCategoryService'
import { formatCurrency } from '../../utils/currency'
import { formatDate } from '../../utils/date'
import Button from '../../components/ui/Button'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { Plus, Search, Eye, Edit2, Trash2 } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

export default function AssetsPage() {
  const navigate = useNavigate()
  const { canWrite, isAdmin } = useAuth()

  // State
  const [assets, setAssets] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({
    categoryId: '',
    status: 'all',
    q: '',
  })
  const [debounceTimer, setDebounceTimer] = useState(null)

  // Load categories on mount
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const data = await assetCategoryService.listCategories()
        setCategories(data || [])
      } catch (err) {
        console.error('Failed to load categories:', err)
      }
    }
    loadCategories()
  }, [])

  // Load assets when filters change
  useEffect(() => {
    const loadAssets = async () => {
      try {
        setLoading(true)
        const data = await assetService.listAssets(filters)
        setAssets(data || [])
      } catch (err) {
        console.error('Failed to load assets:', err)
      } finally {
        setLoading(false)
      }
    }
    loadAssets()
  }, [filters])

  // Handle filter changes with debounce for search
  const handleFilterChange = (key, value) => {
    if (key === 'q') {
      // Debounce search
      if (debounceTimer) clearTimeout(debounceTimer)
      const timer = setTimeout(() => {
        setFilters(prev => ({ ...prev, [key]: value }))
      }, 300)
      setDebounceTimer(timer)
    } else {
      setFilters(prev => ({ ...prev, [key]: value }))
    }
  }

  // Get status badge color
  const getStatusBadge = (status) => {
    switch (status) {
      case 'active':
        return <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Active</span>
      case 'disposed':
        return <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Disposed</span>
      case 'fully_depreciated':
        return <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">Fully Depreciated</span>
      default:
        return <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">—</span>
    }
  }

  if (loading && assets.length === 0) return <LoadingSpinner message="Memuat aset tetap..." />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Aset Tetap</h1>
        <div className="flex gap-2">
          {canWrite && (
            <Button variant="primary" onClick={() => navigate('/assets/new')}>
              <Plus size={20} /> Tambah Aset
            </Button>
          )}
          {canWrite && (
            <Button variant="secondary" onClick={() => navigate('/assets/bulk-import')}>
              <Plus size={20} /> Bulk Import
            </Button>
          )}
          {isAdmin && (
            <Button variant="secondary" onClick={() => navigate('/assets/depreciation')}>
              Post Penyusutan
            </Button>
          )}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={filters.q}
            onChange={e => handleFilterChange('q', e.target.value)}
            placeholder="Cari kode atau nama aset..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <select
          value={filters.categoryId}
          onChange={e => handleFilterChange('categoryId', e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">Semua Kategori</option>
          {categories.map(cat => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
        <select
          value={filters.status}
          onChange={e => handleFilterChange('status', e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="all">Semua</option>
          <option value="active">Active</option>
          <option value="disposed">Disposed</option>
          <option value="fully_depreciated">Fully Depreciated</option>
        </select>
      </div>

      {/* Table */}
      {assets.length === 0 ? (
        <div className="border border-gray-200 rounded-lg p-12 text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
              <Plus size={32} className="text-gray-400" />
            </div>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Belum ada aset tetap</h3>
          <p className="text-gray-500 mb-6">Mulai dengan menambahkan aset pertama Anda</p>
          {canWrite && (
            <Button variant="primary" onClick={() => navigate('/assets/new')}>
              <Plus size={20} /> Tambah Aset Pertama
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full border-collapse">
            <thead className="bg-gray-100 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-900">Kode</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-900">Nama</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-900">Kategori</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-900">Tgl Perolehan</th>
                <th className="px-6 py-3 text-right text-sm font-medium text-gray-900">Harga Perolehan</th>
                <th className="px-6 py-3 text-center text-sm font-medium text-gray-900">Status</th>
                <th className="px-6 py-3 text-center text-sm font-medium text-gray-900">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {assets.map(asset => (
                <tr key={asset.id} className="border-b border-gray-200 hover:bg-gray-50">
                  <td className="px-6 py-3 text-sm font-mono text-blue-600 cursor-pointer hover:underline" onClick={() => navigate(`/assets/${asset.id}`)}>
                    {asset.code}
                  </td>
                  <td className="px-6 py-3 text-sm text-gray-900">
                    <button onClick={() => navigate(`/assets/${asset.id}`)} className="hover:text-blue-600 hover:underline">
                      {asset.name}
                    </button>
                  </td>
                  <td className="px-6 py-3 text-sm text-gray-700">
                    {asset.category?.name || '—'}
                  </td>
                  <td className="px-6 py-3 text-sm text-gray-700">
                    {formatDate(asset.acquisition_date)}
                  </td>
                  <td className="px-6 py-3 text-sm text-right font-medium text-gray-900">
                    {formatCurrency(asset.acquisition_cost)}
                  </td>
                  <td className="px-6 py-3 text-center">
                    {getStatusBadge(asset.status)}
                  </td>
                  <td className="px-6 py-3 text-center">
                    <div className="flex justify-center gap-2">
                      <button
                        onClick={() => navigate(`/assets/${asset.id}`)}
                        className="text-gray-600 hover:text-blue-600 transition"
                        title="View"
                      >
                        <Eye size={18} />
                      </button>
                      {canWrite && (
                        <button
                          onClick={() => navigate(`/assets/${asset.id}/edit`)}
                          className="text-gray-600 hover:text-blue-600 transition"
                          title="Edit"
                        >
                          <Edit2 size={18} />
                        </button>
                      )}
                      {isAdmin && (
                        <button
                          onClick={() => navigate(`/assets/${asset.id}/dispose`)}
                          disabled={asset.status !== 'active'}
                          className={`transition ${asset.status === 'active' ? 'text-gray-600 hover:text-red-600' : 'text-gray-300 cursor-not-allowed'}`}
                          title={asset.status === 'active' ? 'Dispose' : 'Hanya aktif dapat dibuang'}
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
