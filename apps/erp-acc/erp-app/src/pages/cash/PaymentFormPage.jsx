import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../components/ui/ToastContext'
import { useAccounts } from '../../hooks/useCashBank'
import { useCustomers, useSuppliers } from '../../hooks/useMasterData'
import { savePayment, getOutstandingInvoicesByCustomer } from '../../services/cashBankService'
import { getOutstandingPurchaseInvoicesBySupplier, getPurchaseInvoice } from '../../services/purchaseService'
import { formatCurrency } from '../../utils/currency'
import { today } from '../../utils/date'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import DateInput from '../../components/ui/DateInput'
import Select from '../../components/ui/Select'
import { ArrowLeft, Save } from 'lucide-react'
import { Space, Card, Alert, Typography, Flex } from 'antd'

export default function PaymentFormPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { canWrite } = useAuth()
  const toast = useToast()

  const { customers } = useCustomers()
  const { suppliers } = useSuppliers()
  const { accounts } = useAccounts()

  const [submitting, setSubmitting] = useState(false)
  const [invoices, setInvoices] = useState([])
  const [loadingInvoices, setLoadingInvoices] = useState(false)

  const initialType = searchParams.get('type') === 'outgoing' ? 'outgoing' : 'incoming'

  const [form, setForm] = useState({
    type: initialType,
    date: today(),
    customer_id: '',
    supplier_id: '',
    invoice_id: searchParams.get('invoice') || '',
    account_id: '',
    amount: '',
    notes: '',
  })

  const field = (key, value) => setForm(f => ({ ...f, [key]: value }))

  // Pre-load supplier if purchase invoice is passed as param (outgoing payment)
  useEffect(() => {
    const invoiceId = searchParams.get('invoice')
    const paymentType = searchParams.get('type')
    if (invoiceId && paymentType === 'outgoing') {
      getPurchaseInvoice(invoiceId)
        .then(inv => {
          setForm(f => ({ ...f, supplier_id: inv.supplier_id }))
        })
        .catch(err => toast.error(err.message))
    }
  }, [])

  // Load outstanding invoices when customer/supplier changes
  useEffect(() => {
    if (form.type === 'incoming') {
      if (!form.customer_id) { setInvoices([]); return }
      setLoadingInvoices(true)
      getOutstandingInvoicesByCustomer(form.customer_id)
        .then(setInvoices)
        .catch(err => toast.error(err.message))
        .finally(() => setLoadingInvoices(false))
    } else {
      if (!form.supplier_id) { setInvoices([]); return }
      setLoadingInvoices(true)
      getOutstandingPurchaseInvoicesBySupplier(form.supplier_id)
        .then(setInvoices)
        .catch(err => toast.error(err.message))
        .finally(() => setLoadingInvoices(false))
    }
  }, [form.customer_id, form.supplier_id, form.type])

  // Auto-fill amount from selected invoice remaining balance
  useEffect(() => {
    if (!form.invoice_id) return
    const inv = invoices.find(i => i.id === form.invoice_id)
    if (inv) {
      const remaining = inv.total - inv.amount_paid
      field('amount', remaining > 0 ? remaining : '')
    }
  }, [form.invoice_id, invoices])

  const selectedInvoice = invoices.find(i => i.id === form.invoice_id)
  const remaining = selectedInvoice ? selectedInvoice.total - selectedInvoice.amount_paid : null

  const validate = () => {
    if (!form.date) { toast.error('Tanggal wajib diisi'); return false }
    if (!form.account_id) { toast.error('Pilih akun kas/bank'); return false }
    if (!form.amount || Number(form.amount) <= 0) { toast.error('Jumlah harus lebih dari 0'); return false }
    if (form.type === 'incoming' && !form.customer_id) { toast.error('Pilih customer'); return false }
    if (form.type === 'outgoing' && !form.supplier_id) { toast.error('Pilih supplier'); return false }
    if (remaining !== null && Number(form.amount) > remaining + 0.01) {
      const label = form.type === 'incoming' ? 'sisa piutang' : 'sisa hutang'
      toast.error(`Jumlah melebihi ${label} ${formatCurrency(remaining)}`)
      return false
    }
    return true
  }

  const handleSave = async () => {
    if (!validate()) return
    setSubmitting(true)
    try {
      await savePayment({
        ...form,
        amount: Number(form.amount),
        customer_id: form.type === 'incoming' ? form.customer_id : null,
        supplier_id: form.type === 'outgoing' ? form.supplier_id : null,
      })
      toast.success('Pembayaran berhasil dicatat dan diposting')
      navigate('/cash/payments')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const customerOptions = customers.map(c => ({ value: c.id, label: c.name }))
  const supplierOptions = suppliers.map(s => ({ value: s.id, label: s.name }))
  const accountOptions = accounts.map(a => ({ value: a.id, label: `${a.name} (${formatCurrency(a.balance)})` }))
  const invoiceOptions = invoices.map(i => ({
    value: i.id,
    label: `${i.invoice_number} — Sisa: ${formatCurrency(i.total - i.amount_paid)}`
  }))

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Space align="center">
        <button onClick={() => navigate('/cash/payments')} style={{ color: '#6b7280' }}>
          <ArrowLeft size={20} />
        </button>
        <Typography.Title level={3} style={{ margin: 0 }}>Tambah Pembayaran</Typography.Title>
      </Space>

      <Card style={{ maxWidth: 560 }}>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          {/* Type */}
          <Space>
            {['incoming', 'outgoing'].map(t => (
              <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="radio"
                  value={t}
                  checked={form.type === t}
                  onChange={() => {
                    field('type', t)
                    setForm(f => ({ ...f, type: t, customer_id: '', supplier_id: '', invoice_id: '' }))
                    setInvoices([])
                  }}
                  style={{ accentColor: '#2563eb' }}
                />
                <Typography.Text>
                  {t === 'incoming' ? 'Masuk (dari Customer)' : 'Keluar (ke Supplier)'}
                </Typography.Text>
              </label>
            ))}
          </Space>

          <DateInput
            label="Tanggal *"
            value={form.date}
            onChange={e => field('date', e.target.value)}
          />

          {/* Customer (for incoming) */}
          {form.type === 'incoming' && (
            <Select
              label="Customer *"
              options={customerOptions}
              value={form.customer_id}
              onChange={e => { field('customer_id', e.target.value); field('invoice_id', '') }}
              placeholder="Pilih customer..."
            />
          )}

          {/* Supplier (for outgoing) */}
          {form.type === 'outgoing' && (
            <Select
              label="Supplier *"
              options={supplierOptions}
              value={form.supplier_id}
              onChange={e => { field('supplier_id', e.target.value); field('invoice_id', '') }}
              placeholder="Pilih supplier..."
            />
          )}

          {/* Invoice reference */}
          {((form.type === 'incoming' && form.customer_id) || (form.type === 'outgoing' && form.supplier_id)) && (
            <Space direction="vertical" style={{ width: '100%' }} size={4}>
              <Select
                label="Invoice (opsional)"
                options={invoiceOptions}
                value={form.invoice_id}
                onChange={e => field('invoice_id', e.target.value)}
                placeholder={loadingInvoices ? 'Memuat...' : '— Tanpa invoice —'}
              />
              {selectedInvoice && (
                <Typography.Text type="secondary" style={{ fontSize: 12, color: '#1677ff' }}>
                  {form.type === 'incoming' ? 'Sisa piutang' : 'Sisa hutang'}: {formatCurrency(remaining)}
                </Typography.Text>
              )}
            </Space>
          )}

          {/* Account */}
          <Select
            label="Akun Kas/Bank *"
            options={accountOptions}
            value={form.account_id}
            onChange={e => field('account_id', e.target.value)}
            placeholder="Pilih akun..."
          />

          {/* Amount */}
          <Input
            label="Jumlah *"
            type="number"
            min="0"
            step="any"
            placeholder="0"
            value={form.amount}
            onChange={e => field('amount', e.target.value)}
          />

          {/* Notes */}
          <Space direction="vertical" style={{ width: '100%' }} size={4}>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#374151' }}>Catatan</label>
            <textarea
              value={form.notes}
              onChange={e => field('notes', e.target.value)}
              rows={2}
              placeholder="Catatan opsional..."
              style={{ width: '100%', paddingLeft: 12, paddingRight: 12, paddingTop: 8, paddingBottom: 8, border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, resize: 'none' }}
            />
          </Space>

          <Alert
            type="warning"
            showIcon
            message="Pembayaran akan langsung diposting — jurnal otomatis dibuat dan saldo akun diperbarui."
          />

          <Flex justify="flex-end" gap={12} style={{ paddingTop: 8 }}>
            <Button variant="secondary" onClick={() => navigate('/cash/payments')}>
              Batal
            </Button>
            {canWrite && (
              <Button variant="primary" onClick={handleSave} loading={submitting}>
                <Save size={18} /> Simpan & Post
              </Button>
            )}
          </Flex>
        </Space>
      </Card>
    </Space>
  )
}
