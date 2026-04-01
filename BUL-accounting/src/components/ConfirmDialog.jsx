import React from 'react'
import { AlertCircle, X } from 'lucide-react'

/**
 * Generic confirm dialog.
 *
 * Props:
 *   title        – dialog title
 *   message      – body text
 *   confirmLabel – label for confirm button (default "Hapus")
 *   confirmVariant – "danger" | "primary" (default "danger")
 *   onConfirm    – called when user confirms
 *   onCancel     – called when user cancels
 */
export default function ConfirmDialog({
  title = 'Konfirmasi',
  message = 'Apakah Anda yakin?',
  confirmLabel = 'Hapus',
  confirmVariant = 'danger',
  onConfirm,
  onCancel,
}) {
  const btnClass =
    confirmVariant === 'primary'
      ? 'btn-primary'
      : 'btn-danger'

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between p-5 border-b">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <h2 className="text-base font-semibold text-gray-800">{title}</h2>
          </div>
          <button onClick={onCancel} className="p-1 hover:bg-gray-100 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5">
          <p className="text-sm text-gray-600">{message}</p>
        </div>
        <div className="flex justify-end gap-3 px-5 pb-5">
          <button onClick={onCancel} className="btn-secondary">Batal</button>
          <button onClick={onConfirm} className={btnClass}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
