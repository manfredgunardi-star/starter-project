// src/utils/excel.js

const NAMA_BULAN = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

export const downloadSJRecapToExcel = async (suratJalanList = [], options = {}) => {
  const XLSX = await import('xlsx');
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

export async function exportLabaKotorToExcel(invoiceList = [], uangMukaList = [], { bulan, tahun, filterField = 'tglInvoice' } = {}) {
  const XLSX = await import('xlsx');
  const getMonthYear = (dateStr) => {
    if (!dateStr) return { month: null, year: null };
    try {
      const d = new Date(dateStr);
      return { month: d.getMonth() + 1, year: d.getFullYear() };
    } catch { return { month: null, year: null }; }
  };

  const filtered = (Array.isArray(invoiceList) ? invoiceList : [])
    .filter(inv => inv?.isActive !== false)
    .filter(inv => {
      if (filterField === 'tglInvoice') {
        const { month, year } = getMonthYear(inv?.tglInvoice);
        return month === bulan && year === tahun;
      }
      const sjList = Array.isArray(inv?.suratJalanList) ? inv.suratJalanList : [];
      return sjList.some(sj => {
        const { month, year } = getMonthYear(sj?.tanggalSJ);
        return month === bulan && year === tahun;
      });
    });

  // Sheet 1: Rekap per Invoice
  const sheet1Rows = [];
  let totPendapatan = 0, totUM = 0, totUJ = 0, totLaba = 0;

  filtered.forEach((inv, i) => {
    const sjList = Array.isArray(inv?.suratJalanList) ? inv.suratJalanList : [];
    const pendapatan = Number(inv?.totalHarga || 0);
    const uangMuka = Number(inv?.totalUM || 0);
    const uangJalan = sjList.reduce((s, sj) => s + Number(sj?.uangJalan || 0), 0);
    const labaKotor = pendapatan - uangMuka - uangJalan;

    totPendapatan += pendapatan;
    totUM += uangMuka;
    totUJ += uangJalan;
    totLaba += labaKotor;

    sheet1Rows.push({
      'No': i + 1,
      'No Invoice': inv?.noInvoice || '',
      'Tanggal Invoice': inv?.tglInvoice ? new Date(inv.tglInvoice).toLocaleDateString('id-ID') : '',
      'Jumlah SJ': sjList.length,
      'Pendapatan': pendapatan,
      'Uang Muka': uangMuka,
      'Uang Jalan': uangJalan,
      'Laba Kotor': labaKotor,
    });
  });

  sheet1Rows.push({
    'No': '',
    'No Invoice': 'TOTAL',
    'Tanggal Invoice': '',
    'Jumlah SJ': filtered.reduce((s, inv) => s + (Array.isArray(inv?.suratJalanList) ? inv.suratJalanList.length : 0), 0),
    'Pendapatan': totPendapatan,
    'Uang Muka': totUM,
    'Uang Jalan': totUJ,
    'Laba Kotor': totLaba,
  });

  const ws1 = XLSX.utils.json_to_sheet(sheet1Rows);
  ws1['!cols'] = [
    { wch: 5 }, { wch: 22 }, { wch: 16 }, { wch: 10 },
    { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 },
  ];

  // Sheet 2: Detail per SJ dengan subtotal per invoice
  const sheet2Headers = ['No Invoice','No SJ','Tanggal SJ','Rute','Qty Bongkar','Satuan','Harga/Unit','Pendapatan','Uang Jalan','Uang Muka','Laba Kotor'];
  const sheet2Data = [sheet2Headers];
  let grand = { pendapatan: 0, uj: 0, um: 0, laba: 0 };

  filtered.forEach(inv => {
    const sjList = Array.isArray(inv?.suratJalanList) ? inv.suratJalanList : [];
    let sub = { pendapatan: 0, uj: 0, um: 0, laba: 0 };

    sjList.forEach(sj => {
      const hargaUnit = Number(inv?.ruteHarga?.[sj?.rute] || 0);
      const pendapatanSJ = Number(sj?.qtyBongkar || 0) * hargaUnit;
      const ujSJ = Number(sj?.uangJalan || 0);
      const umSJ = (Array.isArray(uangMukaList) ? uangMukaList : [])
        .filter(um => um?.sjId === sj?.id && um?.isActive !== false)
        .reduce((s, um) => s + Number(um?.jumlah || 0), 0);
      const labaSJ = pendapatanSJ - ujSJ - umSJ;

      sub.pendapatan += pendapatanSJ;
      sub.uj += ujSJ;
      sub.um += umSJ;
      sub.laba += labaSJ;

      sheet2Data.push([
        inv?.noInvoice || '',
        sj?.nomorSJ || '',
        sj?.tanggalSJ ? new Date(sj.tanggalSJ).toLocaleDateString('id-ID') : '',
        sj?.rute || '',
        Number(sj?.qtyBongkar || 0),
        sj?.satuan || '',
        hargaUnit,
        pendapatanSJ,
        ujSJ,
        umSJ,
        labaSJ,
      ]);
    });

    sheet2Data.push([`Subtotal ${inv?.noInvoice || ''}`, '', '', '', '', '', '', sub.pendapatan, sub.uj, sub.um, sub.laba]);
    grand.pendapatan += sub.pendapatan;
    grand.uj += sub.uj;
    grand.um += sub.um;
    grand.laba += sub.laba;
  });

  sheet2Data.push(['TOTAL', '', '', '', '', '', '', grand.pendapatan, grand.uj, grand.um, grand.laba]);

  const ws2 = XLSX.utils.aoa_to_sheet(sheet2Data);
  ws2['!cols'] = [
    { wch: 22 }, { wch: 18 }, { wch: 14 }, { wch: 24 },
    { wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 16 },
    { wch: 14 }, { wch: 14 }, { wch: 16 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, 'Rekap Invoice');
  XLSX.utils.book_append_sheet(wb, ws2, 'Detail SJ');

  const namaBulan = NAMA_BULAN[(bulan || 1) - 1] || String(bulan);
  XLSX.writeFile(wb, `Laba-Kotor-${namaBulan}-${tahun}.xlsx`);
}
