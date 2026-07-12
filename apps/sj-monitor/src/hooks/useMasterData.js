// src/hooks/useMasterData.js
import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase-config.js';

export const useMasterData = () => {
  const [truckList, setTruckList] = useState([]);
  const [supirList, setSupirList] = useState([]);
  const [ruteList, setRuteList] = useState([]);
  const [materialList, setMaterialList] = useState([]);
  const [tarifRuteList, setTarifRuteList] = useState([]);

  // Varian tak-terfilter (termasuk item non-aktif) — khusus untuk halaman Master Data
  // (superadmin-only) agar item yang di-nonaktifkan tetap terlihat untuk direview/diaktifkan lagi.
  // Semua konsumen lain (dropdown SJ, dsb.) tetap pakai list di atas yang sudah difilter aktif-saja.
  const [truckListAll, setTruckListAll] = useState([]);
  const [supirListAll, setSupirListAll] = useState([]);
  const [ruteListAll, setRuteListAll] = useState([]);
  const [materialListAll, setMaterialListAll] = useState([]);

  useEffect(() => {
    const normalizeItem = (d) => {
      const row = d.data() || {};
      const id = row.id || d.id;
      return { ...row, id, isActive: row.isActive !== false };
    };
    const activeOnly = (x) => x?.isActive !== false && !x?.deletedAt;

    const onErr = (label) => (err) =>
      console.warn(`[useMasterData] ${label} subscription error:`, err);
    const unsubTrucks = onSnapshot(collection(db, 'trucks'), (snap) => {
      const all = snap.docs.map(normalizeItem);
      setTruckList(all.filter(activeOnly));
      setTruckListAll(all);
    }, onErr('trucks'));
    const unsubSupir = onSnapshot(collection(db, 'supir'), (snap) => {
      const all = snap.docs.map(normalizeItem);
      setSupirList(all.filter(activeOnly));
      setSupirListAll(all);
    }, onErr('supir'));
    const unsubRute = onSnapshot(collection(db, 'rute'), (snap) => {
      const all = snap.docs.map(normalizeItem);
      setRuteList(all.filter(activeOnly));
      setRuteListAll(all);
    }, onErr('rute'));
    const unsubMaterial = onSnapshot(collection(db, 'material'), (snap) => {
      const all = snap.docs.map(normalizeItem);
      setMaterialList(all.filter(activeOnly));
      setMaterialListAll(all);
    }, onErr('material'));
    const unsubTarif = onSnapshot(collection(db, 'tarif_rute'), (snap) => {
      setTarifRuteList(snap.docs.map(normalizeItem).filter(activeOnly));
    }, onErr('tarif_rute'));

    return () => {
      try { unsubTrucks(); } catch { /* ignore unsubscribe error */ }
      try { unsubSupir(); } catch { /* ignore unsubscribe error */ }
      try { unsubRute(); } catch { /* ignore unsubscribe error */ }
      try { unsubMaterial(); } catch { /* ignore unsubscribe error */ }
      try { unsubTarif(); } catch { /* ignore unsubscribe error */ }
    };
  }, []);

  return {
    truckList, setTruckList,
    supirList, setSupirList,
    ruteList, setRuteList,
    materialList, setMaterialList,
    tarifRuteList, setTarifRuteList,
    truckListAll, supirListAll, ruteListAll, materialListAll,
  };
};
