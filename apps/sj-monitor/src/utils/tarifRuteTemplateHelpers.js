// src/utils/tarifRuteTemplateHelpers.js
import { toISODateOnly } from './tarifRuteHelpers.js';

const HEADERS = ['ID Rute', 'Nama Rute', 'Tarif Lama', 'Tarif Baru'];

/**
 * Generate template as array-of-arrays (AOA) for XLSX.aoa_to_sheet.
 * Row 0: "Tanggal Efektif:" | <defaultDate>
 * Row 1: blank
 * Row 2: headers
 * Row 3+: rute rows
 */
export function generateTarifRuteTemplate(ruteList, defaultEffectiveDate = '') {
  const rows = [
    ['Tanggal Efektif:', defaultEffectiveDate || toISODateOnly(new Date())],
    [],
    HEADERS,
  ];
  (ruteList || []).forEach((r) => {
    rows.push([
      r.id,
      r.rute,
      Number(r.uangJalan || 0),
      '', // Tarif Baru — user fills
    ]);
  });
  return rows;
}

/**
 * Parse AOA data (read from XLSX.utils.sheet_to_json with header: 1, defval: '').
 * Returns { effectiveDate, updates: [{ ruteId, namaRute, tarifLama, tarifBaru }], errors: [] }
 * Rows where Tarif Baru is empty or equals Tarif Lama are skipped (not errors).
 */
export function parseTarifRuteTemplate(data) {
  const errors = [];
  const updates = [];

  if (!Array.isArray(data) || data.length < 4) {
    errors.push('File tidak memiliki data yang cukup. Pastikan memakai template yang benar.');
    return { effectiveDate: '', updates, errors };
  }

  // Row 0: ['Tanggal Efektif:', <date>]
  const row0 = data[0] || [];
  if (String(row0[0] || '').trim() !== 'Tanggal Efektif:') {
    errors.push('Cell A1 harus berisi "Tanggal Efektif:". Gunakan template terbaru.');
  }
  const effectiveDateRaw = row0[1];
  const effectiveDate = toISODateOnly(effectiveDateRaw);
  if (!effectiveDate) {
    errors.push(`Tanggal Efektif (B1) tidak valid. Gunakan format yyyy-mm-dd. Diterima: "${effectiveDateRaw}"`);
  }

  // Row 2 must be headers
  const headerRow = data[2] || [];
  for (let i = 0; i < HEADERS.length; i++) {
    if (String(headerRow[i] || '').trim() !== HEADERS[i]) {
      errors.push(`Header kolom ${i + 1} tidak sesuai. Harus: "${HEADERS[i]}". Dapat: "${headerRow[i] || '(kosong)'}"`);
    }
  }

  if (errors.length > 0) {
    return { effectiveDate: '', updates: [], errors };
  }

  // Row 3+ are data rows
  for (let i = 3; i < data.length; i++) {
    const row = data[i] || [];
    const rowNumber = i + 1;
    const ruteId = String(row[0] || '').trim();
    const namaRute = String(row[1] || '').trim();
    const tarifLama = Number(row[2] || 0);
    const tarifBaruRaw = row[3];

    if (!ruteId) continue; // empty row — skip silently

    if (tarifBaruRaw === '' || tarifBaruRaw === null || tarifBaruRaw === undefined) {
      continue; // no change for this rute
    }

    const tarifBaru = Number(tarifBaruRaw);
    if (Number.isNaN(tarifBaru)) {
      errors.push(`Baris ${rowNumber} (${ruteId}): Tarif Baru harus berupa angka. Dapat: "${tarifBaruRaw}"`);
      continue;
    }
    if (tarifBaru < 0) {
      errors.push(`Baris ${rowNumber} (${ruteId}): Tarif Baru tidak boleh negatif.`);
      continue;
    }
    if (tarifBaru === tarifLama) {
      continue; // no-op
    }

    updates.push({ ruteId, namaRute, tarifLama, tarifBaru });
  }

  return { effectiveDate, updates, errors };
}

/**
 * Validate that all ruteIds in updates exist in ruteList.
 * Returns array of error strings (empty = all good).
 */
export function validateRuteIds(updates, ruteList) {
  const known = new Set((ruteList || []).map((r) => String(r.id)));
  const errors = [];
  updates.forEach((u) => {
    if (!known.has(String(u.ruteId))) {
      errors.push(`Rute tidak ditemukan: "${u.ruteId}" (${u.namaRute || ''})`);
    }
  });
  return errors;
}
