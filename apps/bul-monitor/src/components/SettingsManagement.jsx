import { useState } from 'react';
import { AlertCircle, Package, FileText, Edit, Eye, XCircle, CheckCircle } from 'lucide-react';

const SettingsManagement = ({ currentUser, appSettings, onUpdateSettings }) => {
  const effectiveRole = currentUser?.role === 'owner' ? 'reader' : currentUser?.role;

  const [settings, setSettings] = useState({
    companyName: appSettings?.companyName || '',
    logoUrl: appSettings?.logoUrl || '',
    loginFooterText: appSettings?.loginFooterText || 'Masuk untuk mengakses dashboard monitoring'
  });
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(appSettings?.logoUrl || '');

  const canManageSettings = effectiveRole === 'superadmin';

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) { // 2MB limit
        alert('Ukuran file maksimal 2MB!');
        return;
      }

      if (!file.type.startsWith('image/')) {
        alert('File harus berupa gambar (PNG, JPG, SVG)!');
        return;
      }

      setLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result);
        setSettings({ ...settings, logoUrl: reader.result });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = () => {
    if (!canManageSettings) {
      alert('Anda tidak memiliki akses untuk mengubah settings!');
      return;
    }

    if (!settings.companyName.trim()) {
      alert('Nama PT harus diisi!');
      return;
    }

    onUpdateSettings(settings);
    alert('✅ Settings berhasil disimpan!');
  };

  const handleReset = () => {
    if (confirm('Yakin ingin reset settings ke default?')) {
      const defaultSettings = {
        companyName: '',
        logoUrl: '',
        loginFooterText: 'Masuk untuk mengakses dashboard monitoring'
      };
      setSettings(defaultSettings);
      setLogoPreview('');
      setLogoFile(null);
      onUpdateSettings(defaultSettings);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">⚙️ Pengaturan Aplikasi</h2>
            <p className="text-gray-600 mt-1">Customize tampilan login dan branding perusahaan</p>
          </div>
        </div>

        {!canManageSettings ? (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
            <AlertCircle className="w-12 h-12 mx-auto text-yellow-500 mb-3" />
            <p className="text-yellow-800 font-semibold">Akses Terbatas</p>
            <p className="text-sm text-yellow-700 mt-1">Hanya Super Admin yang dapat mengubah settings</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Company Name */}
            <div className="bg-green-50 rounded-lg p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Package className="w-5 h-5 text-green-600" />
                Nama Perusahaan
              </h3>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nama PT/Perusahaan *
                </label>
                <input
                  type="text"
                  value={settings.companyName}
                  onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
                  placeholder="Contoh: PT Maju Sejahtera"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                />
                <p className="text-xs text-gray-500 mt-2">
                  Nama ini akan ditampilkan di halaman login dan header aplikasi
                </p>
              </div>
            </div>

            {/* Logo Upload */}
            <div className="bg-green-50 rounded-lg p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-green-600" />
                Logo Perusahaan
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Upload Logo
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    Format: PNG, JPG, SVG • Max: 2MB • Recommended: 200x80px
                  </p>
                  {logoPreview && (
                    <button
                      onClick={() => {
                        setLogoPreview('');
                        setSettings({ ...settings, logoUrl: '' });
                        setLogoFile(null);
                      }}
                      className="mt-3 text-sm text-red-600 hover:text-red-700"
                    >
                      🗑️ Hapus Logo
                    </button>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Preview Logo
                  </label>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 flex items-center justify-center bg-white" style={{ minHeight: '150px' }}>
                    {logoPreview ? (
                      <img
                        src={logoPreview}
                        alt="Logo Preview"
                        className="max-h-32 max-w-full object-contain"
                      />
                    ) : (
                      <div className="text-center text-gray-400">
                        <FileText className="w-12 h-12 mx-auto mb-2" />
                        <p className="text-sm">Logo akan muncul di sini</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Login Footer Text */}
            <div className="bg-purple-50 rounded-lg p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Edit className="w-5 h-5 text-purple-600" />
                Text Halaman Login
              </h3>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Text di bawah tombol Login
                </label>
                <textarea
                  value={settings.loginFooterText}
                  onChange={(e) => setSettings({ ...settings, loginFooterText: e.target.value })}
                  placeholder="Masukkan text yang akan ditampilkan..."
                  rows="3"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                />
                <p className="text-xs text-gray-500 mt-2">
                  Text ini muncul di bawah tombol login sebagai informasi tambahan
                </p>
              </div>
            </div>

            {/* Preview Section */}
            <div className="bg-gray-50 rounded-lg p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Eye className="w-5 h-5 text-gray-600" />
                Preview Halaman Login
              </h3>
              <div className="bg-white rounded-lg p-8 border-2 border-gray-200 max-w-md mx-auto">
                {/* Logo Preview */}
                {logoPreview ? (
                  <div className="text-center mb-6">
                    <img src={logoPreview} alt="Logo" className="h-16 mx-auto mb-2" />
                  </div>
                ) : (
                  <div className="text-center mb-6">
                    <div className="text-4xl mb-2">🚚</div>
                  </div>
                )}

                {/* Company Name */}
                <h1 className="text-2xl font-bold text-center text-gray-800 mb-2">
                  {settings.companyName || 'Nama Perusahaan'}
                </h1>
                <h2 className="text-xl font-semibold text-center text-gray-700 mb-6">
                  Surat Jalan Monitor
                </h2>

                {/* Login Form Preview */}
                <div className="space-y-3 mb-4">
                  <input
                    type="text"
                    placeholder="Username"
                    disabled
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
                  />
                  <input
                    type="password"
                    placeholder="Password"
                    disabled
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
                  />
                  <button
                    disabled
                    className="w-full bg-green-600 text-white py-2 rounded-lg opacity-75"
                  >
                    LOGIN
                  </button>
                </div>

                {/* Footer Text */}
                <p className="text-sm text-gray-600 text-center mt-4">
                  {settings.loginFooterText}
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleReset}
                className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-lg flex items-center gap-2 transition"
              >
                <XCircle className="w-4 h-4" />
                Reset ke Default
              </button>
              <button
                onClick={handleSave}
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg flex items-center gap-2 transition"
              >
                <CheckCircle className="w-4 h-4" />
                Simpan Pengaturan
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SettingsManagement;
