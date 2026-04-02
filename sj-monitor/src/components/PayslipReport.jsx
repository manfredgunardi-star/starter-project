import React, { useState, useEffect } from "react";
import { getPayslipData } from "../services/payslipService";
import { formatCurrency, formatDate, getPayslipPeriod } from "../utils/payslipHelpers";
import PayslipTable from "./PayslipTable";
import PayslipExport from "./PayslipExport";

export default function PayslipReport({ currentUser }) {
  const [payslips, setPayslips] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [periodLabel, setPeriodLabel] = useState("");

  // Check user role - only Superadmin, Reader, Admin Keuangan can view
  const canView = ["superadmin", "reader", "admin_keuangan"].includes(
    currentUser?.role?.toLowerCase()
  );
  const canEditBonus = ["superadmin", "admin_keuangan"].includes(
    currentUser?.role?.toLowerCase()
  );

  useEffect(() => {
    if (!canView) {
      setError("Anda tidak memiliki akses ke laporan gaji ini");
      setLoading(false);
      return;
    }

    loadPayslipData();
  }, []);

  const loadPayslipData = async () => {
    try {
      setLoading(true);
      const data = await getPayslipData();
      setPayslips(data);

      // Get period label from first entry
      const firstEntry = Object.values(data)[0];
      if (firstEntry) {
        setPeriodLabel(firstEntry.periodLabel);
      }
    } catch (err) {
      setError("Gagal memuat data gaji: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!canView) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded">
        <p className="text-red-700">Anda tidak memiliki akses ke laporan gaji</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center p-8">
        <p>Memuat data gaji...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded">
        <p className="text-red-700">{error}</p>
        <button
          onClick={loadPayslipData}
          className="mt-2 px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Coba Lagi
        </button>
      </div>
    );
  }

  const drivers = Object.values(payslips).map((p) => p.driver);
  const driverOptions = drivers.map((d) => ({
    id: d.id,
    nama: d.nama || d.email,
  }));

  const selectedPayslip = selectedDriver
    ? payslips[selectedDriver]
    : Object.values(payslips)[0];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white p-3 sm:p-4 rounded border">
        <h1 className="text-lg sm:text-xl md:text-2xl font-bold mb-2">Laporan Gaji Supir</h1>
        <p className="text-sm sm:text-base text-gray-600">Periode: {periodLabel}</p>
      </div>

      {/* Driver Selector */}
      <div className="bg-white p-3 sm:p-4 rounded border">
        <label className="block text-sm sm:text-base font-medium mb-2">Pilih Supir:</label>
        <select
          value={selectedDriver || (driverOptions[0]?.id || "")}
          onChange={(e) => setSelectedDriver(e.target.value)}
          className="w-full text-sm sm:text-base border border-gray-300 rounded px-3 py-2 min-h-[44px]"
        >
          {driverOptions.map((driver) => (
            <option key={driver.id} value={driver.id}>
              {driver.nama}
            </option>
          ))}
        </select>
      </div>

      {/* Payslip Details */}
      {selectedPayslip && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-blue-50 p-3 sm:p-4 rounded border border-blue-200">
              <p className="text-xs sm:text-sm text-gray-600">Pengiriman Sukses</p>
              <p className="text-xl sm:text-2xl font-bold text-blue-600">
                {selectedPayslip.summary.successfulDeliveries}
              </p>
            </div>
            <div className="bg-green-50 p-3 sm:p-4 rounded border border-green-200">
              <p className="text-xs sm:text-sm text-gray-600">Uang Jalan</p>
              <p className="text-lg sm:text-lg font-bold text-green-600">
                {formatCurrency(selectedPayslip.summary.totalUangJalan)}
              </p>
            </div>
            <div className="bg-purple-50 p-3 sm:p-4 rounded border border-purple-200">
              <p className="text-xs sm:text-sm text-gray-600">Ritasi</p>
              <p className="text-lg sm:text-lg font-bold text-purple-600">
                {formatCurrency(selectedPayslip.summary.totalRitasi)}
              </p>
            </div>
            <div className="bg-red-50 p-3 sm:p-4 rounded border border-red-200">
              <p className="text-xs sm:text-sm text-gray-600">Penalti</p>
              <p className="text-lg sm:text-lg font-bold text-red-600">
                -{formatCurrency(selectedPayslip.summary.totalPenalty)}
              </p>
            </div>
          </div>

          {/* Delivery Table */}
          <PayslipTable
            payslip={selectedPayslip}
            canEdit={canEditBonus}
            onSave={loadPayslipData}
          />

          {/* Summary Box */}
          <div className="bg-white p-4 sm:p-6 rounded border border-gray-300">
            <div className="space-y-2 text-sm sm:text-lg">
              <div className="flex justify-between gap-4">
                <span>Gaji Kotor:</span>
                <span className="font-bold">
                  {formatCurrency(selectedPayslip.summary.grossSalary)}
                </span>
              </div>
              <div className="flex justify-between gap-4 text-green-600">
                <span>Bonus Adjustment:</span>
                <span className="font-bold">
                  +{formatCurrency(selectedPayslip.summary.bonusAdjustments)}
                </span>
              </div>
              <div className="border-t pt-2 flex justify-between gap-4 text-base sm:text-xl font-bold">
                <span>Gaji Bersih:</span>
                <span className="text-green-700">
                  {formatCurrency(selectedPayslip.summary.netSalary)}
                </span>
              </div>
            </div>
          </div>

          {/* Export Options */}
          <PayslipExport payslip={selectedPayslip} />
        </>
      )}
    </div>
  );
}
