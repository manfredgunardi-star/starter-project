import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, Clock, FileText, Package, Plus, XCircle } from 'lucide-react';
import { exportLabaKotorToExcel } from '../utils/excel.js';
import { isSJBelumInvoice, isSJTerinvoice } from '../utils/sjHelpers.js';
import Pagination, { PAGE_SIZE, clampPage } from '../components/Pagination.jsx';
import StatSummary from '../components/StatSummary.jsx';
import { useSearchFilter } from '../hooks/useSearchFilter.js';
import { useSortableData } from '../hooks/useSortableData.js';
import SearchInput from '../components/SearchInput.jsx';
import SortableHeader from '../components/SortableHeader.jsx';

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
export default function InvoiceManagement({
  invoiceList,
  suratJalanList,
  currentUser,
  uangMukaList,
  onAddInvoice,
  onDeleteInvoice,
  formatCurrency
}) {
  const [activeFilter, setActiveFilter] = useState('belum-terinvoice');
  const [labaKotorBulan, setLabaKotorBulan] = useState(new Date().getMonth() + 1);
  const [labaKotorTahun, setLabaKotorTahun] = useState(new Date().getFullYear());
  const [labaKotorFilterField, setLabaKotorFilterField] = useState('tglInvoice');
  const effectiveRole = (currentUser?.role === 'owner' ? 'reader' : currentUser?.role) || 'reader';

  const handleExportLabaKotor = async () => {
    await exportLabaKotorToExcel(invoiceList, uangMukaList, {
      bulan: labaKotorBulan,
      tahun: labaKotorTahun,
      filterField: labaKotorFilterField,
    });
  };

  const tahunOptions = [...new Set(
    (Array.isArray(invoiceList) ? invoiceList : [])
      .map(inv => { try { return new Date(inv?.tglInvoice).getFullYear(); } catch { return null; } })
      .filter(Boolean)
  )].sort((a, b) => b - a);
  if (!tahunOptions.includes(new Date().getFullYear())) tahunOptions.unshift(new Date().getFullYear());


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
  const [searchSJ, setSearchSJ] = useState('');
  const searchedSJ = useSearchFilter(filteredSJ, searchSJ, ['nomorSJ', 'nomorPolisi', 'rute', 'material']);
  const { sorted: sortedSJ, sortConfig, toggleSort } = useSortableData(searchedSJ);
  const [invPage, setInvPage] = useState(1);
  const [invoicePage, setInvoicePage] = useState(1);
  useEffect(() => { setInvPage(1); setInvoicePage(1); }, [activeFilter, searchSJ]);
  const safeInvPage = clampPage(invPage, sortedSJ.length);
  const safeInvoicePage = clampPage(invoicePage, invoiceList.length);
  const pagedSJ = sortedSJ.slice((safeInvPage - 1) * PAGE_SIZE, safeInvPage * PAGE_SIZE);
  const pagedInvoices = invoiceList.slice((safeInvoicePage - 1) * PAGE_SIZE, safeInvoicePage * PAGE_SIZE);

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

      <StatSummary
        title="Invoice"
        stats={[
          { label: 'Total Invoice', value: invoiceList.length, color: '#007aff' },
          { label: 'Belum Invoice', value: sjBelumTerinvoice.length, color: '#ff9500' },
          { label: 'Sudah Invoice', value: sjTerinvoice.length, color: '#34c759' },
        ]}
      />

      {currentUser?.role === 'superadmin' && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 150, damping: 20 }}
          className="rounded-2xl backdrop-blur-xl bg-white/10 border border-white/20 shadow-2xl p-4 flex flex-wrap gap-3 items-center"
        >
          <span className="text-sm font-semibold text-white/80 mr-1">Export Laba Kotor:</span>
          <select
            value={labaKotorBulan}
            onChange={e => setLabaKotorBulan(Number(e.target.value))}
            className="rounded-xl bg-white/15 border border-white/20 text-white text-sm px-3 py-1.5 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-white/30"
          >
            {['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'].map((bln, i) => (
              <option key={i + 1} value={i + 1} className="text-slate-800">{bln}</option>
            ))}
          </select>
          <select
            value={labaKotorTahun}
            onChange={e => setLabaKotorTahun(Number(e.target.value))}
            className="rounded-xl bg-white/15 border border-white/20 text-white text-sm px-3 py-1.5 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-white/30"
          >
            {tahunOptions.map(y => (
              <option key={y} value={y} className="text-slate-800">{y}</option>
            ))}
          </select>
          <select
            value={labaKotorFilterField}
            onChange={e => setLabaKotorFilterField(e.target.value)}
            className="rounded-xl bg-white/15 border border-white/20 text-white text-sm px-3 py-1.5 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-white/30"
          >
            <option value="tglInvoice" className="text-slate-800">Filter: Tgl Invoice</option>
            <option value="tanggalSJ" className="text-slate-800">Filter: Tgl SJ</option>
          </select>
          <button
            onClick={handleExportLabaKotor}
            className="rounded-full bg-emerald-500/80 hover:bg-emerald-500 border border-emerald-300/40 text-white text-sm font-semibold px-5 py-1.5 shadow-lg transition-all flex items-center gap-2"
          >
            <FileText className="w-4 h-4" />
            Export Laba Kotor
          </button>
        </motion.div>
      )}

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
              <div className="mb-4">
                <SearchInput
                  value={searchSJ}
                  onChange={setSearchSJ}
                  placeholder="Cari nomor SJ, nomor polisi, rute, atau material..."
                />
              </div>
              {sortedSJ.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-500">Tidak ada Surat Jalan yang cocok dengan pencarian.</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <SortableHeader field="nomorSJ" label="Nomor SJ" sortConfig={sortConfig} onToggle={toggleSort} />
                          <SortableHeader field="tanggalSJ" label="Tgl SJ" sortConfig={sortConfig} onToggle={toggleSort} />
                          <SortableHeader field="tglTerkirim" label="Tgl Terkirim" sortConfig={sortConfig} onToggle={toggleSort} />
                          <SortableHeader field="nomorPolisi" label="Nomor Polisi" sortConfig={sortConfig} onToggle={toggleSort} />
                          <SortableHeader field="rute" label="Rute" sortConfig={sortConfig} onToggle={toggleSort} />
                          <SortableHeader field="material" label="Material" sortConfig={sortConfig} onToggle={toggleSort} />
                          <SortableHeader field="qtyBongkar" label="Qty Bongkar" sortConfig={sortConfig} onToggle={toggleSort} align="right" />
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {pagedSJ.map(sj => (
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
                  <Pagination total={sortedSJ.length} page={safeInvPage} onChange={setInvPage} />
                </>
              )}
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
            pagedInvoices.map(invoice => (
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
          <Pagination total={invoiceList.length} page={safeInvoicePage} onChange={setInvoicePage} />
        </div>
      )}
    </div>
  );
}
