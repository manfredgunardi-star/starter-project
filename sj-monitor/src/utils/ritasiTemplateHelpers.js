/**
 * Generate Excel template with all routes
 * Returns array of arrays suitable for XLSX
 */
export function generateRitasiTemplate(ruteList) {
  const headers = ['ID Rute', 'Nama Rute', 'Asal', 'Tujuan', 'Uang Jalan', 'Ritasi Saat Ini', 'Ritasi Baru'];
  const data = ruteList.map(rute => [
    rute.id,
    rute.nama,
    rute.asal,
    rute.tujuan,
    rute.uangJalan || 0,
    rute.ritasi || 0,
    rute.ritasi || 0, // Default to current value
  ]);

  return [headers, ...data];
}

/**
 * Validate uploaded template
 * Checks: required columns, data types, values are non-negative
 * Returns: { isValid: boolean, errors: string[] }
 */
export function validateRitasiTemplate(data) {
  const errors = [];

  if (!data || data.length < 2) {
    errors.push('File kosong atau tidak memiliki data');
    return { isValid: false, errors };
  }

  const headers = data[0];
  const expectedHeaders = ['ID Rute', 'Nama Rute', 'Asal', 'Tujuan', 'Uang Jalan', 'Ritasi Saat Ini', 'Ritasi Baru'];

  // Check headers
  if (JSON.stringify(headers) !== JSON.stringify(expectedHeaders)) {
    errors.push('Header kolom tidak sesuai. Pastikan menggunakan template yang benar.');
    return { isValid: false, errors };
  }

  // Validate rows
  data.slice(1).forEach((row, index) => {
    const rowNumber = index + 2; // +2 because data includes header and is 0-indexed

    // Check ID Rute exists
    if (!row[0] || row[0].toString().trim() === '') {
      errors.push(`Baris ${rowNumber}: ID Rute tidak boleh kosong`);
    }

    // Check Ritasi Baru is a valid number
    const ritasiValue = row[6];
    if (ritasiValue === null || ritasiValue === undefined || ritasiValue === '') {
      errors.push(`Baris ${rowNumber}: Ritasi Baru tidak boleh kosong`);
    } else if (isNaN(ritasiValue)) {
      errors.push(`Baris ${rowNumber}: Ritasi Baru harus berupa angka`);
    } else if (Number(ritasiValue) < 0) {
      errors.push(`Baris ${rowNumber}: Ritasi Baru tidak boleh negatif`);
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Parse template data into update object
 * Returns object: { [ruteId]: newRitasiValue }
 */
export function parseRitasiUpdates(data) {
  const updates = {};

  // Skip header row (index 0)
  data.slice(1).forEach(row => {
    const ruteId = row[0].toString().trim();
    const ritasiValue = parseInt(row[6]) || 0;

    if (ruteId) {
      updates[ruteId] = ritasiValue;
    }
  });

  return updates;
}
