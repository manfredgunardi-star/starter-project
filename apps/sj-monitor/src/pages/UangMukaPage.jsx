import { useEffect, useMemo, useState } from 'react';
import { DollarSign, FileText, Package, Plus, Search, Trash2, XCircle } from 'lucide-react';
import Pagination, { PAGE_SIZE, clampPage } from '../components/Pagination.jsx';

export default function UangMukaManagement({
  uangMukaList,
  suratJalanList,
  currentUser,
  onAddUangMuka,
  onDeleteUangMuka,
  formatCurrency
}) {
  const [searchUM, setSearchUM] = useState('');
  const effectiveRole = (currentUser?.role === 'owner' ? 'reader' : currentUser?.role) || 'reader';

  const canManageUM = () => {
    return effectiveRole === 'superadmin' || effectiveRole === 'admin_invoice';
  };

  const umBySJ = useMemo(() => {
    const map = {};
    uangMukaList.forEach(um => {
      if (!map[um.sjId]) map[um.sjId] = [];
      map[um.sjId].push(um);
    });
    return map;
  }, [uangMukaList]);

  const filteredUM = useMemo(() =>
    uangMukaList.filter(um => {
      if (!searchUM) return true;
      const search = searchUM.toLowerCase();
      return (
        (um.nomorSJ || '').toLowerCase().includes(search) ||
        (um.keterangan || '').toLowerCase().includes(search)
      );
    }),
    [uangMukaList, searchUM]
  );
  const [umPage, setUmPage] = useState(1);
  useEffect(() => { setUmPage(1); }, [searchUM]);
  const safeUMPage = clampPage(umPage, filteredUM.length);
  const pagedUM = filteredUM.slice((safeUMPage - 1) * PAGE_SIZE, safeUMPage * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-md p-3 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">💰 Uang Muka</h2>
            <p className="text-gray-600 mt-1">Kelola Uang Muka (Advance Payment) per Surat Jalan</p>
          </div>
          {canManageUM() && (
            <button
              onClick={onAddUangMuka}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Uang Muka</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow-md p-3 sm:p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-100 text-sm mb-1">Total Entri</p>
                <p className="text-3xl font-bold">{uangMukaList.length}</p>
              </div>
              <FileText className="w-12 h-12 text-blue-200" />
            </div>
          </div>
          <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg shadow-md p-3 sm:p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-100 text-sm mb-1">Total Uang Muka</p>
                <p className="text-2xl font-bold">{formatCurrency(uangMukaList.reduce((sum, um) => sum + (um.jumlah || 0), 0))}</p>
              </div>
              <DollarSign className="w-12 h-12 text-green-200" />
            </div>
          </div>
          <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg shadow-md p-3 sm:p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-orange-100 text-sm mb-1">SJ Terkait</p>
                <p className="text-3xl font-bold">{Object.keys(umBySJ).length}</p>
              </div>
              <Package className="w-12 h-12 text-orange-200" />
            </div>
          </div>
        </div>

        <div className="mb-4">
          <div className="relative">
            <input
              type="text"
              placeholder="Cari Nomor SJ atau Keterangan..."
              value={searchUM}
              onChange={(e) => setSearchUM(e.target.value)}
              className="w-full px-3 py-2 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <Search className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" />
            {searchUM && (
              <button
                onClick={() => setSearchUM('')}
                className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
              >
                <XCircle className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {filteredUM.length === 0 ? (
          <div className="text-center py-12">
            <DollarSign className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <p className="text-lg font-semibold text-gray-600 mb-2">
              {searchUM ? 'Tidak ada data yang cocok' : 'Belum Ada Uang Muka'}
            </p>
            <p className="text-sm text-gray-500">
              {searchUM ? 'Coba kata kunci lain' : 'Tambahkan uang muka untuk Surat Jalan'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-2 py-2 sm:px-4 text-left text-xs font-medium text-gray-500 uppercase">No SJ</th>
                  <th className="px-2 py-2 sm:px-4 text-left text-xs font-medium text-gray-500 uppercase">Tanggal</th>
                  <th className="px-2 py-2 sm:px-4 text-right text-xs font-medium text-gray-500 uppercase">Jumlah</th>
                  <th className="px-2 py-2 sm:px-4 text-left text-xs font-medium text-gray-500 uppercase">Keterangan</th>
                  <th className="px-2 py-2 sm:px-4 text-left text-xs font-medium text-gray-500 uppercase">Dibuat Oleh</th>
                  {canManageUM() && (
                    <th className="px-2 py-2 sm:px-4 text-center text-xs font-medium text-gray-500 uppercase">Aksi</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {pagedUM.map((um) => (
                  <tr key={um.id} className="hover:bg-gray-50">
                    <td className="px-2 py-2 sm:px-4 text-xs sm:text-sm font-medium text-blue-600">{um.nomorSJ}</td>
                    <td className="px-2 py-2 sm:px-4 text-xs sm:text-sm text-gray-900">
                      {um.tanggal ? new Date(um.tanggal).toLocaleDateString('id-ID') : '-'}
                    </td>
                    <td className="px-2 py-2 sm:px-4 text-xs sm:text-sm text-gray-900 text-right font-semibold">
                      {formatCurrency(um.jumlah)}
                    </td>
                    <td className="px-2 py-2 sm:px-4 text-xs sm:text-sm text-gray-600">{um.keterangan || '-'}</td>
                    <td className="px-2 py-2 sm:px-4 text-xs sm:text-sm text-gray-600">{um.createdBy}</td>
                    {canManageUM() && (
                      <td className="px-2 py-2 sm:px-4 text-center">
                        <button
                          onClick={() => onDeleteUangMuka(um.id)}
                          className="text-red-600 hover:text-red-800 transition"
                          title="Hapus"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-100 font-bold">
                  <td colSpan="2" className="px-2 py-2 sm:px-4 text-xs sm:text-sm text-gray-900 text-right">TOTAL:</td>
                  <td className="px-2 py-2 sm:px-4 text-xs sm:text-sm text-gray-900 text-right">
                    {formatCurrency(filteredUM.reduce((sum, um) => sum + (um.jumlah || 0), 0))}
                  </td>
                  <td colSpan={canManageUM() ? 3 : 2}></td>
                </tr>
              </tfoot>
            </table>
            <Pagination total={filteredUM.length} page={safeUMPage} onChange={setUmPage} />
          </div>
        )}
      </div>
    </div>
  );
}
