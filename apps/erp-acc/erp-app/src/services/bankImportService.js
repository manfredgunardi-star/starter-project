import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'

export function parseStatementFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const workbook = XLSX.read(event.target.result, { type: 'array', cellDates: true })
        const worksheet = workbook.Sheets[workbook.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: '' })
        resolve(rows)
      } catch (err) {
        reject(new Error(`Gagal membaca file: ${err.message}`))
      }
    }
    reader.onerror = () => reject(new Error('Gagal membaca file'))
    reader.readAsArrayBuffer(file)
  })
}

export function mapStatementRows(rawRows, colMap, skipRows) {
  const { dateCol, descCol, amountCol, debitCol, creditCol } = colMap
  const dataRows = rawRows.slice(skipRows)

  return dataRows
    .map((row, index) => {
      const dateRaw = row[dateCol]
      const description = descCol != null ? String(row[descCol] ?? '').trim() : null

      let parsedDate = null
      if (dateRaw instanceof Date && !Number.isNaN(dateRaw.getTime())) {
        parsedDate = dateRaw.toISOString().slice(0, 10)
      } else if (typeof dateRaw === 'string' && dateRaw.trim()) {
        const value = dateRaw.trim()
        const parts = value.split(/[-/.]/)
        if (parts.length === 3) {
          if (parts[0].length === 4) {
            parsedDate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`
          } else {
            parsedDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
          }
        }
      }
      if (!parsedDate) return null

      let amount = 0
      if (amountCol != null) {
        amount = Number(String(row[amountCol] ?? '0').replace(/[^0-9.-]/g, '')) || 0
      } else {
        const debit = Number(String(row[debitCol] ?? '0').replace(/[^0-9.]/g, '')) || 0
        const credit = Number(String(row[creditCol] ?? '0').replace(/[^0-9.]/g, '')) || 0
        amount = credit - debit
      }
      if (amount === 0) return null

      return {
        row_number: skipRows + index + 1,
        statement_date: parsedDate,
        description: description || null,
        amount,
      }
    })
    .filter(Boolean)
}

export async function createImportSession(accountId, fileName, importDate, rows) {
  // Note: @supabase/supabase-js v2.x automatically serializes JS arrays to JSONB
  // when passed to rpc(). JSON.stringify is NOT needed and would break the jsonb param.
  const { data, error } = await supabase.rpc('create_bank_import_session', {
    p_account_id: accountId,
    p_file_name: fileName,
    p_import_date: importDate,
    p_rows: rows,
  })
  if (error) throw error
  return data
}

export async function getImportSessions(accountId = null) {
  let query = supabase
    .from('bank_import_sessions')
    .select('*, account:accounts(name, type)')
    .order('created_at', { ascending: false })

  if (accountId) query = query.eq('account_id', accountId)

  const { data, error } = await query
  if (error) throw error
  return data
}

export async function getImportSession(sessionId) {
  const { data, error } = await supabase
    .from('bank_import_sessions')
    .select('*, account:accounts(name, type)')
    .eq('id', sessionId)
    .single()

  if (error) throw error
  return data
}

export async function getImportRows(sessionId) {
  const { data, error } = await supabase
    .from('bank_import_rows')
    .select('*, payment:payments(payment_number, date, amount, type, notes)')
    .eq('session_id', sessionId)
    .order('row_number')

  if (error) throw error
  return data
}

export async function skipImportRow(rowId) {
  const { error } = await supabase
    .from('bank_import_rows')
    .update({ match_status: 'skipped' })
    .eq('id', rowId)

  if (error) throw error
}

export async function confirmImport(sessionId) {
  const { error } = await supabase.rpc('confirm_bank_import', { p_session_id: sessionId })
  if (error) throw error
}

export async function cancelImport(sessionId) {
  const { error } = await supabase.rpc('cancel_bank_import', { p_session_id: sessionId })
  if (error) throw error
}
