// src/utils/truckReportHelpers.js

/**
 * Groups Surat Jalan data by truck (nomorPolisi) for a specific date.
 * Filters out deleted/inactive records.
 *
 * @param {Array} suratJalanList - Array of SJ objects with tanggalSJ, nomorPolisi, namaSupir, isActive, deletedAt
 * @param {string} isoDate - ISO date string (YYYY-MM-DD format) to filter by
 * @returns {Object} Object where keys are nomorPolisi and values are {nomorPolisi, namaSupir, sjList}
 */
export const groupSJByTruck = (suratJalanList, isoDate) => {
  // Handle invalid inputs
  if (!Array.isArray(suratJalanList)) {
    return {};
  }

  if (!isoDate || typeof isoDate !== 'string') {
    return {};
  }

  const result = {};

  suratJalanList.forEach((sj) => {
    if (!sj) return;

    // Skip deleted/inactive records
    if (sj.isActive === false || sj.deletedAt) {
      return;
    }

    // Match by ISO date (handle timestamps by splitting on 'T')
    const sjDate = sj.tanggalSJ ? String(sj.tanggalSJ).split('T')[0] : '';
    if (sjDate !== isoDate) {
      return;
    }

    const nomorPolisi = sj.nomorPolisi;
    const namaSupir = sj.namaSupir;

    if (!nomorPolisi) {
      return;
    }

    // Initialize truck group if not exists
    if (!result[nomorPolisi]) {
      result[nomorPolisi] = {
        nomorPolisi,
        namaSupir: namaSupir || '',
        sjList: [],
      };
    }

    // Add SJ to the truck's list
    result[nomorPolisi].sjList.push(sj);
  });

  return result;
};

/**
 * Gets all unique trucks from the entire SJ list.
 * Filters out deleted/inactive records and duplicates.
 *
 * @param {Array} suratJalanList - Array of SJ objects
 * @returns {Array} Sorted array of {nomorPolisi, namaSupir} objects, alphabetically by nomorPolisi
 */
export const getUniqueTrucks = (suratJalanList) => {
  // Handle invalid inputs
  if (!Array.isArray(suratJalanList)) {
    return [];
  }

  const truckMap = new Map();

  suratJalanList.forEach((sj) => {
    if (!sj) return;

    // Skip deleted/inactive records
    if (sj.isActive === false || sj.deletedAt) {
      return;
    }

    const nomorPolisi = sj.nomorPolisi;
    const namaSupir = sj.namaSupir;

    if (!nomorPolisi) {
      return;
    }

    // Use Map to avoid duplicates (by nomorPolisi)
    if (!truckMap.has(nomorPolisi)) {
      truckMap.set(nomorPolisi, {
        nomorPolisi,
        namaSupir: namaSupir || '',
      });
    }
  });

  // Convert to array and sort alphabetically by nomorPolisi
  return Array.from(truckMap.values()).sort((a, b) =>
    a.nomorPolisi.localeCompare(b.nomorPolisi)
  );
};

/**
 * Identifies trucks from the allTrucks list that have no activity on the given date.
 *
 * @param {Array} allTrucks - Array of {nomorPolisi, namaSupir} objects (typically from getUniqueTrucks)
 * @param {Array} suratJalanList - Array of SJ objects
 * @param {string} isoDate - ISO date string (YYYY-MM-DD format)
 * @returns {Array} Sorted array of {nomorPolisi, namaSupir} objects with no activity on isoDate
 */
export const getInactiveTrucks = (allTrucks, suratJalanList, isoDate) => {
  // Handle invalid inputs
  if (!Array.isArray(allTrucks)) {
    return [];
  }

  // Get trucks active on the given date
  const activeTrucksOnDate = groupSJByTruck(suratJalanList, isoDate);
  const activeTruckPlates = new Set(Object.keys(activeTrucksOnDate));

  // Filter to find inactive trucks
  const inactiveTrucks = allTrucks.filter((truck) => {
    if (!truck || !truck.nomorPolisi) {
      return false;
    }
    return !activeTruckPlates.has(truck.nomorPolisi);
  });

  // Sort alphabetically by nomorPolisi
  return inactiveTrucks.sort((a, b) =>
    a.nomorPolisi.localeCompare(b.nomorPolisi)
  );
};

/**
 * Formats an ISO date string to locale format (id-ID).
 * Returns '—' if invalid or null.
 *
 * @param {string} isoDateStr - ISO date string (e.g., "2026-04-02")
 * @returns {string} Formatted date string (e.g., "02/04/2026") or '—' if invalid
 */
export const formatReportDate = (isoDateStr) => {
  try {
    if (!isoDateStr) {
      return '—';
    }

    // Parse ISO date string
    const dateObj = new Date(isoDateStr);

    // Check if date is valid
    if (isNaN(dateObj.getTime())) {
      return '—';
    }

    // Format to locale (id-ID produces DD/MM/YYYY)
    const formatted = dateObj.toLocaleDateString('id-ID');
    return formatted;
  } catch (e) {
    return '—';
  }
};
