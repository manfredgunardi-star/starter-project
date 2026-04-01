// src/components/SearchableSelect.jsx
import { useState } from 'react';
import { Search } from 'lucide-react';

const SearchableSelect = ({ options, value, onChange, placeholder, label, displayKey = 'name', valueKey = 'id' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredOptions = options.filter(option => {
    const displayValue = option[displayKey]?.toLowerCase() || '';
    return displayValue.includes(searchTerm.toLowerCase());
  });

  const selectedOption = options.find(opt => opt[valueKey] === value);

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-1">{label} *</label>
      <div className="relative">
        <div
          onClick={() => setIsOpen(!isOpen)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 cursor-pointer bg-white flex items-center justify-between"
        >
          <span className={selectedOption ? 'text-gray-800' : 'text-gray-400'}>
            {selectedOption ? selectedOption[displayKey] : placeholder}
          </span>
          <Search className="w-4 h-4 text-gray-400" />
        </div>

        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-72 sm:max-h-60 overflow-hidden">
            <div className="p-2 border-b">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Cari..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
            <div className="overflow-y-auto max-h-60 sm:max-h-48">
              {filteredOptions.length === 0 ? (
                <div className="p-3 text-gray-500 text-sm text-center">Tidak ada data</div>
              ) : (
                filteredOptions.map(option => (
                  <div
                    key={option[valueKey]}
                    onClick={() => {
                      onChange(option[valueKey]);
                      setIsOpen(false);
                      setSearchTerm('');
                    }}
                    className={`px-3 py-3 sm:py-2 cursor-pointer hover:bg-blue-50 ${
                      option[valueKey] === value ? 'bg-blue-100 font-semibold' : ''
                    }`}
                  >
                    {option[displayKey]}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
};

export default SearchableSelect;
