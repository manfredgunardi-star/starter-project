import { useState, useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Space, Flex, Typography, Row, Col, Card } from 'antd'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../components/ui/ToastContext'
import { useProducts, useSuppliers } from '../../hooks/useMasterData'
import { getPurchaseInvoice, savePurchaseInvoice, postPurchaseInvoice } from '../../services/purchaseService'
import { today } from '../../utils/date'
import { formatCurrency } from '../../utils/currency'
import Button from '../../components/ui/Button'
import DocumentHeader from '../../components/shared/DocumentHeader'
import LineItemsTable from '../../components/shared/LineItemsTable'
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
  const [header, setHeader] = useState({
    invoice_number: '',
    date: today(),
    due_date: '',
    supplier_id: '',
    purchase_order_id: searchParams.get('po') || '',
    status: 'draft',
    notes: '',
  })
  const [items, setItems] = useState([LineItemsTable.emptyRow()])

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
            status: inv.status,
            notes: inv.notes || '',
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

  const readOnly = !isNew && header.status !== 'draft'

  const handleSave = async () => {
    if (!header.supplier_id) { toast.error('Pilih supplier'); return }
    if (!header.date) { toast.error('Tanggal wajib diisi'); return }
    const validItems = items.filter(i => i.product_id && Number(i.quantity) > 0)
    if (validItems.length === 0) { toast.error('Minimal satu item'); return }

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
  const remaining = (header.total || 0) - (header.amount_paid || 0)

  if (loading) return <LoadingSpinner message="Memuat invoice pembelian..." />

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={24}>
      <Flex justify="space-between" align="center">
        <Space align="center">
          <button onClick={() => navigate('/purchase/invoices')} className="text-gray-500 hover:text-gray-700">
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
        </Space>
      </Flex>

      <DocumentHeader
        docNumber={header.invoice_number}
        date={header.date}
        onDateChange={d => setHeader(h => ({ ...h, date: d }))}
        status={isNew ? null : header.status}
        partyLabel="Supplier"
        partyId={header.supplier_id}
        onPartyChange={v => setHeader(h => ({ ...h, supplier_id: v }))}
        partyOptions={supplierOptions}
        dueDate={header.due_date}
        onDueDateChange={d => setHeader(h => ({ ...h, due_date: d }))}
        notes={header.notes}
        onNotesChange={v => setHeader(h => ({ ...h, notes: v }))}
        readOnly={readOnly}
      />

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
        </Card>
      )}
    </Space>
  )
}
