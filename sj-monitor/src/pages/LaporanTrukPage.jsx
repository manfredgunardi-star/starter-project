import { useState, useMemo } from 'react';
import { AlertCircle, Truck, FileText, Printer } from 'lucide-react';
import {
  groupSJByTruck,
  getUniqueTrucks,
  getInactiveTrucks,
  formatReportDate,
} from '../utils/truckReportHelpers';

const LaporanTrukPage = ({ suratJalanList = [], truckList = [], currentUser = {} }) => {
  // ===== Validate Role =====
  const effectiveRole = (currentUser?.role === 'owner' ? 'reader' : currentUser?.role) || 'reader';
  const canViewReport = effectiveRole === 'superadmin' || effectiveRole === 'admin_sj';

  if (!canViewReport) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Akses Ditolak</h2>
          <p className="text-gray-600">
            Anda tidak memiliki izin untuk mengakses halaman laporan kendaraan. Hubungi administrator untuk meminta akses.
          </p>
        </div>
      </div>
    );
  }

  // ===== State Management =====
  const today = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(today);
  const [explanations, setExplanations] = useState({});
  const [showValidationError, setShowValidationError] = useState(false);

  // ===== Data Processing =====
  const allTrucks = useMemo(() => getUniqueTrucks(suratJalanList), [suratJalanList]);
  const activeTrucksByDate = useMemo(
    () => groupSJByTruck(suratJalanList, selectedDate),
    [suratJalanList, selectedDate]
  );
  const activeTrucks = useMemo(
    () => Object.values(activeTrucksByDate),
    [activeTrucksByDate]
  );
  const inactiveTrucks = useMemo(
    () => getInactiveTrucks(allTrucks, suratJalanList, selectedDate),
    [allTrucks, suratJalanList, selectedDate]
  );

  // ===== Validation & Print Logic =====
  const validateAndPrint = () => {
    const missingExplanations = [];

    // Check each inactive truck
    inactiveTrucks.forEach((truck) => {
      if (!hasExplanation(truck.nomorPolisi)) {
        missingExplanations.push(truck.nomorPolisi);
      }
    });

    if (missingExplanations.length > 0) {
      setShowValidationError(true);
      return;
    }

    // All valid, proceed to print
    setShowValidationError(false);
    window.print();
  };

  // ===== Handlers =====
  const handleExplanationChange = (nomorPolisi, value) => {
    setExplanations((prev) => ({
      ...prev,
      [nomorPolisi]: value,
    }));
  };

  // ===== Status Color Mapping =====
  // Status color mapping - must match SJ status values from firestore
  // Valid statuses: pending, dalam perjalanan, terkirim, gagal
  const getStatusBadgeColor = (status) => {
    const normalizedStatus = (status || '').toLowerCase();
    const colors = {
      'pending': 'bg-slate-100 text-slate-700',
      'dalam perjalanan': 'bg-orange-100 text-orange-700',
      'terkirim': 'bg-green-100 text-green-700',
      'gagal': 'bg-red-100 text-red-700',
    };
    return colors[normalizedStatus] || 'bg-slate-100 text-slate-700';
  };

  // Helper to check if explanation is provided and non-empty
  const hasExplanation = (nomorPolisi) => {
    const explanation = explanations[nomorPolisi] || '';
    return explanation.trim() !== '';
  };

  // ===== Render =====
  return (
    <div className="space-y-6 pb-8">
      <style>{`
        @media print {
          body {
            margin: 0;
            padding: 0;
            font-size: 12px;
          }
          .no-print {
            display: none !important;
          }
          table {
            border-collapse: collapse;
            width: 100%;
          }
          th, td {
            border: 1px solid #ddd;
            padding: 6px;
            text-align: left;
          }
          h1, h2 {
            page-break-after: avoid;
            margin: 10px 0;
          }
          tr {
            page-break-inside: avoid;
          }
          .card-section {
            page-break-inside: avoid;
            margin-bottom: 10px;
          }
        }
      `}</style>

      {/* Header Section */}
      <div className="bg-white rounded-xl shadow-sm p-3 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-3">
            <Truck className="w-8 h-8 text-blue-600 flex-shrink-0" />
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">
                Laporan Aktivitas Kendaraan
              </h1>
              <p className="text-gray-600 text-sm mt-1">
                Pantau aktivitas kendaraan harian, identifikasi truck yang tidak aktif, dan buat laporan resmi
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Date Picker Section */}
      <div className="bg-white rounded-xl shadow-sm p-3 sm:p-6">
        <div className="flex flex-col sm:items-center gap-3">
          <label className="block text-sm font-medium text-gray-700">
            Tanggal Laporan
          </label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => {
              setSelectedDate(e.target.value);
              setShowValidationError(false);
            }}
            className="w-full sm:max-w-xs px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-sm text-gray-600">
            Tanggal dipilih: <strong>{formatReportDate(selectedDate)}</strong>
          </p>
        </div>
      </div>

      {/* Active Trucks Section */}
      <div className="bg-white rounded-xl shadow-sm p-3 sm:p-6">
        <h2 className="text-lg sm:text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <FileText className="w-5 h-5 text-green-600" />
          Kendaraan Aktif ({activeTrucks.length})
        </h2>

        {activeTrucks.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm sm:text-base">
            Tidak ada kendaraan aktif pada tanggal {formatReportDate(selectedDate)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-3 py-3 sm:px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    No. Polisi
                  </th>
                  <th className="px-3 py-3 sm:px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider hidden sm:table-cell">
                    Nama Supir
                  </th>
                  <th className="px-3 py-3 sm:px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider hidden sm:table-cell">
                    Rute
                  </th>
                  <th className="px-3 py-3 sm:px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider hidden lg:table-cell">
                    Material
                  </th>
                  <th className="px-3 py-3 sm:px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-3 py-3 sm:px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider hidden sm:table-cell">
                    Qty
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {activeTrucks.map((truck) => {
                  const totalQty = truck.sjList.reduce((sum, sj) => {
                    const qty = Number(sj.qtyBongkar) || 0;
                    return sum + qty;
                  }, 0);

                  const statuses = [
                    ...truck.sjList.map((sj) => (sj.status || 'pending').toLowerCase()),
                  ];
                  const uniqueStatuses = [...new Set(statuses)];
                  const displayStatus =
                    uniqueStatuses.length === 1
                      ? uniqueStatuses[0]
                      : uniqueStatuses.join(', ');

                  return (
                    <tr key={truck.nomorPolisi} className="hover:bg-gray-50 transition-colors">
                      <td className="px-3 py-3 sm:px-4 text-xs sm:text-sm font-semibold text-gray-900">
                        {truck.nomorPolisi}
                      </td>
                      <td className="px-3 py-3 sm:px-4 text-xs sm:text-sm text-gray-700 hidden sm:table-cell">
                        {truck.namaSupir || '—'}
                      </td>
                      <td className="px-3 py-3 sm:px-4 text-xs sm:text-sm text-gray-700 hidden sm:table-cell">
                        {truck.sjList[0]?.rute || '—'}
                      </td>
                      <td className="px-3 py-3 sm:px-4 text-xs sm:text-sm text-gray-700 hidden lg:table-cell">
                        {truck.sjList[0]?.material || '—'}
                      </td>
                      <td className="px-3 py-3 sm:px-4">
                        <span
                          className={`inline-block rounded-md px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${getStatusBadgeColor(
                            displayStatus
                          )}`}
                        >
                          {displayStatus}
                        </span>
                      </td>
                      <td className="px-3 py-3 sm:px-4 text-xs sm:text-sm text-gray-700 hidden sm:table-cell">
                        {totalQty} {truck.sjList[0]?.satuan || ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Inactive Trucks Section */}
      <div className="bg-white rounded-xl shadow-sm p-3 sm:p-6">
        <h2 className="text-lg sm:text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-amber-600" />
          Kendaraan Tidak Aktif ({inactiveTrucks.length})
        </h2>

        {inactiveTrucks.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm sm:text-base">
            Semua kendaraan aktif pada tanggal {formatReportDate(selectedDate)}
          </div>
        ) : (
          <div>
            {/* Validation Error Message */}
            {showValidationError && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-800 font-semibold text-sm mb-2">
                  Harap isi penjelasan untuk kendaraan berikut sebelum mencetak:
                </p>
                <ul className="list-disc list-inside text-red-700 text-sm space-y-1">
                  {inactiveTrucks
                    .filter((truck) => !hasExplanation(truck.nomorPolisi))
                    .map((truck) => (
                      <li key={truck.nomorPolisi}>
                        {truck.nomorPolisi} - {truck.namaSupir || 'Supir'}
                      </li>
                    ))}
                </ul>
              </div>
            )}

            {/* Inactive Trucks Cards */}
            <div className="grid grid-cols-1 gap-4">
              {inactiveTrucks.map((truck) => (
                <div
                  key={truck.nomorPolisi}
                  className="card-section bg-amber-50 border-2 border-amber-200 rounded-lg p-4 sm:p-6"
                >
                  <div className="mb-4">
                    <h3 className="text-base sm:text-lg font-semibold text-gray-800">
                      {truck.nomorPolisi}
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">
                      Supir: {truck.namaSupir || '—'}
                    </p>
                  </div>

                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Penjelasan (Mengapa kendaraan tidak aktif?)
                  </label>
                  <textarea
                    value={explanations[truck.nomorPolisi] || ''}
                    onChange={(e) =>
                      handleExplanationChange(truck.nomorPolisi, e.target.value)
                    }
                    placeholder="Contoh: Service berkala, cuaca buruk, driver izin, dll."
                    rows="3"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-sm"
                  />
                  {showValidationError && !hasExplanation(truck.nomorPolisi) && (
                    <p className="text-red-600 text-xs mt-2">
                      Penjelasan harus diisi
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="bg-white rounded-xl shadow-sm p-3 sm:p-6 no-print">
        <button
          onClick={validateAndPrint}
          className="w-full sm:w-auto flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 sm:px-6 py-3 rounded-lg transition-colors"
        >
          <Printer className="w-5 h-5" />
          Print / PDF
        </button>
      </div>
    </div>
  );
};

export default LaporanTrukPage;
