import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Space, Flex, Typography, Col, Alert } from 'antd'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../components/ui/ToastContext'
import { useProducts, useCustomers } from '../../hooks/useMasterData'
import {
  getSalesReturn, saveSalesReturn, postSalesReturn,
  getReturnableSalesInvoices, getReturnableSalesInvoiceItems,
  getCustomerReturnableProducts,
} from '../../services/salesReturnService'
import { getGoodsDelivery, getSalesInvoice } from '../../services/salesService'
import { getWarehouses, getDefaultWarehouse } from '../../services/warehouseService'
import { today } from '../../utils/date'
import Button from '../../components/ui/Button'
import Select from '../../components/ui/Select'
import DocumentHeader from '../../components/shared/DocumentHeader'
import InvoiceReturnItemsPicker from '../../components/shared/InvoiceReturnItemsPicker'
import PartyReturnableProductsPicker from '../../components/shared/PartyReturnableProductsPicker'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { ArrowLeft, Save, Send } from 'lucide-react'

export default function SalesReturnFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { canWrite, canPost } = useAuth()
  const toast = useToast()
  const toastRef = useRef(toast)
  const isNew = !id || id === 'new'

  const { products } = useProducts()
  const { customers } = useCustomers()

  const [loading, setLoading] = useState(!isNew)
  const [submitting, setSubmitting] = useState(false)
  const gdPrefillDoneRef = useRef(false)
  const [header, setHeader] = useState({
    sr_number: '',
    date: today(),
    customer_id: '',
    sales_order_id: '',
    invoice_id: '',
    warehouse_id: '',
    status: 'draft',
    notes: '',
  })
  const [items, setItems] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [invoiceOptionsList, setInvoiceOptionsList] = useState([])
  const [returnableItems, setReturnableItems] = useState([])
  const [returnableProducts, setReturnableProducts] = useState([])

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
      getSalesReturn(id)
        .then(sr => {
          setHeader({
            id: sr.id,
            sr_number: sr.sr_number,
            date: sr.date,
            customer_id: sr.customer_id,
            sales_order_id: sr.sales_order_id || '',
            invoice_id: sr.invoice_id || '',
            warehouse_id: sr.warehouse_id || '',
            status: sr.status,
            notes: sr.notes || '',
          })
          setItems(sr.items.map(i => ({
            _key: i.id,
            invoice_item_id: i.invoice_item_id || null,
            product_id: i.product_id,
            unit_id: i.unit_id,
            quantity: i.quantity,
            quantity_base: i.quantity_base,
            unit_price: i.unit_price,
            tax_amount: i.tax_amount,
            total: i.total,
          })))
        })
        .catch(err => toastRef.current.error(err.message))
        .finally(() => setLoading(false))
    }
  }, [id, isNew])

  // Invoice-linked return: load this customer's eligible invoices whenever
  // customer changes (cleared when customer is empty).
  useEffect(() => {
    let cancelled = false
    if (!header.customer_id) { setInvoiceOptionsList([]); return }
    getReturnableSalesInvoices(header.customer_id)
      .then(list => { if (!cancelled) setInvoiceOptionsList(list) })
      .catch(err => toastRef.current.error(err.message))
    return () => { cancelled = true }
  }, [header.customer_id])

  // Load the selected invoice's returnable lines. Switching invoice clears
  // any items already picked (they belonged to the previous invoice).
  useEffect(() => {
    let cancelled = false
    if (!header.invoice_id) { setReturnableItems([]); return }
    getReturnableSalesInvoiceItems(header.invoice_id)
      .then(list => { if (!cancelled) setReturnableItems(list) })
      .catch(err => toastRef.current.error(err.message))
    return () => { cancelled = true }
  }, [header.invoice_id])

  // Returnable products for the "tanpa invoice (retur stok saja)" path —
  // only loaded/shown when no invoice is linked. Ledger comes from
  // sales_return_remaining_qty (see
  // docs/superpowers/specs/2026-07-14-double-retur-prevention-design.md).
  useEffect(() => {
    let cancelled = false
    if (!header.customer_id || header.invoice_id) { setReturnableProducts([]); return }
    getCustomerReturnableProducts(header.customer_id)
      .then(list => { if (!cancelled) setReturnableProducts(list) })
      .catch(err => toastRef.current.error(err.message))
    return () => { cancelled = true }
  }, [header.customer_id, header.invoice_id])

  // Clamp any pre-filled items (e.g. from the GD-prefill effect below) to
  // the current returnable-qty ledger once it loads — prevents the GD
  // shortcut from pre-filling more than what's actually still returnable.
  useEffect(() => {
    if (header.invoice_id) return
    if (returnableProducts.length === 0) return
    setItems(prev => prev
      .map(i => {
        const match = returnableProducts.find(r => r.product_id === i.product_id)
        if (!match) return null
        const originalQty = Number(i.quantity) || 0
        const qty = Math.min(originalQty, Number(match.remaining))
        if (qty <= 0) return null
        const ratio = originalQty > 0 ? qty / originalQty : 0
        return {
          ...i,
          quantity: qty,
          quantity_base: qty,
          tax_amount: Number(i.tax_amount || 0) * ratio,
          total: qty * Number(i.unit_price) + Number(i.tax_amount || 0) * ratio,
        }
      })
      .filter(Boolean))
  }, [returnableProducts]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleInvoiceChange(invoiceId) {
    setHeader(h => ({ ...h, invoice_id: invoiceId }))
    setItems([])
    setReturnableItems([])
  }

  function handleCustomerChange(customerId) {
    setHeader(h => ({ ...h, customer_id: customerId, invoice_id: '' }))
    setItems([])
    setReturnableItems([])
  }

  // Pre-fill from Invoice (shortcut "Buat Retur" button on SalesInvoiceDetailPage)
  // Only sets header customer_id + invoice_id — the existing invoice-linked
  // cascade (invoiceOptionsList / returnableItems effects above) takes over
  // from there, same as if the user had picked the invoice manually.
  useEffect(() => {
    const fromInvoiceId = searchParams.get('from_invoice')
    if (!fromInvoiceId || !isNew) return
    getSalesInvoice(fromInvoiceId)
      .then(inv => {
        setHeader(h => ({ ...h, customer_id: inv.customer_id, invoice_id: fromInvoiceId }))
      })
      .catch(err => toastRef.current.error('Gagal load invoice: ' + err.message))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-fill from GD (shortcut from GoodsDeliveryFormPage)
  // Wait for products to load before running so sell_price is available
  useEffect(() => {
    const fromGdId = searchParams.get('from_gd')
    if (!fromGdId || !isNew || gdPrefillDoneRef.current) return
    if (products.length === 0) return // products not loaded yet — re-run when they arrive
    gdPrefillDoneRef.current = true
    getGoodsDelivery(fromGdId)
      .then(gd => {
        setHeader(h => ({
          ...h,
          customer_id: gd.customer_id,
          sales_order_id: gd.sales_order_id || '',
          warehouse_id: gd.warehouse_id || h.warehouse_id,
        }))
        setItems(
          (gd.items || []).map(i => {
            const prod = products.find(p => p.id === i.product_id)
            return {
              _key: i.id,
              product_id: i.product_id,
              unit_id: i.unit_id,
              quantity: i.quantity,
              quantity_base: i.quantity_base,
              unit_price: prod?.sell_price || 0,
              tax_amount: 0,
              total: (prod?.sell_price || 0) * Number(i.quantity),
            }
          })
        )
      })
      .catch(err => toastRef.current.error('Gagal load GD: ' + err.message))
  }, [products, isNew, searchParams])

  const readOnly = !isNew && header.status === 'posted'

  const handleSave = async () => {
    if (!header.customer_id) { toast.error('Pilih customer terlebih dahulu'); return }
    if (!header.date) { toast.error('Tanggal wajib diisi'); return }
    const validItems = items.filter(i => i.product_id && Number(i.quantity) > 0)
    if (validItems.length === 0) { toast.error('Minimal satu item produk'); return }

    setSubmitting(true)
    try {
      const srId = await saveSalesReturn(
        { id: isNew ? null : id, ...header },
        validItems
      )
      toast.success(isNew ? 'Retur penjualan berhasil dibuat' : 'Retur penjualan berhasil disimpan')
      navigate(`/sales/returns/${srId}`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handlePost = async () => {
    setSubmitting(true)
    try {
      await postSalesReturn(id)
      toast.success('Retur diposting — stok bertambah, jurnal dibuat')
      setHeader(h => ({ ...h, status: 'posted' }))
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const customerOptions = customers.map(c => ({ value: c.id, label: c.name }))
  const warehouseOptions = warehouses.map(w => ({
    value: w.id,
    label: w.code ? `${w.code} - ${w.name}` : w.name,
  }))

  if (loading) return <LoadingSpinner message="Memuat retur penjualan..." />

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={24}>
      <Flex justify="space-between" align="center">
        <Space align="center">
          <button onClick={() => navigate('/sales/returns')}>
            <ArrowLeft size={20} />
          </button>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {isNew ? 'Retur Penjualan Baru' : `Retur ${header.sr_number}`}
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
        docNumber={header.sr_number}
        date={header.date}
        onDateChange={d => setHeader(h => ({ ...h, date: d }))}
        status={isNew ? null : header.status}
        partyLabel="Customer"
        partyId={header.customer_id}
        onPartyChange={handleCustomerChange}
        partyOptions={customerOptions}
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
            disabled={readOnly || !header.customer_id}
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
          <PartyReturnableProductsPicker
            returnableProducts={returnableProducts}
            items={items}
            onItemsChange={setItems}
            readOnly={readOnly}
            showTax
            isTaxable={pid => products.find(p => p.id === pid)?.is_taxable}
            taxRate={pid => products.find(p => p.id === pid)?.tax_rate || 11}
          />
        )}
      </Space>

      {header.status === 'posted' && (
        <Alert
          type="success"
          message="Retur telah diposting. Stok telah bertambah dan jurnal telah dibuat."
          showIcon
        />
      )}
    </Space>
  )
}
