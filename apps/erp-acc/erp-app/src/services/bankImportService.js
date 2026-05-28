import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'

/**
 * Parse an uploaded File (CSV or XLSX) and return raw rows as array of arrays.
 * Each inner array is one row; element 0 = first column, etc.
 */
export function parseStatementFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' })
        resolve(rows)
      } catch (err) {
        reject(new Error('Gagal membaca file: ' + err.message))
      }
    }
    reader.onerror = () => reject(new Error('Gagal membaca file'))
    reader.readAsArrayBuffer(file)
  })
}

/**
 * Map raw rows (array of arrays) to import rows using column indices.
 *
 * colMap shapes:
 *   { dateCol, descCol, amountCol }          — satu kolom amount (+ = masuk, - = keluar)
 *   { dateCol, descCol, debitCol, creditCol } — dua kolom terpisah
 *
 * skipRows: berapa baris awal dilewati (untuk header)
 *
 * Returns array of { row_number, statement_date (YYYY-MM-DD), description, amount }.
 * Baris dengan tanggal tidak valid atau amount = 0 dibuang.
 */
export function mapStatementRows(rawRows, colMap, skipRows) {
  const { dateCol, descCol, amountCol, debitCol, creditCol } = colMap
  const dataRows = rawRows.slice(skipRows)

  return dataRows
    .map((row, i) => {
      const dateRaw = row[dateCol]
      const desc = descCol != null ? String(row[descCol] ?? '').trim() : null

      // Parse date: support Date object (from XLSX cellDates), 'DD/MM/YYYY', 'YYYY-MM-DD'
      let parsedDate = null
      if (dateRaw instanceof Date && !isNaN(dateRaw.getTime())) {
        parsedDate = dateRaw.toISOString().slice(0, 10)
      } else if (typeof dateRaw === 'string' && dateRaw.trim()) {
        const s = dateRaw.trim()
        const parts = s.split(/[-/.]/)
        if (parts.length === 3) {
          if (parts[0].length === 4) {
            // YYYY-MM-DD or YYYY/MM/DD
            parsedDate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`
          } else {
            // DD/MM/YYYY or DD-MM-YYYY
            parsedDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
          }
        }
      }
      if (!parsedDate) return null

      // Parse amount: positive = masuk (incoming), negative = keluar (outgoing)
      let amount = 0
      if (amountCol != null) {
        amount = Number(String(row[amountCol] ?? '0').replace(/[^0-9.-]/g, '')) || 0
      } else {
        const debit  = Number(String(row[debitCol]  ?? '0').replace(/[^0-9.]/g, '')) || 0
        const credit = Number(String(row[creditCol] ?? '0').replace(/[^0-9.]/g, '')) || 0
        amount = credit - debit  // credit = masuk (+), debit = keluar (-)
      }
      if (amount === 0) return null

      return {
        row_number:     skipRows + i + 1,
        statement_date: parsedDate,
        description:    desc || null,
        amount,
      }
    })
    .filter(Boolean)
}

/**
 * Create import session + rows + run server-side matching atomically.
 * Returns the new session UUID.
 */
export async function createImportSession(accountId, fileName, importDate, rows) {
  const { data, error } = await supabase.rpc('create_bank_import_session', {
    p_account_id:  accountId,
    p_file_name:   fileName,
    p_import_date: importDate,
    p_rows:        rows,
  })
  if (error) throw error
  return data
}

/**
 * Fetch all import sessions, optionally filtered by account.
 */
export async function getImportSessions(accountId = null) {
  let q = supabase
    .from('bank_import_sessions')
    .select('*, account:accounts(name, type)')
    .order('created_at', { ascending: false })
  if (accountId) q = q.eq('account_id', accountId)
  const { data, error } = await q
  if (error) throw error
  return data
}

/**
 * Fetch a single session by ID.
 */
export async function getImportSession(sessionId) {
  const { data, error } = await supabase
    .from('bank_import_sessions')
    .select('*, account:accounts(name, type)')
    .eq('id', sessionId)
    .single()
  if (error) throw error
  return data
}

/**
 * Fetch all rows for a session, with matched payment info.
 */
export async function getImportRows(sessionId) {
  const { data, error } = await supabase
    .from('bank_import_rows')
    .select('*, payment:payments(payment_number, date, amount, type, notes)')
    .eq('session_id', sessionId)
    .order('row_number')
  if (error) throw error
  return data
}

/**
 * Mark a single row as 'skipped'.
 */
export async function skipImportRow(rowId) {
  const { error } = await supabase
    .from('bank_import_rows')
    .update({ match_status: 'skipped' })
    .eq('id', rowId)
  if (error) throw error
}

/** Confirm a pending import session (mark as 'confirmed'). */
export async function confirmImport(sessionId) {
  const { error } = await supabase.rpc('confirm_bank_import', { p_session_id: sessionId })
  if (error) throw error
}

/** Cancel a pending import session (mark as 'cancelled'). */
export async function cancelImport(sessionId) {
  const { error } = await supabase.rpc('cancel_bank_import', { p_session_id: sessionId })
  if (error) throw error
}
