import { useState, useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Space, Flex, Typography, Alert } from 'antd'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../components/ui/ToastContext'
import { useProducts, useCustomers } from '../../hooks/useMasterData'
import { getGoodsDelivery, saveGoodsDelivery, postGoodsDelivery, getSalesOrder } from '../../services/salesService'
import { today } from '../../utils/date'
import Button from '../../components/ui/Button'
import DocumentHeader from '../../components/shared/DocumentHeader'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { ArrowLeft, Save, Send, Trash2, Plus, FileText } from 'lucide-react'

export default function GoodsDeliveryFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
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

  useEffect(() => {
    const fromSoId = searchParams.get('from_so')
    if (!fromSoId || !isNew) return
    getSalesOrder(fromSoId)
      .then(so => {
        setHeader(h => ({
          ...h,
          customer_id: so.customer_id,
          sales_order_id: so.id,
        }))
        setItems(
          (so.items || []).map(i => ({
            _key: i.id,
            product_id: i.product_id,
            product_name: i.product?.name,
            unit_id: i.unit_id,
            unit_name: i.unit?.name,
            quantity: i.quantity,
            quantity_base: i.quantity_base,
          }))
        )
      })
      .catch(err => toast.error('Gagal load SO: ' + err.message))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
          <button onClick={() => navigate('/sales/deliveries')}>
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
          {!isNew && header.status === 'posted' && canWrite && (
            <Button variant="secondary" onClick={() => navigate(`/sales/invoices/new?from_gd=${id}`)}>
              <FileText size={18} /> Buat SI dari GD ini
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
        <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#f3f4f6', borderBottom: '1px solid #e5e7eb' }}>
              <tr>
                <th style={{ padding: '8px 16px', textAlign: 'left', fontSize: 12, fontWeight: 500 }}>Produk</th>
                <th style={{ padding: '8px 16px', textAlign: 'left', fontSize: 12, fontWeight: 500 }}>Satuan</th>
                <th style={{ padding: '8px 16px', textAlign: 'right', fontSize: 12, fontWeight: 500 }}>Qty</th>
                <th style={{ padding: '8px 16px', textAlign: 'right', fontSize: 12, fontWeight: 500 }}>Qty (Base)</th>
                {!readOnly && <th style={{ width: 40 }}></th>}
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const unitOpts = getUnitOptions(item.product_id)
                const productOpts = products.map(p => ({ value: p.id, label: `${p.name}${p.sku ? ` (${p.sku})` : ''}` }))

                return (
                  <tr key={item._key || idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '8px 16px' }}>
                      {readOnly ? (
                        <span style={{ fontSize: 14 }}>{item.product_name || item.product_id}</span>
                      ) : (
                        <select
                          style={{ width: '100%', fontSize: 14, border: '1px solid #d1d5db', borderRadius: 4, padding: '2px 8px' }}
                          value={item.product_id}
                          onChange={e => updateItem(idx, 'product_id', e.target.value)}
                        >
                          <option value="">Pilih produk...</option>
                          {productOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      )}
                    </td>
                    <td style={{ padding: '8px 16px' }}>
                      {readOnly ? (
                        <span style={{ fontSize: 14 }}>{item.unit_name}</span>
                      ) : (
                        <select
                          style={{ width: '100%', fontSize: 14, border: '1px solid #d1d5db', borderRadius: 4, padding: '2px 8px' }}
                          value={item.unit_id}
                          onChange={e => updateItem(idx, 'unit_id', e.target.value)}
                          disabled={!item.product_id}
                        >
                          <option value="">—</option>
                          {unitOpts.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                      )}
                    </td>
                    <td style={{ padding: '8px 16px' }}>
                      {readOnly ? (
                        <span style={{ fontSize: 14, display: 'block', textAlign: 'right' }}>{item.quantity}</span>
                      ) : (
                        <input
                          type="number"
                          min="0"
                          step="any"
                          style={{ width: '100%', fontSize: 14, border: '1px solid #d1d5db', borderRadius: 4, padding: '2px 8px', textAlign: 'right' }}
                          value={item.quantity}
                          onChange={e => updateItem(idx, 'quantity', e.target.value)}
                        />
                      )}
                    </td>
                    <td style={{ padding: '8px 16px', fontSize: 14, textAlign: 'right' }}>
                      {Number(item.quantity_base || 0).toFixed(4)}
                    </td>
                    {!readOnly && (
                      <td style={{ padding: '8px' }}>
                        <button
                          type="button"
                          onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))}
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
                  <td colSpan={readOnly ? 4 : 5} style={{ padding: '24px 16px', textAlign: 'center', fontSize: 14, color: '#6b7280' }}>
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
            style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}
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
