// src/components/RitasiBulkUpload.jsx

import React, { useState } from "react";
import * as XLSX from "xlsx";
import { generateRitasiTemplate, validateRitasiTemplate, parseRitasiUpdates } from "../utils/ritasiTemplateHelpers";
import { fetchAllRutes, bulkUpdateRitasi } from "../services/ritasiBulkService";

export default function RitasiBulkUpload({ ruteList = [], onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [messageType, setMessageType] = useState(null); // 'success' or 'error'
  const [step, setStep] = useState("menu"); // menu, downloading, uploading, processing

  const handleDownloadTemplate = async () => {
    try {
      setLoading(true);
      setStep("downloading");
      setMessage("Mengunduh template...");

      // Fetch latest rute data
      const routes = await fetchAllRutes();

      // Generate template data
      const templateData = generateRitasiTemplate(routes);

      // Create workbook
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet(templateData);

      // Set column widths
      worksheet["!cols"] = [
        { wch: 12 }, // ID Rute
        { wch: 25 }, // Nama Rute
        { wch: 15 }, // Asal
        { wch: 15 }, // Tujuan
        { wch: 12 }, // Uang Jalan
        { wch: 12 }, // Ritasi Saat Ini
        { wch: 12 }, // Ritasi Baru
      ];

      // Style header row
      const headerStyle = {
        fill: { fgColor: { rgb: "FFCCCC00" } }, // Yellow background
        font: { bold: true },
        alignment: { horizontal: "center", vertical: "center" },
      };

      for (let i = 0; i < 7; i++) {
        const cellRef = XLSX.utils.encode_col(i) + "1";
        if (worksheet[cellRef]) {
          worksheet[cellRef].s = headerStyle;
        }
      }

      XLSX.utils.book_append_sheet(workbook, worksheet, "Ritasi");

      // Download file
      const filename = `Template_Ritasi_${new Date().toISOString().split("T")[0]}.xlsx`;
      XLSX.writeFile(workbook, filename);

      setMessage("✓ Template berhasil diunduh");
      setMessageType("success");
      setStep("menu");
      setTimeout(() => setMessage(null), 2000);
    } catch (error) {
      setMessage(`✗ Error: ${error.message}`);
      setMessageType("error");
      setStep("menu");
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      setLoading(true);
      setStep("uploading");
      setMessage("Membaca file...");

      // Read Excel file
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = e.target.result;
          const workbook = XLSX.read(data, { type: "binary" });
          const worksheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 0, defval: "" });

          // Convert to array format (headers + rows)
          const headers = Object.keys(jsonData[0] || {});
          const arrayData = [
            headers,
            ...jsonData.map(row => headers.map(h => row[h] || "")),
          ];

          // Validate template
          setMessage("Validasi data...");
          const validation = validateRitasiTemplate(arrayData);

          if (!validation.isValid) {
            const errorList = validation.errors.join("\n");
            setMessage(`✗ Error validasi:\n${errorList}`);
            setMessageType("error");
            setStep("menu");
            setLoading(false);
            return;
          }

          // Parse updates
          const updates = parseRitasiUpdates(arrayData);
          const updateCount = Object.keys(updates).length;

          if (updateCount === 0) {
            setMessage("✗ Tidak ada data untuk di-update");
            setMessageType("error");
            setStep("menu");
            setLoading(false);
            return;
          }

          // Confirm before update
          setStep("processing");
          setMessage(`Siap update ${updateCount} rute. Memproses...`);

          const result = await bulkUpdateRitasi(updates);

          if (result.success) {
            setMessage(`✓ ${result.message}`);
            setMessageType("success");
            if (onSuccess) onSuccess();
          } else {
            setMessage(`✗ ${result.message}`);
            setMessageType("error");
          }

          setStep("menu");
          setTimeout(() => setMessage(null), 3000);
        } catch (error) {
          setMessage(`✗ Error: ${error.message}`);
          setMessageType("error");
          setStep("menu");
        } finally {
          setLoading(false);
        }
      };

      reader.readAsBinaryString(file);
    } catch (error) {
      setMessage(`✗ Error: ${error.message}`);
      setMessageType("error");
      setStep("menu");
      setLoading(false);
    }

    // Reset file input
    event.target.value = "";
  };

  return (
    <div className="bg-white p-6 rounded border border-gray-300">
      <h2 className="text-xl font-bold mb-4">Bulk Upload Ritasi</h2>

      {message && (
        <div
          className={`p-4 rounded mb-4 ${
            messageType === "success"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          <pre className="whitespace-pre-wrap font-mono text-sm">{message}</pre>
        </div>
      )}

      <div className="space-y-3">
        <div className="bg-blue-50 border border-blue-200 p-4 rounded">
          <p className="text-sm text-gray-700 mb-3">
            <strong>Cara penggunaan:</strong>
          </p>
          <ol className="text-sm text-gray-700 space-y-1 ml-4 list-decimal">
            <li>Klik "Download Template" untuk mendapatkan file template</li>
            <li>Buka file dan isi kolom "Ritasi Baru" untuk setiap rute</li>
            <li>Simpan file dan klik "Upload File" untuk update semua rute</li>
          </ol>
        </div>

        <button
          onClick={handleDownloadTemplate}
          disabled={loading}
          className="w-full px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 flex items-center justify-center gap-2"
        >
          {loading && step === "downloading" ? "Mengunduh..." : "📥 Download Template"}
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
            className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 flex items-center justify-center gap-2"
          >
            {loading && step === "uploading" ? "Membaca file..." : loading && step === "processing" ? "Memproses..." : "📤 Upload File"}
          </button>
        </div>
      </div>
    </div>
  );
}
