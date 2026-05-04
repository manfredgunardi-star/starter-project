import { useState, useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Space, Flex, Typography, Alert } from 'antd'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../components/ui/ToastContext'
import { useProducts, useSuppliers } from '../../hooks/useMasterData'
import { getGoodsReceipt, saveGoodsReceipt, postGoodsReceipt, getPurchaseOrder } from '../../services/purchaseService'
import { today } from '../../utils/date'
import Button from '../../components/ui/Button'
import DocumentHeader from '../../components/shared/DocumentHeader'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { ArrowLeft, Save, Send, Trash2, Plus, FileText } from 'lucide-react'

export default function GoodsReceiptFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { canWrite, canPost } = useAuth()
  const toast = useToast()
  const isNew = !id || id === 'new'
  const [searchParams] = useSearchParams()

  const { products } = useProducts()
  const { suppliers } = useSuppliers()

  const [loading, setLoading] = useState(!isNew)
  const [submitting, setSubmitting] = useState(false)
  const [header, setHeader] = useState({
    gr_number: '',
    date: today(),
    supplier_id: '',
    purchase_order_id: '',
    status: 'draft',
    notes: '',
  })
  const [items, setItems] = useState([{ _key: Date.now(), product_id: '', unit_id: '', quantity: '', quantity_base: 0, unit_price: '' }])

  useEffect(() => {
    if (!isNew) {
      getGoodsReceipt(id)
        .then(gr => {
          setHeader({
            id: gr.id,
            gr_number: gr.gr_number,
            date: gr.date,
            supplier_id: gr.supplier_id,
            purchase_order_id: gr.purchase_order_id || '',
            status: gr.status,
            notes: gr.notes || '',
          })
          setItems(gr.items.map(i => ({
            _key: i.id,
            product_id: i.product_id,
            product_name: i.product?.name,
            unit_id: i.unit_id,
            unit_name: i.unit?.name,
            quantity: i.quantity,
            quantity_base: i.quantity_base,
            unit_price: i.unit_price,
          })))
        })
        .catch(err => toast.error(err.message))
        .finally(() => setLoading(false))
    }
  }, [id, isNew])

  useEffect(() => {
    const fromPoId = searchParams.get('from_po')
    if (!fromPoId || !isNew) return
    getPurchaseOrder(fromPoId)
      .then(po => {
        setHeader(h => ({
          ...h,
          supplier_id: po.supplier_id,
          purchase_order_id: po.id,
        }))
        setItems(
          (po.purchase_order_items || []).map(i => ({
            _key: i.id,
            product_id: i.product_id,
            product_name: i.product?.name,
            unit_id: i.unit_id,
            unit_name: i.unit?.name,
            quantity: i.quantity,
            quantity_base: i.quantity_base,
            unit_price: i.unit_price,
          }))
        )
      })
      .catch(err => toast.error('Gagal load PO: ' + err.message))
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
        updated.unit_price = prod?.buy_price || ''
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
    if (!header.supplier_id) { toast.error('Pilih supplier'); return }
    if (!header.date) { toast.error('Tanggal wajib diisi'); return }
    const validItems = items.filter(i => i.product_id && Number(i.quantity) > 0)
    if (validItems.length === 0) { toast.error('Minimal satu item'); return }

    setSubmitting(true)
    try {
      const grId = await saveGoodsReceipt({ id: isNew ? null : id, ...header }, validItems)
      toast.success('Penerimaan berhasil disimpan')
      navigate(`/purchase/receipts/${grId}`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handlePost = async () => {
    setSubmitting(true)
    try {
      await postGoodsReceipt(id)
      toast.success('Penerimaan diposting — stok bertambah, jurnal persediaan dibuat')
      setHeader(h => ({ ...h, status: 'posted' }))
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const supplierOptions = suppliers.map(s => ({ value: s.id, label: s.name }))

  if (loading) return <LoadingSpinner message="Memuat penerimaan barang..." />

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={24}>
      <Flex justify="space-between" align="center">
        <Space align="center">
          <button onClick={() => navigate('/purchase/receipts')}>
            <ArrowLeft size={20} />
          </button>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {isNew ? 'Penerimaan Baru' : `GR ${header.gr_number}`}
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
              <Send size={18} /> Post (Terima Barang)
            </Button>
          )}
          {!isNew && header.status === 'posted' && canWrite && (
            <Button variant="secondary" onClick={() => navigate(`/purchase/invoices/new?from_gr=${id}`)}>
              <FileText size={18} /> Buat PI dari GR ini
            </Button>
          )}
        </Space>
      </Flex>

      <DocumentHeader
        docNumber={header.gr_number}
        date={header.date}
        onDateChange={d => setHeader(h => ({ ...h, date: d }))}
        status={isNew ? null : header.status}
        partyLabel="Supplier"
        partyId={header.supplier_id}
        onPartyChange={v => setHeader(h => ({ ...h, supplier_id: v }))}
        partyOptions={supplierOptions}
        notes={header.notes}
        onNotesChange={v => setHeader(h => ({ ...h, notes: v }))}
        readOnly={readOnly}
      />

      {/* Items table with unit price */}
      <Space direction="vertical" style={{ width: '100%' }} size={12}>
        <Typography.Title level={5} style={{ margin: 0 }}>Item Penerimaan</Typography.Title>
        <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#f3f4f6', borderBottom: '1px solid #e5e7eb' }}>
              <tr>
                <th style={{ padding: '8px 16px', textAlign: 'left', fontSize: 12, fontWeight: 500 }}>Produk</th>
                <th style={{ padding: '8px 16px', textAlign: 'left', fontSize: 12, fontWeight: 500 }}>Satuan</th>
                <th style={{ padding: '8px 16px', textAlign: 'right', fontSize: 12, fontWeight: 500 }}>Qty</th>
                <th style={{ padding: '8px 16px', textAlign: 'right', fontSize: 12, fontWeight: 500 }}>Qty (Base)</th>
                <th style={{ padding: '8px 16px', textAlign: 'right', fontSize: 12, fontWeight: 500 }}>Harga Beli</th>
                <th style={{ padding: '8px 16px', textAlign: 'right', fontSize: 12, fontWeight: 500 }}>Subtotal</th>
                {!readOnly && <th style={{ width: 40 }}></th>}
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const unitOpts = getUnitOptions(item.product_id)
                const productOpts = products.map(p => ({ value: p.id, label: `${p.name}${p.sku ? ` (${p.sku})` : ''}` }))
                const subtotal = (Number(item.quantity_base) || 0) * (Number(item.unit_price) || 0)

                return (
                  <tr key={item._key || idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '8px 16px', minWidth: 160 }}>
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
                    <td style={{ padding: '8px 16px', minWidth: 100 }}>
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
                    <td style={{ padding: '8px 16px', width: 96 }}>
                      {readOnly ? (
                        <span style={{ fontSize: 14, display: 'block', textAlign: 'right' }}>{item.quantity}</span>
                      ) : (
                        <input
                          type="number" min="0" step="any"
                          style={{ width: '100%', fontSize: 14, border: '1px solid #d1d5db', borderRadius: 4, padding: '2px 8px', textAlign: 'right' }}
                          value={item.quantity}
                          onChange={e => updateItem(idx, 'quantity', e.target.value)}
                        />
                      )}
                    </td>
                    <td style={{ padding: '8px 16px', fontSize: 14, textAlign: 'right', width: 96 }}>
                      {Number(item.quantity_base || 0).toFixed(4)}
                    </td>
                    <td style={{ padding: '8px 16px', width: 128 }}>
                      {readOnly ? (
                        <span style={{ fontSize: 14, display: 'block', textAlign: 'right' }}>{Number(item.unit_price).toLocaleString('id-ID')}</span>
                      ) : (
                        <input
                          type="number" min="0" step="any"
                          style={{ width: '100%', fontSize: 14, border: '1px solid #d1d5db', borderRadius: 4, padding: '2px 8px', textAlign: 'right' }}
                          value={item.unit_price}
                          onChange={e => updateItem(idx, 'unit_price', e.target.value)}
                        />
                      )}
                    </td>
                    <td style={{ padding: '8px 16px', fontSize: 14, textAlign: 'right', fontWeight: 500, width: 128 }}>
                      {subtotal.toLocaleString('id-ID')}
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
                  <td colSpan={readOnly ? 6 : 7} style={{ padding: '24px 16px', textAlign: 'center', fontSize: 14, color: '#6b7280' }}>
                    Tidak ada item
                  </td>
                </tr>
              )}
            </tbody>
            {items.length > 0 && (
              <tfoot style={{ borderTop: '1px solid #d1d5db', background: '#f9fafb' }}>
                <tr>
                  <td colSpan={5} style={{ padding: '8px 16px', fontSize: 14, fontWeight: 500, textAlign: 'right' }}>Total:</td>
                  <td style={{ padding: '8px 16px', fontSize: 14, fontWeight: 700, textAlign: 'right' }}>
                    {items.reduce((s, i) => s + (Number(i.quantity_base) || 0) * (Number(i.unit_price) || 0), 0).toLocaleString('id-ID')}
                  </td>
                  {!readOnly && <td></td>}
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {!readOnly && (
          <button
            type="button"
            onClick={() => setItems(prev => [...prev, { _key: Date.now(), product_id: '', unit_id: '', quantity: '', quantity_base: 0, unit_price: '' }])}
            style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}
          >
            <Plus size={18} /> Tambah Baris
          </button>
        )}
      </Space>

      {header.status === 'posted' && (
        <Alert
          type="success"
          message="Penerimaan telah diposting. Stok telah bertambah dan jurnal persediaan telah dibuat."
          showIcon
        />
      )}
    </Space>
  )
}
