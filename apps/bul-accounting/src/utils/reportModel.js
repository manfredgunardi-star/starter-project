/**
 * ReportModel — normalized shape consumed by renderers.
 *
 * ReportModel { id, title, periodLabel, columns:[{key,label,align,isCurrency}], rows:[{type,cells}] }
 * row.type: 'heading' | 'detail' | 'subtotal' | 'total' | 'spacer'
 */
import {
  generateNeracaData, generateLabaRugiData, generateArusKasData,
  getAccountBalances, filterJournalsByDate, formatDate,
} from './accounting'
import { getAccountName } from '../data/chartOfAccounts'

const STMT_COLUMNS = [
  { key: 'label', label: '', align: 'left', isCurrency: false },
  { key: 'amount', label: '', align: 'right', isCurrency: true },
]
const row = (type, label, amount) => ({ type, cells: { label, amount } })
const fmtRange = (s, e) => `Periode ${formatDate(s)} s/d ${formatDate(e)}`

export async function buildNeraca(ds) {
  const d = await generateNeracaData(ds.endDate, 'all', ds.journals)
  const rows = []
  rows.push(row('heading', 'ASET', ''))
  d.aset.filter(a => a.balance !== 0).forEach(a => rows.push(row('detail', `${a.code} - ${a.name}`, a.balance)))
  rows.push(row('total', 'TOTAL ASET', d.totalAset))
  rows.push(row('spacer', '', ''))
  rows.push(row('heading', 'KEWAJIBAN', ''))
  d.kewajiban.filter(a => a.balance !== 0).forEach(a => rows.push(row('detail', `${a.code} - ${a.name}`, a.balance)))
  rows.push(row('subtotal', 'Total Kewajiban', d.totalKewajiban))
  rows.push(row('heading', 'EKUITAS', ''))
  d.ekuitas.filter(a => a.balance !== 0).forEach(a => rows.push(row('detail', `${a.code} - ${a.name}`, a.balance)))
  rows.push(row('detail', 'Laba Tahun Berjalan', d.labaBerjalan))
  rows.push(row('subtotal', 'Total Ekuitas', d.totalEkuitas))
  rows.push(row('total', 'TOTAL KEWAJIBAN & EKUITAS', d.totalKewajiban + d.totalEkuitas))
  return { id: 'neraca', title: 'LAPORAN NERACA', periodLabel: `Per ${formatDate(ds.endDate)}`, columns: STMT_COLUMNS, rows }
}

export async function buildLabaRugi(ds) {
  const d = await generateLabaRugiData(ds.startDate, ds.endDate, 'all', ds.journals)
  const rows = []
  const section = (label, items, total, totalType = 'subtotal') => {
    rows.push(row('heading', label, ''))
    items.filter(a => a.balance !== 0).forEach(a => rows.push(row('detail', `${a.code} - ${a.name}`, a.balance)))
    rows.push(row(totalType, `Total ${label}`, total))
  }
  section('PENDAPATAN USAHA', d.pendapatanUsaha, d.totalPendapatanUsaha)
  section('BEBAN POKOK PENDAPATAN', d.hpp, d.totalHPP)
  rows.push(row('total', 'LABA KOTOR', d.labaKotor))
  section('BEBAN OPERASIONAL', d.bebanOperasional, d.totalBebanOperasional)
  rows.push(row('total', 'LABA OPERASIONAL', d.labaOperasional))
  section('PENDAPATAN LAIN-LAIN', d.pendapatanLain, d.totalPendapatanLain)
  section('BEBAN LAIN-LAIN', d.bebanLain, d.totalBebanLain)
  rows.push(row('total', 'LABA BERSIH', d.labaBersih))
  return { id: 'labarugi', title: 'LAPORAN LABA RUGI', periodLabel: fmtRange(ds.startDate, ds.endDate), columns: STMT_COLUMNS, rows }
}

export async function buildArusKas(ds) {
  const d = await generateArusKasData(ds.startDate, ds.endDate, 'all', ds.journals)
  const rows = [
    row('heading', 'Aktivitas Operasional', ''), row('subtotal', 'Total Aktivitas Operasional', d.operasional),
    row('heading', 'Aktivitas Investasi', ''), row('subtotal', 'Total Aktivitas Investasi', d.investasi),
    row('heading', 'Aktivitas Pendanaan', ''), row('subtotal', 'Total Aktivitas Pendanaan', d.pendanaan),
    row('total', 'KENAIKAN / PENURUNAN KAS BERSIH', d.totalPerubahanKas),
    row('detail', 'Saldo Kas Awal Periode', d.saldoAwal),
    row('total', 'SALDO KAS AKHIR PERIODE', d.saldoAkhir),
  ]
  return { id: 'aruskas', title: 'LAPORAN ARUS KAS', periodLabel: fmtRange(ds.startDate, ds.endDate), columns: STMT_COLUMNS, rows }
}

