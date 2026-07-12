import { describe, it, expect } from 'vitest';
import { calculateDriverPayslip } from '../payslipHelpers.js';

const ruteData = {
  R1: { id: 'R1', rute: 'Jakarta - Bandung', uangJalan: 500000, ritasi: 50000 },
};

describe('calculateDriverPayslip — warnings', () => {
  it('data lengkap: hitung normal, warnings kosong', () => {
    const deliveries = [
      { id: 'SJ-1', nomorSJ: '001', status: 'terkirim', ruteId: 'R1', uangJalan: 500000 },
    ];
    const result = calculateDriverPayslip(deliveries, ruteData);
    expect(result.totalUangJalan).toBe(500000);
    expect(result.totalRitasi).toBe(50000);
    expect(result.grossSalary).toBe(550000);
    expect(result.warnings).toEqual([]);
  });

  it('rute tidak ditemukan → warning, kalkulasi tetap jalan', () => {
    const deliveries = [
      { id: 'SJ-2', nomorSJ: '002', status: 'terkirim', ruteId: 'R-HILANG' },
    ];
    const result = calculateDriverPayslip(deliveries, ruteData);
    expect(result.successfulDeliveries).toBe(1);
    expect(result.warnings.some((w) => w.includes('rute tidak ditemukan'))).toBe(true);
  });

  it('uangJalan=0 → warning', () => {
    const deliveries = [
      { id: 'SJ-3', nomorSJ: '003', status: 'terkirim', ruteId: 'R1', uangJalan: 0 },
    ];
    const result = calculateDriverPayslip(deliveries, ruteData);
    expect(result.totalUangJalan).toBe(0);
    expect(result.warnings.some((w) => w.includes('uangJalan=0'))).toBe(true);
  });

  it('uangJalan rute bertipe string → diperlakukan 0, bukan string concat', () => {
    const dirtyRute = { R9: { id: 'R9', uangJalan: '500000', ritasi: '50000' } };
    const deliveries = [{ id: 'SJ-4', status: 'terkirim', ruteId: 'R9' }];
    const result = calculateDriverPayslip(deliveries, dirtyRute);
    expect(result.totalUangJalan).toBe(0);
    expect(result.totalRitasi).toBe(0);
    expect(typeof result.grossSalary).toBe('number');
  });

  it('SJ non-terkirim tidak dihitung dan tidak memicu warning', () => {
    const deliveries = [{ id: 'SJ-5', status: 'pending', ruteId: 'R-HILANG' }];
    const result = calculateDriverPayslip(deliveries, ruteData);
    expect(result.successfulDeliveries).toBe(0);
    expect(result.warnings).toEqual([]);
  });
});
