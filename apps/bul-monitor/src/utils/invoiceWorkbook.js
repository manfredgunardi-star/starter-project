import { hitungTotalInvoice, resolveSJInvoice } from './invoiceTotals.js';

/**
 * Label status integrasi untuk sheet Rekap Invoice. Sama dengan label yang
 * dipakai di badge InvoiceManagement.jsx, di luar 'menunggu_review'/'terkunci'
 * dianggap belum pernah dikirim.
 */
function labelStatusIntegrasi(status) {
  if (status === 'menunggu_review') return 'Menunggu Review Akuntan';
  if (status === 'terkunci') return 'Sudah Masuk Accounting';
  return 'Belum Dikirim';
}

/**
 * Resolusi harga per-SJ. Untuk invoice multi-grup (hargaPerGroup), harga
 * dicari lewat material+rute — pola yang sama dengan integrationService.js
 * (kirim ke accounting), BUKAN invoice.hargaSatuan mentah yang bernilai null
 * untuk invoice jenis ini.
 */
function resolveHargaSatuan(invoice, sj) {
  const useGroup = invoice?.hargaPerGroup && invoice.hargaPerGroup.length > 0;
  if (!useGroup) {
    return Number(invoice?.hargaSatuan) || 0;
  }
  const hargaMap = {};
  invoice.hargaPerGroup.forEach((g) => { hargaMap[`${g.material}|${g.rute}`] = g.hargaSatuan; });
  return Number(hargaMap[`${sj.material}|${sj.rute}`]) || 0;
}

/**
 * Bangun data mentah untuk workbook "Download Semua Invoice": satu baris
 * rekap per invoice, dan satu baris detail per Surat Jalan digabung dari
 * semua invoice. Fungsi murni — tidak menyentuh DOM atau library xlsx,
 * supaya bisa ditest tanpa browser.
 *
 * @param {object[]} [invoiceList]
 * @param {object[]} [suratJalanList]
 * @returns {{ rekap: object[], detail: object[] }}
 */
export function buildInvoiceWorkbookData(invoiceList = [], suratJalanList = []) {
  const rekap = invoiceList.map((invoice) => {
    const t = hitungTotalInvoice(invoice, suratJalanList);
    return {
      'No Invoice': invoice.noInvoice || '',
      'Tanggal Invoice': invoice.tglInvoice || '',
      'Jumlah SJ': (invoice.suratJalanIds || []).length,
      'Sub Total': t.subTotal,
      'Potongan Uang Jalan': t.potonganUJ,
      'Total Akhir': t.totalAkhir,
      'SJ Tidak Ditemukan': t.sjHilang,
      'Sumber UJ': t.sumberUJ,
      'Status Integrasi': labelStatusIntegrasi(invoice.integrationStatus),
      'Dibuat Oleh': invoice.createdBy || '',
      'Tanggal Dibuat': invoice.createdAt || '',
    };
  });

  const detail = [];
  invoiceList.forEach((invoice) => {
    const { list } = resolveSJInvoice(invoice, suratJalanList);
    list.forEach(({ sj, sumber }) => {
      const harga = resolveHargaSatuan(invoice, sj);
      detail.push({
        'No Invoice': invoice.noInvoice || '',
        'No SJ': sj.nomorSJ || '',
        'Tgl SJ': sj.tanggalSJ || '',
        'No Polisi': sj.nomorPolisi || '',
        'Nama Supir': sj.namaSupir || '',
        'Rute': sj.rute || '',
        'Material': sj.material || '',
        'Qty Bongkar': Number(sj.qtyBongkar) || 0,
        'Satuan': sj.satuan || '',
        'Harga Satuan': harga,
        'Nilai': (Number(sj.qtyBongkar) || 0) * harga,
        'Uang Jalan': Number(sj.uangJalan) || 0,
        'Sumber Data': sumber,
      });
    });
  });

  return { rekap, detail };
}
