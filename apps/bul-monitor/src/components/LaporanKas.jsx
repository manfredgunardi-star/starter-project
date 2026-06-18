import { useState } from 'react';
import { formatTanggalID } from '../utils/formatters.js';

const LaporanKas = ({ suratJalanList, transaksiList, formatCurrency }) => {
  const [filterDari, setFilterDari] = useState('');
  const [filterSampai, setFilterSampai] = useState('');
  const [filterPT, setFilterPT] = useState('');
  const [showExportMenu, setShowExportMenu] = useState(false);

  // ===== Helpers =====
  const isActiveDoc = (d) => d?.isActive !== false && !d?.deletedAt;
	// Safe sum helper for nominal-like fields (prevents ReferenceError in Laporan Kas)
	const sumNominal = (items) => {
		if (!Array.isArray(items)) return 0;
		return items.reduce((acc, it) => {
			// support: {nominal}, {jumlah}, number-like, string-like
			const vRaw = (it && typeof it === "object")
				? (it.nominal ?? it.jumlah ?? it.amount ?? 0)
				: it;
			const v = Number(vRaw);
			return acc + (Number.isFinite(v) ? v : 0);
		}, 0);
	};

  const inDateRange = (isoDateStr) => {
    if (!filterDari && !filterSampai) return true;
    if (!isoDateStr) return false;
    const dt = new Date(String(isoDateStr).length === 10 ? `${isoDateStr}T00:00:00` : isoDateStr);
    const dari = filterDari ? new Date(filterDari) : null;
    const sampai = filterSampai ? new Date(filterSampai) : null;
    if (dari && dt < dari) return false;
    if (sampai) {
      // inclusive end date
      const end = new Date(sampai);
      end.setHours(23, 59, 59, 999);
      if (dt > end) return false;
    }
    return true;
  };

  // ===== Data sources =====
  const cleanSJ = (Array.isArray(suratJalanList) ? suratJalanList : [])
    .filter(isActiveDoc)
    .filter(sj => (sj?.status || "").toLowerCase() !== "gagal");

  const cleanTransaksi = (Array.isArray(transaksiList) ? transaksiList : [])
    .filter(isActiveDoc);

  // Unique PT list (union of both sources)
  const ptList = [...new Set([
    ...cleanSJ.map(sj => sj?.pt).filter(Boolean),
    ...cleanTransaksi.map(t => t?.pt).filter(Boolean),
  ])].sort();

  // Filtered SJ (Kas Keluar: uang jalan)
  const filteredSJ = cleanSJ.filter(sj => {
    if (filterPT && sj?.pt !== filterPT) return false;
    return inDateRange(sj?.tanggalSJ);
  });

  // Filter transaksi (basis laporan kas)
  const filteredTransaksi = cleanTransaksi.filter(t => {
    if (filterPT && t?.pt !== filterPT) return false;
    return inDateRange(t?.tanggal);
  });

  // Filtered transaksi pemasukan (Kas Masuk)
  const filteredPemasukan = filteredTransaksi.filter(t => {
    const tipe = String(t?.tipe || t?.type || '').toLowerCase();
    return tipe === 'pemasukan';
  });

  // Transaksi pengeluaran manual (bul_transaksi) yang tidak terkait Surat Jalan
  const filteredPengeluaranManual = filteredTransaksi.filter(t => {
    const tipe = String(t?.tipe || t?.type || '').toLowerCase();
    if (tipe !== 'pengeluaran') return false;
    // hanya yang murni transaksi manual, bukan uang jalan auto
    return !t?.suratJalanId;
  });

  const totalKasKeluarUangJalan = sumNominal(filteredSJ.map((sj) => ({ nominal: sj?.uangJalan })));
  const totalKasKeluarManual = sumNominal(filteredPengeluaranManual);
  const totalKasKeluar = totalKasKeluarUangJalan + totalKasKeluarManual;
  const totalKasMasuk = sumNominal(filteredPemasukan);
  const saldoKas = totalKasMasuk - totalKasKeluar;

  const jumlahSJ = filteredSJ.length;
  const rataRataPerSJ = jumlahSJ > 0 ? (totalKasKeluar / jumlahSJ) : 0;

  // Rekap per PT (keluar / masuk / saldo)
  const rekapPerPT = ptList.map(pt => {
    const sjPT = filteredSJ.filter(sj => sj?.pt === pt);
    const masukPT = filteredPemasukan.filter(t => t?.pt === pt);

    const keluarUangJalan = sumNominal(sjPT.map(sj => ({ nominal: sj?.uangJalan })));
    const keluarManualPT = sumNominal(filteredPengeluaranManual.filter(t => t?.pt === pt));
    const kasKeluar = keluarUangJalan + keluarManualPT;

    const kasMasuk = sumNominal(masukPT);
    const saldo = kasMasuk - kasKeluar;

    return {
      pt,
      jumlahSJ: sjPT.length,
      kasMasuk,
      kasKeluar,
      saldo,
    };
  }).filter(r => {
    // If a PT filter is selected, only keep that PT
    if (!filterPT) return true;
    return r.pt === filterPT;
  });

  // ===== Export / Print =====
  const exportToPrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write('<html><head><title>Laporan Kas</title>');
    printWindow.document.write('<style>');
    printWindow.document.write('body { font-family: Arial, sans-serif; padding: 20px; }');
    printWindow.document.write('h1, h2 { margin: 0 0 10px 0; }');
    printWindow.document.write('.meta { margin: 0 0 10px 0; color: #444; }');
    printWindow.document.write('table { width: 100%; border-collapse: collapse; margin-top: 10px; }');
    printWindow.document.write('th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }');
    printWindow.document.write('th { background-color: #f5f5f5; }');
    printWindow.document.write('.total { font-weight: bold; background-color: #f0f0f0; }');
    printWindow.document.write('</style></head><body>');

    printWindow.document.write('<h1>Laporan Kas</h1>');

    // Meta
    const periode = (filterDari || filterSampai)
      ? `${filterDari ? new Date(filterDari).toLocaleDateString('id-ID') : '...'} - ${filterSampai ? new Date(filterSampai).toLocaleDateString('id-ID') : '...'}`
      : 'Semua Periode';
    const ptText = filterPT ? filterPT : 'Semua PT';
    printWindow.document.write(`<p class="meta">PT: ${ptText} | Periode: ${periode}</p>`);

    // Summary
    printWindow.document.write('<h2>Ringkasan</h2>');
    printWindow.document.write('<table>');
    printWindow.document.write('<thead><tr><th>Kas Masuk</th><th>Kas Keluar (Uang Jalan)</th><th>Saldo</th><th>Jumlah SJ</th></tr></thead>');
    printWindow.document.write('<tbody>');
    printWindow.document.write(`<tr class="total"><td>${formatCurrency(totalKasMasuk)}</td><td>${formatCurrency(totalKasKeluar)}</td><td>${formatCurrency(saldoKas)}</td><td>${jumlahSJ}</td></tr>`);
    printWindow.document.write('</tbody></table>');

    // Rekap per PT
    printWindow.document.write('<h2>Rekap per PT</h2>');
    printWindow.document.write('<table>');
    printWindow.document.write('<thead><tr><th>PT</th><th>Kas Masuk</th><th>Kas Keluar</th><th>Saldo</th><th>Jumlah SJ</th></tr></thead>');
    printWindow.document.write('<tbody>');
    rekapPerPT.forEach(r => {
      printWindow.document.write(`<tr><td>${r.pt}</td><td>${formatCurrency(r.kasMasuk)}</td><td>${formatCurrency(r.kasKeluar)}</td><td>${formatCurrency(r.saldo)}</td><td>${r.jumlahSJ}</td></tr>`);
    });
    printWindow.document.write('</tbody></table>');

    // Detail pemasukan
    printWindow.document.write('<h2>Detail Kas Masuk (Transaksi Pemasukan)</h2>');
    printWindow.document.write('<table>');
    printWindow.document.write('<thead><tr><th>No</th><th>Tanggal</th><th>PT</th><th>Keterangan</th><th>Nominal</th></tr></thead>');
    printWindow.document.write('<tbody>');
    filteredPemasukan
      .slice()
      .sort((a,b)=> new Date(a?.tanggal) - new Date(b?.tanggal))
      .forEach((t, i) => {
        printWindow.document.write(
          `<tr>
            <td>${i + 1}</td>
            <td>${t?.tanggal ? new Date(t.tanggal).toLocaleDateString('id-ID') : '-'}</td>
            <td>${t?.pt || '-'}</td>
            <td>${(t?.keterangan || '').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</td>
            <td>${formatCurrency(Number(t?.nominal || 0))}</td>
          </tr>`
        );
      });
    printWindow.document.write('</tbody></table>');

    // Detail kas keluar (Transaksi pengeluaran manual)
    printWindow.document.write('<h2>Detail Kas Keluar (Transaksi Pengeluaran)</h2>');
    if (filteredPengeluaranManual.length === 0) {
      printWindow.document.write('<p>Tidak ada transaksi pengeluaran pada filter yang dipilih</p>');
    } else {
      printWindow.document.write('<table><thead><tr><th>Tanggal</th><th>PT</th><th>Keterangan</th><th>Nominal</th></tr></thead><tbody>');
      filteredPengeluaranManual
        .slice()
        .sort((a, b) => String(b?.tanggal || '').localeCompare(String(a?.tanggal || '')))
        .forEach((t) => {
          printWindow.document.write(`<tr><td>${t?.tanggal || ''}</td><td>${t?.pt || ''}</td><td>${(t?.keterangan || '').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</td><td>${formatCurrency(t?.nominal || 0)}</td></tr>`);
        });
      printWindow.document.write('</tbody></table>');
    }

    // Detail kas keluar (SJ)
    printWindow.document.write('<h2>Detail Kas Keluar (Uang Jalan dari Surat Jalan)</h2>');
    printWindow.document.write('<table>');
    printWindow.document.write('<thead><tr><th>No</th><th>Tanggal SJ</th><th>Nomor SJ</th><th>PT</th><th>Rute</th><th>Supir</th><th>Nomor Polisi</th><th>Uang Jalan</th></tr></thead>');
    printWindow.document.write('<tbody>');
    filteredSJ
      .slice()
      .sort((a,b)=> new Date(a?.tanggalSJ) - new Date(b?.tanggalSJ))
      .forEach((sj, i) => {
        printWindow.document.write(
          `<tr>
            <td>${i + 1}</td>
            <td>${sj?.tanggalSJ ? new Date(sj.tanggalSJ).toLocaleDateString('id-ID') : '-'}</td>
            <td>${sj?.nomorSJ || '-'}</td>
            <td>${sj?.pt || '-'}</td>
            <td>${sj?.rute || '-'}</td>
            <td>${sj?.supir || '-'}</td>
            <td>${sj?.nomorPolisi || '-'}</td>
            <td>${formatCurrency(Number(sj?.uangJalan || 0))}</td>
          </tr>`
        );
      });
    printWindow.document.write('</tbody></table>');

    printWindow.document.write('</body></html>');
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">📊 Laporan Kas</h2>
            <p className="text-gray-600 mt-1">Rekap Kas Masuk/Keluar berbasis Transaksi & Surat Jalan</p>
          </div>
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors"
            >
              <span>📄</span>
              <span>Export / Print</span>
            </button>
            {showExportMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border z-50">
                <button
                  onClick={() => {
                    exportToPrint();
                    setShowExportMenu(false);
                  }}
                  className="w-full px-4 py-2 text-left hover:bg-gray-50 transition-colors"
                >
                  🖨️ Print Report
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Dari Tanggal</label>
              <input
                type="date"
                value={filterDari}
                onChange={(e) => setFilterDari(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sampai Tanggal</label>
              <input
                type="date"
                value={filterSampai}
                onChange={(e) => setFilterSampai(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Filter PT</label>
              <select
                value={filterPT}
                onChange={(e) => setFilterPT(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">Semua PT</option>
                {ptList.map(pt => (
                  <option key={pt} value={pt}>{pt}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => { setFilterDari(''); setFilterSampai(''); setFilterPT(''); }}
                className="w-full bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md transition-colors"
              >
                Reset Filter
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Rekap per PT */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
          <span className="mr-2">💼</span>
          Rekap per PT
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {rekapPerPT.map(item => (
            <div key={item.pt} className="border-l-4 border-green-500 bg-gray-50 rounded-lg p-4">
              <h4 className="font-bold text-gray-800 mb-2">{item.pt}</h4>
              <div className="text-sm text-gray-600 space-y-1">
                <div className="flex justify-between"><span>Kas Masuk:</span><span className="text-green-600 font-semibold">{formatCurrency(item.kasMasuk)}</span></div>
                <div className="flex justify-between"><span>Kas Keluar:</span><span className="text-red-600 font-semibold">{formatCurrency(item.kasKeluar)}</span></div>
                <div className="flex justify-between"><span>Saldo:</span><span className="text-green-700 font-semibold">{formatCurrency(item.saldo)}</span></div>
                <div className="flex justify-between"><span>Jumlah SJ:</span><span className="font-semibold">{item.jumlahSJ}</span></div>
              </div>
            </div>
          ))}
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-green-600 text-white rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-100 text-sm">Total Kas Masuk</p>
                <p className="text-2xl font-bold">{formatCurrency(totalKasMasuk)}</p>
              </div>
              <div className="text-4xl opacity-75">⬆️</div>
            </div>
          </div>

          <div className="bg-red-600 text-white rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-red-100 text-sm">Total Kas Keluar</p>
                <p className="text-2xl font-bold">{formatCurrency(totalKasKeluar)}</p>
              </div>
              <div className="text-4xl opacity-75">⬇️</div>
            </div>
          </div>

          <div className="bg-green-600 text-white rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-100 text-sm">Saldo Kas</p>
                <p className="text-2xl font-bold">{formatCurrency(saldoKas)}</p>
              </div>
              <div className="text-4xl opacity-75">$</div>
            </div>
          </div>

          <div className="bg-gray-800 text-white rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-200 text-sm">Jumlah Surat Jalan</p>
                <p className="text-2xl font-bold">{jumlahSJ}</p>
                <p className="text-xs text-gray-300 mt-1">Rata-rata / SJ: {formatCurrency(rataRataPerSJ)}</p>
              </div>
              <div className="text-4xl opacity-75">📦</div>
            </div>
          </div>
        </div>
      </div>

      {/* Detail tables */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">📥 Detail Kas Masuk (Transaksi)</h3>

        {filteredPemasukan.length === 0 ? (
          <div className="text-center py-10 text-gray-500">Belum ada transaksi pemasukan pada filter yang dipilih</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tanggal</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">PT</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Keterangan</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Nominal</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredPemasukan
                  .slice()
                  .sort((a,b)=> new Date(a?.tanggal) - new Date(b?.tanggal))
                  .map((t) => (
                    <tr key={t.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">{t?.tanggal ? new Date(t.tanggal).toLocaleDateString('id-ID') : '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{t?.pt || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{t?.keterangan || '-'}</td>
                      <td className="px-4 py-3 text-sm text-right text-green-700 font-semibold">{formatCurrency(Number(t?.nominal || 0))}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">📤 Detail Kas Keluar (Transaksi Pengeluaran)</h3>
        {filteredPengeluaranManual.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            Belum ada transaksi pengeluaran pada filter yang dipilih
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">TANGGAL</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">PT</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">KETERANGAN</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">NOMINAL</th>
                </tr>
              </thead>
              <tbody>
                {filteredPengeluaranManual
                  .slice()
                  .sort((a, b) => String(b?.tanggal || "").localeCompare(String(a?.tanggal || "")))
                  .map((t) => (
                    <tr key={t.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-2 text-sm text-gray-700">{formatTanggalID(t.tanggal)}</td>
                      <td className="px-4 py-2 text-sm text-gray-700">{t.pt}</td>
                      <td className="px-4 py-2 text-sm text-gray-700">{t.keterangan}</td>
                      <td className="px-4 py-2 text-sm text-right text-red-600 font-semibold">{formatCurrency(t.nominal)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">📤 Detail Kas Keluar (Uang Jalan dari Surat Jalan)</h3>

        {filteredSJ.length === 0 ? (
          <div className="text-center py-10 text-gray-500">Belum ada Surat Jalan pada filter yang dipilih</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nomor SJ</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tgl SJ</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">PT</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rute</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Supir</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nomor Polisi</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Uang Jalan</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredSJ
                  .slice()
                  .sort((a,b)=> new Date(a?.tanggalSJ) - new Date(b?.tanggalSJ))
                  .map((sj) => (
                    <tr key={sj.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">{sj?.nomorSJ || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{sj?.tanggalSJ ? new Date(sj.tanggalSJ).toLocaleDateString('id-ID') : '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{sj?.pt || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{sj?.rute || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{sj?.supir || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{sj?.nomorPolisi || '-'}</td>
                      <td className="px-4 py-3 text-sm text-right text-red-700 font-semibold">{formatCurrency(Number(sj?.uangJalan || 0))}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default LaporanKas;
