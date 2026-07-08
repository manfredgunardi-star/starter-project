import {collection, doc, writeBatch, onSnapshot, getDoc, getDocFromServer, setDoc, updateDoc, getDocs, query, where, limit, orderBy, startAfter} from "firebase/firestore";
import { db, auth, ensureAuthed, authUserCreator } from "./config/firebase-config";
import {
  kirimUangJalanKeAccounting,
  kirimInvoiceKeAccounting,
  kirimTransaksiKasKeAccounting,
  fetchAccountingMasterData,
  subscribeIntegrationQueueUpdates,
  isBridgeReady,
} from "./integrationService.js";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword } from "firebase/auth";
import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import StatCard from './components/StatCard.jsx';
import UsersManagement from './components/UsersManagement.jsx';
import SettingsManagement from './components/SettingsManagement.jsx';
import LoginScreen from './components/LoginScreen.jsx';
import { buildUangJalanTransaksiId, generateSessionId, formatCurrency, downloadSJRecapToExcel, sanitizeForFirestore } from './utils/formatters.js';
import MasterDataManagement from './components/MasterDataManagement.jsx';
import LaporanKas from './components/LaporanKas.jsx';
import KeuanganManagement from './components/KeuanganManagement.jsx';
import InvoiceManagement from './components/InvoiceManagement.jsx';
import SuratJalanCard from './components/SuratJalanCard.jsx';
import Modal from './components/Modal.jsx';
import { C, softDeleteItemInFirestore, resolveSuratJalanDocRef, softDeactivateTransaksiInFirestore, deactivateUangJalanTransaksiForSJ, upsertItemToFirestore, chunkedBatchWrite } from './services/firestoreWrites.js';



import { AlertCircle, Package, Truck, FileText, Users, LogOut, Plus, Edit, Trash2, CheckCircle, XCircle, Clock, Download, Send, Lock } from 'lucide-react';



// Runs `worker` over `items` with at most `limit` in flight at once.
// Used to parallelize bulk Firestore round-trips without opening hundreds of
// simultaneous connections (which is what an unbounded Promise.all would do).
async function runWithConcurrencyLimit(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function runNext() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }
  const poolSize = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: poolSize }, runNext));
  return results;
}

const HISTORY_LOG_PAGE_SIZE = 300;

const SuratJalanMonitor = () => {
  const [currentUser, setCurrentUser] = useState(null);
  const effectiveRole = currentUser?.role === 'owner' ? 'reader' : currentUser?.role;
  const canWriteTransaksi = effectiveRole === 'superadmin' || effectiveRole === 'admin_keuangan';

  const [firebaseUser, setFirebaseUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [suratJalanList, setSuratJalanList] = useState([]);
  // SJ berstatus 'gagal' ditandai isActive:false sehingga dibuang dari suratJalanList
  // (agar tidak muncul di Keuangan/Laporan Kas). Kita simpan terpisah supaya tetap bisa
  // ditampilkan di tab "Gagal" — satu-satunya jalur agar superadmin dapat me-restore.
  const [gagalSuratJalanList, setGagalSuratJalanList] = useState([]);
  const [biayaList, setBiayaList] = useState([]);
  const [transaksiList, setTransaksiList] = useState([]);
  const [historyLog, setHistoryLog] = useState([]);
  const [historyLogHasMore, setHistoryLogHasMore] = useState(false);
  const [historyLogLoadingMore, setHistoryLogLoadingMore] = useState(false);
  const historyLogCursorRef = useRef(null);
  const [invoiceList, setInvoiceList] = useState([]);
  const [appSettings, setAppSettings] = useState({
    companyName: '',
    logoUrl: '',
    loginFooterText: 'Masuk untuk mengakses dashboard monitoring'
  });
  const [usersList, setUsersList] = useState([]);
  const [truckList, setTruckList] = useState([]);
  const [supirList, setSupirList] = useState([]);
  const [ruteList, setRuteList] = useState([]);
  const [materialList, setMaterialList] = useState([]);
  const [pelangganList, setPelangganList] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [filter, setFilter] = useState('all');
  const [showSJRecapPanel, setShowSJRecapPanel] = useState(false);
  const [sjRecapDateField, setSjRecapDateField] = useState('tanggalSJ');
  const [sjRecapStartDate, setSjRecapStartDate] = useState('');
  const [sjRecapEndDate, setSjRecapEndDate] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const didFirstLoadRef = useRef(false);
  const [activeTab, setActiveTab] = useState('surat-jalan');
  const [alertMessage, setAlertMessage] = useState('');
  const [confirmDialog, setConfirmDialog] = useState({ show: false, message: '', onConfirm: null, confirmLabel: 'Hapus', confirmVariant: 'danger' });

  // Enforce only one active session per account (if the same account logs in elsewhere, this client logs out)
  const activeSessionIdRef = useRef(null);

  // === AUTH + RBAC (Spark plan, tanpa Cloud Functions) ===
  // Role source-of-truth: Firestore doc users/{uid}.role
  // Bootstrap: saat user pertama login, jika doc users/{uid} belum ada, app akan membuat doc dengan role 'reader'.
  useEffect(() => {
    let unsubUser = null;

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      // cleanup previous user snapshot
      if (typeof unsubUser === "function") {
        try { unsubUser(); } catch (_) {}
        unsubUser = null;
      }

      setFirebaseUser(user || null);

      if (!user) {
        setCurrentUser(null);
        activeSessionIdRef.current = null;
        setAuthReady(true);
        setIsLoading(false);
        return;
      }

      try {
        const userRef = doc(db, C("users"), user.uid);
        const snap = await getDoc(userRef);

        if (!snap.exists()) {
          const email = user.email || "";
          const username = email.includes("@") ? email.split("@")[0] : (user.displayName || "user");

          // Bootstrap role:
          // - Jika ini user pertama di BUL-monitor (bul_users masih kosong) => superadmin
          // - Selain itu => reader (superadmin bisa promote via menu user)
          const anyUserSnap = await getDocs(query(collection(db, C("users")), limit(1)));
          const bootstrapRole = anyUserSnap.empty ? "superadmin" : "reader";

          await setDoc(
            userRef,
            {
              username,
              name: user.displayName || username,
              email,
              role: bootstrapRole,
              isActive: true,
              createdAt: new Date().toISOString(),
              createdBy: "self-bootstrap",
            },
            { merge: true }
          );
        }

        // Create/update active session id (used to force-logout older sessions for same account)
        const sessionId = generateSessionId();
        activeSessionIdRef.current = sessionId;
        await setDoc(
          userRef,
          {
            activeSessionId: sessionId,
            activeSessionAt: new Date().toISOString(),
            activeSessionUA: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
          },
          { merge: true }
        );

        // Subscribe realtime ke doc user untuk perubahan role/isActive
        unsubUser = onSnapshot(doc(db, C("users"), user.uid), (d) => {
          const data = d.data() || {};

          // If this account is logged in somewhere else, end this session
          const activeId = data.activeSessionId;
          if (activeId && activeSessionIdRef.current && activeId !== activeSessionIdRef.current) {
            setAlertMessage("Sesi Anda berakhir karena akun ini login di perangkat lain.");
            activeSessionIdRef.current = null;
            signOut(auth).catch(() => {});
            return;
          }

          if (data.isActive === false) {
            setAlertMessage("Akun Anda dinonaktifkan. Hubungi administrator.");
            signOut(auth).catch(() => {});
            return;
          }

          setCurrentUser({
            id: user.uid,
            username: data.username || (user.email ? user.email.split("@")[0] : ""),
            name: data.name || user.displayName || data.username || "User",
            role: data.role || "reader",
            email: user.email || data.email || "",
            isActive: data.isActive !== false,
          });
        });

        setAlertMessage("");
        setAuthReady(true);
        setIsLoading(false);
      } catch (err) {
        console.error("Auth bootstrap error:", err);
        setAlertMessage(`Auth error: ${err?.message || "Unknown error"}`);
        setCurrentUser(null);
        setAuthReady(true);
        setIsLoading(false);
      }
    });

    return () => {
      try { if (typeof unsubUser === "function") unsubUser(); } catch (_) {}
      unsubAuth();
    };
  }, []);



  // Data loading: source of truth dari Firestore (lihat useEffect subscription di bawah)

