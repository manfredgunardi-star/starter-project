// src/components/TarifRuteHistoryModal.jsx
import React, { useMemo } from 'react';
import { formatCurrency } from '../utils/currency.js';

export default function TarifRuteHistoryModal({ rute, tarifRuteList, onClose }) {
  const history = useMemo(() => {
    if (!rute) return [];
    return (tarifRuteList || [])
      .filter((t) => String(t.ruteId) === String(rute.id))
      .sort((a, b) => (a.effectiveDate < b.effectiveDate ? 1 : a.effectiveDate > b.effectiveDate ? -1 : 0));
  }, [rute, tarifRuteList]);

  if (!rute) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-2xl font-bold">Riwayat Tarif Uang Jalan</h2>
              <p className="text-sm text-gray-600">{rute.rute} ({rute.id})</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-2xl"
              aria-label="Tutup"
            >
              ×
            </button>
          </div>

          <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded">
            <p className="text-sm text-gray-700">
              Tarif saat ini (current): <strong className="text-blue-700">{formatCurrency(rute.uangJalan || 0)}</strong>
              {rute.uangJalanEffectiveDate && (
                <span className="text-gray-500"> sejak {rute.uangJalanEffectiveDate}</span>
              )}
            </p>
          </div>

          {history.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">
              Belum ada riwayat perubahan tarif untuk rute ini.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-700">
                <tr>
                  <th className="text-left p-2">Tanggal Efektif</th>
                  <th className="text-right p-2">Uang Jalan</th>
                  <th className="text-left p-2">Sumber</th>
                  <th className="text-left p-2">Oleh</th>
                  <th className="text-left p-2">Dibuat</th>
                </tr>
              </thead>
              <tbody>
                {history.map((t) => (
                  <tr key={t.id} className="border-t">
                    <td className="p-2 font-mono">{t.effectiveDate}</td>
                    <td className="p-2 text-right font-semibold text-blue-700">{formatCurrency(t.uangJalan)}</td>
                    <td className="p-2">
                      <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                        {t.source || 'manual'}
                      </span>
                    </td>
                    <td className="p-2">{t.createdBy || '-'}</td>
                    <td className="p-2 text-xs text-gray-500">{t.createdAt ? new Date(t.createdAt).toLocaleString('id-ID') : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}