import { useState } from 'react'
import { useToast } from '../../components/ui/ToastContext'
import { useAccounts } from '../../hooks/useCashBank'
import { saveReconciliation } from '../../services/cashBankService'
import { formatCurrency } from '../../utils/currency'
import { today } from '../../utils/date'
import Button from '../../components/ui/Button'
import Select from '../../components/ui/Select'
import Input from '../../components/ui/Input'
import { CheckCircle, XCircle } from 'lucide-react'

export default function ReconciliationPage() {
  const toast = useToast()
  const { accounts } = useAccounts()

  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)
  const [form, setForm] = useState({
    account_id: '',
    date: today(),
    statement_balance: '',
  })

  const field = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const selectedAccount = accounts.find(a => a.id === form.account_id)
  const diff = selectedAccount && form.statement_balance !== ''
    ? Number(form.statement_balance) - selectedAccount.balance
    : null

  const handleSave = async () => {
    if (!form.account_id) { toast.error('Pilih akun'); return }
    if (!form.date) { toast.error('Tanggal wajib diisi'); return }
    if (form.statement_balance === '') { toast.error('Masukkan saldo rekening koran'); return }

    setSubmitting(true)
    try {
      const rec = await saveReconciliation(form)
      setResult(rec)
      toast.success('Rekonsiliasi berhasil disimpan')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const accountOptions = accounts.map(a => ({
    value: a.id,
    label: `${a.name} (${a.type === 'bank' ? 'Bank' : 'Kas'})`
  }))

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">Rekonsiliasi Bank</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Input form */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Rekonsiliasi Baru</h2>

          <Select
            label="Akun *"
            options={accountOptions}
            value={form.account_id}
            onChange={e => { field('account_id', e.target.value); setResult(null) }}
            placeholder="Pilih akun..."
          />

          <Input
            label="Tanggal Rekonsiliasi *"
            type="date"
            value={form.date}
            onChange={e => field('date', e.target.value)}
          />

          <Input
            label="Saldo Rekening Koran *"
            type="number"
            step="any"
            placeholder="0"
            value={form.statement_balance}
            onChange={e => { field('statement_balance', e.target.value); setResult(null) }}
          />

          {/* Live comparison */}
          {selectedAccount && form.statement_balance !== '' && (
            <div className="border border-gray-200 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Saldo Sistem</span>
                <span className="font-medium">{formatCurrency(selectedAccount.balance)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Saldo Rekening Koran</span>
                <span className="font-medium">{formatCurrency(Number(form.statement_balance))}</span>
              </div>
              <div className="border-t pt-2 flex justify-between font-semibold">
                <span>Selisih</span>
                <span className={diff === 0 ? 'text-green-600' : 'text-red-600'}>
                  {formatCurrency(Math.abs(diff))} {diff > 0 ? '(lebih)' : diff < 0 ? '(kurang)' : ''}
                </span>
              </div>
              {diff === 0 && (
                <div className="flex items-center gap-2 text-green-700 text-xs pt-1">
                  <CheckCircle size={14} /> Saldo sesuai — siap direkonsiliasi
                </div>
              )}
              {diff !== 0 && (
                <div className="flex items-center gap-2 text-orange-700 text-xs pt-1">
                  <XCircle size={14} /> Ada selisih — periksa transaksi yang belum dicatat
                </div>
              )}
            </div>
          )}

          <Button variant="primary" onClick={handleSave} loading={submitting}>
            Simpan Rekonsiliasi
          </Button>
        </div>

        {/* Result */}
        {result && (
          <div className={`border rounded-lg p-6 ${result.is_reconciled ? 'bg-green-50 border-green-200' : 'bg-orange-50 border-orange-200'}`}>
            <div className="flex items-center gap-3 mb-4">
              {result.is_reconciled
                ? <CheckCircle size={24} className="text-green-600" />
                : <XCircle size={24} className="text-orange-600" />
              }
              <h2 className="text-lg font-semibold">
                {result.is_reconciled ? 'Rekonsiliasi Sukses' : 'Ada Selisih'}
              </h2>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Saldo Sistem</span>
                <span className="font-medium">{formatCurrency(result.system_balance)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Saldo Rekening Koran</span>
                <span className="font-medium">{formatCurrency(result.statement_balance)}</span>
              </div>
              <div className="border-t pt-2 flex justify-between font-semibold">
                <span>Selisih</span>
                <span className={result.is_reconciled ? 'text-green-600' : 'text-red-600'}>
                  {formatCurrency(Math.abs(result.statement_balance - result.system_balance))}
                </span>
              </div>
            </div>
            {!result.is_reconciled && (
              <p className="mt-4 text-xs text-orange-700">
                Periksa transaksi yang belum dicatat atau transaksi yang masih dalam proses.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