// History Log Helper
  // Field `isActive` pada history_log dipakai untuk mencerminkan status aktif entity yang dicatat
  // (mis. SJ yang dibatalkan -> isActive=false) agar audit konsisten.
  const addHistoryLog = async (action, suratJalanId, suratJalanNo, details = {}, entityIsActive = true) => {
    const newLog = {
      id: 'LOG-' + Date.now(),
      action, // 'mark_gagal', 'restore_from_gagal', 'mark_terkirim', 'create_invoice', etc
      suratJalanId,
      suratJalanNo,
      details, // Additional info
      timestamp: new Date().toISOString(),
      user: currentUser.name,
      userRole: currentUser.role
    };
    
    const newHistoryLog = [...historyLog, newLog];
    setHistoryLog(newHistoryLog);
    await upsertItemToFirestore(db, C("history_log"), { ...newLog, isActive: entityIsActive !== false });
  };

  const saveData = async () => true;

  const handleLogin = async (username, password) => {
    try {
      const u = (username || "").trim();
      const p = (password || "").trim();
      if (!u || !p) {
        setAlertMessage("Username/Email dan Password wajib diisi.");
        return;
      }

      // Bisa input email langsung, atau username -> username@bul.local
      // Praktik: buat akun di Firebase Auth dengan email: <username>@bul.local
      const email = u.includes("@") ? u : `${u}@bul.local`;

      await signInWithEmailAndPassword(auth, email, p);
      setAlertMessage("");
    } catch (err) {
      console.error("Login error:", err);
      const code = err?.code || "";
      if (code.includes("auth/invalid-credential") || code.includes("auth/wrong-password")) {
        setAlertMessage("Login gagal: password salah / akun tidak ditemukan.");
      } else if (code.includes("auth/user-disabled")) {
        setAlertMessage("Login gagal: akun dinonaktifkan.");
      } else {
        setAlertMessage(`Login gagal: ${err?.message || "Unknown error"}`);
      }
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Logout error:", err);
    } finally {
      setCurrentUser(null);
      setFirebaseUser(null);
    }
  };

  const addUser = async (data) => {
    const username = (data.username || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    const name = (data.name || '').trim();
    const role = data.role || 'reader';
    const password = data.password || '';

    if (!username) {
      setAlertMessage('❌ Username tidak valid. Gunakan huruf kecil, angka, atau underscore saja.');
      return false;
    }
    if (password.length < 6) {
      setAlertMessage('❌ Password minimal 6 karakter.');
      return false;
    }

    // Cek duplikat username (client-side)
    const isDuplicate = usersList.some(
      u => !u.deletedAt && u.username?.toLowerCase() === username
    );
    if (isDuplicate) {
      setAlertMessage(`❌ Username "${username}" sudah digunakan.`);
      return false;
    }

    const email = `${username}@bul.local`;

    try {
      // Buat user di Firebase Auth via secondary app — tidak mempengaruhi main auth session
      const cred = await createUserWithEmailAndPassword(authUserCreator, email, password);
      const uid = cred.user.uid;

      // Sign out dari secondary app agar tidak ada sesi menggantung
      await signOut(authUserCreator).catch(() => {});

      // Tulis doc user ke Firestore bul_users/{uid}
      await setDoc(doc(db, C('users'), uid), {
        username,
        name,
        email,
        role,
        isActive: true,
        createdAt: new Date().toISOString(),
        createdBy: currentUser?.name || currentUser?.username || 'superadmin',
      });

      setAlertMessage(`✅ User "${name}" (${username}) berhasil dibuat dengan role ${role}.`);
      return true;
    } catch (e) {
      const code = e?.code || '';
      if (code === 'auth/email-already-in-use') {
        setAlertMessage(`❌ Username "${username}" sudah terdaftar di sistem. Pilih username lain.`);
      } else if (code === 'auth/weak-password') {
        setAlertMessage('❌ Password terlalu lemah. Gunakan minimal 6 karakter.');
      } else {
        setAlertMessage(`❌ Gagal membuat user: ${e?.message || 'Unknown error'}`);
      }
      return false;
    }
  };

const updateUser = async (id, updates) => {
    let updatedUser = null;

    const newList = usersList.map((u) => {
      if (u.id !== id) return u;
      updatedUser = {
        ...u,
        ...updates,
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser?.name || "system",
      };
      return updatedUser;
    });

    const sorted = [...newList].sort((a, b) => String(a?.username || "").localeCompare(String(b?.username || "")));
    setUsersList(sorted);
// Persist ke Firestore
    if (updatedUser) {
      try {
        await upsertItemToFirestore(db, "users", updatedUser);
      } catch (e) {
        console.error("updateUser -> Firestore failed", e);
        setAlertMessage("⚠️ Gagal update user ke Firebase. Perubahan tersimpan di cache lokal.");
      }
    }
  };

  const deleteUser = async (id) => {
    setConfirmDialog({
      show: true,
      message: "Yakin ingin menghapus user ini?",
      onConfirm: async () => {
        // Soft delete di Firestore (biar ada audit trail)
        try {
          await softDeleteItemInFirestore(db, "users", id, currentUser?.name || "system");
        } catch (e) {
          console.error("deleteUser -> Firestore failed", e);
          setAlertMessage("⚠️ Gagal menghapus user di Firebase. Perubahan tersimpan di cache lokal.");
        }

        // Hapus dari state/cache (doc akan ikut hilang dari UI via filter deletedAt)
        const newList = usersList.filter((u) => u.id !== id);
        setUsersList(newList);
setConfirmDialog({ show: false, message: "", onConfirm: null });
      },
    });
  };

  const toggleUserActive = async (id) => {
    const user = usersList.find((u) => u.id === id);
    if (user) {
      await updateUser(id, { isActive: !user.isActive });
    }
  };



  const upsertUangJalanTransaksiForSJ = async (sj, opts = {}) => {
    if (!sj) return;

    // SJ tidak aktif / gagal -> tidak boleh punya transaksi uang jalan aktif
    if (sj.isActive === false) return;
    const status = String(sj.status || "").toLowerCase();
    if (status === "gagal") return;

    const nominal = Number(sj.uangJalan || 0);
    if (!(nominal > 0)) return;

    const txId = buildUangJalanTransaksiId(sj.id);

    await addTransaksi({
      id: txId,
      tipe: "pengeluaran",
      nominal,
      keterangan: opts.keterangan || `Uang Jalan - ${sj.nomorSJ} (${sj.rute || ""})`,
      tanggal: opts.tanggal || sj.tanggalSJ || new Date().toISOString().slice(0, 10),
      suratJalanId: sj.id,
      pt: sj.pt || "",
      source: "auto_sj",
      isActive: true,
    });
  };
  const addTransaksi = async (data) => {
    // data bisa datang dari modal (tanpa id) atau dari auto-uang-jalan (dengan id deterministik)
    const nowIso = new Date().toISOString();
    const who = currentUser?.name || "system";

    const txId =
      (data && String(data.id || "").trim()) ||
      ("TRX-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9));

    const nominal = Number(data?.nominal || 0);

    const newTx = sanitizeForFirestore({
      id: txId,
      tipe: data?.tipe || "pengeluaran",
      nominal: isNaN(nominal) ? 0 : nominal,
      keterangan: data?.keterangan || "",
      tanggal: data?.tanggal || nowIso.slice(0, 10),
      pt: data?.pt || "",
      suratJalanId: data?.suratJalanId || null,
      source: data?.source || "manual",
      isActive: data?.isActive !== false,
      createdAt: data?.createdAt || nowIso,
      createdBy: data?.createdBy || who,
      updatedAt: nowIso,
      updatedBy: who,
    });

    // Optimistic UI: upsert by id
    setTransaksiList((prev) => {
      const exists = prev?.some((t) => String(t?.id) === String(txId));
      if (exists) {
        return prev.map((t) => (String(t?.id) === String(txId) ? { ...t, ...newTx } : t));
      }
      return [...(prev || []), newTx];
    });

    // Persist ke Firestore
    try {
      await upsertItemToFirestore(db, "transaksi", newTx);
    } catch (e) {
      console.error("addTransaksi -> Firestore failed", e);
      setAlertMessage("⚠️ Gagal menyimpan transaksi ke Firebase. Perubahan tersimpan di cache lokal.");
    }
  };


  const deleteTransaksi = async (id) => {
    setConfirmDialog({
      show: true,
      message: 'Yakin ingin menghapus transaksi ini?',
      onConfirm: async () => {
        // 1) Update local cache
        const newList = transaksiList.filter(item => item.id !== id);
        setTransaksiList(newList);
// 2) Soft delete in Firestore (so audit trail remains)
        try {
          await softDeleteItemInFirestore(db, "transaksi", id, currentUser?.name || "system");
        } catch (err) {
          console.error("[transaksi] Failed to soft delete in Firestore:", err);
        }

        setConfirmDialog({ show: false, message: '', onConfirm: null });
      }
    });
  };


  // Master Data Truck Functions
  const addTruck = async (data) => {
    const newTruck = {
      id: "TRK-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9),
      ...data,
      isActive: data?.isActive !== false,
      createdAt: new Date().toISOString(),
      createdBy: (currentUser?.name || currentUser?.username || 'User'),
    };

    // Optimistic UI
    setTruckList((prevList) => {
      const newList = [...prevList, newTruck];
return newList;
    });

    // Persist ke Firestore
    try {
      await upsertItemToFirestore(db, "trucks", newTruck);
    } catch (err) {
      console.error("[addTruck] Firestore error:", err);
      setTruckList((prevList) => prevList.filter((t) => t.id !== newTruck.id));
      setAlertMessage("⚠️ Gagal menyimpan Truck ke Firebase. Cek koneksi / Console (F12).");
    }
  };

  const updateTruck = async (id, updates) => {
    const payload = { id, ...updates, isActive: true, updatedAt: new Date().toISOString(), updatedBy: currentUser.name };

    setTruckList((prevList) => {
      const newList = prevList.map((t) => (t.id === id ? { ...t, ...payload } : t));
return newList;
    });

    try {
      await upsertItemToFirestore(db, "trucks", payload);
    } catch (err) {
      console.error("[updateTruck] Firestore error:", err);
      setAlertMessage("⚠️ Gagal update Truck ke Firebase. Cek koneksi / Console (F12).");
    }
  };

  const deleteTruck = async (id) => {
    setConfirmDialog({
      show: true,
      message: "Yakin ingin menghapus truck ini?",
      onConfirm: async () => {
        await softDeleteItemInFirestore(db, "trucks", id, currentUser?.name || "system").catch(() => {});

        setTruckList((prevList) => {
          const newList = prevList.filter((t) => t.id !== id);
return newList;
        });

        setConfirmDialog({ show: false, message: "", onConfirm: null });
      },
    });
  };

  // Master Data Supir Functions

  const addSupir = async (data) => {
    const newSupir = {
      id: 'SPR-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
      ...data,
      createdAt: new Date().toISOString(),
      createdBy: (currentUser?.name || currentUser?.username || 'User'),
      isActive: true
      };

    try {
      await upsertItemToFirestore(db, "supir", { ...newSupir, isActive: true });
      // onSnapshot handles state update automatically
    } catch (err) {
      console.error("[addSupir] Firestore error:", err);
      setAlertMessage("⚠️ Gagal menyimpan Supir ke Firebase. Cek koneksi / Console (F12).");
    }
};

  const updateSupir = async (id, updates) => {
    const payload = { id, ...updates, isActive: true, updatedAt: new Date().toISOString(), updatedBy: currentUser.name };
    setSupirList((prevList) =>
      prevList.map((s) => (s.id === id ? { ...s, ...payload } : s))
    );
    try {
      await upsertItemToFirestore(db, "supir", { ...payload, isActive: true });
    } catch (err) {
      console.error("[updateSupir] Firestore error:", err);
      setAlertMessage("⚠️ Gagal update Supir ke Firebase. Cek koneksi / Console (F12).");
    }
  };

  const deleteSupir = async (id) => {
    setConfirmDialog({
      show: true,
      message: "Yakin ingin menghapus supir ini?",
      onConfirm: async () => {
        try {
          await softDeleteItemInFirestore(db, "supir", id, currentUser?.name || "system").catch(() => {});
        } catch (err) {
          console.error("Error soft-deleting supir:", err);
        }

        setSupirList((prevList) => prevList.filter((s) => s.id !== id));
        setConfirmDialog({ show: false, message: "", onConfirm: null });
      },
    });
  };

  // Master Data Rute Functions
  const addRute = async (data) => {
    const newRute = {
      id: 'RUT-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
      ...data,
      createdAt: new Date().toISOString(),
      createdBy: (currentUser?.name || currentUser?.username || 'User'),
      isActive: true
      };

    try {
      await upsertItemToFirestore(db, "rute", { ...newRute, isActive: true });
      // onSnapshot handles state update automatically
    } catch (err) {
      console.error("[addRute] Firestore error:", err);
      setAlertMessage("⚠️ Gagal menyimpan Rute ke Firebase. Cek koneksi / Console (F12).");
    }
  };

  const updateRute = async (id, updates) => {
    const payload = { id, ...updates, isActive: true, updatedAt: new Date().toISOString(), updatedBy: currentUser.name };
    setRuteList((prevList) => {
      const newList = prevList.map(r => r.id === id ? { ...r, ...payload } : r);
      return newList;
    });
    try {
      await upsertItemToFirestore(db, "rute", payload);
    } catch (err) {
      console.error("[updateRute] Firestore error:", err);
      setAlertMessage("⚠️ Gagal update Rute ke Firebase. Cek koneksi / Console (F12).");
    }
  };

  const deleteRute = async (id) => {
    setConfirmDialog({
      show: true,
      message: 'Yakin ingin menghapus rute ini?',
      onConfirm: async () => {
        try {
          await softDeleteItemInFirestore(db, "rute", id, currentUser?.name || "system");
        } catch (err) {
          console.error('Error soft-deleting rute:', err);
        }

        setRuteList((prevList) => {
      const newList = prevList.filter(r => r.id !== id);
      return newList;
    });
setConfirmDialog({ show: false, message: '', onConfirm: null });
      }
    });
  };

  // Master Data Material Functions
  const addMaterial = async (data) => {
    const newMaterial = {
      id: 'MTR-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
      ...data,
      createdAt: new Date().toISOString(),
      createdBy: (currentUser?.name || currentUser?.username || 'User'),
      isActive: true
      };

    try {
      await upsertItemToFirestore(db, "material", { ...newMaterial, isActive: true });
      // onSnapshot handles state update automatically
    } catch (err) {
      console.error("[addMaterial] Firestore error:", err);
      setAlertMessage("⚠️ Gagal menyimpan Material ke Firebase. Cek koneksi / Console (F12).");
    }
  };

  const updateMaterial = async (id, updates) => {
    const payload = { id, ...updates, isActive: true, updatedAt: new Date().toISOString(), updatedBy: currentUser.name };
    setMaterialList((prevList) => {
      const newList = prevList.map(m => m.id === id ? { ...m, ...payload } : m);
      return newList;
    });
    try {
      await upsertItemToFirestore(db, "material", payload);
    } catch (err) {
      console.error("[updateMaterial] Firestore error:", err);
      setAlertMessage("⚠️ Gagal update Material ke Firebase. Cek koneksi / Console (F12).");
    }
  };

  const deleteMaterial = async (id) => {
    setConfirmDialog({
      show: true,
      message: 'Yakin ingin menghapus material ini?',
      onConfirm: async () => {
        try {
          await softDeleteItemInFirestore(db, "material", id, currentUser?.name || "system");
        } catch (err) {
          console.error('Error soft-deleting material:', err);
        }

        setMaterialList((prevList) => {
      const newList = prevList.filter(m => m.id !== id);
      return newList;
    });
setConfirmDialog({ show: false, message: '', onConfirm: null });
      }
    });
  };

  // ===== Master Data Pelanggan Functions =====
  const addPelanggan = async (data) => {
    const newPelanggan = {
      id: 'PLG-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
      name: data.name,
      address: data.address || '',
      npwp: data.npwp || '',
      isActive: true,
      createdAt: new Date().toISOString(),
      createdBy: currentUser?.name || currentUser?.username || 'User',
    };
    try {
      await upsertItemToFirestore(db, "pelanggan", newPelanggan);
      // onSnapshot akan update state secara otomatis
    } catch (err) {
      console.error("[addPelanggan] Firestore error:", err);
      setAlertMessage("⚠️ Gagal menyimpan Pelanggan ke Firebase.");
    }
  };

  const updatePelanggan = async (id, updates) => {
    const payload = { id, ...updates, isActive: true, updatedAt: new Date().toISOString(), updatedBy: currentUser?.name || 'User' };
    try {
      await upsertItemToFirestore(db, "pelanggan", payload);
      // onSnapshot akan update state secara otomatis
    } catch (err) {
      console.error("[updatePelanggan] Firestore error:", err);
      setAlertMessage("⚠️ Gagal update Pelanggan ke Firebase.");
    }
  };

  const deletePelanggan = async (id) => {
    setConfirmDialog({
      show: true,
      message: 'Yakin ingin menghapus pelanggan ini?',
      onConfirm: async () => {
        try {
          await softDeleteItemInFirestore(db, "pelanggan", id, currentUser?.name || "system");
          // onSnapshot akan hapus item dari state secara otomatis (filter deletedAt)
        } catch (err) {
          console.error("[deletePelanggan] error:", err);
        }
        setConfirmDialog({ show: false, message: '', onConfirm: null });
      },
    });
  };

  // Migrate: seed bul_pelanggan dari unique pt di bul_supir (jalankan sekali jika collection kosong)
  const migratePelangganFromSupir = async () => {
    const { getDocs: gd, collection: col, query: q, where: wh } = await import('firebase/firestore');
    const snap = await gd(col(db, C("pelanggan")));
    if (!snap.empty) return; // sudah ada data, skip
    const uniquePTs = [...new Set(supirList.map(s => s.pt).filter(Boolean))].sort();
    for (const pt of uniquePTs) {
      const newPelanggan = {
        id: 'PLG-MIGRATE-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
        name: pt, address: '', npwp: '',
        isActive: true,
        createdAt: new Date().toISOString(),
        createdBy: 'migrate',
      };
      await upsertItemToFirestore(db, "pelanggan", newPelanggan);
    }
  };

  // Invoice Functions
  // Persist invoice + update SJ terkait dengan fallback nama koleksi ("invoice" vs "invoices")
  
  // Saat admin_invoice update surat_jalan, Firestore Rules hanya mengizinkan perubahan field invoice tertentu.
  const pickSJInvoicePatch = (sj) => {
    const nowIso = new Date().toISOString();
    return sanitizeForFirestore({
      statusInvoice: sj?.statusInvoice ?? 'belum',
      invoiceId: sj?.invoiceId ?? null,
      invoiceNo: sj?.invoiceNo ?? null,
      updatedAt: sj?.updatedAt ?? nowIso,
      updatedBy: sj?.updatedBy ?? (currentUser?.name || 'system'),
    });
  };

const persistInvoiceWithFallback = async ({ invoiceDoc, sjIdsToPersist = [] }) => {
    await ensureAuthed();
    const nowIso = new Date().toISOString();
    const who = currentUser?.name || currentUser?.username || 'system';

    // 1) Simpan invoice dulu
    const invRef = doc(db, C("invoices"), invoiceDoc.id);
    await setDoc(invRef, sanitizeForFirestore(invoiceDoc), { merge: true });

    // 2) Update semua SJ yang terkait SATU per SATU
    const resolved = await Promise.all(
      sjIdsToPersist.map(async (sjId) => ({ sjId, ref: await resolveSuratJalanDocRef(sjId) }))
    );

    for (const { sjId, ref } of resolved) {
      if (!ref) {
        console.warn('[Invoice] Surat Jalan doc not found for id:', sjId);
        continue;
      }
      await setDoc(ref, sanitizeForFirestore({
        statusInvoice: 'terinvoice',
        invoiceId: invoiceDoc.id,
        invoiceNo: invoiceDoc.noInvoice,
        invoiceTanggal: invoiceDoc.tglInvoice || null,
        updatedAt: nowIso,
        updatedBy: who,
      }), { merge: true });
    }

    return 'invoices';
  };

  const addInvoice = async (data) => {
    const pelanggan = pelangganList.find(p => p.id === data.pelangganId);
    const includedSJs = suratJalanList.filter(sj => data.selectedSJIds.includes(sj.id));
    const totalQty = includedSJs.reduce((sum, sj) => sum + (sj.qtyBongkar || 0), 0);
    const hargaPerGroup = data.hargaPerGroup || null;
    let totalNilai = 0;
    if (hargaPerGroup && hargaPerGroup.length > 0) {
      const hargaMap = {};
      hargaPerGroup.forEach(g => { hargaMap[`${g.material}|${g.rute}`] = g.hargaSatuan; });
      totalNilai = includedSJs.reduce((sum, sj) => {
        return sum + (Number(sj.qtyBongkar) || 0) * (hargaMap[`${sj.material}|${sj.rute}`] || 0);
      }, 0);
    } else {
      totalNilai = totalQty * (data.hargaSatuan || 0);
    }
    const newInvoice = {
      id: 'INV-' + Date.now(),
      noInvoice: data.noInvoice,
      tglInvoice: data.tglInvoice,
      suratJalanIds: data.selectedSJIds,
      suratJalanList: includedSJs,
      totalQty,
      hargaSatuan: data.hargaSatuan || null,
      hargaPerGroup,
      totalNilai,
      pelangganId: data.pelangganId || '',
      pelangganData: pelanggan ? { name: pelanggan.name, address: pelanggan.address || '', npwp: pelanggan.npwp || '' } : null,
      createdAt: new Date().toISOString(),
      createdBy: (currentUser?.name || currentUser?.username || 'User'),
      isActive: true
    };
    
    const updatedSJList = suratJalanList.map(sj => {
      if (data.selectedSJIds.includes(sj.id)) {
        return {
          ...sj,
          statusInvoice: 'terinvoice',
          invoiceId: newInvoice.id,
          invoiceNo: data.noInvoice,
          updatedAt: new Date().toISOString(),
          updatedBy: currentUser.name
        };
      }
      return sj;
    });
    
    // Persist ke Firestore (invoice + update SJ terkait)
    try {
      await persistInvoiceWithFallback({
        invoiceDoc: newInvoice,
        sjIdsToPersist: data.selectedSJIds,
      });

      // Update UI only AFTER Firestore sukses (hindari UI kacau bila rules/permission error)
      setSuratJalanList(updatedSJList);
      const newInvoiceList = [...invoiceList, newInvoice];
      setInvoiceList(newInvoiceList);

      setAlertMessage("✅ Invoice berhasil dibuat & status SJ ter-update.");
    } catch (e) {
      console.error("Persist invoice failed:", e);
      setAlertMessage("⛔ Gagal simpan invoice ke Firebase (Missing/insufficient permissions). UI tidak diubah. Cek Firestore Rules & login role.");
    }

  };

  const editInvoice = async (invoiceId, data) => {
    const invoice = invoiceList.find(inv => inv.id === invoiceId);
    if (!invoice) return;

    const oldSJIds = invoice.suratJalanIds;
    const newSJIds = data.selectedSJIds;
    
    // SJ yang dihapus dari invoice (ada di old, tidak ada di new)
    const removedSJIds = oldSJIds.filter(id => !newSJIds.includes(id));
    
    // SJ yang ditambah ke invoice (ada di new, tidak ada di old)
    const addedSJIds = newSJIds.filter(id => !oldSJIds.includes(id));

    // Update Surat Jalan
    const updatedSJList = suratJalanList.map(sj => {
      // Remove invoice status dari SJ yang dihapus
      if (removedSJIds.includes(sj.id)) {
        const { statusInvoice, invoiceId, invoiceNo, ...rest } = sj;
        return {
          ...rest,
          updatedAt: new Date().toISOString(),
          updatedBy: currentUser.name
        };
      }
      
      // Add invoice status ke SJ yang ditambah
      if (addedSJIds.includes(sj.id)) {
        return {
          ...sj,
          statusInvoice: 'terinvoice',
          invoiceId: invoiceId,
          invoiceNo: invoice.noInvoice,
          updatedAt: new Date().toISOString(),
          updatedBy: currentUser.name
        };
      }
      
      return sj;
    });

    // Update invoice
    const newSJs = updatedSJList.filter(sj => newSJIds.includes(sj.id));
    const newTotalQty = newSJs.reduce((sum, sj) => sum + (sj.qtyBongkar || 0), 0);
    const newHargaPerGroup = data.hargaPerGroup !== undefined ? data.hargaPerGroup : (invoice.hargaPerGroup || null);
    const newHargaSatuan = data.hargaSatuan !== undefined ? data.hargaSatuan : (invoice.hargaSatuan || null);
    let newTotalNilai = 0;
    if (newHargaPerGroup && newHargaPerGroup.length > 0) {
      const hargaMap = {};
      newHargaPerGroup.forEach(g => { hargaMap[`${g.material}|${g.rute}`] = g.hargaSatuan; });
      newTotalNilai = newSJs.reduce((sum, sj) => {
        return sum + (Number(sj.qtyBongkar) || 0) * (hargaMap[`${sj.material}|${sj.rute}`] || 0);
      }, 0);
    } else {
      newTotalNilai = newTotalQty * (newHargaSatuan || 0);
    }
    const editedPelanggan = data.pelangganId
      ? pelangganList.find(p => p.id === data.pelangganId)
      : pelangganList.find(p => p.id === invoice.pelangganId);
    const updatedInvoice = {
      ...invoice,
      suratJalanIds: newSJIds,
      suratJalanList: newSJs,
      totalQty: newTotalQty,
      hargaSatuan: newHargaSatuan,
      hargaPerGroup: newHargaPerGroup,
      totalNilai: newTotalNilai,
      pelangganId: data.pelangganId || invoice.pelangganId || '',
      pelangganData: editedPelanggan ? { name: editedPelanggan.name, address: editedPelanggan.address || '', npwp: editedPelanggan.npwp || '' } : (invoice.pelangganData || null),
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser.name
    };

    const updatedInvoiceList = invoiceList.map(inv => 
      inv.id === invoiceId ? updatedInvoice : inv
    );

    setSuratJalanList(updatedSJList);
setInvoiceList(updatedInvoiceList);

// Persist ke Firestore (invoice + update SJ terkait)
try {
  const touchedIds = Array.from(new Set([...(oldSJIds || []), ...(newSJIds || [])]));
  await persistInvoiceWithFallback({
    invoiceDoc: updatedInvoice,
    updatedSJList,
    sjIdsToPersist: touchedIds,
  });
  setAlertMessage('✅ Invoice berhasil diupdate!');
} catch (e) {
  console.error("Persist edit invoice failed:", e);
  setAlertMessage("⚠️ Perubahan invoice tampil di UI, tapi gagal sync ke Firebase. Cek Console (F12).");
}
  };

  
  const deleteInvoice = async (id) => {
    setConfirmDialog({
      show: true,
      message: "Yakin ingin menghapus invoice ini? Surat Jalan terkait akan dilepas dari invoice.",
      onConfirm: async () => {
        try {
          await ensureAuthed();
          const invoice = invoiceList.find((inv) => inv.id === id);
          const sjIds = invoice?.suratJalanIds || [];
          const nowIso = new Date().toISOString();
          const who = currentUser?.name || currentUser?.username || "system";

          const invRef = doc(db, C("invoices"), id);
          await setDoc(invRef, sanitizeForFirestore({
            isActive: false,
            deletedAt: nowIso,
            deletedBy: who,
            updatedAt: nowIso,
            updatedBy: who,
          }), { merge: true });

          const sjRefs = await Promise.all(
            sjIds.map(async (sjId) => ({ sjId, ref: await resolveSuratJalanDocRef(sjId) }))
          );

          for (const { sjId, ref } of sjRefs) {
            if (!ref) {
              console.warn('[Invoice Cancel] Surat Jalan doc not found for id:', sjId);
              continue;
            }
            await setDoc(ref, sanitizeForFirestore({
              statusInvoice: 'belum',
              invoiceId: null,
              invoiceNo: null,
              invoiceTanggal: null,
              updatedAt: nowIso,
              updatedBy: who,
            }), { merge: true });
          }

          const updatedSJList = suratJalanList.map((sj) => {
            if (!sjIds.includes(sj.id)) return sj;
            return {
              ...sj,
              statusInvoice: 'belum',
              invoiceId: null,
              invoiceNo: null,
              invoiceTanggal: null,
              updatedAt: nowIso,
              updatedBy: who,
            };
          });

          setSuratJalanList(updatedSJList);
          setInvoiceList((prev) => prev.filter((inv) => inv.id !== id));
          setAlertMessage("✅ Invoice berhasil dihapus!");
        } catch (e) {
          console.error("Delete invoice failed:", e);
          setAlertMessage("⚠️ Gagal menghapus invoice di Firebase. Cek Console (F12).");
        }

        setConfirmDialog({ show: false, message: "", onConfirm: null });
      },
    });
  };

// Update Settings
  const updateSettings = async (newSettings) => {
    const payload = {
      ...(newSettings || {}),
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser?.name || "system",
    };

    setAppSettings(payload);

    // Cache lokal (offline)
// Persist ke Firestore (source of truth)
    try {
      await ensureAuthed();
      const batch = writeBatch(db);
      batch.set(doc(db, C("settings"), "app"), sanitizeForFirestore(payload), { merge: true });
      await batch.commit();
    } catch (e) {
      console.error("updateSettings -> Firestore failed", e);
      if (e?.code === "NOT_AUTHENTICATED") {
        setAlertMessage(
          "⚠️ Sesi login Firebase tidak terdeteksi. Silakan Logout lalu Login lagi, kemudian coba simpan ulang."
        );
      } else {
        setAlertMessage("⚠️ Gagal menyimpan settings ke Firebase. Settings tersimpan di cache lokal.");
      }
    }
  };

  // Import Functions
  const downloadTemplate = (type) => {
    let csvContent = '';
    let filename = '';

    if (type === 'suratjalan') {
      csvContent = 'Nomor SJ;Tanggal SJ (DD/MM/YYYY);Nomor Polisi;Nama Supir;Rute;Material;Qty Isi;Status;Tgl Terkirim (DD/MM/YYYY);Qty Bongkar\n';
      csvContent += 'SJ/2024/001;01/02/2024;B 1234 ABC;Ahmad Supardi;Jakarta - Bandung;Pasir;100;Pending;;\n';
      csvContent += 'SJ/2024/002;02/02/2024;D 5678 XYZ;Budi Santoso;Surabaya - Malang;Batu;150;Terkirim;05/02/2024;145\n';
      csvContent += 'SJ/2024/003;03/02/2024;B 9012 DEF;Candra Wijaya;Bandung - Cirebon;Kerikil;200;Gagal;;';
      filename = 'template_surat_jalan.csv';
    } else if (type === 'truck') {
      csvContent = 'Nomor Polisi;Aktif (Ya/Tidak)\n';
      csvContent += 'B 1234 ABC;Ya\n';
      csvContent += 'D 5678 XYZ;Tidak\n';
      filename = 'template_truck.csv';
    } else if (type === 'supir') {
      csvContent = 'Nama Supir;PT;Aktif (Ya/Tidak)\nJohn Doe;PT Maju Jaya;Ya\nJane Smith;PT Sejahtera;Ya\nBob Wilson;PT Makmur;Tidak';
      filename = 'template_supir.csv';
    } else if (type === 'rute') {
      csvContent = 'Rute;Uang Jalan\nJakarta - Surabaya;500000\nBandung - Semarang;350000\nJakarta - Medan;1200000';
      filename = 'template_rute.csv';
    } else if (type === 'material') {
      csvContent = 'Material;Satuan\nSemen;Ton\nPasir;m³\nBesi;Kg\nBatu Bata;Pcs';
      filename = 'template_material.csv';
    } else if (type === 'biaya') {
      csvContent = 'Nomor SJ;Jenis Biaya;Nominal;Keterangan\n';
      csvContent += 'SJ/2024/001;Solar;150000;Solar perjalanan\n';
      csvContent += 'SJ/2024/001;Tol;50000;\n';
      csvContent += 'SJ/2024/002;Bonus Ritasi;100000;\n';
      filename = 'template_biaya_tambahan.csv';
    }

    // Add BOM for UTF-8 to help Excel recognize encoding
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const importData = async (type, file) => {
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      try {
        const text = e.target.result;
        
        // Detect delimiter (comma or semicolon)
        const firstLine = text.split('\n')[0];
        const delimiter = firstLine.includes(';') ? ';' : ',';
        
        const rows = text.split('\n')
          .map(row => row.trim())
          .filter(row => row && row.length > 0);
        
        if (rows.length < 2) {
          setAlertMessage('File CSV kosong atau tidak valid!');
          return;
        }

        const headers = rows[0].split(delimiter).map(h => h.trim());
        
        // Validasi header berdasarkan tipe master data
        const headersLower = headers.map(h => h.toLowerCase());
        let isValidHeader = false;
        let expectedHeader = '';
        
        if (type === 'suratjalan') {
          expectedHeader = 'Nomor SJ;Tanggal SJ (DD/MM/YYYY);Nomor Polisi;Nama Supir;Rute;Material;Qty Isi;Status;Tgl Terkirim (DD/MM/YYYY);Qty Bongkar';
          isValidHeader = headers.length >= 8 && 
                         headersLower[0].includes('nomor') && headersLower[0].includes('sj') &&
                         headersLower[1].includes('tanggal') && headersLower[1].includes('sj') &&
                         headersLower[2].includes('nomor') && headersLower[2].includes('polisi') &&
                         headersLower[3].includes('nama') && headersLower[3].includes('supir') &&
                         headersLower[4].includes('rute') &&
                         headersLower[5].includes('material') &&
                         headersLower[6].includes('qty') && headersLower[6].includes('isi');
        } else if (type === 'truck') {
          expectedHeader = 'Nomor Polisi;Aktif (Ya/Tidak)';
          isValidHeader = headers.length === 2 && 
                         headersLower[0].includes('nomor') && headersLower[0].includes('polisi') &&
                         headersLower[1].includes('aktif');
        } else if (type === 'supir') {
          expectedHeader = 'Nama Supir;PT;Aktif (Ya/Tidak)';
          isValidHeader = headers.length === 3 && 
                         headersLower[0].includes('nama') && headersLower[0].includes('supir') &&
                         headersLower[1] === 'pt' &&
                         headersLower[2].includes('aktif');
        } else if (type === 'rute') {
          expectedHeader = 'Rute;Uang Jalan';
          isValidHeader = headers.length === 2 && 
                         headersLower[0] === 'rute' &&
                         (headersLower[1].includes('uang') && headersLower[1].includes('jalan'));
        } else if (type === 'material') {
          expectedHeader = 'Material;Satuan';
          isValidHeader = headers.length === 2 &&
                         headersLower[0] === 'material' &&
                         headersLower[1] === 'satuan';
        } else if (type === 'biaya') {
          expectedHeader = 'Nomor SJ;Jenis Biaya;Nominal;Keterangan';
          isValidHeader = headersLower.length >= 3 &&
                         headersLower[0]?.includes('nomor') &&
                         headersLower[1]?.includes('jenis');
        }

        if (!isValidHeader) {
          setAlertMessage(`Format header CSV tidak sesuai!\n\nFormat yang benar untuk ${type.toUpperCase()}:\n${expectedHeader}\n\nHeader yang ditemukan:\n${rows[0]}\n\nSilakan download template yang benar.`);
          return;
        }
        
        const dataRows = rows.slice(1);
        
        let successCount = 0;
        let errorCount = 0;
        let errorDetails = [];
        let uangJalanTxWarning = '';
        const newItems = [];

        if (type === 'suratjalan') {
          // Helper function to parse date DD/MM/YYYY
          const parseDate = (dateStr) => {
            if (!dateStr || dateStr.trim() === '') return null;
            const parts = dateStr.trim().split('/');
            if (parts.length === 3) {
              const day = parts[0].padStart(2, '0');
              const month = parts[1].padStart(2, '0');
              const year = parts[2];
              return `${year}-${month}-${day}`;
            }
            return null;
          };

          for (let i = 0; i < dataRows.length; i++) {
            const values = dataRows[i].split(delimiter).map(v => v.trim());
            if (values.length >= 7 && values[0] && values[1]) {
              try {
                const nomorSJ = values[0];
                const tanggalSJ = parseDate(values[1]);
                const nomorPolisi = values[2];
                const namaSupir = values[3];
                const rute = values[4];
                const material = values[5];
                const qtyIsi = parseFloat(values[6]);
                const status = values[7] ? values[7].toLowerCase() : 'pending';
                const tglTerkirim = values[8] ? parseDate(values[8]) : null;
                const qtyBongkar = values[9] ? parseFloat(values[9]) : null;

                if (!tanggalSJ) {
                  errorCount++;
                  errorDetails.push(`Baris ${i + 2}: Format tanggal tidak valid (gunakan DD/MM/YYYY)`);
                  continue;
                }

                if (isNaN(qtyIsi)) {
                  errorCount++;
                  errorDetails.push(`Baris ${i + 2}: Qty Isi harus berupa angka`);
                  continue;
                }

                // Validasi status
                const validStatus = ['pending', 'terkirim', 'gagal'];
                const finalStatus = validStatus.includes(status) ? status : 'pending';

                // Cari master data — tolak baris jika tidak ditemukan
                const truckMatch  = truckList.find(t => t.isActive !== false && t.nomorPolisi?.trim().toLowerCase() === nomorPolisi.trim().toLowerCase());
                const supirMatch  = supirList.find(s => s.isActive !== false && s.namaSupir?.trim().toLowerCase() === namaSupir.trim().toLowerCase());
                const ruteMatch   = ruteList.find(r => r.isActive !== false && r.rute?.trim().toLowerCase() === rute.trim().toLowerCase());
                const materialMatch = materialList.find(m => m.isActive !== false && m.material?.trim().toLowerCase() === material.trim().toLowerCase());

                const notFound = [];
                if (!truckMatch)   notFound.push(`Nomor Polisi "${nomorPolisi}" tidak ada di master data`);
                if (!supirMatch)   notFound.push(`Supir "${namaSupir}" tidak ada di master data`);
                if (!ruteMatch)    notFound.push(`Rute "${rute}" tidak ada di master data`);
                if (!materialMatch) notFound.push(`Material "${material}" tidak ada di master data`);

                if (notFound.length > 0) {
                  errorCount++;
                  errorDetails.push(`Baris ${i + 2} (${nomorSJ}): ${notFound.join(' | ')}`);
                  continue;
                }

                const truckId    = truckMatch.id;
                const supirId    = supirMatch.id;
                const ruteId     = ruteMatch.id;
                const materialId = materialMatch.id;

                // Buat Surat Jalan
                const newSJ = {
                  id: 'SJ-' + Date.now() + '-' + i + '-' + Math.random().toString(36).substr(2, 9),
                  nomorSJ,
                  tanggalSJ,
                  truckId,
                  nomorPolisi: truckMatch.nomorPolisi,
                  supirId,
                  namaSupir: supirMatch.namaSupir,
                  pt: supirMatch.pt || '',
                  ruteId,
                  rute: ruteMatch.rute,
                  uangJalan: ruteMatch.uangJalan || 0,
                  materialId,
                  material: materialMatch.material,
                  satuan: materialMatch.satuan || '',
                  qtyIsi,
                  status: finalStatus,
                  tglTerkirim,
                  qtyBongkar,
                  createdAt: new Date().toISOString(),
                  createdBy: 'Import'
                };

                newItems.push(newSJ);
                successCount++;
              } catch (error) {
                errorCount++;
                errorDetails.push(`Baris ${i + 2}: ${values[0]} - ${error.message}`);
              }
            } else {
              errorCount++;
              errorDetails.push(`Baris ${i + 2}: Data tidak lengkap (minimal 7 kolom diperlukan)`);
            }
          }

          // Batch update untuk Surat Jalan
          if (newItems.length > 0) {
            // Persist ke Firestore (batch)
            try {
              await chunkedBatchWrite(db, newItems, (batch, sj) => {
                batch.set(doc(db, C("surat_jalan"), String(sj.id)), sanitizeForFirestore({ ...sj, isActive: true }), { merge: true });
              });
            } catch (e) {
              console.error("Import SJ batch Firestore failed:", e);
            }

            // onSnapshot akan update setSuratJalanList secara otomatis setelah batch.commit()
            // Auto-create transaksi uang jalan untuk hasil import (agar menu Keuangan ikut terupdate)
            if (canWriteTransaksi) {
              const eligibleForTx = newItems.filter(sj => {
                if (sj.isActive === false) return false;
                if (String(sj.status || '').toLowerCase() === 'gagal') return false;
                return Number(sj.uangJalan || 0) > 0;
              });

              if (eligibleForTx.length > 0) {
                const who = currentUser?.name || 'system';
                const nowIsoTx = new Date().toISOString();
                const txItems = eligibleForTx.map(sj => sanitizeForFirestore({
                  id: buildUangJalanTransaksiId(sj.id),
                  tipe: 'pengeluaran',
                  nominal: Number(sj.uangJalan || 0),
                  keterangan: `Uang Jalan - ${sj.nomorSJ} (${sj.rute || ''})`,
                  tanggal: sj.tanggalSJ || nowIsoTx.slice(0, 10),
                  pt: sj.pt || '',
                  suratJalanId: sj.id,
                  source: 'auto_sj',
                  isActive: true,
                  createdAt: nowIsoTx,
                  createdBy: who,
                  updatedAt: nowIsoTx,
                  updatedBy: who,
                }));

                try {
                  await chunkedBatchWrite(db, txItems, (batch, tx) => {
                    batch.set(doc(db, C("transaksi"), tx.id), tx, { merge: true });
                  });
                  setTransaksiList(prev => {
                    const map = new Map(prev.map(t => [t.id, t]));
                    txItems.forEach(tx => map.set(tx.id, tx));
                    return Array.from(map.values());
                  });
                } catch (e) {
                  console.warn('Import SJ -> auto transaksi uang jalan (batch) gagal:', e);
                  uangJalanTxWarning = `\n\n⚠️ Surat Jalan berhasil diimport, tapi gagal membuat transaksi Uang Jalan otomatis: ${e.message}\nSilakan cek menu Keuangan dan tambahkan manual jika perlu.`;
                }
              }
            }
}
        } else if (type === 'truck') {
          for (let i = 0; i < dataRows.length; i++) {
            const values = dataRows[i].split(delimiter).map(v => v.trim());
            if (values.length >= 2 && values[0]) {
              try {
                const isActive = values[1].toLowerCase() === 'ya' || 
                                values[1].toLowerCase() === 'yes' || 
                                values[1].toLowerCase() === 'true' || 
                                values[1] === '1';
                
                const newTruck = {
                  id: 'TRK-' + Date.now() + '-' + i + '-' + Math.random().toString(36).substr(2, 9),
                  nomorPolisi: values[0],
                  isActive: isActive,
                  createdAt: new Date().toISOString(),
                  createdBy: currentUser.name
                };
                newItems.push(newTruck);
                successCount++;
              } catch (error) {
                errorCount++;
                errorDetails.push(`Baris ${i + 2}: ${values[0]} - ${error.message}`);
              }
            } else {
              errorCount++;
              errorDetails.push(`Baris ${i + 2}: Data tidak lengkap`);
            }
          }
          
// Simpan ke Firestore (collection: trucks)
if (newItems.length > 0) {
  try {
    await chunkedBatchWrite(db, newItems, (batch, t) => {
      batch.set(doc(db, C("trucks"), t.id), t, { merge: true });
    });

    // Update UI state setelah sukses commit
    setTruckList((prevList) => {
      const map = new Map(prevList.map((x) => [x.id, x]));
      newItems.forEach((x) => map.set(x.id, x));
      return Array.from(map.values());
    });
  } catch (e) {
    console.error("Error writing trucks to Firestore:", e);
    setAlertMessage("Gagal menyimpan Truck ke Firestore. Cek Console (F12).");
    return;
  }
}
        } else if (type === 'supir') {
          for (let i = 0; i < dataRows.length; i++) {
            const values = dataRows[i].split(delimiter).map(v => v.trim());
            if (values.length >= 3 && values[0] && values[1]) {
              try {
                const isActive = values[2].toLowerCase() === 'ya' || 
                                values[2].toLowerCase() === 'yes' || 
                                values[2].toLowerCase() === 'true' || 
                                values[2] === '1';
                
                const newSupir = {
                  id: 'SPR-' + Date.now() + '-' + i + '-' + Math.random().toString(36).substr(2, 9),
                  namaSupir: values[0],
                  pt: values[1],
                  isActive: isActive,
                  createdAt: new Date().toISOString(),
                  createdBy: currentUser.name
                };
                newItems.push(newSupir);
                successCount++;
              } catch (error) {
                errorCount++;
                errorDetails.push(`Baris ${i + 2}: ${values[0]} - ${error.message}`);
              }
            } else {
              errorCount++;
              errorDetails.push(`Baris ${i + 2}: Data tidak lengkap`);
            }
          }
          
          // Simpan ke Firestore (collection: supir)
          if (newItems.length > 0) {
            try {
              await chunkedBatchWrite(db, newItems, (batch, s) => {
                batch.set(doc(db, C("supir"), s.id), s, { merge: true });
              });
              setSupirList((prevList) => [...prevList, ...newItems]);
            } catch (e) {
              console.error("Error writing supir to Firestore:", e);
              setAlertMessage("Gagal menyimpan Supir ke Firestore. Cek Console (F12).");
              return;
            }
          }
} else if (type === 'rute') {
          for (let i = 0; i < dataRows.length; i++) {
            const values = dataRows[i].split(delimiter).map(v => v.trim());
            if (values.length >= 2 && values[0] && values[1]) {
              try {
                // Validasi bahwa kolom kedua adalah angka
                const uangJalan = parseFloat(values[1].replace(/\./g, '').replace(/,/g, ''));
                if (isNaN(uangJalan)) {
                  throw new Error('Uang Jalan harus berupa angka');
                }
                
                const newRute = {
                  id: 'RUT-' + Date.now() + '-' + i + '-' + Math.random().toString(36).substr(2, 9),
                  rute: values[0],
                  uangJalan: uangJalan,
                  createdAt: new Date().toISOString(),
                  createdBy: currentUser.name
                };
                newItems.push(newRute);
                successCount++;
              } catch (error) {
                errorCount++;
                errorDetails.push(`Baris ${i + 2}: ${values[0]} - ${error.message}`);
              }
            } else {
              errorCount++;
              errorDetails.push(`Baris ${i + 2}: Data tidak lengkap (harus ada Rute dan Uang Jalan)`);
            }
          }
          
          // Simpan ke Firestore (collection: rute)
          if (newItems.length > 0) {
            try {
              await chunkedBatchWrite(db, newItems, (batch, r) => {
                batch.set(doc(db, C("rute"), r.id), r, { merge: true });
              });
              // onSnapshot handles state update automatically
            } catch (e) {
              console.error("Error writing rute to Firestore:", e);
              setAlertMessage("Gagal menyimpan Rute ke Firestore. Cek Console (F12).");
              return;
            }
          }
} else if (type === 'material') {
          for (let i = 0; i < dataRows.length; i++) {
            const values = dataRows[i].split(delimiter).map(v => v.trim());
            if (values.length >= 2 && values[0] && values[1]) {
              try {
                // Validasi bahwa kolom kedua BUKAN angka murni (harus satuan)
                const angkaTest = parseFloat(values[1].replace(/\./g, '').replace(/,/g, ''));
                if (!isNaN(angkaTest) && /^\d+$/.test(values[1].replace(/\./g, '').replace(/,/g, ''))) {
                  throw new Error('Satuan tidak boleh berupa angka. Gunakan format template Material yang benar (contoh: Ton, Kg, m³, Pcs)');
                }
                
                const newMaterial = {
                  id: 'MTR-' + Date.now() + '-' + i + '-' + Math.random().toString(36).substr(2, 9),
                  material: values[0],
                  satuan: values[1],
                  createdAt: new Date().toISOString(),
                  createdBy: currentUser.name
                };
                newItems.push(newMaterial);
                successCount++;
              } catch (error) {
                errorCount++;
                errorDetails.push(`Baris ${i + 2}: ${values[0]} - ${error.message}`);
              }
            } else {
              errorCount++;
              errorDetails.push(`Baris ${i + 2}: Data tidak lengkap (harus ada Material dan Satuan)`);
            }
          }
          
          // Simpan ke Firestore (collection: material)
          if (newItems.length > 0) {
            try {
              await chunkedBatchWrite(db, newItems, (batch, m) => {
                batch.set(doc(db, C("material"), m.id), m, { merge: true });
              });
              // onSnapshot handles state update automatically
            } catch (e) {
              console.error("Error writing material to Firestore:", e);
              setAlertMessage("Gagal menyimpan Material ke Firestore. Cek Console (F12).");
              return;
            }
          }
        } else if (type === 'biaya') {
          const biayaItems = [];
          for (let i = 0; i < dataRows.length; i++) {
            const values = dataRows[i].split(delimiter).map(v => v.trim());
            if (values.length < 3 || !values[0] || !values[1]) {
              errorCount++;
              errorDetails.push(`Baris ${i + 2}: Data tidak lengkap (minimal 3 kolom: Nomor SJ, Jenis Biaya, Nominal)`);
              continue;
            }
            const nomorSJ = values[0];
            const jenisBiaya = values[1];
            const nominal = parseFloat(values[2]);
            const keteranganBiaya = values[3] || '';

            if (!nomorSJ) { errorCount++; errorDetails.push(`Baris ${i + 2}: Nomor SJ kosong`); continue; }
            if (!jenisBiaya) { errorCount++; errorDetails.push(`Baris ${i + 2}: Jenis Biaya kosong`); continue; }
            if (isNaN(nominal) || nominal <= 0) { errorCount++; errorDetails.push(`Baris ${i + 2}: Nominal tidak valid (${values[2]})`); continue; }

            const sj = suratJalanList.find(s => s.nomorSJ === nomorSJ && s.isActive !== false);
            if (!sj) {
              errorCount++;
              errorDetails.push(`Baris ${i + 2}: Nomor SJ "${nomorSJ}" tidak ditemukan`);
              continue;
            }

            biayaItems.push({
              id: 'B-' + Date.now() + '-' + i + '-' + Math.random().toString(36).substr(2, 9),
              suratJalanId: sj.id,
              jenisBiaya,
              nominal,
              keteranganBiaya,
              createdAt: new Date().toISOString(),
              createdBy: currentUser?.name || currentUser?.username || 'Import',
              isActive: true,
            });
            successCount++;
          }

          if (biayaItems.length > 0) {
            try {
              await chunkedBatchWrite(db, biayaItems, (batch, b) => {
                batch.set(doc(db, C("biaya"), b.id), b, { merge: true });
              });
              // onSnapshot akan update setBiayaList secara otomatis
            } catch (e) {
              console.error("Import biaya batch Firestore failed:", e);
              setAlertMessage("Gagal menyimpan Biaya Tambahan ke Firestore. Cek Console (F12).");
              return;
            }
          }
        }

        let message = `Import selesai!\n\nBerhasil: ${successCount} data\nDitolak: ${errorCount} data`;
        if (errorCount > 0 && errorDetails.length > 0) {
          // Download laporan lengkap otomatis jika ada penolakan >= 1
          const reportContent = '\uFEFF' + 'Baris;Alasan Penolakan\n' +
            errorDetails.map(d => {
              const match = d.match(/^(Baris \d+[^:]*): (.+)$/);
              return match ? `${match[1]};${match[2]}` : `;${d}`;
            }).join('\n');
          const blob = new Blob([reportContent], { type: 'text/csv;charset=utf-8;' });
          const link = document.createElement('a');
          link.setAttribute('href', URL.createObjectURL(blob));
          link.setAttribute('download', 'laporan_penolakan_import.csv');
          link.style.visibility = 'hidden';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          message += `\n\nCSV laporan penolakan (${errorCount} baris) sudah otomatis didownload.\nSilahkan cek file "laporan_penolakan_import.csv".`;
        }
        if (uangJalanTxWarning) {
          message += uangJalanTxWarning;
        }
        setAlertMessage(message);
      } catch (error) {
        setAlertMessage('Terjadi kesalahan saat import:\n' + error.message);
      }
    };

    reader.readAsText(file);
  };

  const addSuratJalan = async (data) => {
    // Ambil data terkait dari master data
    const selectedTruck = truckList.find(t => t.id === data.truckId);
    const selectedSupir = supirList.find(s => s.id === data.supirId);
    const selectedRute = ruteList.find(r => r.id === data.ruteId);
    const selectedMaterial = materialList.find(m => m.id === data.materialId);
    
    const newSJ = {
      id: 'SJ-' + Date.now(),
      nomorSJ: data.nomorSJ,
      tanggalSJ: data.tanggalSJ,
      truckId: data.truckId,
      nomorPolisi: selectedTruck?.nomorPolisi || '',
      supirId: data.supirId,
      namaSupir: selectedSupir?.namaSupir || '',
      pt: selectedSupir?.pt || '',
      ruteId: data.ruteId,
      rute: selectedRute?.rute || '',
      uangJalan: selectedRute?.uangJalan || 0,
      materialId: data.materialId,
      material: selectedMaterial?.material || '',
      satuan: selectedMaterial?.satuan || '',
      qtyIsi: parseFloat(data.qtyIsi),
      tglTerkirim: null,
      qtyBongkar: null,
      status: 'pending',
      createdAt: new Date().toISOString(),
      createdBy: (currentUser?.name || currentUser?.username || 'User'),
      isActive: true
    };
    
    const newList = [...suratJalanList, newSJ];
    setSuratJalanList(newList);
    
    // Auto-create transaksi keuangan
    await upsertItemToFirestore(db, "surat_jalan", { ...newSJ, isActive: true });

    // Auto-create transaksi keuangan untuk Uang Jalan (persist ke Firestore via addTransaksi)
if (canWriteTransaksi && selectedRute && Number(selectedRute.uangJalan || 0) > 0) {
  await addTransaksi({
    id: buildUangJalanTransaksiId(newSJ.id),
    tipe: "pengeluaran",
    nominal: Number(selectedRute.uangJalan || 0),
    keterangan: `Uang Jalan - ${newSJ.nomorSJ} (${selectedRute.rute})`,
    tanggal: data.tanggalSJ,
    suratJalanId: newSJ.id,
    pt: newSJ.pt,
  });
}

    
    await saveData(newList, biayaList);
  };

  // Pure: computes the Firestore patch for a status update, including the special
  // "gagal" derived fields (uangJalan locked to 0, deletedUangJalan snapshot for restore).
  // Extracted so the bulk-batalkan path can reuse it without duplicating the logic.
  const buildSJStatusPatch = (sj, updates, who) => {
    const nowIso = new Date().toISOString();
    const patch = {
      ...(updates || {}),
      updatedAt: nowIso,
      updatedBy: who,
    };

    if (patch.status === 'gagal') {
      const originalUangJalan = Number(sj?.uangJalan || 0);
      if (patch.isActive === undefined) patch.isActive = false;

      if (!patch.deletedUangJalan && originalUangJalan > 0) {
        patch.deletedUangJalan = {
          id: buildUangJalanTransaksiId(sj?.id),
          nominal: originalUangJalan,
          tanggal: (sj?.tglSJ || '').split('/').reverse().join('-') || nowIso.slice(0, 10),
          keterangan: (`Uang Jalan - ${String(sj?.nomorSJ || '')}`).trim(),
          pt: sj?.pt || '',
        };
      }
      patch.uangJalan = 0;
    }

    return patch;
  };

  const updateSuratJalan = async (id, updates) => {
    const sj = suratJalanListRef.current.find((x) => String(x.id) === String(id));
    const who = currentUser?.name || 'system';
    const patch = buildSJStatusPatch(sj, updates, who);

    setSuratJalanList(prev => prev.map((x) =>
      String(x.id) === String(id) ? { ...x, ...patch } : x
    ));

    // Persist ke Firestore
    await updateDoc(doc(db, C("surat_jalan"), String(id)), sanitizeForFirestore(patch));

    // Jika jadi GAGAL, nonaktifkan transaksi uang jalan terkait (best-effort, termasuk legacy)
    if (patch.status === 'gagal') {
      try {
        const sjObj = suratJalanListRef.current.find((s) => String(s.id) === String(id)) || { id };
        await deactivateUangJalanTransaksiForSJ(sjObj, who);
      } catch (e) {
        console.warn('Nonaktifkan transaksi uang jalan gagal:', e);
      }
    }
  };

  const markAsGagal = async (id) => {
    const sj = suratJalanList.find(s => s.id === id);
    // Transaksi uang jalan versi baru memakai id deterministik TX-UJ-<SJ-ID>, legacy kadang hanya punya suratJalanId
    const uangJalanTransaksi = transaksiList.find(
      t => t.id === buildUangJalanTransaksiId(id) || String(t.suratJalanId) === String(id)
    );
    
    setConfirmDialog({
      show: true,
      message: 'Yakin ingin menandai Surat Jalan ini sebagai GAGAL?\n\n⚠️ Uang Jalan untuk SJ ini akan otomatis dihapus dari Laporan Keuangan.\n\n✅ Super Admin dapat restore SJ ini kembali nanti.',
      onConfirm: async () => {
        // Simpan data Uang Jalan untuk restore nanti
        const deletedUangJalan = uangJalanTransaksi ? {
          nominal: uangJalanTransaksi.nominal,
          keterangan: uangJalanTransaksi.keterangan,
          tanggal: uangJalanTransaksi.tanggal,
          id: uangJalanTransaksi.id
        } : null;
        
        // Update status SJ dengan menyimpan info Uang Jalan yang dihapus
        await updateSuratJalan(id, { 
          status: 'gagal',
          statusLabel: 'gagal',
          deletedUangJalan // Simpan untuk restore
        });
        
        // Nonaktifkan transaksi Uang Jalan yang terkait (Firestore + state)
        await deactivateUangJalanTransaksiForSJ(sj || { id }, currentUser?.name || "system").catch(() => {});
        const nowIsoLocal = new Date().toISOString();
        const txIdLocal = buildUangJalanTransaksiId(id);

        // Update state transaksiList secara non-destruktif (tetap simpan row untuk audit),
        // tapi tandai nonaktif agar tidak muncul di menu Keuangan/Laporan Kas (yang filter isActive).
        setTransaksiList((prev) =>
          (prev || []).map((t) => {
            const match = String(t?.suratJalanId) === String(id) || String(t?.id) === String(txIdLocal);
            if (!match) return t;
            return {
              ...t,
              isActive: false,
              deletedAt: t?.deletedAt || nowIsoLocal,
              deletedBy: t?.deletedBy || currentUser?.name || "System",
            };
          })
        );
// Add to history log
        await addHistoryLog('mark_gagal', id, sj?.nomorSJ, {
          previousStatus: sj?.status,
          uangJalanDeleted: deletedUangJalan
        }, false);
        
        setConfirmDialog({ show: false, message: '', onConfirm: null });
        setAlertMessage('✅ Surat Jalan ditandai GAGAL.\n💰 Uang Jalan telah dihapus dari keuangan.');
      }
    });
  };

  const handleKirimSJKeAccounting = (sj) => {
    if (!isBridgeReady()) {
      setAlertMessage('❌ Koneksi ke sistem Accounting belum siap. Periksa konfigurasi .env dan coba refresh halaman.');
      return;
    }
    setConfirmDialog({
      show: true,
      message: `Kirim SJ ${sj.nomorSJ} ke Accounting untuk di-review?\n\n⚠️ Data SJ akan dikunci sampai akuntan menyetujui atau menolak.`,
      confirmLabel: 'Kirim ke Accounting',
      confirmVariant: 'primary',
      onConfirm: async () => {
        setConfirmDialog({ show: false, message: '', onConfirm: null });
        try {
          const sjBiaya = biayaList.filter(b => b.suratJalanId === sj.id && b.isActive !== false && !b.deletedAt);
          const { warnings } = await kirimUangJalanKeAccounting(sj, currentUser, invoiceList, sjBiaya);
          await updateSuratJalan(sj.id, {
            status: 'menunggu_review',
            integrationQueueId: `IQ-UJ-${sj.id}`,
            sentToAccountingAt: new Date().toISOString(),
            sentToAccountingBy: currentUser?.name || currentUser?.username || 'unknown',
          });
          const warningText = warnings.length > 0
            ? `\n\n⚠️ Peringatan Master Data:\n${warnings.map(w => `• ${w.message}`).join('\n')}`
            : '';
          setAlertMessage(`✅ Surat Jalan berhasil dikirim ke Accounting.${warningText}`);
        } catch (e) {
          setAlertMessage(`❌ Gagal mengirim ke Accounting: ${e.message}`);
        }
      },
    });
  };

  const handleBulkKirimSJKeAccounting = async () => {
    if (!isBridgeReady()) {
      setAlertMessage('❌ Koneksi ke sistem Accounting belum siap. Periksa konfigurasi .env dan coba refresh halaman.');
      return;
    }
    const toSend = suratJalanList.filter(sj => selectedSJIds.has(sj.id) && isSJEligibleForBulkKirim(sj));
    if (!toSend.length) return;

    const listPreview = toSend.slice(0, 10).map(sj => `• ${sj.nomorSJ}`).join('\n');
    const moreText = toSend.length > 10 ? `\n• ... dan ${toSend.length - 10} lainnya` : '';

    setConfirmDialog({
      show: true,
      message: `Kirim ${toSend.length} Surat Jalan ke Accounting untuk di-review?\n\n${listPreview}${moreText}\n\n⚠️ Semua SJ yang dipilih akan dikunci sampai akuntan menyetujui atau menolak.`,
      confirmLabel: `Kirim ${toSend.length} SJ`,
      confirmVariant: 'primary',
      onConfirm: async () => {
        setConfirmDialog({ show: false, message: '', onConfirm: null });

        const masterData = await fetchAccountingMasterData();
        const allWarnings = [];
        const succeeded = [];
        const gagalList = [];

        await runWithConcurrencyLimit(toSend, 5, async (sj) => {
          try {
            const sjBiaya = biayaList.filter(b => b.suratJalanId === sj.id && b.isActive !== false && !b.deletedAt);
            const { warnings } = await kirimUangJalanKeAccounting(sj, currentUser, invoiceList, sjBiaya, masterData);
            warnings.forEach(w => allWarnings.push(`[${sj.nomorSJ}] ${w.message}`));
            succeeded.push(sj);
          } catch (e) {
            gagalList.push(sj.nomorSJ);
          }
        });

        const nowIso = new Date().toISOString();
        const who = currentUser?.name || currentUser?.username || 'unknown';
        const patchesById = new Map(succeeded.map(sj => [sj.id, {
          status: 'menunggu_review',
          integrationQueueId: `IQ-UJ-${sj.id}`,
          sentToAccountingAt: nowIso,
          sentToAccountingBy: who,
          updatedAt: nowIso,
          updatedBy: who,
        }]));

        if (patchesById.size > 0) {
          await chunkedBatchWrite(db, Array.from(patchesById.entries()), (batch, [sjId, patch]) => {
            batch.update(doc(db, C("surat_jalan"), String(sjId)), patch);
          });
          setSuratJalanList(prev => prev.map(sj =>
            patchesById.has(sj.id) ? { ...sj, ...patchesById.get(sj.id) } : sj
          ));
        }

        setSelectedSJIds(new Set());
        const warningText = allWarnings.length > 0
          ? `\n\n⚠️ Peringatan Master Data:\n${allWarnings.map(w => `• ${w}`).join('\n')}`
          : '';
        const gagalText = gagalList.length > 0
          ? `\n❌ ${gagalList.length} SJ gagal dikirim: ${gagalList.join(', ')}`
          : '';
        setAlertMessage(`✅ ${succeeded.length} SJ berhasil dikirim ke Accounting.${gagalText}${warningText}`);
      },
    });
  };

  const handleBulkBatalkanSJ = async () => {
    const toCancel = suratJalanList.filter(sj => selectedBatalSJIds.has(sj.id) && isSJEligibleForBulkBatalkan(sj));
    if (!toCancel.length) return;

    const listPreview = toCancel.slice(0, 10).map(sj => `• ${sj.nomorSJ}`).join('\n');
    const moreText = toCancel.length > 10 ? `\n• ... dan ${toCancel.length - 10} lainnya` : '';

    setConfirmDialog({
      show: true,
      message: `Batalkan ${toCancel.length} Surat Jalan?\n\n${listPreview}${moreText}\n\n⚠️ Uang Jalan setiap SJ akan dihapus dari Laporan Keuangan.\n✅ Masing-masing SJ dapat di-restore nanti oleh Super Admin.`,
      confirmLabel: `Batalkan ${toCancel.length} SJ`,
      confirmVariant: 'danger',
      onConfirm: async () => {
        setConfirmDialog({ show: false, message: '', onConfirm: null });
        try {
          // Batch commits are atomic per-chunk (see chunkedBatchWrite): on failure we
          // intentionally surface one error instead of granular per-item success/fail
          // counts, since a cancel/batalkan action is reversible (superadmin can restore)
          // and chunk-level atomicity matters more here than partial-progress visibility.
          const who = currentUser?.name || 'system';
          const nowIso = new Date().toISOString();

          // Precompute patches + tx ids (pure, no I/O) so we can batch everything below.
          const plans = toCancel.map(sj => {
            const uangJalanTransaksi = transaksiList.find(
              t => t.id === buildUangJalanTransaksiId(sj.id) || String(t.suratJalanId) === String(sj.id)
            );
            const deletedUangJalan = uangJalanTransaksi ? {
              nominal: uangJalanTransaksi.nominal,
              keterangan: uangJalanTransaksi.keterangan,
              tanggal: uangJalanTransaksi.tanggal,
              id: uangJalanTransaksi.id,
            } : null;
            const patch = buildSJStatusPatch(sj, { status: 'gagal', statusLabel: 'gagal', deletedUangJalan }, who);
            return { sj, patch, txId: buildUangJalanTransaksiId(sj.id), logId: 'LOG-' + Date.now() + '-' + sj.id };
          });

          // Prefetch tx existence in parallel (read-before-write, same rule as
          // deactivateUangJalanTransaksiForSJ: only deactivate if it exists and is active).
          const txSnaps = await Promise.all(plans.map(p => getDoc(doc(db, C("transaksi"), p.txId))));

          const items = plans.map((p, i) => ({
            ...p,
            txSnap: txSnaps[i],
          }));

          await chunkedBatchWrite(db, items, (batch, { sj, patch, txId, txSnap, logId }) => {
            batch.update(doc(db, C("surat_jalan"), String(sj.id)), sanitizeForFirestore(patch));

            if (txSnap.exists() && txSnap.data()?.isActive !== false) {
              batch.update(doc(db, C("transaksi"), txId), {
                isActive: false,
                updatedAt: nowIso,
                updatedBy: who,
              });
            }

            batch.set(doc(db, C("history_log"), logId), sanitizeForFirestore({
              id: logId,
              action: 'mark_gagal',
              suratJalanId: sj.id,
              suratJalanNo: sj.nomorSJ,
              details: { previousStatus: sj.status, uangJalanDeleted: patch.deletedUangJalan, bulkAction: true },
              timestamp: nowIso,
              user: currentUser.name,
              userRole: currentUser.role,
              isActive: false,
            }));
          }, 150, (committedChunk) => {
            const chunkPatchesById = new Map(committedChunk.map(({ sj, patch }) => [sj.id, patch]));
            setSuratJalanList(prev => prev.map(sj =>
              chunkPatchesById.has(sj.id) ? { ...sj, ...chunkPatchesById.get(sj.id) } : sj
            ));
            setTransaksiList(prev => prev.map(t => {
              const match = committedChunk.find(({ sj }) =>
                String(t?.suratJalanId) === String(sj.id) || String(t?.id) === String(buildUangJalanTransaksiId(sj.id))
              );
              if (!match) return t;
              return { ...t, isActive: false, updatedAt: t?.updatedAt || nowIso, updatedBy: t?.updatedBy || who };
            }));
            setHistoryLog(prev => [
              ...prev,
              ...committedChunk.map(({ sj, patch, logId }) => ({
                id: logId,
                action: 'mark_gagal',
                suratJalanId: sj.id,
                suratJalanNo: sj.nomorSJ,
                details: { previousStatus: sj.status, uangJalanDeleted: patch.deletedUangJalan, bulkAction: true },
                timestamp: nowIso,
                user: currentUser.name,
                userRole: currentUser.role,
              })),
            ]);
          }); // 3 writes/item (SJ + tx + history) => 150*3=450 ≤ 500/batch

          setSelectedBatalSJIds(new Set());
          setAlertMessage(`✅ ${items.length} SJ berhasil dibatalkan.\n💰 Uang Jalan terkait telah dihapus dari keuangan.`);
        } catch (e) {
          setAlertMessage(`❌ Gagal membatalkan SJ secara massal: ${e.message}`);
        }
      },
    });
  };

  const handleKirimInvoiceKeAccounting = (invoice) => {
    if (!isBridgeReady()) {
      setAlertMessage('❌ Koneksi ke sistem Accounting belum siap. Periksa konfigurasi .env dan coba refresh halaman.');
      return;
    }
    setConfirmDialog({
      show: true,
      message: `Kirim Invoice ${invoice.noInvoice} ke Accounting untuk di-review?\n\n⚠️ Invoice akan dikunci sampai akuntan menyetujui atau menolak.`,
      confirmLabel: 'Kirim ke Accounting',
      confirmVariant: 'primary',
      onConfirm: async () => {
        setConfirmDialog({ show: false, message: '', onConfirm: null });
        try {
          await kirimInvoiceKeAccounting(invoice, suratJalanList, currentUser, biayaList, pelangganList);
          const invRef = doc(db, C("invoices"), invoice.id);
          await updateDoc(invRef, sanitizeForFirestore({
            integrationStatus: 'menunggu_review',
            integrationQueueId: `IQ-INV-${invoice.id}`,
            sentToAccountingAt: new Date().toISOString(),
            sentToAccountingBy: currentUser?.name || currentUser?.username || 'unknown',
            updatedAt: new Date().toISOString(),
            updatedBy: currentUser?.name || currentUser?.username || 'unknown',
          }));
          setAlertMessage('✅ Invoice berhasil dikirim ke Accounting. Menunggu review akuntan.');
        } catch (e) {
          setAlertMessage(`❌ Gagal mengirim Invoice ke Accounting: ${e.message}`);
        }
      },
    });
  };

  const handleBulkKirimInvoiceKeAccounting = (invoices, resetSelection) => {
    if (!isBridgeReady()) {
      setAlertMessage('❌ Koneksi ke sistem Accounting belum siap. Periksa konfigurasi .env dan coba refresh halaman.');
      return;
    }
    if (!invoices.length) return;

    const listPreview = invoices.slice(0, 10).map(inv => `• ${inv.noInvoice}`).join('\n');
    const moreText = invoices.length > 10 ? `\n• ... dan ${invoices.length - 10} lainnya` : '';

    setConfirmDialog({
      show: true,
      message: `Kirim ${invoices.length} Invoice ke Accounting untuk di-review?\n\n${listPreview}${moreText}\n\n⚠️ Semua invoice yang dipilih akan dikunci sampai akuntan menyetujui atau menolak.`,
      confirmLabel: `Kirim ${invoices.length} Invoice`,
      confirmVariant: 'primary',
      onConfirm: async () => {
        setConfirmDialog({ show: false, message: '', onConfirm: null });
        let berhasil = 0, gagal = 0;
        const gagalList = [];

        for (const invoice of invoices) {
          try {
            await kirimInvoiceKeAccounting(invoice, suratJalanList, currentUser, biayaList, pelangganList);
            const invRef = doc(db, C("invoices"), invoice.id);
            await updateDoc(invRef, sanitizeForFirestore({
              integrationStatus: 'menunggu_review',
              integrationQueueId: `IQ-INV-${invoice.id}`,
              sentToAccountingAt: new Date().toISOString(),
              sentToAccountingBy: currentUser?.name || currentUser?.username || 'unknown',
              updatedAt: new Date().toISOString(),
              updatedBy: currentUser?.name || currentUser?.username || 'unknown',
            }));
            berhasil++;
          } catch (e) {
            gagal++;
            gagalList.push(invoice.noInvoice);
          }
        }

        resetSelection();
        const gagalText = gagal > 0 ? `\n❌ ${gagal} invoice gagal dikirim: ${gagalList.join(', ')}` : '';
        setAlertMessage(`✅ ${berhasil} invoice berhasil dikirim ke Accounting.${gagalText}`);
      },
    });
  };

  const handleKirimTransaksiKeAccounting = (transaksi) => {
    if (!isBridgeReady()) {
      setAlertMessage('❌ Koneksi ke sistem Accounting belum siap. Periksa konfigurasi .env dan coba refresh halaman.');
      return;
    }
    setConfirmDialog({
      show: true,
      message: `Kirim transaksi "${transaksi.keterangan}" (${transaksi.tipe === 'pemasukan' ? 'Kas Masuk' : 'Kas Keluar'} Rp ${Number(transaksi.nominal).toLocaleString('id-ID')}) ke Accounting untuk di-review?\n\n⚠️ Data akan dikunci sampai akuntan merespons.`,
      confirmLabel: 'Kirim ke Accounting',
      confirmVariant: 'primary',
      onConfirm: async () => {
        setConfirmDialog({ show: false, message: '', onConfirm: null });
        try {
          await kirimTransaksiKasKeAccounting(transaksi, currentUser);
          const trxRef = doc(db, C('transaksi'), transaksi.id);
          await updateDoc(trxRef, {
            integrationStatus: 'menunggu_review',
            integrationQueueId: `IQ-TRX-${transaksi.id}`,
            sentToAccountingAt: new Date().toISOString(),
            sentToAccountingBy: currentUser?.name || currentUser?.username || 'unknown',
            updatedAt: new Date().toISOString(),
          });
          setAlertMessage('✅ Transaksi berhasil dikirim ke Accounting. Menunggu review akuntan.');
        } catch (e) {
          setAlertMessage(`❌ Gagal mengirim transaksi ke Accounting: ${e.message}`);
        }
      },
    });
  };

  const restoreFromGagal = async (id) => {
    // SJ gagal tidak ada di suratJalanList (di-soft-lock isActive:false); cari juga di
    // gagalSuratJalanList agar deletedUangJalan/nominal ikut ter-restore dengan benar.
    const sj = suratJalanList.find(s => s.id === id) || gagalSuratJalanList.find(s => s.id === id);

    setConfirmDialog({
      show: true,
      message: 'Restore Surat Jalan ini dari status GAGAL?\n\n✅ Status akan kembali ke PENDING.\n💰 Uang Jalan akan dibuat ulang di Laporan Keuangan.',
      onConfirm: async () => {
        const restoredNominal = Number(sj?.deletedUangJalan?.nominal || sj?.uangJalan || 0);

        // Update status kembali ke pending + re-activate SJ (lock data)
        await updateSuratJalan(id, {
          status: 'pending',
          statusLabel: 'pending',
          isActive: true,
          uangJalan: restoredNominal,
          deletedUangJalan: null,
        });

        // Restore transaksi Uang Jalan yang sebelumnya di-soft-delete (lebih aman daripada membuat transaksi baru)
        if (canWriteTransaksi && sj?.deletedUangJalan?.id) {
          try {
            await updateDoc(doc(db, C("transaksi"), String(sj.deletedUangJalan.id)), sanitizeForFirestore({
              isActive: true,
              updatedAt: new Date().toISOString(),
              updatedBy: currentUser?.name || 'system',
            }));
          } catch (e) {
            console.warn('Restore transaksi gagal, fallback create baru:', e);
            if (canWriteTransaksi && restoredNominal > 0) {
              await addTransaksi({
                id: buildUangJalanTransaksiId(id),
                tipe: 'pengeluaran',
                nominal: restoredNominal,
                keterangan: (sj?.deletedUangJalan?.keterangan || `Uang Jalan - ${sj?.nomorSJ}`) + ' (Restored)',
                tanggal: sj?.deletedUangJalan?.tanggal || sj?.tanggalSJ || new Date().toISOString().slice(0, 10),
                suratJalanId: id,
                pt: sj?.pt,
              });
            }
          }
        } else if (canWriteTransaksi && restoredNominal > 0) {
          // Jika tidak ada id transaksi tersimpan, buat baru
          await addTransaksi({
                id: buildUangJalanTransaksiId(id),
                tipe: 'pengeluaran',
            nominal: restoredNominal,
            keterangan: (sj?.deletedUangJalan?.keterangan || `Uang Jalan - ${sj?.nomorSJ}`) + ' (Restored)',
            tanggal: sj?.deletedUangJalan?.tanggal || sj?.tanggalSJ || new Date().toISOString().slice(0, 10),
            suratJalanId: id,
            pt: sj?.pt,
          });
        }

        
        // Add to history log
        await addHistoryLog('restore_from_gagal', id, sj?.nomorSJ, {
          restoredTo: 'pending',
          uangJalanRestored: sj?.deletedUangJalan
        }, true);
        
        setConfirmDialog({ show: false, message: '', onConfirm: null });
        setAlertMessage('✅ Surat Jalan di-restore!\n💰 Uang Jalan telah dibuat ulang.');
      }
    });
  };

  const deleteSuratJalan = async (id) => {
    setConfirmDialog({
      show: true,
      message: 'Yakin ingin menghapus Surat Jalan ini?',
      onConfirm: async () => {
  // Soft delete SJ & biaya terkait di Firestore
  await softDeleteItemInFirestore(db, "surat_jalan", id, currentUser?.name || "system").catch(() => {});
  const biayaToDelete = biayaList.filter(b => b.suratJalanId === id);
  if (biayaToDelete.length > 0) {
    try {
      const batch = writeBatch(db);
      biayaToDelete.forEach((b) => {
        batch.set(doc(db, C("biaya"), String(b.id)), sanitizeForFirestore({
          ...b,
          isActive: false,
          deletedAt: new Date().toISOString(),
          deletedBy: currentUser?.name || "system",
        }), { merge: true });
      });
      await batch.commit();
    } catch (e) {
      console.error("Soft delete biaya batch failed:", e);
    }
  }

  const newList = suratJalanList.filter(sj => sj.id !== id);
  const newBiayaList = biayaList.filter(b => b.suratJalanId !== id);
        setSuratJalanList(newList);
        setBiayaList(newBiayaList);
        await saveData(newList, newBiayaList);
        setConfirmDialog({ show: false, message: '', onConfirm: null });
      }
    });
  };

  const deleteImportedSJ = async () => {
    const importedSJs = suratJalanList.filter(sj => sj.createdBy === 'Import');
    if (importedSJs.length === 0) {
      setAlertMessage('Tidak ada Surat Jalan hasil import yang ditemukan.');
      return;
    }
    setConfirmDialog({
      show: true,
      message: `Yakin ingin menghapus ${importedSJs.length} Surat Jalan hasil import beserta transaksi uang jalan-nya? Tindakan ini tidak dapat dibatalkan.`,
      onConfirm: async () => {
        try {
          const who = currentUser?.name || 'system';
          const now = new Date().toISOString();

          // Batch 1: soft delete SJ docs (max 500, importedSJs max ~300 safe)
          const batchSJ = writeBatch(db);
          importedSJs.forEach(sj => {
            const ref = doc(db, C('surat_jalan'), String(sj.id));
            batchSJ.update(ref, { isActive: false, deletedAt: now, deletedBy: who });
          });
          await batchSJ.commit();

          // Batch 2: soft delete TX-UJ transaksi docs
          const batchTX = writeBatch(db);
          importedSJs.forEach(sj => {
            const txId = buildUangJalanTransaksiId(sj.id);
            const ref = doc(db, C('transaksi'), txId);
            batchTX.update(ref, { isActive: false, deletedAt: now, deletedBy: who });
          });
          await batchTX.commit();

          setConfirmDialog({ show: false, message: '', onConfirm: null });
          setAlertMessage(`✅ ${importedSJs.length} Surat Jalan hasil import berhasil dihapus.`);
        } catch (e) {
          console.error('deleteImportedSJ error:', e);
          setAlertMessage('❌ Gagal menghapus: ' + e.message);
          setConfirmDialog({ show: false, message: '', onConfirm: null });
        }
      }
    });
  };

  const addBiaya = async (data) => {
    const newBiaya = {
      id: 'B-' + Date.now(),
      ...data,
      createdAt: new Date().toISOString(),
      createdBy: (currentUser?.name || currentUser?.username || 'User'),
      isActive: true
    };
    const newList = [...biayaList, newBiaya];
    setBiayaList(newList);
    await upsertItemToFirestore(db, "biaya", { ...newBiaya, isActive: true });
    await saveData(suratJalanList, newList);
  };

  // NOTE: the live unsubHistory listener always overwrites `historyLog` with just the
  // newest HISTORY_LOG_PAGE_SIZE docs whenever a new history_log write comes in — any
  // pages accumulated here via loadMoreHistoryLog get silently discarded on the next
  // live update. Harmless today (no UI calls this yet), but fix this interaction before
  // wiring a "load more" button to it.
  const loadMoreHistoryLog = async () => {
    if (!historyLogCursorRef.current || historyLogLoadingMore) return;
    setHistoryLogLoadingMore(true);
    try {
      const moreQ = query(
        collection(db, C("history_log")),
        orderBy("timestamp", "desc"),
        startAfter(historyLogCursorRef.current),
        limit(HISTORY_LOG_PAGE_SIZE)
      );
      const snap = await getDocs(moreQ);
      const moreData = snap.docs
        .map((d) => {
          const row = d.data() || {};
          return { ...row, id: row.id || d.id };
        })
        .filter((x) => !x?.deletedAt);
      setHistoryLog(prev => {
        const combined = [...prev, ...moreData];
        combined.sort((a, b) => String(b?.timestamp || "").localeCompare(String(a?.timestamp || "")));
        return combined;
      });
      historyLogCursorRef.current = snap.docs[snap.docs.length - 1] || historyLogCursorRef.current;
      setHistoryLogHasMore(snap.docs.length === HISTORY_LOG_PAGE_SIZE);
    } finally {
      setHistoryLogLoadingMore(false);
    }
  };

  const deleteBiaya = async (id) => {
    setConfirmDialog({
      show: true,
      message: 'Yakin ingin menghapus biaya ini?',
      onConfirm: async () => {
  await softDeleteItemInFirestore(db, "biaya", id, currentUser?.name || "system").catch(() => {});
  const newList = biayaList.filter(b => b.id !== id);
        setBiayaList(newList);
        await saveData(suratJalanList, newList);
        setConfirmDialog({ show: false, message: '', onConfirm: null });
      }
    });
  };

  const getTotalBiaya = (suratJalanId) => {
    return biayaList
      .filter(b => b.suratJalanId === suratJalanId)
      .reduce((sum, b) => sum + parseFloat(b.nominal || 0), 0);
  };

  const getStatusColor = (status) => {
    const colors = {
      pending: 'bg-yellow-100 text-yellow-800',
      terkirim: 'bg-green-100 text-green-800',
      gagal: 'bg-red-100 text-red-800',
      menunggu_review: 'bg-blue-100 text-blue-800',
      terkunci: 'bg-gray-200 text-gray-600',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getStatusIcon = (status) => {
    const icons = {
      pending: <Clock className="w-4 h-4" />,
      terkirim: <CheckCircle className="w-4 h-4" />,
      gagal: <XCircle className="w-4 h-4" />,
      menunggu_review: <Send className="w-4 h-4" />,
      terkunci: <Lock className="w-4 h-4" />,
    };
    return icons[status] || <FileText className="w-4 h-4" />;
  };

  const filteredSuratJalan = filter === 'gagal'
    ? gagalSuratJalanList
    : suratJalanList.filter(sj => filter === 'all' || sj.status === filter);

  const pendingReviewCount = suratJalanList.filter(sj => sj.status === 'menunggu_review').length;

  const [selectedSJIds, setSelectedSJIds] = useState(new Set());

  const isSJEligibleForBulkKirim = (sj) =>
    sj.status === 'terkirim' && Number(sj.uangJalan || 0) > 0;

  const eligibleInView = filteredSuratJalan.filter(isSJEligibleForBulkKirim);
  const selectedInView = eligibleInView.filter(sj => selectedSJIds.has(sj.id));
  const allInViewSelected = eligibleInView.length > 0 && selectedInView.length === eligibleInView.length;

  const toggleSelectSJ = (id) => {
    setSelectedSJIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allInViewSelected) {
      setSelectedSJIds(prev => {
        const next = new Set(prev);
        eligibleInView.forEach(sj => next.delete(sj.id));
        return next;
      });
    } else {
      setSelectedSJIds(prev => {
        const next = new Set(prev);
        eligibleInView.forEach(sj => next.add(sj.id));
        return next;
      });
    }
  };

  // --- Bulk Batalkan SJ ---
  const [selectedBatalSJIds, setSelectedBatalSJIds] = useState(new Set());

  const isSJEligibleForBulkBatalkan = (sj) =>
    !['gagal', 'menunggu_review', 'terkunci'].includes(sj.status) && sj.isActive !== false;

  const eligibleBatalInView = filteredSuratJalan.filter(isSJEligibleForBulkBatalkan);
  const selectedBatalInView = eligibleBatalInView.filter(sj => selectedBatalSJIds.has(sj.id));
  const allBatalInViewSelected = eligibleBatalInView.length > 0 && selectedBatalInView.length === eligibleBatalInView.length;

  const toggleSelectBatalSJ = (id) => {
    setSelectedBatalSJIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAllBatal = () => {
    if (allBatalInViewSelected) {
      setSelectedBatalSJIds(prev => {
        const next = new Set(prev);
        eligibleBatalInView.forEach(sj => next.delete(sj.id));
        return next;
      });
    } else {
      setSelectedBatalSJIds(prev => {
        const next = new Set(prev);
        eligibleBatalInView.forEach(sj => next.add(sj.id));
        return next;
      });
    }
  };

    // SETTINGS (login branding) - readable without auth (for login page branding)
  useEffect(() => {
    let unsub = null;

    // Force an initial server fetch so config changes in Firestore reflect immediately,
    // even if the browser previously cached older data.
    (async () => {
      try {
        const snap = await getDocFromServer(doc(db, C("settings"), "app"));
        const data = snap.exists() ? (snap.data() || {}) : null;
        if (data) setAppSettings(data);
      } catch (err) {
        console.warn("Failed to fetch settings/app from server:", err);
      } finally {
        if (!didFirstLoadRef.current) {
          setIsLoading(false);
          didFirstLoadRef.current = true;
        }
      }

      // Live updates (realtime)
      try {
        unsub = onSnapshot(
          doc(db, C("settings"), "app"),
          (snap) => {
            const data = snap.exists() ? (snap.data() || {}) : null;
            if (data) setAppSettings(data);
          },
          (err) => {
            console.warn("Failed to listen settings/app:", err);
          }
        );
      } catch (err) {
        console.warn("Failed to setup settings listener:", err);
      }
    })();

    return () => {
      try { unsub && unsub(); } catch {}
    };
  }, []);

// Firestore subscriptions (hanya setelah login)
  useEffect(() => {
    if (!authReady || !firebaseUser) {
      return;
    }
  
// Real-time updates dari Firestore untuk Master Data (sekaligus cache ke local storage)
  const unsubTrucks = onSnapshot(collection(db, C("trucks")), (snap) => {
    const data = snap.docs
      .map((d) => ({ ...(d.data() || {}), id: (d.data() || {}).id || d.id }))
      .filter((x) => x?.isActive !== false && !x?.deletedAt);
    setTruckList(data);
  });

  // INVOICE: listen only to canonical collection bul_invoices
  // INVOICE: listen to canonical collection bul_invoices
  const invQ = query(collection(db, C("invoices")));
  const unsubInvoice = onSnapshot(invQ, (snap) => {
    const items = [];
    snap.forEach((d) => {
      const row = d.data() || {};
      items.push({ ...row, id: row.id || d.id });
    });

    // Treat missing isActive as active (backward compatible)
    const activeItems = items.filter((x) => x?.isActive !== false);

    // newest first
    activeItems.sort((a, b) =>
      String(b?.createdAt || b?.tglInvoice || b?.tanggal || '').localeCompare(
        String(a?.createdAt || a?.tglInvoice || a?.tanggal || '')
      )
    );
    setInvoiceList(activeItems);
  });

  const unsubInvoiceLegacy = null;

  const unsubMaterial = onSnapshot(collection(db, C("material")), (snap) => {
  const data = snap.docs
    .map((d) => {
      const row = d.data() || {};
      const id = row.id || d.id;
      return {
        ...row,
        id,
        // Normalisasi field umum agar UI tidak error
        isActive: row.isActive !== false,
      };
    })
    .filter((x) => x?.isActive !== false && !x?.deletedAt);
  setMaterialList(data);
});

  // Master Data: Supir
  const unsubSupir = onSnapshot(collection(db, C("supir")), (snap) => {
    const data = snap.docs
      .map((d) => {
        const row = d.data() || {};
        const id = row.id || d.id;
        return { ...row, id, isActive: row.isActive !== false };
      })
      .filter((x) => x?.isActive !== false && !x?.deletedAt);
    data.sort((a, b) => (a.namaSupir || '').localeCompare(b.namaSupir || ''));
    setSupirList(data);
  });

  // Master Data: Rute
  const unsubRute = onSnapshot(collection(db, C("rute")), (snap) => {
    const data = snap.docs
      .map((d) => {
        const row = d.data() || {};
        const id = row.id || d.id;
        return { ...row, id, isActive: row.isActive !== false };
      })
      .filter((x) => x?.isActive !== false && !x?.deletedAt);
    data.sort((a, b) => (a.rute || '').localeCompare(b.rute || ''));
    setRuteList(data);
  });

  // Master Data: Pelanggan
  const unsubPelanggan = onSnapshot(collection(db, C("pelanggan")), (snap) => {
    const data = snap.docs
      .map((d) => {
        const row = d.data() || {};
        return { ...row, id: row.id || d.id, isActive: row.isActive !== false };
      })
      .filter((x) => x?.isActive !== false && !x?.deletedAt);
    data.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    setPelangganList(data);
  });

// DATA OPERASIONAL: source of truth dari Firestore
// Backward-compatible: juga baca koleksi legacy (camelCase) bila masih ada data lama.
let sjPrimary = [];
let sjLegacy = [];

const mergeById = (a = [], b = []) => {
  const m = new Map();
  [...a, ...b].forEach((x) => {
    if (!x) return;
    const id = String(x.id ?? "");
    if (!id) return;
    const prev = m.get(id);
    if (!prev) {
      m.set(id, x);
      return;
    }
    const prevTs = String(prev.updatedAt || prev.createdAt || "");
    const nextTs = String(x.updatedAt || x.createdAt || "");
    if (nextTs > prevTs) m.set(id, x);
  });
  return Array.from(m.values());
};

const normalizeSJ = (row, docId) => {
  const id = row?.id || docId;
  const tanggalSJ = row?.tanggalSJ || row?.tglSJ || row?.tgl_sj || row?.tanggal || row?.date || "";
  return {
    ...(row || {}),
    id,
    tanggalSJ,
    isActive: row?.isActive !== false,
  };
};

const applySJ = () => {
  const all = mergeById(sjPrimary, sjLegacy).filter((x) => !x?.deletedAt);
  const merged = all.filter((x) => x?.isActive !== false);
  merged.sort((a, b) => String(b?.tanggalSJ || "").localeCompare(String(a?.tanggalSJ || "")));
  setSuratJalanList(merged);
  // SJ gagal (di-soft-lock via isActive:false) tidak ada di `merged`; kumpulkan terpisah
  // agar tab "Gagal" bisa menampilkannya untuk keperluan restore.
  const gagal = all.filter((x) => String(x?.status || "").toLowerCase() === "gagal");
  gagal.sort((a, b) => String(b?.tanggalSJ || "").localeCompare(String(a?.tanggalSJ || "")));
  setGagalSuratJalanList(gagal);
  if (!didFirstLoadRef.current) {
    setIsLoading(false);
    didFirstLoadRef.current = true;
  }
};

const unsubSuratJalan = onSnapshot(collection(db, C("surat_jalan")), (snap) => {
  sjPrimary = snap.docs.map((d) => normalizeSJ(d.data() || {}, d.id));
  applySJ();
});

// Legacy camelCase collection: only subscribe if it actually has data. Avoids an
// always-on second full-collection listener for deployments where it's long empty.
let unsubSuratJalanLegacy = () => {};
(async () => {
  try {
    const legacyProbe = await getDocs(query(collection(db, C("suratJalan")), limit(1)));
    if (!legacyProbe.empty) {
      unsubSuratJalanLegacy = onSnapshot(collection(db, C("suratJalan")), (snap) => {
        sjLegacy = snap.docs.map((d) => normalizeSJ(d.data() || {}, d.id));
        applySJ();
      });
    } else {
      console.info('[bul-monitor] Legacy bul_suratJalan kosong — listener tidak dipasang.');
    }
  } catch (e) {
    console.warn('[bul-monitor] Gagal cek legacy bul_suratJalan, listener tidak dipasang:', e.message);
  }
})();

const unsubBiaya = onSnapshot(collection(db, C("biaya")), (snap) => {
  const data = snap.docs
    .map((d) => {
      const row = d.data() || {};
      const id = row.id || d.id;
      return { ...row, id };
    })
    .filter((x) => !x?.deletedAt && x?.isActive !== false);
  setBiayaList(data);
});

const historyLogQ = query(collection(db, C("history_log")), orderBy("timestamp", "desc"), limit(HISTORY_LOG_PAGE_SIZE));
const unsubHistory = onSnapshot(historyLogQ, (snap) => {
  const data = snap.docs
    .map((d) => {
      const row = d.data() || {};
      const id = row.id || d.id;
      return { ...row, id };
    })
    // History log adalah audit trail; tampilkan walaupun entity terkait sudah non-aktif.
    .filter((x) => !x?.deletedAt);
  data.sort((a, b) => String(b?.timestamp || "").localeCompare(String(a?.timestamp || "")));
  setHistoryLog(data);
  historyLogCursorRef.current = snap.docs[snap.docs.length - 1] || null;
  setHistoryLogHasMore(snap.docs.length === HISTORY_LOG_PAGE_SIZE);
});

const unsubTransaksi = onSnapshot(collection(db, C("transaksi")), (snap) => {
  const data = snap.docs
    .map((d) => {
      const row = d.data() || {};
      const id = row.id || d.id;
      return { ...row, id };
    })
    .filter((x) => !x?.deletedAt && x?.isActive !== false);
  data.sort((a, b) => String(b?.tanggal || "").localeCompare(String(a?.tanggal || "")));
  setTransaksiList(data);
});



  // USERS: source of truth dari Firestore (tanpa password di Firestore).
  // Dokumen users/{uid} dibuat otomatis saat user pertama login (bootstrap).
  const unsubUsers = onSnapshot(collection(db, C("users")), (snap) => {
    const rows = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() || {}) }))
      // sembunyikan soft-deleted (punya deletedAt). Nonaktif (isActive=false) tetap tampil.
      .filter((u) => !(u && u.deletedAt));

    setUsersList(rows);
  });
  return () => {
    try { unsubTrucks(); } catch {}
    try { unsubSupir(); } catch {}
    try { unsubRute(); } catch {}
    try { unsubMaterial(); } catch {}
    try { unsubPelanggan(); } catch {}
try { unsubSuratJalan(); } catch {}
try { unsubSuratJalanLegacy(); } catch {}
try { unsubBiaya(); } catch {}
try { unsubInvoice(); } catch {}
try { unsubInvoiceLegacy(); } catch {}
try { unsubHistory(); } catch {}
try { unsubTransaksi(); } catch {}
    try { unsubUsers(); } catch {}
  };
// IMPORTANT: depend on authReady & firebaseUser so subscriptions are attached
// after login and after a hard refresh in production.
}, [authReady, firebaseUser]);

