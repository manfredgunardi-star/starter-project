// src/hooks/useMasterData.js
import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase-config.js';

export const useMasterData = () => {
  const [truckList, setTruckList] = useState([]);
  const [supirList, setSupirList] = useState([]);
  const [ruteList, setRuteList] = useState([]);
  const [materialList, setMaterialList] = useState([]);

  useEffect(() => {
    const normalizeItem = (d) => {
      const row = d.data() || {};
      const id = row.id || d.id;
      return { ...row, id, isActive: row.isActive !== false };
    };
    const activeOnly = (x) => x?.isActive !== false && !x?.deletedAt;

    const unsubTrucks = onSnapshot(collection(db, 'trucks'), (snap) => {
      setTruckList(snap.docs.map(normalizeItem).filter(activeOnly));
    });
    const unsubSupir = onSnapshot(collection(db, 'supir'), (snap) => {
      setSupirList(snap.docs.map(normalizeItem).filter(activeOnly));
    });
    const unsubRute = onSnapshot(collection(db, 'rute'), (snap) => {
      setRuteList(snap.docs.map(normalizeItem).filter(activeOnly));
    });
    const unsubMaterial = onSnapshot(collection(db, 'material'), (snap) => {
      setMaterialList(snap.docs.map(normalizeItem).filter(activeOnly));
    });

    return () => {
      try { unsubTrucks(); } catch {}
      try { unsubSupir(); } catch {}
      try { unsubRute(); } catch {}
      try { unsubMaterial(); } catch {}
    };
  }, []);

  return { truckList, setTruckList, supirList, setSupirList, ruteList, setRuteList, materialList, setMaterialList };
};
