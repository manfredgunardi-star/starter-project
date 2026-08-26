import { useState, useEffect, useMemo } from 'react';
import { Send, Lock, Plus, Clock, CheckCircle, FileText, Package, XCircle } from 'lucide-react';
import { hitungTotalInvoice, resolveSJInvoice } from '../utils/invoiceTotals.js';
import SearchInput from './SearchInput.jsx';
import { useSearchFilter } from '../hooks/useSearchFilter.js';
import { filterInvoicesBySearch } from '../utils/invoiceSearch.js';

// Konstanta level-modul: referensi array stabil antar-render.
const SJ_INVOICE_SEARCH_FIELDS = ['nomorSJ', 'nomorPolisi', 'rute', 'material'];

const InvoiceManagement = ({
  invoiceList,
  suratJalanList,
  currentUser,
  onAddInvoice,
  onDeleteInvoice,
  onKirimInvoiceKeAccounting,
  onBulkKirimInvoiceKeAccounting,
  formatCurrency
}) => {
  const [activeFilter, setActiveFilter] = useState('belum-terinvoice');
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState(new Set());
  const [search, setSearch] = useState('');
  const effectiveRole = (currentUser?.role === 'owner' ? 'reader' : currentUser?.role) || 'reader';

  // Reset seleksi dan kata kunci saat pindah tab — kedua tab mencari entitas
  // yang berbeda (Surat Jalan vs Invoice), jadi kata kunci tidak dibawa-bawa.
  useEffect(() => {
    setSelectedInvoiceIds(new Set());
    setSearch('');
  }, [activeFilter]);

  /**
   * Perubahan kata kunci mengosongkan seleksi invoice. Tanpa ini, user bisa
   * memilih invoice di bawah satu kata kunci, menghapus kata kuncinya, lalu
   * mengirim invoice yang tidak lagi terlihat ke Accounting.
   */
  const handleSearchChange = (value) => {
    setSearch(value);
    setSelectedInvoiceIds(new Set());
  };

  // statusInvoice:
  // - undefined / null / ''  -> dianggap BELUM (backward compatible data lama)
  // - 'belum'                -> BELUM
  // - 'terinvoice'           -> SUDAH
  const sjBelumTerinvoice = suratJalanList.filter(sj =>
    (sj.status === 'terkirim' || sj.status === 'terkunci') &&
    sj.isActive !== false &&
    (sj.statusInvoice == null || sj.statusInvoice === '' || sj.statusInvoice === 'belum')
  );

  const sjTerinvoice = suratJalanList.filter(sj =>
    (sj.status === 'terkirim' || sj.status === 'terkunci') &&
    sj.statusInvoice === 'terinvoice'
  );

  const baseSJ = activeFilter === 'belum-terinvoice' ? sjBelumTerinvoice : sjTerinvoice;
  const filteredSJ = useSearchFilter(baseSJ, search, SJ_INVOICE_SEARCH_FIELDS);

  // Pencarian invoice bersifat "dalam": cocok pada noInvoice ATAU pada salah
  // satu Surat Jalan di dalamnya.
  const searchedInvoices = useMemo(
    () => filterInvoicesBySearch(invoiceList, search),
    [invoiceList, search]
  );

  const canManageInvoice = () => {
    return effectiveRole === 'superadmin' || effectiveRole === 'admin_invoice';
  };

  // Invoice bisa dikirim ke accounting jika:
  // 1. Superadmin
  // 2. Belum pernah dikirim (integrationStatus kosong)
  // 3. Semua SJ dalam invoice sudah berstatus 'terkunci' (sudah dijurnal di accounting)
  const canKirimInvoice = (invoice) => {
    if (effectiveRole !== 'superadmin') return false;
    if (invoice.integrationStatus === 'menunggu_review' || invoice.integrationStatus === 'terkunci') return false;
    const includedSJs = (invoice.suratJalanIds || [])
      .map(id => suratJalanList.find(s => s.id === id))
      .filter(Boolean);
    return includedSJs.length > 0 && includedSJs.every(sj => sj.status === 'terkunci');
  };

  const eligibleInvoicesInView = activeFilter === 'terinvoice' ? searchedInvoices.filter(canKirimInvoice) : [];
  const selectedInView = eligibleInvoicesInView.filter(inv => selectedInvoiceIds.has(inv.id));
  const allInViewSelected = eligibleInvoicesInView.length > 0 && selectedInView.length === eligibleInvoicesInView.length;

  const toggleSelectInvoice = (id) => {
    setSelectedInvoiceIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAllInvoices = () => {
    setSelectedInvoiceIds(prev => {
      const next = new Set(prev);
      if (allInViewSelected) {
        eligibleInvoicesInView.forEach(inv => next.delete(inv.id));
      } else {
        eligibleInvoicesInView.forEach(inv => next.add(inv.id));
      }
      return next;
    });
  };

  const getInvoiceIntegrationBadge = (invoice) => {
    if (invoice.integrationStatus === 'menunggu_review') {
      return (
        <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold flex items-center gap-1">
          <Send className="w-3 h-3" /> Menunggu Review Akuntan
        </span>
      );
    }
    if (invoice.integrationStatus === 'terkunci') {
      return (
        <span className="px-2 py-1 bg-gray-200 text-gray-600 rounded-full text-xs font-semibold flex items-center gap-1">
          <Lock className="w-3 h-3" /> Sudah Masuk Accounting
        </span>
      );
    }
    return null;
  };
  
  // Export to Excel function
  const exportInvoiceToExcel = (invoice) => {
    const headers = ['No SJ', 'Tgl SJ', 'No. Polisi', 'Nama Supir', 'Rute', 'Material', 'Qty Bongkar', 'Satuan', 'Harga/Satuan', 'Nilai', 'Uang Jalan'];
    const hargaSatuan = Number(invoice.hargaSatuan) || 0;
    const { list } = resolveSJInvoice(invoice, suratJalanList);
    const rows = list.map(({ sj }) => [
      sj.nomorSJ,
      new Date(sj.tanggalSJ).toLocaleDateString('id-ID'),
      sj.nomorPolisi,
      sj.namaSupir,
      sj.rute,
      sj.material,
      sj.qtyBongkar,
      sj.satuan,
      hargaSatuan,
      (Number(sj.qtyBongkar) || 0) * hargaSatuan,
      Number(sj.uangJalan) || 0
    ]);

    let csvContent = headers.join(';') + '\n';
    rows.forEach(row => {
      csvContent += row.join(';') + '\n';
    });
    const t = hitungTotalInvoice(invoice, suratJalanList);
    // 11 kolom: Qty Bongkar di kolom 7, Nilai di kolom 10.
    // Baris TOTAL yang lama meleset satu kolom; penomoran di bawah sudah dikoreksi.
    csvContent += `\nSUB TOTAL;;;;;;${invoice.totalQty.toFixed(2)};;;${t.subTotal}\n`;
    csvContent += `POTONGAN UANG JALAN;;;;;;;;;${t.potonganUJ}\n`;
    csvContent += `TOTAL AKHIR;;;;;;;;;${t.totalAkhir}`;
    
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
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">📄 Invoice Management</h2>
            <p className="text-gray-600 mt-1">Kelola Invoice untuk Surat Jalan Terkirim</p>
          </div>
          {canManageInvoice() && sjBelumTerinvoice.length > 0 && (
            <button
              onClick={onAddInvoice}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition"
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
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg shadow-md p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-100 text-sm mb-1">Total Invoice</p>
              <p className="text-3xl font-bold">{invoiceList.length}</p>
            </div>
            <FileText className="w-12 h-12 text-green-200" />
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
          {baseSJ.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle className="w-16 h-16 mx-auto text-green-400 mb-4" />
              <p className="text-lg font-semibold text-gray-600 mb-2">Semua Surat Jalan Sudah Terinvoice! 🎉</p>
              <p className="text-sm text-gray-500">Tidak ada Surat Jalan yang perlu di-invoice</p>
            </div>
          ) : (
            <>
              <div className="mb-4 bg-green-50 border-l-4 border-green-500 p-4 rounded">
                <p className="text-sm text-green-800">
                  <strong>📋 Info:</strong> Pilih surat jalan di bawah untuk membuat invoice. Klik tombol "Buat Invoice Baru" di atas untuk memulai.
                </p>
              </div>
              <div className="mb-4">
                <SearchInput
                  value={search}
                  onChange={handleSearchChange}
                  placeholder="Cari nomor SJ, nomor polisi, rute, atau material..."
                />
              </div>
              {filteredSJ.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-500">Tidak ada Surat Jalan yang cocok dengan pencarian.</p>
                </div>
              ) : (
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
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">{sj.nomorSJ}</td>
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
              )}
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Bulk Kirim Bar — hanya superadmin, hanya jika ada invoice eligible */}
          {effectiveRole === 'superadmin' && eligibleInvoicesInView.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer select-none text-sm font-medium text-blue-800">
                <input
                  type="checkbox"
                  checked={allInViewSelected}
                  onChange={toggleSelectAllInvoices}
                  className="w-4 h-4 accent-blue-600"
                />
                {allInViewSelected ? 'Batalkan Semua' : `Pilih Semua (${eligibleInvoicesInView.length} invoice eligible)`}
              </label>
              {selectedInView.length > 0 && (
                <>
                  <span className="text-blue-600 text-sm">{selectedInView.length} dipilih</span>
                  <button
                    onClick={() => onBulkKirimInvoiceKeAccounting(selectedInView, () => setSelectedInvoiceIds(new Set()))}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg text-sm flex items-center gap-2 transition"
                  >
                    <Send className="w-4 h-4" />
                    Kirim {selectedInView.length} Invoice ke Accounting
                  </button>
                  <button
                    onClick={() => setSelectedInvoiceIds(new Set())}
                    className="text-blue-600 hover:text-blue-800 text-sm underline"
                  >
                    Batalkan Pilihan
                  </button>
                </>
              )}
            </div>
          )}

          {invoiceList.length > 0 && (
            <div className="mb-4">
              <SearchInput
                value={search}
                onChange={handleSearchChange}
                placeholder="Cari nomor invoice atau nomor SJ di dalamnya..."
              />
              {search && (
                <p className="mt-2 text-sm text-gray-600">
                  {searchedInvoices.length} dari {invoiceList.length} invoice cocok
                </p>
              )}
            </div>
          )}

          {invoiceList.length > 0 && searchedInvoices.length === 0 ? (
            <div className="bg-white rounded-lg shadow-md p-12 text-center">
              <FileText className="w-16 h-16 mx-auto text-gray-300 mb-4" />
              <p className="text-lg font-semibold text-gray-600 mb-2">Tidak ada invoice yang cocok dengan pencarian.</p>
            </div>
          ) : invoiceList.length === 0 ? (
            <div className="bg-white rounded-lg shadow-md p-12 text-center">
              <FileText className="w-16 h-16 mx-auto text-gray-300 mb-4" />
              <p className="text-lg font-semibold text-gray-600 mb-2">Belum Ada Invoice</p>
              <p className="text-sm text-gray-500 mb-4">Buat invoice pertama untuk Surat Jalan yang sudah terkirim</p>
              {canManageInvoice() && sjBelumTerinvoice.length > 0 && (
                <button
                  onClick={onAddInvoice}
                  className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg inline-flex items-center space-x-2 transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>Buat Invoice Pertama</span>
                </button>
              )}
            </div>
          ) : (
            searchedInvoices.map(invoice => {
              const isEligibleForBulk = canKirimInvoice(invoice);
              const isSelected = selectedInvoiceIds.has(invoice.id);
              return (
              <div key={invoice.id} className={`bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition${isSelected ? ' ring-2 ring-blue-500' : ''}`}>
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start gap-3">
                    {isEligibleForBulk && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectInvoice(invoice.id)}
                        className="mt-1.5 w-4 h-4 accent-blue-600 cursor-pointer shrink-0"
                      />
                    )}
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
                      {(invoice.hargaSatuan != null || (invoice.hargaPerGroup && invoice.hargaPerGroup.length > 0)) && (
                        <>
                          <div>
                            <p className="text-gray-600">Harga Jual per Satuan:</p>
                            {invoice.hargaPerGroup && invoice.hargaPerGroup.length > 1 ? (
                              <div className="space-y-1 mt-1">
                                {invoice.hargaPerGroup.map((g, i) => (
                                  <p key={i} className="text-xs font-semibold text-gray-700">
                                    {g.material} ({g.rute}): Rp {Number(g.hargaSatuan).toLocaleString('id-ID')}
                                  </p>
                                ))}
                              </div>
                            ) : (
                              <p className="font-semibold text-gray-800">
                                Rp {Number(invoice.hargaSatuan ?? invoice.hargaPerGroup?.[0]?.hargaSatuan ?? 0).toLocaleString('id-ID')} / {invoice.suratJalanList?.[0]?.satuan || 'satuan'}
                              </p>
                            )}
                          </div>
                          <div>
                            {(() => {
                              const t = hitungTotalInvoice(invoice, suratJalanList);
                              return (
                                <>
                                  <div className="flex justify-between text-gray-600">
                                    <span>Sub Total:</span>
                                    <span className="font-semibold text-gray-800">
                                      Rp {t.subTotal.toLocaleString('id-ID')}
                                    </span>
                                  </div>
                                  <div className="flex justify-between text-gray-600">
                                    <span>Potongan Uang Jalan:</span>
                                    <span className="font-semibold text-orange-700">
                                      − Rp {t.potonganUJ.toLocaleString('id-ID')}
                                    </span>
                                  </div>
                                  <div className="flex justify-between border-t border-gray-200 mt-1 pt-1">
                                    <span className="text-gray-700 font-semibold">Total Akhir:</span>
                                    <span className="font-bold text-blue-700">
                                      Rp {t.totalAkhir.toLocaleString('id-ID')}
                                    </span>
                                  </div>
                                  {(t.sumberUJ !== 'live' || t.sjHilang > 0) && (
                                    <p className="text-xs text-amber-700 mt-1">
                                      ⚠️ Sebagian uang jalan diambil dari data arsip
                                      {t.sjHilang > 0 ? ` — ${t.sjHilang} Surat Jalan tidak ditemukan` : ''}.
                                    </p>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        </>
                      )}
                    </div>
                    </div>{/* end original inner */}
                  </div>{/* end flex items-start gap-3 */}
                  <div className="flex flex-col gap-2">
                    {getInvoiceIntegrationBadge(invoice)}
                    <button
                      onClick={() => exportInvoiceToExcel(invoice)}
                      className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1"
                    >
                      <FileText className="w-4 h-4" />
                      <span>Export Excel</span>
                    </button>
                    {canKirimInvoice(invoice) && (
                      <button
                        onClick={() => onKirimInvoiceKeAccounting(invoice)}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1"
                      >
                        <Send className="w-4 h-4" />
                        <span>Kirim ke Accounting</span>
                      </button>
                    )}
                    {canManageInvoice() && invoice.integrationStatus !== 'terkunci' && (
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
                            <td className="px-4 py-2 text-sm font-medium text-green-600">{sj.nomorSJ}</td>
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
            );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default InvoiceManagement;