// Ref-mirror of the three watched lists so the single persistent integration_queue
// listener (below) always reads current state without needing to resubscribe
// whenever suratJalanList/invoiceList/transaksiList changes.
const suratJalanListRef = useRef(suratJalanList);
useEffect(() => { suratJalanListRef.current = suratJalanList; }, [suratJalanList]);
const invoiceListRef = useRef(invoiceList);
useEffect(() => { invoiceListRef.current = invoiceList; }, [invoiceList]);
const transaksiListRef = useRef(transaksiList);
useEffect(() => { transaksiListRef.current = transaksiList; }, [transaksiList]);

// Dengarkan perubahan status integrasi (SJ/Invoice/Transaksi) dari bul-accounting
// (approve/reject/cancel) — satu query listener untuk semuanya (lihat Design decision
// di plan Task 8 untuk kenapa 'rejected' punya guard status eksplisit di sini).
useEffect(() => {
  if (!authReady || !firebaseUser) return;

  const unsub = subscribeIntegrationQueueUpdates(async (docId, data) => {
    if (data.type === 'uang_jalan') {
      const sj = suratJalanListRef.current.find(s => s.id === data.sourceSjId);
      if (!sj) return;
      if (data.status === 'approved' && sj.status !== 'terkunci') {
        await updateSuratJalan(sj.id, {
          status: 'terkunci',
          accountingJournalId: data.journalId,
          accountingApprovedAt: data.updatedAt,
          accountingReviewedBy: data.reviewedBy,
        });
      } else if (data.status === 'rejected' && sj.status === 'menunggu_review') {
        await updateSuratJalan(sj.id, {
          status: 'terkirim',
          integrationQueueId: null,
          sentToAccountingAt: null,
          accountingRejectedAt: data.updatedAt,
          accountingRejectionReason: data.rejectionReason,
        });
        setAlertMessage(`⚠️ SJ ${sj.nomorSJ} ditolak oleh akuntan.\nAlasan: ${data.rejectionReason || '-'}\nData dapat diedit dan dikirim ulang.`);
      } else if (data.status === 'cancelled' && sj.status === 'terkunci') {
        await updateSuratJalan(sj.id, {
          status: 'terkirim',
          integrationQueueId: null,
          sentToAccountingAt: null,
          accountingJournalId: null,
          accountingApprovedAt: null,
          accountingReviewedBy: null,
          accountingCancelledAt: data.updatedAt,
          accountingCancellationReason: data.cancellationReason,
        });
        setAlertMessage(`⚠️ Jurnal SJ ${sj.nomorSJ} dibatalkan oleh akuntan.\nAlasan: ${data.cancellationReason || '-'}\nData dapat diedit dan dikirim ulang.`);
      }
    } else if (data.type === 'invoice') {
      const invoice = invoiceListRef.current.find(inv => inv.id === data.sourceInvoiceId);
      if (!invoice) return;
      const invRef = doc(db, C("invoices"), invoice.id);
      if (data.status === 'approved' && invoice.integrationStatus !== 'terkunci') {
        await updateDoc(invRef, sanitizeForFirestore({
          integrationStatus: 'terkunci',
          accountingJournalId: data.journalId,
          accountingApprovedAt: data.updatedAt,
          accountingReviewedBy: data.reviewedBy,
          updatedAt: new Date().toISOString(),
        }));
      } else if (data.status === 'rejected' && invoice.integrationStatus === 'menunggu_review') {
        await updateDoc(invRef, sanitizeForFirestore({
          integrationStatus: null,
          integrationQueueId: null,
          sentToAccountingAt: null,
          accountingRejectedAt: data.updatedAt,
          accountingRejectionReason: data.rejectionReason,
          updatedAt: new Date().toISOString(),
        }));
        setAlertMessage(`⚠️ Invoice ${invoice.noInvoice} ditolak oleh akuntan.\nAlasan: ${data.rejectionReason || '-'}\nInvoice dapat dikirim ulang.`);
      } else if (data.status === 'cancelled' && invoice.integrationStatus === 'terkunci') {
        await updateDoc(invRef, sanitizeForFirestore({
          integrationStatus: null,
          integrationQueueId: null,
          sentToAccountingAt: null,
          accountingJournalId: null,
          accountingApprovedAt: null,
          accountingReviewedBy: null,
          accountingCancelledAt: data.updatedAt,
          accountingCancellationReason: data.cancellationReason,
          updatedAt: new Date().toISOString(),
        }));
        setAlertMessage(`⚠️ Jurnal Invoice ${invoice.noInvoice} dibatalkan oleh akuntan.\nAlasan: ${data.cancellationReason || '-'}\nInvoice dapat dikirim ulang.`);
      }
    } else if (data.type === 'transaksi_kas') {
      const transaksi = transaksiListRef.current.find(t => t.id === data.sourceTransaksiId);
      if (!transaksi) return;
      const trxRef = doc(db, C('transaksi'), transaksi.id);
      if (data.status === 'approved' && transaksi.integrationStatus !== 'terkunci') {
        await updateDoc(trxRef, {
          integrationStatus: 'terkunci',
          accountingJournalId: data.journalId,
          accountingApprovedAt: data.updatedAt,
          accountingReviewedBy: data.reviewedBy,
          updatedAt: new Date().toISOString(),
        });
      } else if (data.status === 'rejected' && transaksi.integrationStatus === 'menunggu_review') {
        await updateDoc(trxRef, {
          integrationStatus: null,
          integrationQueueId: null,
          sentToAccountingAt: null,
          accountingRejectedAt: data.updatedAt,
          accountingRejectionReason: data.rejectionReason,
          updatedAt: new Date().toISOString(),
        });
        setAlertMessage(`⚠️ Transaksi "${transaksi.keterangan}" ditolak oleh akuntan.\nAlasan: ${data.rejectionReason || '-'}\nTransaksi dapat dikirim ulang.`);
      } else if (data.status === 'cancelled' && transaksi.integrationStatus === 'terkunci') {
        await updateDoc(trxRef, {
          integrationStatus: null,
          integrationQueueId: null,
          sentToAccountingAt: null,
          accountingJournalId: null,
          accountingApprovedAt: null,
          accountingCancelledAt: data.updatedAt,
          accountingCancellationReason: data.cancellationReason,
          updatedAt: new Date().toISOString(),
        });
        setAlertMessage(`⚠️ Jurnal transaksi "${transaksi.keterangan}" dibatalkan oleh akuntan.\nAlasan: ${data.cancellationReason || '-'}`);
      }
    }
  });

  return () => unsub();
}, [authReady, firebaseUser]);

  // Reconcile/backfill transaksi uang jalan dari Surat Jalan yang sudah terlanjur ada (mis. hasil import lama)
  // Aman dijalankan berulang karena menggunakan deterministic ID dan pengecekan transaksi existing.
  const didReconcileUangJalanRef = useRef(false);

  useEffect(() => {
    if (!canWriteTransaksi) return;
    if (didReconcileUangJalanRef.current) return;

    if (!Array.isArray(suratJalanList) || !Array.isArray(transaksiList)) return;
    if (suratJalanList.length === 0) return;

    // Index transaksi existing by suratJalanId
    const existingSJIds = new Set(
      transaksiList
        .filter((t) => t?.suratJalanId)
        .map((t) => String(t.suratJalanId))
    );

    const missing = suratJalanList.filter((sj) => {
      if (!sj || sj.isActive === false) return false;
      const status = String(sj.status || "").toLowerCase();
      if (status === "gagal") return false;

      const nominal = Number(sj.uangJalan || 0);
      if (!(nominal > 0)) return false;

      return !existingSJIds.has(String(sj.id));
    });

    if (missing.length === 0) {
      didReconcileUangJalanRef.current = true;
      return;
    }

    (async () => {
      for (const sj of missing) {
        try {
          await upsertUangJalanTransaksiForSJ(sj);
        } catch (e) {
          console.warn("Reconcile uang jalan gagal:", e);
        }
      }
      didReconcileUangJalanRef.current = true;
    })();
  }, [canWriteTransaksi, suratJalanList, transaksiList]);


  if (!currentUser) {
    return <LoginScreen onLogin={handleLogin} alertMessage={alertMessage} setAlertMessage={setAlertMessage} appSettings={appSettings} />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Package className="w-16 h-16 text-green-600 animate-pulse mx-auto mb-4" />
          <p className="text-gray-600">Memuat data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-40">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-600 to-green-800 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              {/* Logo or Icon */}
              {appSettings?.logoUrl ? (
                <img 
                  src={appSettings.logoUrl} 
                  alt="Logo" 
                  className="h-10 object-contain bg-white rounded p-1"
                />
              ) : (
                <Package className="w-8 h-8" />
              )}
              
              <div>
                {/* Company Name */}
                {appSettings?.companyName && (
                  <p className="text-sm text-green-100 font-semibold">{appSettings.companyName}</p>
                )}
                <h1 className="text-2xl font-bold">BUL Monitor</h1>
                <p className="text-green-100 text-sm">Sistem Tracking & Monitoring Biaya</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <p className="font-semibold">{currentUser.name}</p>
                <p className="text-green-100 text-sm capitalize">{effectiveRole}</p>
              </div>
              <button
                onClick={handleLogout}
                className="bg-green-700 hover:bg-green-600 px-4 py-2 rounded-lg flex items-center space-x-2 transition"
              >
                <LogOut className="w-4 h-4" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      {effectiveRole && (
        <div className="bg-gray-50 max-w-7xl mx-auto px-6 py-4">
          <div className="flex flex-wrap gap-3 bg-white/80 backdrop-blur rounded-2xl p-3 shadow-sm">
            {/* Semua role yang login boleh lihat Surat Jalan (read-only untuk non-admin_sj) */}
            <button
              onClick={() => setActiveTab("surat-jalan")}
              className={`px-4 py-2 rounded-xl font-medium flex items-center gap-2 ${activeTab === "surat-jalan" ? "bg-green-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
            >
              <span>📦</span> Surat Jalan
            </button>

            {/* Keuangan: superadmin/admin_keuangan + reader(owner=reader) */}
            {["superadmin", "admin_keuangan", "reader"].includes(effectiveRole) && (
              <button
                onClick={() => setActiveTab("keuangan")}
                className={`px-4 py-2 rounded-xl font-medium flex items-center gap-2 ${activeTab === "keuangan" ? "bg-green-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
              >
                <span>💵</span> Keuangan
              </button>
            )}

            {/* Laporan Kas: semua role yang login */}
            {["superadmin", "admin_keuangan", "admin_invoice", "admin_sj", "reader"].includes(effectiveRole) && (
              <button
                onClick={() => setActiveTab("laporan-kas")}
                className={`px-4 py-2 rounded-xl font-medium flex items-center gap-2 ${activeTab === "laporan-kas" ? "bg-green-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
              >
                <span>📑</span> Laporan Kas
              </button>
            )}

            {/* Invoicing: superadmin/admin_invoice + reader(owner=reader) */}
            {["superadmin", "admin_invoice", "reader"].includes(effectiveRole) && (
              <button
                onClick={() => setActiveTab("invoicing")}
                className={`px-4 py-2 rounded-xl font-medium flex items-center gap-2 ${activeTab === "invoicing" ? "bg-green-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
              >
                <span>🧾</span> Invoicing
              </button>
            )}

            {/* Menu admin-only */}
            {effectiveRole === "superadmin" && (
              <>
                <button
                  onClick={() => setActiveTab("master-data")}
                  className={`px-4 py-2 rounded-xl font-medium flex items-center gap-2 ${activeTab === "master-data" ? "bg-green-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
                >
                  <span>📋</span> Master Data
                </button>

                <button
                  onClick={() => setActiveTab("users")}
                  className={`px-4 py-2 rounded-xl font-medium flex items-center gap-2 ${activeTab === "users" ? "bg-green-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
                >
                  <span>👥</span> Kelola User
                </button>

                <button
                  onClick={() => setActiveTab("settings")}
                  className={`px-4 py-2 rounded-xl font-medium flex items-center gap-2 ${activeTab === "settings" ? "bg-green-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
                >
                  <span>⚙️</span> Settings
                </button>
              </>
            )}
          </div>
        </div>
      )}
      </div>{/* end sticky */}

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 pb-10">
        {activeTab === 'settings' && effectiveRole === 'superadmin' ? (
          <SettingsManagement
            currentUser={currentUser}
            appSettings={appSettings}
            onUpdateSettings={updateSettings}
          />
        ) : activeTab === 'users' && effectiveRole === 'superadmin' ? (
          <UsersManagement
            usersList={usersList}
            currentUser={currentUser}
            onAddUser={() => {
              setModalType('addUser');
              setSelectedItem(null);
              setShowModal(true);
            }}
            onEditUser={(user) => {
              setModalType('editUser');
              setSelectedItem(user);
              setShowModal(true);
            }}
            onDeleteUser={deleteUser}
            onToggleActive={toggleUserActive}
          />
        ) : activeTab === 'master-data' && effectiveRole === 'superadmin' ? (
          <MasterDataManagement
            truckList={truckList}
            supirList={supirList}
            ruteList={ruteList}
            materialList={materialList}
            pelangganList={pelangganList}
            currentUser={currentUser}
            onAddTruck={() => {
              setModalType('addTruck');
              setSelectedItem(null);
              setShowModal(true);
            }}
            onEditTruck={(truck) => {
              setModalType('editTruck');
              setSelectedItem(truck);
              setShowModal(true);
            }}
            onDeleteTruck={deleteTruck}
            onAddSupir={() => {
              setModalType('addSupir');
              setSelectedItem(null);
              setShowModal(true);
            }}
            onEditSupir={(supir) => {
              setModalType('editSupir');
              setSelectedItem(supir);
              setShowModal(true);
            }}
            onDeleteSupir={deleteSupir}
            onAddRute={() => {
              setModalType('addRute');
              setSelectedItem(null);
              setShowModal(true);
            }}
            onEditRute={(rute) => {
              setModalType('editRute');
              setSelectedItem(rute);
              setShowModal(true);
            }}
            onDeleteRute={deleteRute}
            onAddMaterial={() => {
              setModalType('addMaterial');
              setSelectedItem(null);
              setShowModal(true);
            }}
            onEditMaterial={(material) => {
              setModalType('editMaterial');
              setSelectedItem(material);
              setShowModal(true);
            }}
            onDeleteMaterial={deleteMaterial}
            onAddPelanggan={() => { setModalType('addPelanggan'); setSelectedItem(null); setShowModal(true); }}
            onEditPelanggan={(p) => { setModalType('editPelanggan'); setSelectedItem(p); setShowModal(true); }}
            onDeletePelanggan={deletePelanggan}
            onMigratePelanggan={migratePelangganFromSupir}
            onDownloadTemplate={downloadTemplate}
            onImportData={importData}
          />
        ) : activeTab === 'keuangan' ? (
          <KeuanganManagement
            transaksiList={transaksiList}
            suratJalanList={suratJalanList}
            currentUser={currentUser}
            onKirimTransaksiKeAccounting={handleKirimTransaksiKeAccounting}
            onAddTransaksi={() => {
              setModalType('addTransaksi');
              setSelectedItem(null);
              setShowModal(true);
            }}
            onDeleteTransaksi={deleteTransaksi}
          />
        ) : activeTab === 'laporan-kas' ? (
          <LaporanKas
            suratJalanList={suratJalanList}
            transaksiList={transaksiList}
            formatCurrency={formatCurrency}
          />
        ) : activeTab === 'invoicing' ? (
          <InvoiceManagement
            invoiceList={invoiceList}
            suratJalanList={suratJalanList}
            currentUser={currentUser}
            onAddInvoice={() => {
              setModalType('addInvoice');
              setSelectedItem(null);
              setShowModal(true);
            }}
            onDeleteInvoice={deleteInvoice}
            onKirimInvoiceKeAccounting={handleKirimInvoiceKeAccounting}
            onBulkKirimInvoiceKeAccounting={handleBulkKirimInvoiceKeAccounting}
            formatCurrency={formatCurrency}
          />
        ) : (
          <>
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <StatCard
            title="Total Surat Jalan"
            value={suratJalanList.length}
            icon={<FileText className="w-6 h-6" />}
            color="bg-green-500"
          />
          <StatCard
            title="Pending"
            value={suratJalanList.filter(s => s.status === 'pending').length}
            icon={<Clock className="w-6 h-6" />}
            color="bg-yellow-500"
          />
          <StatCard
            title="Terkirim"
            value={suratJalanList.filter(s => s.status === 'terkirim').length}
            icon={<CheckCircle className="w-6 h-6" />}
            color="bg-green-500"
          />
        </div>

        {/* Actions & Filters */}
        <div className="bg-white rounded-lg shadow-md p-4 mb-6">
          {showSJRecapPanel && (
            <div className="mb-4 border border-blue-100 rounded-lg p-4 bg-blue-50">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Berdasarkan Tanggal</label>
                  <select value={sjRecapDateField} onChange={(e) => setSjRecapDateField(e.target.value)} className="w-full border rounded-lg px-3 py-2">
                    <option value="tanggalSJ">Tanggal SJ</option>
                    <option value="tglTerkirim">Tanggal Terkirim</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Tanggal Mulai</label>
                  <input type="date" value={sjRecapStartDate} onChange={(e) => setSjRecapStartDate(e.target.value)} className="w-full border rounded-lg px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Tanggal Akhir</label>
                  <input type="date" value={sjRecapEndDate} onChange={(e) => setSjRecapEndDate(e.target.value)} className="w-full border rounded-lg px-3 py-2" />
                </div>
                <div className="flex items-end">
                  <button onClick={() => downloadSJRecapToExcel(suratJalanList, { startDate: sjRecapStartDate, endDate: sjRecapEndDate, dateField: sjRecapDateField })} className="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition">
                    <Download className="w-4 h-4" />
                    <span>Download Excel</span>
                  </button>
                </div>
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-3 items-center justify-between">
            <div className="flex gap-2 flex-wrap">
              {(effectiveRole === 'superadmin' || effectiveRole === 'admin_sj') && (
                <>
                  <button
                    onClick={() => {
                      setModalType('addSJ');
                      setSelectedItem(null);
                      setShowModal(true);
                    }}
                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Tambah Surat Jalan</span>
                  </button>
                  
                  <button
                    onClick={() => downloadTemplate('suratjalan')}
                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition"
                  >
                    <FileText className="w-4 h-4" />
                    <span>Download Template</span>
                  </button>
                  
                  <label className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition cursor-pointer">
                    <Package className="w-4 h-4" />
                    <span>Import Data</span>
                    <input
                      type="file"
                      accept=".csv"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) importData('suratjalan', file);
                        e.target.value = '';
                      }}
                      className="hidden"
                    />
                  </label>

                  <button
                    onClick={() => downloadTemplate('biaya')}
                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition"
                  >
                    <FileText className="w-4 h-4" />
                    <span>Template Biaya</span>
                  </button>

                  <label className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition cursor-pointer">
                    <Package className="w-4 h-4" />
                    <span>Import Biaya</span>
                    <input
                      type="file"
                      accept=".csv"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) importData('biaya', file);
                        e.target.value = '';
                      }}
                      className="hidden"
                    />
                  </label>

                  {suratJalanList.some(sj => sj.createdBy === 'Import') && (
                    <button
                      onClick={deleteImportedSJ}
                      className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Hapus Hasil Import ({suratJalanList.filter(sj => sj.createdBy === 'Import').length})</span>
                    </button>
                  )}

                  <button
                    onClick={() => setShowSJRecapPanel((prev) => !prev)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Rekapan</span>
                  </button>
                </>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => { setFilter('all'); setSelectedBatalSJIds(new Set()); setSelectedSJIds(new Set()); }}
                className={`px-4 py-2 rounded-lg transition ${filter === 'all' ? 'bg-green-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
              >
                Semua
              </button>
              <button
                onClick={() => { setFilter('pending'); setSelectedBatalSJIds(new Set()); setSelectedSJIds(new Set()); }}
                className={`px-4 py-2 rounded-lg transition ${filter === 'pending' ? 'bg-yellow-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
              >
                Pending
              </button>
              <button
                onClick={() => { setFilter('terkirim'); setSelectedBatalSJIds(new Set()); setSelectedSJIds(new Set()); }}
                className={`px-4 py-2 rounded-lg transition ${filter === 'terkirim' ? 'bg-green-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
              >
                Terkirim
              </button>
              <button
                onClick={() => { setFilter('menunggu_review'); setSelectedBatalSJIds(new Set()); setSelectedSJIds(new Set()); }}
                className={`px-4 py-2 rounded-lg transition flex items-center space-x-1 ${filter === 'menunggu_review' ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
              >
                <span>Menunggu Review</span>
                {pendingReviewCount > 0 && (
                  <span className={`text-xs font-bold rounded-full px-1.5 py-0.5 ${filter === 'menunggu_review' ? 'bg-white text-blue-600' : 'bg-blue-600 text-white'}`}>
                    {pendingReviewCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => { setFilter('terkunci'); setSelectedBatalSJIds(new Set()); setSelectedSJIds(new Set()); }}
                className={`px-4 py-2 rounded-lg transition ${filter === 'terkunci' ? 'bg-gray-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
              >
                Terkunci
              </button>
              <button
                onClick={() => { setFilter('gagal'); setSelectedBatalSJIds(new Set()); setSelectedSJIds(new Set()); }}
                className={`px-4 py-2 rounded-lg transition flex items-center space-x-1 ${filter === 'gagal' ? 'bg-red-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
              >
                <span>Gagal</span>
                {gagalSuratJalanList.length > 0 && (
                  <span className={`text-xs font-bold rounded-full px-1.5 py-0.5 ${filter === 'gagal' ? 'bg-white text-red-600' : 'bg-red-600 text-white'}`}>
                    {gagalSuratJalanList.length}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Bulk Kirim Bar — hanya tampil untuk superadmin jika ada SJ eligible di view */}
        {effectiveRole === 'superadmin' && eligibleInView.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer select-none text-sm font-medium text-blue-800">
              <input
                type="checkbox"
                checked={allInViewSelected}
                onChange={toggleSelectAll}
                className="w-4 h-4 accent-blue-600"
              />
              {allInViewSelected ? 'Batalkan Semua' : `Pilih Semua (${eligibleInView.length} SJ eligible)`}
            </label>
            {selectedInView.length > 0 && (
              <>
                <span className="text-blue-600 text-sm">{selectedInView.length} dipilih</span>
                <button
                  onClick={handleBulkKirimSJKeAccounting}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg text-sm flex items-center gap-2 transition"
                >
                  <Send className="w-4 h-4" />
                  Kirim {selectedInView.length} SJ ke Accounting
                </button>
                <button
                  onClick={() => setSelectedSJIds(new Set())}
                  className="text-blue-600 hover:text-blue-800 text-sm underline"
                >
                  Batalkan Pilihan
                </button>
              </>
            )}
          </div>
        )}

        {/* Bulk Batalkan Bar — hanya untuk superadmin jika ada SJ eligible di view */}
        {effectiveRole === 'superadmin' && eligibleBatalInView.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer select-none text-sm font-medium text-red-800">
              <input
                type="checkbox"
                checked={allBatalInViewSelected}
                onChange={toggleSelectAllBatal}
                className="w-4 h-4 accent-red-600"
              />
              {allBatalInViewSelected ? 'Batalkan Semua Pilihan' : `Pilih Semua untuk Batalkan (${eligibleBatalInView.length} SJ)`}
            </label>
            {selectedBatalInView.length > 0 && (
              <>
                <span className="text-red-600 text-sm">{selectedBatalInView.length} dipilih</span>
                <button
                  onClick={handleBulkBatalkanSJ}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-1.5 rounded-lg text-sm flex items-center gap-2 transition"
                >
                  <XCircle className="w-4 h-4" />
                  Batalkan {selectedBatalInView.length} SJ
                </button>
                <button
                  onClick={() => setSelectedBatalSJIds(new Set())}
                  className="text-red-600 hover:text-red-800 text-sm underline"
                >
                  Batal Pilih
                </button>
              </>
            )}
          </div>
        )}

        {/* Surat Jalan List */}
        <div className="space-y-4">
          {filteredSuratJalan.length === 0 ? (
            <div className="bg-white rounded-lg shadow-md p-8 text-center">
              <Package className="w-16 h-16 mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500">Belum ada data Surat Jalan</p>
              {(effectiveRole === 'admin' || effectiveRole === 'gudang') && (
                <button
                  onClick={() => {
                    setModalType('addSJ');
                    setSelectedItem(null);
                    setShowModal(true);
                  }}
                  className="mt-4 bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg inline-flex items-center space-x-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tambah Surat Jalan Pertama</span>
                </button>
              )}
            </div>
          ) : (
            filteredSuratJalan.map(sj => (
              <SuratJalanCard
                key={sj.id}
                suratJalan={sj}
                biayaList={biayaList.filter(b => b.suratJalanId === sj.id)}
                totalBiaya={getTotalBiaya(sj.id)}
                currentUser={currentUser}
                onUpdate={(sj) => {
                  setSelectedItem(sj);
                  setModalType('markTerkirim');
                  setShowModal(true);
                }}
                onEditTerkirim={(sj) => {
                  setSelectedItem(sj);
                  setModalType('editTerkirim');
                  setShowModal(true);
                }}
                onMarkGagal={markAsGagal}
                onRestore={restoreFromGagal}
                onKirimKeAccounting={handleKirimSJKeAccounting}
                onDeleteBiaya={deleteBiaya}
                formatCurrency={formatCurrency}
                getStatusColor={getStatusColor}
                getStatusIcon={getStatusIcon}
                isSelected={selectedSJIds.has(sj.id)}
                isSelectable={effectiveRole === 'superadmin' && isSJEligibleForBulkKirim(sj)}
                onToggleSelect={() => toggleSelectSJ(sj.id)}
                isBatalSelectable={effectiveRole === 'superadmin' && isSJEligibleForBulkBatalkan(sj)}
                isBatalSelected={selectedBatalSJIds.has(sj.id)}
                onToggleBatalSelect={() => toggleSelectBatalSJ(sj.id)}
              />
            ))
          )}
        </div>
        </>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <Modal
          type={modalType}
          selectedItem={selectedItem}
          currentUser={currentUser}
          setAlertMessage={setAlertMessage}
          truckList={truckList}
          supirList={supirList}
          ruteList={ruteList}
          materialList={materialList}
          suratJalanList={suratJalanList}
          pelangganList={pelangganList}
          onClose={() => setShowModal(false)}
          onSubmit={async (data) => {
            if (modalType === 'addSJ') {
              addSuratJalan(data);
              setShowModal(false);
            } else if (modalType === 'markTerkirim' || modalType === 'editTerkirim') {
              await updateSuratJalan(selectedItem.id, {
                status: 'terkirim',
                tglTerkirim: data.tglTerkirim,
                qtyBongkar: parseFloat(data.qtyBongkar)
              });
              if (data.biayaTambahan && data.biayaTambahan.length > 0) {
                for (const biaya of data.biayaTambahan) {
                  const { tempId, ...biayaData } = biaya;
                  await addBiaya({ ...biayaData, suratJalanId: selectedItem.id });
                }
              }
              setShowModal(false);
            } else if (modalType === 'addTransaksi') {
              await addTransaksi(data);
              setShowModal(false);
            } else if (modalType === 'addUser') {
              const success = await addUser(data);
              if (success) {
                setShowModal(false);
              }
            } else if (modalType === 'editUser') {
              await updateUser(selectedItem.id, data);
              setShowModal(false);
            } else if (modalType === 'addTruck') {
              await addTruck(data);
              setShowModal(false);
            } else if (modalType === 'editTruck') {
              await updateTruck(selectedItem.id, data);
              setShowModal(false);
            } else if (modalType === 'addSupir') {
              await addSupir(data);
              setShowModal(false);
            } else if (modalType === 'editSupir') {
              await updateSupir(selectedItem.id, data);
              setShowModal(false);
            } else if (modalType === 'addRute') {
              await addRute(data);
              setShowModal(false);
            } else if (modalType === 'editRute') {
              await updateRute(selectedItem.id, data);
              setShowModal(false);
            } else if (modalType === 'addMaterial') {
              await addMaterial(data);
              setShowModal(false);
            } else if (modalType === 'editMaterial') {
              await updateMaterial(selectedItem.id, data);
              setShowModal(false);
            } else if (modalType === 'addPelanggan') {
              await addPelanggan(data);
              setShowModal(false);
            } else if (modalType === 'editPelanggan') {
              await updatePelanggan(selectedItem.id, data);
              setShowModal(false);
            } else if (modalType === 'addInvoice') {
              await addInvoice(data);
              setShowModal(false);
            } else if (modalType === 'editInvoice') {
              await editInvoice(selectedItem.id, data);
              setShowModal(false);
            }
          }}
        />
      )}

      {/* Alert Dialog */}
      {alertMessage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center space-x-3 mb-4">
              <AlertCircle className="w-6 h-6 text-green-600" />
              <h2 className="text-xl font-bold text-gray-800">Informasi</h2>
            </div>
            <p className="text-gray-700 whitespace-pre-line mb-6">{alertMessage}</p>
            <button
              onClick={() => setAlertMessage('')}
              className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg transition font-medium"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      {confirmDialog.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center space-x-3 mb-4">
              <AlertCircle className="w-6 h-6 text-orange-600" />
              <h2 className="text-xl font-bold text-gray-800">Konfirmasi</h2>
            </div>
            <p className="text-gray-700 mb-6">{confirmDialog.message}</p>
            <div className="flex space-x-3">
              <button
                onClick={() => setConfirmDialog({ show: false, message: '', onConfirm: null })}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 py-2 rounded-lg transition font-medium"
              >
                Batal
              </button>
              <button
                onClick={confirmDialog.onConfirm}
                className={`flex-1 py-2 rounded-lg transition font-medium text-white ${
                  confirmDialog.confirmVariant === 'primary'
                    ? 'bg-blue-600 hover:bg-blue-700'
                    : confirmDialog.confirmVariant === 'success'
                    ? 'bg-green-600 hover:bg-green-700'
                    : confirmDialog.confirmVariant === 'warning'
                    ? 'bg-orange-500 hover:bg-orange-600'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {confirmDialog.confirmLabel || 'Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuratJalanMonitor;