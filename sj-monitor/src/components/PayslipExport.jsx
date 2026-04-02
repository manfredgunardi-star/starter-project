import React, { useState } from "react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import "jspdf-autotable";
import { formatCurrency, formatDate } from "../utils/payslipHelpers";

export default function PayslipExport({ payslip }) {
  const [exporting, setExporting] = useState(null);

  const handleExportExcel = async () => {
    try {
      setExporting("excel");

      const workbook = XLSX.utils.book_new();

      // Summary sheet
      const summaryData = [
        ["LAPORAN GAJI SUPIR"],
        [],
        ["Nama Supir:", payslip.driver.nama || payslip.driver.email],
        ["Periode:", payslip.periodLabel],
        [],
        ["Pengiriman Sukses", payslip.summary.successfulDeliveries],
        ["Uang Jalan", formatCurrency(payslip.summary.totalUangJalan)],
        ["Ritasi", formatCurrency(payslip.summary.totalRitasi)],
        ["Penalti", formatCurrency(-payslip.summary.totalPenalty)],
        ["Bonus Adjustment", formatCurrency(payslip.summary.bonusAdjustments)],
        [],
        ["GAJI BERSIH", formatCurrency(payslip.summary.netSalary)],
      ];

      const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

      // Details sheet
      const detailsData = [
        ["Tanggal", "No SJ", "Rute", "Uang Jalan", "Ritasi", "Qty Loss", "Penalti", "Bonus", "Total"],
      ];

      payslip.deliveries
        .filter((sj) => sj.status === "selesai")
        .forEach((sj) => {
          const penalty = sj.abolishPenalty ? 0 : (sj.quantityLoss - 1) * 500000;
          const bonus = sj.bonusAdjustment || 0;
          const total = (sj.uangJalan || 0) + (sj.ritasi || 0) - penalty + bonus;

          detailsData.push([
            formatDate(sj.tanggalSJ),
            sj.nomorSJ,
            sj.rute,
            sj.uangJalan || 0,
            sj.ritasi || 0,
            sj.quantityLoss || 0,
            penalty,
            bonus,
            total,
          ]);
        });

      const detailsSheet = XLSX.utils.aoa_to_sheet(detailsData);
      XLSX.utils.book_append_sheet(workbook, detailsSheet, "Details");

      const filename = `Gaji_${payslip.driver.nama || "supir"}_${new Date().toISOString().split("T")[0]}.xlsx`;
      XLSX.writeFile(workbook, filename);
    } catch (error) {
      alert("Error exporting to Excel: " + error.message);
    } finally {
      setExporting(null);
    }
  };

  const handleExportPDF = async () => {
    try {
      setExporting("pdf");

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      let yPos = 15;

      // Title
      doc.setFontSize(16);
      doc.text("LAPORAN GAJI SUPIR", pageWidth / 2, yPos, { align: "center" });
      yPos += 10;

      // Header info
      doc.setFontSize(10);
      doc.text(`Nama Supir: ${payslip.driver.nama || payslip.driver.email}`, 10, yPos);
      yPos += 6;
      doc.text(`Periode: ${payslip.periodLabel}`, 10, yPos);
      yPos += 10;

      // Summary section
      doc.setFontSize(11);
      doc.text("RINGKASAN GAJI", 10, yPos);
      yPos += 6;

      doc.setFontSize(9);
      const summaryInfo = [
        ["Pengiriman Sukses", `${payslip.summary.successfulDeliveries} kali`],
        ["Uang Jalan", formatCurrency(payslip.summary.totalUangJalan)],
        ["Ritasi", formatCurrency(payslip.summary.totalRitasi)],
        ["Penalti", formatCurrency(-payslip.summary.totalPenalty)],
        ["Bonus Adjustment", formatCurrency(payslip.summary.bonusAdjustments)],
        ["GAJI BERSIH", formatCurrency(payslip.summary.netSalary)],
      ];

      summaryInfo.forEach(([label, value]) => {
        doc.text(`${label}: ${value}`, 15, yPos);
        yPos += 5;
      });

      yPos += 5;

      // Details table
      if (payslip.deliveries.filter((sj) => sj.status === "selesai").length > 0) {
        doc.setFontSize(11);
        doc.text("DETAIL PENGIRIMAN", 10, yPos);
        yPos += 6;

        const tableData = [];
        payslip.deliveries
          .filter((sj) => sj.status === "selesai")
          .forEach((sj) => {
            const penalty = sj.abolishPenalty ? 0 : (sj.quantityLoss - 1) * 500000;
            const bonus = sj.bonusAdjustment || 0;
            const total = (sj.uangJalan || 0) + (sj.ritasi || 0) - penalty + bonus;

            tableData.push([
              formatDate(sj.tanggalSJ),
              sj.nomorSJ,
              sj.rute,
              `Rp ${(sj.uangJalan || 0).toLocaleString("id-ID")}`,
              penalty > 0 ? `-Rp ${penalty.toLocaleString("id-ID")}` : "-",
              `Rp ${total.toLocaleString("id-ID")}`,
            ]);
          });

        doc.autoTable({
          startY: yPos,
          head: [["Tgl", "No SJ", "Rute", "Uang Jalan", "Penalti", "Total"]],
          body: tableData,
          margin: 10,
          headStyles: { fillColor: [41, 128, 185], textColor: 255 },
          bodyStyles: { textColor: 0 },
          footStyles: { fillColor: [240, 240, 240] },
          didDrawPage: function (data) {
            const pageCount = doc.internal.getNumberOfPages();
            const pageSize = doc.internal.pageSize;
            const pageHeight = pageSize.getHeight();
            const pageWidth = pageSize.getWidth();
            doc.setFontSize(9);
            doc.text(
              `Page ${data.pageNumber} of ${pageCount}`,
              pageWidth / 2,
              pageHeight - 10,
              { align: "center" }
            );
          },
        });
      }

      const filename = `Gaji_${payslip.driver.nama || "supir"}_${new Date().toISOString().split("T")[0]}.pdf`;
      doc.save(filename);
    } catch (error) {
      alert("Error exporting to PDF: " + error.message);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="bg-white p-3 sm:p-4 rounded border flex flex-col sm:flex-row gap-2">
      <button
        onClick={handleExportExcel}
        disabled={exporting === "excel"}
        className="flex-1 sm:flex-none px-4 py-2 bg-green-600 text-white text-sm sm:text-base rounded hover:bg-green-700 disabled:bg-gray-400 flex items-center justify-center gap-2 min-h-[44px]"
      >
        {exporting === "excel" ? "Exporting..." : "Export to Excel"}
      </button>
      <button
        onClick={handleExportPDF}
        disabled={exporting === "pdf"}
        className="flex-1 sm:flex-none px-4 py-2 bg-red-600 text-white text-sm sm:text-base rounded hover:bg-red-700 disabled:bg-gray-400 flex items-center justify-center gap-2 min-h-[44px]"
      >
        {exporting === "pdf" ? "Exporting..." : "Export to PDF"}
      </button>
    </div>
  );
}
