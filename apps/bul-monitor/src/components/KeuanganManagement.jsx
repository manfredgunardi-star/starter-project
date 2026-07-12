import { useState } from 'react';
import { DollarSign, Lock, Plus, Send, Trash2 } from 'lucide-react';
import { formatCurrency } from '../utils/formatters.js';

const KeuanganManagement = ({ transaksiList, suratJalanList, currentUser, onAddTransaksi, onDeleteTransaksi, onKirimTransaksiKeAccounting }) => {
  const effectiveRole = currentUser?.role === 'owner' ? 'reader' : currentUser?.role;

  const [filter, setFilter] = useState('all');
  const [filterPT, setFilterPT] = useState('');
  
  // Default: hanya tampilkan transaksi yang masih aktif
  const activeTransaksi = (Array.isArray(transaksiList) ? transaksiList : [])
    .filter(t => t?.isActive !== false && !t?.deletedAt);

  // Get unique PT list
  const ptList = [...new Set(activeTransaksi.map(t => t.pt).filter(Boolean))].sort();
  
  const filteredTransaksi = activeTransaksi.filter(t => {
    if (filter !== 'all' && t.tipe !== filter) return false;
    if (filterPT && t.pt !== filterPT) return false;
    return true;
  });

  const totalPemasukan = activeTransaksi
    .filter(t => t.tipe === 'pemasukan' && (!filterPT || t.pt === filterPT))
    .reduce((sum, t) => sum + parseFloat(t.nominal || 0), 0);
  
  const totalPengeluaran = activeTransaksi
    .filter(t => t.tipe === 'pengeluaran' && (!filterPT || t.pt === filterPT))
    .reduce((sum, t) => sum + parseFloat(t.nominal || 0), 0);
  
  const saldoKas = totalPemasukan - totalPengeluaran;

  const canAddTransaksi = effectiveRole === 'superadmin' || effectiveRole === 'admin_keuangan';

  return (
    <div>
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm">Total Pemasukan</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{formatCurrency(totalPemasukan)}</p>
            </div>
            <div className="bg-green-500 p-3 rounded-lg text-white">
              <DollarSign className="w-6 h-6" />
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm">Total Pengeluaran</p>
              <p className="text-2xl font-bold text-red-600 mt-1">{formatCurrency(totalPengeluaran)}</p>
            </div>
            <div className="bg-red-500 p-3 rounded-lg text-white">
              <DollarSign className="w-6 h-6" />
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm">Saldo Kas</p>
              <p className={`text-2xl font-bold mt-1 ${saldoKas >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(saldoKas)}
              </p>
            </div>
            <div className="bg-green-500 p-3 rounded-lg text-white">
              <DollarSign className="w-6 h-6" />
            </div>
          </div>
        </div>
      </div>

      {/* Actions & Filters */}
      <div className="bg-white rounded-lg shadow-md p-4 mb-6">
        <div className="flex justify-between items-center mb-3">
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg transition ${filter === 'all' ? 'bg-green-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
            >
              Semua
            </button>
            <button
              onClick={() => setFilter('pemasukan')}
              className={`px-4 py-2 rounded-lg transition ${filter === 'pemasukan' ? 'bg-green-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
            >
              Pemasukan
            </button>
            <button
              onClick={() => setFilter('pengeluaran')}
              className={`px-4 py-2 rounded-lg transition ${filter === 'pengeluaran' ? 'bg-red-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
            >
              Pengeluaran
            </button>
          </div>
          {canAddTransaksi && (
            <button
              onClick={onAddTransaksi}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Transaksi</span>
            </button>
          )}
        </div>
        
        {/* Filter PT */}
        {ptList.length > 0 && (
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Filter PT:</label>
            <select
              value={filterPT}
              onChange={(e) => setFilterPT(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 text-sm"
            >
              <option value="">Semua PT</option>
              {ptList.map(pt => (
                <option key={pt} value={pt}>{pt}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Transaksi List */}
      <div className="space-y-3">
        {filteredTransaksi.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <DollarSign className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500">Belum ada transaksi</p>
          </div>
        ) : (
          filteredTransaksi.map(transaksi => (
            <div key={transaksi.id} className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <h3 className="text-lg font-bold text-gray-800">{transaksi.keterangan}</h3>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      transaksi.tipe === 'pemasukan' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {transaksi.tipe === 'pemasukan' ? 'Pemasukan' : 'Pengeluaran'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-600">Nominal:</p>
                      <p className={`font-bold text-lg ${
                        transaksi.tipe === 'pemasukan' ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {transaksi.tipe === 'pemasukan' ? '+' : '-'} {formatCurrency(transaksi.nominal)}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-600">Tanggal:</p>
                      <p className="font-semibold text-gray-800">
                        {new Date(transaksi.tanggal).toLocaleDateString('id-ID')}
                      </p>
                    </div>
                    {transaksi.pt && (
                      <div className="col-span-2">
                        <p className="text-gray-600">PT:</p>
                        <p className="font-bold text-green-600">{transaksi.pt}</p>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Dibuat oleh: {transaksi.createdBy} pada {new Date(transaksi.createdAt).toLocaleString('id-ID')}
                  </p>
                </div>
                
                <div className="ml-4 flex flex-col gap-2 items-end">
                  {/* Badge status integrasi */}
                  {transaksi.integrationStatus === 'menunggu_review' && (
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold flex items-center gap-1">
                      <Send className="w-3 h-3" /> Menunggu Review Akuntan
                    </span>
                  )}
                  {transaksi.integrationStatus === 'terkunci' && (
                    <span className="px-2 py-1 bg-gray-200 text-gray-600 rounded-full text-xs font-semibold flex items-center gap-1">
                      <Lock className="w-3 h-3" /> Sudah Masuk Accounting
                    </span>
                  )}
                  {/* Tombol kirim — hanya untuk manual, superadmin, belum terkunci, bukan SJ */}
                  {effectiveRole === 'superadmin' &&
                   transaksi.source !== 'auto_sj' &&
                   !transaksi.suratJalanId &&
                   !transaksi.integrationStatus &&
                   onKirimTransaksiKeAccounting && (
                    <button
                      onClick={() => onKirimTransaksiKeAccounting(transaksi)}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs transition flex items-center space-x-1"
                    >
                      <Send className="w-3 h-3" />
                      <span>Kirim ke Accounting</span>
                    </button>
                  )}
                  {canAddTransaksi && transaksi.integrationStatus !== 'terkunci' && (
                    <button
                      onClick={() => onDeleteTransaksi(transaksi.id)}
                      className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-xs transition flex items-center space-x-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Hapus</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default KeuanganManagement;
