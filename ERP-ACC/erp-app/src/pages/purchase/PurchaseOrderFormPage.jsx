import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useToast } from '../../components/ui/ToastContext'
import { usePurchaseOrders } from '../../hooks/usePurchase'
import { useSuppliers } from '../../hooks/useMasterData'
import { useProducts } from '../../hooks/useMasterData'
import { savePurchaseOrder, getPurchaseOrder, confirmPurchaseOrder } from '../../services/purchaseService'
import { formatCurrency } from '../../utils/currency'
import { today } from '../../utils/date'
import Button from '../../components/ui/Button'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import DocumentHeader from '../../components/shared/DocumentHeader'
import LineItemsTable from '../../components/shared/LineItemsTable'
import { ArrowLeft, Save, Check } from 'lucide-react'

export default function PurchaseOrderFormPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const toast = useToast()

  const { suppliers } = useSuppliers()
  const { products } = useProducts()
  const { purchaseOrders } = usePurchaseOrders()

  const [loading, setLoading] = useState(!!id)
  const [submitting, setSubmitting] = useState(false)
  const [po, setPO] = useState(null)
  const [items, setItems] = useState([])

  // Load existing PO if editing
  useEffect(() => {
    if (!id) {
      setPO({
        po_number: '',
        date: today(),
        supplier_id: '',
        status: 'draft',
        notes: '',
      })
      setItems([])
      setLoading(false)
      return
    }

    getPurchaseOrder(id)
      .then(data => {
        setPO({
          id: data.id,
          po_number: data.po_number,
          date: data.date,
          supplier_id: data.supplier_id,
          status: data.status,
          notes: data.notes,
        })
        setItems(data.purchase_order_items || [])
      })
      .catch(err => {
        toast.error(err.message)
        navigate('/purchase/orders')
      })
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <LoadingSpinner message="Memuat PO..." />
  if (!po) return null

  const supplierOptions = suppliers.map(s => ({ value: s.id, label: s.name }))

  const validate = () => {
    if (!po.date) { toast.error('Tanggal wajib diisi'); return false }
    if (!po.supplier_id) { toast.error('Pilih supplier'); return false }
    if (items.length === 0) { toast.error('Tambahkan minimal 1 item'); return false }
    if (items.some(i => !i.product_id || !i.quantity || !i.unit_id)) {
      toast.error('Pastikan semua item lengkap')
      return false
    }
    return true
  }

  const handleSave = async () => {
    if (!validate()) return
    setSubmitting(true)
    try {
      await savePurchaseOrder(po, items)
      toast.success('PO berhasil disimpan')
      navigate('/purchase/orders')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleConfirm = async () => {
    if (!validate()) return
    setSubmitting(true)
    try {
      await savePurchaseOrder(po, items)
      await confirmPurchaseOrder(po.id || (await getPurchaseOrder(po.id)).id)
      toast.success('PO berhasil dikonfirmasi')
      navigate('/purchase/orders')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/purchase/orders')} className="text-gray-500 hover:text-gray-700">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">
          {id ? 'Edit PO' : 'Buat Purchase Order'}
        </h1>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-6">
        <DocumentHeader
          docNumber={po.po_number}
          date={po.date}
          onDateChange={e => setPO({ ...po, date: e.target.value })}
          status={po.status}
          partyLabel="Supplier"
          partyId={po.supplier_id}
          onPartyChange={e => setPO({ ...po, supplier_id: e.target.value })}
          partyOptions={supplierOptions}
          notes={po.notes}
          onNotesChange={e => setPO({ ...po, notes: e.target.value })}
          readOnly={po.status !== 'draft'}
        />

        <LineItemsTable
          items={items}
          onItemsChange={setItems}
          products={products}
          priceField="buy_price"
          showTax={true}
          readOnly={po.status !== 'draft'}
        />

        <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs text-blue-800">
          Setelah dikonfirmasi, PO tidak dapat diubah. Lanjutkan dengan membuat Goods Receipt.
        </div>

        <div className="flex gap-3 justify-end pt-2">
          <Button variant="secondary" onClick={() => navigate('/purchase/orders')}>
            Batal
          </Button>
          {po.status === 'draft' && (
            <>
              <Button variant="primary" onClick={handleSave} loading={submitting}>
                <Save size={18} /> Simpan Draft
              </Button>
              <Button variant="primary" onClick={handleConfirm} loading={submitting}>
                <Check size={18} /> Konfirmasi
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
