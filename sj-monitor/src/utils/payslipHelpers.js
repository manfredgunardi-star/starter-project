// Penalty constant - IDR per 1 unit quantity loss
const PENALTY_PER_POINT = 500000;

/**
 * Get the payslip period based on current or specified date
 * Period: 26th of previous month to 25th of current month
 * @param {Date} currentDate - Reference date (defaults to today)
 * @returns {Object} { startDate, endDate, periodLabel }
 */
export function getPayslipPeriod(currentDate = new Date()) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // If current date is before 26th, period is from previous month 26th to this month 25th
  // If current date is 26th or after, period is from this month 26th to next month 25th
  let startDate, endDate;

  if (currentDate.getDate() < 26) {
    // Period started last month
    const prevMonth = new Date(year, month - 1, 26);
    startDate = prevMonth;
    endDate = new Date(year, month, 25);
  } else {
    // Period started this month
    startDate = new Date(year, month, 26);
    endDate = new Date(year, month + 1, 25);
  }

  const periodLabel = `${startDate.getDate()} ${getMonthName(startDate.getMonth())} ${startDate.getFullYear()} - ${endDate.getDate()} ${getMonthName(endDate.getMonth())} ${endDate.getFullYear()}`;

  return { startDate, endDate, periodLabel };
}

/**
 * Calculate total salary for a driver based on deliveries in the payslip period
 * Salary = sum of (uangJalan + ritasi - penalties) for all successful deliveries
 */
export function calculateDriverPayslip(deliveries, ruteData) {
  let totalUangJalan = 0;
  let totalRitasi = 0;
  let totalPenalty = 0;
  let successfulDeliveries = 0;
  // Collect non-fatal warnings so the UI / caller can flag suspicious zero-pay
  // entries without breaking the calculation.
  const warnings = [];

  deliveries.forEach((sj) => {
    if (sj.status?.toLowerCase() === "terkirim") {
      successfulDeliveries++;
      const rute = ruteData?.[sj.ruteId] || ruteData?.[sj.rute];
      if (!rute) {
        const msg = `[payslip] rute tidak ditemukan untuk SJ ${sj.id || sj.nomorSJ || '?'} (ruteId=${sj.ruteId ?? sj.rute ?? '?'})`;
        console.warn(msg);
        warnings.push(msg);
      }

      // Add uang jalan — prefer snapshot on SJ (set at creation time / backfilled by tarif feature)
      // Fall back to live rute master for legacy SJ that pre-date the snapshot feature.
      const sjUangJalan = sj?.uangJalan;
      const resolvedUangJalan =
        (typeof sjUangJalan === 'number' ? sjUangJalan : null) ??
        (typeof rute?.uangJalan === 'number' ? rute.uangJalan : 0);
      if (resolvedUangJalan === 0) {
        const msg = `[payslip] uangJalan=0 untuk SJ ${sj.id || sj.nomorSJ || '?'}`;
        console.warn(msg);
        warnings.push(msg);
      }
      totalUangJalan += resolvedUangJalan;

      // Add ritasi
      totalRitasi += typeof rute?.ritasi === 'number' ? rute.ritasi : 0;

      // Calculate penalty if not abolished: each full 1 M3/ton lost = 500,000
      if (!sj.abolishPenalty && sj.quantityLoss && sj.quantityLoss >= 1) {
        const penaltyUnits = Math.floor(sj.quantityLoss);
        totalPenalty += penaltyUnits * PENALTY_PER_POINT;
      }
    }
  });

  const grossSalary = totalUangJalan + totalRitasi - totalPenalty;

  return {
    successfulDeliveries,
    totalUangJalan,
    totalRitasi,
    totalPenalty,
    grossSalary,
    bonusAdjustments: 0,
    netSalary: grossSalary,
    warnings,
  };
}

/**
 * Calculate penalty for a single Surat Jalan
 * Penalty = (quantityLoss - 1) * PENALTY_PER_POINT if quantityLoss > 1 and not abolished
 */
export function calculateSJPenalty(quantityLoss, abolishPenalty = false) {
  if (abolishPenalty || !quantityLoss || quantityLoss < 1) {
    return 0;
  }
  const penaltyUnits = Math.floor(quantityLoss);
  return penaltyUnits * PENALTY_PER_POINT;
}

/**
 * Filter deliveries for a driver within the payslip period
 */
export function filterDeliveriesByPeriod(deliveries, driverId, startDate, endDate) {
  if (!Array.isArray(deliveries) || !(startDate instanceof Date) || !(endDate instanceof Date)) {
    return [];
  }

  const endOfDay = new Date(endDate);
  endOfDay.setHours(23, 59, 59, 999);

  return deliveries.filter((sj) => {
    if (sj.supirId !== driverId) return false;

    const sjDate = new Date(sj.tanggalSJ);
    return sjDate >= startDate && sjDate <= endOfDay;
  });
}

/**
 * Get human-readable month name
 */
function getMonthName(monthIndex) {
  const months = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ];
  return months[monthIndex];
}

/**
 * Format currency in IDR
 */
export function formatCurrency(amount) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format date to dd/MM/yyyy
 */
export function formatDate(date) {
  if (!date) return "-";
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}
