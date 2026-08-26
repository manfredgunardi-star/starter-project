import { describe, it, expect } from 'vitest';
import { resolveSJInvoice, hitungPotonganUJ, hitungTotalInvoice } from './invoiceTotals.js';

const sjA = { id: 'sj-a', nomorSJ: '330002', qtyBongkar: 10, uangJalan: 500000 };
const sjB = { id: 'sj-b', nomorSJ: '330015', qtyBongkar: 5, uangJalan: 300000 };

// Snapshot sengaja memuat uangJalan lama yang berbeda dari live,
// supaya test membuktikan live yang menang.
const invoice = {
  id: 'INV-1',
  totalNilai: 2000000,
  suratJalanIds: ['sj-a', 'sj-b'],
  suratJalanList: [
    { ...sjA, uangJalan: 111111 },
    { ...sjB, uangJalan: 222222 },
  ],
};

describe('hitungPotonganUJ', () => {
  it('menjumlahkan uangJalan', () => {
    expect(hitungPotonganUJ([sjA, sjB])).toBe(800000);
  });

  it('mengembalikan 0 untuk list kosong atau tidak diisi', () => {
    expect(hitungPotonganUJ([])).toBe(0);
    expect(hitungPotonganUJ()).toBe(0);
  });

  it('memperlakukan uangJalan hilang, null, dan string angka dengan benar', () => {
    expect(hitungPotonganUJ([{ id: 'x' }, { id: 'y', uangJalan: null }])).toBe(0);
    expect(hitungPotonganUJ([{ id: 'z', uangJalan: '250000' }])).toBe(250000);
  });
});

describe('resolveSJInvoice', () => {
  it('memakai SJ live saat tersedia', () => {
    const { list, sjHilang } = resolveSJInvoice(invoice, [sjA, sjB]);
    expect(sjHilang).toBe(0);
    expect(list).toHaveLength(2);
    expect(list.every(x => x.sumber === 'live')).toBe(true);
    expect(list[0].sj.uangJalan).toBe(500000);
  });

  it('jatuh ke snapshot untuk SJ yang tidak ada di live', () => {
    const { list, sjHilang } = resolveSJInvoice(invoice, [sjA]);
    expect(sjHilang).toBe(0);
    expect(list[0].sumber).toBe('live');
    expect(list[1].sumber).toBe('snapshot');
    expect(list[1].sj.uangJalan).toBe(222222);
  });

  it('menghitung SJ yang hilang di live maupun snapshot', () => {
    const inv = { ...invoice, suratJalanIds: ['sj-a', 'sj-hantu'], suratJalanList: [] };
    const { list, sjHilang } = resolveSJInvoice(inv, [sjA]);
    expect(list).toHaveLength(1);
    expect(sjHilang).toBe(1);
  });

  it('aman untuk invoice null dan argumen kedua tidak diisi', () => {
    expect(resolveSJInvoice(null)).toEqual({ list: [], sjHilang: 0 });
    expect(resolveSJInvoice({ suratJalanIds: [] })).toEqual({ list: [], sjHilang: 0 });
  });
});

describe('hitungTotalInvoice', () => {
  it('menghitung tiga angka kwitansi dari SJ live', () => {
    expect(hitungTotalInvoice(invoice, [sjA, sjB])).toEqual({
      subTotal: 2000000,
      potonganUJ: 800000,
      totalAkhir: 1200000,
      sumberUJ: 'live',
      sjHilang: 0,
    });
  });

  it('menandai sumberUJ campuran saat sebagian dari snapshot', () => {
    const hasil = hitungTotalInvoice(invoice, [sjA]);
    expect(hasil.potonganUJ).toBe(722222);
    expect(hasil.totalAkhir).toBe(1277778);
    expect(hasil.sumberUJ).toBe('campuran');
  });

  it('menandai sumberUJ snapshot saat semua dari snapshot', () => {
    const hasil = hitungTotalInvoice(invoice, []);
    expect(hasil.potonganUJ).toBe(333333);
    expect(hasil.sumberUJ).toBe('snapshot');
  });

  it('menganggap invoice tanpa SJ sebagai sumberUJ live dengan potongan 0', () => {
    const hasil = hitungTotalInvoice({ totalNilai: 500000, suratJalanIds: [] }, []);
    expect(hasil).toEqual({
      subTotal: 500000,
      potonganUJ: 0,
      totalAkhir: 500000,
      sumberUJ: 'live',
      sjHilang: 0,
    });
  });

  it('memperlakukan totalNilai hilang sebagai 0', () => {
    const hasil = hitungTotalInvoice({ suratJalanIds: ['sj-a'] }, [sjA]);
    expect(hasil.subTotal).toBe(0);
    expect(hasil.totalAkhir).toBe(-500000);
  });

  it('aman untuk invoice null', () => {
    expect(hitungTotalInvoice(null)).toEqual({
      subTotal: 0,
      potonganUJ: 0,
      totalAkhir: 0,
      sumberUJ: 'live',
      sjHilang: 0,
    });
  });
});
