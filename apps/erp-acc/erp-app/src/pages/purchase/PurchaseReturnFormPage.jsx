import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Space, Flex, Typography, Col, Alert } from 'antd'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../components/ui/ToastContext'
import { useProducts, useSuppliers } from '../../hooks/useMasterData'
import {
  getPurchaseReturn, savePurchaseReturn, postPurchaseReturn,
  getReturnablePurchaseInvoices, getReturnablePurchaseInvoiceItems,
} from '../../services/purchaseReturnService'
import { getGoodsReceipt, getPurchaseInvoice } from '../../services/purchaseService'
import { getWarehouses, getDefaultWarehouse } from '../../services/warehouseService'
import { today } from '../../utils/date'
import Button from '../../components/ui/Button'
import Select from '../../components/ui/Select'
import DocumentHeader from '../../components/shared/DocumentHeader'
import LineItemsTable from '../../components/shared/LineItemsTable'
import InvoiceReturnItemsPicker from '../../components/shared/InvoiceReturnItemsPicker'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { ArrowLeft, Save, Send } from 'lucide-react'

export default function PurchaseReturnFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { canWrite, canPost } = useAuth()
  const toast = useToast()
  const toastRef = useRef(toast)
  const isNew = !id || id === 'new'

  const { products } = useProducts()
  const { suppliers } = useSuppliers()

  const [loading, setLoading] = useState(!isNew)
  const [submitting, setSubmitting] = useState(false)
  const [header, setHeader] = useState({
    pr_number: '',
    date: today(),
    supplier_id: '',
    purchase_order_id: '',
    invoice_id: '',
    warehouse_id: '',
    status: 'draft',
    notes: '',
  })
  const [items, setItems] = useState([LineItemsTable.emptyRow()])
  const [warehouses, setWarehouses] = useState([])
  const [invoiceOptionsList, setInvoiceOptionsList] = useState([])
  const [returnableItems, setReturnableItems] = useState([])

  useEffect(() => { toastRef.current = toast }, [toast])

  // Load warehouses
  useEffect(() => {
    let cancelled = false
    async function loadWarehouses() {
      try {
        const [warehouseList, defaultWarehouse] = await Promise.all([
          getWarehouses(),
          isNew ? getDefaultWarehouse() : Promise.resolve(null),
        ])
        if (cancelled) return
        setWarehouses(warehouseList || [])
        if (isNew && defaultWarehouse?.id) {
          setHeader(h => h.warehouse_id ? h : { ...h, warehouse_id: defaultWarehouse.id })
        }
      } catch (err) {
        if (!cancelled) toastRef.current.error(err.message)
      }
    }
    loadWarehouses()
    return () => { cancelled = true }
  }, [isNew])

  // Load existing return if editing
  useEffect(() => {
    if (!isNew) {
      getPurchaseReturn(id)
        .then(pr => {
          setHeader({
            id: pr.id,
            pr_number: pr.pr_number,
            date: pr.date,
            supplier_id: pr.supplier_id,
            purchase_order_id: pr.purchase_order_id || '',
            invoice_id: pr.invoice_id || '',
            warehouse_id: pr.warehouse_id || '',
            status: pr.status,
            notes: pr.notes || '',
          })
          setItems(pr.items.map(i => ({
            _key: i.id,
            invoice_item_id: i.invoice_item_id || null,
            product_id: i.product_id,
            unit_id: i.unit_id,
            quantity: i.quantity,
            quantity_base: i.quantity_base,
            unit_price: i.unit_price,
            tax_amount: i.tax_amount || 0,
            total: i.total,
          })))
        })
        .catch(err => toastRef.current.error(err.message))
        .finally(() => setLoading(false))
    }
  }, [id, isNew])

  // Invoice-linked return: load this supplier's eligible invoices whenever
  // supplier changes (cleared when supplier is empty).
  useEffect(() => {
    let cancelled = false
    if (!header.supplier_id) { setInvoiceOptionsList([]); return }
    getReturnablePurchaseInvoices(header.supplier_id)
      .then(list => { if (!cancelled) setInvoiceOptionsList(list) })
      .catch(err => toastRef.current.error(err.message))
    return () => { cancelled = true }
  }, [header.supplier_id])

  // Load the selected invoice's returnable lines. Switching invoice clears
  // any items already picked (they belonged to the previous invoice).
  useEffect(() => {
    let cancelled = false
    if (!header.invoice_id) { setReturnableItems([]); return }
    getReturnablePurchaseInvoiceItems(header.invoice_id)
      .then(list => { if (!cancelled) setReturnableItems(list) })
      .catch(err => toastRef.current.error(err.message))
    return () => { cancelled = true }
  }, [header.invoice_id])

  function handleInvoiceChange(invoiceId) {
    setHeader(h => ({ ...h, invoice_id: invoiceId }))
    setItems([])
    setReturnableItems([])
  }

  function handleSupplierChange(supplierId) {
    setHeader(h => ({ ...h, supplier_id: supplierId, invoice_id: '' }))
    setItems([])
    setReturnableItems([])
  }

  // Pre-fill from Invoice (shortcut "Buat Retur" button on PurchaseInvoiceDetailPage)
  // Only sets header supplier_id + invoice_id — the existing invoice-linked
  // cascade (invoiceOptionsList / returnableItems effects above) takes over
  // from there, same as if the user had picked the invoice manually.
  useEffect(() => {
    const fromInvoiceId = searchParams.get('from_invoice')
    if (!fromInvoiceId || !isNew) return
    getPurchaseInvoice(fromInvoiceId)
      .then(inv => {
        setHeader(h => ({ ...h, supplier_id: inv.supplier_id, invoice_id: fromInvoiceId }))
      })
      .catch(err => toastRef.current.error('Gagal load invoice: ' + err.message))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-fill from GR (shortcut from GoodsReceiptFormPage)
  useEffect(() => {
    const fromGrId = searchParams.get('from_gr')
    if (!fromGrId || !isNew) return
    getGoodsReceipt(fromGrId)
      .then(gr => {
        setHeader(h => ({
          ...h,
          supplier_id: gr.supplier_id,
          purchase_order_id: gr.purchase_order_id || '',
          warehouse_id: gr.warehouse_id || h.warehouse_id,
        }))
        setItems(
          (gr.items || []).map(i => ({
            _key: i.id,
            product_id: i.product_id,
            unit_id: i.unit_id,
            quantity: i.quantity,
            quantity_base: i.quantity_base,
            unit_price: i.unit_price || 0,
            tax_amount: 0,
            total: (i.unit_price || 0) * Number(i.quantity),
          }))
        )
      })
      .catch(err => toastRef.current.error('Gagal load GR: ' + err.message))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const readOnly = !isNew && header.status === 'posted'

  const handleSave = async () => {
    if (!header.supplier_id) { toast.error('Pilih supplier terlebih dahulu'); return }
    if (!header.date) { toast.error('Tanggal wajib diisi'); return }
    const validItems = items.filter(i => i.product_id && Number(i.quantity) > 0)
    if (validItems.length === 0) { toast.error('Minimal satu item produk'); return }

    setSubmitting(true)
    try {
      const prId = await savePurchaseReturn(
        { id: isNew ? null : id, ...header },
        validItems
      )
      toast.success(isNew ? 'Retur pembelian berhasil dibuat' : 'Retur pembelian berhasil disimpan')
      navigate(`/purchase/returns/${prId}`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handlePost = async () => {
    setSubmitting(true)
    try {
      await postPurchaseReturn(id)
      toast.success('Retur diposting — stok berkurang, jurnal dibuat')
      setHeader(h => ({ ...h, status: 'posted' }))
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const supplierOptions = suppliers.map(s => ({ value: s.id, label: s.name }))
  const warehouseOptions = warehouses.map(w => ({
    value: w.id,
    label: w.code ? `${w.code} - ${w.name}` : w.name,
  }))

  if (loading) return <LoadingSpinner message="Memuat retur pembelian..." />

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={24}>
      <Flex justify="space-between" align="center">
        <Space align="center">
          <button onClick={() => navigate('/purchase/returns')}>
            <ArrowLeft size={20} />
          </button>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {isNew ? 'Retur Pembelian Baru' : `Retur ${header.pr_number}`}
          </Typography.Title>
        </Space>
        <Space>
          {!readOnly && canWrite && (
            <Button variant="secondary" onClick={handleSave} loading={submitting}>
              <Save size={18} /> Simpan Draft
            </Button>
          )}
          {!isNew && header.status === 'draft' && canPost && (
            <Button variant="primary" onClick={handlePost} loading={submitting}>
              <Send size={18} /> Post Retur
            </Button>
          )}
        </Space>
      </Flex>

      <DocumentHeader
        docNumber={header.pr_number}
        date={header.date}
        onDateChange={d => setHeader(h => ({ ...h, date: d }))}
        status={isNew ? null : header.status}
        partyLabel="Supplier"
        partyId={header.supplier_id}
        onPartyChange={handleSupplierChange}
        partyOptions={supplierOptions}
        notes={header.notes}
        onNotesChange={v => setHeader(h => ({ ...h, notes: v }))}
        readOnly={readOnly}
      >
        <Col span={12} style={{ marginTop: 16 }}>
          <Select
            label="Gudang"
            options={warehouseOptions}
            value={header.warehouse_id || ''}
            onChange={e => setHeader(h => ({ ...h, warehouse_id: e.target.value }))}
            placeholder="Pilih gudang..."
            disabled={readOnly}
          />
        </Col>
        <Col span={12} style={{ marginTop: 16 }}>
          <Select
            label="Invoice Asal (opsional)"
            options={invoiceOptionsList.map(i => ({ value: i.id, label: `${i.invoice_number} — ${i.date}` }))}
            value={header.invoice_id || ''}
            onChange={e => handleInvoiceChange(e.target.value)}
            placeholder="Tanpa invoice (retur stok saja)..."
            disabled={readOnly || !header.supplier_id}
          />
        </Col>
      </DocumentHeader>

      <Space direction="vertical" style={{ width: '100%' }} size={8}>
        <Typography.Title level={5} style={{ margin: 0 }}>Item Retur</Typography.Title>
        {header.invoice_id ? (
          <InvoiceReturnItemsPicker
            returnableItems={returnableItems}
            items={items}
            onItemsChange={setItems}
            readOnly={readOnly}
            showTax
            isTaxable={pid => products.find(p => p.id === pid)?.is_taxable}
            taxRate={pid => products.find(p => p.id === pid)?.tax_rate || 11}
          />
        ) : (
          <LineItemsTable
            items={items}
            onItemsChange={setItems}
            products={products}
            priceField="buy_price"
            readOnly={readOnly}
            showTax
          />
        )}
      </Space>

      {header.status === 'posted' && (
        <Alert
          type="success"
          message="Retur telah diposting. Stok telah berkurang dan jurnal telah dibuat."
          showIcon
        />
      )}
    </Space>
  )
}
