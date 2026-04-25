// src/components/TarifRuteBulkUpload.jsx
import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import {
  generateTarifRuteTemplate,
  parseTarifRuteTemplate,
  validateRuteIds,
} from '../utils/tarifRuteTemplateHelpers.js';
import { toISODateOnly } from '../utils/tarifRuteHelpers.js';
import {
  previewBulkTarifImpact,
  commitBulkTarifUpdate,
} from '../services/tarifRuteBulkService.js';
import { formatCurrency } from '../utils/currency.js';

export default function TarifRuteBulkUpload({ ruteList = [], currentUser, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [messageType, setMessageType] = useState(null);
  const [step, setStep] = useState('menu'); // menu | downloading | uploading | preview | processing | done
  const [previewData, setPreviewData] = useState(null); // { updates, effectiveDate, impact }

  const reset = () => {
    setStep('menu');
    setPreviewData(null);
    setLoading(false);
    setMessage(null);
    setMessageType(null);
  };

  const handleDownloadTemplate = () => {
    try {
      setLoading(true);
      setStep('downloading');
      setMessage('Mengunduh template...');

      const rows = generateTarifRuteTemplate(ruteList, toISODateOnly(new Date()));
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = [
        { wch: 14 }, // ID Rute
        { wch: 28 }, // Nama Rute
        { wch: 14 }, // Tarif Lama
        { wch: 14 }, // Tarif Baru
      ];
      XLSX.utils.book_append_sheet(wb, ws, 'Tarif');
      const filename = `Template_Tarif_UangJalan_${toISODateOnly(new Date())}.xlsx`;
      XLSX.writeFile(wb, filename);

      setMessage('✓ Template berhasil diunduh. Isi Tanggal Efektif (B1) dan kolom Tarif Baru.');
      setMessageType('success');
      setStep('menu');
      setTimeout(() => setMessage(null), 4000);
    } catch (err) {
      setMessage(`✗ Error: ${err.message}`);
      setMessageType('error');
      setStep('menu');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setLoading(true);
      setStep('uploading');
      setMessage('Membaca file...');
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const wb = XLSX.read(e.target.result, { type: 'binary' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

          const parsed = parseTarifRuteTemplate(aoa);
          if (parsed.errors.length > 0) {
            setMessage(`✗ Error validasi:\n${parsed.errors.join('\n')}`);
            setMessageType('error');
            reset();
            return;
          }
          const ruteErrs = validateRuteIds(parsed.updates, ruteList);
          if (ruteErrs.length > 0) {
            setMessage(`✗ Rute tidak valid:\n${ruteErrs.join('\n')}`);
            setMessageType('error');
            reset();
            return;
          }
          if (parsed.updates.length === 0) {
            setMessage('✗ Tidak ada perubahan tarif di file (kolom Tarif Baru kosong semua atau sama dengan Tarif Lama).');
            setMessageType('error');
            reset();
            return;
          }

          setMessage('Menghitung dampak backfill...');
          const impact = await previewBulkTarifImpact({
            updates: parsed.updates,
            effectiveDate: parsed.effectiveDate,
          });

          setPreviewData({ updates: parsed.updates, effectiveDate: parsed.effectiveDate, impact });
          setStep('preview');
          setMessage(null);
        } catch (err) {
          setMessage(`✗ Error parsing: ${err.message}`);
          setMessageType('error');
          reset();
        } finally {
          setLoading(false);
        }
      };
      reader.readAsBinaryString(file);
    } catch (err) {
      setMessage(`✗ Error: ${err.message}`);
      setMessageType('error');
      reset();
    } finally {
      event.target.value = '';
    }
  };

  const handleConfirmApply = async () => {
    if (!previewData) return;
    try {
      setLoading(true);
      setStep('processing');
      setMessage('Menyimpan perubahan ke database...');
      const result = await commitBulkTarifUpdate({
        updates: previewData.updates,
        effectiveDate: previewData.effectiveDate,
        username: currentUser?.name || 'system',
      });
      if (result.success) {
        setMessage(`✓ ${result.message}`);
        setMessageType('success');
        setStep('done');
        if (onSuccess) onSuccess(result.summary);
      } else {
        setMessage(`✗ ${result.message}`);
        setMessageType('error');
        setStep('preview');
      }
    } catch (err) {
      setMessage(`✗ Error: ${err.message}`);
      setMessageType('error');
      setStep('preview');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded border border-gray-300">
      <h2 className="text-xl font-bold mb-4">Bulk Update Tarif Uang Jalan</h2>

      {message && (
        <div
          className={`p-4 rounded mb-4 ${
            messageType === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          <pre className="whitespace-pre-wrap font-mono text-sm">{message}</pre>
        </div>
      )}

      {step === 'menu' && (
        <div className="space-y-3">
          <div className="bg-blue-50 border border-blue-200 p-4 rounded">
            <p className="text-sm text-gray-700 mb-2"><strong>Cara penggunaan:</strong></p>
            <ol className="text-sm text-gray-700 space-y-1 ml-4 list-decimal">
              <li>Klik "Download Template" — file berisi semua rute dengan tarif saat ini</li>
              <li>Isi cell <strong>B1 (Tanggal Efektif)</strong> dengan format yyyy-mm-dd</li>
              <li>Isi kolom <strong>Tarif Baru</strong> hanya untuk rute yang berubah (biarkan kosong jika tidak berubah)</li>
              <li>Simpan lalu klik "Upload File" — Anda akan melihat preview dampak sebelum apply</li>
            </ol>
            <p className="text-xs text-amber-700 mt-2">
              ⚠️ SJ dengan tanggal ≥ Tanggal Efektif akan ikut di-update, termasuk transaksi Kas Keluar terkait.
            </p>
          </div>
          <button
            onClick={handleDownloadTemplate}
            disabled={loading}
            className="w-full px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400"
          >
            {loading && step === 'downloading' ? 'Mengunduh...' : '📥 Download Template'}
          </button>
          <div className="relative">
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileUpload}
              disabled={loading}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
            />
            <button
              disabled={loading}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
            >
              {loading && step === 'uploading' ? 'Membaca file...' : '📤 Upload File'}
            </button>
          </div>
        </div>
      )}

      {step === 'preview' && previewData && (
        <div className="space-y-3">
          <div className="bg-amber-50 border border-amber-300 p-4 rounded">
            <p className="text-sm font-semibold text-amber-800">Konfirmasi Perubahan</p>
            <p className="text-sm text-gray-700 mt-2">
              Tanggal Efektif: <strong className="font-mono">{previewData.effectiveDate}</strong>
            </p>
            <p className="text-sm text-gray-700">
              Tarif berubah: <strong>{previewData.updates.length} rute</strong>
            </p>
            <p className="text-sm text-gray-700">
              SJ akan di-backfill: <strong>{previewData.impact.sjCount}</strong>
            </p>
            <p className="text-sm text-gray-700">
              Transaksi Kas Keluar akan di-update: <strong>{previewData.impact.transaksiCount}</strong>
            </p>
          </div>

          <div className="max-h-64 overflow-y-auto border border-gray-200 rounded">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="text-left p-2">ID Rute</th>
                  <th className="text-left p-2">Nama Rute</th>
                  <th className="text-right p-2">Lama</th>
                  <th className="text-right p-2">Baru</th>
                  <th className="text-right p-2">Δ</th>
                </tr>
              </thead>
              <tbody>
                {previewData.updates.map((u) => (
                  <tr key={u.ruteId} className="border-t">
                    <td className="p-2 font-mono">{u.ruteId}</td>
                    <td className="p-2">{u.namaRute}</td>
                    <td className="p-2 text-right">{formatCurrency(u.tarifLama)}</td>
                    <td className="p-2 text-right font-semibold text-blue-700">{formatCurrency(u.tarifBaru)}</td>
                    <td className={`p-2 text-right ${u.tarifBaru > u.tarifLama ? 'text-green-600' : 'text-red-600'}`}>
                      {u.tarifBaru > u.tarifLama ? '+' : ''}
                      {formatCurrency(u.tarifBaru - u.tarifLama)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-2">
            <button
              onClick={reset}
              disabled={loading}
              className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
            >
              Batal
            </button>
            <button
              onClick={handleConfirmApply}
              disabled={loading}
              className="flex-1 px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-400"
            >
              {loading ? 'Memproses...' : 'Konfirmasi & Apply'}
            </button>
          </div>
        </div>
      )}

      {step === 'done' && (
        <div className="text-center py-8">
          <p className="text-lg text-green-600 font-semibold">✓ Selesai</p>
          <p className="text-sm text-gray-500 mt-2">Anda bisa menutup modal ini atau upload file lain.</p>
          <button
            onClick={reset}
            className="mt-4 px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
          >
            Upload Lagi
          </button>
        </div>
      )}
    </div>
  );
}
