import { useState, useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Space, Flex, Typography, Row, Col, Card, Switch, Divider, Select as AntdSelect, InputNumber } from 'antd'
import dayjs from 'dayjs'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../components/ui/ToastContext'
import { useProducts, useCustomers, useCOA } from '../../hooks/useMasterData'
import { getSalesInvoice, saveSalesInvoice, postSalesInvoice, getGoodsDelivery } from '../../services/salesService'
import { createRecurringTemplate } from '../../services/recurringService'
import { getPaymentTerms } from '../../services/paymentTermService'
import { today } from '../../utils/date'
import { formatCurrency } from '../../utils/currency'
import Button from '../../components/ui/Button'
import DateInput from '../../components/ui/DateInput'
import DocumentHeader from '../../components/shared/DocumentHeader'
import LineItemsTable from '../../components/shared/LineItemsTable'
import { rowTotals } from '../../utils/lineItemTotals'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { usePrintInvoice } from '../../hooks/usePrintInvoice'
import { ArrowLeft, Save, Send, Printer, FileDown, Repeat } from 'lucide-react'

export default function SalesInvoiceFormPage() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { canPost, canWrite } = useAuth()
  const toast = useToast()
  const { triggerPrint, triggerPDF, loadingIds } = usePrintInvoice()
  const isPrinting = loadingIds[id] || false
  const isNew = !id || id === 'new'

  const { products } = useProducts()
  const { customers } = useCustomers()
  const { coa } = useCOA()

  const [loading, setLoading] = useState(!isNew)
  const [submitting, setSubmitting] = useState(false)
  const [paymentTerms, setPaymentTerms] = useState([])
  const [header, setHeader] = useState({
    invoice_number: '',
    date: today(),
    due_date: '',
    customer_id: '',
    payment_term_id: '',
    sales_order_id: searchParams.get('so') || '', // overridden by ?from_gd= if present
    goods_delivery_id: '',
    status: 'draft',
    notes: '',
    advance_deduction_amount: 0,
    advance_deduction_coa_id: '',
  })
  const [items, setItems] = useState([LineItemsTable.emptyRow()])
  const [gdRaw, setGdRaw] = useState(null) // raw GD awaiting products master to compute price + PPN

  useEffect(() => {
    getPaymentTerms()
      .then(setPaymentTerms)
      .catch(err => toast.error('Gagal load syarat pembayaran: ' + err.message))
  }, [])

  // ----- Recurring template state (only relevant for new invoices) -----
  const [makeRecurring, setMakeRecurring] = useState(false)
  const [recurInterval, setRecurInterval] = useState('monthly')
  const [recurDay,      setRecurDay]      = useState(1)
  const [recurStart,    setRecurStart]    = useState('')

  useEffect(() => {
    if (!isNew) {
      getSalesInvoice(id)
        .then(inv => {
          setHeader({
            id: inv.id,
            invoice_number: inv.invoice_number,
            date: inv.date,
            due_date: inv.due_date || '',
            customer_id: inv.customer_id,
            payment_term_id: inv.payment_term_id || '',
            sales_order_id: inv.sales_order_id || '',
            goods_delivery_id: inv.goods_delivery_id || '',
            status: inv.status,
            notes: inv.notes || '',
            advance_deduction_amount: inv.advance_deduction_amount || 0,
            advance_deduction_coa_id: inv.advance_deduction_coa_id || '',
            amount_paid: inv.amount_paid,
            total: inv.total,
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
    const fromGdId = searchParams.get('from_gd')
    if (!fromGdId || !isNew) return
    getGoodsDelivery(fromGdId)
      .then(gd => {
        setHeader(h => ({
          ...h,
          customer_id: gd.customer_id,
          sales_order_id: gd.sales_order_id || '',
          goods_delivery_id: gd.id,
        }))
        setGdRaw(gd)
      })
      .catch(err => toast.error('Gagal load GD: ' + err.message))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Map GD items to invoice lines once the products master is loaded. GD carries
  // no price, so fill unit_price from product.sell_price, then compute PPN
  // (is_taxable / tax_rate) instead of leaving price/tax at 0.
  useEffect(() => {
    if (!gdRaw || products.length === 0) return
    setItems(
      (gdRaw.items || []).map(i => {
        const prod = products.find(p => p.id === i.product_id)
        const row = {
          _key: i.id,
          product_id: i.product_id,
          unit_id: i.unit_id,
          quantity: i.quantity,
          quantity_base: i.quantity_base,
          unit_price: prod ? (prod.sell_price ?? 0) : '',
        }
        return { ...row, ...rowTotals(row, prod) }
      })
    )
  }, [gdRaw, products])

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
    if (!header.customer_id) { toast.error('Pilih customer'); return }
    if (!header.date) { toast.error('Tanggal wajib diisi'); return }
    const validItems = items.filter(i => i.product_id && Number(i.quantity) > 0)
    if (validItems.length === 0) { toast.error('Minimal satu item'); return }
    if (advance < 0) { toast.error('Potongan uang muka tidak boleh negatif'); return }
    if (advance > clientTotal + 0.01) { toast.error('Potongan uang muka melebihi total invoice'); return }
    if (advance > 0 && !header.advance_deduction_coa_id) { toast.error('Pilih akun COA uang muka'); return }
    if (makeRecurring && !recurStart) {
      toast.error('Tanggal mulai untuk template berulang wajib diisi')
      return
    }

    setSubmitting(true)
    try {
      const invId = await saveSalesInvoice({ id: isNew ? null : id, ...header }, validItems)

      if (makeRecurring && isNew) {
        try {
          const dueDays = header.due_date && header.date
            ? Math.max(0, Math.round((new Date(header.due_date) - new Date(header.date)) / 86400000))
            : 30
          const customer = customers.find(c => c.id === header.customer_id)
          const subtotal = validItems.reduce((s, i) => s + (Number(i.unit_price) * Number(i.quantity) || 0), 0)
          const taxAmount = validItems.reduce((s, i) => s + (Number(i.tax_amount) || 0), 0)

          await createRecurringTemplate({
            name:          `Invoice Berulang – ${customer?.name ?? 'Customer'}`,
            type:          'invoice',
            interval_type: recurInterval,
            day_of_month:  recurInterval === 'monthly' ? recurDay : null,
            start_date:    recurStart,
            template_data: {
              customer_id: header.customer_id,
              due_days:    dueDays,
              notes:       header.notes ?? '',
              subtotal,
              tax_amount:  taxAmount,
              total:       subtotal + taxAmount,
              items: validItems.map(it => ({
                product_id:    it.product_id,
                unit_id:       it.unit_id,
                quantity:      Number(it.quantity) || 0,
                quantity_base: Number(it.quantity_base) || Number(it.quantity) || 0,
                unit_price:    Number(it.unit_price) || 0,
                tax_amount:    Number(it.tax_amount) || 0,
                total:         Number(it.total) || 0,
              })),
            },
          })
          toast.success('Template berulang dibuat')
        } catch (err) {
          // Template creation failure should not block invoice save
          toast.error('Invoice tersimpan, tapi gagal membuat template berulang: ' + err.message)
        }
      }

      toast.success('Invoice berhasil disimpan')
      navigate(`/sales/invoices/${invId}`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handlePost = async () => {
    setSubmitting(true)
    try {
      await postSalesInvoice(id)
      toast.success('Invoice diposting — jurnal piutang & pendapatan dibuat')
      setHeader(h => ({ ...h, status: 'posted' }))
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const customerOptions = customers.map(c => ({ value: c.id, label: c.name }))
  const coaOptions = coa.map(c => ({ value: c.id, label: `${c.code} — ${c.name}` }))

  // Total dari item (server otoritatif, tapi perlu untuk validasi & tampilan draft)
  const clientTotal = items.reduce((sum, row) => {
    const prod = products.find(p => p.id === row.product_id)
    return sum + (rowTotals(row, prod).total || 0)
  }, 0)
  const invoiceTotal = header.total || clientTotal
  const advance = Number(header.advance_deduction_amount) || 0
  const remaining = invoiceTotal - advance - (header.amount_paid || 0)

  if (loading) return <LoadingSpinner message="Memuat invoice..." />

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={24}>
      <Flex justify="space-between" align="center">
        <Space align="center">
          <button onClick={() => navigate('/sales/invoices')}>
            <ArrowLeft size={20} />
          </button>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {isNew ? 'Invoice Baru' : `Invoice ${header.invoice_number}`}
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
            <Button variant="primary" onClick={() => navigate(`/cash/payments/new?invoice=${id}`)}>
              Terima Pembayaran
            </Button>
          )}
          {!isNew && (
            <>
              <Button variant="secondary" onClick={() => triggerPrint(id)} loading={isPrinting} disabled={isPrinting}>
                <Printer size={18} /> Print
              </Button>
              <Button variant="secondary" onClick={() => triggerPDF(id)} loading={isPrinting} disabled={isPrinting}>
                <FileDown size={18} /> PDF
              </Button>
            </>
          )}
        </Space>
      </Flex>

      <DocumentHeader
        docNumber={header.invoice_number}
        date={header.date}
        onDateChange={handleDateChange}
        status={isNew ? null : header.status}
        partyLabel="Customer"
        partyId={header.customer_id}
        onPartyChange={v => setHeader(h => ({ ...h, customer_id: v }))}
        partyOptions={customerOptions}
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
              <div style={{ marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Potongan Uang Muka</div>
              <InputNumber
                style={{ width: '100%' }}
                min={0}
                value={header.advance_deduction_amount || 0}
                onChange={v => setHeader(h => ({ ...h, advance_deduction_amount: v || 0 }))}
                formatter={val => `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
                parser={val => val.replace(/\./g, '')}
                placeholder="0"
              />
            </Col>
            {Number(header.advance_deduction_amount) > 0 && (
              <Col xs={24} md={10}>
                <div style={{ marginBottom: 4, fontSize: 13, fontWeight: 500 }}>Akun COA Uang Muka *</div>
                <AntdSelect
                  showSearch
                  optionFilterProp="label"
                  style={{ width: '100%' }}
                  placeholder="Pilih akun uang muka..."
                  value={header.advance_deduction_coa_id || undefined}
                  onChange={v => setHeader(h => ({ ...h, advance_deduction_coa_id: v || '' }))}
                  options={coaOptions}
                />
              </Col>
            )}
          </Row>
        </Card>
      )}

      <Space direction="vertical" style={{ width: '100%' }} size={8}>
        <Typography.Title level={5} style={{ margin: 0 }}>Item Invoice</Typography.Title>
        <LineItemsTable
          items={items}
          onItemsChange={setItems}
          products={products}
          priceField="sell_price"
          readOnly={readOnly}
          showTax
        />
      </Space>

      {/* Recurring template toggle (only for new invoices) */}
      {isNew && !readOnly && canWrite && (
        <Card>
          <Flex align="center" gap={12}>
            <Switch
              checked={makeRecurring}
              onChange={setMakeRecurring}
              id="recurring-toggle"
            />
            <label htmlFor="recurring-toggle" style={{ cursor: 'pointer', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Repeat size={16} /> Jadikan Berulang
            </label>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Buat template untuk auto-create invoice di masa depan.
            </Typography.Text>
          </Flex>

          {makeRecurring && (
            <Row gutter={16} style={{ marginTop: 16 }}>
              <Col xs={24} md={8}>
                <div style={{ marginBottom: 4, fontSize: 14, fontWeight: 500 }}>Interval</div>
                <AntdSelect
                  value={recurInterval}
                  onChange={setRecurInterval}
                  options={[
                    { value: 'daily',   label: 'Harian' },
                    { value: 'weekly',  label: 'Mingguan' },
                    { value: 'monthly', label: 'Bulanan' },
                    { value: 'yearly',  label: 'Tahunan' },
                  ]}
                  style={{ width: '100%' }}
                />
              </Col>
              {recurInterval === 'monthly' && (
                <Col xs={24} md={8}>
                  <div style={{ marginBottom: 4, fontSize: 14, fontWeight: 500 }}>Tanggal ke-</div>
                  <AntdSelect
                    value={recurDay}
                    onChange={setRecurDay}
                    options={[
                      { value: -1, label: 'Hari terakhir bulan' },
                      ...Array.from({ length: 28 }, (_, i) => ({
                        value: i + 1, label: `${i + 1}`,
                      })),
                    ]}
                    style={{ width: '100%' }}
                  />
                </Col>
              )}
              <Col xs={24} md={8}>
                <DateInput
                  label="Mulai Tanggal *"
                  value={recurStart}
                  onChange={e => setRecurStart(e.target.value)}
                />
              </Col>
            </Row>
          )}
        </Card>
      )}

      {/* Payment summary for posted invoices */}
      {!isNew && header.status !== 'draft' && (
        <Card style={{ background: '#e6f4ff', border: '1px solid #91caff' }}>
          <Row gutter={16}>
            <Col span={6}>
              <Typography.Text style={{ color: '#0958d9', display: 'block' }}>Total Invoice</Typography.Text>
              <Typography.Text strong style={{ color: '#003eb3', fontSize: 16 }}>{formatCurrency(header.total)}</Typography.Text>
            </Col>
            <Col span={6}>
              <Typography.Text style={{ color: '#0958d9', display: 'block' }}>Potongan Uang Muka</Typography.Text>
              <Typography.Text strong style={{ color: '#003eb3', fontSize: 16 }}>{formatCurrency(header.advance_deduction_amount || 0)}</Typography.Text>
            </Col>
            <Col span={6}>
              <Typography.Text type="success" style={{ display: 'block' }}>Dibayar</Typography.Text>
              <Typography.Text strong style={{ color: '#135200', fontSize: 16 }}>{formatCurrency(header.amount_paid)}</Typography.Text>
            </Col>
            <Col span={6}>
              <Typography.Text type="danger" style={{ display: 'block' }}>Sisa Tagih</Typography.Text>
              <Typography.Text strong type="danger" style={{ fontSize: 16 }}>{formatCurrency(remaining)}</Typography.Text>
            </Col>
          </Row>
        </Card>
      )}
    </Space>
  )
}
