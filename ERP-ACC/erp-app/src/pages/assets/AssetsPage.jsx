import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import * as assetService from '../../services/assetService'
import * as assetCategoryService from '../../services/assetCategoryService'
import { formatCurrency } from '../../utils/currency'
import { formatDate } from '../../utils/date'
import Button from '../../components/ui/Button'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { Space, Flex, Tag, Typography } from 'antd'
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

  // Get status tag color
  const getStatusTag = (status) => {
    switch (status) {
      case 'active':
        return <Tag color="success">Active</Tag>
      case 'disposed':
        return <Tag color="default">Disposed</Tag>
      case 'fully_depreciated':
        return <Tag color="blue">Fully Depreciated</Tag>
      default:
        return <Tag color="default">—</Tag>
    }
  }

  if (loading && assets.length === 0) return <LoadingSpinner message="Memuat aset tetap..." />

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      {/* Header */}
      <Flex justify="space-between" align="center">
        <Typography.Title level={3} style={{ margin: 0 }}>Aset Tetap</Typography.Title>
        <Space>
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
        </Space>
      </Flex>

      {/* Filter Bar */}
      <Space>
        <div style={{ position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
          <input
            type="text"
            value={filters.q}
            onChange={e => handleFilterChange('q', e.target.value)}
            placeholder="Cari kode atau nama aset..."
            style={{ paddingLeft: 36, paddingRight: 12, padding: '8px 12px 8px 36px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, outline: 'none', width: 280 }}
          />
        </div>
        <select
          value={filters.categoryId}
          onChange={e => handleFilterChange('categoryId', e.target.value)}
          style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 12px', fontSize: 14, outline: 'none' }}
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
          style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 12px', fontSize: 14, outline: 'none' }}
        >
          <option value="all">Semua</option>
          <option value="active">Active</option>
          <option value="disposed">Disposed</option>
          <option value="fully_depreciated">Fully Depreciated</option>
        </select>
      </Space>

      {/* Table */}
      {assets.length === 0 ? (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 48, textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <div style={{ width: 64, height: 64, backgroundColor: '#f3f4f6', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Plus size={32} style={{ color: '#9ca3af' }} />
            </div>
          </div>
          <h3 style={{ fontSize: 18, fontWeight: 500, color: '#111827', marginBottom: 8 }}>Belum ada aset tetap</h3>
          <p style={{ color: '#6b7280', marginBottom: 24 }}>Mulai dengan menambahkan aset pertama Anda</p>
          {canWrite && (
            <Button variant="primary" onClick={() => navigate('/assets/new')}>
              <Plus size={20} /> Tambah Aset Pertama
            </Button>
          )}
        </div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ backgroundColor: '#f3f4f6', borderBottom: '1px solid #e5e7eb' }}>
              <tr>
                <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500, color: '#111827' }}>Kode</th>
                <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500, color: '#111827' }}>Nama</th>
                <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500, color: '#111827' }}>Kategori</th>
                <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 14, fontWeight: 500, color: '#111827' }}>Tgl Perolehan</th>
                <th style={{ padding: '12px 24px', textAlign: 'right', fontSize: 14, fontWeight: 500, color: '#111827' }}>Harga Perolehan</th>
                <th style={{ padding: '12px 24px', textAlign: 'center', fontSize: 14, fontWeight: 500, color: '#111827' }}>Status</th>
                <th style={{ padding: '12px 24px', textAlign: 'center', fontSize: 14, fontWeight: 500, color: '#111827' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {assets.map(asset => (
                <tr key={asset.id} style={{ borderBottom: '1px solid #e5e7eb' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                  <td style={{ padding: '12px 24px', fontSize: 14, fontFamily: 'monospace', color: '#2563eb', cursor: 'pointer' }} onClick={() => navigate(`/assets/${asset.id}`)} onMouseEnter={(e) => e.target.style.textDecoration = 'underline'} onMouseLeave={(e) => e.target.style.textDecoration = 'none'}>
                    {asset.code}
                  </td>
                  <td style={{ padding: '12px 24px', fontSize: 14, color: '#111827' }}>
                    <button onClick={() => navigate(`/assets/${asset.id}`)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#111827', textDecoration: 'none' }} onMouseEnter={(e) => { e.target.style.color = '#2563eb'; e.target.style.textDecoration = 'underline' }} onMouseLeave={(e) => { e.target.style.color = '#111827'; e.target.style.textDecoration = 'none' }}>
                      {asset.name}
                    </button>
                  </td>
                  <td style={{ padding: '12px 24px', fontSize: 14, color: '#374151' }}>
                    {asset.category?.name || '—'}
                  </td>
                  <td style={{ padding: '12px 24px', fontSize: 14, color: '#374151' }}>
                    {formatDate(asset.acquisition_date)}
                  </td>
                  <td style={{ padding: '12px 24px', fontSize: 14, textAlign: 'right', fontWeight: 500, color: '#111827' }}>
                    {formatCurrency(asset.acquisition_cost)}
                  </td>
                  <td style={{ padding: '12px 24px', textAlign: 'center' }}>
                    {getStatusTag(asset.status)}
                  </td>
                  <td style={{ padding: '12px 24px', textAlign: 'center' }}>
                    <Space justify="center">
                      <button
                        onClick={() => navigate(`/assets/${asset.id}`)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4b5563' }}
                        onMouseEnter={(e) => e.target.style.color = '#2563eb'}
                        onMouseLeave={(e) => e.target.style.color = '#4b5563'}
                        title="View"
                      >
                        <Eye size={18} />
                      </button>
                      {canWrite && (
                        <button
                          onClick={() => navigate(`/assets/${asset.id}/edit`)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4b5563' }}
                          onMouseEnter={(e) => e.target.style.color = '#2563eb'}
                          onMouseLeave={(e) => e.target.style.color = '#4b5563'}
                          title="Edit"
                        >
                          <Edit2 size={18} />
                        </button>
                      )}
                      {isAdmin && (
                        <button
                          onClick={() => navigate(`/assets/${asset.id}/dispose`)}
                          disabled={asset.status !== 'active'}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: asset.status === 'active' ? 'pointer' : 'not-allowed',
                            color: asset.status === 'active' ? '#4b5563' : '#d1d5db',
                          }}
                          onMouseEnter={(e) => asset.status === 'active' && (e.target.style.color = '#dc2626')}
                          onMouseLeave={(e) => asset.status === 'active' && (e.target.style.color = '#4b5563')}
                          title={asset.status === 'active' ? 'Dispose' : 'Hanya aktif dapat dibuang'}
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </Space>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Space>
  )
}
