import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../components/ui/ToastContext'
import { useAccounts } from '../../hooks/useCashBank'
import { saveTransfer } from '../../services/cashBankService'
import { formatCurrency } from '../../utils/currency'
import { today } from '../../utils/date'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import DateInput from '../../components/ui/DateInput'
import Select from '../../components/ui/Select'
import { ArrowLeft, ArrowRight, Save } from 'lucide-react'
import { Space, Card, Alert, Typography, Flex } from 'antd'

export default function TransferFormPage() {
  const navigate = useNavigate()
  const { canWrite } = useAuth()
  const toast = useToast()
  const { accounts } = useAccounts()

  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    from_account_id: '',
    to_account_id: '',
    amount: '',
    date: today(),
    notes: '',
  })

  const field = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const fromAccount = accounts.find(a => a.id === form.from_account_id)
  const toAccount = accounts.find(a => a.id === form.to_account_id)

  const validate = () => {
    if (!form.date) { toast.error('Tanggal wajib diisi'); return false }
    if (!form.from_account_id) { toast.error('Pilih akun asal'); return false }
    if (!form.to_account_id) { toast.error('Pilih akun tujuan'); return false }
    if (form.from_account_id === form.to_account_id) { toast.error('Akun asal dan tujuan tidak boleh sama'); return false }
    if (!form.amount || Number(form.amount) <= 0) { toast.error('Jumlah harus lebih dari 0'); return false }
    if (fromAccount && Number(form.amount) > fromAccount.balance) {
      toast.error(`Saldo akun asal tidak cukup (${formatCurrency(fromAccount.balance)})`); return false
    }
    return true
  }

  const handleSave = async () => {
    if (!validate()) return
    setSubmitting(true)
    try {
      await saveTransfer(form)
      toast.success('Transfer berhasil dicatat dan jurnal dibuat')
      navigate('/cash/payments')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const accountOptions = accounts.map(a => ({
    value: a.id,
    label: `${a.name} (${formatCurrency(a.balance)})`
  }))

  const toOptions = accountOptions.filter(a => a.value !== form.from_account_id)

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Space align="center">
        <button onClick={() => navigate('/cash/payments')} className="text-gray-500 hover:text-gray-700">
          <ArrowLeft size={20} />
        </button>
        <Typography.Title level={3} style={{ margin: 0 }}>Transfer Kas/Bank</Typography.Title>
      </Space>

      <Card style={{ maxWidth: 560 }}>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <DateInput
            label="Tanggal *"
            value={form.date}
            onChange={e => field('date', e.target.value)}
          />

          <Select
            label="Akun Asal *"
            options={accountOptions}
            value={form.from_account_id}
            onChange={e => { field('from_account_id', e.target.value); field('to_account_id', '') }}
            placeholder="Pilih akun asal..."
          />

          {form.from_account_id && form.to_account_id && (
            <Flex justify="center" align="center" gap={12} style={{ paddingBlock: 4 }}>
              <Typography.Text strong>{fromAccount?.name}</Typography.Text>
              <ArrowRight size={18} style={{ color: '#1677ff' }} />
              <Typography.Text strong>{toAccount?.name}</Typography.Text>
            </Flex>
          )}

          <Select
            label="Akun Tujuan *"
            options={toOptions}
            value={form.to_account_id}
            onChange={e => field('to_account_id', e.target.value)}
            placeholder="Pilih akun tujuan..."
          />

          <Input
            label="Jumlah *"
            type="number"
            min="0"
            step="any"
            placeholder="0"
            value={form.amount}
            onChange={e => field('amount', e.target.value)}
          />

          {fromAccount && form.amount && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Saldo tersisa setelah transfer: {formatCurrency(fromAccount.balance - Number(form.amount))}
            </Typography.Text>
          )}

          <Space direction="vertical" style={{ width: '100%' }} size={4}>
            <label className="block text-sm font-medium text-gray-700">Catatan</label>
            <textarea
              value={form.notes}
              onChange={e => field('notes', e.target.value)}
              rows={2}
              placeholder="Catatan opsional..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            />
          </Space>

          <Alert
            type="info"
            showIcon
            message="Transfer langsung diposting — jurnal otomatis dibuat dan saldo kedua akun diperbarui."
          />

          <Flex justify="flex-end" gap={12} style={{ paddingTop: 8 }}>
            <Button variant="secondary" onClick={() => navigate('/cash/payments')}>Batal</Button>
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
