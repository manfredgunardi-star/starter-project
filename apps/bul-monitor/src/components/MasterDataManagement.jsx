import { useState } from 'react';
import { Plus, Edit, Trash2, RefreshCw, FileText, Package, Truck, Users } from 'lucide-react';
import { formatCurrency } from '../utils/formatters.js';
import SearchInput from './SearchInput.jsx';
import { useSearchFilter } from '../hooks/useSearchFilter.js';

// Konstanta level-modul: referensi array stabil antar-render agar useMemo
// di dalam useSearchFilter benar-benar efektif.
const TRUCK_SEARCH_FIELDS = ['nomorPolisi'];
const SUPIR_SEARCH_FIELDS = ['namaSupir', 'pt'];
const RUTE_SEARCH_FIELDS = ['rute'];
const MATERIAL_SEARCH_FIELDS = ['material', 'satuan'];
const PELANGGAN_SEARCH_FIELDS = ['name', 'address', 'npwp'];

const MasterDataManagement = ({
  truckList, supirList, ruteList, materialList, pelangganList = [], currentUser,
  onAddTruck, onEditTruck, onDeleteTruck,
  onAddSupir, onEditSupir, onDeleteSupir,
  onAddRute, onEditRute, onDeleteRute,
  onAddMaterial, onEditMaterial, onDeleteMaterial,
  onAddPelanggan, onEditPelanggan, onDeletePelanggan, onMigratePelanggan,
  onDownloadTemplate, onImportData
}) => {
  const [masterTab, setMasterTab] = useState('truck');
  const [alertMessage, setAlertMessage] = useState('');
  const [searchTruck, setSearchTruck] = useState('');
  const [searchSupir, setSearchSupir] = useState('');
  const [searchRute, setSearchRute] = useState('');
  const [searchMaterial, setSearchMaterial] = useState('');
  const [searchPelanggan, setSearchPelanggan] = useState('');

  const filteredTruck = useSearchFilter(truckList, searchTruck, TRUCK_SEARCH_FIELDS);
  const filteredSupir = useSearchFilter(supirList, searchSupir, SUPIR_SEARCH_FIELDS);
  const filteredRute = useSearchFilter(ruteList, searchRute, RUTE_SEARCH_FIELDS);
  const filteredMaterial = useSearchFilter(materialList, searchMaterial, MATERIAL_SEARCH_FIELDS);
  const filteredPelanggan = useSearchFilter(pelangganList, searchPelanggan, PELANGGAN_SEARCH_FIELDS);

  const handleFileUpload = (e, type) => {
    const file = e.target.files[0];
    if (file) {
      if (!file.name.endsWith('.csv')) {
        setAlertMessage('Format file harus CSV!');
        return;
      }
      onImportData(type, file);
      e.target.value = ''; // Reset input
    }
  };

  return (
    <div>
      {/* Sub Tab Navigation */}
      <div className="bg-white rounded-lg shadow-md p-2 mb-6 flex gap-2">
        <button
          onClick={() => setMasterTab('truck')}
          className={`flex-1 px-4 py-2 rounded-lg transition ${masterTab === 'truck' ? 'bg-green-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
        >
          <span>🚛 Truck</span>
        </button>
        <button
          onClick={() => setMasterTab('supir')}
          className={`flex-1 px-4 py-2 rounded-lg transition ${masterTab === 'supir' ? 'bg-green-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
        >
          <span>👨‍✈️ Supir</span>
        </button>
        <button
          onClick={() => setMasterTab('rute')}
          className={`flex-1 px-4 py-2 rounded-lg transition ${masterTab === 'rute' ? 'bg-green-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
        >
          <span>🗺️ Rute</span>
        </button>
        <button
          onClick={() => setMasterTab('material')}
          className={`flex-1 px-4 py-2 rounded-lg transition ${masterTab === 'material' ? 'bg-green-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
        >
          <span>📦 Material</span>
        </button>
        <button
          onClick={() => setMasterTab('pelanggan')}
          className={`flex-1 px-4 py-2 rounded-lg transition ${masterTab === 'pelanggan' ? 'bg-green-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
        >
          <span>🏢 Pelanggan</span>
        </button>
      </div>

      {/* Truck Master Data */}
      {masterTab === 'truck' && (
        <div>
          <div className="bg-white rounded-lg shadow-md p-4 mb-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-gray-800">Master Data Truck</h2>
                <p className="text-sm text-gray-600">
                  Total: {truckList.length} truck
                  {searchTruck && ` · ${filteredTruck.length} cocok`}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => onDownloadTemplate('truck')}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition"
                >
                  <FileText className="w-4 h-4" />
                  <span>Download Template</span>
                </button>
                <label className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition cursor-pointer">
                  <Plus className="w-4 h-4" />
                  <span>Import CSV</span>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => handleFileUpload(e, 'truck')}
                    className="hidden"
                  />
                </label>
                <button
                  onClick={onAddTruck}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tambah Truck</span>
                </button>
              </div>
            </div>
          </div>

          {truckList.length > 0 && (
            <div className="mb-4">
              <SearchInput
                value={searchTruck}
                onChange={setSearchTruck}
                placeholder="Cari nomor polisi..."
              />
            </div>
          )}

          <div className="space-y-3">
            {truckList.length === 0 ? (
              <div className="bg-white rounded-lg shadow-md p-8 text-center">
                <Truck className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">Belum ada data truck</p>
              </div>
            ) : filteredTruck.length === 0 ? (
              <div className="bg-white rounded-lg shadow-md p-8 text-center">
                <Truck className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">Tidak ada truck yang cocok dengan pencarian.</p>
              </div>
            ) : (
              filteredTruck.map(truck => (
                <div key={truck.id} className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <h3 className="text-lg font-bold text-gray-800">{truck.nomorPolisi}</h3>
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          truck.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {truck.isActive ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600">Truck ID: {truck.id}</p>
                      {truck.createdBy && (
                        <p className="text-xs text-gray-500 mt-2">
                          Dibuat oleh: {truck.createdBy} pada {new Date(truck.createdAt).toLocaleString('id-ID')}
                        </p>
                      )}
                    </div>
                    <div className="flex space-x-2 ml-4">
                      <button
                        onClick={() => onEditTruck(truck)}
                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1"
                      >
                        <Edit className="w-4 h-4" />
                        <span>Edit</span>
                      </button>
                      <button
                        onClick={() => onDeleteTruck(truck.id)}
                        className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Hapus</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Supir Master Data */}
      {masterTab === 'supir' && (
        <div>
          <div className="bg-white rounded-lg shadow-md p-4 mb-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-gray-800">Master Data Supir</h2>
                <p className="text-sm text-gray-600">
                  Total: {supirList.length} supir
                  {searchSupir && ` · ${filteredSupir.length} cocok`}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => onDownloadTemplate('supir')}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition"
                >
                  <FileText className="w-4 h-4" />
                  <span>Download Template</span>
                </button>
                <label className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition cursor-pointer">
                  <Plus className="w-4 h-4" />
                  <span>Import CSV</span>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => handleFileUpload(e, 'supir')}
                    className="hidden"
                  />
                </label>
                <button
                  onClick={onAddSupir}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tambah Supir</span>
                </button>
              </div>
            </div>
          </div>

          {supirList.length > 0 && (
            <div className="mb-4">
              <SearchInput
                value={searchSupir}
                onChange={setSearchSupir}
                placeholder="Cari nama supir atau PT..."
              />
            </div>
          )}

          <div className="space-y-3">
            {supirList.length === 0 ? (
              <div className="bg-white rounded-lg shadow-md p-8 text-center">
                <Users className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">Belum ada data supir</p>
              </div>
            ) : filteredSupir.length === 0 ? (
              <div className="bg-white rounded-lg shadow-md p-8 text-center">
                <Users className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">Tidak ada supir yang cocok dengan pencarian.</p>
              </div>
            ) : (
              filteredSupir.map(supir => (
                <div key={supir.id} className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <h3 className="text-lg font-bold text-gray-800">{supir.namaSupir}</h3>
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          supir.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {supir.isActive ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm mt-2">
                        <div>
                          <p className="text-gray-600">Supir ID:</p>
                          <p className="font-semibold text-gray-800">{supir.id}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">PT:</p>
                          <p className="font-semibold text-gray-800">{supir.pt}</p>
                        </div>
                      </div>
                      {supir.createdBy && (
                        <p className="text-xs text-gray-500 mt-2">
                          Dibuat oleh: {supir.createdBy} pada {new Date(supir.createdAt).toLocaleString('id-ID')}
                        </p>
                      )}
                    </div>
                    <div className="flex space-x-2 ml-4">
                      <button
                        onClick={() => onEditSupir(supir)}
                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1"
                      >
                        <Edit className="w-4 h-4" />
                        <span>Edit</span>
                      </button>
                      <button
                        onClick={() => onDeleteSupir(supir.id)}
                        className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Hapus</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Rute Master Data */}
      {masterTab === 'rute' && (
        <div>
          <div className="bg-white rounded-lg shadow-md p-4 mb-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-gray-800">Master Data Rute</h2>
                <p className="text-sm text-gray-600">
                  Total: {ruteList.length} rute
                  {searchRute && ` · ${filteredRute.length} cocok`}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => onDownloadTemplate('rute')}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition"
                >
                  <FileText className="w-4 h-4" />
                  <span>Download Template</span>
                </button>
                <label className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition cursor-pointer">
                  <Plus className="w-4 h-4" />
                  <span>Import CSV</span>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => handleFileUpload(e, 'rute')}
                    className="hidden"
                  />
                </label>
                <button
                  onClick={onAddRute}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tambah Rute</span>
                </button>
              </div>
            </div>
          </div>

          {ruteList.length > 0 && (
            <div className="mb-4">
              <SearchInput
                value={searchRute}
                onChange={setSearchRute}
                placeholder="Cari nama rute..."
              />
            </div>
          )}

          <div className="space-y-3">
            {ruteList.length === 0 ? (
              <div className="bg-white rounded-lg shadow-md p-8 text-center">
                <Package className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">Belum ada data rute</p>
              </div>
            ) : filteredRute.length === 0 ? (
              <div className="bg-white rounded-lg shadow-md p-8 text-center">
                <FileText className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">Tidak ada rute yang cocok dengan pencarian.</p>
              </div>
            ) : (
              filteredRute.map(rute => (
                <div key={rute.id} className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-gray-800 mb-2">{rute.rute}</h3>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-gray-600">Rute ID:</p>
                          <p className="font-semibold text-gray-800">{rute.id}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Uang Jalan:</p>
                          <p className="font-semibold text-green-600">{formatCurrency(rute.uangJalan)}</p>
                        </div>
                      </div>
                      {rute.createdBy && (
                        <p className="text-xs text-gray-500 mt-2">
                          Dibuat oleh: {rute.createdBy} pada {new Date(rute.createdAt).toLocaleString('id-ID')}
                        </p>
                      )}
                    </div>
                    <div className="flex space-x-2 ml-4">
                      <button
                        onClick={() => onEditRute(rute)}
                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1"
                      >
                        <Edit className="w-4 h-4" />
                        <span>Edit</span>
                      </button>
                      <button
                        onClick={() => onDeleteRute(rute.id)}
                        className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Hapus</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Material Master Data */}
      {masterTab === 'material' && (
        <div>
          <div className="bg-white rounded-lg shadow-md p-4 mb-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-gray-800">Master Data Material</h2>
                <p className="text-sm text-gray-600">
                  Total: {materialList.length} material
                  {searchMaterial && ` · ${filteredMaterial.length} cocok`}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => onDownloadTemplate('material')}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition"
                >
                  <FileText className="w-4 h-4" />
                  <span>Download Template</span>
                </button>
                <label className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition cursor-pointer">
                  <Plus className="w-4 h-4" />
                  <span>Import CSV</span>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => handleFileUpload(e, 'material')}
                    className="hidden"
                  />
                </label>
                <button
                  onClick={onAddMaterial}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tambah Material</span>
                </button>
              </div>
            </div>
          </div>

          {materialList.length > 0 && (
            <div className="mb-4">
              <SearchInput
                value={searchMaterial}
                onChange={setSearchMaterial}
                placeholder="Cari nama material atau satuan..."
              />
            </div>
          )}

          <div className="space-y-3">
            {materialList.length === 0 ? (
              <div className="bg-white rounded-lg shadow-md p-8 text-center">
                <Package className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">Belum ada data material</p>
              </div>
            ) : filteredMaterial.length === 0 ? (
              <div className="bg-white rounded-lg shadow-md p-8 text-center">
                <Package className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">Tidak ada material yang cocok dengan pencarian.</p>
              </div>
            ) : (
              filteredMaterial.map(material => (
                <div key={material.id} className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-gray-800 mb-2">{material.material}</h3>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-gray-600">Material ID:</p>
                          <p className="font-semibold text-gray-800">{material.id}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Satuan:</p>
                          <p className="font-semibold text-gray-800">{material.satuan}</p>
                        </div>
                      </div>
                      {material.createdBy && (
                        <p className="text-xs text-gray-500 mt-2">
                          Dibuat oleh: {material.createdBy} pada {new Date(material.createdAt).toLocaleString('id-ID')}
                        </p>
                      )}
                    </div>
                    <div className="flex space-x-2 ml-4">
                      <button
                        onClick={() => onEditMaterial(material)}
                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1"
                      >
                        <Edit className="w-4 h-4" />
                        <span>Edit</span>
                      </button>
                      <button
                        onClick={() => onDeleteMaterial(material.id)}
                        className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Hapus</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Pelanggan Master Data */}
      {masterTab === 'pelanggan' && (
        <div>
          <div className="bg-white rounded-lg shadow-md p-4 mb-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-gray-800">Master Data Pelanggan</h2>
                <p className="text-sm text-gray-600">
                  Total: {pelangganList.length} pelanggan
                  {searchPelanggan && ` · ${filteredPelanggan.length} cocok`}
                </p>
              </div>
              <div className="flex gap-2">
                {pelangganList.length === 0 && (
                  <button
                    onClick={onMigratePelanggan}
                    className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition text-sm"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Import dari Data Supir</span>
                  </button>
                )}
                <button
                  onClick={onAddPelanggan}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tambah Pelanggan</span>
                </button>
              </div>
            </div>
          </div>

          {pelangganList.length > 0 && (
            <div className="mb-4">
              <SearchInput
                value={searchPelanggan}
                onChange={setSearchPelanggan}
                placeholder="Cari nama pelanggan, alamat, atau NPWP..."
              />
            </div>
          )}

          <div className="space-y-3">
            {pelangganList.length === 0 ? (
              <div className="bg-white rounded-lg shadow-md p-8 text-center">
                <Package className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500 mb-2">Belum ada data pelanggan</p>
                <p className="text-sm text-gray-400">Klik "Import dari Data Supir" untuk mengisi otomatis dari data PT supir yang sudah ada.</p>
              </div>
            ) : filteredPelanggan.length === 0 ? (
              <div className="bg-white rounded-lg shadow-md p-8 text-center">
                <Users className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">Tidak ada pelanggan yang cocok dengan pencarian.</p>
              </div>
            ) : (
              filteredPelanggan.map(pelanggan => (
                <div key={pelanggan.id} className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <h3 className="text-lg font-bold text-gray-800">{pelanggan.name}</h3>
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${pelanggan.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {pelanggan.isActive ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm mt-2">
                        <div>
                          <p className="text-gray-600">Alamat:</p>
                          <p className="font-medium text-gray-800">{pelanggan.address || '-'}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">NPWP:</p>
                          <p className="font-medium font-mono text-gray-800">{pelanggan.npwp || '-'}</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex space-x-2 ml-4">
                      <button
                        onClick={() => onEditPelanggan(pelanggan)}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg flex items-center space-x-1 transition text-sm"
                      >
                        <Edit className="w-4 h-4" />
                        <span>Edit</span>
                      </button>
                      <button
                        onClick={() => onDeletePelanggan(pelanggan.id)}
                        className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-lg flex items-center space-x-1 transition text-sm"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Hapus</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MasterDataManagement;
