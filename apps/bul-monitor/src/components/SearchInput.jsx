import { Search, XCircle } from 'lucide-react';

/**
 * Search bar standar bul-monitor. Mengikuti pola sj-monitor (ikon cari di kiri,
 * tombol clear di kanan yang hanya muncul saat ada isi) dengan aksen hijau
 * khas bul-monitor.
 *
 * onChange menerima string nilai baru, bukan event.
 */
export default function SearchInput({ value, onChange, placeholder = 'Cari...' }) {
  return (
    <div className="relative">
      <input
        type="text"
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
      />
      <Search className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Hapus pencarian"
          className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
        >
          <XCircle className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}
