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
      setTruckList(snap.docs.map(normalizeItem).filter(activeOnly));
    }, onErr('trucks'));
    const unsubSupir = onSnapshot(collection(db, 'supir'), (snap) => {
      setSupirList(snap.docs.map(normalizeItem).filter(activeOnly));
    }, onErr('supir'));
    const unsubRute = onSnapshot(collection(db, 'rute'), (snap) => {
      setRuteList(snap.docs.map(normalizeItem).filter(activeOnly));
    }, onErr('rute'));
    const unsubMaterial = onSnapshot(collection(db, 'material'), (snap) => {
      setMaterialList(snap.docs.map(normalizeItem).filter(activeOnly));
    }, onErr('material'));
    const unsubTarif = onSnapshot(collection(db, 'tarif_rute'), (snap) => {
      setTarifRuteList(snap.docs.map(normalizeItem).filter(activeOnly));
    }, onErr('tarif_rute'));

    return () => {
      try { unsubTrucks(); } catch {}
      try { unsubSupir(); } catch {}
      try { unsubRute(); } catch {}
      try { unsubMaterial(); } catch {}
      try { unsubTarif(); } catch {}
    };
  }, []);

  return {
    truckList, setTruckList,
    supirList, setSupirList,
    ruteList, setRuteList,
    materialList, setMaterialList,
    tarifRuteList, setTarifRuteList,
  };
};
