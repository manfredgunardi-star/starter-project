import { useEffect, useMemo, useState } from 'react';
import { DollarSign, Plus, Trash2 } from 'lucide-react';
import { formatCurrency } from '../utils/currency.js';
import Pagination, { PAGE_SIZE, clampPage } from '../components/Pagination.jsx';
import StatSummary from '../components/StatSummary.jsx';

export default function KeuanganManagement({ transaksiList, currentUser, onAddTransaksi, onDeleteTransaksi }) {
  const effectiveRole = currentUser?.role === 'owner' ? 'reader' : currentUser?.role;

  const [filter, setFilter] = useState('all');
  const [filterPT, setFilterPT] = useState('');

  const activeTransaksiList = useMemo(
    () => (Array.isArray(transaksiList) ? transaksiList : []).filter(
      (t) => t?.isActive !== false && !t?.deletedAt
    ),
    [transaksiList]
  );

  // Get unique PT list
  const ptList = useMemo(
    () => [...new Set(activeTransaksiList.map(t => t.pt).filter(Boolean))].sort(),
    [activeTransaksiList]
  );

  const filteredTransaksi = useMemo(
    () => activeTransaksiList.filter(t => {
      if (filter !== 'all' && t.tipe !== filter) return false;
      if (filterPT && t.pt !== filterPT) return false;
      return true;
    }),
    [activeTransaksiList, filter, filterPT]
  );
  const [keuPage, setKeuPage] = useState(1);
  useEffect(() => { setKeuPage(1); }, [filter, filterPT]);
  const safeKeuPage = clampPage(keuPage, filteredTransaksi.length);
  const pagedTransaksi = filteredTransaksi.slice((safeKeuPage - 1) * PAGE_SIZE, safeKeuPage * PAGE_SIZE);

  const totalPemasukan = useMemo(
    () => activeTransaksiList
      .filter(t => t.tipe === 'pemasukan' && (!filterPT || t.pt === filterPT))
      .reduce((sum, t) => sum + parseFloat(t.nominal || 0), 0),
    [activeTransaksiList, filterPT]
  );

  const totalPengeluaran = useMemo(
    () => activeTransaksiList
      .filter(t => t.tipe === 'pengeluaran' && (!filterPT || t.pt === filterPT))
      .reduce((sum, t) => sum + parseFloat(t.nominal || 0), 0),
    [activeTransaksiList, filterPT]
  );

  const saldoKas = totalPemasukan - totalPengeluaran;

  const canAddTransaksi = effectiveRole === 'superadmin' || effectiveRole === 'admin_keuangan';

  return (
    <div>
      <StatSummary
        title="Kas"
        stats={[
          { label: 'Pemasukan', value: formatCurrency(totalPemasukan), color: '#34c759' },
          { label: 'Pengeluaran', value: formatCurrency(totalPengeluaran), color: '#ff3b30' },
          { label: 'Saldo', value: formatCurrency(saldoKas), color: saldoKas >= 0 ? '#007aff' : '#ff3b30' },
        ]}
      />

      {/* Actions & Filters */}
      <div className="bg-white rounded-lg shadow-md p-4 mb-6">
        <div className="flex flex-wrap gap-2 items-center mb-3">
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-sm transition ${filter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
            >
              Semua
            </button>
            <button
              onClick={() => setFilter('pemasukan')}
              className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-sm transition ${filter === 'pemasukan' ? 'bg-green-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
            >
              Pemasukan
            </button>
            <button
              onClick={() => setFilter('pengeluaran')}
              className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-sm transition ${filter === 'pengeluaran' ? 'bg-red-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
            >
              Pengeluaran
            </button>
          </div>
          {canAddTransaksi && (
            <button
              onClick={onAddTransaksi}
              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg flex items-center space-x-2 text-sm transition ml-auto"
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
              className="px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
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
          pagedTransaksi.map(transaksi => (
            <div key={transaksi.id} className="bg-white rounded-lg shadow-md p-3 sm:p-6 hover:shadow-lg transition">
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
                        <p className="font-bold text-blue-600">{transaksi.pt}</p>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Dibuat oleh: {transaksi.createdBy} pada {new Date(transaksi.createdAt).toLocaleString('id-ID')}
                  </p>
                </div>

                {canAddTransaksi && (
                  <button
                    onClick={() => onDeleteTransaksi(transaksi.id)}
                    className="ml-4 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Hapus</span>
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
      <Pagination total={filteredTransaksi.length} page={safeKeuPage} onChange={setKeuPage} />
    </div>
  );
}
