import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../ui/ToastContext'
import { formatCurrency, parseCurrency } from '../../utils/currency'
import { CheckCircle, AlertCircle } from 'lucide-react'
import Input from '../ui/Input'
import Select from '../ui/Select'
import { Space, Card, Typography, Alert, Divider } from 'antd'

/**
 * AssetPaymentFields — Controlled sub-form for asset acquisition payment method selection
 * and splitting payment across multiple accounts (cash/bank, hutang, uang muka)
 *
 * Props:
 *   value: {
 *     method: 'cash_bank' | 'hutang' | 'uang_muka' | 'mixed',
 *     cash_bank_account_id: uuid | null,
 *     cash_bank_amount: number,
 *     supplier_id: uuid | null,
 *     hutang_account_id: uuid | null,
 *     hutang_amount: number,
 *     uang_muka_account_id: uuid | null,
 *     uang_muka_amount: number
 *   }
 *   onChange: (updatedPayment) => void
 *   totalAmount: number (target acquisition cost)
 */
export default function AssetPaymentFields({
  value,
  onChange,
  totalAmount = 0
}) {
  const toast = useToast()

  // Data loading state
  const [coaList, setCoaList] = useState([])
  const [supplierList, setSupplierList] = useState([])
  const [loadingData, setLoadingData] = useState(false)

  // Load COA and suppliers on mount
  useEffect(() => {
    loadLists()
  }, [])

  const loadLists = async () => {
    try {
      setLoadingData(true)

      // Load COA accounts
      const { data: coaData, error: coaError } = await supabase
        .from('coa')
        .select('id, code, name')
        .eq('is_active', true)
        .order('code')
      if (coaError) throw coaError

      // Load Suppliers
      const { data: supplierData, error: supplierError } = await supabase
        .from('suppliers')
        .select('id, name')
        .eq('is_active', true)
        .order('name')
      if (supplierError) throw supplierError

      setCoaList(coaData || [])
      setSupplierList(supplierData || [])
    } catch (err) {
      toast.error(`Gagal memuat data: ${err.message}`)
    } finally {
      setLoadingData(false)
    }
  }

  // Filter COA by code pattern
  const getFilteredAccounts = (pattern) => {
    return coaList
      .filter(acc => acc.code.match(pattern))
      .map(acc => ({
        value: acc.id,
        label: `${acc.code} — ${acc.name}`
      }))
  }

  const cashBankAccounts = getFilteredAccounts(/^1-(11|12)/)
  const hutangAccounts = getFilteredAccounts(/^2-11/)
  const uangMukaAccounts = getFilteredAccounts(/^1-16/)
  const supplierOptions = supplierList.map(s => ({
    value: s.id,
    label: s.name
  }))

  const handleMethodChange = (newMethod) => {
    onChange({
      ...value,
      method: newMethod
    })
  }

  const handleFieldChange = (field, val) => {
    onChange({
      ...value,
      [field]: val
    })
  }

  const handleAmountChange = (field, val) => {
    const numVal = parseCurrency(val)
    onChange({
      ...value,
      [field]: numVal
    })
  }

  // Validate payment sum in mixed mode
  const isPaymentValid = (payment, total) => {
    const sum = (payment.cash_bank_amount || 0) +
                (payment.hutang_amount || 0) +
                (payment.uang_muka_amount || 0)
    return Math.abs(sum - total) < 0.01
  }

  const paymentSum = (value.cash_bank_amount || 0) +
                     (value.hutang_amount || 0) +
                     (value.uang_muka_amount || 0)

  const isValid = isPaymentValid(value, totalAmount)
  const sumDiff = Math.abs(paymentSum - totalAmount)

  return (
    <Space direction="vertical" style={{ width: '100%', borderTop: '1px solid #f0f0f0', paddingTop: 16 }}>
      <Typography.Title level={5} style={{ margin: 0 }}>Metode Pembayaran Akuisisi</Typography.Title>

      {/* Radio Group: Payment Method Selection */}
      <div>
        <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500 }}>
          Pilih Metode Pembayaran
        </label>
        <div>
          {[
            { id: 'cash_bank', label: 'Tunai/Bank', desc: 'Pembayaran langsung dari rekening kas/bank' },
            { id: 'hutang', label: 'Hutang Dagang', desc: 'Pembayaran cicilan kepada supplier' },
            { id: 'uang_muka', label: 'Uang Muka', desc: 'Pemakaian dana uang muka' },
            { id: 'mixed', label: 'Campur', desc: 'Kombinasi dari berbagai metode' }
          ].map(option => (
            <label
              key={option.id}
              style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '8px', borderRadius: '4px' }}
            >
              <input
                type="radio"
                name="payment_method"
                value={option.id}
                checked={value.method === option.id}
                onChange={(e) => handleMethodChange(e.target.value)}
                disabled={loadingData}
              />
              <div style={{ marginLeft: '12px' }}>
                <span style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500 }}>
                  {option.label}
                </span>
                <span style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280' }}>
                  {option.desc}
                </span>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* CASH_BANK Mode */}
      {value.method === 'cash_bank' && (
        <Card size="small" style={{ background: '#eff6ff', borderColor: '#bfdbfe' }}>
          <Typography.Text strong style={{ color: '#1e3a5f' }}>Pembayaran Tunai/Bank</Typography.Text>

          <Select
            label="Akun Kas/Bank"
            placeholder="Pilih akun kas/bank (1-11___ atau 1-12___)"
            options={cashBankAccounts}
            value={value.cash_bank_account_id || ''}
            onChange={(e) => handleFieldChange('cash_bank_account_id', e.target.value)}
            disabled={loadingData}
          />

          <Input
            label="Jumlah Pembayaran"
            type="text"
            placeholder="Rp 0"
            value={formatCurrency(value.cash_bank_amount || 0)}
            disabled={true}
          />

          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            <strong>Total:</strong> {formatCurrency(totalAmount)}
          </Typography.Text>
        </Card>
      )}

      {/* HUTANG Mode */}
      {value.method === 'hutang' && (
        <Card size="small" style={{ background: '#fffbeb', borderColor: '#fde68a' }}>
          <Typography.Text strong style={{ color: '#78350f' }}>Hutang Dagang</Typography.Text>

          <Select
            label="Supplier"
            placeholder="Pilih supplier"
            options={supplierOptions}
            value={value.supplier_id || ''}
            onChange={(e) => handleFieldChange('supplier_id', e.target.value)}
            disabled={loadingData}
          />

          <Select
            label="Akun Hutang"
            placeholder="Pilih akun hutang dagang (2-11___)"
            options={hutangAccounts}
            value={value.hutang_account_id || ''}
            onChange={(e) => handleFieldChange('hutang_account_id', e.target.value)}
            disabled={loadingData}
          />

          <Input
            label="Jumlah Hutang"
            type="text"
            placeholder="Rp 0"
            value={formatCurrency(value.hutang_amount || 0)}
            disabled={true}
          />

          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            <strong>Total:</strong> {formatCurrency(totalAmount)}
          </Typography.Text>
        </Card>
      )}

      {/* UANG_MUKA Mode */}
      {value.method === 'uang_muka' && (
        <Card size="small" style={{ background: '#f0fdf4', borderColor: '#bbf7d0' }}>
          <Typography.Text strong style={{ color: '#14532d' }}>Pemakaian Uang Muka</Typography.Text>

          <Select
            label="Akun Uang Muka"
            placeholder="Pilih akun uang muka (1-16___)"
            options={uangMukaAccounts}
            value={value.uang_muka_account_id || ''}
            onChange={(e) => handleFieldChange('uang_muka_account_id', e.target.value)}
            disabled={loadingData}
          />

          <Select
            label="Supplier (Opsional)"
            placeholder="Pilih supplier"
            options={supplierOptions}
            value={value.supplier_id || ''}
            onChange={(e) => handleFieldChange('supplier_id', e.target.value)}
            disabled={loadingData}
          />

          <Input
            label="Jumlah Pemakaian Uang Muka"
            type="text"
            placeholder="Rp 0"
            value={formatCurrency(value.uang_muka_amount || 0)}
            disabled={true}
          />

          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            <strong>Total:</strong> {formatCurrency(totalAmount)}
          </Typography.Text>
        </Card>
      )}

      {/* MIXED Mode */}
      {value.method === 'mixed' && (
        <Card size="small" style={{ background: '#faf5ff', borderColor: '#e9d5ff' }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <div>
              <Typography.Text strong style={{ color: '#581c87' }}>Pembayaran Campur</Typography.Text>
              <br />
              <Typography.Text style={{ color: '#7c3aed', fontSize: 12 }}>
                Bagi total pembayaran ke berbagai metode di bawah
              </Typography.Text>
            </div>

          {/* Cash/Bank Section */}
          <Card size="small">
            <Typography.Text strong style={{ fontSize: 13 }}>Tunai/Bank</Typography.Text>

            <Select
              label="Akun Kas/Bank"
              placeholder="Pilih akun (1-11___ atau 1-12___)"
              options={cashBankAccounts}
              value={value.cash_bank_account_id || ''}
              onChange={(e) => handleFieldChange('cash_bank_account_id', e.target.value)}
              disabled={loadingData}
            />

            <Input
              label="Jumlah"
              type="text"
              placeholder="Rp 0"
              value={formatCurrency(value.cash_bank_amount || 0)}
              onChange={(e) => handleAmountChange('cash_bank_amount', e.target.value)}
              disabled={loadingData}
            />
          </Card>

          {/* Hutang Section */}
          <Card size="small">
            <Typography.Text strong style={{ fontSize: 13 }}>Hutang Dagang</Typography.Text>

            <Select
              label="Supplier"
              placeholder="Pilih supplier"
              options={supplierOptions}
              value={value.supplier_id || ''}
              onChange={(e) => handleFieldChange('supplier_id', e.target.value)}
              disabled={loadingData}
            />

            <Select
              label="Akun Hutang"
              placeholder="Pilih akun (2-11___)"
              options={hutangAccounts}
              value={value.hutang_account_id || ''}
              onChange={(e) => handleFieldChange('hutang_account_id', e.target.value)}
              disabled={loadingData}
            />

            <Input
              label="Jumlah"
              type="text"
              placeholder="Rp 0"
              value={formatCurrency(value.hutang_amount || 0)}
              onChange={(e) => handleAmountChange('hutang_amount', e.target.value)}
              disabled={loadingData}
            />
          </Card>

          {/* Uang Muka Section */}
          <Card size="small">
            <Typography.Text strong style={{ fontSize: 13 }}>Uang Muka</Typography.Text>

            <Select
              label="Akun Uang Muka"
              placeholder="Pilih akun (1-16___)"
              options={uangMukaAccounts}
              value={value.uang_muka_account_id || ''}
              onChange={(e) => handleFieldChange('uang_muka_account_id', e.target.value)}
              disabled={loadingData}
            />

            <Input
              label="Jumlah"
              type="text"
              placeholder="Rp 0"
              value={formatCurrency(value.uang_muka_amount || 0)}
              onChange={(e) => handleAmountChange('uang_muka_amount', e.target.value)}
              disabled={loadingData}
            />
          </Card>

          {/* Summary and Validation */}
          <Card size="small">
            <Space direction="vertical" style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                <span style={{ color: '#4b5563' }}>Target Total:</span>
                <span style={{ fontWeight: 500 }}>{formatCurrency(totalAmount)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                <span style={{ color: '#4b5563' }}>Jumlah Pembayaran:</span>
                <span style={{ fontWeight: 500 }}>{formatCurrency(paymentSum)}</span>
              </div>

              {/* Validation Indicator */}
              <Divider style={{ margin: '8px 0' }} />
              {isValid ? (
                <Alert
                  type="success"
                  showIcon
                  message="Pembayaran sesuai total (selisih: Rp 0)"
                  style={{ padding: '4px 8px' }}
                />
              ) : (
                <Alert
                  type="error"
                  showIcon
                  message={`Selisih: ${formatCurrency(sumDiff)}`}
                  style={{ padding: '4px 8px' }}
                />
              )}
            </Space>
          </Card>
          </Space>
        </Card>
      )}
    </Space>
  )
}

/**
 * Validation helper: Check if payment amounts sum to target total
 * @param {Object} payment - Payment object with cash_bank_amount, hutang_amount, uang_muka_amount
 * @param {number} totalAmount - Target total amount
 * @returns {boolean}
 */
export function isPaymentValid(payment, totalAmount) {
  const sum = (payment.cash_bank_amount || 0) +
              (payment.hutang_amount || 0) +
              (payment.uang_muka_amount || 0)
  return Math.abs(sum - totalAmount) < 0.01
}
