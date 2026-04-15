import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Space, Flex, Typography } from 'antd'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../components/ui/ToastContext'
import { useProducts, useCustomers } from '../../hooks/useMasterData'
import { getSalesOrder, saveSalesOrder, confirmSalesOrder } from '../../services/salesService'
import { today } from '../../utils/date'
import Button from '../../components/ui/Button'
import DocumentHeader from '../../components/shared/DocumentHeader'
import LineItemsTable from '../../components/shared/LineItemsTable'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { ArrowLeft, Save, CheckCircle } from 'lucide-react'

export default function SalesOrderFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { canWrite, canPost } = useAuth()
  const toast = useToast()
  const isNew = !id || id === 'new'

  const { products } = useProducts()
  const { customers } = useCustomers()

  const [loading, setLoading] = useState(!isNew)
  const [submitting, setSubmitting] = useState(false)
  const [header, setHeader] = useState({
    so_number: '',
    date: today(),
    customer_id: '',
    status: 'draft',
    notes: '',
  })
  const [items, setItems] = useState([LineItemsTable.emptyRow()])

  useEffect(() => {
    if (!isNew) {
      getSalesOrder(id)
        .then(so => {
          setHeader({
            id: so.id,
            so_number: so.so_number,
            date: so.date,
            customer_id: so.customer_id,
            status: so.status,
            notes: so.notes || '',
          })
          setItems(so.items.map(i => ({
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
    if (!header.customer_id) { toast.error('Pilih customer terlebih dahulu'); return }
    if (!header.date) { toast.error('Tanggal wajib diisi'); return }
    const validItems = items.filter(i => i.product_id && Number(i.quantity) > 0)
    if (validItems.length === 0) { toast.error('Minimal satu item produk'); return }

    setSubmitting(true)
    try {
      const soId = await saveSalesOrder(
        { id: isNew ? null : id, ...header },
        validItems
      )
      toast.success(isNew ? 'Sales Order berhasil dibuat' : 'Sales Order berhasil disimpan')
      navigate(`/sales/orders/${soId}`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleConfirm = async () => {
    setSubmitting(true)
    try {
      await confirmSalesOrder(id)
      toast.success('Sales Order dikonfirmasi')
      setHeader(h => ({ ...h, status: 'confirmed' }))
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const customerOptions = customers.map(c => ({ value: c.id, label: c.name }))

  if (loading) return <LoadingSpinner message="Memuat sales order..." />

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={24}>
      {/* Breadcrumb + actions */}
      <Flex justify="space-between" align="center">
        <Space align="center">
          <button onClick={() => navigate('/sales/orders')}>
            <ArrowLeft size={20} />
          </button>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {isNew ? 'Sales Order Baru' : `SO ${header.so_number}`}
          </Typography.Title>
        </Space>

        <Space>
          {!readOnly && canWrite && (
            <Button variant="secondary" onClick={handleSave} loading={submitting}>
              <Save size={18} /> Simpan Draft
            </Button>
          )}
          {!isNew && header.status === 'draft' && canPost && (
            <Button variant="primary" onClick={handleConfirm} loading={submitting}>
              <CheckCircle size={18} /> Konfirmasi
            </Button>
          )}
          {!isNew && header.status === 'confirmed' && canWrite && (
            <Button variant="primary" onClick={() => navigate(`/sales/invoices/new?so=${id}`)}>
              Buat Invoice
            </Button>
          )}
        </Space>
      </Flex>

      {/* Header */}
      <DocumentHeader
        docNumber={header.so_number}
        date={header.date}
        onDateChange={d => setHeader(h => ({ ...h, date: d }))}
        status={isNew ? null : header.status}
        partyLabel="Customer"
        partyId={header.customer_id}
        onPartyChange={v => setHeader(h => ({ ...h, customer_id: v }))}
        partyOptions={customerOptions}
        notes={header.notes}
        onNotesChange={v => setHeader(h => ({ ...h, notes: v }))}
        readOnly={readOnly}
      />

      {/* Line items */}
      <Space direction="vertical" style={{ width: '100%' }} size={8}>
        <Typography.Title level={5} style={{ margin: 0 }}>Item Pesanan</Typography.Title>
        <LineItemsTable
          items={items}
          onItemsChange={setItems}
          products={products}
          priceField="sell_price"
          readOnly={readOnly}
          showTax
        />
      </Space>
    </Space>
  )
}
