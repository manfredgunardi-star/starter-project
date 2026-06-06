'use strict'

const { resolveAccount } = require('./account-map')

const JOURNAL_REVIEW_HEADERS = [
  'Tanggal',
  'Journal ID',
  'No. Jurnal',
  'Status',
  'Jenis Jurnal',
  'Deskripsi',
  'Truck',
  'Jumlah Baris',
  'Total Debit (Rp)',
  'Total Kredit (Rp)',
  'Selisih (Rp)',
  'Flags',
  'Akun Hilang',
  'Baris Keterangan Kosong',
  'Duplicate Key',
]

const TRIAL_BALANCE_HEADERS = [
  'Bulan',
  'Kode Akun',
  'Nama Akun',
  'Normal Balance',
  'Saldo Awal (Rp)',
  'Mutasi Debit (Rp)',
  'Mutasi Kredit (Rp)',
  'Saldo Akhir (Rp)',
]

const INCOME_STATEMENT_HEADERS = [
  'Bulan',
  'Kode Akun',
  'Nama Akun',
  'Kelompok',
  'Normal Balance',
  'Nilai (Rp)',
]

const BALANCE_SHEET_HEADERS = [
  'Bulan',
  'Kode Akun',
  'Nama Akun',
  'Kelompok',
  'Normal Balance',
  'Saldo Akhir (Rp)',
]

const AGING_RECEIVABLE_HEADERS = [
  'Invoice ID',
  'No. Invoice',
  'Pelanggan',
  'Tanggal Invoice',
  'Jatuh Tempo',
  'Umur (Hari)',
  'Bucket Aging',
  'Nilai Invoice (Rp)',
  'Total Pembayaran (Rp)',
  'Outstanding (Rp)',
  'Status',
]

const TRUCK_PROFITABILITY_HEADERS = [
  'Truck',
  'Pendapatan (Rp)',
  'Biaya (Rp)',
  'Laba (Rp)',
  'Jumlah Jurnal',
]

const ASSET_HEADERS = [
  'Aset ID',
  'Nama Aset',
  'Kode Akun',
  'Nama Akun',
  'Tanggal Perolehan',
  'Harga Perolehan (Rp)',
  'Penyusutan/Bulan (Rp)',
  'Akumulasi Penyusutan Est. (Rp)',
  'Nilai Buku Est. (Rp)',
  'Status',
]

const CASH_BANK_RECONCILIATION_HEADERS = [
  'Kode Akun',
  'Nama Akun',
  'Tanggal',
  'Journal ID',
  'No. Jurnal',
  'Deskripsi',
  'Debit (Rp)',
  'Kredit (Rp)',
  'Saldo Berjalan (Rp)',
]

function toSheetColumn(index) {
  let value = index
  let result = ''

  while (value > 0) {
    const remainder = (value - 1) % 26
    result = String.fromCharCode(65 + remainder) + result
    value = Math.floor((value - 1) / 26)
  }

  return result
}

function createSchema(title, headers) {
  const lastColumn = toSheetColumn(headers.length)
  return {
    title,
    headerRange: `${title}!A1:${lastColumn}1`,
    dataRange: `${title}!A:${lastColumn}`,
    clearRange: `${title}!A2:${lastColumn}`,
    headers,
  }
}

const CONSULTANT_SCHEMAS = [
  createSchema('Review Jurnal', JOURNAL_REVIEW_HEADERS),
  createSchema('Trial Balance Bulanan', TRIAL_BALANCE_HEADERS),
  createSchema('Laba Rugi Bulanan', INCOME_STATEMENT_HEADERS),
  createSchema('Neraca Bulanan', BALANCE_SHEET_HEADERS),
  createSchema('Aging Piutang', AGING_RECEIVABLE_HEADERS),
  createSchema('Profitabilitas Truck', TRUCK_PROFITABILITY_HEADERS),
  createSchema('Daftar Aset', ASSET_HEADERS),
  createSchema('Rekonsiliasi Kas Bank', CASH_BANK_RECONCILIATION_HEADERS),
]

function formatNumber(value) {
  const numericValue = Number(value || 0)
  if (numericValue === 0) return ''
  return numericValue
}

