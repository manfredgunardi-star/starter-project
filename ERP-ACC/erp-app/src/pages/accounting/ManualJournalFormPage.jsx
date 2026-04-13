import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../components/ui/ToastContext'
import { useCOA } from '../../hooks/useMasterData'
import { saveManualJournal, postManualJournal, getJournal } from '../../services/journalService'
import { formatCurrency } from '../../utils/currency'
import { today } from '../../utils/date'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { ArrowLeft, Save, Send, Plus, Trash2 } from 'lucide-react'

const emptyRow = () => ({ _key: Date.now() + Math.random(), coa_id: '', description: '', debit: '', credit: '' })

export default function ManualJournalFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { canPost } = useAuth()
  const toast = useToast()
  const isNew = !id || id === 'new'
  const { coa } = useCOA()

  const [loading, setLoading] = useState(!isNew)
  const [submitting, setSubmitting] = useState(false)
  const [header, setHeader] = useState({ date: today(), description: '', status: 'draft' })
  const [items, setItems] = useState([emptyRow(), emptyRow()])

  useEffect(() => {
    if (!isNew) {
      getJournal(id)
        .then(j => {
          setHeader({
            id: j.id,
            journal_number: j.journal_number,
            date: j.date,
            description: j.description,
            status: j.is_posted ? 'posted' : 'draft',
          })
          setItems(j.journal_items.map(i => ({
            _key: i.id,
            coa_id: i.coa_id,
            coa_code: i.coa?.code,
            coa_name: i.coa?.name,
            description: i.description || '',
            debit: i.debit > 0 ? i.debit : '',
            credit: i.credit > 0 ? i.credit : '',
          })))
        })
        .catch(err => toast.error(err.message))
        .finally(() => setLoading(false))
    }
  }, [id, isNew])

  const readOnly = !isNew && header.status === 'posted'

  const totalDebit = items.reduce((s, i) => s + (Number(i.debit) || 0), 0)
  const totalCredit = items.reduce((s, i) => s + (Number(i.credit) || 0), 0)
  const isBalanced = totalDebit > 0 && Math.abs(totalDebit - totalCredit) < 0.01

  const updateItem = (idx, key, value) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item
      const updated = { ...item, [key]: value }
      // Clear the other side when one is entered
      if (key === 'debit' && value) updated.credit = ''
      if (key === 'credit' && value) updated.debit = ''
      return updated
    }))
  }

  const handleSave = async () => {
    if (!header.date) { toast.error('Tanggal wajib diisi'); return }
    if (!header.description) { toast.error('Deskripsi wajib diisi'); return }
    const validItems = items.filter(i => i.coa_id && (Number(i.debit) > 0 || Number(i.credit) > 0))
    if (validItems.length < 2) { toast.error('Minimal 2 baris jurnal'); return }

    setSubmitting(true)
    try {
      const journalId = await saveManualJournal(header, validItems)
      toast.success('Jurnal berhasil disimpan')
      navigate(`/accounting/journals/${journalId}`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handlePost = async () => {
    if (!isBalanced) { toast.error('Jurnal belum seimbang — total debit harus sama dengan total kredit'); return }
    setSubmitting(true)
    try {
      await postManualJournal(id)
      toast.success('Jurnal berhasil diposting')
      setHeader(h => ({ ...h, status: 'posted' }))
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // Flatten COA for dropdown
  const coaOptions = coa.filter(c => !c.children?.length).map(c => ({ value: c.id, label: `${c.code} — ${c.name}` }))
  // Actually show all COA with code
  const allCoaOptions = coa.map(c => ({ value: c.id, label: `${c.code} — ${c.name}` }))

  if (loading) return <LoadingSpinner message="Memuat jurnal..." />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/accounting/journals')} className="text-gray-500 hover:text-gray-700">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-bold text-gray-900">
            {isNew ? 'Jurnal Manual Baru' : `Jurnal ${header.journal_number}`}
          </h1>
        </div>
        <div className="flex gap-3">
          {!readOnly && canPost && (
            <Button variant="secondary" onClick={handleSave} loading={submitting}>
              <Save size={18} /> Simpan Draft
            </Button>
          )}
          {!isNew && !readOnly && canPost && (
            <Button variant="primary" onClick={handlePost} loading={submitting} disabled={!isBalanced}>
              <Send size={18} /> Post Jurnal
            </Button>
          )}
        </div>
      </div>

      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Tanggal *"
            type="date"
            value={header.date}
            onChange={e => setHeader(h => ({ ...h, date: e.target.value }))}
            readOnly={readOnly}
          />
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Deskripsi *</label>
            <input
              type="text"
              value={header.description}
              onChange={e => setHeader(h => ({ ...h, description: e.target.value }))}
              readOnly={readOnly}
              placeholder="Keterangan jurnal..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Items table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full border-collapse">
          <thead className="bg-gray-100 border-b border-gray-200">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-700">Akun (COA)</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-700">Keterangan</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-gray-700">Debit</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-gray-700">Kredit</th>
              {!readOnly && <th className="w-10"></th>}
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={item._key} className="border-b border-gray-200">
                <td className="px-4 py-2 min-w-[240px]">
                  {readOnly ? (
                    <span className="text-sm">{item.coa_code} — {item.coa_name}</span>
                  ) : (
                    <select
                      className="w-full text-sm border border-gray-300 rounded px-2 py-1"
                      value={item.coa_id}
                      onChange={e => updateItem(idx, 'coa_id', e.target.value)}
                    >
                      <option value="">Pilih akun...</option>
                      {allCoaOptions.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="px-4 py-2">
                  {readOnly ? (
                    <span className="text-sm text-gray-600">{item.description}</span>
                  ) : (
                    <input
                      type="text"
                      className="w-full text-sm border border-gray-300 rounded px-2 py-1"
                      value={item.description}
                      onChange={e => updateItem(idx, 'description', e.target.value)}
                      placeholder="Keterangan..."
                    />
                  )}
                </td>
                <td className="px-4 py-2 w-36">
                  {readOnly ? (
                    <span className="text-sm text-right block">{item.debit > 0 ? Number(item.debit).toLocaleString('id-ID') : ''}</span>
                  ) : (
                    <input
                      type="number"
                      min="0"
                      step="any"
                      className="w-full text-sm border border-gray-300 rounded px-2 py-1 text-right"
                      value={item.debit}
                      onChange={e => updateItem(idx, 'debit', e.target.value)}
                      placeholder="0"
                    />
                  )}
                </td>
                <td className="px-4 py-2 w-36">
                  {readOnly ? (
                    <span className="text-sm text-right block">{item.credit > 0 ? Number(item.credit).toLocaleString('id-ID') : ''}</span>
                  ) : (
                    <input
                      type="number"
                      min="0"
                      step="any"
                      className="w-full text-sm border border-gray-300 rounded px-2 py-1 text-right"
                      value={item.credit}
                      onChange={e => updateItem(idx, 'credit', e.target.value)}
                      placeholder="0"
                    />
                  )}
                </td>
                {!readOnly && (
                  <td className="px-2 py-2">
                    <button
                      onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 border-t-2 border-gray-300">
            <tr>
              <td colSpan={2} className="px-4 py-2 text-sm font-semibold text-right text-gray-700">Total</td>
              <td className="px-4 py-2 text-sm font-bold text-right">
                {formatCurrency(totalDebit)}
              </td>
              <td className="px-4 py-2 text-sm font-bold text-right">
                {formatCurrency(totalCredit)}
              </td>
              {!readOnly && <td></td>}
            </tr>
            {!readOnly && (
              <tr>
                <td colSpan={4} className="px-4 py-2">
                  <div className={`text-xs font-medium ${isBalanced ? 'text-green-600' : totalDebit > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                    {isBalanced ? '✓ Seimbang — siap diposting' : totalDebit > 0 ? `Selisih: ${formatCurrency(Math.abs(totalDebit - totalCredit))}` : 'Isi baris jurnal di atas'}
                  </div>
                </td>
                {!readOnly && <td></td>}
              </tr>
            )}
          </tfoot>
        </table>

        {!readOnly && (
          <div className="p-3 border-t border-gray-200">
            <button
              onClick={() => setItems(prev => [...prev, emptyRow()])}
              className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
            >
              <Plus size={16} /> Tambah Baris
            </button>
          </div>
        )}
      </div>

      {header.status === 'posted' && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-800 text-sm">
          Jurnal telah diposting dan tidak dapat diubah.
        </div>
      )}
    </div>
  )
}
