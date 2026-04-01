import { collection, doc, writeBatch, onSnapshot, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "./config/firebase-config";
import React, { useState, useEffect } from 'react';
import { AlertCircle, Package, Truck, FileText, DollarSign, Users, LogOut, Plus, Edit, Trash2, Eye, CheckCircle, XCircle, Clock, Search, RefreshCw } from 'lucide-react';
import * as XLSX from "xlsx";

// Helpers (shared across components)
const formatCurrency = (amount = 0) => {
  const n = Number(amount) || 0;
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(n);
};


// Download helpers
const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const exportRowsToCSV = ({ filename, headers, rows }) => {
  const csvLines = [];
  csvLines.push(headers.join(";"));
  rows.forEach((row) => {
    csvLines.push(row.map((v) => (v === null || v === undefined ? "" : String(v))).join(";"));
  });
  const csvContent = "﻿" + csvLines.join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, filename);
};

const exportRowsToXLSX = ({ filename, sheetName, headers, rows }) => {
  const aoa = [headers, ...rows.map((r) => r.map((v) => (v === undefined ? "" : v)))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName || "Sheet1");
  XLSX.writeFile(wb, filename);
};



// Firestore tidak menerima nilai `undefined`.
// Helper ini menghapus key yang nilainya undefined (dan bisa dipakai sebelum write ke Firestore).
const sanitizeForFirestore = (obj) => {
  if (!obj || typeof obj !== "object") return obj;
  const clean = {};
  Object.keys(obj).forEach((k) => {
    const v = obj[k];
    if (v === undefined) return;
    clean[k] = v;
  });
  return clean;
};


const nowIso = () => new Date().toISOString();



