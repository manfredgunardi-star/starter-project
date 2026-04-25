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
    const data = doc.data();
    // Index by both doc.id and data.id to handle both cases
    ruteData[doc.id] = data;
    if (data.id && data.id !== doc.id) {
      ruteData[data.id] = data;
    }
  });
  return ruteData;
}

export async function fetchAllSJ() {
  const snapshot = await getDocs(
    query(collection(db, "surat_jalan"), where("isActive", "!=", false))
  );
  return snapshot.docs
    .map((doc) => {
      const data = doc.data();
      const sj = { id: doc.id, ...data };
      // Compute quantityLoss on-the-fly for imported SJ records that don't have it
      if ((sj.quantityLoss === undefined || sj.quantityLoss === null) && sj.qtyIsi && sj.qtyBongkar) {
        sj.quantityLoss = Math.max(0, sj.qtyIsi - sj.qtyBongkar);
      }
      return sj;
    })
    .filter((sj) => !sj.deletedAt);
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

    // Enrich each delivery with ritasi from route lookup
    // (ritasi is not stored in SJ documents, only in rute)
    const enrichedDeliveries = driverDeliveries.map((sj) => {
      const rute = ruteData[sj.ruteId] || ruteData[sj.rute];
      return { ...sj, ritasi: rute?.ritasi || 0 };
    });

    payslipsByDriver[driver.id] = {
      driver,
      deliveries: enrichedDeliveries,
      summary: calculateDriverPayslip(enrichedDeliveries, ruteData),
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
