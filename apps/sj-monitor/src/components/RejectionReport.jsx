import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Download, X } from 'lucide-react';
import { exportRejectionReportToExcel, exportRejectionReportToCsv } from '../utils/rejectionReportExport.js';

const springTransition = { type: 'spring', stiffness: 150, damping: 20 };

/**
 * Reusable rejection report — shows rows that failed validation (e.g. import
 * rows referencing master data that isn't registered) with on-screen detail
 * plus Excel/CSV download.
 *
 * Props:
 * - open: boolean — whether the report is visible
 * - onClose: () => void
 * - title: string
 * - summary?: string — short one-line summary shown above the table
 * - columns: { key: string, label: string }[]
 * - rows: Record<string, string | number>[] — must contain a value for each column key
 * - filenamePrefix?: string — used for the downloaded file name (default: 'laporan_penolakan')
 */
export default function RejectionReport({
  open,
  onClose,
  title = 'Laporan Data Ditolak',
  summary,
  columns,
  rows = [],
  filenamePrefix = 'laporan_penolakan',
}) {
  const closeButtonRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="presentation"
          className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center sm:p-4 z-50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={springTransition}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="rejection-report-title"
            className="w-full sm:max-w-2xl max-h-[85vh] flex flex-col rounded-t-3xl sm:rounded-3xl backdrop-blur-xl bg-white/90 border border-white/20 shadow-2xl"
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={springTransition}
          >
            <div className="flex items-start justify-between gap-3 p-5 sm:p-6 border-b border-gray-200/60">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <h2 id="rejection-report-title" className="text-lg sm:text-xl font-bold tracking-tight text-gray-800">
                    {title}
                  </h2>
                  {summary && <p className="text-sm text-gray-600 mt-1">{summary}</p>}
                </div>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={onClose}
                aria-label="Tutup laporan"
                className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 sm:px-6 py-4">
              {rows.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">Tidak ada data yang ditolak.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      {columns.map((col) => (
                        <th key={col.key} className="text-left px-2 py-2 font-medium text-gray-600">
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => (
                      <tr key={idx} className="border-t border-gray-100">
                        {columns.map((col) => (
                          <td key={col.key} className="px-2 py-2 align-top text-gray-700">
                            {row[col.key] ?? ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {rows.length > 0 && (
              <div className="flex flex-col sm:flex-row gap-2 p-5 sm:p-6 border-t border-gray-200/60">
                <button
                  type="button"
                  onClick={() => exportRejectionReportToExcel(rows, columns, filenamePrefix)}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-2xl bg-green-600 text-white hover:bg-green-700 transition font-medium"
                >
                  <Download className="w-4 h-4" /> Unduh Excel
                </button>
                <button
                  type="button"
                  onClick={() => exportRejectionReportToCsv(rows, columns, filenamePrefix)}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-2xl bg-blue-600 text-white hover:bg-blue-700 transition font-medium"
                >
                  <Download className="w-4 h-4" /> Unduh CSV
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 sm:flex-none px-4 py-2 rounded-2xl bg-gray-100 text-gray-700 hover:bg-gray-200 transition font-medium"
                >
                  Tutup
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