// Searchable Select Component
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
          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-hidden">
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
            <div className="overflow-y-auto max-h-48">
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
                    className={`px-3 py-2 cursor-pointer hover:bg-blue-50 ${
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

// Laporan Kas Component
const LaporanKas = ({ suratJalanList, formatCurrency }) => {
  const [filterDari, setFilterDari] = useState('');
  const [filterSampai, setFilterSampai] = useState('');
  const [filterPT, setFilterPT] = useState('');
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Get unique PT list
  const ptList = [...new Set(suratJalanList.map(sj => sj.pt).filter(Boolean))].sort();

  // Filter Surat Jalan berdasarkan tanggal dan PT
  const filteredData = suratJalanList.filter(sj => {
    // Date filter
    if (filterDari || filterSampai) {
      const tanggalSJ = new Date(sj.tanggalSJ);
      const dari = filterDari ? new Date(filterDari) : null;
      const sampai = filterSampai ? new Date(filterSampai) : null;
      
      if (dari && sampai) {
        if (!(tanggalSJ >= dari && tanggalSJ <= sampai)) return false;
      } else if (dari) {
        if (!(tanggalSJ >= dari)) return false;
      } else if (sampai) {
        if (!(tanggalSJ <= sampai)) return false;
      }
    }
    
    // PT filter
    if (filterPT && sj.pt !== filterPT) return false;
    
    return true;
  });

  // Group by PT
  const dataByPT = {};
  filteredData.forEach(sj => {
    const pt = sj.pt || 'Tanpa PT';
    if (!dataByPT[pt]) {
      dataByPT[pt] = [];
    }
    dataByPT[pt].push(sj);
  });

  // Calculate total per PT
  const totalPerPT = Object.keys(dataByPT).map(pt => ({
    pt,
    count: dataByPT[pt].length,
    total: dataByPT[pt].reduce((sum, sj) => sum + (sj.uangJalan || 0), 0)
  })).sort((a, b) => b.total - a.total);

  // Hitung total kas keluar
  const totalKasKeluar = filteredData.reduce((sum, sj) => sum + (sj.uangJalan || 0), 0);

  // Export to CSV
  const exportToCSV = () => {
    const headers = ['Tanggal SJ', 'Nomor SJ', 'PT', 'Rute', 'Nomor Polisi', 'Nama Supir', 'Uang Jalan'];
    
    let csvContent = headers.join(';') + '\n';
    
    // Group by PT if no PT filter
    if (!filterPT) {
      Object.keys(dataByPT).forEach(pt => {
        csvContent += `\n${pt}\n`;
        dataByPT[pt].forEach(sj => {
          const row = [
            new Date(sj.tanggalSJ).toLocaleDateString('id-ID'),
            sj.nomorSJ,
            sj.pt || '-',
            sj.rute,
            sj.nomorPolisi,
            sj.namaSupir,
            sj.uangJalan
          ];
          csvContent += row.join(';') + '\n';
        });
        const ptTotal = dataByPT[pt].reduce((sum, sj) => sum + (sj.uangJalan || 0), 0);
        csvContent += `Subtotal ${pt};;;;;;${ptTotal}\n`;
      });
    } else {
      // Single PT export
      filteredData.forEach(sj => {
        const row = [
          new Date(sj.tanggalSJ).toLocaleDateString('id-ID'),
          sj.nomorSJ,
          sj.pt || '-',
          sj.rute,
          sj.nomorPolisi,
          sj.namaSupir,
          sj.uangJalan
        ];
        csvContent += row.join(';') + '\n';
      });
    }
    
    const grandTotal = totalPerPT.reduce((sum, item) => sum + item.total, 0);
    csvContent += `\nTOTAL KAS KELUAR;;;;;;${grandTotal}`;
    
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `Laporan_Kas_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Reset Filter
  const resetFilter = () => {
    setFilterDari('');
    setFilterSampai('');
    setFilterPT('');
  };

  // Print
  const handlePrint = () => {
    const printWindow = window.open('', '', 'height=600,width=800');
    printWindow.document.write('<html><head><title>Laporan Kas</title>');
    printWindow.document.write('<style>');
    printWindow.document.write('body { font-family: Arial, sans-serif; padding: 20px; }');
    printWindow.document.write('h1 { text-align: center; }');
    printWindow.document.write('table { width: 100%; border-collapse: collapse; margin-top: 20px; }');
    printWindow.document.write('th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }');
    printWindow.document.write('th { background-color: #4CAF50; color: white; }');
    printWindow.document.write('.total { font-weight: bold; background-color: #f0f0f0; }');
    printWindow.document.write('</style></head><body>');
    printWindow.document.write('<h1>Laporan Kas Keluar</h1>');
    if (filterDari || filterSampai) {
      printWindow.document.write(`<p>Periode: ${filterDari ? new Date(filterDari).toLocaleDateString('id-ID') : '...'} - ${filterSampai ? new Date(filterSampai).toLocaleDateString('id-ID') : '...'}</p>`);
    }
    printWindow.document.write('<table>');
    printWindow.document.write('<thead><tr><th>No</th><th>Tanggal SJ</th><th>Nomor SJ</th><th>Rute</th><th>Nomor Polisi</th><th>Nama Supir</th><th>Uang Jalan</th></tr></thead>');
    printWindow.document.write('<tbody>');
    filteredData.forEach((sj, index) => {
      printWindow.document.write(`<tr>
        <td>${index + 1}</td>
        <td>${new Date(sj.tanggalSJ).toLocaleDateString('id-ID')}</td>
        <td>${sj.nomorSJ}</td>
        <td>${sj.rute}</td>
        <td>${sj.nomorPolisi}</td>
        <td>${sj.namaSupir}</td>
        <td style="text-align: right;">Rp ${new Intl.NumberFormat('id-ID').format(sj.uangJalan || 0)}</td>
      </tr>`);
    });
    printWindow.document.write(`<tr class="total">
      <td colspan="6" style="text-align: right;"><strong>TOTAL KAS KELUAR:</strong></td>
      <td style="text-align: right;"><strong>Rp ${new Intl.NumberFormat('id-ID').format(totalKasKeluar)}</strong></td>
    </tr>`);
    printWindow.document.write('</tbody></table>');
    printWindow.document.write('</body></html>');
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">📊 Laporan Kas Keluar</h2>
            <p className="text-gray-600 mt-1">Rekap Uang Jalan dari Surat Jalan</p>
          </div>
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition"
            >
              <FileText className="w-4 h-4" />
              <span>Export / Print</span>
            </button>
            {showExportMenu && (
              <>
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-xl border border-gray-200 z-50">
                  <button
                    onClick={() => {
                      exportToCSV();
                      setShowExportMenu(false);
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-gray-100 transition flex items-center space-x-2"
                  >
                    <FileText className="w-4 h-4 text-green-600" />
                    <span>Export to Excel (CSV)</span>
                  </button>
                  <button
                    onClick={() => {
                      handlePrint();
                      setShowExportMenu(false);
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-gray-100 transition flex items-center space-x-2 border-t"
                  >
                    <FileText className="w-4 h-4 text-blue-600" />
                    <span>Print</span>
                  </button>
                </div>
                <div 
                  className="fixed inset-0 z-40"
                  onClick={() => setShowExportMenu(false)}
                />
              </>
            )}
          </div>
        </div>

        {/* Filter Tanggal dan PT */}
        <div className="bg-blue-50 p-4 rounded-lg">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Dari Tanggal</label>
              <input
                type="date"
                value={filterDari}
                onChange={(e) => setFilterDari(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Sampai Tanggal</label>
              <input
                type="date"
                value={filterSampai}
                onChange={(e) => setFilterSampai(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Filter PT</label>
              <select
                value={filterPT}
                onChange={(e) => setFilterPT(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Semua PT</option>
                {ptList.map(pt => (
                  <option key={pt} value={pt}>{pt}</option>
                ))}
              </select>
            </div>
            <div>
              <button
                onClick={resetFilter}
                className="w-full bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition"
              >
                Reset Filter
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Cards per PT */}
      {!filterPT && totalPerPT.length > 0 && (
        <div>
          <h3 className="text-lg font-bold text-gray-800 mb-3">💼 Rekap per PT</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {totalPerPT.map(item => (
              <div key={item.pt} className="bg-white rounded-lg shadow-md p-4 border-l-4 border-blue-500">
                <h4 className="font-bold text-gray-800 text-lg mb-2">{item.pt}</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Jumlah SJ:</span>
                    <span className="font-semibold text-gray-800">{item.count}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Kas:</span>
                    <span className="font-bold text-blue-600">{formatCurrency(item.total)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary Card - Grand Total */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-lg shadow-md p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-red-100 text-sm mb-1">Total Kas Keluar</p>
              <p className="text-3xl font-bold">{formatCurrency(totalPerPT.reduce((sum, item) => sum + item.total, 0))}</p>
            </div>
            <DollarSign className="w-12 h-12 text-red-200" />
          </div>
        </div>
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow-md p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm mb-1">Jumlah Surat Jalan</p>
              <p className="text-3xl font-bold">{filteredData.length}</p>
            </div>
            <Package className="w-12 h-12 text-blue-200" />
          </div>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg shadow-md p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-100 text-sm mb-1">Rata-rata / SJ</p>
              <p className="text-3xl font-bold">
                {formatCurrency(filteredData.length > 0 ? totalKasKeluar / filteredData.length : 0)}
              </p>
            </div>
            <FileText className="w-12 h-12 text-green-200" />
          </div>
        </div>
      </div>

      {/* Tabel Data */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="overflow-x-auto">
          {!filterPT && Object.keys(dataByPT).length > 1 ? (
            // Group by PT
            Object.keys(dataByPT).map(pt => (
              <div key={pt} className="mb-6 last:mb-0">
                <div className="bg-blue-600 text-white px-6 py-3 font-bold text-lg">
                  {pt} ({dataByPT[pt].length} SJ)
                </div>
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">No</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tanggal SJ</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nomor SJ</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rute</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nomor Polisi</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nama Supir</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Uang Jalan</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {dataByPT[pt].map((sj, index) => (
                      <tr key={sj.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{index + 1}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {new Date(sj.tanggalSJ).toLocaleDateString('id-ID')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600">{sj.nomorSJ}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{sj.rute}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{sj.nomorPolisi}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{sj.namaSupir}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-semibold">
                          {formatCurrency(sj.uangJalan || 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-blue-50 font-bold">
                    <tr>
                      <td colSpan="6" className="px-6 py-4 text-right text-gray-900">
                        Subtotal {pt}:
                      </td>
                      <td className="px-6 py-4 text-right text-blue-600 text-lg">
                        {formatCurrency(dataByPT[pt].reduce((sum, sj) => sum + (sj.uangJalan || 0), 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ))
          ) : (
            // Single table (with or without PT filter)
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">No</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tanggal SJ</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nomor SJ</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">PT</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rute</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nomor Polisi</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nama Supir</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Uang Jalan</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredData.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="px-6 py-12 text-center text-gray-500">
                      <Package className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                      <p className="text-lg font-semibold mb-2">Tidak ada data</p>
                      <p className="text-sm">
                        {filterDari || filterSampai || filterPT
                          ? 'Tidak ada Surat Jalan sesuai filter yang dipilih' 
                          : 'Belum ada Surat Jalan yang terinput'}
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredData.map((sj, index) => (
                    <tr key={sj.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{index + 1}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(sj.tanggalSJ).toLocaleDateString('id-ID')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600">{sj.nomorSJ}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">{sj.pt || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{sj.rute}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{sj.nomorPolisi}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{sj.namaSupir}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-semibold">
                        {formatCurrency(sj.uangJalan || 0)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {filteredData.length > 0 && (
              <tfoot className="bg-gray-100 font-bold">
                <tr>
                  <td colSpan="6" className="px-6 py-4 text-right text-sm text-gray-900">
                    TOTAL KAS KELUAR:
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                    <span className="text-lg font-bold text-red-600">{formatCurrency(totalKasKeluar)}</span>
                  </td>
                </tr>
              </tfoot>
            )}
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

// Storage wrapper dengan fallback ke localStorage
const storage = {
  async get(key, shared = false) {
    try {
      if (window.storage && typeof window.storage.get === 'function') {
        return await window.storage.get(key, shared);
      } else {
        // Fallback ke localStorage untuk artifact/preview mode
        const value = localStorage.getItem(key);
        return value ? { key, value, shared } : null;
      }
    } catch (e) {
      // Fallback ke localStorage jika window.storage error
      const value = localStorage.getItem(key);
      return value ? { key, value, shared } : null;
    }
  },
  
  async set(key, value, shared = false) {
    try {
      if (window.storage && typeof window.storage.set === 'function') {
        return await window.storage.set(key, value, shared);
      } else {
        // Fallback ke localStorage
        localStorage.setItem(key, value);
        return { key, value, shared };
      }
    } catch (e) {
      // Fallback ke localStorage
      localStorage.setItem(key, value);
      return { key, value, shared };
    }
  },
  
  async delete(key, shared = false) {
    try {
      if (window.storage && typeof window.storage.delete === 'function') {
        return await window.storage.delete(key, shared);
      } else {
        // Fallback ke localStorage
        localStorage.removeItem(key);
        return { key, deleted: true, shared };
      }
    } catch (e) {
      // Fallback ke localStorage
      localStorage.removeItem(key);
      return { key, deleted: true, shared };
    }
  }
};

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
  
  const canManageInvoice = () => {
    return currentUser.role === 'superadmin' || currentUser.role === 'admin_invoice';
  };
  
  const sjBelumTerinvoice = suratJalanList.filter(sj => 
    sj.status === 'terkirim' && !sj.statusInvoice
  );
  
  const sjTerinvoice = suratJalanList.filter(sj => 
    sj.status === 'terkirim' && sj.statusInvoice === 'terinvoice'
  );
  
  const filteredSJ = activeFilter === 'belum-terinvoice' ? sjBelumTerinvoice : sjTerinvoice;
  
  
  // Export invoice detail (1 invoice = 1 file)
  const exportInvoiceToCSV = (invoice) => {
    const headers = ['No SJ', 'Tgl SJ', 'No. Polisi', 'Nama Supir', 'Rute', 'Material', 'Qty Bongkar', 'Satuan'];
    const rows = invoice.suratJalanList.map(sj => ([
      sj.nomorSJ || '',
      sj.tanggalSJ ? new Date(sj.tanggalSJ).toLocaleDateString('id-ID') : '',
      sj.nomorPolisi || '',
      sj.namaSupir || '',
      sj.rute || '',
      sj.material || '',
      sj.qtyBongkar ?? '',
      sj.satuan || ''
    ]));
    rows.push(['TOTAL','','','','','', Number(invoice.totalQty || 0).toFixed(2), '']);
    exportRowsToCSV({
      filename: `Invoice_${(invoice.noInvoice || 'INV').replace(/\//g, '-')}_${new Date().toISOString().split('T')[0]}.csv`,
      headers,
      rows
    });
  };

  const exportInvoiceToXLSX = (invoice) => {
    const headers = ['No SJ', 'Tgl SJ', 'No. Polisi', 'Nama Supir', 'Rute', 'Material', 'Qty Bongkar', 'Satuan'];
    const rows = invoice.suratJalanList.map(sj => ([
      sj.nomorSJ || '',
      sj.tanggalSJ ? new Date(sj.tanggalSJ).toLocaleDateString('id-ID') : '',
      sj.nomorPolisi || '',
      sj.namaSupir || '',
      sj.rute || '',
      sj.material || '',
      sj.qtyBongkar ?? '',
      sj.satuan || ''
    ]));
    rows.push(['TOTAL','','','','','', Number(invoice.totalQty || 0).toFixed(2), '']);
    exportRowsToXLSX({
      filename: `Invoice_${(invoice.noInvoice || 'INV').replace(/\//g, '-')}_${new Date().toISOString().split('T')[0]}.xlsx`,
      sheetName: "Invoice",
      headers,
      rows
    });
  };
  
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-md p-6">
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

        <div className="flex gap-2 flex-wrap mt-4">
          <button
            onClick={() => {
              const headers = ['No SJ','Tgl SJ','PT','No. Polisi','Supir','Rute','Material','Qty Bongkar','Satuan','Status Invoice'];
              const rows = filteredSJ.map(sj => ([
                sj.nomorSJ || '',
                sj.tanggalSJ ? new Date(sj.tanggalSJ).toLocaleDateString('id-ID') : '',
                sj.pt || '',
                sj.nomorPolisi || '',
                sj.namaSupir || '',
                sj.rute || '',
                sj.material || '',
                sj.qtyBongkar ?? '',
                sj.satuan || '',
                sj.statusInvoice || (activeFilter === 'belum-terinvoice' ? 'belum' : 'terinvoice')
              ]));
              exportRowsToCSV({
                filename: `Laporan_Invoicing_${activeFilter}_${new Date().toISOString().split('T')[0]}.csv`,
                headers,
                rows
              });
            }}
            className="bg-gray-700 hover:bg-gray-800 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition"
            title="Export daftar sesuai filter Invoicing"
          >
            <FileText className="w-4 h-4" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={() => {
              const headers = ['No SJ','Tgl SJ','PT','No. Polisi','Supir','Rute','Material','Qty Bongkar','Satuan','Status Invoice'];
              const rows = filteredSJ.map(sj => ([
                sj.nomorSJ || '',
                sj.tanggalSJ ? new Date(sj.tanggalSJ).toLocaleDateString('id-ID') : '',
                sj.pt || '',
                sj.nomorPolisi || '',
                sj.namaSupir || '',
                sj.rute || '',
                sj.material || '',
                sj.qtyBongkar ?? '',
                sj.satuan || '',
                sj.statusInvoice || (activeFilter === 'belum-terinvoice' ? 'belum' : 'terinvoice')
              ]));
              exportRowsToXLSX({
                filename: `Laporan_Invoicing_${activeFilter}_${new Date().toISOString().split('T')[0]}.xlsx`,
                sheetName: "Invoicing",
                headers,
                rows
              });
            }}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition"
            title="Export daftar Invoicing (Excel .xlsx)"
          >
            <FileText className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
        </div>

        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow-md p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm mb-1">Total Invoice</p>
              <p className="text-3xl font-bold">{invoiceList.length}</p>
            </div>
            <FileText className="w-12 h-12 text-blue-200" />
          </div>
        </div>
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg shadow-md p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-orange-100 text-sm mb-1">Belum Terinvoice</p>
              <p className="text-3xl font-bold">{sjBelumTerinvoice.length}</p>
            </div>
            <Package className="w-12 h-12 text-orange-200" />
          </div>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg shadow-md p-6 text-white">
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
        <div className="bg-white rounded-lg shadow-md p-6">
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
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nomor SJ</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tgl SJ</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tgl Terkirim</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nomor Polisi</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rute</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Qty Bongkar</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredSJ.map(sj => (
                      <tr key={sj.id} className="hover:bg-orange-50 transition">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600">{sj.nomorSJ}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {new Date(sj.tanggalSJ).toLocaleDateString('id-ID')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-green-700 font-semibold">
                          {sj.tglTerkirim ? new Date(sj.tglTerkirim).toLocaleDateString('id-ID') : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{sj.nomorPolisi}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{sj.rute}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{sj.material}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-semibold">
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
              <div key={invoice.id} className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition">
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
                      onClick={() => exportInvoiceToCSV(invoice)}
                      className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1"
                    >
                      <FileText className="w-4 h-4" />
                      <span>Export CSV</span>
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
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">No</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">No SJ</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Rute</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qty Bongkar</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {invoice.suratJalanList.map((sj, idx) => (
                          <tr key={sj.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2 text-sm text-gray-600">{idx + 1}</td>
                            <td className="px-4 py-2 text-sm font-medium text-blue-600">{sj.nomorSJ}</td>
                            <td className="px-4 py-2 text-sm text-gray-900">{sj.rute}</td>
                            <td className="px-4 py-2 text-sm text-gray-900">{sj.material}</td>
                            <td className="px-4 py-2 text-sm text-gray-900 text-right font-semibold">
                              {sj.qtyBongkar} {sj.satuan}
                            </td>
                          </tr>
                        ))}
                        <tr className="bg-gray-100 font-bold">
                          <td colSpan="4" className="px-4 py-2 text-sm text-gray-900 text-right">TOTAL:</td>
                          <td className="px-4 py-2 text-sm text-gray-900 text-right">
                            {invoice.totalQty.toFixed(2)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
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

const SuratJalanMonitor = () => {
  const [currentUser, setCurrentUser] = useState(null);
  const [suratJalanList, setSuratJalanList] = useState([]);
  const [biayaList, setBiayaList] = useState([]);
  const [transaksiList, setTransaksiList] = useState([]);
  const [historyLog, setHistoryLog] = useState([]);
  const [invoiceList, setInvoiceList] = useState([]);
  const [appSettings, setAppSettings] = useState({
    companyName: '',
    logoUrl: '',
    loginFooterText: 'Masuk untuk mengakses dashboard monitoring'
  });
  const [usersList, setUsersList] = useState([]);
  const [truckList, setTruckList] = useState([]);
  const [supirList, setSupirList] = useState([]);
  const [ruteList, setRuteList] = useState([]);
  const [materialList, setMaterialList] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [filter, setFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('surat-jalan');
  const [alertMessage, setAlertMessage] = useState('');
  const [confirmDialog, setConfirmDialog] = useState({ show: false, message: '', onConfirm: null });

  // Load data saat komponen mount (Firestore sebagai sumber utama)
  useEffect(() => {
    const unsubs = loadAllData();
    return () => {
      (unsubs || []).forEach((u) => {
        try { if (typeof u === 'function') u(); } catch (e) {}
      });
    };
  }, []);
const loadAllData = () => {
    setIsLoading(true);

    // Firestore snapshots (source of truth)
    const unsubs = [];
    let pending = 5; // users, trucks, supir, rute, material
    let storageLoaded = false;

    const tryStopLoading = () => {
      if (storageLoaded && pending <= 0) setIsLoading(false);
    };

    const doneOne = () => {
      pending -= 1;
      tryStopLoading();
    };

    const watch = (colName, setter, label) => {
      let first = true;
      const unsub = onSnapshot(
        collection(db, colName),
        (snap) => {
          const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          setter(list);
          if (first) {
            first = false;
            doneOne();
          }
        },
        (err) => {
          console.error(`Error loading ${label} from Firestore:`, err);
          if (first) {
            first = false;
            doneOne();
          }
          // jangan hard-stop app; tampilkan warning saja
          setAlertMessage(`Gagal load ${label} dari Firestore. Cek koneksi / rules.`);
        }
      );
      unsubs.push(unsub);
    };

    watch("users", setUsersList, "users");
    watch("trucks", setTruckList, "truck");
    watch("supir", setSupirList, "supir");
    watch("rute", setRuteList, "rute");
    watch("material", setMaterialList, "material");

    // Non-master data (sementara masih dari local storage agar fitur existing tetap jalan)
    // Catatan: MasterData USERS/TRUCK/SUPIR/RUTE/MATERIAL TIDAK lagi dibaca dari localStorage.
    setTimeout(async () => {
      try {
        // Surat Jalan
        try {
          const sjResult = await storage.get('surat-jalan-list', true);
          if (sjResult && sjResult.value) setSuratJalanList(JSON.parse(sjResult.value));
        } catch (e) {}

        // Biaya
        try {
          const biayaResult = await storage.get('biaya-list', true);
          if (biayaResult && biayaResult.value) setBiayaList(JSON.parse(biayaResult.value));
        } catch (e) {}

        // Transaksi
        try {
          const transaksiResult = await storage.get('transaksi-list', true);
          if (transaksiResult && transaksiResult.value) setTransaksiList(JSON.parse(transaksiResult.value));
        } catch (e) {}

        // Invoice (masih local backup; bisa dimigrasi ke Firestore nanti)
        try {
          const invoiceResult = await storage.get('invoice-list', true);
          if (invoiceResult && invoiceResult.value) setInvoiceList(JSON.parse(invoiceResult.value));
        } catch (e) {}

        // History Log
        try {
          const historyResult = await storage.get('history-log', true);
          if (historyResult && historyResult.value) setHistoryLog(JSON.parse(historyResult.value));
        } catch (e) {}

        // App Settings
        try {
          const settingsResult = await storage.get('app-settings', true);
          if (settingsResult && settingsResult.value) setAppSettings(JSON.parse(settingsResult.value));
        } catch (e) {}
      } finally {
        storageLoaded = true;
        tryStopLoading();
      }
    }, 0);

    return unsubs;
  };;

  // History Log Helper
  const addHistoryLog = async (action, suratJalanId, suratJalanNo, details = {}) => {
    const newLog = {
      id: 'LOG-' + Date.now(),
      action, // 'mark_gagal', 'restore_from_gagal', 'mark_terkirim', 'create_invoice', etc
      suratJalanId,
      suratJalanNo,
      details, // Additional info
      timestamp: new Date().toISOString(),
      user: currentUser.name,
      userRole: currentUser.role
    };
    
    const newHistoryLog = [...historyLog, newLog];
    setHistoryLog(newHistoryLog);
    await storage.set('history-log', JSON.stringify(newHistoryLog), true);
  };

  const saveData = async (sjList, biayaListData) => {
    try {
      await storage.set('surat-jalan-list', JSON.stringify(sjList), true);
      await storage.set('biaya-list', JSON.stringify(biayaListData), true);
      return true;
    } catch (error) {
      console.error('Error saving data:', error);
      alert('Gagal menyimpan data. Silakan coba lagi.');
      return false;
    }
  };

  const handleLogin = (username, password) => {
    console.log('=== LOGIN ATTEMPT ===');
    console.log('Input username:', username);
    
    const trimmedUsername = username.trim();
    const trimmedPassword = password.trim();
    
    // Find user in usersList
    const user = usersList.find(u => u.username === trimmedUsername);
    
    if (user) {
      console.log('User found:', user.username);
      
      if (!user.isActive) {
        setAlertMessage('Akun Anda sudah dinonaktifkan. Hubungi administrator.');
        return;
      }
      
      if (user.password === trimmedPassword) {
        console.log('Login SUCCESS');
        setCurrentUser(user);
      } else {
        console.log('Password MISMATCH');
        setAlertMessage('Password salah!');
      }
    } else {
      console.log('User NOT FOUND');
      setAlertMessage('Username tidak ditemukan!');
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
  };

  const addUser = async (data) => {
    const username = (data?.username || '').trim();

    if (!username) {
      setAlertMessage('Username wajib diisi!');
      return false;
    }

    // Check if username already exists (state berasal dari Firestore)
    if (usersList.find(u => (u.username || u.id) === username || u.id === username)) {
      setAlertMessage('Username sudah digunakan! Gunakan username lain.');
      return false;
    }

    const newUser = {
      ...data,
      username,
      isActive: true,
      createdAt: nowIso(),
      createdBy: currentUser?.username || currentUser?.name || 'system'
    };

    try {
      // Gunakan docId = username agar konsisten (seperti screenshot Firestore Anda)
      await setDoc(doc(db, "users", username), newUser, { merge: true });

      // Optional backup (tidak dipakai untuk load master data)
      storage.set('users-list', JSON.stringify([...usersList, { id: username, ...newUser }]), true).catch(() => {});

      return true;
    } catch (e) {
      console.error('Error creating user in Firestore:', e);
      setAlertMessage('Gagal menambah user ke Firestore: ' + (e?.message || e));
      return false;
    }
  };;

  const updateUser = async (id, updates) => {
    if (!id) return;

    const payload = {
      ...updates,
      updatedAt: nowIso(),
      updatedBy: currentUser?.username || currentUser?.name || 'system'
    };

    try {
      await setDoc(doc(db, "users", id), payload, { merge: true });

      // Optional backup
      const newList = usersList.map(u => (u.id === id ? { ...u, ...payload } : u));
      storage.set('users-list', JSON.stringify(newList), true).catch(() => {});
    } catch (e) {
      console.error('Error updating user in Firestore:', e);
      setAlertMessage('Gagal update user di Firestore: ' + (e?.message || e));
    }
  };;

  const deleteUser = async (id) => {
    if (!id) return;

    setConfirmDialog({
      show: true,
      message: 'Yakin ingin menghapus user ini?',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, "users", id));

          // Optional backup
          const newList = usersList.filter(u => u.id !== id);
          storage.set('users-list', JSON.stringify(newList), true).catch(() => {});
        } catch (e) {
          console.error('Error deleting user in Firestore:', e);
          setAlertMessage('Gagal menghapus user di Firestore: ' + (e?.message || e));
        } finally {
          setConfirmDialog({ show: false, message: '', onConfirm: null });
        }
      }
    });
  };;

  const toggleUserActive = async (id) => {
    const user = usersList.find(u => u.id === id);
    if (user) {
      await updateUser(id, { isActive: !user.isActive });
    }
  };

  const addTransaksi = async (data) => {
    const newTransaksi = {
      id: 'T-' + Date.now(),
      ...data,
      createdAt: new Date().toISOString(),
      createdBy: currentUser.name
    };
    const newList = [...transaksiList, newTransaksi];
    setTransaksiList(newList);
    await storage.set('transaksi-list', JSON.stringify(newList), true);
  };

  const deleteTransaksi = async (id) => {
    setConfirmDialog({
      show: true,
      message: 'Yakin ingin menghapus transaksi ini?',
      onConfirm: async () => {
        const newList = transaksiList.filter(t => t.id !== id);
        setTransaksiList(newList);
        await storage.set('transaksi-list', JSON.stringify(newList), true);
        setConfirmDialog({ show: false, message: '', onConfirm: null });
      }
    });
  };

  // Master Data Truck Functions
  const addTruck = async (data) => {
    const newTruck = {
      id: 'TRK-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
      ...data,
      createdAt: nowIso(),
      createdBy: currentUser?.username || currentUser?.name || 'system'
    };

    try {
      await setDoc(doc(db, "trucks", newTruck.id), sanitizeForFirestore(newTruck), { merge: true });

      // Optional backup (tidak dipakai untuk load master data)
      storage.set('truck-list', JSON.stringify([...truckList, newTruck]), true).catch(() => {});
    } catch (e) {
      console.error('Error saving truck to Firestore:', e);
      setAlertMessage('❌ Gagal simpan Truck ke Firestore: ' + (e?.message || e));
    }
  };;

  const updateTruck = async (id, updates) => {
    if (!id) return;

    const payload = {
      ...updates,
      updatedAt: nowIso(),
      updatedBy: currentUser?.username || currentUser?.name || 'system'
    };

    try {
      await setDoc(doc(db, "trucks", id), sanitizeForFirestore(payload), { merge: true });

      // Optional backup
      const newList = truckList.map(t => (t.id === id ? { ...t, ...payload } : t));
      storage.set('truck-list', JSON.stringify(newList), true).catch(() => {});
    } catch (e) {
      console.error('Error updating truck in Firestore:', e);
      setAlertMessage('❌ Gagal update Truck di Firestore: ' + (e?.message || e));
    }
  };;

  const deleteTruck = async (id) => {
    if (!id) return;

    setConfirmDialog({
      show: true,
      message: 'Yakin ingin menghapus truck ini?',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, "trucks", id));

          // Optional backup
          const newList = truckList.filter(t => t.id !== id);
          storage.set('truck-list', JSON.stringify(newList), true).catch(() => {});
        } catch (e) {
          console.error('Error deleting truck in Firestore:', e);
          setAlertMessage('❌ Gagal hapus Truck di Firestore: ' + (e?.message || e));
        } finally {
          setConfirmDialog({ show: false, message: '', onConfirm: null });
        }
      }
    });
  };;

  // Master Data Supir Functions
  const addSupir = async (data) => {
    const newSupir = {
      id: 'SPR-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
      ...data,
      createdAt: nowIso(),
      createdBy: currentUser?.username || currentUser?.name || 'system'
    };

    try {
      await setDoc(doc(db, "supir", newSupir.id), newSupir, { merge: true });
      storage.set('supir-list', JSON.stringify([...supirList, newSupir]), true).catch(() => {});
    } catch (e) {
      console.error('Error saving supir to Firestore:', e);
      setAlertMessage('❌ Gagal simpan Supir ke Firestore: ' + (e?.message || e));
    }
  };;

  const updateSupir = async (id, updates) => {
    if (!id) return;

    const payload = {
      ...updates,
      updatedAt: nowIso(),
      updatedBy: currentUser?.username || currentUser?.name || 'system'
    };

    try {
      await setDoc(doc(db, "supir", id), payload, { merge: true });
      const newList = supirList.map(s => (s.id === id ? { ...s, ...payload } : s));
      storage.set('supir-list', JSON.stringify(newList), true).catch(() => {});
    } catch (e) {
      console.error('Error updating supir in Firestore:', e);
      setAlertMessage('❌ Gagal update Supir di Firestore: ' + (e?.message || e));
    }
  };;

  const deleteSupir = async (id) => {
    if (!id) return;

    setConfirmDialog({
      show: true,
      message: 'Yakin ingin menghapus supir ini?',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, "supir", id));
          const newList = supirList.filter(s => s.id !== id);
          storage.set('supir-list', JSON.stringify(newList), true).catch(() => {});
        } catch (e) {
          console.error('Error deleting supir in Firestore:', e);
          setAlertMessage('❌ Gagal hapus Supir di Firestore: ' + (e?.message || e));
        } finally {
          setConfirmDialog({ show: false, message: '', onConfirm: null });
        }
      }
    });
  };;

  // Master Data Rute Functions
  const addRute = async (data) => {
    const newRute = {
      id: 'RTE-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
      ...data,
      createdAt: nowIso(),
      createdBy: currentUser?.username || currentUser?.name || 'system'
    };

    try {
      await setDoc(doc(db, "rute", newRute.id), newRute, { merge: true });
      storage.set('rute-list', JSON.stringify([...ruteList, newRute]), true).catch(() => {});
    } catch (e) {
      console.error('Error saving rute to Firestore:', e);
      setAlertMessage('❌ Gagal simpan Rute ke Firestore: ' + (e?.message || e));
    }
  };;

  const updateRute = async (id, updates) => {
    if (!id) return;

    const payload = {
      ...updates,
      updatedAt: nowIso(),
      updatedBy: currentUser?.username || currentUser?.name || 'system'
    };

    try {
      await setDoc(doc(db, "rute", id), payload, { merge: true });
      const newList = ruteList.map(r => (r.id === id ? { ...r, ...payload } : r));
      storage.set('rute-list', JSON.stringify(newList), true).catch(() => {});
    } catch (e) {
      console.error('Error updating rute in Firestore:', e);
      setAlertMessage('❌ Gagal update Rute di Firestore: ' + (e?.message || e));
    }
  };;

  const deleteRute = async (id) => {
    if (!id) return;

    setConfirmDialog({
      show: true,
      message: 'Yakin ingin menghapus rute ini?',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, "rute", id));
          const newList = ruteList.filter(r => r.id !== id);
          storage.set('rute-list', JSON.stringify(newList), true).catch(() => {});
        } catch (e) {
          console.error('Error deleting rute in Firestore:', e);
          setAlertMessage('❌ Gagal hapus Rute di Firestore: ' + (e?.message || e));
        } finally {
          setConfirmDialog({ show: false, message: '', onConfirm: null });
        }
      }
    });
  };;

  // Master Data Material Functions
  const addMaterial = async (data) => {
    const newMaterial = {
      id: 'MAT-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
      ...data,
      createdAt: nowIso(),
      createdBy: currentUser?.username || currentUser?.name || 'system'
    };

    try {
      await setDoc(doc(db, "material", newMaterial.id), newMaterial, { merge: true });
      storage.set('material-list', JSON.stringify([...materialList, newMaterial]), true).catch(() => {});
    } catch (e) {
      console.error('Error saving material to Firestore:', e);
      setAlertMessage('❌ Gagal simpan Material ke Firestore: ' + (e?.message || e));
    }
  };;

  const updateMaterial = async (id, updates) => {
    if (!id) return;

    const payload = {
      ...updates,
      updatedAt: nowIso(),
      updatedBy: currentUser?.username || currentUser?.name || 'system'
    };

    try {
      await setDoc(doc(db, "material", id), payload, { merge: true });
      const newList = materialList.map(m => (m.id === id ? { ...m, ...payload } : m));
      storage.set('material-list', JSON.stringify(newList), true).catch(() => {});
    } catch (e) {
      console.error('Error updating material in Firestore:', e);
      setAlertMessage('❌ Gagal update Material di Firestore: ' + (e?.message || e));
    }
  };;

  const deleteMaterial = async (id) => {
    if (!id) return;

    setConfirmDialog({
      show: true,
      message: 'Yakin ingin menghapus material ini?',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, "material", id));
          const newList = materialList.filter(m => m.id !== id);
          storage.set('material-list', JSON.stringify(newList), true).catch(() => {});
        } catch (e) {
          console.error('Error deleting material in Firestore:', e);
          setAlertMessage('❌ Gagal hapus Material di Firestore: ' + (e?.message || e));
        } finally {
          setConfirmDialog({ show: false, message: '', onConfirm: null });
        }
      }
    });
  };;

  // Invoice Functions
  const addInvoice = async (data) => {
    const newInvoice = {
      id: 'INV-' + Date.now(),
      noInvoice: data.noInvoice,
      tglInvoice: data.tglInvoice,
      suratJalanIds: data.selectedSJIds,
      suratJalanList: suratJalanList.filter(sj => data.selectedSJIds.includes(sj.id)),
      totalQty: suratJalanList
        .filter(sj => data.selectedSJIds.includes(sj.id))
        .reduce((sum, sj) => sum + (sj.qtyBongkar || 0), 0),
      createdAt: new Date().toISOString(),
      createdBy: currentUser.name
    };
    
    const updatedSJList = suratJalanList.map(sj => {
      if (data.selectedSJIds.includes(sj.id)) {
        return {
          ...sj,
          statusInvoice: 'terinvoice',
          invoiceId: newInvoice.id,
          invoiceNo: data.noInvoice,
          updatedAt: new Date().toISOString(),
          updatedBy: currentUser.name
        };
      }
      return sj;
    });
    
    setSuratJalanList(updatedSJList);
    
    const newInvoiceList = [...invoiceList, newInvoice];
    setInvoiceList(newInvoiceList);
    
    await storage.set('invoice-list', JSON.stringify(newInvoiceList), true);
    await storage.set('surat-jalan-list', JSON.stringify(updatedSJList), true);
    
    setAlertMessage('✅ Invoice berhasil dibuat!');
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
        const { statusInvoice, invoiceId, invoiceNo, ...rest } = sj;
        return {
          ...rest,
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
        .reduce((sum, sj) => sum + (sj.qtyBongkar || 0), 0),
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser.name
    };

    const updatedInvoiceList = invoiceList.map(inv => 
      inv.id === invoiceId ? updatedInvoice : inv
    );

    setSuratJalanList(updatedSJList);
    setInvoiceList(updatedInvoiceList);

    await storage.set('invoice-list', JSON.stringify(updatedInvoiceList), true);
    await storage.set('surat-jalan-list', JSON.stringify(updatedSJList), true);

    setAlertMessage('✅ Invoice berhasil diupdate!');
  };

  const deleteInvoice = async (id) => {
    setConfirmDialog({
      show: true,
      message: 'Yakin ingin menghapus invoice ini?\n\nSurat Jalan akan kembali ke status "Belum Terinvoice".',
      onConfirm: async () => {
        const invoice = invoiceList.find(inv => inv.id === id);
        
        const updatedSJList = suratJalanList.map(sj => {
          if (invoice.suratJalanIds.includes(sj.id)) {
            const { statusInvoice, invoiceId, invoiceNo, ...rest } = sj;
            return {
              ...rest,
              updatedAt: new Date().toISOString(),
              updatedBy: currentUser.name
            };
          }
          return sj;
        });
        
        setSuratJalanList(updatedSJList);
        
        const newInvoiceList = invoiceList.filter(inv => inv.id !== id);
        setInvoiceList(newInvoiceList);
        
        await storage.set('invoice-list', JSON.stringify(newInvoiceList), true);
        await storage.set('surat-jalan-list', JSON.stringify(updatedSJList), true);
        
        setConfirmDialog({ show: false, message: '', onConfirm: null });
        setAlertMessage('✅ Invoice berhasil dihapus!');
      }
    });
  };

  // Update Settings
  const updateSettings = async (newSettings) => {
    setAppSettings(newSettings);
    await storage.set('app-settings', JSON.stringify(newSettings), true);
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
  for (let i = 0; i < dataRows.length; i++) {
    const values = dataRows[i].split(delimiter).map(v => v.trim());
    if (values.length >= 2 && values[0]) {
      try {
        const isActive =
          values[1].toLowerCase() === 'ya' ||
          values[1].toLowerCase() === 'yes' ||
          values[1].toLowerCase() === 'true' ||
          values[1] === '1';

        const newTruck = {
          id: 'TRK-' + Date.now() + '-' + i + '-' + Math.random().toString(36).substr(2, 9),
          nomorPolisi: values[0],
          isActive: isActive,
          createdAt: new Date().toISOString(),
          createdBy: currentUser?.username || currentUser?.name || 'Import'
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

  if (newItems.length > 0) {
    const updatedList = [...truckList, ...newItems];
    setTruckList(updatedList);

    storage.set('truck-list', JSON.stringify(updatedList), true).catch(err => {
      console.error('Error saving trucks (local storage backup):', err);
    });

    // Firestore write (tanpa await supaya aman)
    const batch = writeBatch(db);
    newItems.forEach((t) => {
      batch.set(doc(db, "trucks", t.id), sanitizeForFirestore(t), { merge: true });
    });

batch.commit()
  .then(() => {
    console.log("Truck berhasil disimpan ke Firestore");
    setAlertMessage("✅ Import Truck sukses dan tersimpan ke Firestore.");
  })
  .catch((e) => {
    console.error("Error writing trucks to Firestore:", e);
    setAlertMessage("❌ GAGAL simpan ke Firestore:\n" + (e?.message || e));
  });
  }
    } else if (type === 'supir') {
      csvContent = 'Nama Supir;PT;Aktif (Ya/Tidak)\nJohn Doe;PT Maju Jaya;Ya\nJane Smith;PT Sejahtera;Ya\nBob Wilson;PT Makmur;Tidak';
      filename = 'template_supir.csv';
    } else if (type === 'rute') {
      csvContent = 'Rute;Uang Jalan\nJakarta - Surabaya;500000\nBandung - Semarang;350000\nJakarta - Medan;1200000';
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
      try {
        const text = e.target.result;
        
        // Detect delimiter (comma or semicolon)
        const firstLine = text.split('\n')[0];
        const delimiter = firstLine.includes(';') ? ';' : ',';
        
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
          expectedHeader = 'Rute;Uang Jalan';
          isValidHeader = headers.length === 2 && 
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
          // Helper function to parse date DD/MM/YYYY
          const parseDate = (dateStr) => {
            if (!dateStr || dateStr.trim() === '') return null;
            const parts = dateStr.trim().split('/');
            if (parts.length === 3) {
              const day = parts[0].padStart(2, '0');
              const month = parts[1].padStart(2, '0');
              const year = parts[2];
              return `${year}-${month}-${day}`;
            }
            return null;
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

                // Jika tidak ada, buat data master baru
                if (!truckId) {
                  const newTruck = {
                    id: 'TRK-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
                    nomorPolisi,
                    isActive: true,
                    createdAt: new Date().toISOString(),
                    createdBy: 'Import'
                  };
                  setTruckList(prev => {
                    const updated = [...prev, newTruck];
                    storage.set('truck-list', JSON.stringify(updated), true);
                    return updated;
                  });
                  truckId = newTruck.id;
                }

                if (!supirId) {
                  const newSupir = {
                    id: 'SPR-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
                    namaSupir,
                    pt: 'Import Data',
                    isActive: true,
                    createdAt: new Date().toISOString(),
                    createdBy: 'Import'
                  };
                  setSupirList(prev => {
                    const updated = [...prev, newSupir];
                    storage.set('supir-list', JSON.stringify(updated), true);
                    return updated;
                  });
                  supirId = newSupir.id;
                }

                if (!ruteId) {
                  const newRute = {
                    id: 'RTE-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
                    rute,
                    uangJalan: 0,
                    createdAt: new Date().toISOString(),
                    createdBy: 'Import'
                  };
                  setRuteList(prev => {
                    const updated = [...prev, newRute];
                    storage.set('rute-list', JSON.stringify(updated), true);
                    return updated;
                  });
                  ruteId = newRute.id;
                }

                if (!materialId) {
                  const newMaterial = {
                    id: 'MAT-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
                    material,
                    satuan: 'Ton',
                    createdAt: new Date().toISOString(),
                    createdBy: 'Import'
                  };
                  setMaterialList(prev => {
                    const updated = [...prev, newMaterial];
                    storage.set('material-list', JSON.stringify(updated), true);
                    return updated;
                  });
                  materialId = newMaterial.id;
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
                  pt: supirList.find(s => s.id === supirId)?.pt || 'Import Data',
                  ruteId,
                  rute,
                  uangJalan: ruteList.find(r => r.id === ruteId)?.uangJalan || 0,
                  materialId,
                  material,
                  satuan: materialList.find(m => m.id === materialId)?.satuan || 'Ton',
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

          // Batch update untuk Surat Jalan
          if (newItems.length > 0) {
            setSuratJalanList(prevList => {
              const updatedList = [...prevList, ...newItems];
              storage.set('surat-jalan-list', JSON.stringify(updatedList), true).catch(err => {
                console.error('Error saving surat jalan:', err);
              });
              return updatedList;
            });
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
      batch.set(doc(db, "trucks", t.id), sanitizeForFirestore(t), { merge: true });
    });
    await batch.commit();
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
          
          // Batch update untuk supir
          if (newItems.length > 0) {
            setSupirList(prevList => {
              const updatedList = [...prevList, ...newItems];
              storage.set('supir-list', JSON.stringify(updatedList), true).catch(err => {
                console.error('Error saving supir:', err);
              });
              return updatedList;
            });
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
                
                const newRute = {
                  id: 'RUT-' + Date.now() + '-' + i + '-' + Math.random().toString(36).substr(2, 9),
                  rute: values[0],
                  uangJalan: uangJalan,
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
          
          // Batch update untuk rute
          if (newItems.length > 0) {
            setRuteList(prevList => {
              const updatedList = [...prevList, ...newItems];
              storage.set('rute-list', JSON.stringify(updatedList), true).catch(err => {
                console.error('Error saving rute:', err);
              });
              return updatedList;
            });
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
          
          // Batch update untuk material
          if (newItems.length > 0) {
            setMaterialList(prevList => {
              const updatedList = [...prevList, ...newItems];
              storage.set('material-list', JSON.stringify(updatedList), true).catch(err => {
                console.error('Error saving material:', err);
              });
              return updatedList;
            });
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
      status: 'pending',
      createdAt: new Date().toISOString(),
      createdBy: currentUser.name
    };
    
    const newList = [...suratJalanList, newSJ];
    setSuratJalanList(newList);
    
    // Auto-create transaksi keuangan untuk Uang Jalan
    if (selectedRute && selectedRute.uangJalan > 0) {
      const newTransaksi = {
        id: 'T-' + Date.now(),
        tipe: 'pengeluaran',
        nominal: selectedRute.uangJalan,
        keterangan: `Uang Jalan - ${newSJ.nomorSJ} (${selectedRute.rute})`,
        tanggal: data.tanggalSJ,
        suratJalanId: newSJ.id,
        createdAt: new Date().toISOString(),
        createdBy: currentUser.name
      };
      const newTransaksiList = [...transaksiList, newTransaksi];
      setTransaksiList(newTransaksiList);
      await storage.set('transaksi-list', JSON.stringify(newTransaksiList), true);
    }
    
    await saveData(newList, biayaList);
  };

  const updateSuratJalan = async (id, updates) => {
    const newList = suratJalanList.map(sj => 
      sj.id === id ? { 
        ...sj, 
        ...updates, 
        updatedAt: new Date().toISOString(), 
        updatedBy: currentUser.name 
      } : sj
    );
    setSuratJalanList(newList);
    await saveData(newList, biayaList);
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
          tanggal: uangJalanTransaksi.tanggal
        } : null;
        
        // Update status SJ dengan menyimpan info Uang Jalan yang dihapus
        await updateSuratJalan(id, { 
          status: 'gagal',
          deletedUangJalan // Simpan untuk restore
        });
        
        // Hapus transaksi Uang Jalan yang terkait
        const updatedTransaksiList = transaksiList.filter(t => t.suratJalanId !== id);
        setTransaksiList(updatedTransaksiList);
        await storage.set('transaksi-list', JSON.stringify(updatedTransaksiList), true);
        
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
        // Update status kembali ke pending
        await updateSuratJalan(id, { status: 'pending' });
        
        // Re-create Uang Jalan jika ada data yang tersimpan
        if (sj?.deletedUangJalan) {
          const newTransaksi = {
            id: 'T-' + Date.now(),
            tipe: 'pengeluaran',
            nominal: sj.deletedUangJalan.nominal,
            keterangan: sj.deletedUangJalan.keterangan + ' (Restored)',
            tanggal: sj.deletedUangJalan.tanggal,
            suratJalanId: id,
            pt: sj.pt,
            createdAt: new Date().toISOString(),
            createdBy: currentUser.name
          };
          const newTransaksiList = [...transaksiList, newTransaksi];
          setTransaksiList(newTransaksiList);
          await storage.set('transaksi-list', JSON.stringify(newTransaksiList), true);
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
        const newList = suratJalanList.filter(sj => sj.id !== id);
        const newBiayaList = biayaList.filter(b => b.suratJalanId !== id);
        setSuratJalanList(newList);
        setBiayaList(newBiayaList);
        await saveData(newList, newBiayaList);
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
    await saveData(suratJalanList, newList);
  };

  const deleteBiaya = async (id) => {
    setConfirmDialog({
      show: true,
      message: 'Yakin ingin menghapus biaya ini?',
      onConfirm: async () => {
        const newList = biayaList.filter(b => b.id !== id);
        setBiayaList(newList);
        await saveData(suratJalanList, newList);
        setConfirmDialog({ show: false, message: '', onConfirm: null });
      }
    });
  };

  const getTotalBiaya = (suratJalanId) => {
    return biayaList
      .filter(b => b.suratJalanId === suratJalanId)
      .reduce((sum, b) => sum + parseFloat(b.nominal || 0), 0);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(amount);
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

  const filteredSuratJalan = suratJalanList.filter(sj => 
    filter === 'all' || sj.status === filter
  );

  // Login Screen
  if (!currentUser) {
    return <LoginScreen onLogin={handleLogin} alertMessage={alertMessage} setAlertMessage={setAlertMessage} appSettings={appSettings} />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Package className="w-16 h-16 text-blue-600 animate-pulse mx-auto mb-4" />
          <p className="text-gray-600">Memuat data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              {/* Logo or Icon */}
              {appSettings?.logoUrl ? (
                <img 
                  src={appSettings.logoUrl} 
                  alt="Logo" 
                  className="h-10 object-contain bg-white rounded p-1"
                />
              ) : (
                <Package className="w-8 h-8" />
              )}
              
              <div>
                {/* Company Name */}
                {appSettings?.companyName && (
                  <p className="text-sm text-blue-100 font-semibold">{appSettings.companyName}</p>
                )}
                <h1 className="text-2xl font-bold">Monitoring Surat Jalan</h1>
                <p className="text-blue-100 text-sm">Sistem Tracking & Monitoring Biaya</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <p className="font-semibold">{currentUser.name}</p>
                <p className="text-blue-100 text-sm capitalize">{currentUser.role}</p>
              </div>
              <button
                onClick={handleLogout}
                className="bg-blue-700 hover:bg-blue-600 px-4 py-2 rounded-lg flex items-center space-x-2 transition"
              >
                <LogOut className="w-4 h-4" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Tab Navigation */}
        {(currentUser.role === 'superadmin' || currentUser.role === 'admin_keuangan') && (
          <div className="bg-white rounded-lg shadow-md p-2 mb-6 flex gap-2 overflow-x-auto">
            <button
              onClick={() => setActiveTab('surat-jalan')}
              className={`flex-1 px-4 py-2 rounded-lg transition flex items-center justify-center gap-2 whitespace-nowrap ${activeTab === 'surat-jalan' ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
            >
              <Package className="w-4 h-4" />
              <span>Surat Jalan</span>
            </button>
            <button
              onClick={() => setActiveTab('keuangan')}
              className={`flex-1 px-4 py-2 rounded-lg transition flex items-center justify-center gap-2 whitespace-nowrap ${activeTab === 'keuangan' ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
            >
              <DollarSign className="w-4 h-4" />
              <span>Keuangan</span>
            </button>
            <button
              onClick={() => setActiveTab('laporan-kas')}
              className={`flex-1 px-4 py-2 rounded-lg transition flex items-center justify-center gap-2 whitespace-nowrap ${activeTab === 'laporan-kas' ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
            >
              <FileText className="w-4 h-4" />
              <span>Laporan Kas</span>
            </button>
            {(currentUser.role === 'superadmin' || currentUser.role === 'admin_invoice' || currentUser.role === 'reader') && (
              <button
                onClick={() => setActiveTab('invoicing')}
                className={`flex-1 px-4 py-2 rounded-lg transition flex items-center justify-center gap-2 whitespace-nowrap ${activeTab === 'invoicing' ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
              >
                <FileText className="w-4 h-4" />
                <span>Invoicing</span>
              </button>
            )}
            {currentUser.role === 'superadmin' && (
              <>
                <button
                  onClick={() => setActiveTab('master')}
                  className={`flex-1 px-4 py-2 rounded-lg transition flex items-center justify-center gap-2 whitespace-nowrap ${activeTab === 'master' ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
                >
                  <FileText className="w-4 h-4" />
                  <span>Master Data</span>
                </button>
                <button
                  onClick={() => setActiveTab('users')}
                  className={`flex-1 px-4 py-2 rounded-lg transition flex items-center justify-center gap-2 whitespace-nowrap ${activeTab === 'users' ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
                >
                  <Users className="w-4 h-4" />
                  <span>Kelola User</span>
                </button>
                <button
                  onClick={() => setActiveTab('settings')}
                  className={`flex-1 px-4 py-2 rounded-lg transition flex items-center justify-center gap-2 whitespace-nowrap ${activeTab === 'settings' ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
                >
                  <Edit className="w-4 h-4" />
                  <span>Settings</span>
                </button>
              </>
            )}
          </div>
        )}

        {activeTab === 'settings' && currentUser.role === 'superadmin' ? (
          <SettingsManagement
            currentUser={currentUser}
            appSettings={appSettings}
            onUpdateSettings={updateSettings}
          />
        ) : activeTab === 'users' && currentUser.role === 'superadmin' ? (
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
        ) : activeTab === 'master' && currentUser.role === 'superadmin' ? (
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
          <LaporanKas
            suratJalanList={suratJalanList}
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <StatCard
            title="Total Surat Jalan"
            value={suratJalanList.length}
            icon={<FileText className="w-6 h-6" />}
            color="bg-blue-500"
          />
          <StatCard
            title="Pending"
            value={suratJalanList.filter(s => s.status === 'pending').length}
            icon={<Clock className="w-6 h-6" />}
            color="bg-yellow-500"
          />
          <StatCard
            title="Terkirim"
            value={suratJalanList.filter(s => s.status === 'terkirim').length}
            icon={<CheckCircle className="w-6 h-6" />}
            color="bg-green-500"
          />
          <StatCard
            title="Gagal"
            value={suratJalanList.filter(s => s.status === 'gagal').length}
            icon={<XCircle className="w-6 h-6" />}
            color="bg-red-500"
          />
        </div>

        {/* Actions & Filters */}
        <div className="bg-white rounded-lg shadow-md p-4 mb-6">
          <div className="flex flex-wrap gap-3 items-center justify-between">
            <div className="flex gap-2 flex-wrap">
              {(currentUser.role === 'superadmin' || currentUser.role === 'admin_sj') && (
                <>
                  <button
                    onClick={() => {
                      setModalType('addSJ');
                      setSelectedItem(null);
                      setShowModal(true);
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Tambah Surat Jalan</span>
                  </button>
                  
                  <button
                    onClick={() => downloadTemplate('suratjalan')}
                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition"
                  >
                    <FileText className="w-4 h-4" />
                    <span>Download Template</span>
                  </button>
                  
                  <label className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition cursor-pointer">
                    <Package className="w-4 h-4" />
                    <span>Import Data</span>
                    <input
                      type="file"
                      accept=".csv"
                      onChange={(e) => handleFileImport('suratjalan', e)}
                      className="hidden"
                    />
                  </label>

                  <button
                    onClick={() => {
                      const headers = ['No SJ','Tgl SJ','PT','No. Polisi','Supir','Rute','Material','Qty Isi','Qty Bongkar','Satuan','Status','Uang Jalan'];
                      const rows = filteredSuratJalan.map(sj => ([
                        sj.nomorSJ || '',
                        sj.tanggalSJ ? new Date(sj.tanggalSJ).toLocaleDateString('id-ID') : '',
                        sj.pt || '',
                        sj.nomorPolisi || '',
                        sj.namaSupir || '',
                        sj.rute || '',
                        sj.material || '',
                        sj.qtyIsi ?? '',
                        sj.qtyBongkar ?? '',
                        sj.satuan || '',
                        sj.status || '',
                        sj.uangJalan ?? ''
                      ]));
                      exportRowsToCSV({
                        filename: `Laporan_SuratJalan_${new Date().toISOString().split('T')[0]}.csv`,
                        headers,
                        rows
                      });
                    }}
                    className="bg-gray-700 hover:bg-gray-800 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition"
                    title="Export laporan Surat Jalan (sesuai filter status)"
                  >
                    <FileText className="w-4 h-4" />
                    <span>Export CSV</span>
                  </button>

                  <button
                    onClick={() => {
                      const headers = ['No SJ','Tgl SJ','PT','No. Polisi','Supir','Rute','Material','Qty Isi','Qty Bongkar','Satuan','Status','Uang Jalan'];
                      const rows = filteredSuratJalan.map(sj => ([
                        sj.nomorSJ || '',
                        sj.tanggalSJ ? new Date(sj.tanggalSJ).toLocaleDateString('id-ID') : '',
                        sj.pt || '',
                        sj.nomorPolisi || '',
                        sj.namaSupir || '',
                        sj.rute || '',
                        sj.material || '',
                        sj.qtyIsi ?? '',
                        sj.qtyBongkar ?? '',
                        sj.satuan || '',
                        sj.status || '',
                        sj.uangJalan ?? ''
                      ]));
                      exportRowsToXLSX({
                        filename: `Laporan_SuratJalan_${new Date().toISOString().split('T')[0]}.xlsx`,
                        sheetName: "Surat Jalan",
                        headers,
                        rows
                      });
                    }}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition"
                    title="Export laporan Surat Jalan (Excel .xlsx)"
                  >
                    <FileText className="w-4 h-4" />
                    <span>Export CSV</span>
                  </button>

                </>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setFilter('all')}
                className={`px-4 py-2 rounded-lg transition ${filter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
              >
                Semua
              </button>
              <button
                onClick={() => setFilter('pending')}
                className={`px-4 py-2 rounded-lg transition ${filter === 'pending' ? 'bg-yellow-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
              >
                Pending
              </button>
              <button
                onClick={() => setFilter('terkirim')}
                className={`px-4 py-2 rounded-lg transition ${filter === 'terkirim' ? 'bg-green-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
              >
                Terkirim
              </button>
              <button
                onClick={() => setFilter('gagal')}
                className={`px-4 py-2 rounded-lg transition ${filter === 'gagal' ? 'bg-red-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
              >
                Gagal
              </button>
            </div>
          </div>
        </div>

        {/* Surat Jalan List */}
        <div className="space-y-4">
          {filteredSuratJalan.length === 0 ? (
            <div className="bg-white rounded-lg shadow-md p-8 text-center">
              <Package className="w-16 h-16 mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500">Belum ada data Surat Jalan</p>
              {(currentUser.role === 'admin' || currentUser.role === 'gudang') && (
                <button
                  onClick={() => {
                    setModalType('addSJ');
                    setSelectedItem(null);
                    setShowModal(true);
                  }}
                  className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg inline-flex items-center space-x-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tambah Surat Jalan Pertama</span>
                </button>
              )}
            </div>
          ) : (
            filteredSuratJalan.map(sj => (
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
            ))
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
          onClose={() => setShowModal(false)}
          onSubmit={async (data) => {
            if (modalType === 'addSJ') {
              addSuratJalan(data);
              setShowModal(false);
            } else if (modalType === 'markTerkirim' || modalType === 'editTerkirim') {
              await updateSuratJalan(selectedItem.id, {
                status: 'terkirim',
                tglTerkirim: data.tglTerkirim,
                qtyBongkar: parseFloat(data.qtyBongkar)
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
            }
          }}
        />
      )}

      {/* Alert Dialog */}
      {alertMessage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
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
    </div>
  );
};

const MasterDataManagement = ({ 
  truckList, supirList, ruteList, materialList, currentUser,
  onAddTruck, onEditTruck, onDeleteTruck,
  onAddSupir, onEditSupir, onDeleteSupir,
  onAddRute, onEditRute, onDeleteRute,
  onAddMaterial, onEditMaterial, onDeleteMaterial,
  onDownloadTemplate, onImportData
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
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-gray-600">Rute ID:</p>
                          <p className="font-semibold text-gray-800">{rute.id}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Uang Jalan:</p>
                          <p className="font-semibold text-blue-600">{formatCurrency(rute.uangJalan)}</p>
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
const SettingsManagement = ({ currentUser, appSettings, onUpdateSettings }) => {
  const [settings, setSettings] = useState({
    companyName: appSettings?.companyName || '',
    logoUrl: appSettings?.logoUrl || '',
    loginFooterText: appSettings?.loginFooterText || 'Masuk untuk mengakses dashboard monitoring'
  });
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(appSettings?.logoUrl || '');

  const canManageSettings = currentUser.role === 'superadmin';

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
            <div className="bg-blue-50 rounded-lg p-6">
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
    </div>
  );
};

const KeuanganManagement = ({ transaksiList, currentUser, onAddTransaksi, onDeleteTransaksi }) => {
  const [filter, setFilter] = useState('all');
  const [filterPT, setFilterPT] = useState('');
  
  // Get unique PT list
  const ptList = [...new Set(transaksiList.map(t => t.pt).filter(Boolean))].sort();
  
  const filteredTransaksi = transaksiList.filter(t => {
    if (filter !== 'all' && t.tipe !== filter) return false;
    if (filterPT && t.pt !== filterPT) return false;
    return true;
  });

  const totalPemasukan = transaksiList
    .filter(t => t.tipe === 'pemasukan' && (!filterPT || t.pt === filterPT))
    .reduce((sum, t) => sum + parseFloat(t.nominal || 0), 0);
  
  const totalPengeluaran = transaksiList
    .filter(t => t.tipe === 'pengeluaran' && (!filterPT || t.pt === filterPT))
    .reduce((sum, t) => sum + parseFloat(t.nominal || 0), 0);
  
  const saldoKas = totalPemasukan - totalPengeluaran;

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const canAddTransaksi = currentUser.role === 'superadmin' || currentUser.role === 'admin_keuangan';

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
        <div className="flex justify-between items-center mb-3">
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg transition ${filter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
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
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition"
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

const LoginScreen = ({ onLogin, alertMessage, setAlertMessage, appSettings }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = () => {
    if (username && password) {
      onLogin(username, password);
    } else {
      setAlertMessage('Username dan password harus diisi!');
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          {/* Logo */}
          {appSettings?.logoUrl ? (
            <img 
              src={appSettings.logoUrl} 
              alt="Logo" 
              className="h-20 mx-auto mb-4 object-contain"
            />
          ) : (
            <Package className="w-16 h-16 mx-auto text-blue-600 mb-4" />
          )}
          
          {/* Company Name */}
          {appSettings?.companyName && (
            <h1 className="text-2xl font-bold text-gray-800 mb-2">{appSettings.companyName}</h1>
          )}
          
          <h2 className="text-3xl font-bold text-gray-800">Monitoring Surat Jalan</h2>
          <p className="text-gray-600 mt-2">Silakan login untuk melanjutkan</p>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyPress={handleKeyPress}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Masukkan username"
              autoComplete="username"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyPress={handleKeyPress}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Masukkan password"
              autoComplete="current-password"
            />
          </div>
          
          <button
            onClick={handleSubmit}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition"
          >
            Login
          </button>
        </div>

        {/* Footer Text */}
        {appSettings?.loginFooterText && (
          <div className="mt-6 p-4 bg-blue-50 rounded-lg text-center">
            <p className="text-sm text-blue-800">
              {appSettings.loginFooterText}
            </p>
          </div>
        )}
      </div>

      {/* Alert Dialog in Login */}
      {alertMessage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
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
    </div>
  );
};

const StatCard = ({ title, value, icon, color }) => (
  <div className="bg-white rounded-lg shadow-md p-6">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-gray-600 text-sm">{title}</p>
        <p className="text-3xl font-bold text-gray-800 mt-1">{value}</p>
      </div>
      <div className={`${color} p-3 rounded-lg text-white`}>
        {icon}
      </div>
    </div>
  </div>
);

const SuratJalanCard = ({ 
  suratJalan, 
  biayaList, 
  totalBiaya, 
  currentUser, 
  onUpdate, 
  onMarkGagal,
  onRestore,
  onEditTerkirim,
  onDeleteBiaya,
  formatCurrency,
  getStatusColor,
  getStatusIcon
}) => {
  const [expanded, setExpanded] = useState(false);

  const canMarkTerkirim = () => {
    if (currentUser.role === 'superadmin') return true;
    if (currentUser.role === 'admin_sj' && suratJalan.status === 'pending') return true;
    return false;
  };

  const canMarkGagal = () => {
    if (currentUser.role === 'superadmin') return true;
    if (currentUser.role === 'admin_sj' && (suratJalan.status === 'pending')) return true;
    return false;
  };

  const canEdit = () => {
    return currentUser.role === 'superadmin' && suratJalan.status === 'terkirim';
  };

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition">
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center space-x-3 mb-2">
              <h3 className="text-xl font-bold text-gray-800">{suratJalan.nomorSJ}</h3>
              <span className={`px-3 py-1 rounded-full text-sm font-semibold flex items-center space-x-1 ${getStatusColor(suratJalan.status)}`}>
                {getStatusIcon(suratJalan.status)}
                <span className="capitalize">{suratJalan.status}</span>
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-600">Tgl SJ:</p>
                <p className="font-semibold text-gray-800">{suratJalan.tanggalSJ ? new Date(suratJalan.tanggalSJ).toLocaleDateString('id-ID') : '-'}</p>
              </div>
              <div>
                <p className="text-gray-600">Nomor Polisi:</p>
                <p className="font-semibold text-gray-800">{suratJalan.nomorPolisi || '-'}</p>
              </div>
              <div>
                <p className="text-gray-600">Supir / PT:</p>
                <p className="font-semibold text-gray-800">{suratJalan.namaSupir || '-'} / {suratJalan.pt || '-'}</p>
              </div>
              <div>
                <p className="text-gray-600">Rute:</p>
                <p className="font-semibold text-gray-800">{suratJalan.rute || '-'}</p>
              </div>
              <div>
                <p className="text-gray-600">Material / Qty Isi:</p>
                <p className="font-semibold text-gray-800">{suratJalan.material || '-'} ({suratJalan.qtyIsi || 0} {suratJalan.satuan || ''})</p>
              </div>
              <div>
                <p className="text-gray-600">Uang Jalan:</p>
                <p className="font-bold text-blue-600">{formatCurrency(suratJalan.uangJalan || 0)}</p>
              </div>
              {suratJalan.status === 'terkirim' && (
                <>
                  <div>
                    <p className="text-gray-600">Tgl Terkirim:</p>
                    <p className="font-semibold text-green-700">{suratJalan.tglTerkirim ? new Date(suratJalan.tglTerkirim).toLocaleDateString('id-ID') : '-'}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Qty Bongkar:</p>
                    <p className="font-semibold text-green-700">{suratJalan.qtyBongkar || 0} {suratJalan.satuan || ''}</p>
                  </div>
                </>
              )}
            </div>
          </div>
          
          <div className="flex flex-col space-y-2 ml-4">
            {canMarkTerkirim() && suratJalan.status === 'pending' && (
              <button
                onClick={() => onUpdate(suratJalan)}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1 whitespace-nowrap"
              >
                <CheckCircle className="w-4 h-4" />
                <span>Tandai Terkirim</span>
              </button>
            )}
            {canEdit() && (
              <button
                onClick={() => onEditTerkirim(suratJalan)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1 whitespace-nowrap"
              >
                <Edit className="w-4 h-4" />
                <span>Edit</span>
              </button>
            )}
            {canMarkGagal() && suratJalan.status !== 'gagal' && (
              <button
                onClick={() => onMarkGagal(suratJalan.id)}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1 whitespace-nowrap"
              >
                <XCircle className="w-4 h-4" />
                <span>Tandai Gagal</span>
              </button>
            )}
            {currentUser.role === 'superadmin' && suratJalan.status === 'terkirim' && (
              <button
                onClick={() => onMarkGagal(suratJalan.id)}
                className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1 whitespace-nowrap"
              >
                <XCircle className="w-4 h-4" />
                <span>Batalkan (Gagal)</span>
              </button>
            )}
            {currentUser.role === 'superadmin' && suratJalan.status === 'gagal' && (
              <button
                onClick={() => onRestore(suratJalan.id)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1 whitespace-nowrap"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Restore</span>
              </button>
            )}
            <button
              onClick={() => setExpanded(!expanded)}
              className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1 whitespace-nowrap"
            >
              <Eye className="w-4 h-4" />
              <span>{expanded ? 'Tutup' : 'Detail'}</span>
            </button>
          </div>
        </div>

        {expanded && (
          <div className="mt-6 pt-6 border-t border-gray-200">
            <div className="mb-4">
              <h4 className="font-semibold text-gray-800 mb-2">Detail Lengkap:</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-gray-600">Dibuat oleh:</p>
                  <p className="font-semibold text-gray-800">{suratJalan.createdBy}</p>
                </div>
                <div>
                  <p className="text-gray-600">Tanggal Dibuat:</p>
                  <p className="font-semibold text-gray-800">{new Date(suratJalan.createdAt).toLocaleString('id-ID')}</p>
                </div>
                {suratJalan.updatedAt && (
                  <>
                    <div>
                      <p className="text-gray-600">Diupdate oleh:</p>
                      <p className="font-semibold text-gray-800">{suratJalan.updatedBy}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Tanggal Update:</p>
                      <p className="font-semibold text-gray-800">{new Date(suratJalan.updatedAt).toLocaleString('id-ID')}</p>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const Modal = ({ type, selectedItem, currentUser, setAlertMessage, truckList = [], supirList = [], ruteList = [], materialList = [], suratJalanList = [], onClose, onSubmit }) => {
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
    noInvoice: '',
    tglInvoice: new Date().toISOString().split('T')[0],
    selectedSJIds: [],
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
    material: selectedItem?.material || '',
    satuan: selectedItem?.satuan || ''
  });

  // Initialize selectedSJIds untuk editInvoice
  useEffect(() => {
    if (type === 'editInvoice' && selectedItem && !initializedRef.current) {
      setFormData(prev => ({
        ...prev,
        noInvoice: selectedItem.noInvoice || '',
        tglInvoice: selectedItem.tglInvoice || new Date().toISOString().split('T')[0],
        selectedSJIds: selectedItem.suratJalanIds || []
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
    } else if (type === 'addTransaksi') {
      if (!formData.tipe || !formData.pt || !formData.nominal || !formData.keteranganTransaksi) {
        setAlertMessage('Tipe, PT, Nominal, dan Keterangan harus diisi!');
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
      onSubmit({
        rute: formData.rute,
        uangJalan: parseFloat(formData.uangJalan)
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className={`bg-white rounded-lg shadow-xl ${(type === 'addSJ' || type === 'markTerkirim' || type === 'editTerkirim' || type === 'addInvoice') ? 'max-w-2xl' : 'max-w-md'} w-full p-6 max-h-[90vh] overflow-y-auto`}>
        <h2 className="text-2xl font-bold text-gray-800 mb-4">
          {getModalTitle()}
        </h2>
        
        <div className="space-y-4">
          {type === 'addSJ' ? (
            <>
              <div className="grid grid-cols-2 gap-4">
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
              
              <div className="grid grid-cols-2 gap-4">
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
                <div className="grid grid-cols-2 gap-3 text-sm">
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
                        return sj.status === 'terkirim' && 
                               (!sj.statusInvoice || sj.invoiceId === selectedItem?.id);
                      }
                      // Untuk add: hanya tampilkan yang available
                      return sj.status === 'terkirim' && !sj.statusInvoice;
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
                        .filter(sj => sj.status === 'terkirim' && !sj.statusInvoice)
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
                                console.log('Checkbox changed:', sj.nomorSJ, 'checked:', e.target.checked);
                                console.log('Current selectedSJIds:', formData.selectedSJIds);
                                if (e.target.checked) {
                                  const newIds = [...formData.selectedSJIds, sj.id];
                                  console.log('Adding SJ, new IDs:', newIds);
                                  setFormData({ ...formData, selectedSJIds: newIds });
                                } else {
                                  const newIds = formData.selectedSJIds.filter(id => id !== sj.id);
                                  console.log('Removing SJ, new IDs:', newIds);
                                  setFormData({ ...formData, selectedSJIds: newIds });
                                }
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

              {/* Info */}
              <div className="bg-blue-50 border-l-4 border-blue-500 p-3 rounded-lg">
                <p className="text-sm text-blue-800">
                  💡 <strong>Info:</strong> Pilih satu atau lebih Surat Jalan yang sudah terkirim untuk dibuatkan invoice. Setelah invoice dibuat, Surat Jalan akan berstatus "Terinvoice".
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