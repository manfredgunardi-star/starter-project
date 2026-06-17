const SupirFormFields = ({ formData, setFormData }) => (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Supir *</label>
                <input
                  type="text"
                  value={formData.namaSupir}
                  onChange={(e) => setFormData({ ...formData, namaSupir: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="Nama lengkap supir"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PT *</label>
                <input
                  type="text"
                  value={formData.pt}
                  onChange={(e) => setFormData({ ...formData, pt: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="Nama perusahaan"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status *</label>
                <select
                  value={formData.isActive ? 'true' : 'false'}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.value === 'true' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                >
                  <option value="true">Aktif</option>
                  <option value="false">Nonaktif</option>
                </select>
              </div>
            </>
);

export default SupirFormFields;
