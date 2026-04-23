import { collection, doc, writeBatch, onSnapshot, getDoc, setDoc, updateDoc, getDocs, query, where } from "firebase/firestore";
import { db, auth, ensureAuthed, createUserWithRoleFn } from "./config/firebase-config";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import React, { useState, useEffect, useRef, useCallback, useMemo, Suspense } from 'react';
import { formatCurrency, formatTanggalID } from './utils/currency.js';
import { isSJTerinvoice, isSJBelumInvoice, mergeById } from './utils/sjHelpers.js';
import { calculateSJPenalty } from './utils/payslipHelpers.js';
import { downloadSJRecapToExcel } from './utils/excel.js';
import { useAuth } from './hooks/useAuth.js';
import { useMasterData } from './hooks/useMasterData.js';
import { useUsers } from './hooks/useUsers.js';
import { useSettings } from './hooks/useSettings.js';
import SearchableSelect from './components/SearchableSelect.jsx';
import StatCard from './components/StatCard.jsx';
import AlertBanner from './components/AlertBanner.jsx';
import SuratJalanCard from './components/SuratJalanCard.jsx';
import LoginPage from './pages/LoginPage.jsx';
const LaporanKasPage   = React.lazy(() => import('./pages/LaporanKasPage.jsx'));
const LaporanTrukPage  = React.lazy(() => import('./pages/LaporanTrukPage.jsx'));
const PayslipReport    = React.lazy(() => import('./components/PayslipReport.jsx'));
const RitasiBulkUpload = React.lazy(() => import('./components/RitasiBulkUpload.jsx'));
import {
  sanitizeForFirestore,
  upsertItemToFirestore,
  softDeleteItemInFirestore,
  resolveSuratJalanDocRef,
} from './firestoreService.js';



import { AlertCircle, Package, Truck, FileText, DollarSign, Users, Settings, Database, LogOut, Plus, Edit, Trash2, Eye, CheckCircle, XCircle, Clock, Search, RefreshCw } from 'lucide-react';
import TopBar from './components/TopBar.jsx';
import DockNav from './components/DockNav.jsx';


// Returns ISO date string for the 1st of the month, 12 months ago
const getQueryStartISO = () => {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() - 12; // 0-indexed
  if (month < 0) { month += 12; year -= 1; }
  return `${year}-${String(month + 1).padStart(2, '0')}-01`;
};

// Compact status badge for table rows
const STATUS_BADGE_STYLES = {
  'dalam perjalanan': 'bg-orange-50 text-orange-600',
  'terkirim':         'bg-green-50 text-green-600',
  'gagal':            'bg-red-50 text-red-600',
  'pending':          'bg-slate-100 text-slate-500',
};

const StatusBadge = ({ status }) => (
  <span className={`inline-block rounded-lg px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap ${STATUS_BADGE_STYLES[status?.toLowerCase()] ?? 'bg-slate-100 text-slate-500'}`}>
    {status ?? '—'}
  </span>
);

