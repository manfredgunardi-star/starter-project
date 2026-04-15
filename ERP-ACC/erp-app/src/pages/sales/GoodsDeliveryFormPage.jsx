import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Space, Flex, Typography, Alert } from 'antd'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../components/ui/ToastContext'
import { useProducts, useCustomers } from '../../hooks/useMasterData'
import { getGoodsDelivery, saveGoodsDelivery, postGoodsDelivery } from '../../services/salesService'
import { today } from '../../utils/date'
import Button from '../../components/ui/Button'
import DocumentHeader from '../../components/shared/DocumentHeader'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { ArrowLeft, Save, Send, Trash2, Plus } from 'lucide-react'

export default function GoodsDeliveryFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { canPost, canWrite } = useAuth()
  const toast = useToast()
  const isNew = !id || id === 'new'

  const { products } = useProducts()
  const { customers } = useCustomers()

  const [loading, setLoading] = useState(!isNew)
  const [submitting, setSubmitting] = useState(false)
  const [header, setHeader] = useState({
    gd_number: '',
    date: today(),
    customer_id: '',
    sales_order_id: '',
    status: 'draft',
    notes: '',
  })
  const [items, setItems] = useState([{ _key: Date.now(), product_id: '', unit_id: '', quantity: '', quantity_base: 0 }])

  useEffect(() => {
    if (!isNew) {
      getGoodsDelivery(id)
        .then(gd => {
          setHeader({
            id: gd.id,
            gd_number: gd.gd_number,
            date: gd.date,
            customer_id: gd.customer_id,
            sales_order_id: gd.sales_order_id || '',
            status: gd.status,
            notes: gd.notes || '',
          })
          setItems(gd.items.map(i => ({
            _key: i.id,
            product_id: i.product_id,
            product_name: i.product?.name,
            unit_id: i.unit_id,
            unit_name: i.unit?.name,
            quantity: i.quantity,
            quantity_base: i.quantity_base,
          })))
        })
        .catch(err => toast.error(err.message))
        .finally(() => setLoading(false))
    }
  }, [id, isNew])

  const readOnly = !isNew && header.status === 'posted'

  const getProduct = (pid) => products.find(p => p.id === pid)
  const getUnitOptions = (pid) => {
    const prod = getProduct(pid)
    if (!prod) return []
    return [
      { id: prod.base_unit_id, name: prod.base_unit?.name || '—', factor: 1 },
      ...(prod.conversions || []).map(c => ({
        id: c.from_unit_id,
        name: c.from_unit?.name || '—',
        factor: c.conversion_factor,
      })),
    ]
  }

  const updateItem = (idx, key, value) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item
      const updated = { ...item, [key]: value }
      if (key === 'product_id') {
        const prod = getProduct(value)
        updated.unit_id = prod?.base_unit_id || ''
      }
      if (key === 'unit_id' || key === 'product_id' || key === 'quantity') {
        const unitOpts = getUnitOptions(updated.product_id)
        const unitOpt = unitOpts.find(u => u.id === updated.unit_id)
        updated.quantity_base = (Number(updated.quantity) || 0) * (unitOpt?.factor || 1)
      }
      return updated
    }))
  }

  const handleSave = async () => {
    if (!header.customer_id) { toast.error('Pilih customer'); return }
    if (!header.date) { toast.error('Tanggal wajib diisi'); return }
    const validItems = items.filter(i => i.product_id && Number(i.quantity) > 0)
    if (validItems.length === 0) { toast.error('Minimal satu item'); return }

    setSubmitting(true)
    try {
      const gdId = await saveGoodsDelivery({ id: isNew ? null : id, ...header }, validItems)
      toast.success('Pengiriman berhasil disimpan')
      navigate(`/sales/deliveries/${gdId}`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handlePost = async () => {
    setSubmitting(true)
    try {
      await postGoodsDelivery(id)
      toast.success('Pengiriman diposting — stok berkurang, jurnal HPP dibuat')
      setHeader(h => ({ ...h, status: 'posted' }))
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const customerOptions = customers.map(c => ({ value: c.id, label: c.name }))

  if (loading) return <LoadingSpinner message="Memuat pengiriman..." />

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={24}>
      <Flex justify="space-between" align="center">
        <Space align="center">
          <button onClick={() => navigate('/sales/deliveries')} className="text-gray-500 hover:text-gray-700">
            <ArrowLeft size={20} />
          </button>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {isNew ? 'Pengiriman Baru' : `GD ${header.gd_number}`}
          </Typography.Title>
        </Space>
        <Space>
          {!readOnly && canWrite && (
            <Button variant="secondary" onClick={handleSave} loading={submitting}>
              <Save size={18} /> Simpan
            </Button>
          )}
          {!isNew && header.status === 'draft' && canPost && (
            <Button variant="primary" onClick={handlePost} loading={submitting}>
              <Send size={18} /> Post (Kirim)
            </Button>
          )}
        </Space>
      </Flex>

      <DocumentHeader
        docNumber={header.gd_number}
        date={header.date}
        onDateChange={d => setHeader(h => ({ ...h, date: d }))}
        status={isNew ? null : header.status}
        partyLabel="Customer"
        partyId={header.customer_id}
        onPartyChange={v => setHeader(h => ({ ...h, customer_id: v }))}
        partyOptions={customerOptions}
        notes={header.notes}
        onNotesChange={v => setHeader(h => ({ ...h, notes: v }))}
        readOnly={readOnly}
      />

      {/* Delivery items — no price, just qty */}
      <Space direction="vertical" style={{ width: '100%' }} size={12}>
        <Typography.Title level={5} style={{ margin: 0 }}>Item Pengiriman</Typography.Title>
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full border-collapse">
            <thead className="bg-gray-100 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-700">Produk</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-700">Satuan</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-700">Qty</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-700">Qty (Base)</th>
                {!readOnly && <th className="w-10"></th>}
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const unitOpts = getUnitOptions(item.product_id)
                const productOpts = products.map(p => ({ value: p.id, label: `${p.name}${p.sku ? ` (${p.sku})` : ''}` }))

                return (
                  <tr key={item._key || idx} className="border-b border-gray-200">
                    <td className="px-4 py-2">
                      {readOnly ? (
                        <span className="text-sm">{item.product_name || item.product_id}</span>
                      ) : (
                        <select
                          className="w-full text-sm border border-gray-300 rounded px-2 py-1"
                          value={item.product_id}
                          onChange={e => updateItem(idx, 'product_id', e.target.value)}
                        >
                          <option value="">Pilih produk...</option>
                          {productOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {readOnly ? (
                        <span className="text-sm">{item.unit_name}</span>
                      ) : (
                        <select
                          className="w-full text-sm border border-gray-300 rounded px-2 py-1"
                          value={item.unit_id}
                          onChange={e => updateItem(idx, 'unit_id', e.target.value)}
                          disabled={!item.product_id}
                        >
                          <option value="">—</option>
                          {unitOpts.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {readOnly ? (
                        <span className="text-sm text-right block">{item.quantity}</span>
                      ) : (
                        <input
                          type="number"
                          min="0"
                          step="any"
                          className="w-full text-sm border border-gray-300 rounded px-2 py-1 text-right"
                          value={item.quantity}
                          onChange={e => updateItem(idx, 'quantity', e.target.value)}
                        />
                      )}
                    </td>
                    <td className="px-4 py-2 text-sm text-right text-gray-500">
                      {Number(item.quantity_base || 0).toFixed(4)}
                    </td>
                    {!readOnly && (
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
              {items.length === 0 && (
                <tr>
                  <td colSpan={readOnly ? 4 : 5} className="px-4 py-6 text-center text-sm text-gray-500">
                    Tidak ada item
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {!readOnly && (
          <button
            type="button"
            onClick={() => setItems(prev => [...prev, { _key: Date.now(), product_id: '', unit_id: '', quantity: '', quantity_base: 0 }])}
            className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
          >
            <Plus size={18} /> Tambah Baris
          </button>
        )}
      </Space>

      {header.status === 'posted' && (
        <Alert
          type="success"
          message="Pengiriman telah diposting. Stok telah berkurang dan jurnal HPP telah dibuat."
          showIcon
        />
      )}
    </Space>
  )
}
