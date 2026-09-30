import { describe, it, expect } from 'vitest';
import {
  isMasterActive,
  normalizeMasterItem,
  buildMasterUpdatePayload,
  buildMasterActivatePayload,
} from './masterData.js';

const meta = { updatedAt: '2026-09-07T00:00:00.000Z', updatedBy: 'tester' };

describe('isMasterActive', () => {
  it('menganggap dokumen lama tanpa isActive sebagai aktif', () => {
    expect(isMasterActive({ id: 'TRK-1' })).toBe(true);
  });

  it('hanya nonaktif kalau isActive === false', () => {
    expect(isMasterActive({ id: 'TRK-1', isActive: false })).toBe(false);
    expect(isMasterActive({ id: 'TRK-1', isActive: true })).toBe(true);
  });

  it('memperlakukan soft-deleted sebagai tidak aktif', () => {
    expect(isMasterActive({ id: 'TRK-1', isActive: true, deletedAt: '2026-01-01' })).toBe(false);
  });
});

describe('normalizeMasterItem', () => {
  it('memakai field id kalau ada, fallback ke doc id', () => {
    expect(normalizeMasterItem({ id: 'TRK-1' }, 'doc-xyz').id).toBe('TRK-1');
    expect(normalizeMasterItem({}, 'doc-xyz').id).toBe('doc-xyz');
  });

  it('menormalkan isActive jadi boolean', () => {
    expect(normalizeMasterItem({ id: 'a' }, 'a').isActive).toBe(true);
    expect(normalizeMasterItem({ id: 'a', isActive: false }, 'a').isActive).toBe(false);
  });
});

describe('buildMasterUpdatePayload', () => {
  it('REGRESI: isActive:false dari form tidak boleh ditimpa jadi true', () => {
    const payload = buildMasterUpdatePayload('TRK-1', { nomorPolisi: 'B 1234 XY', isActive: false }, meta);
    expect(payload.isActive).toBe(false);
    expect(payload.nomorPolisi).toBe('B 1234 XY');
  });

  it('mempertahankan isActive:true kalau form mengirim aktif', () => {
    expect(buildMasterUpdatePayload('TRK-1', { isActive: true }, meta).isActive).toBe(true);
  });

  it('default aktif kalau updates tidak menyebut isActive', () => {
    expect(buildMasterUpdatePayload('RUT-1', { rute: 'A - B' }, meta).isActive).toBe(true);
  });

  it('menyertakan id dan metadata audit', () => {
    const payload = buildMasterUpdatePayload('SPR-1', { namaSupir: 'Budi' }, meta);
    expect(payload.id).toBe('SPR-1');
    expect(payload.updatedAt).toBe(meta.updatedAt);
    expect(payload.updatedBy).toBe('tester');
  });

  it('tidak membiarkan updates menimpa id', () => {
    expect(buildMasterUpdatePayload('SPR-1', { namaSupir: 'Budi' }, meta).id).toBe('SPR-1');
  });

  it('membersihkan jejak soft delete saat form memilih Aktif', () => {
    const payload = buildMasterUpdatePayload('TRK-1', { isActive: true }, meta);
    expect(payload.deletedAt).toBeNull();
    expect(payload.deletedBy).toBeNull();
    expect(isMasterActive(payload)).toBe(true);
  });

  it('tidak menyentuh deletedAt pada edit biasa maupun saat dinonaktifkan', () => {
    expect('deletedAt' in buildMasterUpdatePayload('RUT-1', { rute: 'A - B' }, meta)).toBe(false);
    expect('deletedAt' in buildMasterUpdatePayload('TRK-1', { isActive: false }, meta)).toBe(false);
  });
});

describe('buildMasterActivatePayload', () => {
  it('mengaktifkan kembali dan membersihkan jejak soft delete', () => {
    const payload = buildMasterActivatePayload('MTR-1', meta);
    expect(payload).toMatchObject({
      id: 'MTR-1',
      isActive: true,
      deletedAt: null,
      deletedBy: null,
      updatedBy: 'tester',
    });
  });

  it('hasilnya lolos isMasterActive', () => {
    expect(isMasterActive(buildMasterActivatePayload('MTR-1', meta))).toBe(true);
  });
});