function toNumber(value) {
  const numericValue = Number(value || 0)
  return Number.isFinite(numericValue) ? numericValue : 0
}

function getPostedJournals(journals) {
  return (journals || []).filter((journal) => journal && journal.status === 'posted')
}

function getJournalId(journal) {
  return String(journal && (journal._docId || journal.id || ''))
}

function getJournalNumber(journal) {
  return getJournalId(journal).slice(0, 8)
}

function getLines(journal) {
  return Array.isArray(journal && journal.lines) ? journal.lines : []
}

function buildJournalReviewDuplicateKey(journal) {
  const lineKeys = getLines(journal)
    .map((line) => [
      String(line.accountCode || ''),
      String((line.keterangan || '').trim()),
      toNumber(line.debit),
      toNumber(line.credit),
    ].join('|'))
    .sort()
    .join('__')

  return `${journal.date || ''}|${lineKeys}`
}

function compareRows(left, right) {
  return String(left).localeCompare(String(right), 'en')
}

function listMonths(journals) {
  const monthSet = new Set()
  for (const journal of journals || []) {
    if (journal.date) monthSet.add(String(journal.date).slice(0, 7))
  }
  return [...monthSet].sort(compareRows)
}

function groupMovementsByMonth(journals) {
  const movements = new Map()

  for (const journal of journals) {
    const month = String(journal.date || '').slice(0, 7)
    if (!month) continue

    if (!movements.has(month)) movements.set(month, new Map())
    const monthMap = movements.get(month)

    for (const line of getLines(journal)) {
      const code = String(line.accountCode || '')
      if (!code) continue

      if (!monthMap.has(code)) {
        monthMap.set(code, { debit: 0, credit: 0 })
      }

      const totals = monthMap.get(code)
      totals.debit += toNumber(line.debit)
      totals.credit += toNumber(line.credit)
    }
  }

  return movements
}

function getAccountEndingBalance(code, totals, accountMap) {
  const account = resolveAccount(code, accountMap)
  return account.normalBalance === 'credit'
    ? toNumber(totals.credit) - toNumber(totals.debit)
    : toNumber(totals.debit) - toNumber(totals.credit)
}

function getAccountGroup(code) {
  const firstDigit = String(code || '').charAt(0)

  if (firstDigit === '1') return 'Aset'
  if (firstDigit === '2') return 'Kewajiban'
  if (firstDigit === '3') return 'Ekuitas'
  if (firstDigit === '4') return 'Pendapatan Usaha'
  if (firstDigit === '5') return 'Harga Pokok Penjualan'
  if (firstDigit === '6') return 'Beban Operasional'
  if (firstDigit === '7') return 'Pendapatan Lain-lain'
  if (firstDigit === '8') return 'Beban Lain-lain'
  return 'Lainnya'
}

