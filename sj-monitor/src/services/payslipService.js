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
  const q = query(collection(db, "users"), where("role", "==", "driver"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
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

export async function getPayslipData(currentDate = new Date()) {
  const { startDate, endDate, periodLabel } = getPayslipPeriod(currentDate);

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
