import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../ui/ToastContext'
import { formatCurrency, parseCurrency } from '../../utils/currency'
import { CheckCircle, AlertCircle } from 'lucide-react'
import Input from '../ui/Input'
import Select from '../ui/Select'

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
    <div className="space-y-4 border-t pt-4">
      <h3 className="font-semibold text-gray-900">Metode Pembayaran Akuisisi</h3>

      {/* Radio Group: Payment Method Selection */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Pilih Metode Pembayaran
        </label>
        <div className="space-y-2">
          {[
            { id: 'cash_bank', label: 'Tunai/Bank', desc: 'Pembayaran langsung dari rekening kas/bank' },
            { id: 'hutang', label: 'Hutang Dagang', desc: 'Pembayaran cicilan kepada supplier' },
            { id: 'uang_muka', label: 'Uang Muka', desc: 'Pemakaian dana uang muka' },
            { id: 'mixed', label: 'Campur', desc: 'Kombinasi dari berbagai metode' }
          ].map(option => (
            <label
              key={option.id}
              className="flex items-center cursor-pointer p-2 rounded hover:bg-gray-50"
            >
              <input
                type="radio"
                name="payment_method"
                value={option.id}
                checked={value.method === option.id}
                onChange={(e) => handleMethodChange(e.target.value)}
                disabled={loadingData}
                className="w-4 h-4 text-blue-600"
              />
              <div className="ml-3">
                <span className="block text-sm font-medium text-gray-700">
                  {option.label}
                </span>
                <span className="block text-xs text-gray-500">
                  {option.desc}
                </span>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* CASH_BANK Mode */}
      {value.method === 'cash_bank' && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
          <p className="text-sm font-medium text-blue-900">
            Pembayaran Tunai/Bank
          </p>

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
            className="bg-gray-100"
          />

          <div className="text-sm text-gray-600">
            <strong>Total:</strong> {formatCurrency(totalAmount)}
          </div>
        </div>
      )}

      {/* HUTANG Mode */}
      {value.method === 'hutang' && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
          <p className="text-sm font-medium text-amber-900">
            Hutang Dagang
          </p>

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
            className="bg-gray-100"
          />

          <div className="text-sm text-gray-600">
            <strong>Total:</strong> {formatCurrency(totalAmount)}
          </div>
        </div>
      )}

      {/* UANG_MUKA Mode */}
      {value.method === 'uang_muka' && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
          <p className="text-sm font-medium text-green-900">
            Pemakaian Uang Muka
          </p>

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
            className="bg-gray-100"
          />

          <div className="text-sm text-gray-600">
            <strong>Total:</strong> {formatCurrency(totalAmount)}
          </div>
        </div>
      )}

      {/* MIXED Mode */}
      {value.method === 'mixed' && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 space-y-4">
          <div>
            <p className="text-sm font-medium text-purple-900 mb-2">
              Pembayaran Campur
            </p>
            <p className="text-xs text-purple-700">
              Bagi total pembayaran ke berbagai metode di bawah
            </p>
          </div>

          {/* Cash/Bank Section */}
          <div className="bg-white rounded border border-purple-300 p-3 space-y-2">
            <h4 className="text-sm font-medium text-gray-700">Tunai/Bank</h4>

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
          </div>

          {/* Hutang Section */}
          <div className="bg-white rounded border border-purple-300 p-3 space-y-2">
            <h4 className="text-sm font-medium text-gray-700">Hutang Dagang</h4>

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
          </div>

          {/* Uang Muka Section */}
          <div className="bg-white rounded border border-purple-300 p-3 space-y-2">
            <h4 className="text-sm font-medium text-gray-700">Uang Muka</h4>

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
          </div>

          {/* Summary and Validation */}
          <div className="bg-white rounded border-2 p-3">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Target Total:</span>
                <span className="font-medium">{formatCurrency(totalAmount)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Jumlah Pembayaran:</span>
                <span className="font-medium">{formatCurrency(paymentSum)}</span>
              </div>

              {/* Validation Indicator */}
              <div className="pt-2 border-t">
                {isValid ? (
                  <div className="flex items-center gap-2 text-sm text-green-700">
                    <CheckCircle size={16} />
                    <span>Pembayaran sesuai total (selisih: Rp 0)</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-red-700">
                    <AlertCircle size={16} />
                    <span>Selisih: {formatCurrency(sumDiff)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
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
