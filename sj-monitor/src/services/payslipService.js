import { db } from "../config/firebase-config";
import {
  collection,
  query,
  where,
  getDocs,
  writeBatch,
  doc,
} from "firebase/firestore";
import {
  getPayslipPeriod,
  filterDeliveriesByPeriod,
  calculateDriverPayslip,
} from "../utils/payslipHelpers";

export async function fetchAllDrivers() {
  // Fetch drivers from supir (master data) collection
  // Normalize data to match useMasterData pattern
  const snapshot = await getDocs(collection(db, "supir"));
  return snapshot.docs
    .map((doc) => {
      const data = doc.data() || {};
      const id = data.id || doc.id;
      return { ...data, id, isActive: data.isActive !== false };
    })
    .filter((x) => x?.isActive !== false && !x?.deletedAt);
}

export async function fetchAllRute() {
  const snapshot = await getDocs(collection(db, "rute"));
  const ruteData = {};
  snapshot.docs.forEach((doc) => {
    ruteData[doc.id] = doc.data();
  });
  return ruteData;
}

export async function fetchAllSJ() {
  const snapshot = await getDocs(collection(db, "surat_jalan"));
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
}

export async function getPayslipData(startDateOrCurrentDate = new Date(), explicitEndDate = null) {
  let startDate, endDate, periodLabel;

  if (explicitEndDate) {
    // Explicit date range provided
    startDate = startDateOrCurrentDate;
    endDate = explicitEndDate;
    const fmt = (d) => d.toLocaleDateString("id-ID");
    periodLabel = `${fmt(startDate)} hingga ${fmt(endDate)}`;
  } else {
    // Auto-calculate period based on reference date
    const period = getPayslipPeriod(startDateOrCurrentDate);
    startDate = period.startDate;
    endDate = period.endDate;
    periodLabel = period.periodLabel;
  }

  const [drivers, ruteData, allSJ] = await Promise.all([
    fetchAllDrivers(),
    fetchAllRute(),
    fetchAllSJ(),
  ]);

  const payslipsByDriver = {};

  drivers.forEach((driver) => {
    const driverDeliveries = filterDeliveriesByPeriod(
      allSJ,
      driver.id,
      startDate,
      endDate
    );

    payslipsByDriver[driver.id] = {
      driver,
      deliveries: driverDeliveries,
      summary: calculateDriverPayslip(driverDeliveries, ruteData),
      periodLabel,
      startDate,
      endDate,
    };
  });

  return payslipsByDriver;
}

export async function savePayslipBonusAdjustments(adjustments) {
  // adjustments = { [sjId]: bonusAmount }
  const batch = writeBatch(db);

  Object.entries(adjustments).forEach(([sjId, bonusAmount]) => {
    const sjRef = doc(db, "surat_jalan", sjId);
    batch.update(sjRef, {
      bonusAdjustment: bonusAmount || 0,
    });
  });

  await batch.commit();
}