function daysBetween(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00.000Z`)
  const end = new Date(`${endDate}T00:00:00.000Z`)
  const diffMs = end.getTime() - start.getTime()
  return Math.floor(diffMs / (24 * 60 * 60 * 1000))
}

function buildJournalReviewRows(journals, accountMap) {
  const duplicateCounts = new Map()
  const reviewItems = (journals || []).map((journal) => {
    const duplicateKey = buildJournalReviewDuplicateKey(journal)
    duplicateCounts.set(duplicateKey, (duplicateCounts.get(duplicateKey) || 0) + 1)
    return { journal, duplicateKey }
  })

  return reviewItems
    .map(({ journal, duplicateKey }) => {
      const lines = getLines(journal)
      const totalDebit = lines.reduce((sum, line) => sum + toNumber(line.debit), 0)
      const totalCredit = lines.reduce((sum, line) => sum + toNumber(line.credit), 0)
      const difference = totalDebit - totalCredit
      const missingAccounts = [...new Set(lines
        .map((line) => String(line.accountCode || ''))
        .filter((code) => code && resolveAccount(code, accountMap).missing))]
        .sort(compareRows)
      const blankDescriptionLines = lines
        .map((line, index) => ({ line, index: index + 1 }))
        .filter(({ line }) => !String(line.keterangan || '').trim())
        .map(({ index }) => index)
      const flags = []

      if (blankDescriptionLines.length > 0) flags.push('Keterangan baris kosong')
      if (missingAccounts.length > 0) flags.push('Kode akun hilang')
      if (lines.length < 2) flags.push('Kurang dari 2 lines')
      if (journal.status === 'deleted') flags.push('Status deleted')
      if (difference !== 0) flags.push('Tidak balance')
      if ((duplicateCounts.get(duplicateKey) || 0) > 1) flags.push('Potensi duplikat')

      return [
        journal.date || '',
        getJournalId(journal),
        getJournalNumber(journal),
        journal.status || '',
        journal.type || '',
        journal.description || '',
        journal.truckId || '-',
        lines.length,
        formatNumber(totalDebit),
        formatNumber(totalCredit),
        formatNumber(difference),
        flags.sort(compareRows).join('; '),
        missingAccounts.join(', '),
        blankDescriptionLines.join(', '),
        duplicateKey,
      ]
    })
    .sort((left, right) => {
      return compareRows(left[0], right[0]) ||
        compareRows(left[1], right[1])
    })
}

function buildMonthlyTrialBalanceRows(journals, accountMap) {
  const postedJournals = getPostedJournals(journals)
  const months = listMonths(postedJournals)
  const movementsByMonth = groupMovementsByMonth(postedJournals)
  const openingBalances = new Map()
  const rows = []

  for (const month of months) {
    const monthMovements = movementsByMonth.get(month) || new Map()
    const accountCodes = [...new Set([
      ...openingBalances.keys(),
      ...monthMovements.keys(),
    ])].sort(compareRows)

    for (const code of accountCodes) {
      const account = resolveAccount(code, accountMap)
      const openingBalance = toNumber(openingBalances.get(code))
      const movement = monthMovements.get(code) || { debit: 0, credit: 0 }
      const closingBalance = openingBalance + getAccountEndingBalance(code, movement, accountMap)

      if (openingBalance === 0 && movement.debit === 0 && movement.credit === 0 && closingBalance === 0) {
        continue
      }

      rows.push([
        month,
        code,
        account.name,
        account.normalBalance,
        formatNumber(openingBalance),
        formatNumber(movement.debit),
        formatNumber(movement.credit),
        formatNumber(closingBalance),
      ])

      openingBalances.set(code, closingBalance)
    }
  }

  return rows
}

function buildMonthlyIncomeStatementRows(journals, accountMap) {
  const postedJournals = getPostedJournals(journals)
  const monthTotals = new Map()

  for (const journal of postedJournals) {
    const month = String(journal.date || '').slice(0, 7)
    if (!month) continue
    if (!monthTotals.has(month)) monthTotals.set(month, new Map())
    const monthMap = monthTotals.get(month)

    for (const line of getLines(journal)) {
      const code = String(line.accountCode || '')
      const firstDigit = code.charAt(0)
      if (!['4', '5', '6', '7', '8'].includes(firstDigit)) continue

      const account = resolveAccount(code, accountMap)
      const amount = account.normalBalance === 'credit'
        ? toNumber(line.credit) - toNumber(line.debit)
        : toNumber(line.debit) - toNumber(line.credit)

      monthMap.set(code, (monthMap.get(code) || 0) + amount)
    }
  }

  const rows = []
  for (const month of [...monthTotals.keys()].sort(compareRows)) {
    const monthMap = monthTotals.get(month)
    for (const code of [...monthMap.keys()].sort(compareRows)) {
      const amount = monthMap.get(code)
      if (amount === 0) continue

      const account = resolveAccount(code, accountMap)
      rows.push([
        month,
        code,
        account.name,
        getAccountGroup(code),
        account.normalBalance,
        amount,
      ])
    }
  }

  return rows
}

function buildMonthlyBalanceSheetRows(journals, accountMap) {
  const postedJournals = getPostedJournals(journals)
  const months = listMonths(postedJournals)
  const movementsByMonth = groupMovementsByMonth(postedJournals)
  const balances = new Map()
  const rows = []

  for (const month of months) {
    const monthMovements = movementsByMonth.get(month) || new Map()
    const relevantCodes = [...new Set([
      ...balances.keys(),
      ...[...monthMovements.keys()].filter((code) => ['1', '2', '3'].includes(String(code).charAt(0))),
    ])].sort(compareRows)

    for (const code of relevantCodes) {
      const movement = monthMovements.get(code) || { debit: 0, credit: 0 }
      const previousBalance = toNumber(balances.get(code))
      const newBalance = previousBalance + getAccountEndingBalance(code, movement, accountMap)

      balances.set(code, newBalance)
      if (newBalance === 0) continue

      const account = resolveAccount(code, accountMap)
      rows.push([
        month,
        code,
        account.name,
        getAccountGroup(code),
        account.normalBalance,
        newBalance,
      ])
    }
  }

  return rows
}

function buildAgingBucket(ageDays) {
  if (ageDays <= 0) return 'Belum Jatuh Tempo'
  if (ageDays <= 30) return '1-30 hari'
  if (ageDays <= 60) return '31-60 hari'
  if (ageDays <= 90) return '61-90 hari'
  return '>90 hari'
}

function buildAgingReceivableRows(invoices, journals, asOfDate) {
  const postedJournalIds = new Set(getPostedJournals(journals).map(getJournalId))

  return (invoices || [])
    .map((invoice) => {
      const payments = Array.isArray(invoice.payments) ? invoice.payments : []
      const validPayments = payments.filter((payment) => {
        if (!payment.journalId) return true
        return postedJournalIds.has(String(payment.journalId))
      })

      let paymentTotal = validPayments.reduce((sum, payment) => sum + toNumber(payment.jumlahBayar), 0)
      if (paymentTotal === 0 && validPayments.length === 0 && invoice.journalId && invoice.status === 'paid' && postedJournalIds.has(String(invoice.journalId))) {
        paymentTotal = toNumber(invoice.amount)
      }

      const invoiceAmount = toNumber(invoice.amount)
      const outstanding = Math.max(0, invoiceAmount - paymentTotal)
      const rawAgeDays = invoice.dueDate ? daysBetween(invoice.dueDate, asOfDate) : 0
      const ageDays = Math.max(0, rawAgeDays)

      let status = 'unpaid'
      if (outstanding <= 0) status = 'paid'
      else if (paymentTotal > 0) status = 'partial'

      return {
        row: [
          invoice.id || '',
          invoice.invoiceNo || '',
          invoice.customerName || '',
          invoice.date || '',
          invoice.dueDate || '',
          formatNumber(ageDays),
          buildAgingBucket(rawAgeDays),
          formatNumber(invoiceAmount),
          formatNumber(paymentTotal),
          formatNumber(outstanding),
          status,
        ],
        sortAge: ageDays,
        dueDate: invoice.dueDate || '',
        invoiceNo: invoice.invoiceNo || invoice.id || '',
      }
    })
    .sort((left, right) => {
      if (left.sortAge !== right.sortAge) return right.sortAge - left.sortAge
      return compareRows(left.dueDate, right.dueDate) || compareRows(left.invoiceNo, right.invoiceNo)
    })
    .map((item) => item.row)
}

function buildTruckProfitabilityRows(journals) {
  const truckMap = new Map()

  for (const journal of getPostedJournals(journals)) {
    for (const line of getLines(journal)) {
      const code = String(line.accountCode || '')
      const firstDigit = code.charAt(0)
      if (!['4', '5', '6', '7', '8'].includes(firstDigit)) continue

      const truck = line.truckId || journal.truckId || 'Tanpa Truck'
      if (!truckMap.has(truck)) {
        truckMap.set(truck, {
          revenue: 0,
          expense: 0,
          journalIds: new Set(),
        })
      }

      const totals = truckMap.get(truck)
      if (firstDigit === '4' || firstDigit === '7') {
        totals.revenue += toNumber(line.credit) - toNumber(line.debit)
      } else {
        totals.expense += toNumber(line.debit) - toNumber(line.credit)
      }
      totals.journalIds.add(getJournalId(journal) || `${journal.date || ''}:${journal.description || ''}`)
    }
  }

  return [...truckMap.entries()]
    .sort(([left], [right]) => {
      if (left === 'Tanpa Truck' && right !== 'Tanpa Truck') return 1
      if (right === 'Tanpa Truck' && left !== 'Tanpa Truck') return -1
      return compareRows(left, right)
    })
    .map(([truck, totals]) => [
      truck,
      formatNumber(totals.revenue),
      formatNumber(totals.expense),
      formatNumber(totals.revenue - totals.expense),
      totals.journalIds.size,
    ])
}

function getAssetMonthlyDepreciation(asset) {
  if (toNumber(asset.penyusutanPerBulan) > 0) return toNumber(asset.penyusutanPerBulan)
  const acquisition = toNumber(asset.hargaPerolehan)
  const usefulLifeYears = toNumber(asset.usiaEkonomis)
  if (acquisition > 0 && usefulLifeYears > 0) {
    return acquisition / (usefulLifeYears * 12)
  }
  return 0
}

function buildAssetRows(assets, journals, accountMap) {
  const postedJournals = getPostedJournals(journals)

  return (assets || [])
    .map((asset) => {
      const accumAccount = asset.accumAccount || (asset.depreciationInfo && asset.depreciationInfo.accumAccount) || ''
      const assetName = String(asset.name || '')
      const estimatedAccumulatedDepreciation = postedJournals.reduce((sum, journal) => {
        return sum + getLines(journal).reduce((lineSum, line) => {
          if (String(line.accountCode || '') !== accumAccount) return lineSum
          if (assetName && !String(line.keterangan || '').toLowerCase().includes(assetName.toLowerCase())) return lineSum
          return lineSum + toNumber(line.credit) - toNumber(line.debit)
        }, 0)
      }, 0)

      const account = resolveAccount(asset.accountCode || '', accountMap)
      const acquisition = toNumber(asset.hargaPerolehan)
      const monthlyDepreciation = getAssetMonthlyDepreciation(asset)
      const bookValue = Math.max(0, acquisition - estimatedAccumulatedDepreciation)

      return [
        asset.id || '',
        assetName,
        asset.accountCode || '',
        account.name,
        asset.tanggalPerolehan || '',
        formatNumber(acquisition),
        formatNumber(monthlyDepreciation),
        formatNumber(estimatedAccumulatedDepreciation),
        formatNumber(bookValue),
        asset.status || 'active',
      ]
    })
    .sort((left, right) => {
      return compareRows(left[4], right[4]) ||
        compareRows(left[0], right[0]) ||
        compareRows(left[1], right[1])
    })
}

function buildCashBankReconciliationRows(journals, accountMap) {
  const rows = []

  for (const journal of getPostedJournals(journals)) {
    getLines(journal).forEach((line, index) => {
      const code = String(line.accountCode || '')
      if (!code.startsWith('111')) return
      const account = resolveAccount(code, accountMap)

      rows.push({
        code,
        name: account.name,
        date: journal.date || '',
        journalId: getJournalId(journal),
        journalNumber: getJournalNumber(journal),
        description: line.keterangan || journal.description || '',
        debit: toNumber(line.debit),
        credit: toNumber(line.credit),
        lineIndex: index,
      })
    })
  }

  rows.sort((left, right) => {
    return compareRows(left.code, right.code) ||
      compareRows(left.date, right.date) ||
      compareRows(left.journalId, right.journalId) ||
      left.lineIndex - right.lineIndex ||
      compareRows(left.description, right.description)
  })

  const runningBalances = new Map()
  return rows.map((row) => {
    const currentBalance = toNumber(runningBalances.get(row.code)) + row.debit - row.credit
    runningBalances.set(row.code, currentBalance)

    return [
      row.code,
      row.name,
      row.date,
      row.journalId,
      row.journalNumber,
      row.description,
      formatNumber(row.debit),
      formatNumber(row.credit),
      formatNumber(currentBalance),
    ]
  })
}

module.exports = {
  CONSULTANT_SCHEMAS,
  buildJournalReviewRows,
  buildMonthlyTrialBalanceRows,
  buildMonthlyIncomeStatementRows,
  buildMonthlyBalanceSheetRows,
  buildAgingReceivableRows,
  buildTruckProfitabilityRows,
  buildAssetRows,
  buildCashBankReconciliationRows,
}
