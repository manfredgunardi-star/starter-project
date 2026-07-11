import { useState, useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Space, Flex, Typography, Row, Col, Card, Select as AntdSelect, InputNumber } from 'antd'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../components/ui/ToastContext'
import { useProducts, useSuppliers } from '../../hooks/useMasterData'
import { getPurchaseInvoice, savePurchaseInvoice, postPurchaseInvoice, getGoodsReceipt } from '../../services/purchaseService'
import { getAvailableCredit } from '../../services/creditNoteService'
import dayjs from 'dayjs'
import { getPaymentTerms } from '../../services/paymentTermService'
import { today } from '../../utils/date'
import { formatCurrency } from '../../utils/currency'
import Button from '../../components/ui/Button'
import DocumentHeader from '../../components/shared/DocumentHeader'
import LineItemsTable from '../../components/shared/LineItemsTable'
import { rowTotals } from '../../utils/lineItemTotals'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { ArrowLeft, Save, Send } from 'lucide-react'

export default function PurchaseInvoiceFormPage() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { canWrite, canPost } = useAuth()
  const toast = useToast()
  const isNew = !id || id === 'new'

  const { products } = useProducts()
  const { suppliers } = useSuppliers()

  const [loading, setLoading] = useState(!isNew)
  const [submitting, setSubmitting] = useState(false)
  const [paymentTerms, setPaymentTerms] = useState([])
  const [header, setHeader] = useState({
    invoice_number: '',
    date: today(),
    due_date: '',
    supplier_id: '',
    purchase_order_id: searchParams.get('po') || '', // overridden by ?from_gr= if present
    goods_receipt_id: '',
    status: 'draft',
    notes: '',
    payment_term_id: '',
    credit_applied_amount: 0,
    return_credit_amount: 0,
  })
  const [items, setItems] = useState([LineItemsTable.emptyRow()])
  const [grRaw, setGrRaw] = useState(null) // raw GR awaiting products master to compute PPN

  useEffect(() => {
    getPaymentTerms()
      .then(setPaymentTerms)
      .catch(err => toast.error('Gagal load syarat pembayaran: ' + err.message))
  }, [])

  useEffect(() => {
    if (!isNew) {
      getPurchaseInvoice(id)
        .then(inv => {
          setHeader({
            id: inv.id,
            invoice_number: inv.invoice_number,
            date: inv.date,
            due_date: inv.due_date || '',
            supplier_id: inv.supplier_id,
            purchase_order_id: inv.purchase_order_id || '',
            goods_receipt_id: inv.goods_receipt_id || '',
            status: inv.status,
            notes: inv.notes || '',
            amount_paid: inv.amount_paid,
            total: inv.total,
            payment_term_id: inv.payment_term_id || '',
            credit_applied_amount: inv.credit_applied_amount || 0,
            return_credit_amount: inv.return_credit_amount || 0,
          })
          setItems(inv.items.map(i => ({
            _key: i.id,
            product_id: i.product_id,
            unit_id: i.unit_id,
            quantity: i.quantity,
            quantity_base: i.quantity_base,
            unit_price: i.unit_price,
            tax_amount: i.tax_amount,
            total: i.total,
          })))
        })
        .catch(err => toast.error(err.message))
        .finally(() => setLoading(false))
    }
  }, [id, isNew])

  useEffect(() => {
    const fromGrId = searchParams.get('from_gr')
    if (!fromGrId || !isNew) return
    getGoodsReceipt(fromGrId)
      .then(gr => {
        setHeader(h => ({
          ...h,
          supplier_id: gr.supplier_id,
          purchase_order_id: gr.purchase_order_id || '',
          goods_receipt_id: gr.id,
        }))
        setGrRaw(gr)
      })
      .catch(err => toast.error('Gagal load GR: ' + err.message))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Map GR items to invoice lines once the products master is loaded, so PPN
  // (is_taxable / tax_rate) can be computed instead of left at 0.
  useEffect(() => {
    if (!grRaw || products.length === 0) return
    setItems(
      (grRaw.items || []).map(i => {
        const prod = products.find(p => p.id === i.product_id)
        const row = {
          _key: i.id,
          product_id: i.product_id,
          unit_id: i.unit_id,
          quantity: i.quantity,
          quantity_base: i.quantity_base,
          unit_price: i.unit_price,
        }
        return { ...row, ...rowTotals(row, prod) }
      })
    )
  }, [grRaw, products])

  const [availableCredit, setAvailableCredit] = useState(0)

  useEffect(() => {
    let cancelled = false
    if (!header.supplier_id) { setAvailableCredit(0); return }
    getAvailableCredit('supplier', header.supplier_id)
      .then(v => { if (!cancelled) setAvailableCredit(v) })
      .catch(err => toast.error('Gagal memuat saldo kredit: ' + err.message))
    return () => { cancelled = true }
  }, [header.supplier_id])

  const readOnly = !isNew && header.status !== 'draft'

  function handleDateChange(d) {
    setHeader(h => {
      const next = { ...h, date: d }
      if (h.payment_term_id) {
        const term = paymentTerms.find(p => p.id === h.payment_term_id)
        if (term && d) next.due_date = dayjs(d).add(term.net_days, 'day').format('YYYY-MM-DD')
      }
      return next
    })
  }

  function handlePaymentTermChange(termId) {
    setHeader(h => {
      const next = { ...h, payment_term_id: termId || '' }
      const term = paymentTerms.find(p => p.id === termId)
      if (term && h.date) next.due_date = dayjs(h.date).add(term.net_days, 'day').format('YYYY-MM-DD')
      return next
    })
  }

  const handleSave = async () => {
    if (!header.supplier_id) { toast.error('Pilih supplier'); return }
    if (!header.date) { toast.error('Tanggal wajib diisi'); return }
    const validItems = items.filter(i => i.product_id && Number(i.quantity) > 0)
    if (validItems.length === 0) { toast.error('Minimal satu item'); return }
    const creditApplied = Number(header.credit_applied_amount) || 0
    if (creditApplied < 0) { toast.error('Kredit yang diterapkan tidak boleh negatif'); return }
    if (creditApplied > availableCredit + 0.01) { toast.error('Kredit yang diterapkan melebihi saldo kredit tersedia'); return }

    setSubmitting(true)
    try {
      const invId = await savePurchaseInvoice({ id: isNew ? null : id, ...header }, validItems)
      toast.success('Invoice pembelian berhasil disimpan')
      navigate(`/purchase/invoices/${invId}`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handlePost = async () => {
    setSubmitting(true)
    try {
      await postPurchaseInvoice(id)
      toast.success('Invoice diposting — jurnal hutang usaha dibuat')
      setHeader(h => ({ ...h, status: 'posted' }))
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const supplierOptions = suppliers.map(s => ({ value: s.id, label: s.name }))
  const creditApplied = Number(header.credit_applied_amount) || 0
  const returnCredit = Number(header.return_credit_amount) || 0
  const remaining = (header.total || 0) - creditApplied - returnCredit - (header.amount_paid || 0)

  if (loading) return <LoadingSpinner message="Memuat invoice pembelian..." />

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={24}>
      <Flex justify="space-between" align="center">
        <Space align="center">
          <button onClick={() => navigate('/purchase/invoices')}>
            <ArrowLeft size={20} />
          </button>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {isNew ? 'Invoice Pembelian Baru' : `Invoice ${header.invoice_number}`}
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
              <Send size={18} /> Post Invoice
            </Button>
          )}
          {!isNew && ['posted', 'partial'].includes(header.status) && (
            <Button variant="primary" onClick={() => navigate(`/cash/payments/new?invoice=${id}&type=outgoing`)}>
              Bayar Hutang
            </Button>
          )}
          {!isNew && ['posted', 'partial', 'paid'].includes(header.status) && (
            <Button variant="secondary" onClick={() => navigate(`/purchase/returns/new?from_invoice=${id}`)}>
              Buat Retur
            </Button>
          )}
        </Space>
      </Flex>

      <DocumentHeader
        docNumber={header.invoice_number}
        date={header.date}
        onDateChange={handleDateChange}
        status={isNew ? null : header.status}
        partyLabel="Supplier"
        partyId={header.supplier_id}
        onPartyChange={v => setHeader(h => ({ ...h, supplier_id: v, credit_applied_amount: 0 }))}
        partyOptions={supplierOptions}
        dueDate={header.due_date}
        onDueDateChange={d => setHeader(h => ({ ...h, due_date: d }))}
        notes={header.notes}
        onNotesChange={v => setHeader(h => ({ ...h, notes: v }))}
        readOnly={readOnly}
      />

      <Card size="small">
        <Row gutter={16}>
          <Col xs={24} md={10}>
            <div style={{ marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Syarat Pembayaran</div>
            <AntdSelect
              allowClear
              showSearch
              optionFilterProp="label"
              style={{ width: '100%' }}
              placeholder="Pilih syarat pembayaran..."
              value={header.payment_term_id || undefined}
              onChange={handlePaymentTermChange}
              disabled={readOnly}
              options={paymentTerms.map(p => ({
                value: p.id,
                label: `${p.name} (Net ${p.net_days})`
              }))}
            />
          </Col>
        </Row>
      </Card>

      {!readOnly && (
        <Card size="small">
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <div style={{ marginBottom: 4, fontSize: 13, fontWeight: 500 }}>
                Terapkan dari Saldo Kredit (Tersedia: {formatCurrency(availableCredit)})
              </div>
              <InputNumber
                style={{ width: '100%' }}
                min={0}
                max={Math.max(availableCredit, Number(header.credit_applied_amount) || 0)}
                value={header.credit_applied_amount || 0}
                onChange={v => setHeader(h => ({ ...h, credit_applied_amount: v || 0 }))}
                formatter={val => `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
                parser={val => val.replace(/\./g, '')}
                placeholder="0"
                disabled={availableCredit <= 0}
              />
            </Col>
          </Row>
        </Card>
      )}

      <Space direction="vertical" style={{ width: '100%' }} size={8}>
        <Typography.Title level={5} style={{ margin: 0 }}>Item Invoice</Typography.Title>
        <LineItemsTable
          items={items}
          onItemsChange={setItems}
          products={products}
          priceField="buy_price"
          readOnly={readOnly}
          showTax
        />
      </Space>

      {/* Hutang summary for posted invoices */}
      {!isNew && header.status !== 'draft' && (
        <Card style={{ background: '#fff7e6', border: '1px solid #ffd591' }}>
          <Row gutter={16}>
            <Col span={8}>
              <Typography.Text style={{ color: '#d46b08', display: 'block' }}>Total Invoice</Typography.Text>
              <Typography.Text strong style={{ color: '#873800', fontSize: 16 }}>{formatCurrency(header.total)}</Typography.Text>
            </Col>
            <Col span={8}>
              <Typography.Text type="success" style={{ display: 'block' }}>Dibayar</Typography.Text>
              <Typography.Text strong style={{ color: '#135200', fontSize: 16 }}>{formatCurrency(header.amount_paid)}</Typography.Text>
            </Col>
            <Col span={8}>
              <Typography.Text type="danger" style={{ display: 'block' }}>Sisa Hutang</Typography.Text>
              <Typography.Text strong type="danger" style={{ fontSize: 16 }}>{formatCurrency(remaining)}</Typography.Text>
            </Col>
          </Row>
          <Row gutter={16} style={{ marginTop: 12 }}>
            <Col span={8}>
              <Typography.Text style={{ color: '#d46b08', display: 'block' }}>Kredit Diterapkan</Typography.Text>
              <Typography.Text strong style={{ color: '#873800', fontSize: 16 }}>{formatCurrency(header.credit_applied_amount || 0)}</Typography.Text>
            </Col>
          </Row>
        </Card>
      )}
    </Space>
  )
}
