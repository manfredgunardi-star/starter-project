import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { getJournals, deleteJournal, getAccountBalances, getTrucks, getCustomCOA, getCOAOverrides, formatCurrency } from '../utils/accounting'
import { getMergedCOA, getKasBankAccounts } from '../data/chartOfAccounts'
import { exportJournalsToExcel } from '../utils/exportUtils'
import JournalEntryForm from '../components/JournalEntryForm'
import JournalList from '../components/JournalList'
import DateFilterBar from '../components/DateFilterBar'
import ConfirmDialog from '../components/ConfirmDialog'
import { Plus, RefreshCw, FileSpreadsheet, Wallet, TrendingUp, TrendingDown, DollarSign } from 'lucide-react'

const KAS_BANK_CODES = ['1111', '1112', '1113', '1114']

export default function KasBankPage() {
  const { currentUser, isSuperadmin } = useAuth()

  const thisMonth = new Date().toISOString().slice(0, 7)
  const [startDate, setStartDate] = useState(`${thisMonth}-01`)
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10))
  const [filterAccount, setFilterAccount] = useState('all')

  const [journals, setJournals] = useState([])
  const [trucks, setTrucks] = useState([])
  const [mergedCOA, setMergedCOA] = useState([])
  const [balances, setBalances] = useState({})
  const [loading, setLoading] = useState(false)

  const [showForm, setShowForm] = useState(false)
  const [editData, setEditData] = useState(null)
  const [deleteId, setDeleteId] = useState(null)

  const loadCOA = useCallback(async () => {
    const [custom, overrides] = await Promise.all([getCustomCOA(), getCOAOverrides()])
    setMergedCOA(getMergedCOA(custom, overrides))
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [js, ts, bals] = await Promise.all([
        getJournals({ startDate, endDate }),
        getTrucks(),
        getAccountBalances(endDate)
      ])
      // Filter hanya jurnal yang ada baris akun kas/bank
      const kasBankJs = js.filter(j =>
        j.lines?.some(l => KAS_BANK_CODES.includes(l.accountCode))
      )
      setJournals(kasBankJs)
      setTrucks(ts)
      setBalances(bals)
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate])

  useEffect(() => { loadCOA() }, [loadCOA])
  useEffect(() => { loadData() }, [loadData])

  // Filter by akun spesifik
  const filtered = filterAccount === 'all'
    ? journals
    : journals.filter(j => j.lines?.some(l => l.accountCode === filterAccount))

  // Summary saldo per akun kas/bank
  const kasBankAccounts = getKasBankAccounts()
  const totalKas = KAS_BANK_CODES.reduce((s, code) => {
    const b = balances[code]
    return s + (b ? b.debit - b.credit : 0)
  }, 0)

  const handleDelete = async () => {
    await deleteJournal(deleteId, currentUser?.uid)
    setDeleteId(null)
    loadData()
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Kas &amp; Bank</h1>
          <p className="text-sm text-gray-500 mt-0.5">Mutasi dan saldo akun kas &amp; bank</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => filtered.length && exportJournalsToExcel(filtered, `kas-bank-${startDate}-${endDate}`)}
            disabled={!filtered.length}
            className="btn-secondary flex items-center gap-2"
          >
            <FileSpreadsheet className="w-4 h-4" /> Export Excel
          </button>
          {isSuperadmin() && (
            <button
              onClick={() => { setEditData(null); setShowForm(true) }}
              className="btn-primary flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Tambah Jurnal
            </button>
          )}
        </div>
      </div>

      {/* Saldo cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {KAS_BANK_CODES.map(code => {
          const acc = kasBankAccounts.find(a => a.code === code)
          const b = balances[code]
          const saldo = b ? b.debit - b.credit : 0
          return (
            <div key={code} className="card p-4">
              <p className="text-xs text-gray-500 mb-1">{acc?.name || code}</p>
              <p className={`text-lg font-bold ${saldo >= 0 ? 'text-gray-800' : 'text-red-600'}`}>
                {formatCurrency(saldo)}
              </p>
            </div>
          )
        })}
      </div>

      {/* Total saldo */}
      <div className="card p-4 bg-brand-50 border-brand-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-brand-600" />
            <span className="font-semibold text-brand-800">Total Saldo Kas &amp; Bank</span>
          </div>
          <span className={`text-xl font-bold ${totalKas >= 0 ? 'text-brand-700' : 'text-red-600'}`}>
            {formatCurrency(totalKas)}
          </span>
        </div>
      </div>

      {/* Filter bar */}
      <div className="card space-y-3">
        <DateFilterBar startDate={startDate} endDate={endDate} onStartDate={setStartDate} onEndDate={setEndDate}>
          <select value={filterAccount} onChange={e => setFilterAccount(e.target.value)} className="select-field w-48">
            <option value="all">Semua Akun Kas/Bank</option>
            {KAS_BANK_CODES.map(code => {
              const acc = kasBankAccounts.find(a => a.code === code)
              return <option key={code} value={code}>{code} - {acc?.name}</option>
            })}
          </select>
          <button onClick={loadData} className="btn-secondary flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> Refresh
          </button>
        </DateFilterBar>
        <p className="text-sm text-gray-500 pt-1 border-t border-gray-100">{filtered.length} transaksi</p>
      </div>

      {/* List */}
      <JournalList
        journals={filtered}
        mergedCOA={mergedCOA}
        loading={loading}
        onEdit={isSuperadmin() ? (j) => { setEditData(j); setShowForm(true) } : null}
        onDelete={isSuperadmin() ? (id) => setDeleteId(id) : null}
      />

      {/* Form modal */}
      {showForm && (
        <JournalEntryForm
          editData={editData}
          trucks={trucks}
          mergedCOA={mergedCOA}
          onSaved={loadData}
          onClose={() => { setShowForm(false); setEditData(null) }}
        />
      )}

      {/* Delete confirm */}
      {deleteId && (
        <ConfirmDialog
          title="Hapus Jurnal"
          message="Jurnal akan dihapus permanen dan dicatat di audit trail. Lanjutkan?"
          confirmLabel="Hapus"
          confirmVariant="danger"
          onConfirm={handleDelete}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  )
}