// Invoice Management Component
const InvoiceManagement = ({
  invoiceList, 
  suratJalanList, 
  currentUser,
  onAddInvoice,
  onDeleteInvoice,
  formatCurrency 
}) => {
  const [activeFilter, setActiveFilter] = useState('belum-terinvoice');
  const effectiveRole = (currentUser?.role === 'owner' ? 'reader' : currentUser?.role) || 'reader';

  
  const canManageInvoice = () => {
    return effectiveRole === 'superadmin' || effectiveRole === 'admin_invoice';
  };
  
  const sjBelumTerinvoice = useMemo(
    () => suratJalanList.filter((sj) => isSJBelumInvoice(sj)),
    [suratJalanList]
  );

  const sjTerinvoice = useMemo(
    () => suratJalanList.filter((sj) =>
      String(sj?.status || '').toLowerCase() === 'terkirim' && isSJTerinvoice(sj)
    ),
    [suratJalanList]
  );

  const filteredSJ = activeFilter === 'belum-terinvoice' ? sjBelumTerinvoice : sjTerinvoice;
  
  // Escape CSV cell values untuk mencegah CSV Injection (formula injection di Excel/Sheets)
  const escapeCsvValue = (val) => {
    const str = val == null ? '' : String(val);
    if (/^[=+\-@\t\r]/.test(str)) return `'${str}`;
    if (str.includes(';') || str.includes('\n') || str.includes('"')) return `"${str.replace(/"/g, '""')}"`;
    return str;
  };

  // Export to Excel function
  const exportInvoiceToExcel = (invoice) => {
    const headers = ['No SJ', 'Tgl SJ', 'No. Polisi', 'Nama Supir', 'Rute', 'Material', 'Qty Bongkar', 'Harga/Qty', 'Subtotal', 'Satuan'];
    const rows = invoice.suratJalanList.map(sj => {
      const hargaPerQty = Number(invoice.ruteHarga?.[sj.rute] || 0);
      const subtotal = Number(sj.qtyBongkar || 0) * hargaPerQty;
      return [
        sj.nomorSJ,
        new Date(sj.tanggalSJ).toLocaleDateString('id-ID'),
        sj.nomorPolisi,
        sj.namaSupir,
        sj.rute,
        sj.material,
        sj.qtyBongkar,
        formatCurrency(hargaPerQty),
        formatCurrency(subtotal),
        sj.satuan
      ];
    });

    const totalHarga = invoice.totalHarga || 0;
    const totalUM = invoice.totalUM || 0;
    const totalHargaAfterUM = invoice.totalHargaAfterUM ?? (totalHarga - totalUM);

    let csvContent = headers.join(';') + '\n';
    rows.forEach(row => {
      csvContent += row.map(escapeCsvValue).join(';') + '\n';
    });
    csvContent += `\nTOTAL;;;;;${invoice.totalQty.toFixed(2)};;${escapeCsvValue(formatCurrency(totalHarga))};;`;
    csvContent += `\nUang Muka;;;;;;;;${escapeCsvValue('- ' + formatCurrency(totalUM))};`;
    csvContent += `\nNett (setelah UM);;;;;;;;${escapeCsvValue(formatCurrency(totalHargaAfterUM))};`;
    
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `Invoice_${invoice.noInvoice.replace(/\//g, '-')}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-md p-3 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">📄 Invoice Management</h2>
            <p className="text-gray-600 mt-1">Kelola Invoice untuk Surat Jalan Terkirim</p>
          </div>
          {canManageInvoice() && sjBelumTerinvoice.length > 0 && (
            <button
              onClick={onAddInvoice}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition"
            >
              <Plus className="w-4 h-4" />
              <span>Buat Invoice Baru</span>
            </button>
          )}
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={() => setActiveFilter('belum-terinvoice')}
            className={`flex-1 px-4 py-2 rounded-lg transition flex items-center justify-center gap-2 ${
              activeFilter === 'belum-terinvoice'
                ? 'bg-orange-600 text-white'
                : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span className="font-semibold">Belum Terinvoice</span>
            <span className="px-2 py-1 bg-white bg-opacity-30 rounded-full text-sm">
              {sjBelumTerinvoice.length}
            </span>
          </button>
          <button
            onClick={() => setActiveFilter('terinvoice')}
            className={`flex-1 px-4 py-2 rounded-lg transition flex items-center justify-center gap-2 ${
              activeFilter === 'terinvoice'
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            <CheckCircle className="w-4 h-4" />
            <span className="font-semibold">Sudah Terinvoice</span>
            <span className="px-2 py-1 bg-white bg-opacity-30 rounded-full text-sm">
              {invoiceList.length}
            </span>
          </button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow-md p-3 sm:p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm mb-1">Total Invoice</p>
              <p className="text-3xl font-bold">{invoiceList.length}</p>
            </div>
            <FileText className="w-12 h-12 text-blue-200" />
          </div>
        </div>
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg shadow-md p-3 sm:p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-orange-100 text-sm mb-1">Belum Terinvoice</p>
              <p className="text-3xl font-bold">{sjBelumTerinvoice.length}</p>
            </div>
            <Package className="w-12 h-12 text-orange-200" />
          </div>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg shadow-md p-3 sm:p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-100 text-sm mb-1">Sudah Terinvoice</p>
              <p className="text-3xl font-bold">{sjTerinvoice.length}</p>
            </div>
            <CheckCircle className="w-12 h-12 text-green-200" />
          </div>
        </div>
      </div>
      
      {activeFilter === 'belum-terinvoice' ? (
        <div className="bg-white rounded-lg shadow-md p-3 sm:p-6">
          <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Package className="w-5 h-5 text-orange-600" />
            Surat Jalan Terkirim - Belum Terinvoice
          </h3>
          {filteredSJ.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle className="w-16 h-16 mx-auto text-green-400 mb-4" />
              <p className="text-lg font-semibold text-gray-600 mb-2">Semua Surat Jalan Sudah Terinvoice! 🎉</p>
              <p className="text-sm text-gray-500">Tidak ada Surat Jalan yang perlu di-invoice</p>
            </div>
          ) : (
            <>
              <div className="mb-4 bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
                <p className="text-sm text-blue-800">
                  <strong>📋 Info:</strong> Pilih surat jalan di bawah untuk membuat invoice. Klik tombol "Buat Invoice Baru" di atas untuk memulai.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">Nomor SJ</th>
                      <th className="px-2 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">Tgl SJ</th>
                      <th className="px-2 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">Tgl Terkirim</th>
                      <th className="px-2 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">Nomor Polisi</th>
                      <th className="px-2 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">Rute</th>
                      <th className="px-2 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
                      <th className="px-2 py-2 sm:px-6 sm:py-3 text-right text-xs font-medium text-gray-500 uppercase">Qty Bongkar</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredSJ.map(sj => (
                      <tr key={sj.id} className="hover:bg-orange-50 transition">
                        <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-xs sm:text-sm font-medium text-blue-600">{sj.nomorSJ}</td>
                        <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900">
                          {new Date(sj.tanggalSJ).toLocaleDateString('id-ID')}
                        </td>
                        <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-green-700 font-semibold">
                          {sj.tglTerkirim ? new Date(sj.tglTerkirim).toLocaleDateString('id-ID') : '-'}
                        </td>
                        <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900">{sj.nomorPolisi}</td>
                        <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900">{sj.rute}</td>
                        <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900">{sj.material}</td>
                        <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900 text-right font-semibold">
                          {sj.qtyBongkar || 0} {sj.satuan}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {invoiceList.length === 0 ? (
            <div className="bg-white rounded-lg shadow-md p-12 text-center">
              <FileText className="w-16 h-16 mx-auto text-gray-300 mb-4" />
              <p className="text-lg font-semibold text-gray-600 mb-2">Belum Ada Invoice</p>
              <p className="text-sm text-gray-500 mb-4">Buat invoice pertama untuk Surat Jalan yang sudah terkirim</p>
              {canManageInvoice() && sjBelumTerinvoice.length > 0 && (
                <button
                  onClick={onAddInvoice}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg inline-flex items-center space-x-2 transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>Buat Invoice Pertama</span>
                </button>
              )}
            </div>
          ) : (
            invoiceList.map(invoice => (
              <div key={invoice.id} className="bg-white rounded-lg shadow-md p-3 sm:p-6 hover:shadow-lg transition">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="text-xl font-bold text-gray-800">{invoice.noInvoice}</h3>
                      <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-semibold flex items-center gap-1">
                        <CheckCircle className="w-4 h-4" />
                        Terinvoice
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-gray-600">Tanggal Invoice:</p>
                        <p className="font-semibold text-gray-800">
                          {new Date(invoice.tglInvoice).toLocaleDateString('id-ID')}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-600">Jumlah SJ:</p>
                        <p className="font-semibold text-gray-800">
                          {invoice.suratJalanIds.length} Surat Jalan
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => exportInvoiceToExcel(invoice)}
                      className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1"
                    >
                      <FileText className="w-4 h-4" />
                      <span>Export Excel</span>
                    </button>
                    {canManageInvoice() && (
                      <button
                        onClick={() => onDeleteInvoice(invoice.id)}
                        className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1"
                      >
                        <XCircle className="w-4 h-4" />
                        <span>Hapus</span>
                      </button>
                    )}
                  </div>
                </div>
                
                <div className="border-t pt-4 mt-4">
                  <h4 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Detail Surat Jalan:
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-2 py-2 sm:px-4 text-left text-xs font-medium text-gray-500 uppercase">No</th>
                          <th className="px-2 py-2 sm:px-4 text-left text-xs font-medium text-gray-500 uppercase">No SJ</th>
                          <th className="px-2 py-2 sm:px-4 text-left text-xs font-medium text-gray-500 uppercase">Rute</th>
                          <th className="px-2 py-2 sm:px-4 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
                          <th className="px-2 py-2 sm:px-4 text-right text-xs font-medium text-gray-500 uppercase">Qty Bongkar</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {invoice.suratJalanList.map((sj, idx) => (
                          <tr key={sj.id} className="hover:bg-gray-50">
                            <td className="px-2 py-2 sm:px-4 text-xs sm:text-sm text-gray-600">{idx + 1}</td>
                            <td className="px-2 py-2 sm:px-4 text-xs sm:text-sm font-medium text-blue-600">{sj.nomorSJ}</td>
                            <td className="px-2 py-2 sm:px-4 text-xs sm:text-sm text-gray-900">{sj.rute}</td>
                            <td className="px-2 py-2 sm:px-4 text-xs sm:text-sm text-gray-900">{sj.material}</td>
                            <td className="px-2 py-2 sm:px-4 text-xs sm:text-sm text-gray-900 text-right font-semibold">
                              {sj.qtyBongkar} {sj.satuan}
                            </td>
                          </tr>
                        ))}
                        <tr className="bg-gray-100 font-bold">
                          <td colSpan="4" className="px-2 py-2 sm:px-4 text-xs sm:text-sm text-gray-900 text-right">TOTAL:</td>
                          <td className="px-2 py-2 sm:px-4 text-xs sm:text-sm text-gray-900 text-right">
                            {invoice.totalQty.toFixed(2)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  {invoice.totalHarga > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-100 text-sm space-y-1">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Total Harga:</span>
                        <span className="font-semibold text-gray-800">{formatCurrency(invoice.totalHarga)}</span>
                      </div>
                      {invoice.totalUM > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Uang Muka:</span>
                          <span className="font-semibold text-red-600">- {formatCurrency(invoice.totalUM)}</span>
                        </div>
                      )}
                      <div className="flex justify-between border-t pt-1">
                        <span className="font-bold text-gray-800">Nett:</span>
                        <span className="font-bold text-green-700">{formatCurrency(invoice.totalHargaAfterUM ?? (invoice.totalHarga - (invoice.totalUM || 0)))}</span>
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="mt-4 text-xs text-gray-500 border-t pt-3">
                  <p>Dibuat oleh: <strong>{invoice.createdBy}</strong> pada {new Date(invoice.createdAt).toLocaleString('id-ID')}</p>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

// Uang Muka Management Component
const UangMukaManagement = ({
  uangMukaList,
  suratJalanList,
  currentUser,
  onAddUangMuka,
  onDeleteUangMuka,
  formatCurrency
}) => {
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
                {filteredUM.map((um) => (
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
          </div>
        )}
      </div>
    </div>
  );
};

const SuratJalanMonitor = () => {
  const {
    currentUser, firebaseUser, authReady, isLoading, alertMessage, setAlertMessage,
    handleLogin, handleLogout,
  } = useAuth();

  const effectiveRole = currentUser?.role === 'owner' ? 'reader' : currentUser?.role;
  const canWriteTransaksi = effectiveRole === 'superadmin' || effectiveRole === 'admin_keuangan';

  const [suratJalanList, setSuratJalanList] = useState([]);
  const [biayaList, setBiayaList] = useState([]);
  const [transaksiList, setTransaksiList] = useState([]);
  const [historyLog, setHistoryLog] = useState([]);
  const [invoiceList, setInvoiceList] = useState([]);
  const [uangMukaList, setUangMukaList] = useState([]);
  const { truckList, setTruckList, supirList, setSupirList, ruteList, setRuteList, materialList, setMaterialList } = useMasterData();
  const { usersList, setUsersList, addUser, updateUser, deleteUser: deleteUserFn, toggleUserActive } = useUsers({ currentUser, setAlertMessage });
  const deleteUser = (id) => deleteUserFn(id, setConfirmDialog);
  const [showModal, setShowModal] = useState(false);
  const [showRitasiBulkUpload, setShowRitasiBulkUpload] = useState(false);
  const [modalType, setModalType] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [filter, setFilter] = useState('all');
  const [sjRecapDateField, setSjRecapDateField] = useState('tanggalSJ');
  const [sjRecapStartDate, setSjRecapStartDate] = useState('');
  const [sjRecapEndDate, setSjRecapEndDate] = useState('');
  const didFirstLoadRef = useRef(false);
  const isMountedRef = useRef(true);
  const [activeTab, setActiveTab] = useState('surat-jalan');
  const [confirmDialog, setConfirmDialog] = useState({ show: false, message: '', onConfirm: null });
  const {
    appSettings, setAppSettings, forceLogoutConfig, forceLogoutBanner,
    executeForcedLogout, updateSettings: updateSettingsFn, updateForceLogoutConfig: updateForceLogoutConfigFn,
  } = useSettings({
    currentUser,
    setAlertMessage,
    onForcedLogout: () => { setShowModal(false); },
  });
  const updateSettings = (newSettings) => updateSettingsFn(newSettings, currentUser?.name);
  const updateForceLogoutConfig = (config) => updateForceLogoutConfigFn(config, currentUser?.name);




  // Data loading: source of truth dari Firestore (lihat useEffect subscription di bawah)

// History Log Helper
  const addHistoryLog = async (action, suratJalanId, suratJalanNo, details = {}) => {
    const newLog = {
      id: 'LOG-' + Date.now(),
      action, // 'mark_gagal', 'restore_from_gagal', 'mark_terkirim', 'create_invoice', etc
      suratJalanId,
      suratJalanNo,
      details, // Additional info
      timestamp: new Date().toISOString(),
      user: currentUser?.name || 'system',
      userRole: currentUser?.role || 'unknown'
    };

    const newHistoryLog = [...historyLog, newLog];
    setHistoryLog(newHistoryLog);
    try {
      await upsertItemToFirestore(db, "history_log", { ...newLog, isActive: true });
    } catch (err) {
      console.error('[addHistoryLog] Firestore error:', err);
    }
  };


  // ===== Auto Transaksi Uang Jalan (derived from Surat Jalan) =====
  // Deterministic ID -> idempotent (tidak dobel meskipun sync dijalankan berkali-kali)
  const buildUangJalanTransaksiId = (sjId) => `TX-UJ-${String(sjId)}`;

  const upsertUangJalanTransaksiForSJ = async (sj, opts = {}) => {
    if (!sj) return;

    // SJ tidak aktif / gagal -> tidak boleh punya transaksi uang jalan aktif
    if (sj.isActive === false) return;
    const status = String(sj.status || "").toLowerCase();
    if (status === "gagal") return;

    const nominal = Number(sj.uangJalan || 0);
    if (!(nominal > 0)) return;

    const txId = buildUangJalanTransaksiId(sj.id);

    await addTransaksi({
      id: txId,
      tipe: "pengeluaran",
      nominal,
      keterangan: opts.keterangan || `Uang Jalan - ${sj.nomorSJ} (${sj.rute || ""})`,
      tanggal: opts.tanggal || sj.tanggalSJ || new Date().toISOString().slice(0, 10),
      suratJalanId: sj.id,
      pt: sj.pt || "",
      source: "auto_sj",
      isActive: true,
    });
  };
  const addTransaksi = async (data) => {
    // data bisa datang dari modal (tanpa id) atau dari auto-uang-jalan (dengan id deterministik)
    const nowIso = new Date().toISOString();
    const who = currentUser?.name || "system";

    const txId =
      (data && String(data.id || "").trim()) ||
      ("TRX-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9));

    const nominal = Number(data?.nominal || 0);

    const newTx = sanitizeForFirestore({
      id: txId,
      tipe: data?.tipe || "pengeluaran",
      nominal: isNaN(nominal) ? 0 : nominal,
      keterangan: data?.keterangan || "",
      tanggal: data?.tanggal || nowIso.slice(0, 10),
      pt: data?.pt || "",
      suratJalanId: data?.suratJalanId || null,
      source: data?.source || "manual",
      isActive: data?.isActive !== false,
      createdAt: data?.createdAt || nowIso,
      createdBy: data?.createdBy || who,
      updatedAt: nowIso,
      updatedBy: who,
    });

    // Optimistic UI: upsert by id
    setTransaksiList((prev) => {
      const exists = prev?.some((t) => String(t?.id) === String(txId));
      if (exists) {
        return prev.map((t) => (String(t?.id) === String(txId) ? { ...t, ...newTx } : t));
      }
      return [...(prev || []), newTx];
    });

    // Persist ke Firestore
    try {
      await upsertItemToFirestore(db, "transaksi", newTx);
    } catch (e) {
      console.error("addTransaksi -> Firestore failed", e);
      setAlertMessage("⚠️ Gagal menyimpan transaksi ke Firebase. Perubahan tersimpan di cache lokal.");
    }
  };


  const deleteTransaksi = async (id) => {
    setConfirmDialog({
      show: true,
      message: 'Yakin ingin menghapus transaksi ini?',
      onConfirm: async () => {
        // 1) Update local cache
        const newList = transaksiList.filter(item => item.id !== id);
        setTransaksiList(newList);
// 2) Soft delete in Firestore (so audit trail remains)
        try {
          await softDeleteItemInFirestore(db, "transaksi", id, currentUser?.name || "system");
        } catch (err) {
          console.error("[transaksi] Failed to soft delete in Firestore:", err);
        }

        setConfirmDialog({ show: false, message: '', onConfirm: null });
      }
    });
  };


  // Master Data Truck Functions
  const addTruck = async (data) => {
    const newTruck = {
      id: "TRK-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9),
      ...data,
      isActive: true,
      createdAt: new Date().toISOString(),
      createdBy: currentUser.name,
    };

    // Optimistic UI
    setTruckList((prevList) => [...prevList, newTruck]);

    // Persist ke Firestore
    try {
      await upsertItemToFirestore(db, "trucks", newTruck);
    } catch (err) {
      console.error("[addTruck] Firestore error:", err);
      setTruckList((prevList) => prevList.filter((t) => t.id !== newTruck.id));
      setAlertMessage("⚠️ Gagal menyimpan Truck ke Firebase. Cek koneksi / Console (F12).");
    }
  };

  const updateTruck = async (id, updates) => {
    const payload = { id, ...updates, isActive: true, updatedAt: new Date().toISOString(), updatedBy: currentUser.name };

    setTruckList((prevList) => prevList.map((t) => (t.id === id ? { ...t, ...payload } : t)));

    try {
      await upsertItemToFirestore(db, "trucks", payload);
    } catch (err) {
      console.error("[updateTruck] Firestore error:", err);
      setAlertMessage("⚠️ Gagal update Truck ke Firebase. Cek koneksi / Console (F12).");
    }
  };

  const deleteTruck = async (id) => {
    setConfirmDialog({
      show: true,
      message: "Yakin ingin menghapus truck ini?",
      onConfirm: async () => {
        try {
          await softDeleteItemInFirestore(db, "trucks", id, currentUser?.name || "system");
          setTruckList((prevList) => prevList.filter((t) => t.id !== id));
        } catch (err) {
          console.error('[deleteTruck] Firestore error:', err);
          setAlertMessage("⚠️ Gagal menghapus truck. Cek koneksi / Console (F12).");
        }
        setConfirmDialog({ show: false, message: "", onConfirm: null });
      },
    });
  };

  // Master Data Supir Functions

  const addSupir = async (data) => {
    const newSupir = {
      id: 'SPR-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
      ...data,
      isActive: true,
      createdAt: new Date().toISOString(),
      createdBy: currentUser.name
      };

    try {
      await upsertItemToFirestore(db, "supir", { ...newSupir, isActive: true });
      setSupirList((prevList) => [...prevList, newSupir]);
    } catch (err) {
      console.error("[addSupir] Firestore error:", err);
      setAlertMessage("⚠️ Gagal menyimpan Supir ke Firebase. Cek koneksi / Console (F12).");
    }
  };

  const updateSupir = async (id, updates) => {
    const payload = { id, ...updates, isActive: true, updatedAt: new Date().toISOString(), updatedBy: currentUser.name };
    setSupirList((prevList) =>
      prevList.map((s) => (s.id === id ? { ...s, ...payload } : s))
    );
    try {
      await upsertItemToFirestore(db, "supir", { ...payload, isActive: true });
    } catch (err) {
      console.error("[updateSupir] Firestore error:", err);
      setAlertMessage("⚠️ Gagal update Supir ke Firebase. Cek koneksi / Console (F12).");
    }
  };

  const deleteSupir = async (id) => {
    setConfirmDialog({
      show: true,
      message: "Yakin ingin menghapus supir ini?",
      onConfirm: async () => {
        try {
          await softDeleteItemInFirestore(db, "supir", id, currentUser?.name || "system");
          setSupirList((prevList) => prevList.filter((s) => s.id !== id));
        } catch (err) {
          console.error('[deleteSupir] Firestore error:', err);
          setAlertMessage("⚠️ Gagal menghapus supir. Cek koneksi / Console (F12).");
        }
        setConfirmDialog({ show: false, message: "", onConfirm: null });
      },
    });
  };

  // Master Data Rute Functions
  const addRute = async (data) => {
    const newRute = {
      id: 'RUT-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
      ...data,
      isActive: true,
      createdAt: new Date().toISOString(),
      createdBy: currentUser.name
      };

    try {
      await upsertItemToFirestore(db, "rute", { ...newRute, isActive: true });
      setRuteList((prevList) => [...prevList, newRute]);
    } catch (err) {
      console.error("[addRute] Firestore error:", err);
      setAlertMessage("⚠️ Gagal menyimpan Rute ke Firebase. Cek koneksi / Console (F12).");
    }
  };

  const updateRute = async (id, updates) => {
    const payload = { id, ...updates, isActive: true, updatedAt: new Date().toISOString(), updatedBy: currentUser.name };
    setRuteList((prevList) =>
      prevList.map(r => r.id === id ? { ...r, ...payload } : r)
    );
    try {
      await upsertItemToFirestore(db, "rute", payload);
    } catch (err) {
      console.error("[updateRute] Firestore error:", err);
      setAlertMessage("⚠️ Gagal update Rute ke Firebase. Cek koneksi / Console (F12).");
    }
  };

  const deleteRute = async (id) => {
    setConfirmDialog({
      show: true,
      message: 'Yakin ingin menghapus rute ini?',
      onConfirm: async () => {
        try {
          await softDeleteItemInFirestore(db, "rute", id, currentUser?.name || "system");
        } catch (err) {
          console.error('Error soft-deleting rute:', err);
        }

        setRuteList((prevList) => {
      const newList = prevList.filter(r => r.id !== id);
      return newList;
    });
setConfirmDialog({ show: false, message: '', onConfirm: null });
      }
    });
  };

  const loadRuteData = async () => {
    try {
      const snapshot = await getDocs(collection(db, "rute"));
      const routes = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));
      setRuteList(routes);
    } catch (error) {
      console.error("Error loading rute data:", error);
      setAlertMessage("⚠️ Gagal memuat data rute dari Firebase. Cek koneksi / Console (F12).");
    }
  };

  // Master Data Material Functions
  const addMaterial = async (data) => {
    const newMaterial = {
      id: 'MTR-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
      ...data,
      isActive: true,
      createdAt: new Date().toISOString(),
      createdBy: currentUser.name
      };

    try {
      await upsertItemToFirestore(db, "material", { ...newMaterial, isActive: true });
      setMaterialList((prevList) => [...prevList, newMaterial]);
    } catch (err) {
      console.error("[addMaterial] Firestore error:", err);
      setAlertMessage("⚠️ Gagal menyimpan Material ke Firebase. Cek koneksi / Console (F12).");
    }
  };

  const updateMaterial = async (id, updates) => {
    const payload = { id, ...updates, isActive: true, updatedAt: new Date().toISOString(), updatedBy: currentUser.name };
    setMaterialList((prevList) =>
      prevList.map(m => m.id === id ? { ...m, ...payload } : m)
    );
    try {
      await upsertItemToFirestore(db, "material", payload);
    } catch (err) {
      console.error("[updateMaterial] Firestore error:", err);
      setAlertMessage("⚠️ Gagal update Material ke Firebase. Cek koneksi / Console (F12).");
    }
  };

  const deleteMaterial = async (id) => {
    setConfirmDialog({
      show: true,
      message: 'Yakin ingin menghapus material ini?',
      onConfirm: async () => {
        try {
          await softDeleteItemInFirestore(db, "material", id, currentUser?.name || "system");
        } catch (err) {
          console.error('Error soft-deleting material:', err);
        }

        setMaterialList((prevList) => {
      const newList = prevList.filter(m => m.id !== id);
      return newList;
    });
setConfirmDialog({ show: false, message: '', onConfirm: null });
      }
    });
  };

  // Invoice Functions
  // Persist invoice + update SJ terkait dengan fallback nama koleksi ("invoice" vs "invoices")
  
  // Saat admin_invoice update surat_jalan, Firestore Rules hanya mengizinkan perubahan field invoice tertentu.
  const pickSJInvoicePatch = (sj) => {
    const nowIso = new Date().toISOString();
    return sanitizeForFirestore({
      statusInvoice: sj?.statusInvoice ?? 'belum',
      invoiceId: sj?.invoiceId ?? null,
      invoiceNo: sj?.invoiceNo ?? null,
      updatedAt: sj?.updatedAt ?? nowIso,
      updatedBy: sj?.updatedBy ?? (currentUser?.name || 'system'),
    });
  };

const persistInvoiceWithFallback = async ({ invoiceDoc, sjIdsToPersist }) => {
    await ensureAuthed();
    const nowIso = new Date().toISOString();
    const who = currentUser?.name || currentUser?.username || 'system';
    let invoiceSaved = false;
    let lastErr = null;

    for (const colName of ['invoice', 'invoices']) {
      try {
        await setDoc(
          doc(db, colName, String(invoiceDoc.id)),
          sanitizeForFirestore({ ...invoiceDoc, isActive: true, updatedAt: nowIso, updatedBy: who }),
          { merge: true }
        );
        invoiceSaved = true;
        break;
      } catch (e) {
        lastErr = e;
      }
    }
    if (!invoiceSaved) throw lastErr || new Error('Gagal menyimpan invoice');

    const resolveResults = await Promise.allSettled((sjIdsToPersist || []).map(async (sjId) => ({ sjId, ref: await resolveSuratJalanDocRef(db, sjId) })));
    const resolved = resolveResults
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value);
    const failedResolves = resolveResults.filter(r => r.status === 'rejected');
    if (failedResolves.length > 0) {
      console.warn(`[persistInvoice] ${failedResolves.length} SJ gagal resolve:`, failedResolves.map(r => r.reason));
    }
    for (const { sjId, ref } of resolved) {
      if (!ref) continue;
      try {
        await setDoc(ref, sanitizeForFirestore({
          statusInvoice: 'terinvoice',
          invoiceId: invoiceDoc.id,
          invoiceNo: invoiceDoc.noInvoice,
          updatedAt: nowIso,
          updatedBy: who,
        }), { merge: true });
      } catch (err) {
        console.error(`[persistInvoice] Gagal update SJ ${sjId}:`, err);
      }
    }
    return true;
  };

  const addInvoice = async (data) => {
    const who = currentUser?.name || currentUser?.username || 'User';
    const selectedSJIds = data.selectedSJIds;
    const newInvoice = {
      id: 'INV-' + Date.now(),
      noInvoice: data.noInvoice,
      tglInvoice: data.tglInvoice,
      suratJalanIds: data.selectedSJIds,
      suratJalanList: suratJalanList.filter(sj => data.selectedSJIds.includes(sj.id)),
      totalQty: suratJalanList
        .filter(sj => data.selectedSJIds.includes(sj.id))
        .reduce((sum, sj) => sum + Number(sj.qtyBongkar || 0), 0),
      ruteHarga: data.ruteHarga || {},
      totalHarga: (() => {
        const selectedSJs = suratJalanList.filter(sj => selectedSJIds.includes(sj.id));
        const ruteQtys = {};
        selectedSJs.forEach(sj => {
          if (!ruteQtys[sj.rute]) ruteQtys[sj.rute] = 0;
          ruteQtys[sj.rute] += Number(sj.qtyBongkar || 0);
        });
        return Object.entries(data.ruteHarga || {}).reduce((sum, [rute, harga]) => {
          return sum + (ruteQtys[rute] || 0) * Number(harga || 0);
        }, 0);
      })(),
      totalUM: (() => {
        const selectedSJs = suratJalanList.filter(sj => selectedSJIds.includes(sj.id));
        return selectedSJs.reduce((sum, sj) => {
          const umForSJ = uangMukaList.filter(um => um.sjId === sj.id);
          return sum + umForSJ.reduce((s, um) => s + Number(um.jumlah || 0), 0);
        }, 0);
      })(),
      totalHargaAfterUM: (() => {
        const selectedSJs = suratJalanList.filter(sj => selectedSJIds.includes(sj.id));
        const ruteQtys = {};
        selectedSJs.forEach(sj => {
          if (!ruteQtys[sj.rute]) ruteQtys[sj.rute] = 0;
          ruteQtys[sj.rute] += Number(sj.qtyBongkar || 0);
        });
        const total = Object.entries(data.ruteHarga || {}).reduce((sum, [rute, harga]) => {
          return sum + (ruteQtys[rute] || 0) * Number(harga || 0);
        }, 0);
        const totalUMVal = selectedSJs.reduce((sum, sj) => {
          const umForSJ = uangMukaList.filter(um => um.sjId === sj.id);
          return sum + umForSJ.reduce((s, um) => s + Number(um.jumlah || 0), 0);
        }, 0);
        return total - totalUMVal;
      })(),
      createdAt: new Date().toISOString(),
      createdBy: who,
      isActive: true,
    };

    const updatedSJList = suratJalanList.map(sj => data.selectedSJIds.includes(sj.id)
      ? {
          ...sj,
          statusInvoice: 'terinvoice',
          invoiceId: newInvoice.id,
          invoiceNo: data.noInvoice,
          updatedAt: new Date().toISOString(),
          updatedBy: who,
        }
      : sj
    );

    try {
      await persistInvoiceWithFallback({
        invoiceDoc: newInvoice,
        sjIdsToPersist: data.selectedSJIds,
      });
      setSuratJalanList(updatedSJList);
      setInvoiceList((prev) => mergeById(prev, [newInvoice]));
      setAlertMessage('✅ Invoice berhasil dibuat!');
    } catch (e) {
      console.error('Persist invoice failed:', e);
      if (e?.code === 'NOT_AUTHENTICATED') {
        setAlertMessage('⚠️ Sesi login habis. Silakan login ulang lalu coba lagi.');
      } else {
        setAlertMessage('⚠️ Invoice gagal sync ke Firebase. Cek Console (F12).');
      }
    }
  };

  const editInvoice = async (invoiceId, data) => {
    const invoice = invoiceList.find(inv => inv.id === invoiceId);
    if (!invoice) return;

    const oldSJIds = invoice.suratJalanIds;
    const newSJIds = data.selectedSJIds;
    
    // SJ yang dihapus dari invoice (ada di old, tidak ada di new)
    const removedSJIds = oldSJIds.filter(id => !newSJIds.includes(id));
    
    // SJ yang ditambah ke invoice (ada di new, tidak ada di old)
    const addedSJIds = newSJIds.filter(id => !oldSJIds.includes(id));

    // Update Surat Jalan
    const updatedSJList = suratJalanList.map(sj => {
      // Remove invoice status dari SJ yang dihapus
      if (removedSJIds.includes(sj.id)) {
        return {
          ...sj,
          statusInvoice: 'belum',
          invoiceId: null,
          invoiceNo: null,
          updatedAt: new Date().toISOString(),
          updatedBy: currentUser.name
        };
      }
      
      // Add invoice status ke SJ yang ditambah
      if (addedSJIds.includes(sj.id)) {
        return {
          ...sj,
          statusInvoice: 'terinvoice',
          invoiceId: invoiceId,
          invoiceNo: invoice.noInvoice,
          updatedAt: new Date().toISOString(),
          updatedBy: currentUser.name
        };
      }
      
      return sj;
    });

    // Update invoice
    const updatedInvoice = {
      ...invoice,
      suratJalanIds: newSJIds,
      suratJalanList: updatedSJList.filter(sj => newSJIds.includes(sj.id)),
      totalQty: updatedSJList
        .filter(sj => newSJIds.includes(sj.id))
        .reduce((sum, sj) => sum + Number(sj.qtyBongkar || 0), 0),
      ruteHarga: data.ruteHarga || {},
      totalHarga: (() => {
        const selectedSJs = suratJalanList.filter(sj => newSJIds.includes(sj.id));
        const ruteQtys = {};
        selectedSJs.forEach(sj => {
          if (!ruteQtys[sj.rute]) ruteQtys[sj.rute] = 0;
          ruteQtys[sj.rute] += Number(sj.qtyBongkar || 0);
        });
        return Object.entries(data.ruteHarga || {}).reduce((sum, [rute, harga]) => {
          return sum + (ruteQtys[rute] || 0) * Number(harga || 0);
        }, 0);
      })(),
      totalUM: (() => {
        const selectedSJs = suratJalanList.filter(sj => newSJIds.includes(sj.id));
        return selectedSJs.reduce((sum, sj) => {
          const umForSJ = uangMukaList.filter(um => um.sjId === sj.id);
          return sum + umForSJ.reduce((s, um) => s + Number(um.jumlah || 0), 0);
        }, 0);
      })(),
      totalHargaAfterUM: (() => {
        const selectedSJs = suratJalanList.filter(sj => newSJIds.includes(sj.id));
        const ruteQtys = {};
        selectedSJs.forEach(sj => {
          if (!ruteQtys[sj.rute]) ruteQtys[sj.rute] = 0;
          ruteQtys[sj.rute] += Number(sj.qtyBongkar || 0);
        });
        const total = Object.entries(data.ruteHarga || {}).reduce((sum, [rute, harga]) => {
          return sum + (ruteQtys[rute] || 0) * Number(harga || 0);
        }, 0);
        const totalUMVal = selectedSJs.reduce((sum, sj) => {
          const umForSJ = uangMukaList.filter(um => um.sjId === sj.id);
          return sum + umForSJ.reduce((s, um) => s + Number(um.jumlah || 0), 0);
        }, 0);
        return total - totalUMVal;
      })(),
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser.name
    };

    const updatedInvoiceList = invoiceList.map(inv => 
      inv.id === invoiceId ? updatedInvoice : inv
    );

    setSuratJalanList(updatedSJList);
setInvoiceList(updatedInvoiceList);

// Persist ke Firestore (invoice + update SJ terkait)
try {
  const touchedIds = Array.from(new Set([...(oldSJIds || []), ...(newSJIds || [])]));
  await persistInvoiceWithFallback({
    invoiceDoc: updatedInvoice,
    updatedSJList,
    sjIdsToPersist: touchedIds,
  });
  setAlertMessage('✅ Invoice berhasil diupdate!');
} catch (e) {
  console.error("Persist edit invoice failed:", e);
  if (e?.code === 'NOT_AUTHENTICATED') {
    setAlertMessage('⚠️ Sesi login habis. Silakan login ulang lalu coba lagi.');
  } else {
    setAlertMessage("⚠️ Perubahan invoice tampil di UI, tapi gagal sync ke Firebase. Cek Console (F12).");
  }
}
  };

  
  const deleteInvoice = async (id) => {
    setConfirmDialog({
      show: true,
      message: 'Yakin ingin menghapus invoice ini? Surat Jalan terkait akan dilepas dari invoice.',
      onConfirm: async () => {
        try {
          await ensureAuthed();
          const invoice = invoiceList.find((inv) => inv.id === id);
          const sjIds = invoice?.suratJalanIds || [];
          const nowIso = new Date().toISOString();
          const who = currentUser?.name || currentUser?.username || 'system';

          let softDeleteOk = false;
          let lastErr = null;
          for (const col of ['invoice', 'invoices']) {
            try {
              await setDoc(doc(db, col, String(id)), sanitizeForFirestore({
                isActive: false,
                deletedAt: nowIso,
                deletedBy: who,
                updatedAt: nowIso,
                updatedBy: who,
              }), { merge: true });
              softDeleteOk = true;
              break;
            } catch (e) {
              lastErr = e;
            }
          }
          if (!softDeleteOk) throw lastErr || new Error('Gagal membatalkan invoice');

          const resolved = await Promise.all(sjIds.map(async (sjId) => ({ sjId, ref: await resolveSuratJalanDocRef(db, sjId) })));
          for (const { ref } of resolved) {
            if (!ref) continue;
            await setDoc(ref, sanitizeForFirestore({
              statusInvoice: 'belum',
              invoiceId: null,
              invoiceNo: null,
              updatedAt: nowIso,
              updatedBy: who,
            }), { merge: true });
          }

          setSuratJalanList((prev) => prev.map((sj) => sjIds.includes(sj.id) ? {
            ...sj,
            statusInvoice: 'belum',
            invoiceId: null,
            invoiceNo: null,
            updatedAt: nowIso,
            updatedBy: who,
          } : sj));
          setInvoiceList((prev) => prev.filter((inv) => inv.id !== id));
          setAlertMessage('✅ Invoice berhasil dihapus!');
        } catch (e) {
          console.error('Delete invoice failed:', e);
          setAlertMessage('⚠️ Gagal menghapus invoice di Firebase. Cek Console (F12).');
        }

        setConfirmDialog({ show: false, message: '', onConfirm: null });
      },
    });
  };

  const addUangMuka = async (data) => {
    const who = currentUser?.name || currentUser?.username || 'User';
    const nowIso = new Date().toISOString();
    const newUM = {
      id: 'UM-' + Date.now(),
      sjId: data.sjId,
      nomorSJ: data.nomorSJ,
      jumlah: parseFloat(data.jumlah),
      tanggal: data.tanggal,
      keterangan: data.keterangan || '',
      isActive: true,
      createdAt: nowIso,
      createdBy: who,
      updatedAt: nowIso,
      updatedBy: who,
    };

    try {
      await ensureAuthed();
      await setDoc(
        doc(db, 'uang_muka', String(newUM.id)),
        sanitizeForFirestore(newUM),
        { merge: true }
      );
      setUangMukaList((prev) => [newUM, ...prev]);
      setAlertMessage('✅ Uang Muka berhasil ditambahkan!');
    } catch (e) {
      console.error('Add uang muka failed:', e);
      if (e?.code === 'NOT_AUTHENTICATED') {
        setAlertMessage('⚠️ Sesi login habis. Silakan login ulang lalu coba lagi.');
      } else {
        setAlertMessage('⚠️ Gagal menyimpan Uang Muka. Cek Console (F12).');
      }
    }
  };

  const deleteUangMuka = async (id) => {
    setConfirmDialog({
      show: true,
      message: 'Yakin ingin menghapus Uang Muka ini?',
      onConfirm: async () => {
        try {
          await ensureAuthed();
          const nowIso = new Date().toISOString();
          const who = currentUser?.name || currentUser?.username || 'system';
          await setDoc(doc(db, 'uang_muka', String(id)), sanitizeForFirestore({
            isActive: false,
            deletedAt: nowIso,
            deletedBy: who,
            updatedAt: nowIso,
            updatedBy: who,
          }), { merge: true });
          setUangMukaList((prev) => prev.filter((um) => um.id !== id));
          setAlertMessage('✅ Uang Muka berhasil dihapus!');
        } catch (e) {
          console.error('Delete uang muka failed:', e);
          setAlertMessage('⚠️ Gagal menghapus Uang Muka. Cek Console (F12).');
        }
        setConfirmDialog({ show: false, message: '', onConfirm: null });
      },
    });
  };

  // Import Functions
  const downloadTemplate = (type) => {
    let csvContent = '';
    let filename = '';

    if (type === 'suratjalan') {
      csvContent = 'Nomor SJ;Tanggal SJ (DD/MM/YYYY);Nomor Polisi;Nama Supir;Rute;Material;Qty Isi;Status;Tgl Terkirim (DD/MM/YYYY);Qty Bongkar\n';
      csvContent += 'SJ/2024/001;01/02/2024;B 1234 ABC;Ahmad Supardi;Jakarta - Bandung;Pasir;100;Pending;;\n';
      csvContent += 'SJ/2024/002;02/02/2024;D 5678 XYZ;Budi Santoso;Surabaya - Malang;Batu;150;Terkirim;05/02/2024;145\n';
      csvContent += 'SJ/2024/003;03/02/2024;B 9012 DEF;Candra Wijaya;Bandung - Cirebon;Kerikil;200;Gagal;;';
      filename = 'template_surat_jalan.csv';
    } else if (type === 'truck') {
      csvContent = 'Nomor Polisi;Aktif (Ya/Tidak)\n';
      csvContent += 'B 1234 ABC;Ya\n';
      csvContent += 'D 5678 XYZ;Tidak\n';
      filename = 'template_truck.csv';
    } else if (type === 'supir') {
      csvContent = 'Nama Supir;PT;Aktif (Ya/Tidak)\nJohn Doe;PT Maju Jaya;Ya\nJane Smith;PT Sejahtera;Ya\nBob Wilson;PT Makmur;Tidak';
      filename = 'template_supir.csv';
    } else if (type === 'rute') {
      csvContent = 'Rute;Uang Jalan;Uang Muka\nJakarta - Surabaya;500000;100000\nBandung - Semarang;350000;75000\nJakarta - Medan;1200000;200000';
      filename = 'template_rute.csv';
    } else if (type === 'material') {
      csvContent = 'Material;Satuan\nSemen;Ton\nPasir;m³\nBesi;Kg\nBatu Bata;Pcs';
      filename = 'template_material.csv';
    }

    // Add BOM for UTF-8 to help Excel recognize encoding
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const importData = async (type, file) => {
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      if (!isMountedRef.current) return;
      try {
        const text = e.target.result.replace(/^\uFEFF/, '');

        // Detect delimiter (semicolon vs comma) — pilih yang lebih banyak muncul di baris pertama
        const firstLine = text.split('\n')[0];
        const semicolonCount = (firstLine.match(/;/g) || []).length;
        const commaCount     = (firstLine.match(/,/g) || []).length;
        const delimiter = semicolonCount >= commaCount ? ';' : ',';
        
        const rows = text.split('\n')
          .map(row => row.trim())
          .filter(row => row && row.length > 0);
        
        if (rows.length < 2) {
          setAlertMessage('File CSV kosong atau tidak valid!');
          return;
        }

        const headers = rows[0].split(delimiter).map(h => h.trim());
        
        // Validasi header berdasarkan tipe master data
        const headersLower = headers.map(h => h.toLowerCase());
        let isValidHeader = false;
        let expectedHeader = '';
        
        if (type === 'suratjalan') {
          expectedHeader = 'Nomor SJ;Tanggal SJ (DD/MM/YYYY);Nomor Polisi;Nama Supir;Rute;Material;Qty Isi;Status;Tgl Terkirim (DD/MM/YYYY);Qty Bongkar';
          isValidHeader = headers.length >= 8 && 
                         headersLower[0].includes('nomor') && headersLower[0].includes('sj') &&
                         headersLower[1].includes('tanggal') && headersLower[1].includes('sj') &&
                         headersLower[2].includes('nomor') && headersLower[2].includes('polisi') &&
                         headersLower[3].includes('nama') && headersLower[3].includes('supir') &&
                         headersLower[4].includes('rute') &&
                         headersLower[5].includes('material') &&
                         headersLower[6].includes('qty') && headersLower[6].includes('isi');
        } else if (type === 'truck') {
          expectedHeader = 'Nomor Polisi;Aktif (Ya/Tidak)';
          isValidHeader = headers.length === 2 && 
                         headersLower[0].includes('nomor') && headersLower[0].includes('polisi') &&
                         headersLower[1].includes('aktif');
        } else if (type === 'supir') {
          expectedHeader = 'Nama Supir;PT;Aktif (Ya/Tidak)';
          isValidHeader = headers.length === 3 && 
                         headersLower[0].includes('nama') && headersLower[0].includes('supir') &&
                         headersLower[1] === 'pt' &&
                         headersLower[2].includes('aktif');
        } else if (type === 'rute') {
          expectedHeader = 'Rute;Uang Jalan;Uang Muka';
          isValidHeader = headers.length >= 2 && headers.length <= 3 &&
                         headersLower[0] === 'rute' &&
                         (headersLower[1].includes('uang') && headersLower[1].includes('jalan'));
        } else if (type === 'material') {
          expectedHeader = 'Material;Satuan';
          isValidHeader = headers.length === 2 && 
                         headersLower[0] === 'material' &&
                         headersLower[1] === 'satuan';
        }
        
        if (!isValidHeader) {
          setAlertMessage(`Format header CSV tidak sesuai!\n\nFormat yang benar untuk ${type.toUpperCase()}:\n${expectedHeader}\n\nHeader yang ditemukan:\n${rows[0]}\n\nSilakan download template yang benar.`);
          return;
        }
        
        const dataRows = rows.slice(1);
        
        let successCount = 0;
        let errorCount = 0;
        let errorDetails = [];
        const newItems = [];

        if (type === 'suratjalan') {
          // Maps untuk track master data baru selama import (cegah duplikat & hindari N+1 writes)
          const newTrucksMap = new Map();   // key: nomorPolisi
          const newSupirsMap = new Map();   // key: namaSupir
          const newRutesMap = new Map();    // key: rute
          const newMaterialsMap = new Map(); // key: material
          // Helper function to parse date DD/MM/YYYY
          const parseDate = (dateStr) => {
            if (!dateStr || dateStr.trim() === '') return null;
            const parts = dateStr.trim().split('/');
            if (parts.length !== 3) return null;
            const day   = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10);
            const year  = parseInt(parts[2], 10);
            if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
            if (day < 1 || day > 31 || month < 1 || month > 12) return null;
            if (year < 2000 || year > 2100) return null;
            return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          };

          for (let i = 0; i < dataRows.length; i++) {
            const values = dataRows[i].split(delimiter).map(v => v.trim());
            if (values.length >= 7 && values[0] && values[1]) {
              try {
                const nomorSJ = values[0];
                const tanggalSJ = parseDate(values[1]);
                const nomorPolisi = values[2];
                const namaSupir = values[3];
                const rute = values[4];
                const material = values[5];
                const qtyIsi = parseFloat(values[6]);
                const status = values[7] ? values[7].toLowerCase() : 'pending';
                const tglTerkirim = values[8] ? parseDate(values[8]) : null;
                const qtyBongkar = values[9] ? parseFloat(values[9]) : null;

                if (!tanggalSJ) {
                  errorCount++;
                  errorDetails.push(`Baris ${i + 2}: Format tanggal tidak valid (gunakan DD/MM/YYYY)`);
                  continue;
                }

                if (isNaN(qtyIsi)) {
                  errorCount++;
                  errorDetails.push(`Baris ${i + 2}: Qty Isi harus berupa angka`);
                  continue;
                }

                // Validasi status
                const validStatus = ['pending', 'terkirim', 'gagal'];
                const finalStatus = validStatus.includes(status) ? status : 'pending';

                // Find atau create master data IDs
                let truckId = truckList.find(t => t.nomorPolisi === nomorPolisi)?.id;
                let supirId = supirList.find(s => s.namaSupir === namaSupir)?.id;
                let ruteId = ruteList.find(r => r.rute === rute)?.id;
                let materialId = materialList.find(m => m.material === material)?.id;

                // Jika tidak ada, buat data master baru — dikumpulkan ke Map, di-batch setelah loop
                if (!truckId) {
                  const cached = newTrucksMap.get(nomorPolisi);
                  if (cached) {
                    truckId = cached.id;
                  } else {
                    const newTruck = {
                      id: 'TRK-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
                      nomorPolisi,
                      isActive: true,
                      createdAt: new Date().toISOString(),
                      createdBy: 'Import'
                    };
                    newTrucksMap.set(nomorPolisi, newTruck);
                    truckId = newTruck.id;
                  }
                }

                if (!supirId) {
                  const cached = newSupirsMap.get(namaSupir);
                  if (cached) {
                    supirId = cached.id;
                  } else {
                    const newSupir = {
                      id: 'SPR-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
                      namaSupir,
                      pt: 'Import Data',
                      isActive: true,
                      createdAt: new Date().toISOString(),
                      createdBy: 'Import'
                    };
                    newSupirsMap.set(namaSupir, newSupir);
                    supirId = newSupir.id;
                  }
                }

                if (!ruteId) {
                  const cached = newRutesMap.get(rute);
                  if (cached) {
                    ruteId = cached.id;
                  } else {
                    const newRute = {
                      id: 'RTE-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
                      rute,
                      uangJalan: 0,
                      isActive: true,
                      createdAt: new Date().toISOString(),
                      createdBy: 'Import'
                    };
                    newRutesMap.set(rute, newRute);
                    ruteId = newRute.id;
                  }
                }

                if (!materialId) {
                  const cached = newMaterialsMap.get(material);
                  if (cached) {
                    materialId = cached.id;
                  } else {
                    const newMaterial = {
                      id: 'MAT-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
                      material,
                      satuan: 'Ton',
                      isActive: true,
                      createdAt: new Date().toISOString(),
                      createdBy: 'Import'
                    };
                    newMaterialsMap.set(material, newMaterial);
                    materialId = newMaterial.id;
                  }
                }

                // Buat Surat Jalan
                const newSJ = {
                  id: 'SJ-' + Date.now() + '-' + i + '-' + Math.random().toString(36).substr(2, 9),
                  nomorSJ,
                  tanggalSJ,
                  truckId,
                  nomorPolisi,
                  supirId,
                  namaSupir,
                  pt: supirList.find(s => s.id === supirId)?.pt || newSupirsMap.get(namaSupir)?.pt || 'Import Data',
                  ruteId,
                  rute,
                  uangJalan: ruteList.find(r => r.id === ruteId)?.uangJalan ?? newRutesMap.get(rute)?.uangJalan ?? 0,
                  materialId,
                  material,
                  satuan: materialList.find(m => m.id === materialId)?.satuan || newMaterialsMap.get(material)?.satuan || 'Ton',
                  qtyIsi,
                  status: finalStatus,
                  tglTerkirim,
                  qtyBongkar,
                  createdAt: new Date().toISOString(),
                  createdBy: 'Import'
                };

                newItems.push(newSJ);
                successCount++;
              } catch (error) {
                errorCount++;
                errorDetails.push(`Baris ${i + 2}: ${values[0]} - ${error.message}`);
              }
            } else {
              errorCount++;
              errorDetails.push(`Baris ${i + 2}: Data tidak lengkap (minimal 7 kolom diperlukan)`);
            }
          }

          // Batch write master data baru (trucks, supir, rute, material) — satu round-trip
          const hasNewMasterData = newTrucksMap.size > 0 || newSupirsMap.size > 0
                                 || newRutesMap.size > 0 || newMaterialsMap.size > 0;
          if (hasNewMasterData) {
            try {
              const masterBatch = writeBatch(db);
              newTrucksMap.forEach(truck => {
                masterBatch.set(doc(db, "trucks", String(truck.id)), sanitizeForFirestore(truck), { merge: true });
              });
              newSupirsMap.forEach(supir => {
                masterBatch.set(doc(db, "supir", String(supir.id)), sanitizeForFirestore(supir), { merge: true });
              });
              newRutesMap.forEach(rte => {
                masterBatch.set(doc(db, "rute", String(rte.id)), sanitizeForFirestore(rte), { merge: true });
              });
              newMaterialsMap.forEach(mat => {
                masterBatch.set(doc(db, "material", String(mat.id)), sanitizeForFirestore(mat), { merge: true });
              });
              await masterBatch.commit();
            } catch (e) {
              console.error("Import master data batch Firestore failed:", e);
            }
          }

          // Batch update untuk Surat Jalan
          if (newItems.length > 0) {
            // Persist ke Firestore (batch)
            try {
              const batch = writeBatch(db);
              newItems.forEach((sj) => {
                batch.set(doc(db, "surat_jalan", String(sj.id)), sanitizeForFirestore({ ...sj, isActive: true }), { merge: true });
              });
              await batch.commit();
            } catch (e) {
              console.error("Import SJ batch Firestore failed:", e);
            }

            if (!isMountedRef.current) return;
            setSuratJalanList((prevList) => [...prevList, ...newItems]);

            // Auto-create transaksi uang jalan untuk hasil import (agar menu Keuangan ikut terupdate)
            if (canWriteTransaksi) {
              for (const sj of newItems) {
                try {
                  await upsertUangJalanTransaksiForSJ(sj);
                } catch (e) {
                  console.warn('Import SJ -> auto transaksi uang jalan gagal:', e);
                }
              }
            }
}
        } else if (type === 'truck') {
          for (let i = 0; i < dataRows.length; i++) {
            const values = dataRows[i].split(delimiter).map(v => v.trim());
            if (values.length >= 2 && values[0]) {
              try {
                const isActive = values[1].toLowerCase() === 'ya' || 
                                values[1].toLowerCase() === 'yes' || 
                                values[1].toLowerCase() === 'true' || 
                                values[1] === '1';
                
                const newTruck = {
                  id: 'TRK-' + Date.now() + '-' + i + '-' + Math.random().toString(36).substr(2, 9),
                  nomorPolisi: values[0],
                  isActive: isActive,
                  createdAt: new Date().toISOString(),
                  createdBy: currentUser.name
                };
                newItems.push(newTruck);
                successCount++;
              } catch (error) {
                errorCount++;
                errorDetails.push(`Baris ${i + 2}: ${values[0]} - ${error.message}`);
              }
            } else {
              errorCount++;
              errorDetails.push(`Baris ${i + 2}: Data tidak lengkap`);
            }
          }
          
// Simpan ke Firestore (collection: trucks)
if (newItems.length > 0) {
  try {
    const batch = writeBatch(db);
    newItems.forEach((t) => {
      batch.set(doc(db, "trucks", t.id), t, { merge: true });
    });
    await batch.commit();

    // Update UI state setelah sukses commit
    setTruckList((prevList) => {
      const map = new Map(prevList.map((x) => [x.id, x]));
      newItems.forEach((x) => map.set(x.id, x));
      return Array.from(map.values());
    });
  } catch (e) {
    console.error("Error writing trucks to Firestore:", e);
    setAlertMessage("Gagal menyimpan Truck ke Firestore. Cek Console (F12).");
    return;
  }
}
        } else if (type === 'supir') {
          for (let i = 0; i < dataRows.length; i++) {
            const values = dataRows[i].split(delimiter).map(v => v.trim());
            if (values.length >= 3 && values[0] && values[1]) {
              try {
                const isActive = values[2].toLowerCase() === 'ya' || 
                                values[2].toLowerCase() === 'yes' || 
                                values[2].toLowerCase() === 'true' || 
                                values[2] === '1';
                
                const newSupir = {
                  id: 'SPR-' + Date.now() + '-' + i + '-' + Math.random().toString(36).substr(2, 9),
                  namaSupir: values[0],
                  pt: values[1],
                  isActive: isActive,
                  createdAt: new Date().toISOString(),
                  createdBy: currentUser.name
                };
                newItems.push(newSupir);
                successCount++;
              } catch (error) {
                errorCount++;
                errorDetails.push(`Baris ${i + 2}: ${values[0]} - ${error.message}`);
              }
            } else {
              errorCount++;
              errorDetails.push(`Baris ${i + 2}: Data tidak lengkap`);
            }
          }
          
          // Simpan ke Firestore (collection: supir)
          if (newItems.length > 0) {
            try {
              const batch = writeBatch(db);
              newItems.forEach((s) => {
                batch.set(doc(db, "supir", s.id), s, { merge: true });
              });
              await batch.commit();
              setSupirList((prevList) => [...prevList, ...newItems]);
            } catch (e) {
              console.error("Error writing supir to Firestore:", e);
              setAlertMessage("Gagal menyimpan Supir ke Firestore. Cek Console (F12).");
              return;
            }
          }
} else if (type === 'rute') {
          for (let i = 0; i < dataRows.length; i++) {
            const values = dataRows[i].split(delimiter).map(v => v.trim());
            if (values.length >= 2 && values[0] && values[1]) {
              try {
                // Validasi bahwa kolom kedua adalah angka
                const uangJalan = parseFloat(values[1].replace(/\./g, '').replace(/,/g, ''));
                if (isNaN(uangJalan)) {
                  throw new Error('Uang Jalan harus berupa angka');
                }

                // Parse Uang Muka (kolom ke-3, opsional)
                let uangMuka = 0;
                if (values.length >= 3 && values[2]) {
                  uangMuka = parseFloat(values[2].replace(/\./g, '').replace(/,/g, ''));
                  if (isNaN(uangMuka)) {
                    uangMuka = 0;
                  }
                }

                const newRute = {
                  id: 'RUT-' + Date.now() + '-' + i + '-' + Math.random().toString(36).substr(2, 9),
                  rute: values[0],
                  uangJalan: uangJalan,
                  uangMuka: uangMuka,
                  isActive: true,
                  createdAt: new Date().toISOString(),
                  createdBy: currentUser.name
                };
                newItems.push(newRute);
                successCount++;
              } catch (error) {
                errorCount++;
                errorDetails.push(`Baris ${i + 2}: ${values[0]} - ${error.message}`);
              }
            } else {
              errorCount++;
              errorDetails.push(`Baris ${i + 2}: Data tidak lengkap (harus ada Rute dan Uang Jalan)`);
            }
          }
          
          // Simpan ke Firestore (collection: rute)
          if (newItems.length > 0) {
            try {
              const batch = writeBatch(db);
              newItems.forEach((r) => {
                batch.set(doc(db, "rute", r.id), r, { merge: true });
              });
              await batch.commit();
              setRuteList((prevList) => [...prevList, ...newItems]);
            } catch (e) {
              console.error("Error writing rute to Firestore:", e);
              setAlertMessage("Gagal menyimpan Rute ke Firestore. Cek Console (F12).");
              return;
            }
          }
} else if (type === 'material') {
          for (let i = 0; i < dataRows.length; i++) {
            const values = dataRows[i].split(delimiter).map(v => v.trim());
            if (values.length >= 2 && values[0] && values[1]) {
              try {
                // Validasi bahwa kolom kedua BUKAN angka murni (harus satuan)
                const angkaTest = parseFloat(values[1].replace(/\./g, '').replace(/,/g, ''));
                if (!isNaN(angkaTest) && /^\d+$/.test(values[1].replace(/\./g, '').replace(/,/g, ''))) {
                  throw new Error('Satuan tidak boleh berupa angka. Gunakan format template Material yang benar (contoh: Ton, Kg, m³, Pcs)');
                }
                
                const newMaterial = {
                  id: 'MTR-' + Date.now() + '-' + i + '-' + Math.random().toString(36).substr(2, 9),
                  material: values[0],
                  satuan: values[1],
                  isActive: true,
                  createdAt: new Date().toISOString(),
                  createdBy: currentUser.name
                };
                newItems.push(newMaterial);
                successCount++;
              } catch (error) {
                errorCount++;
                errorDetails.push(`Baris ${i + 2}: ${values[0]} - ${error.message}`);
              }
            } else {
              errorCount++;
              errorDetails.push(`Baris ${i + 2}: Data tidak lengkap (harus ada Material dan Satuan)`);
            }
          }
          
          // Simpan ke Firestore (collection: material)
          if (newItems.length > 0) {
            try {
              const batch = writeBatch(db);
              newItems.forEach((m) => {
                batch.set(doc(db, "material", m.id), m, { merge: true });
              });
              await batch.commit();
              setMaterialList((prevList) => [...prevList, ...newItems]);
            } catch (e) {
              console.error("Error writing material to Firestore:", e);
              setAlertMessage("Gagal menyimpan Material ke Firestore. Cek Console (F12).");
              return;
            }
          }
}

        let message = `Import selesai!\n\nBerhasil: ${successCount} data\nGagal: ${errorCount} data`;
        if (errorCount > 0 && errorDetails.length > 0) {
          message += '\n\nDetail Error (5 pertama):\n' + errorDetails.slice(0, 5).join('\n');
        }
        setAlertMessage(message);
      } catch (error) {
        setAlertMessage('Terjadi kesalahan saat import:\n' + error.message);
      }
    };

    reader.onerror = () => {
      setAlertMessage('Gagal membaca file. Pastikan file tidak rusak dan coba lagi.');
    };

    reader.readAsText(file);
  };

  const addSuratJalan = async (data) => {
    // Ambil data terkait dari master data
    const selectedTruck = truckList.find(t => t.id === data.truckId);
    const selectedSupir = supirList.find(s => s.id === data.supirId);
    const selectedRute = ruteList.find(r => r.id === data.ruteId);
    const selectedMaterial = materialList.find(m => m.id === data.materialId);
    
    const newSJ = {
      id: 'SJ-' + Date.now(),
      nomorSJ: data.nomorSJ,
      tanggalSJ: data.tanggalSJ,
      truckId: data.truckId,
      nomorPolisi: selectedTruck?.nomorPolisi || '',
      supirId: data.supirId,
      namaSupir: selectedSupir?.namaSupir || '',
      pt: selectedSupir?.pt || '',
      ruteId: data.ruteId,
      rute: selectedRute?.rute || '',
      uangJalan: selectedRute?.uangJalan || 0,
      materialId: data.materialId,
      material: selectedMaterial?.material || '',
      satuan: selectedMaterial?.satuan || '',
      qtyIsi: parseFloat(data.qtyIsi),
      tglTerkirim: null,
      qtyBongkar: null,
      quantityLoss: 0,
      abolishPenalty: false,
      status: 'pending',
      createdAt: new Date().toISOString(),
      createdBy: currentUser.name
    };
    
    const newList = [...suratJalanList, newSJ];
    setSuratJalanList(newList);
    
    // Auto-create transaksi keuangan
    await upsertItemToFirestore(db, "surat_jalan", { ...newSJ, isActive: true });

    // Auto-create transaksi keuangan untuk Uang Jalan (persist ke Firestore via addTransaksi)
if (canWriteTransaksi && selectedRute && Number(selectedRute.uangJalan || 0) > 0) {
  await addTransaksi({
    id: buildUangJalanTransaksiId(newSJ.id),
    tipe: "pengeluaran",
    nominal: Number(selectedRute.uangJalan || 0),
    keterangan: `Uang Jalan - ${newSJ.nomorSJ} (${selectedRute.rute})`,
    tanggal: data.tanggalSJ,
    suratJalanId: newSJ.id,
    pt: newSJ.pt,
  });
}

    
  };

  const updateSuratJalan = async (id, updates) => {
    const sj = suratJalanList.find((x) => String(x.id) === String(id));
    const nowIso = new Date().toISOString();
    const who = currentUser?.name || 'system';

    const patch = {
      ...(updates || {}),
      updatedAt: nowIso,
      updatedBy: who,
    };

    // DATA-SIDE LOCK:
    // Jika status menjadi 'gagal', uang jalan harus dianggap 0 untuk semua role.
    // Nilai uang jalan asli disimpan di deletedUangJalan agar bisa dipulihkan.
    if (patch.status === 'gagal') {
      const originalUangJalan = Number(sj?.uangJalan || 0);
      // Lock data: SJ gagal dianggap non-aktif (tidak boleh muncul di Laporan Kas)
      if (patch.isActive === undefined) patch.isActive = false;

      if (!patch.deletedUangJalan && originalUangJalan > 0) {
        patch.deletedUangJalan = {
          id: buildUangJalanTransaksiId(sj?.id),
          nominal: originalUangJalan,
          tanggal: (sj?.tglSJ || '').split('/').reverse().join('-') || nowIso.slice(0, 10),
          keterangan: (`Uang Jalan - ${String(sj?.nomorSJ || '')}`).trim(),
          pt: sj?.pt || '',
        };
      }
      patch.uangJalan = 0;
    }

    const updatedSJList = suratJalanList.map((x) =>
      String(x.id) === String(id) ? { ...x, ...patch } : x
    );
    setSuratJalanList(updatedSJList);

    // Persist ke Firestore
    await updateDoc(doc(db, 'surat_jalan', String(id)), sanitizeForFirestore(patch));

    // Jika jadi GAGAL dan ada transaksi uang jalan terkait, soft delete transaksinya
    if (patch.status === 'gagal') {
      try {
        const trans = transaksiList.find((t) => String(t.suratJalanId) === String(id));
        if (trans?.id) {
          await softDeleteItemInFirestore(db, 'transaksi', trans.id, who);
          setTransaksiList((prev) => prev.map((t) => (t.id === trans.id ? { ...t, isActive: false } : t)));
        }
      } catch (e) {
        console.warn('Soft delete transaksi uang jalan gagal:', e);
      }
    }
  };

  const markAsGagal = async (id) => {
    const sj = suratJalanList.find(s => s.id === id);
    const uangJalanTransaksi = transaksiList.find(t => t.suratJalanId === id);
    
    setConfirmDialog({
      show: true,
      message: 'Yakin ingin menandai Surat Jalan ini sebagai GAGAL?\n\n⚠️ Uang Jalan untuk SJ ini akan otomatis dihapus dari Laporan Keuangan.\n\n✅ Super Admin dapat restore SJ ini kembali nanti.',
      onConfirm: async () => {
        // Simpan data Uang Jalan untuk restore nanti
        const deletedUangJalan = uangJalanTransaksi ? {
          nominal: uangJalanTransaksi.nominal,
          keterangan: uangJalanTransaksi.keterangan,
          tanggal: uangJalanTransaksi.tanggal,
          id: uangJalanTransaksi.id
        } : null;
        
        // Update status SJ dengan menyimpan info Uang Jalan yang dihapus
        await updateSuratJalan(id, { 
          status: 'gagal',
          statusLabel: 'gagal',
          deletedUangJalan // Simpan untuk restore
        });
        
        // Hapus transaksi Uang Jalan yang terkait (Firestore + state)
if (uangJalanTransaksi?.id) {
  await softDeleteItemInFirestore(db, "transaksi", uangJalanTransaksi.id, currentUser?.name || "system").catch(() => {});
}
const updatedTransaksiList = transaksiList.filter(t => t.suratJalanId !== id);
setTransaksiList(updatedTransaksiList);
// Add to history log
        await addHistoryLog('mark_gagal', id, sj?.nomorSJ, {
          previousStatus: sj?.status,
          uangJalanDeleted: deletedUangJalan
        });
        
        setConfirmDialog({ show: false, message: '', onConfirm: null });
        setAlertMessage('✅ Surat Jalan ditandai GAGAL.\n💰 Uang Jalan telah dihapus dari keuangan.');
      }
    });
  };

  const restoreFromGagal = async (id) => {
    const sj = suratJalanList.find(s => s.id === id);
    
    setConfirmDialog({
      show: true,
      message: 'Restore Surat Jalan ini dari status GAGAL?\n\n✅ Status akan kembali ke PENDING.\n💰 Uang Jalan akan dibuat ulang di Laporan Keuangan.',
      onConfirm: async () => {
        const restoredNominal = Number(sj?.deletedUangJalan?.nominal || sj?.uangJalan || 0);

        // Update status kembali ke pending + re-activate SJ (lock data)
        await updateSuratJalan(id, {
          status: 'pending',
          statusLabel: 'pending',
          isActive: true,
          uangJalan: restoredNominal,
          deletedUangJalan: null,
        });

        // Restore transaksi Uang Jalan yang sebelumnya di-soft-delete (lebih aman daripada membuat transaksi baru)
        if (canWriteTransaksi && sj?.deletedUangJalan?.id) {
          try {
            await updateDoc(doc(db, 'transaksi', String(sj.deletedUangJalan.id)), sanitizeForFirestore({
              isActive: true,
              deletedAt: null,
              deletedBy: null,
              updatedAt: new Date().toISOString(),
              updatedBy: currentUser?.name || 'system',
            }));
          } catch (e) {
            console.warn('Restore transaksi gagal, fallback create baru:', e);
            if (canWriteTransaksi && restoredNominal > 0) {
              await addTransaksi({
                id: buildUangJalanTransaksiId(id),
                tipe: 'pengeluaran',
                nominal: restoredNominal,
                keterangan: (sj?.deletedUangJalan?.keterangan || `Uang Jalan - ${sj?.nomorSJ}`) + ' (Restored)',
                tanggal: sj?.deletedUangJalan?.tanggal || sj?.tanggalSJ || new Date().toISOString().slice(0, 10),
                suratJalanId: id,
                pt: sj?.pt,
              });
            }
          }
        } else if (canWriteTransaksi && restoredNominal > 0) {
          // Jika tidak ada id transaksi tersimpan, buat baru
          await addTransaksi({
                id: buildUangJalanTransaksiId(id),
                tipe: 'pengeluaran',
            nominal: restoredNominal,
            keterangan: (sj?.deletedUangJalan?.keterangan || `Uang Jalan - ${sj?.nomorSJ}`) + ' (Restored)',
            tanggal: sj?.deletedUangJalan?.tanggal || sj?.tanggalSJ || new Date().toISOString().slice(0, 10),
            suratJalanId: id,
            pt: sj?.pt,
          });
        }

        
        // Add to history log
        await addHistoryLog('restore_from_gagal', id, sj?.nomorSJ, {
          restoredTo: 'pending',
          uangJalanRestored: sj?.deletedUangJalan
        });
        
        setConfirmDialog({ show: false, message: '', onConfirm: null });
        setAlertMessage('✅ Surat Jalan di-restore!\n💰 Uang Jalan telah dibuat ulang.');
      }
    });
  };

  const deleteSuratJalan = async (id) => {
    setConfirmDialog({
      show: true,
      message: 'Yakin ingin menghapus Surat Jalan ini?',
      onConfirm: async () => {
  // Soft delete SJ & biaya terkait di Firestore
  await softDeleteItemInFirestore(db, "surat_jalan", id, currentUser?.name || "system").catch(() => {});
  const biayaToDelete = biayaList.filter(b => b.suratJalanId === id);
  if (biayaToDelete.length > 0) {
    try {
      const batch = writeBatch(db);
      biayaToDelete.forEach((b) => {
        batch.set(doc(db, "biaya", String(b.id)), sanitizeForFirestore({
          ...b,
          isActive: false,
          deletedAt: new Date().toISOString(),
          deletedBy: currentUser?.name || "system",
        }), { merge: true });
      });
      await batch.commit();
    } catch (e) {
      console.error("Soft delete biaya batch failed:", e);
    }
  }

  const newList = suratJalanList.filter(sj => sj.id !== id);
  const newBiayaList = biayaList.filter(b => b.suratJalanId !== id);
        setSuratJalanList(newList);
        setBiayaList(newBiayaList);
        setConfirmDialog({ show: false, message: '', onConfirm: null });
      }
    });
  };

  const addBiaya = async (data) => {
    const newBiaya = {
      id: 'B-' + Date.now(),
      ...data,
      createdAt: new Date().toISOString(),
      createdBy: currentUser.name
    };
    const newList = [...biayaList, newBiaya];
    setBiayaList(newList);
    await upsertItemToFirestore(db, "biaya", { ...newBiaya, isActive: true });
  };

  const deleteBiaya = async (id) => {
    setConfirmDialog({
      show: true,
      message: 'Yakin ingin menghapus biaya ini?',
      onConfirm: async () => {
  await softDeleteItemInFirestore(db, "biaya", id, currentUser?.name || "system").catch(() => {});
  const newList = biayaList.filter(b => b.id !== id);
        setBiayaList(newList);
        setConfirmDialog({ show: false, message: '', onConfirm: null });
      }
    });
  };

  const getTotalBiaya = (suratJalanId) => {
    return biayaList
      .filter(b => b.suratJalanId === suratJalanId)
      .reduce((sum, b) => sum + parseFloat(b.nominal || 0), 0);
  };

  const getStatusColor = (status) => {
    const colors = {
      pending: 'bg-yellow-100 text-yellow-800',
      terkirim: 'bg-green-100 text-green-800',
      gagal: 'bg-red-100 text-red-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getStatusIcon = (status) => {
    const icons = {
      pending: <Clock className="w-4 h-4" />,
      terkirim: <CheckCircle className="w-4 h-4" />,
      gagal: <XCircle className="w-4 h-4" />
    };
    return icons[status] || <FileText className="w-4 h-4" />;
  };

  const filteredSuratJalan = useMemo(
    () => suratJalanList.filter(sj => filter === 'all' || sj.status === filter),
    [suratJalanList, filter]
  );

  const sjStatusCounts = useMemo(() => ({
    pending: suratJalanList.filter(s => s.status === 'pending').length,
    terkirim: suratJalanList.filter(s => s.status === 'terkirim').length,
    gagal: suratJalanList.filter(s => s.status === 'gagal').length,
  }), [suratJalanList]);


// Cleanup on unmount
  useEffect(() => {
    return () => { isMountedRef.current = false; };
  }, []);

// Firestore subscriptions (hanya setelah login DAN currentUser/role tersedia)
  useEffect(() => {
    if (!authReady || !firebaseUser || !currentUser) {
      return;
    }

const qStartISO = getQueryStartISO();

// DATA OPERASIONAL: source of truth dari Firestore
let sjDocs = [];

const normalizeSJ = (row, docId) => {
  const id = row?.id || docId;
  const tanggalSJ = row?.tanggalSJ || row?.tglSJ || row?.tgl_sj || row?.tanggal || row?.date || "";
  return {
    ...(row || {}),
    id,
    tanggalSJ,
    isActive: row?.isActive !== false,
  };
};

const applySJ = () => {
  const list = sjDocs.filter((x) => !x?.deletedAt && x?.isActive !== false);
  list.sort((a, b) => (new Date(b?.tanggalSJ).getTime() || 0) - (new Date(a?.tanggalSJ).getTime() || 0));
  setSuratJalanList(list);
  didFirstLoadRef.current = true;
};

const unsubSuratJalan = onSnapshot(
  query(collection(db, "surat_jalan"), where("tanggalSJ", ">=", qStartISO)),
  (snap) => {
  sjDocs = snap.docs.map((d) => normalizeSJ(d.data() || {}, d.id));
  applySJ();
});

const unsubBiaya = onSnapshot(
  query(collection(db, "biaya"), where("tanggal", ">=", qStartISO)),
  (snap) => {
  const data = snap.docs
    .map((d) => {
      const row = d.data() || {};
      const id = row.id || d.id;
      return { ...row, id };
    })
    .filter((x) => !x?.deletedAt && x?.isActive !== false);
  setBiayaList(data);
});

// INVOICE: baca koleksi utama + legacy plural "invoices"
let invPrimary = [];
let invLegacy = [];

const normalizeInv = (row, docId) => {
  const id = row?.id || docId;
  const tglInvoice = row?.tglInvoice || row?.tanggalInvoice || row?.tgl_invoice || "";
  return {
    ...(row || {}),
    id,
    tglInvoice,
    isActive: row?.isActive !== false,
  };
};

const applyInv = () => {
  const merged = mergeById(invPrimary, invLegacy).filter((x) => !x?.deletedAt && x?.isActive !== false);
  const byInvoiceNumber = new Map();
  merged.forEach((inv) => {
    const key = String(inv?.noInvoice || inv?.id || '').trim();
    if (!key) return;
    const prev = byInvoiceNumber.get(key);
    if (!prev) {
      byInvoiceNumber.set(key, inv);
      return;
    }
    const prevTs = String(prev?.updatedAt || prev?.createdAt || '');
    const nextTs = String(inv?.updatedAt || inv?.createdAt || '');
    if (nextTs >= prevTs) byInvoiceNumber.set(key, inv);
  });
  const normalized = Array.from(byInvoiceNumber.values());
  normalized.sort((a, b) => (new Date(b?.tglInvoice).getTime() || 0) - (new Date(a?.tglInvoice).getTime() || 0));
  setInvoiceList(normalized);
};

const unsubInvoice = onSnapshot(
  query(collection(db, "invoice"), where("tglInvoice", ">=", qStartISO)),
  (snap) => {
  invPrimary = snap.docs.map((d) => normalizeInv(d.data() || {}, d.id));
  applyInv();
});

const unsubInvoiceLegacy = onSnapshot(
  query(collection(db, "invoices"), where("tglInvoice", ">=", qStartISO)),
  (snap) => {
  invLegacy = snap.docs.map((d) => normalizeInv(d.data() || {}, d.id));
  applyInv();
});

const unsubUangMuka = onSnapshot(
  query(collection(db, "uang_muka"), where("tanggal", ">=", qStartISO)),
  (snap) => {
  const data = snap.docs
    .map((d) => {
      const row = d.data() || {};
      return { ...row, id: row.id || d.id };
    })
    .filter((x) => !x?.deletedAt && x?.isActive !== false);
  data.sort((a, b) => (new Date(b?.tanggal).getTime() || 0) - (new Date(a?.tanggal).getTime() || 0));
  setUangMukaList(data);
}, (err) => {
  console.warn('[subscription] uang_muka error:', err.code);
  setUangMukaList([]);
});


const unsubTransaksi = onSnapshot(
  query(collection(db, "transaksi"), where("tanggal", ">=", qStartISO)),
  (snap) => {
  const data = snap.docs
    .map((d) => {
      const row = d.data() || {};
      const id = row.id || d.id;
      return { ...row, id };
    })
    .filter((x) => !x?.deletedAt && x?.isActive !== false);
  data.sort((a, b) => (new Date(b?.tanggal).getTime() || 0) - (new Date(a?.tanggal).getTime() || 0));
  setTransaksiList(data);
}, (err) => {
  console.warn('[subscription] transaksi tidak dapat diakses (role tidak cukup):', err.code);
  setTransaksiList([]);
});



  return () => {
try { unsubSuratJalan(); } catch {}
try { unsubBiaya(); } catch {}
try { unsubInvoice(); } catch {}
try { unsubInvoiceLegacy(); } catch {}
try { unsubUangMuka(); } catch {}
try { unsubTransaksi(); } catch {}
  };
// IMPORTANT: depend on authReady, firebaseUser, currentUser?.id so subscriptions
// start only after role is available, and restart if the logged-in user changes.
}, [authReady, firebaseUser, currentUser?.id]);


  // Reconcile/backfill transaksi uang jalan dari Surat Jalan yang sudah terlanjur ada (mis. hasil import lama)
  // Aman dijalankan berulang karena menggunakan deterministic ID dan pengecekan transaksi existing.
  const didReconcileUangJalanRef = useRef(false);

  useEffect(() => {
    if (!canWriteTransaksi) return;
    if (didReconcileUangJalanRef.current) return;

    if (!Array.isArray(suratJalanList) || !Array.isArray(transaksiList)) return;
    if (suratJalanList.length === 0) return;

    // Index transaksi existing by suratJalanId
    const existingSJIds = new Set(
      transaksiList
        .filter((t) => t?.suratJalanId)
        .map((t) => String(t.suratJalanId))
    );

    const missing = suratJalanList.filter((sj) => {
      if (!sj || sj.isActive === false) return false;
      const status = String(sj.status || "").toLowerCase();
      if (status === "gagal") return false;

      const nominal = Number(sj.uangJalan || 0);
      if (!(nominal > 0)) return false;

      return !existingSJIds.has(String(sj.id));
    });

    if (missing.length === 0) {
      didReconcileUangJalanRef.current = true;
      return;
    }

    (async () => {
      for (const sj of missing) {
        try {
          await upsertUangJalanTransaksiForSJ(sj);
        } catch (e) {
          console.warn("Reconcile uang jalan gagal:", e);
        }
      }
      didReconcileUangJalanRef.current = true;
    })();
  }, [canWriteTransaksi, suratJalanList, transaksiList]);


  if (!currentUser) {
    return <LoginPage onLogin={handleLogin} alertMessage={alertMessage} setAlertMessage={setAlertMessage} appSettings={appSettings} />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(160deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)' }}>
        <div className="text-center">
          <Package className="w-16 h-16 text-blue-600 animate-pulse mx-auto mb-4" />
          <p className="text-gray-600">Memuat data...</p>
        </div>
      </div>
    );
  }

  const DOCK_ITEMS = [
    { tab: 'surat-jalan', icon: Package,     label: 'SJ',       roles: ['superadmin','admin_sj','admin_keuangan','admin_invoice','reader'] },
    { tab: 'keuangan',    icon: DollarSign,  label: 'Keuangan', roles: ['superadmin','admin_keuangan','reader'] },
    { tab: 'laporan-kas', icon: FileText,    label: 'Laporan',  roles: ['superadmin','admin_keuangan','admin_invoice','admin_sj','reader'] },
    { tab: 'laporan-truk', icon: Truck,     label: 'Laporan Truk', roles: ['superadmin', 'admin_sj'] },
    { tab: 'payslip',     icon: DollarSign,  label: 'Gaji',     roles: ['superadmin', 'admin_keuangan', 'reader'] },
    { tab: 'invoicing',   icon: FileText,    label: 'Invoice',  roles: ['superadmin','admin_invoice','reader'] },
    { tab: 'uang-muka',   icon: DollarSign,  label: 'UM',       roles: ['superadmin','admin_invoice','reader'] },
    { tab: 'master-data', icon: Database,    label: 'Data',     roles: ['superadmin'] },
    { tab: 'users',       icon: Users,       label: 'Users',    roles: ['superadmin'] },
    { tab: 'settings',    icon: Settings,    label: 'Settings', roles: ['superadmin'] },
  ].filter(item => item.roles.includes(effectiveRole ?? ''));

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(160deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)' }}>
      {/* Liquid Glass Top Bar */}
      {effectiveRole && (
        <TopBar
          activeTab={activeTab}
          currentUser={currentUser}
          onLogout={handleLogout}
        />
      )}

      {/* Force Logout Warning Banner */}
      <AlertBanner banner={forceLogoutBanner} />

      {/* Content */}
      <div className="max-w-7xl mx-auto px-3 pb-24 sm:px-6 sm:pb-28">
        {activeTab === 'settings' && effectiveRole === 'superadmin' ? (
          <SettingsManagement
            currentUser={currentUser}
            appSettings={appSettings}
            onUpdateSettings={updateSettings}
            forceLogoutConfig={forceLogoutConfig}
            onUpdateForceLogout={updateForceLogoutConfig}
          />
        ) : activeTab === 'users' && effectiveRole === 'superadmin' ? (
          <UsersManagement
            usersList={usersList}
            currentUser={currentUser}
            onAddUser={() => {
              setModalType('addUser');
              setSelectedItem(null);
              setShowModal(true);
            }}
            onEditUser={(user) => {
              setModalType('editUser');
              setSelectedItem(user);
              setShowModal(true);
            }}
            onDeleteUser={deleteUser}
            onToggleActive={toggleUserActive}
          />
        ) : activeTab === 'master-data' && effectiveRole === 'superadmin' ? (
          <MasterDataManagement
            truckList={truckList}
            supirList={supirList}
            ruteList={ruteList}
            materialList={materialList}
            currentUser={currentUser}
            onAddTruck={() => {
              setModalType('addTruck');
              setSelectedItem(null);
              setShowModal(true);
            }}
            onEditTruck={(truck) => {
              setModalType('editTruck');
              setSelectedItem(truck);
              setShowModal(true);
            }}
            onDeleteTruck={deleteTruck}
            onAddSupir={() => {
              setModalType('addSupir');
              setSelectedItem(null);
              setShowModal(true);
            }}
            onEditSupir={(supir) => {
              setModalType('editSupir');
              setSelectedItem(supir);
              setShowModal(true);
            }}
            onDeleteSupir={deleteSupir}
            onAddRute={() => {
              setModalType('addRute');
              setSelectedItem(null);
              setShowModal(true);
            }}
            onEditRute={(rute) => {
              setModalType('editRute');
              setSelectedItem(rute);
              setShowModal(true);
            }}
            onDeleteRute={deleteRute}
            onAddMaterial={() => {
              setModalType('addMaterial');
              setSelectedItem(null);
              setShowModal(true);
            }}
            onEditMaterial={(material) => {
              setModalType('editMaterial');
              setSelectedItem(material);
              setShowModal(true);
            }}
            onDeleteMaterial={deleteMaterial}
            onDownloadTemplate={downloadTemplate}
            onImportData={importData}
            showRitasiBulkUpload={showRitasiBulkUpload}
            setShowRitasiBulkUpload={setShowRitasiBulkUpload}
          />
        ) : activeTab === 'keuangan' ? (
          <KeuanganManagement
            transaksiList={transaksiList}
            currentUser={currentUser}
            onAddTransaksi={() => {
              setModalType('addTransaksi');
              setSelectedItem(null);
              setShowModal(true);
            }}
            onDeleteTransaksi={deleteTransaksi}
          />
        ) : activeTab === 'laporan-kas' ? (
          <Suspense fallback={<div className="flex items-center justify-center h-32 text-slate-400 text-sm">Memuat...</div>}>
            <LaporanKasPage
              suratJalanList={suratJalanList}
              transaksiList={transaksiList}
            />
          </Suspense>
        ) : activeTab === 'laporan-truk' ? (
          <Suspense fallback={<div className="flex items-center justify-center h-32 text-slate-400 text-sm">Memuat...</div>}>
            <LaporanTrukPage
              suratJalanList={suratJalanList}
              truckList={truckList}
              currentUser={currentUser}
            />
          </Suspense>
        ) : activeTab === 'payslip' ? (
          <Suspense fallback={<div className="flex items-center justify-center h-32 text-slate-400 text-sm">Memuat...</div>}>
            <PayslipReport
              currentUser={currentUser}
            />
          </Suspense>
        ) : activeTab === 'uang-muka' ? (
          <UangMukaManagement
            uangMukaList={uangMukaList}
            suratJalanList={suratJalanList}
            currentUser={currentUser}
            onAddUangMuka={() => {
              setModalType('addUangMuka');
              setSelectedItem(null);
              setShowModal(true);
            }}
            onDeleteUangMuka={deleteUangMuka}
            formatCurrency={formatCurrency}
          />
        ) : activeTab === 'invoicing' ? (
          <InvoiceManagement
            invoiceList={invoiceList}
            suratJalanList={suratJalanList}
            currentUser={currentUser}
            onAddInvoice={() => {
              setModalType('addInvoice');
              setSelectedItem(null);
              setShowModal(true);
            }}
            onDeleteInvoice={deleteInvoice}
            formatCurrency={formatCurrency}
          />
        ) : (
          <>
        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
          <StatCard
            title="Total Surat Jalan"
            value={suratJalanList.length}
            icon={<FileText className="w-6 h-6" />}
            color="bg-blue-500"
          />
          <StatCard
            title="Pending"
            value={sjStatusCounts.pending}
            icon={<Clock className="w-6 h-6" />}
            color="bg-yellow-500"
          />
          <StatCard
            title="Terkirim"
            value={sjStatusCounts.terkirim}
            icon={<CheckCircle className="w-6 h-6" />}
            color="bg-green-500"
          />
          <StatCard
            title="Gagal"
            value={sjStatusCounts.gagal}
            icon={<XCircle className="w-6 h-6" />}
            color="bg-red-500"
          />
        </div>

        {/* Actions & Filters */}
        <div className="bg-white rounded-lg shadow-md p-3 sm:p-4 mb-4 sm:mb-6">
          <div className="flex flex-wrap gap-2 sm:gap-3 items-center justify-between">
            <div className="flex gap-2 flex-wrap">
              {(effectiveRole === 'superadmin' || effectiveRole === 'admin_sj') && (
                <>
                  <button
                    onClick={() => {
                      setModalType('addSJ');
                      setSelectedItem(null);
                      setShowModal(true);
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg flex items-center space-x-1 sm:space-x-2 text-sm sm:text-base transition"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Tambah Surat Jalan</span>
                  </button>
                  
                  <button
                    onClick={() => downloadTemplate('suratjalan')}
                    className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg flex items-center space-x-1 sm:space-x-2 text-sm sm:text-base transition"
                  >
                    <FileText className="w-4 h-4" />
                    <span className="hidden sm:inline">Download Template</span><span className="sm:hidden">Template</span>
                  </button>
                  
                  <label className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg flex items-center space-x-1 sm:space-x-2 text-sm sm:text-base transition cursor-pointer">
                    <Package className="w-4 h-4" />
                    <span className="hidden sm:inline">Import Data</span><span className="sm:hidden">Import</span>
                    <input
                      type="file"
                      accept=".csv"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) importData('suratjalan', file);
                        // Allow re-uploading the same file name
                        e.target.value = '';
                      }}
                      className="hidden"
                    />
                  </label>

                  <button
                    onClick={async () => { await downloadSJRecapToExcel(suratJalanList, { startDate: sjRecapStartDate, endDate: sjRecapEndDate, dateField: sjRecapDateField }); }}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg flex items-center space-x-1 sm:space-x-2 text-sm sm:text-base transition"
                  >
                    <FileText className="w-4 h-4" />
                    <span>Download Rekapan</span>
                  </button>
                </>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setFilter('all')}
                className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-sm sm:text-base transition ${filter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
              >
                Semua
              </button>
              <button
                onClick={() => setFilter('pending')}
                className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-sm sm:text-base transition ${filter === 'pending' ? 'bg-yellow-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
              >
                Pending
              </button>
              <button
                onClick={() => setFilter('terkirim')}
                className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-sm sm:text-base transition ${filter === 'terkirim' ? 'bg-green-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
              >
                Terkirim
              </button>
              <button
                onClick={() => setFilter('gagal')}
                className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-sm sm:text-base transition ${filter === 'gagal' ? 'bg-red-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
              >
                Gagal
              </button>
            </div>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-100 rounded-lg shadow-sm p-4 mb-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Berdasarkan Tanggal</label>
              <select
                value={sjRecapDateField}
                onChange={(e) => setSjRecapDateField(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="tanggalSJ">Tanggal SJ</option>
                <option value="tglTerkirim">Tanggal Terkirim</option>
                <option value="createdAt">Tanggal Dibuat</option>
                <option value="updatedAt">Tanggal Diupdate</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal Mulai</label>
              <input
                type="date"
                value={sjRecapStartDate}
                onChange={(e) => setSjRecapStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal Akhir</label>
              <input
                type="date"
                value={sjRecapEndDate}
                onChange={(e) => setSjRecapEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <button
                onClick={async () => { await downloadSJRecapToExcel(suratJalanList, { startDate: sjRecapStartDate, endDate: sjRecapEndDate, dateField: sjRecapDateField }); }}
                className="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition"
              >
                <FileText className="w-4 h-4" />
                <span>Download Excel</span>
              </button>
            </div>
          </div>
        </div>

        {/* Surat Jalan List */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {/* Table header */}
          <div className="hidden sm:grid grid-cols-[1fr_1.5fr_1.2fr_100px] px-4 py-2.5 bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            <span>No. SJ</span>
            <span>Rute</span>
            <span>Supir · Truk</span>
            <span>Status</span>
          </div>
          {filteredSuratJalan.length === 0 ? (
            <div className="p-8 text-center">
              <Package className="w-12 h-12 mx-auto text-slate-200 mb-3" />
              <p className="text-slate-400 text-sm">Belum ada data Surat Jalan</p>
              {(effectiveRole === 'superadmin' || effectiveRole === 'admin_sj') && (
                <button
                  onClick={() => {
                    setModalType('addSJ');
                    setSelectedItem(null);
                    setShowModal(true);
                  }}
                  className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg inline-flex items-center gap-2 text-sm"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tambah Surat Jalan Pertama</span>
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {filteredSuratJalan.map(sj => (
                <SuratJalanCard
                  key={sj.id}
                  suratJalan={sj}
                  biayaList={biayaList.filter(b => b.suratJalanId === sj.id)}
                  totalBiaya={getTotalBiaya(sj.id)}
                  currentUser={currentUser}
                  onUpdate={(sj) => {
                    setSelectedItem(sj);
                    setModalType('markTerkirim');
                    setShowModal(true);
                  }}
                  onEditTerkirim={(sj) => {
                    setSelectedItem(sj);
                    setModalType('editTerkirim');
                    setShowModal(true);
                  }}
                  onMarkGagal={markAsGagal}
                  onRestore={restoreFromGagal}
                  onDeleteBiaya={deleteBiaya}
                  formatCurrency={formatCurrency}
                  getStatusColor={getStatusColor}
                  getStatusIcon={getStatusIcon}
                />
              ))}
            </div>
          )}
        </div>
        </>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <Modal
          type={modalType}
          selectedItem={selectedItem}
          currentUser={currentUser}
          setAlertMessage={setAlertMessage}
          truckList={truckList}
          supirList={supirList}
          ruteList={ruteList}
          materialList={materialList}
          suratJalanList={suratJalanList}
          uangMukaList={uangMukaList}
          onClose={() => setShowModal(false)}
          onSubmit={async (data) => {
            if (modalType === 'addSJ') {
              await addSuratJalan(data);
              setShowModal(false);
            } else if (modalType === 'markTerkirim' || modalType === 'editTerkirim') {
              const qtyBongkar = parseFloat(data.qtyBongkar);
              const qtyIsi = parseFloat(selectedItem.qtyIsi);
              const quantityLoss = qtyIsi - qtyBongkar;

              await updateSuratJalan(selectedItem.id, {
                status: 'terkirim',
                tglTerkirim: data.tglTerkirim,
                qtyBongkar: qtyBongkar,
                quantityLoss: Math.max(0, quantityLoss),
                abolishPenalty: data.abolishPenalty || false
              });
              setShowModal(false);
            } else if (modalType === 'addTransaksi') {
              await addTransaksi(data);
              setShowModal(false);
            } else if (modalType === 'addUser') {
              const success = await addUser(data);
              if (success) {
                setShowModal(false);
              }
            } else if (modalType === 'editUser') {
              await updateUser(selectedItem.id, data);
              setShowModal(false);
            } else if (modalType === 'addTruck') {
              await addTruck(data);
              setShowModal(false);
            } else if (modalType === 'editTruck') {
              await updateTruck(selectedItem.id, data);
              setShowModal(false);
            } else if (modalType === 'addSupir') {
              await addSupir(data);
              setShowModal(false);
            } else if (modalType === 'editSupir') {
              await updateSupir(selectedItem.id, data);
              setShowModal(false);
            } else if (modalType === 'addRute') {
              await addRute(data);
              setShowModal(false);
            } else if (modalType === 'editRute') {
              await updateRute(selectedItem.id, data);
              setShowModal(false);
            } else if (modalType === 'addMaterial') {
              await addMaterial(data);
              setShowModal(false);
            } else if (modalType === 'editMaterial') {
              await updateMaterial(selectedItem.id, data);
              setShowModal(false);
            } else if (modalType === 'addInvoice') {
              await addInvoice(data);
              setShowModal(false);
            } else if (modalType === 'editInvoice') {
              await editInvoice(selectedItem.id, data);
              setShowModal(false);
            } else if (modalType === 'addUangMuka') {
              await addUangMuka(data);
              setShowModal(false);
            }
          }}
        />
      )}

      {/* Alert Dialog */}
      {alertMessage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center sm:p-4 z-50">
          <div className="bg-white rounded-t-2xl sm:rounded-lg shadow-xl sm:max-w-md w-full p-4 sm:p-6">
            <div className="flex items-center space-x-3 mb-4">
              <AlertCircle className="w-6 h-6 text-blue-600" />
              <h2 className="text-xl font-bold text-gray-800">Informasi</h2>
            </div>
            <p className="text-gray-700 whitespace-pre-line mb-6">{alertMessage}</p>
            <button
              onClick={() => setAlertMessage('')}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg transition font-medium"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      {confirmDialog.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center sm:p-4 z-50">
          <div className="bg-white rounded-t-2xl sm:rounded-lg shadow-xl sm:max-w-md w-full p-4 sm:p-6">
            <div className="flex items-center space-x-3 mb-4">
              <AlertCircle className="w-6 h-6 text-orange-600" />
              <h2 className="text-xl font-bold text-gray-800">Konfirmasi</h2>
            </div>
            <p className="text-gray-700 mb-6">{confirmDialog.message}</p>
            <div className="flex space-x-3">
              <button
                onClick={() => setConfirmDialog({ show: false, message: '', onConfirm: null })}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 py-2 rounded-lg transition font-medium"
              >
                Batal
              </button>
              <button
                onClick={confirmDialog.onConfirm}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg transition font-medium"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ritasi Bulk Upload Modal */}
      {showRitasiBulkUpload && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full mx-4 max-h-96 overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold">Bulk Upload Ritasi</h2>
                <button
                  onClick={() => setShowRitasiBulkUpload(false)}
                  className="text-gray-500 hover:text-gray-700 text-2xl"
                >
                  ×
                </button>
              </div>
              <Suspense fallback={<div className="flex items-center justify-center h-32 text-slate-400 text-sm">Memuat...</div>}>
                <RitasiBulkUpload
                  ruteList={ruteList}
                  onSuccess={() => {
                    setShowRitasiBulkUpload(false);
                    loadRuteData();
                  }}
                />
              </Suspense>
            </div>
          </div>
        </div>
      )}

      {/* Liquid Glass Dock */}
      {effectiveRole && (
        <DockNav
          items={DOCK_ITEMS}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      )}
    </div>
  );
};

const MasterDataManagement = ({
  truckList, supirList, ruteList, materialList, currentUser,
  onAddTruck, onEditTruck, onDeleteTruck,
  onAddSupir, onEditSupir, onDeleteSupir,
  onAddRute, onEditRute, onDeleteRute,
  onAddMaterial, onEditMaterial, onDeleteMaterial,
  onDownloadTemplate, onImportData,
  showRitasiBulkUpload, setShowRitasiBulkUpload
}) => {
  const [masterTab, setMasterTab] = useState('truck');
  const [alertMessage, setAlertMessage] = useState('');

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
          className={`flex-1 px-4 py-2 rounded-lg transition ${masterTab === 'truck' ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
        >
          <span>🚛 Truck</span>
        </button>
        <button
          onClick={() => setMasterTab('supir')}
          className={`flex-1 px-4 py-2 rounded-lg transition ${masterTab === 'supir' ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
        >
          <span>👨‍✈️ Supir</span>
        </button>
        <button
          onClick={() => setMasterTab('rute')}
          className={`flex-1 px-4 py-2 rounded-lg transition ${masterTab === 'rute' ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
        >
          <span>🗺️ Rute</span>
        </button>
        <button
          onClick={() => setMasterTab('material')}
          className={`flex-1 px-4 py-2 rounded-lg transition ${masterTab === 'material' ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
        >
          <span>📦 Material</span>
        </button>
      </div>

      {/* Truck Master Data */}
      {masterTab === 'truck' && (
        <div>
          <div className="bg-white rounded-lg shadow-md p-4 mb-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-gray-800">Master Data Truck</h2>
                <p className="text-sm text-gray-600">Total: {truckList.length} truck</p>
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
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tambah Truck</span>
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {truckList.length === 0 ? (
              <div className="bg-white rounded-lg shadow-md p-8 text-center">
                <Truck className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">Belum ada data truck</p>
              </div>
            ) : (
              truckList.map(truck => (
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
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1"
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
                <p className="text-sm text-gray-600">Total: {supirList.length} supir</p>
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
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tambah Supir</span>
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {supirList.length === 0 ? (
              <div className="bg-white rounded-lg shadow-md p-8 text-center">
                <Users className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">Belum ada data supir</p>
              </div>
            ) : (
              supirList.map(supir => (
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
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1"
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
                <p className="text-sm text-gray-600">Total: {ruteList.length} rute</p>
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
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tambah Rute</span>
                </button>
                {currentUser?.role?.toLowerCase() === 'superadmin' && (
                  <button
                    onClick={() => setShowRitasiBulkUpload(true)}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center space-x-2 transition"
                  >
                    <FileText className="w-4 h-4" />
                    <span>📊 Bulk Upload Ritasi</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {ruteList.length === 0 ? (
              <div className="bg-white rounded-lg shadow-md p-8 text-center">
                <Package className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">Belum ada data rute</p>
              </div>
            ) : (
              ruteList.map(rute => (
                <div key={rute.id} className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-gray-800 mb-2">{rute.rute}</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-gray-600">Rute ID:</p>
                          <p className="font-semibold text-gray-800">{rute.id}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Uang Jalan:</p>
                          <p className="font-semibold text-blue-600">{formatCurrency(rute.uangJalan)}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Ritasi:</p>
                          <p className="font-semibold text-green-600">{formatCurrency(rute.ritasi || 0)}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Uang Muka:</p>
                          <p className="font-semibold text-orange-600">{formatCurrency(rute.uangMuka || 0)}</p>
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
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1"
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
                <p className="text-sm text-gray-600">Total: {materialList.length} material</p>
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
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tambah Material</span>
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {materialList.length === 0 ? (
              <div className="bg-white rounded-lg shadow-md p-8 text-center">
                <Package className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">Belum ada data material</p>
              </div>
            ) : (
              materialList.map(material => (
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
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1"
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
    </div>
  );
};

// Settings Component
// Helper konversi datetime untuk force logout picker
const isoToDatetimeLocal = (isoStr) => {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d)) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const datetimeLocalToIso = (localStr) => {
  if (!localStr) return '';
  return new Date(localStr).toISOString();
};

const SettingsManagement = ({ currentUser, appSettings, onUpdateSettings, forceLogoutConfig, onUpdateForceLogout }) => {
  const effectiveRole = currentUser?.role === 'owner' ? 'reader' : currentUser?.role;

  const [settings, setSettings] = useState({
    companyName: appSettings?.companyName || '',
    logoUrl: appSettings?.logoUrl || '',
    loginFooterText: appSettings?.loginFooterText || 'Masuk untuk mengakses dashboard monitoring'
  });
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(appSettings?.logoUrl || '');

  const [flConfig, setFlConfig] = useState({
    enabled:     forceLogoutConfig?.enabled ?? false,
    scheduledAt: isoToDatetimeLocal(forceLogoutConfig?.scheduledAt),
    reason:      forceLogoutConfig?.reason ?? '',
  });

  // Sync flConfig saat forceLogoutConfig dari Firestore berubah
  useEffect(() => {
    setFlConfig({
      enabled:     forceLogoutConfig?.enabled ?? false,
      scheduledAt: isoToDatetimeLocal(forceLogoutConfig?.scheduledAt),
      reason:      forceLogoutConfig?.reason ?? '',
    });
  }, [forceLogoutConfig]);

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
      reader.onerror = () => {
        alert('Gagal membaca file gambar. Pastikan file tidak rusak dan coba lagi.');
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
      <div className="bg-white rounded-lg shadow-md p-3 sm:p-6">
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
            <div className="bg-blue-50 rounded-lg p-3 sm:p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Package className="w-5 h-5 text-blue-600" />
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
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-2">
                  Nama ini akan ditampilkan di halaman login dan header aplikasi
                </p>
              </div>
            </div>

            {/* Logo Upload */}
            <div className="bg-green-50 rounded-lg p-3 sm:p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-green-600" />
                Logo Perusahaan
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Upload Logo
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
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
            <div className="bg-purple-50 rounded-lg p-3 sm:p-6">
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
            <div className="bg-gray-50 rounded-lg p-3 sm:p-6">
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
                    className="w-full bg-blue-600 text-white py-2 rounded-lg opacity-75"
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
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg flex items-center gap-2 transition"
              >
                <CheckCircle className="w-4 h-4" />
                Simpan Pengaturan
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Force Logout Card — hanya superadmin */}
      {canManageSettings && (
        <div className="bg-white rounded-lg shadow-md p-3 sm:p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <Clock className="w-5 h-5 text-orange-600" />
                Jadwal Force Logout
              </h2>
              <p className="text-gray-600 text-sm mt-1">
                Paksa semua user (kecuali Super Admin) keluar dari sistem pada waktu yang ditentukan.
              </p>
            </div>
          </div>

          <div className="bg-orange-50 rounded-lg p-3 sm:p-6 space-y-5">
            {/* Toggle enable */}
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="fl-enabled"
                checked={flConfig.enabled}
                onChange={(e) => setFlConfig({ ...flConfig, enabled: e.target.checked })}
                className="w-5 h-5 accent-orange-500 cursor-pointer"
              />
              <label htmlFor="fl-enabled" className="font-semibold text-gray-800 cursor-pointer">
                Aktifkan jadwal logout otomatis
              </label>
            </div>

            {/* Datetime + Reason (hanya tampil jika enabled) */}
            {flConfig.enabled && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Waktu Logout Otomatis *
                  </label>
                  <input
                    type="datetime-local"
                    value={flConfig.scheduledAt}
                    onChange={(e) => setFlConfig({ ...flConfig, scheduledAt: e.target.value })}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-400 text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Waktu lokal Anda. Semua user akan di-logout pada waktu ini (Super Admin dikecualikan).
                    Warning muncul di T-20, T-15, T-10, T-5 menit.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Alasan / Pesan (opsional)
                  </label>
                  <input
                    type="text"
                    value={flConfig.reason}
                    onChange={(e) => setFlConfig({ ...flConfig, reason: e.target.value })}
                    placeholder="Contoh: Maintenance server rutin"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-400 text-sm"
                  />
                </div>
              </>
            )}

            {/* Status display */}
            {forceLogoutConfig?.enabled && forceLogoutConfig?.scheduledAt && (
              <div className={`rounded-lg p-3 text-sm ${forceLogoutConfig.executedAt ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                {forceLogoutConfig.executedAt ? (
                  <span>✅ Force logout telah dieksekusi pada{' '}
                    <strong>{new Date(forceLogoutConfig.executedAt).toLocaleString('id-ID')}</strong>
                  </span>
                ) : (
                  <span>⏳ Dijadwalkan pada{' '}
                    <strong>{new Date(forceLogoutConfig.scheduledAt).toLocaleString('id-ID')}</strong>
                    {' '}— menunggu waktu yang ditentukan.
                  </span>
                )}
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-3 flex-wrap">
              <button
                onClick={() => {
                  if (flConfig.enabled) {
                    if (!flConfig.scheduledAt) { alert('Waktu logout harus diisi!'); return; }
                    if (new Date(datetimeLocalToIso(flConfig.scheduledAt)) <= new Date()) {
                      alert('Waktu logout harus di masa depan!'); return;
                    }
                  }
                  onUpdateForceLogout({
                    ...flConfig,
                    scheduledAt: flConfig.enabled ? datetimeLocalToIso(flConfig.scheduledAt) : null,
                    executedAt: null,
                  });
                  alert(flConfig.enabled ? '✅ Jadwal force logout disimpan!' : '✅ Force logout dinonaktifkan!');
                }}
                className="bg-orange-500 hover:bg-orange-600 text-white px-5 py-2 rounded-lg flex items-center gap-2 text-sm transition"
              >
                <CheckCircle className="w-4 h-4" />
                Simpan Jadwal
              </button>

              {forceLogoutConfig?.enabled && (
                <button
                  onClick={() => {
                    if (confirm('Yakin ingin menonaktifkan force logout?')) {
                      onUpdateForceLogout({ enabled: false, scheduledAt: null, reason: '', executedAt: null });
                      alert('Force logout dinonaktifkan.');
                    }
                  }}
                  className="bg-gray-500 hover:bg-gray-600 text-white px-5 py-2 rounded-lg flex items-center gap-2 text-sm transition"
                >
                  <XCircle className="w-4 h-4" />
                  Nonaktifkan
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const KeuanganManagement = ({ transaksiList, currentUser, onAddTransaksi, onDeleteTransaksi }) => {
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
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow-md p-3 sm:p-6">
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

        <div className="bg-white rounded-lg shadow-md p-3 sm:p-6">
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

        <div className="bg-white rounded-lg shadow-md p-3 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm">Saldo Kas</p>
              <p className={`text-2xl font-bold mt-1 ${saldoKas >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                {formatCurrency(saldoKas)}
              </p>
            </div>
            <div className="bg-blue-500 p-3 rounded-lg text-white">
              <DollarSign className="w-6 h-6" />
            </div>
          </div>
        </div>
      </div>

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
          filteredTransaksi.map(transaksi => (
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
    </div>
  );
};

const UsersManagement = ({ usersList, currentUser, onAddUser, onEditUser, onDeleteUser, onToggleActive }) => {
  const getRoleBadgeColor = (role) => {
    const colors = {
      superadmin: 'bg-red-100 text-red-800',
      admin_sj: 'bg-blue-100 text-blue-800',
      admin_keuangan: 'bg-green-100 text-green-800',
      admin_invoice: 'bg-purple-100 text-purple-800',
      reader: 'bg-gray-100 text-gray-800'
    };
    return colors[role] || 'bg-gray-100 text-gray-800';
  };

  const getRoleLabel = (role) => {
    const labels = {
      superadmin: 'Super Administrator',
      admin_sj: 'Admin Surat Jalan',
      admin_keuangan: 'Admin Keuangan',
      admin_invoice: 'Admin Invoice',
      reader: 'Reader'
    };
    return labels[role] || role;
  };

  return (
    <div>
      <div className="bg-white rounded-lg shadow-md p-4 mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Kelola User</h2>
            <p className="text-sm text-gray-600">Total: {usersList.length} user</p>
          </div>
          <button
            onClick={onAddUser}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah User</span>
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {usersList.map(user => (
          <div key={user.id} className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-2">
                  <h3 className="text-lg font-bold text-gray-800">{user.name}</h3>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getRoleBadgeColor(user.role)}`}>
                    {getRoleLabel(user.role)}
                  </span>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${user.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {user.isActive ? 'Aktif' : 'Nonaktif'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-600">Username:</p>
                    <p className="font-semibold text-gray-800">{user.username}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Dibuat:</p>
                    <p className="font-semibold text-gray-800">
                      {new Date(user.createdAt).toLocaleDateString('id-ID')}
                    </p>
                  </div>
                </div>
                {user.createdBy && (
                  <p className="text-xs text-gray-500 mt-2">
                    Dibuat oleh: {user.createdBy}
                  </p>
                )}
              </div>
              
              <div className="flex flex-col space-y-2 ml-4">
                {user.role !== 'superadmin' && (
                  <>
                    <button
                      onClick={() => onToggleActive(user.id)}
                      className={`px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1 whitespace-nowrap ${
                        user.isActive 
                          ? 'bg-orange-600 hover:bg-orange-700 text-white' 
                          : 'bg-green-600 hover:bg-green-700 text-white'
                      }`}
                    >
                      {user.isActive ? (
                        <>
                          <XCircle className="w-4 h-4" />
                          <span>Nonaktifkan</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-4 h-4" />
                          <span>Aktifkan</span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => onEditUser(user)}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1 whitespace-nowrap"
                    >
                      <Edit className="w-4 h-4" />
                      <span>Edit</span>
                    </button>
                    <button
                      onClick={() => onDeleteUser(user.id)}
                      className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1 whitespace-nowrap"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Hapus</span>
                    </button>
                  </>
                )}
                {user.role === 'superadmin' && (
                  <div className="text-xs text-gray-500 italic px-4 py-2">
                    Super Admin tidak dapat diubah
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};




const Modal = ({ type, selectedItem, currentUser, setAlertMessage, truckList = [], supirList = [], ruteList = [], materialList = [], suratJalanList = [], uangMukaList = [], onClose, onSubmit }) => {
  const [searchInvoiceSJ, setSearchInvoiceSJ] = useState('');
  const initializedRef = React.useRef(false);
  const [formData, setFormData] = useState({
    nomorSJ: '',
    tanggalSJ: new Date().toISOString().split('T')[0],
    truckId: '',
    supirId: '',
    ruteId: '',
    materialId: '',
    qtyIsi: '',
    tglTerkirim: selectedItem?.tglTerkirim || new Date().toISOString().split('T')[0],
    qtyBongkar: selectedItem?.qtyBongkar || '',
    abolishPenalty: selectedItem?.abolishPenalty || false,
    noInvoice: '',
    tglInvoice: new Date().toISOString().split('T')[0],
    selectedSJIds: [],
    ruteHarga: {},
    jenisBiaya: '',
    nominal: '',
    keteranganBiaya: '',
    username: selectedItem?.username || '',
    password: '',
    name: selectedItem?.name || '',
    role: selectedItem?.role || '',
    tipe: '',
    tanggal: new Date().toISOString().split('T')[0],
    keteranganTransaksi: '',
    nomorPolisi: selectedItem?.nomorPolisi || '',
    isActive: selectedItem?.isActive !== undefined ? selectedItem.isActive : true,
    namaSupir: selectedItem?.namaSupir || '',
    pt: selectedItem?.pt || '',
    rute: selectedItem?.rute || '',
    uangJalan: selectedItem?.uangJalan || '',
    ritasi: selectedItem?.ritasi || '',
    uangMuka: selectedItem?.uangMuka || '',
    material: selectedItem?.material || '',
    satuan: selectedItem?.satuan || '',
    sjIdUM: '',
    nomorSJUM: '',
    jumlahUM: '',
    tanggalUM: new Date().toISOString().split('T')[0],
    keteranganUM: '',
  });

  // Initialize selectedSJIds untuk editInvoice
  useEffect(() => {
    if (type === 'editInvoice' && selectedItem && !initializedRef.current) {
      setFormData(prev => ({
        ...prev,
        noInvoice: selectedItem.noInvoice || '',
        tglInvoice: selectedItem.tglInvoice || new Date().toISOString().split('T')[0],
        selectedSJIds: selectedItem.suratJalanIds || [],
        ruteHarga: selectedItem.ruteHarga || {}
      }));
      initializedRef.current = true;
    }
    
    // Reset ref saat modal dibuka untuk type lain
    if (type !== 'editInvoice') {
      initializedRef.current = false;
    }
  }, [type, selectedItem]);

  const handleSubmit = () => {
    if (type === 'addSJ') {
      // Validasi semua 9 field wajib diisi
      if (!formData.nomorSJ || !formData.tanggalSJ || !formData.truckId || 
          !formData.supirId || !formData.ruteId || !formData.materialId || !formData.qtyIsi) {
        setAlertMessage('Semua field wajib diisi!\n\nPastikan Anda sudah mengisi:\n1. Nomor SJ\n2. Tanggal SJ\n3. Nomor Polisi (Truck)\n4. Nama Supir\n5. Rute\n6. Material\n7. Qty Isi');
        return;
      }
      
      if (parseFloat(formData.qtyIsi) <= 0) {
        setAlertMessage('Qty Isi harus lebih besar dari 0!');
        return;
      }
      
      onSubmit(formData);
    } else if (type === 'markTerkirim' || type === 'editTerkirim') {
      // Validasi field wajib
      if (!formData.tglTerkirim || !formData.qtyBongkar) {
        setAlertMessage('Tgl Terkirim dan Qty Bongkar wajib diisi!');
        return;
      }
      
      // Validasi Tgl Terkirim tidak boleh lebih awal dari Tgl SJ
      const tglSJ = new Date(selectedItem.tanggalSJ);
      const tglTerkirim = new Date(formData.tglTerkirim);
      if (tglTerkirim < tglSJ) {
        setAlertMessage('Tgl Terkirim tidak boleh lebih awal dari Tgl SJ!\n\nTgl SJ: ' + new Date(selectedItem.tanggalSJ).toLocaleDateString('id-ID'));
        return;
      }
      
      // Validasi Qty Bongkar tidak boleh lebih besar dari Qty Isi
      const qtyBongkar = parseFloat(formData.qtyBongkar);
      const qtyIsi = parseFloat(selectedItem.qtyIsi);
      if (qtyBongkar > qtyIsi) {
        setAlertMessage('Qty Bongkar tidak boleh lebih besar dari Qty Isi!\n\nQty Isi: ' + qtyIsi + ' ' + selectedItem.satuan);
        return;
      }
      
      if (qtyBongkar <= 0) {
        setAlertMessage('Qty Bongkar harus lebih besar dari 0!');
        return;
      }
      
      onSubmit(formData);
    } else if (type === 'addInvoice' || type === 'editInvoice') {
      if (!formData.noInvoice || !formData.tglInvoice) {
        setAlertMessage('No Invoice dan Tgl Invoice wajib diisi!');
        return;
      }
      if (formData.selectedSJIds.length === 0) {
        setAlertMessage('Pilih minimal 1 Surat Jalan untuk invoice!');
        return;
      }
      onSubmit(formData);
    } else if (type === 'addUangMuka') {
      if (!formData.sjIdUM || !formData.jumlahUM || !formData.tanggalUM) {
        setAlertMessage('Surat Jalan, Jumlah, dan Tanggal wajib diisi!');
        return;
      }
      if (parseFloat(formData.jumlahUM) <= 0) {
        setAlertMessage('Jumlah harus lebih besar dari 0!');
        return;
      }
      onSubmit({
        sjId: formData.sjIdUM,
        nomorSJ: formData.nomorSJUM,
        jumlah: formData.jumlahUM,
        tanggal: formData.tanggalUM,
        keterangan: formData.keteranganUM,
      });
    } else if (type === 'addTransaksi') {
      if (!formData.tipe || !formData.pt || !formData.nominal || !formData.keteranganTransaksi) {
        setAlertMessage('Tipe, PT, Nominal, dan Keterangan harus diisi!');
        return;
      }
      if (parseFloat(formData.nominal) <= 0) {
        setAlertMessage('Nominal harus lebih besar dari 0!');
        return;
      }
      onSubmit({
        tipe: formData.tipe,
        pt: formData.pt,
        nominal: parseFloat(formData.nominal),
        keterangan: formData.keteranganTransaksi,
        tanggal: formData.tanggal
      });
    } else if (type === 'addUser' || type === 'editUser') {
      if (!formData.username || !formData.name || !formData.role) {
        setAlertMessage('Username, Nama Lengkap, dan Role harus diisi!');
        return;
      }
      if (type === 'addUser' && !formData.password) {
        setAlertMessage('Password harus diisi!');
        return;
      }
      
      const userData = {
        username: formData.username,
        name: formData.name,
        role: formData.role
      };
      
      if (formData.password) {
        userData.password = formData.password;
      }
      
      onSubmit(userData);
    } else if (type === 'addTruck' || type === 'editTruck') {
      if (!formData.nomorPolisi) {
        setAlertMessage('Nomor Polisi harus diisi!');
        return;
      }
      onSubmit({
        nomorPolisi: formData.nomorPolisi,
        isActive: formData.isActive
      });
    } else if (type === 'addSupir' || type === 'editSupir') {
      if (!formData.namaSupir || !formData.pt) {
        setAlertMessage('Nama Supir dan PT harus diisi!');
        return;
      }
      onSubmit({
        namaSupir: formData.namaSupir,
        pt: formData.pt,
        isActive: formData.isActive
      });
    } else if (type === 'addRute' || type === 'editRute') {
      if (!formData.rute || !formData.uangJalan) {
        setAlertMessage('Rute dan Uang Jalan harus diisi!');
        return;
      }
      if (parseFloat(formData.uangJalan) < 0 || parseFloat(formData.ritasi) < 0 || parseFloat(formData.uangMuka) < 0) {
        setAlertMessage('Uang Jalan, Ritasi, dan Uang Muka tidak boleh negatif!');
        return;
      }
      onSubmit({
        rute: formData.rute,
        uangJalan: parseFloat(formData.uangJalan),
        ritasi: parseFloat(formData.ritasi) || 0,
        uangMuka: parseFloat(formData.uangMuka) || 0
      });
    } else if (type === 'addMaterial' || type === 'editMaterial') {
      if (!formData.material || !formData.satuan) {
        setAlertMessage('Material dan Satuan harus diisi!');
        return;
      }
      onSubmit({
        material: formData.material,
        satuan: formData.satuan
      });
    }
  };

  const getModalTitle = () => {
    if (type === 'addSJ') return 'Tambah Surat Jalan Baru';
    if (type === 'markTerkirim') return 'Tandai Surat Jalan Terkirim';
    if (type === 'editTerkirim') return 'Edit Data Pengiriman';
    if (type === 'addInvoice') return 'Buat Invoice Baru';
    if (type === 'editInvoice') return 'Edit Invoice';
    if (type === 'addUangMuka') return 'Tambah Uang Muka';
    if (type === 'addTransaksi') return 'Tambah Transaksi Kas';
    if (type === 'addUser') return 'Tambah User Baru';
    if (type === 'editUser') return 'Edit User';
    if (type === 'addTruck') return 'Tambah Truck Baru';
    if (type === 'editTruck') return 'Edit Truck';
    if (type === 'addSupir') return 'Tambah Supir Baru';
    if (type === 'editSupir') return 'Edit Supir';
    if (type === 'addRute') return 'Tambah Rute Baru';
    if (type === 'editRute') return 'Edit Rute';
    if (type === 'addMaterial') return 'Tambah Material Baru';
    if (type === 'editMaterial') return 'Edit Material';
    return 'Form';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center sm:p-4 z-50">
      <div className={`bg-white rounded-t-2xl sm:rounded-lg shadow-xl ${(type === 'addSJ' || type === 'markTerkirim' || type === 'editTerkirim' || type === 'addInvoice') ? 'sm:max-w-2xl' : 'sm:max-w-md'} w-full p-4 sm:p-6 max-h-[95vh] sm:max-h-[90vh] overflow-y-auto`}>
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-3 sm:mb-4">
          {getModalTitle()}
        </h2>
        
        <div className="space-y-4">
          {type === 'addSJ' ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">1. Nomor SJ *</label>
                  <input
                    type="text"
                    value={formData.nomorSJ}
                    onChange={(e) => setFormData({ ...formData, nomorSJ: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Contoh: SJ/2024/001"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">2. Tanggal SJ *</label>
                  <input
                    type="date"
                    value={formData.tanggalSJ}
                    onChange={(e) => setFormData({ ...formData, tanggalSJ: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              
              <SearchableSelect
                options={truckList.filter(t => t.isActive)}
                value={formData.truckId}
                onChange={(value) => setFormData({ ...formData, truckId: value })}
                placeholder="Pilih Nomor Polisi"
                label="3. Nomor Polisi"
                displayKey="nomorPolisi"
                valueKey="id"
              />
              
              <SearchableSelect
                options={supirList.filter(s => s.isActive)}
                value={formData.supirId}
                onChange={(value) => setFormData({ ...formData, supirId: value })}
                placeholder="Pilih Nama Supir"
                label="4. Nama Supir"
                displayKey="namaSupir"
                valueKey="id"
              />
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">5. PT (Auto-fill)</label>
                <input
                  type="text"
                  value={supirList.find(s => s.id === formData.supirId)?.pt || '-'}
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700"
                />
              </div>
              
              <SearchableSelect
                options={ruteList.map(r => ({
                  ...r,
                  displayName: `${r.rute} - Rp ${new Intl.NumberFormat('id-ID').format(r.uangJalan)}`
                }))}
                value={formData.ruteId}
                onChange={(value) => setFormData({ ...formData, ruteId: value })}
                placeholder="Pilih Rute"
                label="6. Rute"
                displayKey="displayName"
                valueKey="id"
              />
              
              <SearchableSelect
                options={materialList}
                value={formData.materialId}
                onChange={(value) => setFormData({ ...formData, materialId: value })}
                placeholder="Pilih Material"
                label="7. Material"
                displayKey="material"
                valueKey="id"
              />
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">8. Satuan (Auto-fill)</label>
                  <input
                    type="text"
                    value={materialList.find(m => m.id === formData.materialId)?.satuan || '-'}
                    disabled
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">9. Qty Isi *</label>
                  <input
                    type="number"
                    value={formData.qtyIsi}
                    onChange={(e) => setFormData({ ...formData, qtyIsi: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Contoh: 100"
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>
              
              <div className="bg-blue-50 p-4 rounded-lg mt-2">
                <p className="text-sm text-blue-800 font-semibold mb-2">📝 Informasi:</p>
                <ul className="text-xs text-blue-700 space-y-1">
                  <li>• Semua field bertanda (*) wajib diisi</li>
                  <li>• Uang Jalan akan otomatis dicatat sebagai pengeluaran</li>
                  <li>• Status awal akan menjadi "Pending"</li>
                  <li>• Gunakan fitur search untuk mencari data lebih cepat</li>
                </ul>
              </div>
            </>
          ) : type === 'markTerkirim' || type === 'editTerkirim' ? (
            <>
              {/* Info Surat Jalan */}
              <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-lg mb-4">
                <h3 className="font-semibold text-blue-900 mb-3">📋 Informasi Surat Jalan</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 text-sm">
                  <div>
                    <p className="text-blue-700 font-medium">Nomor SJ:</p>
                    <p className="text-blue-900 font-bold">{selectedItem?.nomorSJ}</p>
                  </div>
                  <div>
                    <p className="text-blue-700 font-medium">Tgl SJ:</p>
                    <p className="text-blue-900 font-bold">{selectedItem?.tanggalSJ ? new Date(selectedItem.tanggalSJ).toLocaleDateString('id-ID') : '-'}</p>
                  </div>
                  <div>
                    <p className="text-blue-700 font-medium">Nomor Polisi:</p>
                    <p className="text-blue-900 font-bold">{selectedItem?.nomorPolisi}</p>
                  </div>
                  <div>
                    <p className="text-blue-700 font-medium">Rute:</p>
                    <p className="text-blue-900 font-bold">{selectedItem?.rute}</p>
                  </div>
                  <div>
                    <p className="text-blue-700 font-medium">Material:</p>
                    <p className="text-blue-900 font-bold">{selectedItem?.material}</p>
                  </div>
                  <div>
                    <p className="text-blue-700 font-medium">Satuan:</p>
                    <p className="text-blue-900 font-bold">{selectedItem?.satuan}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-blue-700 font-medium">Qty Isi:</p>
                    <p className="text-blue-900 font-bold text-lg">{selectedItem?.qtyIsi} {selectedItem?.satuan}</p>
                  </div>
                </div>
              </div>

              {/* Form Input */}
              <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded-lg">
                <h3 className="font-semibold text-green-900 mb-3">✍️ Data Pengiriman</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Tgl Terkirim *
                      <span className="text-xs text-gray-500 ml-2">(tidak boleh lebih awal dari Tgl SJ)</span>
                    </label>
                    <input
                      type="date"
                      value={formData.tglTerkirim}
                      onChange={(e) => setFormData({ ...formData, tglTerkirim: e.target.value })}
                      min={selectedItem?.tanggalSJ}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Qty Bongkar *
                      <span className="text-xs text-gray-500 ml-2">(max: {selectedItem?.qtyIsi} {selectedItem?.satuan})</span>
                    </label>
                    <input
                      type="number"
                      value={formData.qtyBongkar}
                      onChange={(e) => setFormData({ ...formData, qtyBongkar: e.target.value })}
                      max={selectedItem?.qtyIsi}
                      min="0"
                      step="0.01"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                      placeholder={`Contoh: ${selectedItem?.qtyIsi}`}
                    />
                  </div>
                </div>
              </div>

              {/* Penalty Tracking Section */}
              <div className="border-t pt-4 mt-4">
                {(() => {
                  const qtyBongkar = parseFloat(formData.qtyBongkar) || 0;
                  const qtyIsi = parseFloat(selectedItem?.qtyIsi) || 0;
                  const quantityLoss = Math.max(0, qtyIsi - qtyBongkar);
                  const estimatedPenalty = calculateSJPenalty(quantityLoss, formData.abolishPenalty);

                  return (
                    <>
                      <label className="flex items-center gap-2 cursor-pointer mb-3">
                        <input
                          type="checkbox"
                          checked={formData.abolishPenalty || false}
                          onChange={(e) =>
                            setFormData({ ...formData, abolishPenalty: e.target.checked })
                          }
                          className="w-4 h-4"
                        />
                        <span className="text-sm font-medium">Abolish Penalty for This Delivery</span>
                      </label>

                      {quantityLoss > 0 && (
                        <div className={`p-3 rounded-lg mb-2 ${
                          formData.abolishPenalty
                            ? 'bg-green-50 border border-green-200'
                            : 'bg-red-50 border border-red-200'
                        }`}>
                          <p className={`text-sm font-semibold ${
                            formData.abolishPenalty
                              ? 'text-green-800'
                              : 'text-red-800'
                          }`}>
                            Quantity Loss: {quantityLoss} {selectedItem?.satuan}
                          </p>
                          {!formData.abolishPenalty && estimatedPenalty > 0 && (
                            <p className="text-sm text-red-600 mt-2">
                              ⚠ Estimated Penalty: {formatCurrency(estimatedPenalty)}
                            </p>
                          )}
                          {formData.abolishPenalty && (
                            <p className="text-sm text-green-600 mt-2">
                              ✓ Penalty abolished for this delivery
                            </p>
                          )}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              {/* Warning Info */}
              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 rounded-lg">
                <p className="text-sm text-yellow-800">
                  ⚠️ <strong>Perhatian:</strong> Pastikan data yang diisi sudah benar. Setelah disimpan, Admin SJ tidak bisa mengubah data ini lagi (hanya Super Admin yang bisa edit).
                </p>
              </div>
            </>
          ) : (type === 'addInvoice' || type === 'editInvoice') ? (
            <>
              {/* Form Invoice */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">No Invoice *</label>
                  <input
                    type="text"
                    value={formData.noInvoice}
                    onChange={(e) => setFormData({ ...formData, noInvoice: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Contoh: INV/2024/001"
                    disabled={type === 'editInvoice'}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tgl Invoice *</label>
                  <input
                    type="date"
                    value={formData.tglInvoice}
                    onChange={(e) => setFormData({ ...formData, tglInvoice: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    disabled={type === 'editInvoice'}
                  />
                </div>
              </div>

              {/* Pilih Surat Jalan */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Pilih Surat Jalan * <span className="text-xs text-gray-500">
                    {type === 'editInvoice' ? '(tambah atau hapus SJ dari invoice)' : '(yang sudah terkirim)'}
                  </span>
                </label>
                
                {/* Search Bar */}
                <div className="mb-3">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Cari Nomor SJ, Rute, Material, atau Nomor Polisi..."
                      value={searchInvoiceSJ}
                      onChange={(e) => setSearchInvoiceSJ(e.target.value)}
                      className="w-full px-3 py-2 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    <Search className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" />
                    {searchInvoiceSJ && (
                      <button
                        onClick={() => setSearchInvoiceSJ('')}
                        className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                      >
                        <XCircle className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </div>
                
                <div className="border border-gray-300 rounded-lg p-4 max-h-80 overflow-y-auto bg-gray-50">
                  {suratJalanList
                    .filter(sj => {
                      // Untuk edit: tampilkan SJ yang sudah di invoice INI atau yang available
                      if (type === 'editInvoice') {
                        return String(sj?.status || '').toLowerCase() === 'terkirim' &&
                               (isSJBelumInvoice(sj) || sj.invoiceId === selectedItem?.id);
                      }
                      // Untuk add: hanya tampilkan yang available
                      return isSJBelumInvoice(sj);
                    })
                    .filter(sj => {
                      if (!searchInvoiceSJ) return true;
                      const search = searchInvoiceSJ.toLowerCase();
                      return (
                        sj.nomorSJ.toLowerCase().includes(search) ||
                        sj.rute.toLowerCase().includes(search) ||
                        sj.material.toLowerCase().includes(search) ||
                        sj.nomorPolisi.toLowerCase().includes(search)
                      );
                    }).length === 0 ? (
                    <div className="text-center py-8">
                      <Package className="w-12 h-12 mx-auto text-gray-300 mb-2" />
                      <p className="text-gray-500 font-medium">
                        {searchInvoiceSJ ? 'Tidak ada SJ yang cocok dengan pencarian' : 'Tidak ada Surat Jalan yang bisa di-invoice'}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {searchInvoiceSJ ? 'Coba kata kunci lain' : 'Semua SJ terkirim sudah terinvoice'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {suratJalanList
                        .filter(sj => {
                          if (type === 'editInvoice') {
                            return String(sj?.status || '').toLowerCase() === 'terkirim' &&
                                   (isSJBelumInvoice(sj) || sj.invoiceId === selectedItem?.id);
                          }
                          return isSJBelumInvoice(sj);
                        })
                        .filter(sj => {
                          if (!searchInvoiceSJ) return true;
                          const search = searchInvoiceSJ.toLowerCase();
                          return (
                            sj.nomorSJ.toLowerCase().includes(search) ||
                            sj.rute.toLowerCase().includes(search) ||
                            sj.material.toLowerCase().includes(search) ||
                            sj.nomorPolisi.toLowerCase().includes(search)
                          );
                        })
                        .map(sj => (
                          <label 
                            key={sj.id} 
                            className={`flex items-start space-x-3 p-3 rounded-lg cursor-pointer border-2 transition ${
                              formData.selectedSJIds.includes(sj.id)
                                ? 'bg-blue-50 border-blue-500'
                                : 'bg-white border-gray-200 hover:border-blue-300 hover:bg-blue-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={formData.selectedSJIds.includes(sj.id)}
                              onChange={(e) => {
                                setFormData((prev) => {
                                  const currentIds = Array.isArray(prev.selectedSJIds) ? prev.selectedSJIds : [];
                                  const nextIds = e.target.checked
                                    ? Array.from(new Set([...currentIds, sj.id]))
                                    : currentIds.filter((id) => id !== sj.id);
                                  return { ...prev, selectedSJIds: nextIds };
                                });
                              }}
                              className="mt-1 w-4 h-4 text-blue-600 focus:ring-blue-500"
                            />
                            <div className="flex-1">
                              <div className="flex items-center justify-between mb-1">
                                <p className="font-bold text-gray-800">{sj.nomorSJ}</p>
                                <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-semibold">
                                  Terkirim
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-sm">
                                <div>
                                  <p className="text-gray-600">Rute:</p>
                                  <p className="font-semibold text-gray-800">{sj.rute}</p>
                                </div>
                                <div>
                                  <p className="text-gray-600">Material:</p>
                                  <p className="font-semibold text-gray-800">{sj.material}</p>
                                </div>
                                <div>
                                  <p className="text-gray-600">Qty Bongkar:</p>
                                  <p className="font-semibold text-blue-600">{sj.qtyBongkar} {sj.satuan}</p>
                                </div>
                                <div>
                                  <p className="text-gray-600">Tgl Terkirim:</p>
                                  <p className="font-semibold text-gray-800">
                                    {sj.tglTerkirim ? new Date(sj.tglTerkirim).toLocaleDateString('id-ID') : '-'}
                                  </p>
                                </div>
                                {(() => {
                                  const umForSJ = uangMukaList.filter(um => um.sjId === sj.id);
                                  const totalUM = umForSJ.reduce((sum, um) => sum + (um.jumlah || 0), 0);
                                  const harga = Number(formData.ruteHarga[sj.rute] || 0);
                                  const subtotal = Number(sj.qtyBongkar || 0) * harga;
                                  const nett = subtotal - totalUM;
                                  if (totalUM === 0 && harga === 0) return null;
                                  return (
                                    <>
                                      {harga > 0 && (
                                        <div>
                                          <p className="text-gray-600">Subtotal:</p>
                                          <p className="font-semibold text-gray-800">{formatCurrency(subtotal)}</p>
                                        </div>
                                      )}
                                      {totalUM > 0 && (
                                        <div>
                                          <p className="text-gray-600">Uang Muka:</p>
                                          <p className="font-semibold text-red-600">- {formatCurrency(totalUM)}</p>
                                        </div>
                                      )}
                                      {harga > 0 && (
                                        <div className="col-span-2 bg-green-50 rounded p-1 mt-1">
                                          <p className="text-gray-600 text-xs">Nett setelah UM:</p>
                                          <p className="font-bold text-green-700">{formatCurrency(nett)}</p>
                                        </div>
                                      )}
                                    </>
                                  );
                                })()}
                              </div>
                            </div>
                          </label>
                        ))}
                    </div>
                  )}
                </div>
                {formData.selectedSJIds.length > 0 && (
                  <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm text-green-800 font-semibold flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" />
                      {formData.selectedSJIds.length} Surat Jalan dipilih untuk invoice
                    </p>
                  </div>
                )}
              </div>

              {/* Harga Per Rute */}
              {formData.selectedSJIds.length > 0 && (() => {
                const selectedSJs = suratJalanList.filter(sj => formData.selectedSJIds.includes(sj.id));
                const uniqueRutes = [...new Set(selectedSJs.map(sj => sj.rute))].filter(Boolean);
                if (uniqueRutes.length === 0) return null;

                const ruteQtys = {};
                selectedSJs.forEach(sj => {
                  if (!ruteQtys[sj.rute]) ruteQtys[sj.rute] = 0;
                  ruteQtys[sj.rute] += Number(sj.qtyBongkar || 0);
                });

                const totalHarga = uniqueRutes.reduce((sum, rute) => {
                  return sum + (ruteQtys[rute] * Number(formData.ruteHarga[rute] || 0));
                }, 0);

                const totalUM = selectedSJs.reduce((sum, sj) => {
                  const umForSJ = uangMukaList.filter(um => um.sjId === sj.id);
                  return sum + umForSJ.reduce((s, um) => s + (um.jumlah || 0), 0);
                }, 0);

                return (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Harga Per Qty (per Rute)
                    </label>
                    <div className="border border-gray-300 rounded-lg p-4 bg-gray-50 space-y-3">
                      {uniqueRutes.map(rute => (
                        <div key={rute} className="flex items-center gap-3 bg-white p-3 rounded-lg border border-gray-200">
                          <div className="flex-1">
                            <p className="font-semibold text-gray-800 text-sm">{rute}</p>
                            <p className="text-xs text-gray-500">Total Qty: {ruteQtys[rute]?.toFixed(2)}</p>
                          </div>
                          <div className="w-40">
                            <input
                              type="number"
                              value={formData.ruteHarga[rute] || ''}
                              onChange={(e) => {
                                setFormData(prev => ({
                                  ...prev,
                                  ruteHarga: { ...prev.ruteHarga, [rute]: e.target.value }
                                }));
                              }}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                              placeholder="Harga/qty"
                              min="0"
                            />
                          </div>
                          <div className="w-36 text-right">
                            <p className="text-sm font-semibold text-blue-600">
                              {formatCurrency(ruteQtys[rute] * Number(formData.ruteHarga[rute] || 0))}
                            </p>
                          </div>
                        </div>
                      ))}

                      <div className="border-t pt-3 mt-3 space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="font-semibold text-gray-700">Total Harga:</span>
                          <span className="font-bold text-gray-900">{formatCurrency(totalHarga)}</span>
                        </div>
                        {totalUM > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="font-semibold text-red-600">Total Uang Muka:</span>
                            <span className="font-bold text-red-600">- {formatCurrency(totalUM)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-sm border-t pt-1">
                          <span className="font-bold text-gray-900">Total Setelah UM:</span>
                          <span className="font-bold text-green-700">{formatCurrency(totalHarga - totalUM)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Info */}
              <div className="bg-blue-50 border-l-4 border-blue-500 p-3 rounded-lg">
                <p className="text-sm text-blue-800">
                  💡 <strong>Info:</strong> Pilih satu atau lebih Surat Jalan yang sudah terkirim untuk dibuatkan invoice. Setelah invoice dibuat, Surat Jalan akan berstatus "Terinvoice".
                </p>
              </div>
            </>
          ) : type === 'addUangMuka' ? (
            <>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Surat Jalan *</label>
                <select
                  value={formData.sjIdUM}
                  onChange={(e) => {
                    const sj = suratJalanList.find(s => s.id === e.target.value);
                    setFormData({
                      ...formData,
                      sjIdUM: e.target.value,
                      nomorSJUM: sj?.nomorSJ || ''
                    });
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Pilih Surat Jalan...</option>
                  {suratJalanList
                    .filter(sj => String(sj?.status || '').toLowerCase() === 'terkirim')
                    .map(sj => (
                      <option key={sj.id} value={sj.id}>
                        {sj.nomorSJ} — {sj.rute} — {sj.qtyBongkar} {sj.satuan}
                      </option>
                    ))
                  }
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Jumlah (Rp) *</label>
                  <input
                    type="number"
                    value={formData.jumlahUM}
                    onChange={(e) => setFormData({ ...formData, jumlahUM: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Contoh: 5000000"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal *</label>
                  <input
                    type="date"
                    value={formData.tanggalUM}
                    onChange={(e) => setFormData({ ...formData, tanggalUM: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Keterangan</label>
                <input
                  type="text"
                  value={formData.keteranganUM}
                  onChange={(e) => setFormData({ ...formData, keteranganUM: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Keterangan opsional..."
                />
              </div>

              <div className="bg-blue-50 border-l-4 border-blue-500 p-3 rounded-lg">
                <p className="text-sm text-blue-800">
                  💡 <strong>Info:</strong> Uang Muka akan mengurangi total harga pada invoice terkait Surat Jalan ini.
                </p>
              </div>
            </>
          ) : type === 'addTransaksi' ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipe Transaksi *</label>
                <select
                  value={formData.tipe}
                  onChange={(e) => setFormData({ ...formData, tipe: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Pilih Tipe</option>
                  <option value="pemasukan">Pemasukan</option>
                  <option value="pengeluaran">Pengeluaran</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PT *</label>
                <select
                  value={formData.pt}
                  onChange={(e) => setFormData({ ...formData, pt: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Pilih PT</option>
                  {[...new Set(supirList.map(s => s.pt).filter(Boolean))].sort().map(pt => (
                    <option key={pt} value={pt}>{pt}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal *</label>
                <input
                  type="date"
                  value={formData.tanggal}
                  onChange={(e) => setFormData({ ...formData, tanggal: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nominal (Rp) *</label>
                <input
                  type="number"
                  value={formData.nominal}
                  onChange={(e) => setFormData({ ...formData, nominal: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Contoh: 500000"
                  min="0"
                  step="1000"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Keterangan *</label>
                <textarea
                  value={formData.keteranganTransaksi}
                  onChange={(e) => setFormData({ ...formData, keteranganTransaksi: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows="2"
                  placeholder="Deskripsi transaksi"
                />
              </div>
            </>
          ) : (type === 'addUser' || type === 'editUser') ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Username *</label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Username untuk login"
                  disabled={type === 'editUser'}
                />
                {type === 'editUser' && (
                  <p className="text-xs text-gray-500 mt-1">Username tidak dapat diubah</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password {type === 'editUser' ? '(Kosongkan jika tidak ingin mengubah)' : '*'}
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder={type === 'editUser' ? 'Masukkan password baru' : 'Masukkan password'}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Lengkap *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Nama lengkap user"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role *</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Pilih Role</option>
                  <option value="admin_sj">Admin Surat Jalan</option>
                  <option value="admin_keuangan">Admin Keuangan</option>
                  <option value="admin_invoice">Admin Invoice</option>
                  <option value="reader">Reader</option>
                </select>
              </div>
            </>
          ) : null}

          {/* Truck Form */}
          {(type === 'addTruck' || type === 'editTruck') && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nomor Polisi *</label>
                <input
                  type="text"
                  value={formData.nomorPolisi}
                  onChange={(e) => setFormData({ ...formData, nomorPolisi: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Contoh: B 1234 XYZ"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status *</label>
                <select
                  value={formData.isActive ? 'true' : 'false'}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.value === 'true' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="true">Aktif</option>
                  <option value="false">Nonaktif</option>
                </select>
              </div>
            </>
          )}

          {/* Supir Form */}
          {(type === 'addSupir' || type === 'editSupir') && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Supir *</label>
                <input
                  type="text"
                  value={formData.namaSupir}
                  onChange={(e) => setFormData({ ...formData, namaSupir: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Nama lengkap supir"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PT *</label>
                <input
                  type="text"
                  value={formData.pt}
                  onChange={(e) => setFormData({ ...formData, pt: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Nama perusahaan"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status *</label>
                <select
                  value={formData.isActive ? 'true' : 'false'}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.value === 'true' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="true">Aktif</option>
                  <option value="false">Nonaktif</option>
                </select>
              </div>
            </>
          )}

          {/* Rute Form */}
          {(type === 'addRute' || type === 'editRute') && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rute *</label>
                <input
                  type="text"
                  value={formData.rute}
                  onChange={(e) => setFormData({ ...formData, rute: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Contoh: Jakarta - Surabaya"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Uang Jalan (Rp) *</label>
                <input
                  type="number"
                  value={formData.uangJalan}
                  onChange={(e) => setFormData({ ...formData, uangJalan: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Contoh: 500000"
                  min="0"
                  step="10000"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ritasi (Rp)</label>
                <input
                  type="number"
                  value={formData.ritasi}
                  onChange={(e) => setFormData({ ...formData, ritasi: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Jumlah ritasi per pengiriman"
                  min="0"
                  step="10000"
                />
                <small className="text-gray-500">Bonus per pengiriman sukses untuk rute ini</small>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Uang Muka (Rp)</label>
                <input
                  type="number"
                  value={formData.uangMuka}
                  onChange={(e) => setFormData({ ...formData, uangMuka: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Jumlah uang muka default untuk rute ini"
                  min="0"
                  step="10000"
                />
                <small className="text-gray-500">Uang muka default per pengiriman untuk rute ini</small>
              </div>
            </>
          )}

          {/* Material Form */}
          {(type === 'addMaterial' || type === 'editMaterial') && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Material *</label>
                <input
                  type="text"
                  value={formData.material}
                  onChange={(e) => setFormData({ ...formData, material: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Contoh: Semen"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Satuan *</label>
                <input
                  type="text"
                  value={formData.satuan}
                  onChange={(e) => setFormData({ ...formData, satuan: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Contoh: Ton, Kg, m³"
                />
              </div>
            </>
          )}

          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 py-2 rounded-lg transition font-medium"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg transition font-medium"
            >
              Simpan
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SuratJalanMonitor;