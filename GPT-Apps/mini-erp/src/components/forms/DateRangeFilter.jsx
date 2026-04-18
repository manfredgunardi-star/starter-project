import { X } from 'lucide-react';
import { Button } from '../ui/Button.jsx';
import { TextField } from './TextField.jsx';

export function DateRangeFilter({ endDate, onClear, onEndDateChange, onStartDateChange, startDate }) {
  return (
    <div className="grid gap-3 rounded-2xl border border-ios-separator bg-white p-4 shadow-ios-subtle md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
      <TextField
        label="Dari Tanggal"
        onChange={(event) => onStartDateChange(event.target.value)}
        type="date"
        value={startDate}
      />
      <TextField
        label="Sampai Tanggal"
        onChange={(event) => onEndDateChange(event.target.value)}
        type="date"
        value={endDate}
      />
      <Button icon={X} onClick={onClear} type="button" variant="secondary">
        Reset
      </Button>
    </div>
  );
}
