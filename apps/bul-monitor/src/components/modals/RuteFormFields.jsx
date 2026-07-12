const RuteFormFields = ({ formData, setFormData }) => (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rute *</label>
                <input
                  type="text"
                  value={formData.rute}
                  onChange={(e) => setFormData({ ...formData, rute: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="Contoh: Jakarta - Surabaya"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Uang Jalan (Rp) *</label>
                <input
                  type="number"
                  value={formData.uangJalan}
                  onChange={(e) => setFormData({ ...formData, uangJalan: e.target.value })}
                  onWheel={(e) => e.currentTarget.blur()}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="Contoh: 500000"
                  min="0"
                  step="10000"
                />
              </div>
            </>
);

export default RuteFormFields;
