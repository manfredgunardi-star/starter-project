import { describe, it, expect } from 'vitest';
import { buildInvoiceWorkbookData } from './invoiceWorkbook.js';

const sjA = {
  id: 'sj-a', nomorSJ: '330002', tanggalSJ: '2026-08-01', nomorPolisi: 'B 1234 CD',
  namaSupir: 'Budi', rute: 'Jakarta-Bandung', material: 'Pasir', qtyBongkar: 10,
  satuan: 'M3', uangJalan: 500000,
};
const sjB = {
  id: 'sj-b', nomorSJ: '330015', tanggalSJ: '2026-08-02', nomorPolisi: 'B 5678 EF',
  namaSupir: 'Andi', rute: 'Jakarta-Bogor', material: 'Batu', qtyBongkar: 5,
  satuan: 'M3', uangJalan: 300000,
};

const invoiceFlat = {
  id: 'INV-1', noInvoice: 'INV/2026/001', tglInvoice: '2026-08-05',
  totalNilai: 2000000, hargaSatuan: 100000, hargaPerGroup: null,
  suratJalanIds: ['sj-a', 'sj-b'], suratJalanList: [sjA, sjB],
  integrationStatus: null, createdBy: 'admin1', createdAt: '2026-08-05T10:00:00.000Z',
};

const invoiceGroup = {
  id: 'INV-2', noInvoice: 'INV/2026/002', tglInvoice: '2026-08-06',
  totalNilai: 1500000, hargaSatuan: null,
  hargaPerGroup: [
    { material: 'Pasir', rute: 'Jakarta-Bandung', hargaSatuan: 90000 },
    { material: 'Batu', rute: 'Jakarta-Bogor', hargaSatuan: 70000 },
  ],
  suratJalanIds: ['sj-a', 'sj-b'], suratJalanList: [sjA, sjB],
  integrationStatus: 'menunggu_review', createdBy: 'admin2', createdAt: '2026-08-06T10:00:00.000Z',
};

describe('buildInvoiceWorkbookData', () => {
  it('mengembalikan rekap dan detail kosong untuk invoiceList kosong', () => {
    expect(buildInvoiceWorkbookData([], [])).toEqual({ rekap: [], detail: [] });
  });

  it('aman dipanggil tanpa argumen', () => {
    expect(buildInvoiceWorkbookData()).toEqual({ rekap: [], detail: [] });
  });

  it('menghasilkan satu baris rekap per invoice dengan total dari hitungTotalInvoice', () => {
    const { rekap } = buildInvoiceWorkbookData([invoiceFlat], [sjA, sjB]);
    expect(rekap).toEqual([{
      'No Invoice': 'INV/2026/001',
      'Tanggal Invoice': '2026-08-05',
      'Jumlah SJ': 2,
      'Sub Total': 2000000,
      'Potongan Uang Jalan': 800000,
      'Total Akhir': 1200000,
      'Status Integrasi': 'Belum Dikirim',
      'Dibuat Oleh': 'admin1',
      'Tanggal Dibuat': '2026-08-05T10:00:00.000Z',
    }]);
  });

  it('memetakan integrationStatus ke label yang benar', () => {
    const { rekap } = buildInvoiceWorkbookData([invoiceGroup], [sjA, sjB]);
    expect(rekap[0]['Status Integrasi']).toBe('Menunggu Review Akuntan');

    const terkunci = { ...invoiceFlat, integrationStatus: 'terkunci' };
    expect(buildInvoiceWorkbookData([terkunci], [sjA, sjB]).rekap[0]['Status Integrasi'])
      .toBe('Sudah Masuk Accounting');
  });

  it('menghasilkan satu baris detail per SJ dengan harga flat', () => {
    const { detail } = buildInvoiceWorkbookData([invoiceFlat], [sjA, sjB]);
    expect(detail).toHaveLength(2);
    expect(detail[0]).toEqual({
      'No Invoice': 'INV/2026/001',
      'No SJ': '330002',
      'Tgl SJ': '2026-08-01',
      'No Polisi': 'B 1234 CD',
      'Nama Supir': 'Budi',
      'Rute': 'Jakarta-Bandung',
      'Material': 'Pasir',
      'Qty Bongkar': 10,
      'Satuan': 'M3',
      'Harga Satuan': 100000,
      'Nilai': 1000000,
      'Uang Jalan': 500000,
      'Sumber Data': 'live',
    });
  });

  it('menyelesaikan harga per-grup lewat material+rute, bukan invoice.hargaSatuan mentah', () => {
    const { detail } = buildInvoiceWorkbookData([invoiceGroup], [sjA, sjB]);
    const barisPasir = detail.find(d => d.Material === 'Pasir');
    const barisBatu = detail.find(d => d.Material === 'Batu');
    expect(barisPasir['Harga Satuan']).toBe(90000);
    expect(barisPasir['Nilai']).toBe(900000);
    expect(barisBatu['Harga Satuan']).toBe(70000);
    expect(barisBatu['Nilai']).toBe(350000);
  });

  it('menandai Sumber Data snapshot saat SJ tidak ada di live', () => {
    const { detail } = buildInvoiceWorkbookData([invoiceFlat], [sjA]);
    const barisB = detail.find(d => d['No SJ'] === '330015');
    expect(barisB['Sumber Data']).toBe('snapshot');
  });

  it('melewati SJ yang hilang di live maupun snapshot tanpa membuat baris', () => {
    const invoiceHilang = { ...invoiceFlat, suratJalanIds: ['sj-a', 'sj-hantu'], suratJalanList: [sjA] };
    const { detail } = buildInvoiceWorkbookData([invoiceHilang], [sjA]);
    expect(detail).toHaveLength(1);
    expect(detail[0]['No SJ']).toBe('330002');
  });

  it('menggabungkan detail dari banyak invoice jadi satu array', () => {
    const { detail } = buildInvoiceWorkbookData([invoiceFlat, invoiceGroup], [sjA, sjB]);
    expect(detail).toHaveLength(4);
    expect(detail.filter(d => d['No Invoice'] === 'INV/2026/001')).toHaveLength(2);
    expect(detail.filter(d => d['No Invoice'] === 'INV/2026/002')).toHaveLength(2);
  });
});
