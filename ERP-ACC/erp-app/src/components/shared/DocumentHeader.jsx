import Input from '../ui/Input'
import Select from '../ui/Select'
import StatusBadge from '../ui/StatusBadge'

export default function DocumentHeader({
  docNumber,
  onDocNumberChange,
  date,
  onDateChange,
  status,
  partyLabel = 'Pihak',
  partyId,
  onPartyChange,
  partyOptions = [],
  dueDate,
  onDueDateChange,
  notes,
  onNotesChange,
  readOnly = false,
  children,
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div className="grid grid-cols-2 gap-4 flex-1 mr-4">
          {/* Document Number */}
          <Input
            label="No. Dokumen"
            value={docNumber || ''}
            onChange={e => onDocNumberChange?.(e.target.value)}
            readOnly={readOnly || !onDocNumberChange}
            placeholder="Otomatis"
            className={readOnly ? 'bg-gray-50' : ''}
          />

          {/* Date */}
          <Input
            label="Tanggal *"
            type="date"
            value={date || ''}
            onChange={e => onDateChange?.(e.target.value)}
            readOnly={readOnly}
          />

          {/* Party (customer/supplier) */}
          {readOnly ? (
            <Input
              label={partyLabel}
              value={partyOptions.find(o => o.value === partyId)?.label || partyId || '—'}
              readOnly
            />
          ) : (
            <Select
              label={`${partyLabel} *`}
              options={partyOptions}
              value={partyId || ''}
              onChange={e => onPartyChange?.(e.target.value)}
              placeholder={`Pilih ${partyLabel.toLowerCase()}...`}
            />
          )}

          {/* Due date (optional) */}
          {(dueDate !== undefined) && (
            <Input
              label="Jatuh Tempo"
              type="date"
              value={dueDate || ''}
              onChange={e => onDueDateChange?.(e.target.value)}
              readOnly={readOnly}
            />
          )}

          {/* Extra slots */}
          {children}
        </div>

        {/* Status badge */}
        {status && (
          <div className="text-right">
            <p className="text-xs text-gray-500 mb-1">Status</p>
            <StatusBadge status={status} />
          </div>
        )}
      </div>

      {/* Notes */}
      {(notes !== undefined) && (
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">Catatan</label>
          <textarea
            value={notes || ''}
            onChange={e => onNotesChange?.(e.target.value)}
            readOnly={readOnly}
            rows={2}
            placeholder="Catatan opsional..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
          />
        </div>
      )}
    </div>
  )
}
