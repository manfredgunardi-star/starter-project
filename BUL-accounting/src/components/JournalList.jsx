import React, { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { formatCurrency, formatDate, getAuditLog } from '../utils/accounting'
import { getAccountNameDynamic } from '../data/chartOfAccounts'
import { Edit, Trash2, Clock, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react'

/**
 * Menampilkan daftar jurnal dengan audit trail toggle per entri.
 *
 * Props:
 *   journals   – array journal objects
 *   mergedCOA  – hasil getMergedCOA()
 *   loading    – boolean
 *   onEdit     – fn(journal) | null (null = sembunyikan tombol)
 *   onDelete   – fn(id) | null
 */
export default function JournalList({ journals = [], mergedCOA = [], loading = false, onEdit, onDelete }) {
  const { isSuperadmin } = useAuth()

  const [auditLogs, setAuditLogs] = useState({})
  const [auditLoading, setAuditLoading] = useState({})
  const [auditOpen, setAuditOpen] = useState({})

  const toggleAudit = async (journalId) => {
    const isOpen = auditOpen[journalId]
    setAuditOpen(p => ({ ...p, [journalId]: !isOpen }))
    if (!isOpen && !auditLogs[journalId]) {
      setAuditLoading(p => ({ ...p, [journalId]: true }))
      try {
        const logs = await getAuditLog(journalId)
        setAuditLogs(p => ({ ...p, [journalId]: logs }))
      } catch (e) {
        // Permissions error — rules belum di-deploy atau user tidak punya akses
        setAuditLogs(p => ({ ...p, [journalId]: '__error__' }))
      } finally {
        setAuditLoading(p => ({ ...p, [journalId]: false }))
      }
    }
  }

  const typeLabel = { umum: 'Umum', kas: 'Kas', bank: 'Bank', penyesuaian: 'Penyesuaian', penutup: 'Penutup' }
  const actionColor = { created: 'bg-green-50 text-green-700', updated: 'bg-blue-50 text-blue-700', deleted: 'bg-red-50 text-red-600' }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <RefreshCw className="w-6 h-6 animate-spin text-brand-500" />
      </div>
    )
  }

  if (!journals.length) {
    return (
      <div className="card text-center py-16 text-gray-400 text-sm">
        Tidak ada data jurnal pada periode ini
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {journals.map(j => (
        <div key={j.id} className="card p-4">
          <div className="flex items-start justify-between gap-3">
            {/* Left: journal info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <span className="text-sm font-semibold text-gray-800">{formatDate(j.date)}</span>
                <span className="text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full font-medium shrink-0">
                  {typeLabel[j.type] || j.type || 'Umum'}
                </span>
                {j.description && (
                  <span className="text-sm text-gray-500 truncate">{j.description}</span>
                )}
              </div>

              {/* Lines */}
              <div className="space-y-0.5">
                {j.lines?.map((line, idx) => (
                  <div key={idx} className="grid text-xs text-gray-600" style={{ gridTemplateColumns: '1fr 100px 100px 1fr' }}>
                    <span className="truncate pr-2">
                      {mergedCOA.length
                        ? getAccountNameDynamic(line.accountCode, mergedCOA)
                        : line.accountCode}
                    </span>
                    <span className="text-right text-emerald-700 font-medium">
                      {line.debit > 0 ? formatCurrency(line.debit) : ''}
                    </span>
                    <span className="text-right text-rose-600 font-medium pr-2">
                      {line.credit > 0 ? formatCurrency(line.credit) : ''}
                    </span>
                    <span className="text-gray-400 truncate">{line.keterangan}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: action buttons */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => toggleAudit(j.id)}
                title="Riwayat audit"
                className={`p-1.5 rounded-lg transition-colors ${
                  auditOpen[j.id]
                    ? 'bg-brand-50 text-brand-600'
                    : 'hover:bg-gray-100 text-gray-400'
                }`}
              >
                <Clock className="w-4 h-4" />
              </button>

              {isSuperadmin() && onEdit && (
                <button
                  onClick={() => onEdit(j)}
                  className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-400 hover:text-blue-600 transition-colors"
                >
                  <Edit className="w-4 h-4" />
                </button>
              )}
              {isSuperadmin() && onDelete && (
                <button
                  onClick={() => onDelete(j.id)}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Audit trail panel */}
          {auditOpen[j.id] && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Riwayat Audit
              </p>
              {auditLoading[j.id] ? (
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <RefreshCw className="w-3 h-3 animate-spin" /> Memuat...
                </div>
              ) : auditLogs[j.id] === '__error__' ? (
                <p className="text-xs text-amber-600">Firestore rules belum di-deploy — jalankan: <code className="bg-amber-50 px-1 rounded">firebase deploy --only firestore:rules</code></p>
              ) : auditLogs[j.id]?.length > 0 ? (
                <div className="space-y-1">
                  {auditLogs[j.id].map((log, i) => (
                    <div key={i} className="flex items-center gap-3 text-xs">
                      <span className={`px-2 py-0.5 rounded-full font-medium ${actionColor[log.action] || 'bg-gray-50 text-gray-600'}`}>
                        {log.action}
                      </span>
                      <span className="text-gray-600">{log.by}</span>
                      <span className="text-gray-400">{log.at ? new Date(log.at).toLocaleString('id-ID') : '-'}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400">Tidak ada riwayat audit</p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
