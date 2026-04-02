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

  deliveries.forEach((sj) => {
    if (sj.status === "selesai") {
      successfulDeliveries++;
      const rute = ruteData[sj.rute];

      // Add uang jalan
      totalUangJalan += rute?.uangJalan || 0;

      // Add ritasi
      totalRitasi += rute?.ritasi || 0;

      // Calculate penalty if not abolished
      if (!sj.abolishPenalty && sj.quantityLoss && sj.quantityLoss > 1) {
        const penaltyPoints = sj.quantityLoss - 1;
        totalPenalty += penaltyPoints * PENALTY_PER_POINT;
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
  };
}

/**
 * Calculate penalty for a single Surat Jalan
 * Penalty = (quantityLoss - 1) * PENALTY_PER_POINT if quantityLoss > 1 and not abolished
 */
export function calculateSJPenalty(quantityLoss, abolishPenalty = false) {
  if (abolishPenalty || !quantityLoss || quantityLoss <= 1) {
    return 0;
  }
  const penaltyPoints = quantityLoss - 1;
  return penaltyPoints * PENALTY_PER_POINT;
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
    if (sj.supir !== driverId) return false;

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
