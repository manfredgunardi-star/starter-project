import { useState, useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Space, Flex, Typography, Row, Col, Card } from 'antd'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../components/ui/ToastContext'
import { useProducts, useCustomers } from '../../hooks/useMasterData'
import { saveProformaInvoice, getProformaInvoice, cancelProformaInvoice } from '../../services/proformaService'
import { getSalesOrder } from '../../services/salesService'
import { today } from '../../utils/date'
import Button from '../../components/ui/Button'
import DateInput from '../../components/ui/DateInput'
import DocumentHeader from '../../components/shared/DocumentHeader'
import LineItemsTable from '../../components/shared/LineItemsTable'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { usePrintProformaInvoice } from '../../hooks/usePrintProformaInvoice'
import { ArrowLeft, Save, Printer, FileDown, XCircle } from 'lucide-react'

export default function ProformaInvoiceFormPage() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { canWrite } = useAuth()
  const toast = useToast()
  const { triggerPrint, triggerPDF, loadingIds } = usePrintProformaInvoice()
  const isPrinting = loadingIds[id] || false
  const isNew = !id || id === 'new'

  const { products } = useProducts()
  const { customers } = useCustomers()

  const [loading, setLoading] = useState(!isNew)
  const [submitting, setSubmitting] = useState(false)
  const [header, setHeader] = useState({
    proforma_number: '',
    date: today(),
    valid_until: '',
    customer_id: '',
    sales_order_id: '',
    notes: '',
  })
  const [items, setItems] = useState([LineItemsTable.emptyRow()])

  useEffect(() => {
    if (!isNew) {
      getProformaInvoice(id)
        .then(proforma => {
          setHeader({
            id: proforma.id,
            proforma_number: proforma.proforma_number,
            date: proforma.date,
            valid_until: proforma.valid_until || '',
            customer_id: proforma.customer_id,
            sales_order_id: proforma.sales_order_id || '',
            notes: proforma.notes || '',
          })
          setItems((proforma.items || []).map(i => ({
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
  }, [id, isNew, toast])

  useEffect(() => {
    const fromSoId = searchParams.get('so')
    if (!fromSoId || !isNew) return

    getSalesOrder(fromSoId)
      .then(so => {
        setHeader(h => ({ ...h, customer_id: so.customer_id, sales_order_id: so.id }))
        setItems((so.items || []).map(i => ({
          _key: i.id,
          product_id: i.product_id,
          unit_id: i.unit_id,
          quantity: i.quantity,
          quantity_base: i.quantity_base,
          unit_price: '',
          tax_amount: 0,
          total: 0,
        })))
      })
      .catch(err => toast.error('Gagal load SO: ' + err.message))
  }, [isNew, searchParams, toast])

  const handleSave = async () => {
    if (!header.customer_id) { toast.error('Pilih customer'); return }
    if (!header.date) { toast.error('Tanggal wajib diisi'); return }
    const validItems = items.filter(i => i.product_id && Number(i.quantity) > 0)
    if (validItems.length === 0) { toast.error('Minimal satu item'); return }

    const subtotal = validItems.reduce((s, i) => s + ((Number(i.total) || 0) - (Number(i.tax_amount) || 0)), 0)
    const taxTotal = validItems.reduce((s, i) => s + (Number(i.tax_amount) || 0), 0)
    const total = subtotal + taxTotal

    setSubmitting(true)
    try {
      const newId = await saveProformaInvoice(
        { id: isNew ? null : id, ...header, subtotal, tax_total: taxTotal, total },
        validItems,
      )
      toast.success('Proforma invoice berhasil disimpan')
      navigate(`/sales/proforma/${newId}`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = async () => {
    if (!window.confirm('Batalkan proforma invoice ini?')) return

    setSubmitting(true)
    try {
      await cancelProformaInvoice(id)
      toast.success('Proforma invoice dibatalkan')
      navigate('/sales/proforma')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const customerOptions = customers.map(c => ({ value: c.id, label: c.name }))

  if (loading) return <LoadingSpinner message="Memuat proforma invoice..." />

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={24}>
      <Flex justify="space-between" align="center">
        <Space align="center">
          <button onClick={() => navigate('/sales/proforma')}>
            <ArrowLeft size={20} />
          </button>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {isNew ? 'Proforma Invoice Baru' : `Proforma ${header.proforma_number}`}
          </Typography.Title>
        </Space>
        <Space>
          {canWrite && (
            <Button variant="secondary" onClick={handleSave} loading={submitting}>
              <Save size={18} /> Simpan
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
          {!isNew && canWrite && (
            <Button variant="danger" onClick={handleCancel} loading={submitting}>
              <XCircle size={18} /> Batalkan
            </Button>
          )}
        </Space>
      </Flex>

      <DocumentHeader
        docNumber={header.proforma_number}
        date={header.date}
        onDateChange={d => setHeader(h => ({ ...h, date: d }))}
        partyLabel="Customer"
        partyId={header.customer_id}
        onPartyChange={v => setHeader(h => ({ ...h, customer_id: v }))}
        partyOptions={customerOptions}
        notes={header.notes}
        onNotesChange={v => setHeader(h => ({ ...h, notes: v }))}
      />

      <Card size="small">
        <Row gutter={16}>
          <Col xs={24} md={10}>
            <DateInput
              label="Berlaku Hingga"
              value={header.valid_until}
              onChange={e => setHeader(h => ({ ...h, valid_until: e.target.value }))}
            />
          </Col>
        </Row>
      </Card>

      <Space direction="vertical" style={{ width: '100%' }} size={8}>
        <Typography.Title level={5} style={{ margin: 0 }}>Item Proforma Invoice</Typography.Title>
        <LineItemsTable
          items={items}
          onItemsChange={setItems}
          products={products}
          priceField="sell_price"
          readOnly={false}
          showTax
        />
      </Space>
    </Space>
  )
}
