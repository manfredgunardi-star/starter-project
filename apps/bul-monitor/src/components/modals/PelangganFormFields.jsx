const PelangganFormFields = ({ formData, setFormData }) => (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Pelanggan / PT *</label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="PT. Nama Perusahaan"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Alamat</label>
                <textarea
                  value={formData.address || ''}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  rows={2}
                  placeholder="Alamat lengkap..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">NPWP</label>
                <input
                  type="text"
                  value={formData.npwp || ''}
                  onChange={(e) => setFormData({ ...formData, npwp: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono focus:ring-2 focus:ring-green-500"
                  placeholder="00.000.000.0-000.000"
                />
              </div>
            </>
);

export default PelangganFormFields;
