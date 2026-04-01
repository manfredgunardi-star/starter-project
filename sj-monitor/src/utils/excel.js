// src/utils/excel.js
import * as XLSX from 'xlsx';

export const downloadSJRecapToExcel = (suratJalanList = [], options = {}) => {
  const { startDate = '', endDate = '', dateField = 'tanggalSJ' } = options || {};

  const normDate = (v) => {
    if (!v) return '';
    if (typeof v === 'string') {
      const m = v.match(/^(\d{4}-\d{2}-\d{2})/);
      if (m) return m[1];
    }
    try { return new Date(v).toISOString().slice(0, 10); } catch { return ''; }
  };

  const start = normDate(startDate);
  const end = normDate(endDate);
  const rows = (Array.isArray(suratJalanList) ? suratJalanList : [])
    .filter((sj) => sj?.isActive !== false)
    .filter((sj) => {
      const d = normDate(sj?.[dateField]);
      if (!d) return false;
      if (start && d < start) return false;
      if (end && d > end) return false;
      return true;
    })
    .map((sj, i) => ({
      No: i + 1,
      'Nomor SJ': sj?.nomorSJ || '',
      'Tanggal SJ': normDate(sj?.tanggalSJ),
      'Tanggal Terkirim': normDate(sj?.tglTerkirim),
      PT: sj?.pt || '',
      Supir: sj?.namaSupir || sj?.supir || '',
      'Nomor Polisi': sj?.nomorPolisi || '',
      Rute: sj?.rute || '',
      Material: sj?.material || '',
      'Qty Isi': Number(sj?.qtyIsi || 0),
      'Qty Bongkar': Number(sj?.qtyBongkar || 0),
      Satuan: sj?.satuan || '',
      'Uang Jalan': Number(sj?.uangJalan || 0),
      Status: sj?.status || '',
      'Status Invoice': sj?.statusInvoice || 'belum',
      'Dibuat Oleh': sj?.createdBy || '',
      'Dibuat Tanggal': normDate(sj?.createdAt),
      'Diupdate Oleh': sj?.updatedBy || '',
      'Diupdate Tanggal': normDate(sj?.updatedAt),
    }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 6 }, { wch: 18 }, { wch: 14 }, { wch: 16 }, { wch: 10 }, { wch: 24 },
    { wch: 16 }, { wch: 24 }, { wch: 16 }, { wch: 10 }, { wch: 12 }, { wch: 10 },
    { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Rekap Surat Jalan');
  const startLabel = start || 'all';
  const endLabel = end || 'all';
  XLSX.writeFile(wb, `Rekap_Surat_Jalan_${dateField}_${startLabel}_${endLabel}.xlsx`);
};
