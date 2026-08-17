import { useRef, useState } from 'react';
import { Upload, Download, CheckCircle, AlertTriangle } from 'lucide-react';
import { parseInvoiceCsv } from '../../utils/invoiceCsvParser.js';

const TEMPLATE_CSV =
  'Nomor SJ;Harga Jual per Satuan\n' +
  '07214;50000\n' +
  '07215;50000\n' +
  '08120;60000\n';

/**
 * Panel import CSV untuk form "Buat Invoice Baru".
 *
 * Komponen ini TIDAK menulis apa pun ke Firestore. Tugasnya hanya membaca
 * berkas CSV, menyerahkannya ke parser, lalu melaporkan hasilnya ke induk
 * lewat onImported(). Yang menyimpan invoice tetap tombol Simpan yang lama.
 */
const InvoiceImportPanel = ({ eligibleSJList = [], onImported, setAlertMessage }) => {
  const fileInputRef = useRef(null);
  const [ringkasan, setRingkasan] = useState(null);

  const unduhTemplate = () => {
    // BOM UTF-8 agar Excel mengenali encoding — pola sama dengan downloadTemplate() di App.jsx
    const blob = new Blob(['﻿' + TEMPLATE_CSV], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'template_import_invoice.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const bacaFile = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const hasil = parseInvoiceCsv(e.target.result, eligibleSJList);

      if (!hasil.ok) {
        setRingkasan({ gagal: true, rejected: hasil.rejected });
        setAlertMessage('⛔ Import dibatalkan.\n\n' + hasil.error);
        return;
      }

      setRingkasan({
        gagal: false,
        jumlahSJ: hasil.selectedSJIds.length,
        groups: hasil.groups,
        rejected: hasil.rejected,
        totalNilai: hasil.totalNilai,
      });
      onImported(hasil);
    };
    reader.onerror = () => setAlertMessage('⛔ Gagal membaca file CSV.');
    reader.readAsText(file);
  };

  return (
    <div className="mb-4 p-4 border border-purple-200 rounded-lg bg-purple-50">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-purple-800 mr-auto">
          Import daftar SJ dari CSV
          <span className="ml-2 text-xs font-normal text-purple-600">
            (opsional — bisa juga pilih manual di bawah)
          </span>
        </p>
        <button
          type="button"
          onClick={unduhTemplate}
          className="bg-white hover:bg-gray-100 text-purple-700 border border-purple-300 px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5 transition"
        >
          <Download className="w-4 h-4" />
          Download Template
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5 transition"
        >
          <Upload className="w-4 h-4" />
          Import CSV
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) bacaFile(file);
            // Kosongkan agar file yang sama bisa dipilih ulang setelah diperbaiki
            e.target.value = '';
          }}
        />
      </div>

      {ringkasan && !ringkasan.gagal && (
        <div className="mt-3 bg-white rounded-lg p-3 border border-purple-200">
          <p className="text-sm font-semibold text-green-700 flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            {ringkasan.jumlahSJ} Surat Jalan terpilih dari CSV · {ringkasan.groups.length} rute
          </p>
          <div className="mt-2 space-y-1">
            {ringkasan.groups.map((g) => (
              <p key={g.groupKey} className="text-xs text-gray-700">
                {g.material} — {g.rute}: {g.jumlahSJ} SJ · {g.totalQty.toFixed(2)} {g.satuan} ×
                Rp {g.hargaSatuan.toLocaleString('id-ID')} ={' '}
                <strong>Rp {Math.round(g.nilai).toLocaleString('id-ID')}</strong>
              </p>
            ))}
          </div>
          <p className="mt-2 pt-2 border-t border-gray-200 text-sm font-bold text-blue-700 text-right">
            Total dari CSV: Rp {Math.round(ringkasan.totalNilai).toLocaleString('id-ID')}
          </p>
        </div>
      )}

      {ringkasan?.rejected?.length > 0 && (
        <div className="mt-3 bg-white rounded-lg p-3 border border-orange-300">
          <p className="text-sm font-semibold text-orange-700 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            {ringkasan.rejected.length} baris ditolak
          </p>
          <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
            {ringkasan.rejected.map((r, i) => (
              <p key={i} className="text-xs text-orange-800">
                Baris {r.baris} ({r.nomorSJ || '-'}): {r.alasan}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default InvoiceImportPanel;
