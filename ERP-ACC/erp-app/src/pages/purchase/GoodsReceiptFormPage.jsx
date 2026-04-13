import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../components/ui/ToastContext'
import { useProducts, useSuppliers } from '../../hooks/useMasterData'
import { getGoodsReceipt, saveGoodsReceipt, postGoodsReceipt } from '../../services/purchaseService'
import { today } from '../../utils/date'
import Button from '../../components/ui/Button'
import DocumentHeader from '../../components/shared/DocumentHeader'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { ArrowLeft, Save, Send, Trash2, Plus } from 'lucide-react'

export default function GoodsReceiptFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { canWrite, canPost } = useAuth()
  const toast = useToast()
  const isNew = !id || id === 'new'

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/purchase/receipts')} className="text-gray-500 hover:text-gray-700">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-bold text-gray-900">
            {isNew ? 'Penerimaan Baru' : `GR ${header.gr_number}`}
          </h1>
        </div>
        <div className="flex gap-3">
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
        </div>
      </div>

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
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">Item Penerimaan</h2>
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full border-collapse">
            <thead className="bg-gray-100 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-700">Produk</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-700">Satuan</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-700">Qty</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-700">Qty (Base)</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-700">Harga Beli</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-700">Subtotal</th>
                {!readOnly && <th className="w-10"></th>}
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const unitOpts = getUnitOptions(item.product_id)
                const productOpts = products.map(p => ({ value: p.id, label: `${p.name}${p.sku ? ` (${p.sku})` : ''}` }))
                const subtotal = (Number(item.quantity_base) || 0) * (Number(item.unit_price) || 0)

                return (
                  <tr key={item._key || idx} className="border-b border-gray-200">
                    <td className="px-4 py-2 min-w-[160px]">
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
                    <td className="px-4 py-2 min-w-[100px]">
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
                    <td className="px-4 py-2 w-24">
                      {readOnly ? (
                        <span className="text-sm text-right block">{item.quantity}</span>
                      ) : (
                        <input
                          type="number" min="0" step="any"
                          className="w-full text-sm border border-gray-300 rounded px-2 py-1 text-right"
                          value={item.quantity}
                          onChange={e => updateItem(idx, 'quantity', e.target.value)}
                        />
                      )}
                    </td>
                    <td className="px-4 py-2 text-sm text-right text-gray-500 w-24">
                      {Number(item.quantity_base || 0).toFixed(4)}
                    </td>
                    <td className="px-4 py-2 w-32">
                      {readOnly ? (
                        <span className="text-sm text-right block">{Number(item.unit_price).toLocaleString('id-ID')}</span>
                      ) : (
                        <input
                          type="number" min="0" step="any"
                          className="w-full text-sm border border-gray-300 rounded px-2 py-1 text-right"
                          value={item.unit_price}
                          onChange={e => updateItem(idx, 'unit_price', e.target.value)}
                        />
                      )}
                    </td>
                    <td className="px-4 py-2 text-sm text-right font-medium text-gray-900 w-32">
                      {subtotal.toLocaleString('id-ID')}
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
                  <td colSpan={readOnly ? 6 : 7} className="px-4 py-6 text-center text-sm text-gray-500">
                    Tidak ada item
                  </td>
                </tr>
              )}
            </tbody>
            {items.length > 0 && (
              <tfoot className="border-t border-gray-300 bg-gray-50">
                <tr>
                  <td colSpan={5} className="px-4 py-2 text-sm font-medium text-right">Total:</td>
                  <td className="px-4 py-2 text-sm font-bold text-right text-gray-900">
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
            className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
          >
            <Plus size={18} /> Tambah Baris
          </button>
        )}
      </div>

      {header.status === 'posted' && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-800 text-sm">
          Penerimaan telah diposting. Stok telah bertambah dan jurnal persediaan telah dibuat.
        </div>
      )}
    </div>
  )
}
