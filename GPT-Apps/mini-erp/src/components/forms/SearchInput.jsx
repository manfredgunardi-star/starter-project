import { Search } from 'lucide-react';

export function SearchInput({ placeholder = 'Cari data', value, onChange }) {
  return (
    <label className="relative block w-full sm:max-w-sm">
      <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ios-secondary" size={18} aria-hidden="true" />
      <input
        className="h-11 w-full rounded-full border border-ios-separator bg-white pl-11 pr-4 text-sm outline-none transition placeholder:text-ios-secondary focus:border-ios-blue focus:ring-2 focus:ring-ios-blue/15"
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={placeholder}
        type="search"
        value={value}
      />
    </label>
  );
}
