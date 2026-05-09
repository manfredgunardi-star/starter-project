import React, { useState, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import {
  getJournals, getAccountBalances,
  generateNeracaData, generateLabaRugiData, generateArusKasData,
  formatCurrency, formatDate, getTrucks
} from '../utils/accounting'
import { getAccountName, getDetailAccounts } from '../data/chartOfAccounts'
import {
  exportNeracaToExcel, exportLabaRugiToExcel,
  exportNeracaToPDF, exportLabaRugiToPDF, exportJournalsToExcel
} from '../utils/exportUtils'
import DateFilterBar from '../components/DateFilterBar'
import {
  RefreshCw, FileSpreadsheet, FileDown, TrendingUp, TrendingDown,
  DollarSign, BarChart3, BookOpen, Truck, ChevronDown, ChevronRight
} from 'lucide-react'

// ─── Tab button helper ──────────────────────────────────────────────────────────
function Tab({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
        active
          ? 'bg-brand-600 text-white'
          : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      {children}
    </button>
  )
}

// ─── Neraca Tab ────────────────────────────────────────────────────────────────
function NeracaTab() {
  const thisMonth = new Date().toISOString().slice(0, 7)
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10))
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { setData(await generateNeracaData(endDate)) }
    finally { setLoading(false) }
  }, [endDate])

  const SectionRow = ({ item }) => (
    <tr className="hover:bg-gray-50">
      <td className="py-1.5 pl-6 text-sm text-gray-600">{item.code} - {item.name}</td>
      <td className={`py-1.5 pr-4 text-right text-sm font-medium ${item.balance < 0 ? 'text-red-600' : 'text-gray-800'}`}>
        {item.balance !== 0 ? formatCurrency(item.balance) : '-'}
      </td>
    </tr>
  )

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="label mb-0">Per Tanggal:</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none" />
        </div>
        <button onClick={load} disabled={loading} className="btn-primary flex items-center gap-2">
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />}
          Generate
        </button>
        {data && (
          <>
            <button onClick={() => exportNeracaToExcel(data, endDate)} className="btn-secondary flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4" /> Excel
            </button>
            <button onClick={() => exportNeracaToPDF(data, endDate)} className="btn-secondary flex items-center gap-2">
              <FileDown className="w-4 h-4" /> PDF
            </button>
          </>
        )}
      </div>

      {!data && !loading && (
        <div className="card text-center py-16 text-gray-400 text-sm">
          Klik "Generate" untuk melihat laporan neraca
        </div>
      )}

      {loading && (
        <div className="card flex justify-center py-16">
          <RefreshCw className="w-6 h-6 animate-spin text-brand-500" />
        </div>
      )}

      {data && !loading && (
        <div className="card overflow-hidden">
          <table className="w-full">
            <tbody>
              {/* ASET */}
              <tr className="bg-gray-100">
                <td className="py-2 pl-4 font-bold text-gray-800 text-sm" colSpan={2}>ASET</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="py-1.5 pl-5 text-xs font-semibold text-gray-500 uppercase" colSpan={2}>Aset Lancar</td>
              </tr>
              {data.aset.filter(a => a.code.startsWith('11') && a.balance !== 0).map(a => <SectionRow key={a.code} item={a} />)}
              <tr className="border-t border-gray-200">
                <td className="py-2 pl-5 text-sm font-semibold text-gray-700">Total Aset Lancar</td>
                <td className="py-2 pr-4 text-right text-sm font-semibold text-gray-700">
                  {formatCurrency(data.aset.filter(a => a.code.startsWith('11')).reduce((s, a) => s + a.balance, 0))}
                </td>
              </tr>
              <tr className="bg-gray-50">
                <td className="py-1.5 pl-5 text-xs font-semibold text-gray-500 uppercase" colSpan={2}>Aset Tidak Lancar</td>
              </tr>
              {data.aset.filter(a => a.code.startsWith('12') && a.balance !== 0).map(a => <SectionRow key={a.code} item={a} />)}
              <tr className="border-t border-gray-200">
                <td className="py-2 pl-5 text-sm font-semibold text-gray-700">Total Aset Tidak Lancar</td>
                <td className="py-2 pr-4 text-right text-sm font-semibold text-gray-700">
                  {formatCurrency(data.aset.filter(a => a.code.startsWith('12')).reduce((s, a) => s + a.balance, 0))}
                </td>
              </tr>
              <tr className="bg-brand-50 border-t-2 border-brand-200">
                <td className="py-2.5 pl-4 font-bold text-brand-800">TOTAL ASET</td>
                <td className="py-2.5 pr-4 text-right font-bold text-brand-800">{formatCurrency(data.totalAset)}</td>
              </tr>

              {/* KEWAJIBAN */}
              <tr className="bg-gray-100">
                <td className="py-2 pl-4 font-bold text-gray-800 text-sm" colSpan={2}>KEWAJIBAN &amp; EKUITAS</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="py-1.5 pl-5 text-xs font-semibold text-gray-500 uppercase" colSpan={2}>Kewajiban</td>
              </tr>
              {data.kewajiban.filter(a => a.balance !== 0).map(a => <SectionRow key={a.code} item={a} />)}
              <tr className="border-t border-gray-200">
                <td className="py-2 pl-5 text-sm font-semibold text-gray-700">Total Kewajiban</td>
                <td className="py-2 pr-4 text-right text-sm font-semibold text-gray-700">{formatCurrency(data.totalKewajiban)}</td>
              </tr>

              {/* EKUITAS */}
              <tr className="bg-gray-50">
                <td className="py-1.5 pl-5 text-xs font-semibold text-gray-500 uppercase" colSpan={2}>Ekuitas</td>
              </tr>
              {data.ekuitas.filter(a => a.balance !== 0).map(a => <SectionRow key={a.code} item={a} />)}
              <tr>
                <td className="py-1.5 pl-6 text-sm text-gray-600">Laba Tahun Berjalan</td>
                <td className={`py-1.5 pr-4 text-right text-sm font-medium ${data.labaBerjalan < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                  {formatCurrency(data.labaBerjalan)}
                </td>
              </tr>
              <tr className="border-t border-gray-200">
                <td className="py-2 pl-5 text-sm font-semibold text-gray-700">Total Ekuitas</td>
                <td className="py-2 pr-4 text-right text-sm font-semibold text-gray-700">{formatCurrency(data.totalEkuitas)}</td>
              </tr>
              <tr className="bg-brand-50 border-t-2 border-brand-200">
                <td className="py-2.5 pl-4 font-bold text-brand-800">TOTAL KEWAJIBAN &amp; EKUITAS</td>
                <td className="py-2.5 pr-4 text-right font-bold text-brand-800">
                  {formatCurrency(data.totalKewajiban + data.totalEkuitas)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Laba Rugi Tab ─────────────────────────────────────────────────────────────
function LabaRugiTab() {
  const thisMonth = new Date().toISOString().slice(0, 7)
  const [startDate, setStartDate] = useState(`${thisMonth}-01`)
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10))
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { setData(await generateLabaRugiData(startDate, endDate)) }
    finally { setLoading(false) }
  }, [startDate, endDate])

  const SectionRows = ({ items, label, total, totalClass = '' }) => (
    <>
      <tr className="bg-gray-50">
        <td className="py-1.5 pl-5 text-xs font-semibold text-gray-500 uppercase" colSpan={2}>{label}</td>
      </tr>
      {items.filter(a => a.balance !== 0).map(a => (
        <tr key={a.code} className="hover:bg-gray-50">
          <td className="py-1.5 pl-6 text-sm text-gray-600">{a.code} - {a.name}</td>
          <td className="py-1.5 pr-4 text-right text-sm font-medium text-gray-800">{formatCurrency(a.balance)}</td>
        </tr>
      ))}
      <tr className="border-t border-gray-200">
        <td className={`py-2 pl-5 text-sm font-semibold ${totalClass || 'text-gray-700'}`}>Total {label}</td>
        <td className={`py-2 pr-4 text-right text-sm font-semibold ${totalClass || 'text-gray-700'}`}>{formatCurrency(total)}</td>
      </tr>
    </>
  )

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-3">
        <DateFilterBar startDate={startDate} endDate={endDate} onStartDate={setStartDate} onEndDate={setEndDate} />
        <button onClick={load} disabled={loading} className="btn-primary flex items-center gap-2">
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
          Generate
        </button>
        {data && (
          <>
            <button onClick={() => exportLabaRugiToExcel(data, startDate, endDate)} className="btn-secondary flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4" /> Excel
            </button>
            <button onClick={() => exportLabaRugiToPDF(data, startDate, endDate)} className="btn-secondary flex items-center gap-2">
              <FileDown className="w-4 h-4" /> PDF
            </button>
          </>
        )}
      </div>

      {!data && !loading && (
        <div className="card text-center py-16 text-gray-400 text-sm">Klik "Generate" untuk melihat laporan laba rugi</div>
      )}
      {loading && <div className="card flex justify-center py-16"><RefreshCw className="w-6 h-6 animate-spin text-brand-500" /></div>}

      {data && !loading && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Pendapatan', value: data.totalPendapatanUsaha, icon: TrendingUp, color: 'text-emerald-700' },
              { label: 'Total Beban', value: data.totalHPP + data.totalBebanOperasional, icon: TrendingDown, color: 'text-rose-600' },
              { label: 'Laba Bersih', value: data.labaBersih, icon: DollarSign, color: data.labaBersih >= 0 ? 'text-brand-700' : 'text-red-600' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="card p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`w-4 h-4 ${color}`} />
                  <span className="text-xs text-gray-500">{label}</span>
                </div>
                <p className={`text-lg font-bold ${color}`}>{formatCurrency(value)}</p>
              </div>
            ))}
          </div>

          <div className="card overflow-hidden">
            <table className="w-full">
              <tbody>
                <SectionRows items={data.pendapatanUsaha} label="Pendapatan Usaha" total={data.totalPendapatanUsaha} totalClass="text-emerald-700" />
                <SectionRows items={data.hpp} label="Beban Pokok Pendapatan" total={data.totalHPP} />
                <tr className="bg-emerald-50 border-t-2 border-emerald-200">
                  <td className="py-2 pl-4 font-bold text-emerald-800">LABA KOTOR</td>
                  <td className={`py-2 pr-4 text-right font-bold ${data.labaKotor >= 0 ? 'text-emerald-800' : 'text-red-600'}`}>{formatCurrency(data.labaKotor)}</td>
                </tr>
                <SectionRows items={data.bebanOperasional} label="Beban Operasional" total={data.totalBebanOperasional} />
                <tr className="bg-blue-50 border-t-2 border-blue-200">
                  <td className="py-2 pl-4 font-bold text-blue-800">LABA OPERASIONAL</td>
                  <td className={`py-2 pr-4 text-right font-bold ${data.labaOperasional >= 0 ? 'text-blue-800' : 'text-red-600'}`}>{formatCurrency(data.labaOperasional)}</td>
                </tr>
                <SectionRows items={data.pendapatanLain} label="Pendapatan Lain-lain" total={data.totalPendapatanLain} />
                <SectionRows items={data.bebanLain} label="Beban Lain-lain" total={data.totalBebanLain} />
                <tr className="bg-brand-50 border-t-2 border-brand-200">
                  <td className="py-2.5 pl-4 font-bold text-brand-800 text-base">LABA BERSIH</td>
                  <td className={`py-2.5 pr-4 text-right font-bold text-base ${data.labaBersih >= 0 ? 'text-brand-800' : 'text-red-600'}`}>{formatCurrency(data.labaBersih)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Arus Kas Tab ──────────────────────────────────────────────────────────────
function ArusKasTab() {
  const thisMonth = new Date().toISOString().slice(0, 7)
  const [startDate, setStartDate] = useState(`${thisMonth}-01`)
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10))
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { setData(await generateArusKasData(startDate, endDate)) }
    finally { setLoading(false) }
  }, [startDate, endDate])

  const Row = ({ label, value, bold }) => (
    <tr className={bold ? 'border-t border-gray-200' : 'hover:bg-gray-50'}>
      <td className={`py-2 pl-4 text-sm ${bold ? 'font-semibold text-gray-800' : 'text-gray-600 pl-8'}`}>{label}</td>
      <td className={`py-2 pr-4 text-right text-sm font-medium ${value >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
        {formatCurrency(value)}
      </td>
    </tr>
  )

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-3">
        <DateFilterBar startDate={startDate} endDate={endDate} onStartDate={setStartDate} onEndDate={setEndDate} />
        <button onClick={load} disabled={loading} className="btn-primary flex items-center gap-2">
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
          Generate
        </button>
      </div>

      {!data && !loading && <div className="card text-center py-16 text-gray-400 text-sm">Klik "Generate" untuk melihat laporan arus kas</div>}
      {loading && <div className="card flex justify-center py-16"><RefreshCw className="w-6 h-6 animate-spin text-brand-500" /></div>}

      {data && !loading && (
        <div className="card overflow-hidden">
          <table className="w-full">
            <tbody>
              <tr className="bg-gray-100">
                <td className="py-2 pl-4 font-bold text-gray-800 text-sm" colSpan={2}>LAPORAN ARUS KAS</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="py-1.5 pl-5 text-xs font-semibold text-gray-500 uppercase" colSpan={2}>Aktivitas Operasional</td>
              </tr>
              <Row label="Arus kas dari operasional" value={data.operasional} />
              <Row label="Total Aktivitas Operasional" value={data.operasional} bold />

              <tr className="bg-gray-50">
                <td className="py-1.5 pl-5 text-xs font-semibold text-gray-500 uppercase" colSpan={2}>Aktivitas Investasi</td>
              </tr>
              <Row label="Arus kas dari investasi" value={data.investasi} />
              <Row label="Total Aktivitas Investasi" value={data.investasi} bold />

              <tr className="bg-gray-50">
                <td className="py-1.5 pl-5 text-xs font-semibold text-gray-500 uppercase" colSpan={2}>Aktivitas Pendanaan</td>
              </tr>
              <Row label="Arus kas dari pendanaan" value={data.pendanaan} />
              <Row label="Total Aktivitas Pendanaan" value={data.pendanaan} bold />

              <tr className="bg-brand-50 border-t-2 border-brand-200">
                <td className="py-2 pl-4 font-bold text-brand-800">KENAIKAN / PENURUNAN KAS BERSIH</td>
                <td className={`py-2 pr-4 text-right font-bold ${data.totalPerubahanKas >= 0 ? 'text-brand-800' : 'text-red-600'}`}>
                  {formatCurrency(data.totalPerubahanKas)}
                </td>
              </tr>
              <tr>
                <td className="py-2 pl-4 text-sm text-gray-600">Saldo Kas Awal Periode</td>
                <td className="py-2 pr-4 text-right text-sm font-medium text-gray-800">{formatCurrency(data.saldoAwal)}</td>
              </tr>
              <tr className="bg-emerald-50 border-t border-emerald-200">
                <td className="py-2 pl-4 font-bold text-emerald-800">SALDO KAS AKHIR PERIODE</td>
                <td className={`py-2 pr-4 text-right font-bold ${data.saldoAkhir >= 0 ? 'text-emerald-800' : 'text-red-600'}`}>
                  {formatCurrency(data.saldoAkhir)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Saldo Akun Tab ────────────────────────────────────────────────────────────
function SaldoTab() {
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10))
  const [startDate, setStartDate] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try { setData(await getAccountBalances(endDate, startDate || null)) }
    finally { setLoading(false) }
  }, [endDate, startDate])

  const rows = data
    ? Object.entries(data)
        .filter(([code]) => {
          if (!search) return true
          const name = getAccountName(code)?.toLowerCase() || ''
          return code.includes(search) || name.includes(search.toLowerCase())
        })
        .sort(([a], [b]) => a.localeCompare(b))
    : []

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="label mb-0 text-xs">Mulai:</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none" />
        </div>
        <div className="flex items-center gap-2">
          <label className="label mb-0 text-xs">S/D:</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none" />
        </div>
        <button onClick={load} disabled={loading} className="btn-primary flex items-center gap-2">
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />}
          Generate
        </button>
        {data && (
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari akun..."
            className="ml-auto border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none w-44" />
        )}
      </div>

      {!data && !loading && <div className="card text-center py-16 text-gray-400 text-sm">Klik "Generate" untuk melihat saldo akun</div>}
      {loading && <div className="card flex justify-center py-16"><RefreshCw className="w-6 h-6 animate-spin text-brand-500" /></div>}

      {data && !loading && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="table-header">
                <th className="p-3 text-left">Kode</th>
                <th className="p-3 text-left">Nama Akun</th>
                <th className="p-3 text-right">Debit</th>
                <th className="p-3 text-right">Kredit</th>
                <th className="p-3 text-right">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={5} className="py-8 text-center text-gray-400">Tidak ada data</td></tr>
              ) : rows.map(([code, bal]) => (
                <tr key={code} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="p-3 font-mono text-xs text-gray-600">{code}</td>
                  <td className="p-3 text-gray-700">{getAccountName(code) || '-'}</td>
                  <td className="p-3 text-right text-emerald-700">{formatCurrency(bal.debit)}</td>
                  <td className="p-3 text-right text-rose-600">{formatCurrency(bal.credit)}</td>
                  <td className={`p-3 text-right font-semibold ${bal.net >= 0 ? 'text-gray-800' : 'text-red-600'}`}>
                    {formatCurrency(Math.abs(bal.net))} {bal.net < 0 ? '(K)' : bal.normalBalance === 'debit' ? '' : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Buku Besar Tab ────────────────────────────────────────────────────────────
function BukuBesarTab() {
  const thisMonth = new Date().toISOString().slice(0, 7)
  const [startDate, setStartDate] = useState(`${thisMonth}-01`)
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10))
  const [selectedAccount, setSelectedAccount] = useState('')
  const [journals, setJournals] = useState([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(true)

  const load = useCallback(async () => {
    if (!selectedAccount) return
    setLoading(true)
    try {
      const js = await getJournals({ startDate, endDate, accountCode: selectedAccount })
      setJournals(js)
    } finally { setLoading(false) }
  }, [startDate, endDate, selectedAccount])

  // Build ledger rows
  const ledgerRows = []
  let runningBalance = 0
  journals.forEach(j => {
    j.lines?.filter(l => l.accountCode === selectedAccount).forEach(l => {
      const debit = l.debit || 0
      const credit = l.credit || 0
      runningBalance += debit - credit
      ledgerRows.push({ date: j.date, keterangan: l.keterangan, debit, credit, balance: runningBalance, journalId: j.id })
    })
  })

  // Build account list for dropdown (static — tidak berubah)
  const allAccounts = getDetailAccounts()

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-3">
        <DateFilterBar startDate={startDate} endDate={endDate} onStartDate={setStartDate} onEndDate={setEndDate}>
          <select value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)} className="select-field w-60">
            <option value="">-- Pilih Akun --</option>
            {allAccounts.map(a => <option key={a.code} value={a.code}>{a.code} - {a.name}</option>)}
          </select>
        </DateFilterBar>
        <button onClick={load} disabled={loading || !selectedAccount} className="btn-primary flex items-center gap-2">
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />}
          Tampilkan
        </button>
      </div>

      {!selectedAccount && <div className="card text-center py-16 text-gray-400 text-sm">Pilih akun untuk melihat buku besar</div>}
      {loading && <div className="card flex justify-center py-16"><RefreshCw className="w-6 h-6 animate-spin text-brand-500" /></div>}

      {!loading && selectedAccount && journals.length === 0 && (
        <div className="card text-center py-16 text-gray-400 text-sm">Tidak ada transaksi pada periode ini</div>
      )}

      {!loading && ledgerRows.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <p className="font-semibold text-gray-800 text-sm">
              {allAccounts.find(a => a.code === selectedAccount)?.code} - {allAccounts.find(a => a.code === selectedAccount)?.name}
            </p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="table-header">
                <th className="p-3 text-left">Tanggal</th>
                <th className="p-3 text-left">Keterangan</th>
                <th className="p-3 text-right">Debit</th>
                <th className="p-3 text-right">Kredit</th>
                <th className="p-3 text-right">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {ledgerRows.map((row, i) => (
                <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="p-3 text-gray-600">{formatDate(row.date)}</td>
                  <td className="p-3 text-gray-700">{row.keterangan}</td>
                  <td className="p-3 text-right text-emerald-700">{row.debit > 0 ? formatCurrency(row.debit) : ''}</td>
                  <td className="p-3 text-right text-rose-600">{row.credit > 0 ? formatCurrency(row.credit) : ''}</td>
                  <td className={`p-3 text-right font-semibold ${row.balance >= 0 ? 'text-gray-800' : 'text-red-600'}`}>
                    {formatCurrency(Math.abs(row.balance))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── GL Cost Center Tab ────────────────────────────────────────────────────────
function GLCostCenterTab() {
  const thisMonth = new Date().toISOString().slice(0, 7)
  const [startDate, setStartDate] = useState(`${thisMonth}-01`)
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10))
  const [journals, setJournals] = useState([])
  const [trucks, setTrucks] = useState([])
  const [loading, setLoading] = useState(false)
  const [openTruck, setOpenTruck] = useState({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [js, ts] = await Promise.all([getJournals({ startDate, endDate }), getTrucks()])
      setJournals(js)
      setTrucks(ts)
    } finally { setLoading(false) }
  }, [startDate, endDate])

  // Group journals by truckId
  const byTruck = {}
  journals.forEach(j => {
    const key = j.truckId || '__none__'
    if (!byTruck[key]) byTruck[key] = []
    byTruck[key].push(j)
  })

  const getTruckLabel = (id) => {
    if (id === '__none__') return 'Tanpa Armada'
    const t = trucks.find(t => t.id === id)
    return t ? `${t.nopol} — ${t.model || ''}` : id
  }

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-3">
        <DateFilterBar startDate={startDate} endDate={endDate} onStartDate={setStartDate} onEndDate={setEndDate} />
        <button onClick={load} disabled={loading} className="btn-primary flex items-center gap-2">
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />}
          Generate
        </button>
      </div>

      {!loading && journals.length === 0 && (
        <div className="card text-center py-16 text-gray-400 text-sm">Klik "Generate" untuk melihat GL per armada</div>
      )}
      {loading && <div className="card flex justify-center py-16"><RefreshCw className="w-6 h-6 animate-spin text-brand-500" /></div>}

      {!loading && journals.length > 0 && (
        <div className="space-y-3">
          {Object.entries(byTruck).sort(([a], [b]) => a.localeCompare(b)).map(([truckId, tJournals]) => {
            const totalD = tJournals.reduce((s, j) => s + (j.lines?.reduce((ls, l) => ls + (l.debit || 0), 0) || 0), 0)
            const totalC = tJournals.reduce((s, j) => s + (j.lines?.reduce((ls, l) => ls + (l.credit || 0), 0) || 0), 0)
            const isOpen = openTruck[truckId]
            return (
              <div key={truckId} className="card overflow-hidden">
                <button
                  onClick={() => setOpenTruck(p => ({ ...p, [truckId]: !isOpen }))}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50"
                >
                  <div className="flex items-center gap-3">
                    <Truck className="w-4 h-4 text-brand-500" />
                    <span className="font-semibold text-gray-800">{getTruckLabel(truckId)}</span>
                    <span className="text-xs text-gray-400">{tJournals.length} jurnal</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-emerald-700 font-medium">D: {formatCurrency(totalD)}</span>
                    <span className="text-sm text-rose-600 font-medium">K: {formatCurrency(totalC)}</span>
                    {isOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t border-gray-100">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="table-header">
                          <th className="p-2 text-left">Tanggal</th>
                          <th className="p-2 text-left">Keterangan</th>
                          <th className="p-2 text-left">Akun</th>
                          <th className="p-2 text-right">Debit</th>
                          <th className="p-2 text-right">Kredit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tJournals.map(j => j.lines?.map((l, i) => (
                          <tr key={`${j.id}-${i}`} className="border-t border-gray-100 hover:bg-gray-50">
                            <td className="p-2 text-gray-500">{i === 0 ? formatDate(j.date) : ''}</td>
                            <td className="p-2 text-gray-600">{l.keterangan}</td>
                            <td className="p-2 text-gray-500">{getAccountName(l.accountCode) || l.accountCode}</td>
                            <td className="p-2 text-right text-emerald-700">{l.debit > 0 ? formatCurrency(l.debit) : ''}</td>
                            <td className="p-2 text-right text-rose-600">{l.credit > 0 ? formatCurrency(l.credit) : ''}</td>
                          </tr>
                        )))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Main LaporanPage ──────────────────────────────────────────────────────────
const TABS = [
  { key: 'neraca',         label: 'Neraca' },
  { key: 'labarugi',      label: 'Laba Rugi' },
  { key: 'aruskas',       label: 'Arus Kas' },
  { key: 'saldo',         label: 'Saldo Akun' },
  { key: 'buku_besar',    label: 'Buku Besar' },
  { key: 'gl_cost_center', label: 'GL per Armada' },
]

export default function LaporanPage() {
  const [activeTab, setActiveTab] = useState('neraca')

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Laporan Keuangan</h1>
        <p className="text-sm text-gray-500 mt-0.5">Neraca, Laba Rugi, Arus Kas, dan Analisis Akun</p>
      </div>

      {/* Tab navigation */}
      <div className="flex flex-wrap gap-2 p-1 bg-gray-100 rounded-xl w-fit">
        {TABS.map(t => (
          <Tab key={t.key} active={activeTab === t.key} onClick={() => setActiveTab(t.key)}>
            {t.label}
          </Tab>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'neraca'          && <NeracaTab />}
      {activeTab === 'labarugi'        && <LabaRugiTab />}
      {activeTab === 'aruskas'         && <ArusKasTab />}
      {activeTab === 'saldo'           && <SaldoTab />}
      {activeTab === 'buku_besar'      && <BukuBesarTab />}
      {activeTab === 'gl_cost_center'  && <GLCostCenterTab />}
    </div>
  )
}