// ===== TABLE BUILDERS =====
const trow = (type, cells) => ({ type, cells })

export async function buildSaldoAkun(ds) {
  const balances = await getAccountBalances(ds.endDate, ds.startDate || null, 'all', ds.journals)
  const columns = [
    { key: 'kode', label: 'Kode', align: 'left' }, { key: 'nama', label: 'Nama Akun', align: 'left' },
    { key: 'debit', label: 'Debit', align: 'right', isCurrency: true },
    { key: 'kredit', label: 'Kredit', align: 'right', isCurrency: true },
    { key: 'saldo', label: 'Saldo', align: 'right', isCurrency: true },
  ]
  const rows = Object.entries(balances).sort(([a], [b]) => a.localeCompare(b)).map(([code, b]) =>
    trow('detail', { kode: code, nama: getAccountName(code) || '-', debit: b.debit, kredit: b.credit, saldo: Math.abs(b.net) }))
  return { id: 'saldo', title: 'NERACA SALDO', periodLabel: fmtRange(ds.startDate || ds.endDate, ds.endDate), columns, rows }
}

export async function buildBukuBesar(ds) {
  const js = filterJournalsByDate(ds.journals, ds.startDate, ds.endDate)
  const columns = [
    { key: 'tanggal', label: 'Tanggal', align: 'left' }, { key: 'keterangan', label: 'Keterangan', align: 'left' },
    { key: 'debit', label: 'Debit', align: 'right', isCurrency: true },
    { key: 'kredit', label: 'Kredit', align: 'right', isCurrency: true },
    { key: 'saldo', label: 'Saldo', align: 'right', isCurrency: true },
  ]
  // Group lines by account, chronological (filterJournalsByDate sorts desc → reverse for ledger)
  const chrono = js.slice().reverse()
  const byAccount = {}
  chrono.forEach(j => j.lines?.forEach(l => {
    ;(byAccount[l.accountCode] ||= []).push({ date: j.date, keterangan: l.keterangan || j.description || '', debit: l.debit || 0, credit: l.credit || 0 })
  }))
  const rows = []
  Object.keys(byAccount).sort().forEach(code => {
    rows.push(trow('heading', { tanggal: getAccountName(code) }))
    let bal = 0
    byAccount[code].forEach(e => {
      bal += e.debit - e.credit
      rows.push(trow('detail', { tanggal: formatDate(e.date), keterangan: e.keterangan, debit: e.debit, kredit: e.credit, saldo: Math.abs(bal) }))
    })
  })
  return { id: 'buku_besar', title: 'BUKU BESAR', periodLabel: fmtRange(ds.startDate, ds.endDate), columns, rows }
}

export async function buildGLArmada(ds) {
  const js = filterJournalsByDate(ds.journals, ds.startDate, ds.endDate)
  const columns = [
    { key: 'tanggal', label: 'Tanggal', align: 'left' }, { key: 'keterangan', label: 'Keterangan', align: 'left' },
    { key: 'akun', label: 'Akun', align: 'left' },
    { key: 'debit', label: 'Debit', align: 'right', isCurrency: true },
    { key: 'kredit', label: 'Kredit', align: 'right', isCurrency: true },
  ]
  const label = (id) => {
    if (!id) return 'Tanpa Armada'
    const t = ds.trucks.find(t => t.id === id)
    return t ? `${t.nopol} — ${t.model || ''}` : id
  }
  const byTruck = {}
  js.forEach(j => { (byTruck[j.truckId || '__none__'] ||= []).push(j) })
  const rows = []
  Object.keys(byTruck).sort().forEach(tid => {
    rows.push(trow('heading', { tanggal: label(tid === '__none__' ? '' : tid) }))
    byTruck[tid].forEach(j => j.lines?.forEach((l, i) => rows.push(trow('detail', {
      tanggal: i === 0 ? formatDate(j.date) : '', keterangan: l.keterangan || '',
      akun: getAccountName(l.accountCode) || l.accountCode, debit: l.debit || 0, kredit: l.credit || 0,
    }))))
  })
  return { id: 'gl_armada', title: 'GENERAL LEDGER PER ARMADA', periodLabel: fmtRange(ds.startDate, ds.endDate), columns, rows }
}

export async function buildAllReports(ds) {
  return Promise.all([
    buildNeraca(ds), buildLabaRugi(ds), buildArusKas(ds),
    buildSaldoAkun(ds), buildBukuBesar(ds), buildGLArmada(ds),
  ])
}
