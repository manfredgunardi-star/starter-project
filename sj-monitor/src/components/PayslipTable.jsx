import React, { useState, useEffect } from "react";
import { calculateSJPenalty, formatCurrency, formatDate } from "../utils/payslipHelpers";
import { savePayslipBonusAdjustments } from "../services/payslipService";

export default function PayslipTable({ payslip, canEdit = false, onSave }) {
  const [bonusAdjustments, setBonusAdjustments] = useState({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const adjustments = {};
    payslip.deliveries.forEach((sj) => {
      adjustments[sj.id] = sj.bonusAdjustment || 0;
    });
    setBonusAdjustments(adjustments);
  }, [payslip]);

  const handleBonusChange = (sjId, amount) => {
    setBonusAdjustments({
      ...bonusAdjustments,
      [sjId]: amount,
    });
  };

  const handleSaveBonus = async () => {
    try {
      setSaving(true);
      setMessage("");

      await savePayslipBonusAdjustments(bonusAdjustments);

      setMessage("✓ Bonus saved successfully");
      setTimeout(() => {
        setMessage("");
        if (onSave) onSave();
      }, 1500);
    } catch (err) {
      setMessage("✗ Error saving bonus: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const successfulDeliveries = payslip.deliveries.filter(
    (sj) => sj.status === "selesai"
  );

  return (
    <div className="bg-white rounded border">
      {/* Message */}
      {message && (
        <div
          className={`p-2 sm:p-3 border-b text-xs sm:text-sm ${
            message.includes("✓")
              ? "bg-green-50 text-green-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {message}
        </div>
      )}

      {/* Table Wrapper with responsive overflow handling */}
      <div className="overflow-x-auto -mx-3 px-3 md:overflow-visible md:mx-0 md:px-0">
        <table className="w-full text-xs sm:text-sm min-w-max md:min-w-0">
        <thead className="bg-gray-100 border-b">
          <tr>
            <th className="text-left p-2 sm:p-3">Tgl SJ</th>
            <th className="text-left p-2 sm:p-3">No SJ</th>
            <th className="text-left p-2 sm:p-3">Rute</th>
            <th className="text-right p-2 sm:p-3">Uang Jalan</th>
            <th className="text-right p-2 sm:p-3">Ritasi</th>
            <th className="text-right p-2 sm:p-3">Qty Loss</th>
            <th className="text-right p-2 sm:p-3">Penalti</th>
            {canEdit && <th className="text-right p-2 sm:p-3">Bonus Edit</th>}
            <th className="text-right p-2 sm:p-3">Total</th>
          </tr>
        </thead>
        <tbody>
          {successfulDeliveries.map((sj) => {
            const penalty = calculateSJPenalty(sj.quantityLoss, sj.abolishPenalty);
            const bonus = bonusAdjustments[sj.id] || 0;
            const total = (sj.uangJalan || 0) + (sj.ritasi || 0) - penalty + bonus;

            return (
              <tr key={sj.id} className="border-b hover:bg-gray-50">
                <td className="p-2 sm:p-3">{formatDate(sj.tanggalSJ)}</td>
                <td className="p-2 sm:p-3 font-medium">{sj.nomorSJ}</td>
                <td className="p-2 sm:p-3">{sj.rute}</td>
                <td className="text-right p-2 sm:p-3">{formatCurrency(sj.uangJalan || 0)}</td>
                <td className="text-right p-2 sm:p-3">{formatCurrency(sj.ritasi || 0)}</td>
                <td className="text-right p-2 sm:p-3">
                  {sj.quantityLoss > 0 ? (
                    <>
                      {sj.quantityLoss}
                      {!sj.abolishPenalty && (
                        <span className="text-gray-500 text-xs ml-1">(penalti aktif)</span>
                      )}
                      {sj.abolishPenalty && (
                        <span className="text-green-600 text-xs ml-1">(dihapus)</span>
                      )}
                    </>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="text-right p-2 sm:p-3 text-red-600">
                  {penalty > 0 ? formatCurrency(-penalty) : "-"}
                </td>
                {canEdit && (
                  <td className="text-right p-2 sm:p-3">
                    <input
                      type="number"
                      value={bonus}
                      onChange={(e) =>
                        handleBonusChange(sj.id, parseInt(e.target.value) || 0)
                      }
                      className="w-16 sm:w-20 border border-gray-300 rounded px-2 py-1 text-right text-xs sm:text-sm min-h-[40px]"
                      placeholder="0"
                    />
                  </td>
                )}
                <td className="text-right p-2 sm:p-3 font-bold">{formatCurrency(total)}</td>
              </tr>
            );
          })}
        </tbody>
        </table>
      </div>

      {/* Save Button */}
      {canEdit && (
        <div className="p-2 sm:p-3 bg-gray-50 border-t">
          <button
            onClick={handleSaveBonus}
            disabled={saving}
            className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white text-sm sm:text-base rounded hover:bg-blue-700 disabled:bg-gray-400 min-h-[44px]"
          >
            {saving ? "Menyimpan..." : "Simpan Bonus"}
          </button>
        </div>
      )}

      {successfulDeliveries.length === 0 && (
        <div className="p-6 text-center text-gray-500">
          Tidak ada pengiriman sukses dalam periode ini
        </div>
      )}
    </div>
  );
}
