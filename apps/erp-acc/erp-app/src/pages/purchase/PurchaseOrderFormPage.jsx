import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Space, Flex, Typography, Card, Alert, Spin, Col } from 'antd'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../components/ui/ToastContext'
import { useSuppliers } from '../../hooks/useMasterData'
import { useProducts } from '../../hooks/useMasterData'
import { savePurchaseOrder, getPurchaseOrder, confirmPurchaseOrder } from '../../services/purchaseService'
import { getPaymentTerms } from '../../services/paymentTermService'
import { getWarehouses, getDefaultWarehouse } from '../../services/warehouseService'
import { today } from '../../utils/date'
import Button from '../../components/ui/Button'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import DocumentHeader from '../../components/shared/DocumentHeader'
import LineItemsTable from '../../components/shared/LineItemsTable'
import Select from '../../components/ui/Select'
import { ArrowLeft, Save, Check, Printer, FileDown, ClipboardList } from 'lucide-react'
import { usePrintPO } from '../../hooks/usePrintPO'

export default function PurchaseOrderFormPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const { canWrite, canPost } = useAuth()
  const toast = useToast()
  const toastRef = useRef(toast)
  const { triggerPrint, triggerPDF, loadingIds } = usePrintPO()

  const { suppliers } = useSuppliers()
  const { products } = useProducts()

  const [loading, setLoading] = useState(!!id)
  const [submitting, setSubmitting] = useState(false)
  const [po, setPO] = useState(null)
  const [items, setItems] = useState([])
  const [paymentTerms, setPaymentTerms] = useState([])
  const [warehouses, setWarehouses] = useState([])

  useEffect(() => {
    toastRef.current = toast
  }, [toast])

  useEffect(() => {
    let cancelled = false

    async function loadHeaderReferences() {
      try {
        const [terms, warehouseList, defaultWarehouse] = await Promise.all([
          getPaymentTerms(),
          getWarehouses(),
          !id ? getDefaultWarehouse() : Promise.resolve(null),
        ])

        if (cancelled) return

        setPaymentTerms(terms || [])
        setWarehouses(warehouseList || [])

        if (!id && defaultWarehouse?.id) {
          setPO(current => {
            if (!current || current.warehouse_id) return current
            return { ...current, warehouse_id: defaultWarehouse.id }
          })
        }
      } catch (err) {
        if (!cancelled) toastRef.current.error(err.message)
      }
    }

    loadHeaderReferences()

    return () => {
      cancelled = true
    }
  }, [id])

  // Load existing PO if editing
  useEffect(() => {
    if (!id) {
      setPO({
        po_number: '',
        date: today(),
        supplier_id: '',
        payment_term_id: '',
        warehouse_id: '',
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
          payment_term_id: data.payment_term_id || '',
          warehouse_id: data.warehouse_id || '',
          status: data.status,
          notes: data.notes || '',
        })
        setItems(data.purchase_order_items || [])
      })
      .catch(err => {
        toastRef.current.error(err.message)
        navigate('/purchase/orders')
      })
      .finally(() => setLoading(false))
  }, [id, navigate])

  if (loading) return <LoadingSpinner message="Memuat PO..." />
  if (!po) return null

  const supplierOptions = suppliers.map(s => ({ value: s.id, label: s.name }))
  const paymentTermOptions = paymentTerms.map(term => ({
    value: term.id,
    label: `${term.name} (Net ${term.net_days ?? 0})`,
  }))
  const warehouseOptions = warehouses.map(warehouse => ({
    value: warehouse.id,
    label: warehouse.code ? `${warehouse.code} - ${warehouse.name}` : warehouse.name,
  }))
  const readOnly = po.status !== 'draft'

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
      const savedId = await savePurchaseOrder(po, items)
      await confirmPurchaseOrder(savedId)
      toast.success('PO berhasil dikonfirmasi')
      navigate('/purchase/orders')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={24}>
      <Space align="center">
        <button onClick={() => navigate('/purchase/orders')}>
          <ArrowLeft size={20} />
        </button>
        <Typography.Title level={4} style={{ margin: 0 }}>
          {id ? 'Edit PO' : 'Buat Purchase Order'}
        </Typography.Title>
      </Space>

      <Card>
        <Space direction="vertical" style={{ width: '100%' }} size={24}>
          <DocumentHeader
            docNumber={po.po_number}
            date={po.date}
            onDateChange={d => setPO({ ...po, date: d })}
            status={po.status}
            partyLabel="Supplier"
            partyId={po.supplier_id}
            onPartyChange={v => setPO({ ...po, supplier_id: v })}
            partyOptions={supplierOptions}
            notes={po.notes}
            onNotesChange={v => setPO({ ...po, notes: v })}
            readOnly={readOnly}
          >
            <Col span={12} style={{ marginTop: 16 }}>
              <Select
                label="Syarat Pembayaran"
                options={paymentTermOptions}
                value={po.payment_term_id || ''}
                onChange={e => setPO({ ...po, payment_term_id: e.target.value })}
                placeholder="Pilih syarat pembayaran..."
                disabled={readOnly}
              />
            </Col>

            <Col span={12} style={{ marginTop: 16 }}>
              <Select
                label="Gudang"
                options={warehouseOptions}
                value={po.warehouse_id || ''}
                onChange={e => setPO({ ...po, warehouse_id: e.target.value })}
                placeholder="Pilih gudang..."
                disabled={readOnly}
              />
            </Col>
          </DocumentHeader>

          <LineItemsTable
            items={items}
            onItemsChange={setItems}
            products={products}
            priceField="buy_price"
            showTax={true}
            readOnly={readOnly}
          />

          <Alert
            type="info"
            message="Setelah dikonfirmasi, PO tidak dapat diubah. Lanjutkan dengan membuat Goods Receipt."
            showIcon
          />

          <Flex justify="flex-end" gap={12}>
            {id && po?.status === 'confirmed' && canWrite && (
              <Button variant="secondary" onClick={() => navigate(`/purchase/receipts/new?from_po=${id}`)}>
                <ClipboardList size={18} /> Buat GR dari PO ini
              </Button>
            )}
            <Button variant="secondary" onClick={() => navigate('/purchase/orders')}>
              Batal
            </Button>
            {po.status === 'draft' && canWrite && (
              <Button variant="primary" onClick={handleSave} loading={submitting}>
                <Save size={18} /> Simpan Draft
              </Button>
            )}
            {po.status === 'draft' && canPost && (
              <Button variant="primary" onClick={handleConfirm} loading={submitting}>
                <Check size={18} /> Konfirmasi
              </Button>
            )}
            {id && (
              <>
                <Button
                  variant="secondary"
                  onClick={() => triggerPrint(id)}
                  disabled={loadingIds[id]}
                >
                  {loadingIds[id] ? <Spin size="small" /> : <Printer size={18} />}
                  Print
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => triggerPDF(id)}
                  disabled={loadingIds[id]}
                >
                  {loadingIds[id] ? <Spin size="small" /> : <FileDown size={18} />}
                  Download PDF
                </Button>
              </>
            )}
          </Flex>
        </Space>
      </Card>
    </Space>
  )
}
