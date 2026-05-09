import {collection, doc, writeBatch, onSnapshot, getDoc, getDocFromServer, setDoc, updateDoc, getDocs, query, where, limit} from "firebase/firestore";
import { db, auth, ensureAuthed, authUserCreator } from "./config/firebase-config";
import {
  kirimUangJalanKeAccounting,
  kirimInvoiceKeAccounting,
  kirimTransaksiKasKeAccounting,
  subscribeIntegrationStatusSJ,
  subscribeIntegrationStatusInvoice,
  subscribeIntegrationStatusTransaksi,
  isBridgeReady,
} from "./integrationService.js";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword } from "firebase/auth";
import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';

// Namespace koleksi untuk BUL-monitor (pisah total dari app lain)
// NOTE: Keep this near the top so ALL helpers (including login/bootstrap writes) are consistent.
const C = (name) => {
  const n = String(name || "").trim();
  if (!n) return "";
  return n.startsWith("bul_") ? n : `bul_${n}`;
};

// ===== Auto Transaksi Uang Jalan (derived from Surat Jalan) =====
// Deterministic ID -> idempotent (tidak dobel meskipun sync dijalankan berkali-kali)
// NOTE: gunakan function declaration agar hoisted (dipakai oleh helper sebelum definisinya).
function buildUangJalanTransaksiId(sjId) {
  return `TX-UJ-${String(sjId)}`;
}

// Soft delete generik (set isActive=false + deletedAt/deletedBy)
// NOTE: beberapa pemanggilan lama mengirim parameter pertama 'db'. Kita dukung dua bentuk:
// 1) softDeleteItemInFirestore(db, 'collection', id, who)
// 2) softDeleteItemInFirestore('collection', id, who)
const softDeleteItemInFirestore = async (
  dbOrCollectionName,
  collectionOrDocId,
  docIdOrWho,
  maybeWho = "System"
) => {
  const hasDbArg = typeof dbOrCollectionName === "object" && dbOrCollectionName;
  const _db = hasDbArg ? dbOrCollectionName : db;
  const collectionName = hasDbArg ? collectionOrDocId : dbOrCollectionName;
  const docId = hasDbArg ? docIdOrWho : collectionOrDocId;
  const deletedBy = hasDbArg ? maybeWho : (docIdOrWho ?? "System");

  if (!collectionName || !docId) return;
  await ensureAuthed();
  const ref = doc(_db, C(collectionName), docId);
  await updateDoc(ref, {
    isActive: false,
    deletedAt: new Date().toISOString(),
    deletedBy,
  });
};

// Resolve Surat Jalan document reference by SJ ID.
// Some legacy data used auto-generated Firestore doc IDs while storing the business key in field 'id'.
// This helper makes invoice create/cancel robust for both patterns.
const resolveSuratJalanDocRef = async (sjId) => {
  const businessId = String(sjId || '').trim();
  if (!businessId) return null;

  // 1) Try docId == businessId
  try {
    const directRef = doc(db, C('surat_jalan'), businessId);
    const directSnap = await getDoc(directRef);
    if (directSnap.exists()) return directRef;
  } catch (e) {
    // ignore and fall through
  }

  // 2) Fallback: query by field id
  try {
    const q = query(collection(db, C('surat_jalan')), where('id', '==', businessId), limit(1));
    const qs = await getDocs(q);
    if (!qs.empty) return qs.docs[0].ref;
  } catch (e) {
    console.error('resolveSuratJalanDocRef failed', businessId, e);
  }
  return null;
};

// Khusus untuk koleksi transaksi: rules Firestore membatasi field yang boleh berubah
// untuk role Admin SJ. Saat pembatalan Surat Jalan, kita cukup menonaktifkan transaksi
// + update metadata tanpa menambah field deletedAt/deletedBy.
const softDeactivateTransaksiInFirestore = async (
  dbOrDocId,
  docIdOrWho,
  maybeWho = "System"
) => {
  const hasDbArg = typeof dbOrDocId === "object" && dbOrDocId;
  const _db = hasDbArg ? dbOrDocId : db;
  const docId = hasDbArg ? docIdOrWho : dbOrDocId;
  const updatedBy = hasDbArg ? maybeWho : (docIdOrWho ?? "System");

  if (!docId) return;
  await ensureAuthed();
  const ref = doc(_db, C("transaksi"), docId);
  await updateDoc(ref, {
    isActive: false,
    updatedAt: new Date().toISOString(),
    updatedBy,
  });
};

// Best-effort: nonaktifkan transaksi uang jalan yang terikat ke Surat Jalan.
// Ada kasus legacy (transaksi lama tidak menyimpan suratJalanId / id tidak deterministik),
// jadi kita coba beberapa strategi.
const deactivateUangJalanTransaksiForSJ = async (sj, userName = "System") => {
  // Deactivate (soft delete) transaksi Uang Jalan yang terkait SJ.
  // Jangan bergantung pada state transaksiList (bisa stale / tidak tersedia di scope).
  // Gunakan ID deterministik: TX-UJ-{SJ_ID} = buildUangJalanTransaksiId(sj.id)
  try {
    if (!sj?.id) return null;

    const txId = buildUangJalanTransaksiId(sj.id);
    const txRef = doc(db, C("transaksi"), txId);
    const txSnap = await getDoc(txRef);

    if (!txSnap.exists()) {
      // Tidak ada transaksi yang perlu dideactivate (mis. SJ pending tanpa uang jalan)
      return null;
    }

    const txData = txSnap.data() || {};

    // Jika sudah nonaktif, tidak perlu update lagi
    if (txData.isActive === false) return { id: txId, ...txData };

    // Penting: untuk kompatibilitas rules (role admin_sj), JANGAN menambah field baru.
    // Cukup set isActive=false + metadata update.
    const nowIso = new Date().toISOString();
    await updateDoc(txRef, {
      isActive: false,
      updatedAt: nowIso,
      updatedBy: userName,
    });

    return { id: txId, ...txData, isActive: false, updatedAt: nowIso, updatedBy: userName };
  } catch (error) {
    console.error("Soft delete transaksi uang jalan gagal:", error);
    return null;
  }
};


// Generate a per-login session id used to enforce single active session per user
const generateSessionId = () => {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch (_) {}
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

// === Helpers (single source) ===
const formatCurrency = (amount) => {
  const n = Number(amount || 0);
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(n);
};

// Format date value into Indonesian display (dd/mm/yyyy).
// Accepts: "YYYY-MM-DD", ISO strings, Date objects.
const formatTanggalID = (value) => {
  if (!value) return "-";
  try {
    const d = value instanceof Date ? value : new Date(value);

    // Fallback for plain YYYY-MM-DD strings or invalid Date parsing
    if (Number.isNaN(d.getTime())) {
      if (typeof value === "string") {
        const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) return `${m[3]}/${m[2]}/${m[1]}`;
      }
      return String(value);
    }

    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  } catch {
    return String(value);
  }
};

const downloadSJRecapToExcel = (suratJalanList = [], options = {}) => {
  const { startDate = '', endDate = '', dateField = 'tanggalSJ' } = options || {};

  const normDate = (v) => {
    if (!v) return '';
    if (typeof v === 'string') return v.slice(0, 10);
    try {
      return new Date(v).toISOString().slice(0, 10);
    } catch {
      return '';
    }
  };

  const start = normDate(startDate);
  const end = normDate(endDate);

  const filtered = (Array.isArray(suratJalanList) ? suratJalanList : []).filter((sj) => {
    const d = normDate(sj?.[dateField]);
    if (!d) return false;
    if (start && d < start) return false;
    if (end && d > end) return false;
    return true;
  });

  const rows = filtered.map((sj, i) => ({
    No: i + 1,
    'Nomor SJ': sj?.nomorSJ || '',
    'Tanggal SJ': normDate(sj?.tanggalSJ),
    'Tanggal Terkirim': normDate(sj?.tglTerkirim),
    PT: sj?.pt || '',
    Supir: sj?.namaSupir || '',
    'Nomor Polisi': sj?.nomorPolisi || '',
    Rute: sj?.rute || '',
    Material: sj?.material || '',
    'Qty Isi': Number(sj?.qtyIsi || 0),
    'Qty Bongkar': Number(sj?.qtyBongkar || 0),
    Satuan: sj?.satuan || '',
    'Uang Jalan': Number(sj?.uangJalan || 0),
    Status: sj?.status || '',
    'Status Invoice': sj?.statusInvoice || '',
    'Dibuat Oleh': sj?.createdBy || '',
    'Dibuat Tanggal': normDate(sj?.createdAt),
    'Diupdate Oleh': sj?.updatedBy || '',
    'Diupdate Tanggal': normDate(sj?.updatedAt),
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);

  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  ws['!cols'] = [
    { wch: 6 }, { wch: 18 }, { wch: 14 }, { wch: 16 }, { wch: 10 }, { wch: 24 },
    { wch: 16 }, { wch: 24 }, { wch: 16 }, { wch: 10 }, { wch: 12 }, { wch: 10 },
    { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 14 }
  ];

  for (let r = 1; r <= range.e.r; r++) {
    const cell = ws[XLSX.utils.encode_cell({ r, c: 12 })];
    if (cell && typeof cell.v === 'number') cell.z = '#,##0';
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Rekapan SJ');
  const startLabel = start || 'all';
  const endLabel = end || 'all';
  const fileName = `rekapan_surat_jalan_${dateField}_${startLabel}_${endLabel}.xlsx`;
  XLSX.writeFile(wb, fileName);
};


// Remove undefined values recursively so Firestore doesn't reject the payload
const sanitizeForFirestore = (input) => {
  if (input === undefined) return undefined;
  if (input === null) return null;

  // Preserve primitives
  const t = typeof input;
  if (t === "string" || t === "number" || t === "boolean") return input;

  // Convert Date -> ISO string
  if (input instanceof Date) return input.toISOString();

  // Arrays
  if (Array.isArray(input)) {
    return input
      .map(sanitizeForFirestore)
      .filter((v) => v !== undefined);
  }

  // Objects
  if (t === "object") {
    const out = {};
    for (const [k, v] of Object.entries(input)) {
      if (v === undefined) continue;
      const sv = sanitizeForFirestore(v);
      if (sv === undefined) continue;
      out[k] = sv;
    }
    return out;
  }

  // Functions / symbols etc -> drop
  return undefined;
};

// Upsert a document by id into a collection (single source of truth for Firestore writes)
const upsertItemToFirestore = async (dbRef, collectionName, item) => {
  if (!dbRef) throw new Error("Firestore db is not initialized");
  if (!collectionName) throw new Error("collectionName is required");
  const id = item?.id ? String(item.id).trim() : "";
  if (!id) throw new Error(`Cannot upsert to ${collectionName}: missing item.id`);

  const payload = sanitizeForFirestore(item);
  await setDoc(doc(dbRef, C(collectionName), id), payload, { merge: true });
  return id;
};


import { AlertCircle, Package, Truck, FileText, DollarSign, Users, LogOut, Plus, Edit, Trash2, Eye, CheckCircle, XCircle, Clock, Search, RefreshCw, Download, Send, Lock } from 'lucide-react';

// (C helper already defined at the top)


// Searchable Select Component
const SearchableSelect = ({ options, value, onChange, placeholder, label, displayKey = 'name', valueKey = 'id' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredOptions = options.filter(option => {
    const displayValue = option[displayKey]?.toLowerCase() || '';
    return displayValue.includes(searchTerm.toLowerCase());
  });

  const selectedOption = options.find(opt => opt[valueKey] === value);

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-1">{label} *</label>
      <div className="relative">
        <div
          onClick={() => setIsOpen(!isOpen)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 cursor-pointer bg-white flex items-center justify-between"
        >
          <span className={selectedOption ? 'text-gray-800' : 'text-gray-400'}>
            {selectedOption ? selectedOption[displayKey] : placeholder}
          </span>
          <Search className="w-4 h-4 text-gray-400" />
        </div>

        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-hidden">
            <div className="p-2 border-b">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Cari..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                autoFocus
              />
            </div>
            <div className="overflow-y-auto max-h-48">
              {filteredOptions.length === 0 ? (
                <div className="p-3 text-gray-500 text-sm text-center">Tidak ada data</div>
              ) : (
                filteredOptions.map(option => (
                  <div
                    key={option[valueKey]}
                    onClick={() => {
                      onChange(option[valueKey]);
                      setIsOpen(false);
                      setSearchTerm('');
                    }}
                    className={`px-3 py-2 cursor-pointer hover:bg-green-50 ${
                      option[valueKey] === value ? 'bg-green-100 font-semibold' : ''
                    }`}
                  >
                    {option[displayKey]}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
};

// Laporan Kas Component
const LaporanKas = ({ suratJalanList, transaksiList, formatCurrency }) => {
  const [filterDari, setFilterDari] = useState('');
  const [filterSampai, setFilterSampai] = useState('');
  const [filterPT, setFilterPT] = useState('');
  const [showExportMenu, setShowExportMenu] = useState(false);

  // ===== Helpers =====
  const isActiveDoc = (d) => d?.isActive !== false && !d?.deletedAt;
	// Safe sum helper for nominal-like fields (prevents ReferenceError in Laporan Kas)
	const sumNominal = (items) => {
		if (!Array.isArray(items)) return 0;
		return items.reduce((acc, it) => {
			// support: {nominal}, {jumlah}, number-like, string-like
			const vRaw = (it && typeof it === "object")
				? (it.nominal ?? it.jumlah ?? it.amount ?? 0)
				: it;
			const v = Number(vRaw);
			return acc + (Number.isFinite(v) ? v : 0);
		}, 0);
	};

  const inDateRange = (isoDateStr) => {
    if (!filterDari && !filterSampai) return true;
    if (!isoDateStr) return false;
    const dt = new Date(String(isoDateStr).length === 10 ? `${isoDateStr}T00:00:00` : isoDateStr);
    const dari = filterDari ? new Date(filterDari) : null;
    const sampai = filterSampai ? new Date(filterSampai) : null;
    if (dari && dt < dari) return false;
    if (sampai) {
      // inclusive end date
      const end = new Date(sampai);
      end.setHours(23, 59, 59, 999);
      if (dt > end) return false;
    }
    return true;
  };

  // ===== Data sources =====
  const cleanSJ = (Array.isArray(suratJalanList) ? suratJalanList : [])
    .filter(isActiveDoc)
    .filter(sj => (sj?.status || "").toLowerCase() !== "gagal");

  const cleanTransaksi = (Array.isArray(transaksiList) ? transaksiList : [])
    .filter(isActiveDoc);

  // Unique PT list (union of both sources)
  const ptList = [...new Set([
    ...cleanSJ.map(sj => sj?.pt).filter(Boolean),
    ...cleanTransaksi.map(t => t?.pt).filter(Boolean),
  ])].sort();

  // Filtered SJ (Kas Keluar: uang jalan)
  const filteredSJ = cleanSJ.filter(sj => {
    if (filterPT && sj?.pt !== filterPT) return false;
    return inDateRange(sj?.tanggalSJ);
  });

  // Filter transaksi (basis laporan kas)
  const filteredTransaksi = cleanTransaksi.filter(t => {
    if (filterPT && t?.pt !== filterPT) return false;
    return inDateRange(t?.tanggal);
  });

  // Filtered transaksi pemasukan (Kas Masuk)
  const filteredPemasukan = filteredTransaksi.filter(t => {
    const tipe = String(t?.tipe || t?.type || '').toLowerCase();
    return tipe === 'pemasukan';
  });

  // Transaksi pengeluaran manual (bul_transaksi) yang tidak terkait Surat Jalan
  const filteredPengeluaranManual = filteredTransaksi.filter(t => {
    const tipe = String(t?.tipe || t?.type || '').toLowerCase();
    if (tipe !== 'pengeluaran') return false;
    // hanya yang murni transaksi manual, bukan uang jalan auto
    return !t?.suratJalanId;
  });

  const totalKasKeluarUangJalan = sumNominal(filteredSJ.map((sj) => ({ nominal: sj?.uangJalan })));
  const totalKasKeluarManual = sumNominal(filteredPengeluaranManual);
  const totalKasKeluar = totalKasKeluarUangJalan + totalKasKeluarManual;
  const totalKasMasuk = sumNominal(filteredPemasukan);
  const saldoKas = totalKasMasuk - totalKasKeluar;

  const jumlahSJ = filteredSJ.length;
  const rataRataPerSJ = jumlahSJ > 0 ? (totalKasKeluar / jumlahSJ) : 0;

  // Rekap per PT (keluar / masuk / saldo)
  const rekapPerPT = ptList.map(pt => {
    const sjPT = filteredSJ.filter(sj => sj?.pt === pt);
    const masukPT = filteredPemasukan.filter(t => t?.pt === pt);

    const keluarUangJalan = sumNominal(sjPT.map(sj => ({ nominal: sj?.uangJalan })));
    const keluarManualPT = sumNominal(filteredPengeluaranManual.filter(t => t?.pt === pt));
    const kasKeluar = keluarUangJalan + keluarManualPT;

    const kasMasuk = sumNominal(masukPT);
    const saldo = kasMasuk - kasKeluar;

    return {
      pt,
      jumlahSJ: sjPT.length,
      kasMasuk,
      kasKeluar,
      saldo,
    };
  }).filter(r => {
    // If a PT filter is selected, only keep that PT
    if (!filterPT) return true;
    return r.pt === filterPT;
  });

  // ===== Export / Print =====
  const exportToPrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write('<html><head><title>Laporan Kas</title>');
    printWindow.document.write('<style>');
    printWindow.document.write('body { font-family: Arial, sans-serif; padding: 20px; }');
    printWindow.document.write('h1, h2 { margin: 0 0 10px 0; }');
    printWindow.document.write('.meta { margin: 0 0 10px 0; color: #444; }');
    printWindow.document.write('table { width: 100%; border-collapse: collapse; margin-top: 10px; }');
    printWindow.document.write('th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }');
    printWindow.document.write('th { background-color: #f5f5f5; }');
    printWindow.document.write('.total { font-weight: bold; background-color: #f0f0f0; }');
    printWindow.document.write('</style></head><body>');

    printWindow.document.write('<h1>Laporan Kas</h1>');

    // Meta
    const periode = (filterDari || filterSampai)
      ? `${filterDari ? new Date(filterDari).toLocaleDateString('id-ID') : '...'} - ${filterSampai ? new Date(filterSampai).toLocaleDateString('id-ID') : '...'}`
      : 'Semua Periode';
    const ptText = filterPT ? filterPT : 'Semua PT';
    printWindow.document.write(`<p class="meta">PT: ${ptText} | Periode: ${periode}</p>`);

    // Summary
    printWindow.document.write('<h2>Ringkasan</h2>');
    printWindow.document.write('<table>');
    printWindow.document.write('<thead><tr><th>Kas Masuk</th><th>Kas Keluar (Uang Jalan)</th><th>Saldo</th><th>Jumlah SJ</th></tr></thead>');
    printWindow.document.write('<tbody>');
    printWindow.document.write(`<tr class="total"><td>${formatCurrency(totalKasMasuk)}</td><td>${formatCurrency(totalKasKeluar)}</td><td>${formatCurrency(saldoKas)}</td><td>${jumlahSJ}</td></tr>`);
    printWindow.document.write('</tbody></table>');

    // Rekap per PT
    printWindow.document.write('<h2>Rekap per PT</h2>');
    printWindow.document.write('<table>');
    printWindow.document.write('<thead><tr><th>PT</th><th>Kas Masuk</th><th>Kas Keluar</th><th>Saldo</th><th>Jumlah SJ</th></tr></thead>');
    printWindow.document.write('<tbody>');
    rekapPerPT.forEach(r => {
      printWindow.document.write(`<tr><td>${r.pt}</td><td>${formatCurrency(r.kasMasuk)}</td><td>${formatCurrency(r.kasKeluar)}</td><td>${formatCurrency(r.saldo)}</td><td>${r.jumlahSJ}</td></tr>`);
    });
    printWindow.document.write('</tbody></table>');

    // Detail pemasukan
    printWindow.document.write('<h2>Detail Kas Masuk (Transaksi Pemasukan)</h2>');
    printWindow.document.write('<table>');
    printWindow.document.write('<thead><tr><th>No</th><th>Tanggal</th><th>PT</th><th>Keterangan</th><th>Nominal</th></tr></thead>');
    printWindow.document.write('<tbody>');
    filteredPemasukan
      .slice()
      .sort((a,b)=> new Date(a?.tanggal) - new Date(b?.tanggal))
      .forEach((t, i) => {
        printWindow.document.write(
          `<tr>
            <td>${i + 1}</td>
            <td>${t?.tanggal ? new Date(t.tanggal).toLocaleDateString('id-ID') : '-'}</td>
            <td>${t?.pt || '-'}</td>
            <td>${(t?.keterangan || '').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</td>
            <td>${formatCurrency(Number(t?.nominal || 0))}</td>
          </tr>`
        );
      });
    printWindow.document.write('</tbody></table>');

    // Detail kas keluar (Transaksi pengeluaran manual)
    printWindow.document.write('<h2>Detail Kas Keluar (Transaksi Pengeluaran)</h2>');
    if (filteredPengeluaranManual.length === 0) {
      printWindow.document.write('<p>Tidak ada transaksi pengeluaran pada filter yang dipilih</p>');
    } else {
      printWindow.document.write('<table><thead><tr><th>Tanggal</th><th>PT</th><th>Keterangan</th><th>Nominal</th></tr></thead><tbody>');
      filteredPengeluaranManual
        .slice()
        .sort((a, b) => String(b?.tanggal || '').localeCompare(String(a?.tanggal || '')))
        .forEach((t) => {
          printWindow.document.write(`<tr><td>${t?.tanggal || ''}</td><td>${t?.pt || ''}</td><td>${(t?.keterangan || '').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</td><td>${formatCurrency(t?.nominal || 0)}</td></tr>`);
        });
      printWindow.document.write('</tbody></table>');
    }

    // Detail kas keluar (SJ)
    printWindow.document.write('<h2>Detail Kas Keluar (Uang Jalan dari Surat Jalan)</h2>');
    printWindow.document.write('<table>');
    printWindow.document.write('<thead><tr><th>No</th><th>Tanggal SJ</th><th>Nomor SJ</th><th>PT</th><th>Rute</th><th>Supir</th><th>Nomor Polisi</th><th>Uang Jalan</th></tr></thead>');
    printWindow.document.write('<tbody>');
    filteredSJ
      .slice()
      .sort((a,b)=> new Date(a?.tanggalSJ) - new Date(b?.tanggalSJ))
      .forEach((sj, i) => {
        printWindow.document.write(
          `<tr>
            <td>${i + 1}</td>
            <td>${sj?.tanggalSJ ? new Date(sj.tanggalSJ).toLocaleDateString('id-ID') : '-'}</td>
            <td>${sj?.nomorSJ || '-'}</td>
            <td>${sj?.pt || '-'}</td>
            <td>${sj?.rute || '-'}</td>
            <td>${sj?.supir || '-'}</td>
            <td>${sj?.nomorPolisi || '-'}</td>
            <td>${formatCurrency(Number(sj?.uangJalan || 0))}</td>
          </tr>`
        );
      });
    printWindow.document.write('</tbody></table>');

    printWindow.document.write('</body></html>');
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">📊 Laporan Kas</h2>
            <p className="text-gray-600 mt-1">Rekap Kas Masuk/Keluar berbasis Transaksi & Surat Jalan</p>
          </div>
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors"
            >
              <span>📄</span>
              <span>Export / Print</span>
            </button>
            {showExportMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border z-50">
                <button
                  onClick={() => {
                    exportToPrint();
                    setShowExportMenu(false);
                  }}
                  className="w-full px-4 py-2 text-left hover:bg-gray-50 transition-colors"
                >
                  🖨️ Print Report
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Dari Tanggal</label>
              <input
                type="date"
                value={filterDari}
                onChange={(e) => setFilterDari(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sampai Tanggal</label>
              <input
                type="date"
                value={filterSampai}
                onChange={(e) => setFilterSampai(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Filter PT</label>
              <select
                value={filterPT}
                onChange={(e) => setFilterPT(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">Semua PT</option>
                {ptList.map(pt => (
                  <option key={pt} value={pt}>{pt}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => { setFilterDari(''); setFilterSampai(''); setFilterPT(''); }}
                className="w-full bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md transition-colors"
              >
                Reset Filter
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Rekap per PT */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
          <span className="mr-2">💼</span>
          Rekap per PT
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {rekapPerPT.map(item => (
            <div key={item.pt} className="border-l-4 border-green-500 bg-gray-50 rounded-lg p-4">
              <h4 className="font-bold text-gray-800 mb-2">{item.pt}</h4>
              <div className="text-sm text-gray-600 space-y-1">
                <div className="flex justify-between"><span>Kas Masuk:</span><span className="text-green-600 font-semibold">{formatCurrency(item.kasMasuk)}</span></div>
                <div className="flex justify-between"><span>Kas Keluar:</span><span className="text-red-600 font-semibold">{formatCurrency(item.kasKeluar)}</span></div>
                <div className="flex justify-between"><span>Saldo:</span><span className="text-green-700 font-semibold">{formatCurrency(item.saldo)}</span></div>
                <div className="flex justify-between"><span>Jumlah SJ:</span><span className="font-semibold">{item.jumlahSJ}</span></div>
              </div>
            </div>
          ))}
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-green-600 text-white rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-100 text-sm">Total Kas Masuk</p>
                <p className="text-2xl font-bold">{formatCurrency(totalKasMasuk)}</p>
              </div>
              <div className="text-4xl opacity-75">⬆️</div>
            </div>
          </div>

          <div className="bg-red-600 text-white rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-red-100 text-sm">Total Kas Keluar</p>
                <p className="text-2xl font-bold">{formatCurrency(totalKasKeluar)}</p>
              </div>
              <div className="text-4xl opacity-75">⬇️</div>
            </div>
          </div>

          <div className="bg-green-600 text-white rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-100 text-sm">Saldo Kas</p>
                <p className="text-2xl font-bold">{formatCurrency(saldoKas)}</p>
              </div>
              <div className="text-4xl opacity-75">$</div>
            </div>
          </div>

          <div className="bg-gray-800 text-white rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-200 text-sm">Jumlah Surat Jalan</p>
                <p className="text-2xl font-bold">{jumlahSJ}</p>
                <p className="text-xs text-gray-300 mt-1">Rata-rata / SJ: {formatCurrency(rataRataPerSJ)}</p>
              </div>
              <div className="text-4xl opacity-75">📦</div>
            </div>
          </div>
        </div>
      </div>

      {/* Detail tables */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">📥 Detail Kas Masuk (Transaksi)</h3>

        {filteredPemasukan.length === 0 ? (
          <div className="text-center py-10 text-gray-500">Belum ada transaksi pemasukan pada filter yang dipilih</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tanggal</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">PT</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Keterangan</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Nominal</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredPemasukan
                  .slice()
                  .sort((a,b)=> new Date(a?.tanggal) - new Date(b?.tanggal))
                  .map((t) => (
                    <tr key={t.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">{t?.tanggal ? new Date(t.tanggal).toLocaleDateString('id-ID') : '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{t?.pt || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{t?.keterangan || '-'}</td>
                      <td className="px-4 py-3 text-sm text-right text-green-700 font-semibold">{formatCurrency(Number(t?.nominal || 0))}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">📤 Detail Kas Keluar (Transaksi Pengeluaran)</h3>
        {filteredPengeluaranManual.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            Belum ada transaksi pengeluaran pada filter yang dipilih
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">TANGGAL</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">PT</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">KETERANGAN</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">NOMINAL</th>
                </tr>
              </thead>
              <tbody>
                {filteredPengeluaranManual
                  .slice()
                  .sort((a, b) => String(b?.tanggal || "").localeCompare(String(a?.tanggal || "")))
                  .map((t) => (
                    <tr key={t.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-2 text-sm text-gray-700">{formatTanggalID(t.tanggal)}</td>
                      <td className="px-4 py-2 text-sm text-gray-700">{t.pt}</td>
                      <td className="px-4 py-2 text-sm text-gray-700">{t.keterangan}</td>
                      <td className="px-4 py-2 text-sm text-right text-red-600 font-semibold">{formatCurrency(t.nominal)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">📤 Detail Kas Keluar (Uang Jalan dari Surat Jalan)</h3>

        {filteredSJ.length === 0 ? (
          <div className="text-center py-10 text-gray-500">Belum ada Surat Jalan pada filter yang dipilih</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nomor SJ</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tgl SJ</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">PT</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rute</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Supir</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nomor Polisi</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Uang Jalan</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredSJ
                  .slice()
                  .sort((a,b)=> new Date(a?.tanggalSJ) - new Date(b?.tanggalSJ))
                  .map((sj) => (
                    <tr key={sj.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">{sj?.nomorSJ || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{sj?.tanggalSJ ? new Date(sj.tanggalSJ).toLocaleDateString('id-ID') : '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{sj?.pt || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{sj?.rute || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{sj?.supir || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{sj?.nomorPolisi || '-'}</td>
                      <td className="px-4 py-3 text-sm text-right text-red-700 font-semibold">{formatCurrency(Number(sj?.uangJalan || 0))}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

// Invoice Management Component
const InvoiceManagement = ({
  invoiceList,
  suratJalanList,
  currentUser,
  onAddInvoice,
  onDeleteInvoice,
  onKirimInvoiceKeAccounting,
  onBulkKirimInvoiceKeAccounting,
  formatCurrency
}) => {
  const [activeFilter, setActiveFilter] = useState('belum-terinvoice');
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState(new Set());
  const effectiveRole = (currentUser?.role === 'owner' ? 'reader' : currentUser?.role) || 'reader';

  // Reset seleksi saat pindah tab
  useEffect(() => { setSelectedInvoiceIds(new Set()); }, [activeFilter]);

  const canManageInvoice = () => {
    return effectiveRole === 'superadmin' || effectiveRole === 'admin_invoice';
  };

  // Invoice bisa dikirim ke accounting jika:
  // 1. Superadmin
  // 2. Belum pernah dikirim (integrationStatus kosong)
  // 3. Semua SJ dalam invoice sudah berstatus 'terkunci' (sudah dijurnal di accounting)
  const canKirimInvoice = (invoice) => {
    if (effectiveRole !== 'superadmin') return false;
    if (invoice.integrationStatus === 'menunggu_review' || invoice.integrationStatus === 'terkunci') return false;
    const includedSJs = (invoice.suratJalanIds || [])
      .map(id => suratJalanList.find(s => s.id === id))
      .filter(Boolean);
    return includedSJs.length > 0 && includedSJs.every(sj => sj.status === 'terkunci');
  };

  const eligibleInvoicesInView = activeFilter === 'terinvoice' ? invoiceList.filter(canKirimInvoice) : [];
  const selectedInView = eligibleInvoicesInView.filter(inv => selectedInvoiceIds.has(inv.id));
  const allInViewSelected = eligibleInvoicesInView.length > 0 && selectedInView.length === eligibleInvoicesInView.length;

  const toggleSelectInvoice = (id) => {
    setSelectedInvoiceIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAllInvoices = () => {
    setSelectedInvoiceIds(prev => {
      const next = new Set(prev);
      if (allInViewSelected) {
        eligibleInvoicesInView.forEach(inv => next.delete(inv.id));
      } else {
        eligibleInvoicesInView.forEach(inv => next.add(inv.id));
      }
      return next;
    });
  };

  const getInvoiceIntegrationBadge = (invoice) => {
    if (invoice.integrationStatus === 'menunggu_review') {
      return (
        <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold flex items-center gap-1">
          <Send className="w-3 h-3" /> Menunggu Review Akuntan
        </span>
      );
    }
    if (invoice.integrationStatus === 'terkunci') {
      return (
        <span className="px-2 py-1 bg-gray-200 text-gray-600 rounded-full text-xs font-semibold flex items-center gap-1">
          <Lock className="w-3 h-3" /> Sudah Masuk Accounting
        </span>
      );
    }
    return null;
  };
  
  // statusInvoice:
  // - undefined / null / ''  -> dianggap BELUM (backward compatible data lama)
  // - 'belum'                -> BELUM
  // - 'terinvoice'           -> SUDAH
  const sjBelumTerinvoice = suratJalanList.filter(sj =>
    (sj.status === 'terkirim' || sj.status === 'terkunci') &&
    sj.isActive !== false &&
    (sj.statusInvoice == null || sj.statusInvoice === '' || sj.statusInvoice === 'belum')
  );

  const sjTerinvoice = suratJalanList.filter(sj =>
    (sj.status === 'terkirim' || sj.status === 'terkunci') &&
    sj.statusInvoice === 'terinvoice'
  );
  
  const filteredSJ = activeFilter === 'belum-terinvoice' ? sjBelumTerinvoice : sjTerinvoice;
  
  // Export to Excel function
  const exportInvoiceToExcel = (invoice) => {
    const headers = ['No SJ', 'Tgl SJ', 'No. Polisi', 'Nama Supir', 'Rute', 'Material', 'Qty Bongkar', 'Satuan', 'Harga/Satuan', 'Nilai'];
    const hargaSatuan = Number(invoice.hargaSatuan) || 0;
    const rows = invoice.suratJalanList.map(sj => [
      sj.nomorSJ,
      new Date(sj.tanggalSJ).toLocaleDateString('id-ID'),
      sj.nomorPolisi,
      sj.namaSupir,
      sj.rute,
      sj.material,
      sj.qtyBongkar,
      sj.satuan,
      hargaSatuan,
      (Number(sj.qtyBongkar) || 0) * hargaSatuan
    ]);

    let csvContent = headers.join(';') + '\n';
    rows.forEach(row => {
      csvContent += row.join(';') + '\n';
    });
    const totalNilai = Number(invoice.totalNilai) || (invoice.totalQty * hargaSatuan);
    csvContent += `\nTOTAL;;;;;${invoice.totalQty.toFixed(2)};;;${totalNilai}`;
    
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `Invoice_${invoice.noInvoice.replace(/\//g, '-')}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">📄 Invoice Management</h2>
            <p className="text-gray-600 mt-1">Kelola Invoice untuk Surat Jalan Terkirim</p>
          </div>
          {canManageInvoice() && sjBelumTerinvoice.length > 0 && (
            <button
              onClick={onAddInvoice}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition"
            >
              <Plus className="w-4 h-4" />
              <span>Buat Invoice Baru</span>
            </button>
          )}
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={() => setActiveFilter('belum-terinvoice')}
            className={`flex-1 px-4 py-2 rounded-lg transition flex items-center justify-center gap-2 ${
              activeFilter === 'belum-terinvoice'
                ? 'bg-orange-600 text-white'
                : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span className="font-semibold">Belum Terinvoice</span>
            <span className="px-2 py-1 bg-white bg-opacity-30 rounded-full text-sm">
              {sjBelumTerinvoice.length}
            </span>
          </button>
          <button
            onClick={() => setActiveFilter('terinvoice')}
            className={`flex-1 px-4 py-2 rounded-lg transition flex items-center justify-center gap-2 ${
              activeFilter === 'terinvoice'
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            <CheckCircle className="w-4 h-4" />
            <span className="font-semibold">Sudah Terinvoice</span>
            <span className="px-2 py-1 bg-white bg-opacity-30 rounded-full text-sm">
              {invoiceList.length}
            </span>
          </button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg shadow-md p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-100 text-sm mb-1">Total Invoice</p>
              <p className="text-3xl font-bold">{invoiceList.length}</p>
            </div>
            <FileText className="w-12 h-12 text-green-200" />
          </div>
        </div>
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg shadow-md p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-orange-100 text-sm mb-1">Belum Terinvoice</p>
              <p className="text-3xl font-bold">{sjBelumTerinvoice.length}</p>
            </div>
            <Package className="w-12 h-12 text-orange-200" />
          </div>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg shadow-md p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-100 text-sm mb-1">Sudah Terinvoice</p>
              <p className="text-3xl font-bold">{sjTerinvoice.length}</p>
            </div>
            <CheckCircle className="w-12 h-12 text-green-200" />
          </div>
        </div>
      </div>
      
      {activeFilter === 'belum-terinvoice' ? (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Package className="w-5 h-5 text-orange-600" />
            Surat Jalan Terkirim - Belum Terinvoice
          </h3>
          {filteredSJ.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle className="w-16 h-16 mx-auto text-green-400 mb-4" />
              <p className="text-lg font-semibold text-gray-600 mb-2">Semua Surat Jalan Sudah Terinvoice! 🎉</p>
              <p className="text-sm text-gray-500">Tidak ada Surat Jalan yang perlu di-invoice</p>
            </div>
          ) : (
            <>
              <div className="mb-4 bg-green-50 border-l-4 border-green-500 p-4 rounded">
                <p className="text-sm text-green-800">
                  <strong>📋 Info:</strong> Pilih surat jalan di bawah untuk membuat invoice. Klik tombol "Buat Invoice Baru" di atas untuk memulai.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nomor SJ</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tgl SJ</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tgl Terkirim</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nomor Polisi</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rute</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Qty Bongkar</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredSJ.map(sj => (
                      <tr key={sj.id} className="hover:bg-orange-50 transition">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">{sj.nomorSJ}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {new Date(sj.tanggalSJ).toLocaleDateString('id-ID')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-green-700 font-semibold">
                          {sj.tglTerkirim ? new Date(sj.tglTerkirim).toLocaleDateString('id-ID') : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{sj.nomorPolisi}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{sj.rute}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{sj.material}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-semibold">
                          {sj.qtyBongkar || 0} {sj.satuan}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Bulk Kirim Bar — hanya superadmin, hanya jika ada invoice eligible */}
          {effectiveRole === 'superadmin' && eligibleInvoicesInView.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer select-none text-sm font-medium text-blue-800">
                <input
                  type="checkbox"
                  checked={allInViewSelected}
                  onChange={toggleSelectAllInvoices}
                  className="w-4 h-4 accent-blue-600"
                />
                {allInViewSelected ? 'Batalkan Semua' : `Pilih Semua (${eligibleInvoicesInView.length} invoice eligible)`}
              </label>
              {selectedInView.length > 0 && (
                <>
                  <span className="text-blue-600 text-sm">{selectedInView.length} dipilih</span>
                  <button
                    onClick={() => onBulkKirimInvoiceKeAccounting(selectedInView, () => setSelectedInvoiceIds(new Set()))}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg text-sm flex items-center gap-2 transition"
                  >
                    <Send className="w-4 h-4" />
                    Kirim {selectedInView.length} Invoice ke Accounting
                  </button>
                  <button
                    onClick={() => setSelectedInvoiceIds(new Set())}
                    className="text-blue-600 hover:text-blue-800 text-sm underline"
                  >
                    Batalkan Pilihan
                  </button>
                </>
              )}
            </div>
          )}

          {invoiceList.length === 0 ? (
            <div className="bg-white rounded-lg shadow-md p-12 text-center">
              <FileText className="w-16 h-16 mx-auto text-gray-300 mb-4" />
              <p className="text-lg font-semibold text-gray-600 mb-2">Belum Ada Invoice</p>
              <p className="text-sm text-gray-500 mb-4">Buat invoice pertama untuk Surat Jalan yang sudah terkirim</p>
              {canManageInvoice() && sjBelumTerinvoice.length > 0 && (
                <button
                  onClick={onAddInvoice}
                  className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg inline-flex items-center space-x-2 transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>Buat Invoice Pertama</span>
                </button>
              )}
            </div>
          ) : (
            invoiceList.map(invoice => {
              const isEligibleForBulk = canKirimInvoice(invoice);
              const isSelected = selectedInvoiceIds.has(invoice.id);
              return (
              <div key={invoice.id} className={`bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition${isSelected ? ' ring-2 ring-blue-500' : ''}`}>
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start gap-3">
                    {isEligibleForBulk && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectInvoice(invoice.id)}
                        className="mt-1.5 w-4 h-4 accent-blue-600 cursor-pointer shrink-0"
                      />
                    )}
                    <div>
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="text-xl font-bold text-gray-800">{invoice.noInvoice}</h3>
                      <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-semibold flex items-center gap-1">
                        <CheckCircle className="w-4 h-4" />
                        Terinvoice
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-gray-600">Tanggal Invoice:</p>
                        <p className="font-semibold text-gray-800">
                          {new Date(invoice.tglInvoice).toLocaleDateString('id-ID')}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-600">Jumlah SJ:</p>
                        <p className="font-semibold text-gray-800">
                          {invoice.suratJalanIds.length} Surat Jalan
                        </p>
                      </div>
                      {(invoice.hargaSatuan != null || (invoice.hargaPerGroup && invoice.hargaPerGroup.length > 0)) && (
                        <>
                          <div>
                            <p className="text-gray-600">Harga Jual per Satuan:</p>
                            {invoice.hargaPerGroup && invoice.hargaPerGroup.length > 1 ? (
                              <div className="space-y-1 mt-1">
                                {invoice.hargaPerGroup.map((g, i) => (
                                  <p key={i} className="text-xs font-semibold text-gray-700">
                                    {g.material} ({g.rute}): Rp {Number(g.hargaSatuan).toLocaleString('id-ID')}
                                  </p>
                                ))}
                              </div>
                            ) : (
                              <p className="font-semibold text-gray-800">
                                Rp {Number(invoice.hargaSatuan ?? invoice.hargaPerGroup?.[0]?.hargaSatuan ?? 0).toLocaleString('id-ID')} / {invoice.suratJalanList?.[0]?.satuan || 'satuan'}
                              </p>
                            )}
                          </div>
                          <div>
                            <p className="text-gray-600">Nilai Invoice:</p>
                            <p className="font-bold text-blue-700">
                              Rp {Number(invoice.totalNilai || 0).toLocaleString('id-ID')}
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                    </div>{/* end original inner */}
                  </div>{/* end flex items-start gap-3 */}
                  <div className="flex flex-col gap-2">
                    {getInvoiceIntegrationBadge(invoice)}
                    <button
                      onClick={() => exportInvoiceToExcel(invoice)}
                      className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1"
                    >
                      <FileText className="w-4 h-4" />
                      <span>Export Excel</span>
                    </button>
                    {canKirimInvoice(invoice) && (
                      <button
                        onClick={() => onKirimInvoiceKeAccounting(invoice)}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1"
                      >
                        <Send className="w-4 h-4" />
                        <span>Kirim ke Accounting</span>
                      </button>
                    )}
                    {canManageInvoice() && invoice.integrationStatus !== 'terkunci' && (
                      <button
                        onClick={() => onDeleteInvoice(invoice.id)}
                        className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1"
                      >
                        <XCircle className="w-4 h-4" />
                        <span>Hapus</span>
                      </button>
                    )}
                  </div>
                </div>
                
                <div className="border-t pt-4 mt-4">
                  <h4 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Detail Surat Jalan:
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">No</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">No SJ</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Rute</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qty Bongkar</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {invoice.suratJalanList.map((sj, idx) => (
                          <tr key={sj.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2 text-sm text-gray-600">{idx + 1}</td>
                            <td className="px-4 py-2 text-sm font-medium text-green-600">{sj.nomorSJ}</td>
                            <td className="px-4 py-2 text-sm text-gray-900">{sj.rute}</td>
                            <td className="px-4 py-2 text-sm text-gray-900">{sj.material}</td>
                            <td className="px-4 py-2 text-sm text-gray-900 text-right font-semibold">
                              {sj.qtyBongkar} {sj.satuan}
                            </td>
                          </tr>
                        ))}
                        <tr className="bg-gray-100 font-bold">
                          <td colSpan="4" className="px-4 py-2 text-sm text-gray-900 text-right">TOTAL:</td>
                          <td className="px-4 py-2 text-sm text-gray-900 text-right">
                            {invoice.totalQty.toFixed(2)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
                
                <div className="mt-4 text-xs text-gray-500 border-t pt-3">
                  <p>Dibuat oleh: <strong>{invoice.createdBy}</strong> pada {new Date(invoice.createdAt).toLocaleString('id-ID')}</p>
                </div>
              </div>
            );
            })
          )}
        </div>
      )}
    </div>
  );
};

const SuratJalanMonitor = () => {
  const [currentUser, setCurrentUser] = useState(null);
  const effectiveRole = currentUser?.role === 'owner' ? 'reader' : currentUser?.role;
  const canWriteTransaksi = effectiveRole === 'superadmin' || effectiveRole === 'admin_keuangan';

  const [firebaseUser, setFirebaseUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [suratJalanList, setSuratJalanList] = useState([]);
  const [biayaList, setBiayaList] = useState([]);
  const [transaksiList, setTransaksiList] = useState([]);
  const [historyLog, setHistoryLog] = useState([]);
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
              const batch = writeBatch(db);
              newItems.forEach((sj) => {
                batch.set(doc(db, C("surat_jalan"), String(sj.id)), sanitizeForFirestore({ ...sj, isActive: true }), { merge: true });
              });
              await batch.commit();
            } catch (e) {
              console.error("Import SJ batch Firestore failed:", e);
            }

            // onSnapshot akan update setSuratJalanList secara otomatis setelah batch.commit()
            // Auto-create transaksi uang jalan untuk hasil import (agar menu Keuangan ikut terupdate)
            if (canWriteTransaksi) {
              for (const sj of newItems) {
                try {
                  await upsertUangJalanTransaksiForSJ(sj);
                } catch (e) {
                  console.warn('Import SJ -> auto transaksi uang jalan gagal:', e);
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
    const batch = writeBatch(db);
    newItems.forEach((t) => {
      batch.set(doc(db, C("trucks"), t.id), t, { merge: true });
    });
    await batch.commit();

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
              const batch = writeBatch(db);
              newItems.forEach((s) => {
                batch.set(doc(db, C("supir"), s.id), s, { merge: true });
              });
              await batch.commit();
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
              const batch = writeBatch(db);
              newItems.forEach((r) => {
                batch.set(doc(db, C("rute"), r.id), r, { merge: true });
              });
              await batch.commit();
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
              const batch = writeBatch(db);
              newItems.forEach((m) => {
                batch.set(doc(db, C("material"), m.id), m, { merge: true });
              });
              await batch.commit();
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
              const batch = writeBatch(db);
              biayaItems.forEach(b => {
                batch.set(doc(db, C("biaya"), b.id), b, { merge: true });
              });
              await batch.commit();
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

  const updateSuratJalan = async (id, updates) => {
    const sj = suratJalanList.find((x) => String(x.id) === String(id));
    const nowIso = new Date().toISOString();
    const who = currentUser?.name || 'system';

    const patch = {
      ...(updates || {}),
      updatedAt: nowIso,
      updatedBy: who,
    };

    // DATA-SIDE LOCK:
    // Jika status menjadi 'gagal', uang jalan harus dianggap 0 untuk semua role.
    // Nilai uang jalan asli disimpan di deletedUangJalan agar bisa dipulihkan.
    if (patch.status === 'gagal') {
      const originalUangJalan = Number(sj?.uangJalan || 0);
      // Lock data: SJ gagal dianggap non-aktif (tidak boleh muncul di Laporan Kas)
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

    const updatedSJList = suratJalanList.map((x) =>
      String(x.id) === String(id) ? { ...x, ...patch } : x
    );
    setSuratJalanList(updatedSJList);

    // Persist ke Firestore
    await updateDoc(doc(db, C("surat_jalan"), String(id)), sanitizeForFirestore(patch));

    // Jika jadi GAGAL, nonaktifkan transaksi uang jalan terkait (best-effort, termasuk legacy)
    if (patch.status === 'gagal') {
      try {
        const sjObj = suratJalanList.find((s) => String(s.id) === String(id)) || { id };
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
        let berhasil = 0, gagal = 0;
        const allWarnings = [];
        const gagalList = [];

        for (const sj of toSend) {
          try {
            const sjBiaya = biayaList.filter(b => b.suratJalanId === sj.id && b.isActive !== false && !b.deletedAt);
            const { warnings } = await kirimUangJalanKeAccounting(sj, currentUser, invoiceList, sjBiaya);
            await updateSuratJalan(sj.id, {
              status: 'menunggu_review',
              integrationQueueId: `IQ-UJ-${sj.id}`,
              sentToAccountingAt: new Date().toISOString(),
              sentToAccountingBy: currentUser?.name || currentUser?.username || 'unknown',
            });
            berhasil++;
            warnings.forEach(w => allWarnings.push(`[${sj.nomorSJ}] ${w.message}`));
          } catch (e) {
            gagal++;
            gagalList.push(sj.nomorSJ);
          }
        }

        setSelectedSJIds(new Set());
        const warningText = allWarnings.length > 0
          ? `\n\n⚠️ Peringatan Master Data:\n${allWarnings.map(w => `• ${w}`).join('\n')}`
          : '';
        const gagalText = gagal > 0
          ? `\n❌ ${gagal} SJ gagal dikirim: ${gagalList.join(', ')}`
          : '';
        setAlertMessage(`✅ ${berhasil} SJ berhasil dikirim ke Accounting.${gagalText}${warningText}`);
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
        let berhasil = 0, gagal = 0;
        const gagalList = [];

        for (const sj of toCancel) {
          try {
            const uangJalanTransaksi = transaksiList.find(
              t => t.id === buildUangJalanTransaksiId(sj.id) || String(t.suratJalanId) === String(sj.id)
            );
            const deletedUangJalan = uangJalanTransaksi ? {
              nominal: uangJalanTransaksi.nominal,
              keterangan: uangJalanTransaksi.keterangan,
              tanggal: uangJalanTransaksi.tanggal,
              id: uangJalanTransaksi.id,
            } : null;

            await updateSuratJalan(sj.id, {
              status: 'gagal',
              statusLabel: 'gagal',
              deletedUangJalan,
            });
            await deactivateUangJalanTransaksiForSJ(sj, currentUser?.name || 'system').catch(() => {});
            await addHistoryLog('mark_gagal', sj.id, sj.nomorSJ, {
              previousStatus: sj.status,
              uangJalanDeleted: deletedUangJalan,
              bulkAction: true,
            }, false);
            berhasil++;
          } catch (e) {
            gagal++;
            gagalList.push(sj.nomorSJ);
          }
        }

        setSelectedBatalSJIds(new Set());
        const gagalText = gagal > 0 ? `\n❌ ${gagal} SJ gagal dibatalkan: ${gagalList.join(', ')}` : '';
        setAlertMessage(`✅ ${berhasil} SJ berhasil dibatalkan.${gagalText}\n💰 Uang Jalan terkait telah dihapus dari keuangan.`);
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
          await kirimInvoiceKeAccounting(invoice, suratJalanList, currentUser, biayaList);
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
            await kirimInvoiceKeAccounting(invoice, suratJalanList, currentUser, biayaList);
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
    const sj = suratJalanList.find(s => s.id === id);
    
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

  const filteredSuratJalan = suratJalanList.filter(sj =>
    filter === 'all' || sj.status === filter
  );

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
  const merged = mergeById(sjPrimary, sjLegacy).filter((x) => !x?.deletedAt && x?.isActive !== false);
  merged.sort((a, b) => String(b?.tanggalSJ || "").localeCompare(String(a?.tanggalSJ || "")));
  setSuratJalanList(merged);
  if (!didFirstLoadRef.current) {
    setIsLoading(false);
    didFirstLoadRef.current = true;
  }
};

const unsubSuratJalan = onSnapshot(collection(db, C("surat_jalan")), (snap) => {
  sjPrimary = snap.docs.map((d) => normalizeSJ(d.data() || {}, d.id));
  applySJ();
});

const unsubSuratJalanLegacy = onSnapshot(collection(db, C("suratJalan")), (snap) => {
  sjLegacy = snap.docs.map((d) => normalizeSJ(d.data() || {}, d.id));
  applySJ();
});

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

const unsubHistory = onSnapshot(collection(db, C("history_log")), (snap) => {
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

// Dengarkan perubahan status integrasi dari bul-accounting (approve/reject/cancel)
// untuk setiap SJ yang sedang dalam status menunggu_review atau terkunci.
useEffect(() => {
  if (!authReady || !firebaseUser) return;
  const watchedSJs = suratJalanList.filter(s => s.status === 'menunggu_review' || s.status === 'terkunci');
  if (watchedSJs.length === 0) return;

  const unsubs = watchedSJs.map(sj =>
    subscribeIntegrationStatusSJ(sj.id, async (data) => {
      if (data.status === 'approved' && sj.status !== 'terkunci') {
        await updateSuratJalan(sj.id, {
          status: 'terkunci',
          accountingJournalId: data.journalId,
          accountingApprovedAt: data.updatedAt,
          accountingReviewedBy: data.reviewedBy,
        });
      } else if (data.status === 'rejected') {
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
    })
  );
  return () => unsubs.forEach(u => u());
}, [authReady, firebaseUser, suratJalanList]);

// Dengarkan perubahan status integrasi invoice dari bul-accounting (approve/reject/cancel)
useEffect(() => {
  if (!authReady || !firebaseUser) return;
  const watchedInvoices = invoiceList.filter(inv => inv.integrationStatus === 'menunggu_review' || inv.integrationStatus === 'terkunci');
  if (watchedInvoices.length === 0) return;

  const unsubs = watchedInvoices.map(invoice =>
    subscribeIntegrationStatusInvoice(invoice.id, async (data) => {
      const invRef = doc(db, C("invoices"), invoice.id);
      if (data.status === 'approved' && invoice.integrationStatus !== 'terkunci') {
        await updateDoc(invRef, sanitizeForFirestore({
          integrationStatus: 'terkunci',
          accountingJournalId: data.journalId,
          accountingApprovedAt: data.updatedAt,
          accountingReviewedBy: data.reviewedBy,
          updatedAt: new Date().toISOString(),
        }));
      } else if (data.status === 'rejected') {
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
    })
  );
  return () => unsubs.forEach(u => u());
}, [authReady, firebaseUser, invoiceList]);

// Dengarkan perubahan status integrasi transaksi kas dari bul-accounting
useEffect(() => {
  if (!authReady || !firebaseUser) return;
  const watched = transaksiList.filter(t =>
    t.integrationStatus === 'menunggu_review' || t.integrationStatus === 'terkunci'
  );
  if (watched.length === 0) return;

  const unsubs = watched.map(transaksi =>
    subscribeIntegrationStatusTransaksi(transaksi.id, async (data) => {
      const trxRef = doc(db, C('transaksi'), transaksi.id);
      if (data.status === 'approved' && transaksi.integrationStatus !== 'terkunci') {
        await updateDoc(trxRef, {
          integrationStatus: 'terkunci',
          accountingJournalId: data.journalId,
          accountingApprovedAt: data.updatedAt,
          accountingReviewedBy: data.reviewedBy,
          updatedAt: new Date().toISOString(),
        });
      } else if (data.status === 'rejected') {
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
    })
  );
  return () => unsubs.forEach(u => u());
}, [authReady, firebaseUser, transaksiList]);

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

const MasterDataManagement = ({
  truckList, supirList, ruteList, materialList, pelangganList = [], currentUser,
  onAddTruck, onEditTruck, onDeleteTruck,
  onAddSupir, onEditSupir, onDeleteSupir,
  onAddRute, onEditRute, onDeleteRute,
  onAddMaterial, onEditMaterial, onDeleteMaterial,
  onAddPelanggan, onEditPelanggan, onDeletePelanggan, onMigratePelanggan,
  onDownloadTemplate, onImportData
}) => {
  const [masterTab, setMasterTab] = useState('truck');
  const [alertMessage, setAlertMessage] = useState('');

  const handleFileUpload = (e, type) => {
    const file = e.target.files[0];
    if (file) {
      if (!file.name.endsWith('.csv')) {
        setAlertMessage('Format file harus CSV!');
        return;
      }
      onImportData(type, file);
      e.target.value = ''; // Reset input
    }
  };

  return (
    <div>
      {/* Sub Tab Navigation */}
      <div className="bg-white rounded-lg shadow-md p-2 mb-6 flex gap-2">
        <button
          onClick={() => setMasterTab('truck')}
          className={`flex-1 px-4 py-2 rounded-lg transition ${masterTab === 'truck' ? 'bg-green-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
        >
          <span>🚛 Truck</span>
        </button>
        <button
          onClick={() => setMasterTab('supir')}
          className={`flex-1 px-4 py-2 rounded-lg transition ${masterTab === 'supir' ? 'bg-green-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
        >
          <span>👨‍✈️ Supir</span>
        </button>
        <button
          onClick={() => setMasterTab('rute')}
          className={`flex-1 px-4 py-2 rounded-lg transition ${masterTab === 'rute' ? 'bg-green-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
        >
          <span>🗺️ Rute</span>
        </button>
        <button
          onClick={() => setMasterTab('material')}
          className={`flex-1 px-4 py-2 rounded-lg transition ${masterTab === 'material' ? 'bg-green-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
        >
          <span>📦 Material</span>
        </button>
        <button
          onClick={() => setMasterTab('pelanggan')}
          className={`flex-1 px-4 py-2 rounded-lg transition ${masterTab === 'pelanggan' ? 'bg-green-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
        >
          <span>🏢 Pelanggan</span>
        </button>
      </div>

      {/* Truck Master Data */}
      {masterTab === 'truck' && (
        <div>
          <div className="bg-white rounded-lg shadow-md p-4 mb-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-gray-800">Master Data Truck</h2>
                <p className="text-sm text-gray-600">Total: {truckList.length} truck</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => onDownloadTemplate('truck')}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition"
                >
                  <FileText className="w-4 h-4" />
                  <span>Download Template</span>
                </button>
                <label className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition cursor-pointer">
                  <Plus className="w-4 h-4" />
                  <span>Import CSV</span>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => handleFileUpload(e, 'truck')}
                    className="hidden"
                  />
                </label>
                <button
                  onClick={onAddTruck}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tambah Truck</span>
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {truckList.length === 0 ? (
              <div className="bg-white rounded-lg shadow-md p-8 text-center">
                <Truck className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">Belum ada data truck</p>
              </div>
            ) : (
              truckList.map(truck => (
                <div key={truck.id} className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <h3 className="text-lg font-bold text-gray-800">{truck.nomorPolisi}</h3>
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          truck.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {truck.isActive ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600">Truck ID: {truck.id}</p>
                      {truck.createdBy && (
                        <p className="text-xs text-gray-500 mt-2">
                          Dibuat oleh: {truck.createdBy} pada {new Date(truck.createdAt).toLocaleString('id-ID')}
                        </p>
                      )}
                    </div>
                    <div className="flex space-x-2 ml-4">
                      <button
                        onClick={() => onEditTruck(truck)}
                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1"
                      >
                        <Edit className="w-4 h-4" />
                        <span>Edit</span>
                      </button>
                      <button
                        onClick={() => onDeleteTruck(truck.id)}
                        className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Hapus</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Supir Master Data */}
      {masterTab === 'supir' && (
        <div>
          <div className="bg-white rounded-lg shadow-md p-4 mb-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-gray-800">Master Data Supir</h2>
                <p className="text-sm text-gray-600">Total: {supirList.length} supir</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => onDownloadTemplate('supir')}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition"
                >
                  <FileText className="w-4 h-4" />
                  <span>Download Template</span>
                </button>
                <label className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition cursor-pointer">
                  <Plus className="w-4 h-4" />
                  <span>Import CSV</span>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => handleFileUpload(e, 'supir')}
                    className="hidden"
                  />
                </label>
                <button
                  onClick={onAddSupir}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tambah Supir</span>
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {supirList.length === 0 ? (
              <div className="bg-white rounded-lg shadow-md p-8 text-center">
                <Users className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">Belum ada data supir</p>
              </div>
            ) : (
              supirList.map(supir => (
                <div key={supir.id} className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <h3 className="text-lg font-bold text-gray-800">{supir.namaSupir}</h3>
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          supir.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {supir.isActive ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm mt-2">
                        <div>
                          <p className="text-gray-600">Supir ID:</p>
                          <p className="font-semibold text-gray-800">{supir.id}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">PT:</p>
                          <p className="font-semibold text-gray-800">{supir.pt}</p>
                        </div>
                      </div>
                      {supir.createdBy && (
                        <p className="text-xs text-gray-500 mt-2">
                          Dibuat oleh: {supir.createdBy} pada {new Date(supir.createdAt).toLocaleString('id-ID')}
                        </p>
                      )}
                    </div>
                    <div className="flex space-x-2 ml-4">
                      <button
                        onClick={() => onEditSupir(supir)}
                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1"
                      >
                        <Edit className="w-4 h-4" />
                        <span>Edit</span>
                      </button>
                      <button
                        onClick={() => onDeleteSupir(supir.id)}
                        className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Hapus</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Rute Master Data */}
      {masterTab === 'rute' && (
        <div>
          <div className="bg-white rounded-lg shadow-md p-4 mb-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-gray-800">Master Data Rute</h2>
                <p className="text-sm text-gray-600">Total: {ruteList.length} rute</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => onDownloadTemplate('rute')}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition"
                >
                  <FileText className="w-4 h-4" />
                  <span>Download Template</span>
                </button>
                <label className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition cursor-pointer">
                  <Plus className="w-4 h-4" />
                  <span>Import CSV</span>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => handleFileUpload(e, 'rute')}
                    className="hidden"
                  />
                </label>
                <button
                  onClick={onAddRute}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tambah Rute</span>
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {ruteList.length === 0 ? (
              <div className="bg-white rounded-lg shadow-md p-8 text-center">
                <Package className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">Belum ada data rute</p>
              </div>
            ) : (
              ruteList.map(rute => (
                <div key={rute.id} className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-gray-800 mb-2">{rute.rute}</h3>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-gray-600">Rute ID:</p>
                          <p className="font-semibold text-gray-800">{rute.id}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Uang Jalan:</p>
                          <p className="font-semibold text-green-600">{formatCurrency(rute.uangJalan)}</p>
                        </div>
                      </div>
                      {rute.createdBy && (
                        <p className="text-xs text-gray-500 mt-2">
                          Dibuat oleh: {rute.createdBy} pada {new Date(rute.createdAt).toLocaleString('id-ID')}
                        </p>
                      )}
                    </div>
                    <div className="flex space-x-2 ml-4">
                      <button
                        onClick={() => onEditRute(rute)}
                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1"
                      >
                        <Edit className="w-4 h-4" />
                        <span>Edit</span>
                      </button>
                      <button
                        onClick={() => onDeleteRute(rute.id)}
                        className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Hapus</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Material Master Data */}
      {masterTab === 'material' && (
        <div>
          <div className="bg-white rounded-lg shadow-md p-4 mb-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-gray-800">Master Data Material</h2>
                <p className="text-sm text-gray-600">Total: {materialList.length} material</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => onDownloadTemplate('material')}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition"
                >
                  <FileText className="w-4 h-4" />
                  <span>Download Template</span>
                </button>
                <label className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition cursor-pointer">
                  <Plus className="w-4 h-4" />
                  <span>Import CSV</span>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => handleFileUpload(e, 'material')}
                    className="hidden"
                  />
                </label>
                <button
                  onClick={onAddMaterial}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tambah Material</span>
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {materialList.length === 0 ? (
              <div className="bg-white rounded-lg shadow-md p-8 text-center">
                <Package className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">Belum ada data material</p>
              </div>
            ) : (
              materialList.map(material => (
                <div key={material.id} className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-gray-800 mb-2">{material.material}</h3>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-gray-600">Material ID:</p>
                          <p className="font-semibold text-gray-800">{material.id}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Satuan:</p>
                          <p className="font-semibold text-gray-800">{material.satuan}</p>
                        </div>
                      </div>
                      {material.createdBy && (
                        <p className="text-xs text-gray-500 mt-2">
                          Dibuat oleh: {material.createdBy} pada {new Date(material.createdAt).toLocaleString('id-ID')}
                        </p>
                      )}
                    </div>
                    <div className="flex space-x-2 ml-4">
                      <button
                        onClick={() => onEditMaterial(material)}
                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1"
                      >
                        <Edit className="w-4 h-4" />
                        <span>Edit</span>
                      </button>
                      <button
                        onClick={() => onDeleteMaterial(material.id)}
                        className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Hapus</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Pelanggan Master Data */}
      {masterTab === 'pelanggan' && (
        <div>
          <div className="bg-white rounded-lg shadow-md p-4 mb-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-gray-800">Master Data Pelanggan</h2>
                <p className="text-sm text-gray-600">Total: {pelangganList.length} pelanggan</p>
              </div>
              <div className="flex gap-2">
                {pelangganList.length === 0 && (
                  <button
                    onClick={onMigratePelanggan}
                    className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition text-sm"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Import dari Data Supir</span>
                  </button>
                )}
                <button
                  onClick={onAddPelanggan}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tambah Pelanggan</span>
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {pelangganList.length === 0 ? (
              <div className="bg-white rounded-lg shadow-md p-8 text-center">
                <Package className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500 mb-2">Belum ada data pelanggan</p>
                <p className="text-sm text-gray-400">Klik "Import dari Data Supir" untuk mengisi otomatis dari data PT supir yang sudah ada.</p>
              </div>
            ) : (
              pelangganList.map(pelanggan => (
                <div key={pelanggan.id} className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <h3 className="text-lg font-bold text-gray-800">{pelanggan.name}</h3>
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${pelanggan.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {pelanggan.isActive ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm mt-2">
                        <div>
                          <p className="text-gray-600">Alamat:</p>
                          <p className="font-medium text-gray-800">{pelanggan.address || '-'}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">NPWP:</p>
                          <p className="font-medium font-mono text-gray-800">{pelanggan.npwp || '-'}</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex space-x-2 ml-4">
                      <button
                        onClick={() => onEditPelanggan(pelanggan)}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg flex items-center space-x-1 transition text-sm"
                      >
                        <Edit className="w-4 h-4" />
                        <span>Edit</span>
                      </button>
                      <button
                        onClick={() => onDeletePelanggan(pelanggan.id)}
                        className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-lg flex items-center space-x-1 transition text-sm"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Hapus</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Settings Component
const SettingsManagement = ({ currentUser, appSettings, onUpdateSettings }) => {
  const effectiveRole = currentUser?.role === 'owner' ? 'reader' : currentUser?.role;

  const [settings, setSettings] = useState({
    companyName: appSettings?.companyName || '',
    logoUrl: appSettings?.logoUrl || '',
    loginFooterText: appSettings?.loginFooterText || 'Masuk untuk mengakses dashboard monitoring'
  });
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(appSettings?.logoUrl || '');

  const canManageSettings = effectiveRole === 'superadmin';

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) { // 2MB limit
        alert('Ukuran file maksimal 2MB!');
        return;
      }
      
      if (!file.type.startsWith('image/')) {
        alert('File harus berupa gambar (PNG, JPG, SVG)!');
        return;
      }

      setLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result);
        setSettings({ ...settings, logoUrl: reader.result });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = () => {
    if (!canManageSettings) {
      alert('Anda tidak memiliki akses untuk mengubah settings!');
      return;
    }

    if (!settings.companyName.trim()) {
      alert('Nama PT harus diisi!');
      return;
    }

    onUpdateSettings(settings);
    alert('✅ Settings berhasil disimpan!');
  };

  const handleReset = () => {
    if (confirm('Yakin ingin reset settings ke default?')) {
      const defaultSettings = {
        companyName: '',
        logoUrl: '',
        loginFooterText: 'Masuk untuk mengakses dashboard monitoring'
      };
      setSettings(defaultSettings);
      setLogoPreview('');
      setLogoFile(null);
      onUpdateSettings(defaultSettings);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">⚙️ Pengaturan Aplikasi</h2>
            <p className="text-gray-600 mt-1">Customize tampilan login dan branding perusahaan</p>
          </div>
        </div>

        {!canManageSettings ? (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
            <AlertCircle className="w-12 h-12 mx-auto text-yellow-500 mb-3" />
            <p className="text-yellow-800 font-semibold">Akses Terbatas</p>
            <p className="text-sm text-yellow-700 mt-1">Hanya Super Admin yang dapat mengubah settings</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Company Name */}
            <div className="bg-green-50 rounded-lg p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Package className="w-5 h-5 text-green-600" />
                Nama Perusahaan
              </h3>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nama PT/Perusahaan *
                </label>
                <input
                  type="text"
                  value={settings.companyName}
                  onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
                  placeholder="Contoh: PT Maju Sejahtera"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                />
                <p className="text-xs text-gray-500 mt-2">
                  Nama ini akan ditampilkan di halaman login dan header aplikasi
                </p>
              </div>
            </div>

            {/* Logo Upload */}
            <div className="bg-green-50 rounded-lg p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-green-600" />
                Logo Perusahaan
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Upload Logo
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    Format: PNG, JPG, SVG • Max: 2MB • Recommended: 200x80px
                  </p>
                  {logoPreview && (
                    <button
                      onClick={() => {
                        setLogoPreview('');
                        setSettings({ ...settings, logoUrl: '' });
                        setLogoFile(null);
                      }}
                      className="mt-3 text-sm text-red-600 hover:text-red-700"
                    >
                      🗑️ Hapus Logo
                    </button>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Preview Logo
                  </label>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 flex items-center justify-center bg-white" style={{ minHeight: '150px' }}>
                    {logoPreview ? (
                      <img 
                        src={logoPreview} 
                        alt="Logo Preview" 
                        className="max-h-32 max-w-full object-contain"
                      />
                    ) : (
                      <div className="text-center text-gray-400">
                        <FileText className="w-12 h-12 mx-auto mb-2" />
                        <p className="text-sm">Logo akan muncul di sini</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Login Footer Text */}
            <div className="bg-purple-50 rounded-lg p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Edit className="w-5 h-5 text-purple-600" />
                Text Halaman Login
              </h3>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Text di bawah tombol Login
                </label>
                <textarea
                  value={settings.loginFooterText}
                  onChange={(e) => setSettings({ ...settings, loginFooterText: e.target.value })}
                  placeholder="Masukkan text yang akan ditampilkan..."
                  rows="3"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                />
                <p className="text-xs text-gray-500 mt-2">
                  Text ini muncul di bawah tombol login sebagai informasi tambahan
                </p>
              </div>
            </div>

            {/* Preview Section */}
            <div className="bg-gray-50 rounded-lg p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Eye className="w-5 h-5 text-gray-600" />
                Preview Halaman Login
              </h3>
              <div className="bg-white rounded-lg p-8 border-2 border-gray-200 max-w-md mx-auto">
                {/* Logo Preview */}
                {logoPreview ? (
                  <div className="text-center mb-6">
                    <img src={logoPreview} alt="Logo" className="h-16 mx-auto mb-2" />
                  </div>
                ) : (
                  <div className="text-center mb-6">
                    <div className="text-4xl mb-2">🚚</div>
                  </div>
                )}
                
                {/* Company Name */}
                <h1 className="text-2xl font-bold text-center text-gray-800 mb-2">
                  {settings.companyName || 'Nama Perusahaan'}
                </h1>
                <h2 className="text-xl font-semibold text-center text-gray-700 mb-6">
                  Surat Jalan Monitor
                </h2>
                
                {/* Login Form Preview */}
                <div className="space-y-3 mb-4">
                  <input 
                    type="text" 
                    placeholder="Username" 
                    disabled
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
                  />
                  <input 
                    type="password" 
                    placeholder="Password" 
                    disabled
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
                  />
                  <button 
                    disabled
                    className="w-full bg-green-600 text-white py-2 rounded-lg opacity-75"
                  >
                    LOGIN
                  </button>
                </div>
                
                {/* Footer Text */}
                <p className="text-sm text-gray-600 text-center mt-4">
                  {settings.loginFooterText}
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleReset}
                className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-lg flex items-center gap-2 transition"
              >
                <XCircle className="w-4 h-4" />
                Reset ke Default
              </button>
              <button
                onClick={handleSave}
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg flex items-center gap-2 transition"
              >
                <CheckCircle className="w-4 h-4" />
                Simpan Pengaturan
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const KeuanganManagement = ({ transaksiList, suratJalanList, currentUser, onAddTransaksi, onDeleteTransaksi, onKirimTransaksiKeAccounting }) => {
  const effectiveRole = currentUser?.role === 'owner' ? 'reader' : currentUser?.role;

  const [filter, setFilter] = useState('all');
  const [filterPT, setFilterPT] = useState('');
  
  // Default: hanya tampilkan transaksi yang masih aktif
  const activeTransaksi = (Array.isArray(transaksiList) ? transaksiList : [])
    .filter(t => t?.isActive !== false && !t?.deletedAt);

  // Get unique PT list
  const ptList = [...new Set(activeTransaksi.map(t => t.pt).filter(Boolean))].sort();
  
  const filteredTransaksi = activeTransaksi.filter(t => {
    if (filter !== 'all' && t.tipe !== filter) return false;
    if (filterPT && t.pt !== filterPT) return false;
    return true;
  });

  const totalPemasukan = activeTransaksi
    .filter(t => t.tipe === 'pemasukan' && (!filterPT || t.pt === filterPT))
    .reduce((sum, t) => sum + parseFloat(t.nominal || 0), 0);
  
  const totalPengeluaran = activeTransaksi
    .filter(t => t.tipe === 'pengeluaran' && (!filterPT || t.pt === filterPT))
    .reduce((sum, t) => sum + parseFloat(t.nominal || 0), 0);
  
  const saldoKas = totalPemasukan - totalPengeluaran;

  const canAddTransaksi = effectiveRole === 'superadmin' || effectiveRole === 'admin_keuangan';

  return (
    <div>
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm">Total Pemasukan</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{formatCurrency(totalPemasukan)}</p>
            </div>
            <div className="bg-green-500 p-3 rounded-lg text-white">
              <DollarSign className="w-6 h-6" />
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm">Total Pengeluaran</p>
              <p className="text-2xl font-bold text-red-600 mt-1">{formatCurrency(totalPengeluaran)}</p>
            </div>
            <div className="bg-red-500 p-3 rounded-lg text-white">
              <DollarSign className="w-6 h-6" />
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm">Saldo Kas</p>
              <p className={`text-2xl font-bold mt-1 ${saldoKas >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(saldoKas)}
              </p>
            </div>
            <div className="bg-green-500 p-3 rounded-lg text-white">
              <DollarSign className="w-6 h-6" />
            </div>
          </div>
        </div>
      </div>

      {/* Actions & Filters */}
      <div className="bg-white rounded-lg shadow-md p-4 mb-6">
        <div className="flex justify-between items-center mb-3">
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg transition ${filter === 'all' ? 'bg-green-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
            >
              Semua
            </button>
            <button
              onClick={() => setFilter('pemasukan')}
              className={`px-4 py-2 rounded-lg transition ${filter === 'pemasukan' ? 'bg-green-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
            >
              Pemasukan
            </button>
            <button
              onClick={() => setFilter('pengeluaran')}
              className={`px-4 py-2 rounded-lg transition ${filter === 'pengeluaran' ? 'bg-red-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
            >
              Pengeluaran
            </button>
          </div>
          {canAddTransaksi && (
            <button
              onClick={onAddTransaksi}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Transaksi</span>
            </button>
          )}
        </div>
        
        {/* Filter PT */}
        {ptList.length > 0 && (
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Filter PT:</label>
            <select
              value={filterPT}
              onChange={(e) => setFilterPT(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 text-sm"
            >
              <option value="">Semua PT</option>
              {ptList.map(pt => (
                <option key={pt} value={pt}>{pt}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Transaksi List */}
      <div className="space-y-3">
        {filteredTransaksi.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <DollarSign className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500">Belum ada transaksi</p>
          </div>
        ) : (
          filteredTransaksi.map(transaksi => (
            <div key={transaksi.id} className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <h3 className="text-lg font-bold text-gray-800">{transaksi.keterangan}</h3>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      transaksi.tipe === 'pemasukan' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {transaksi.tipe === 'pemasukan' ? 'Pemasukan' : 'Pengeluaran'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-600">Nominal:</p>
                      <p className={`font-bold text-lg ${
                        transaksi.tipe === 'pemasukan' ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {transaksi.tipe === 'pemasukan' ? '+' : '-'} {formatCurrency(transaksi.nominal)}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-600">Tanggal:</p>
                      <p className="font-semibold text-gray-800">
                        {new Date(transaksi.tanggal).toLocaleDateString('id-ID')}
                      </p>
                    </div>
                    {transaksi.pt && (
                      <div className="col-span-2">
                        <p className="text-gray-600">PT:</p>
                        <p className="font-bold text-green-600">{transaksi.pt}</p>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Dibuat oleh: {transaksi.createdBy} pada {new Date(transaksi.createdAt).toLocaleString('id-ID')}
                  </p>
                </div>
                
                <div className="ml-4 flex flex-col gap-2 items-end">
                  {/* Badge status integrasi */}
                  {transaksi.integrationStatus === 'menunggu_review' && (
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold flex items-center gap-1">
                      <Send className="w-3 h-3" /> Menunggu Review Akuntan
                    </span>
                  )}
                  {transaksi.integrationStatus === 'terkunci' && (
                    <span className="px-2 py-1 bg-gray-200 text-gray-600 rounded-full text-xs font-semibold flex items-center gap-1">
                      <Lock className="w-3 h-3" /> Sudah Masuk Accounting
                    </span>
                  )}
                  {/* Tombol kirim — hanya untuk manual, superadmin, belum terkunci, bukan SJ */}
                  {effectiveRole === 'superadmin' &&
                   transaksi.source !== 'auto_sj' &&
                   !transaksi.suratJalanId &&
                   !transaksi.integrationStatus &&
                   onKirimTransaksiKeAccounting && (
                    <button
                      onClick={() => onKirimTransaksiKeAccounting(transaksi)}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs transition flex items-center space-x-1"
                    >
                      <Send className="w-3 h-3" />
                      <span>Kirim ke Accounting</span>
                    </button>
                  )}
                  {canAddTransaksi && transaksi.integrationStatus !== 'terkunci' && (
                    <button
                      onClick={() => onDeleteTransaksi(transaksi.id)}
                      className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-xs transition flex items-center space-x-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Hapus</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const UsersManagement = ({ usersList, currentUser, onAddUser, onEditUser, onDeleteUser, onToggleActive }) => {
  const getRoleBadgeColor = (role) => {
    const colors = {
      superadmin: 'bg-red-100 text-red-800',
      admin_sj: 'bg-green-100 text-green-800',
      admin_keuangan: 'bg-green-100 text-green-800',
      admin_invoice: 'bg-purple-100 text-purple-800',
      reader: 'bg-gray-100 text-gray-800'
    };
    return colors[role] || 'bg-gray-100 text-gray-800';
  };

  const getRoleLabel = (role) => {
    const labels = {
      superadmin: 'Super Administrator',
      admin_sj: 'Admin Surat Jalan',
      admin_keuangan: 'Admin Keuangan',
      admin_invoice: 'Admin Invoice',
      reader: 'Reader'
    };
    return labels[role] || role;
  };

  return (
    <div>
      <div className="bg-white rounded-lg shadow-md p-4 mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Kelola User</h2>
            <p className="text-sm text-gray-600">Total: {usersList.length} user</p>
          </div>
          <button
            onClick={onAddUser}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah User</span>
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {usersList.map(user => {
          const displayUsername = user.username || (user.email ? user.email.split('@')[0] : '-');
          const displayName = user.name || displayUsername;
          const createdAtRaw = user.createdAt;
          const displayCreatedAt = createdAtRaw
            ? (createdAtRaw?.toDate
                ? createdAtRaw.toDate().toLocaleDateString('id-ID')
                : new Date(createdAtRaw).toLocaleDateString('id-ID'))
            : '-';
          return (
          <div key={user.id} className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-2">
                  <h3 className="text-lg font-bold text-gray-800">{displayName}</h3>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getRoleBadgeColor(user.role)}`}>
                    {getRoleLabel(user.role)}
                  </span>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${user.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {user.isActive ? 'Aktif' : 'Nonaktif'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-600">Username:</p>
                    <p className="font-semibold text-gray-800">{displayUsername}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Dibuat:</p>
                    <p className="font-semibold text-gray-800">{displayCreatedAt}</p>
                  </div>
                </div>
                {user.createdBy && (
                  <p className="text-xs text-gray-500 mt-2">
                    Dibuat oleh: {user.createdBy}
                  </p>
                )}
              </div>
              
              <div className="flex flex-col space-y-2 ml-4">
                {user.role !== 'superadmin' && (
                  <>
                    <button
                      onClick={() => onToggleActive(user.id)}
                      className={`px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1 whitespace-nowrap ${
                        user.isActive 
                          ? 'bg-orange-600 hover:bg-orange-700 text-white' 
                          : 'bg-green-600 hover:bg-green-700 text-white'
                      }`}
                    >
                      {user.isActive ? (
                        <>
                          <XCircle className="w-4 h-4" />
                          <span>Nonaktifkan</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-4 h-4" />
                          <span>Aktifkan</span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => onEditUser(user)}
                      className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1 whitespace-nowrap"
                    >
                      <Edit className="w-4 h-4" />
                      <span>Edit</span>
                    </button>
                    <button
                      onClick={() => onDeleteUser(user.id)}
                      className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1 whitespace-nowrap"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Hapus</span>
                    </button>
                  </>
                )}
                {user.role === 'superadmin' && (
                  <div className="text-xs text-gray-500 italic px-4 py-2">
                    Super Admin tidak dapat diubah
                  </div>
                )}
              </div>
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
};

const LoginScreen = ({ onLogin, alertMessage, setAlertMessage, appSettings }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = () => {
    if (username && password) {
      onLogin(username, password);
    } else {
      setAlertMessage('Username dan password harus diisi!');
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-500 to-green-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          {/* Logo */}
          {appSettings?.logoUrl ? (
            <img 
              src={appSettings.logoUrl} 
              alt="Logo" 
              className="h-20 mx-auto mb-4 object-contain"
            />
          ) : (
            <Package className="w-16 h-16 mx-auto text-green-600 mb-4" />
          )}
          
          {/* Company Name */}
          {appSettings?.companyName && (
            <h1 className="text-2xl font-bold text-gray-800 mb-2">{appSettings.companyName}</h1>
          )}
          
          <h2 className="text-3xl font-bold text-gray-800">BUL Monitor</h2>
          <p className="text-gray-600 mt-2">Silakan login untuk melanjutkan</p>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyPress={handleKeyPress}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder="Masukkan username"
              autoComplete="username"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyPress={handleKeyPress}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder="Masukkan password"
              autoComplete="current-password"
            />
          </div>
          
          <button
            onClick={handleSubmit}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-lg transition"
          >
            Login
          </button>
        </div>

        {/* Footer Text */}
        {appSettings?.loginFooterText && (
          <div className="mt-6 p-4 bg-green-50 rounded-lg text-center">
            <p className="text-sm text-green-800">
              {appSettings.loginFooterText}
            </p>
          </div>
        )}
      </div>

      {/* Alert Dialog in Login */}
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
    </div>
  );
};

const StatCard = ({ title, value, icon, color }) => (
  <div className="bg-white rounded-lg shadow-md p-6">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-gray-600 text-sm">{title}</p>
        <p className="text-3xl font-bold text-gray-800 mt-1">{value}</p>
      </div>
      <div className={`${color} p-3 rounded-lg text-white`}>
        {icon}
      </div>
    </div>
  </div>
);

const SuratJalanCard = ({
  suratJalan,
  biayaList,
  totalBiaya,
  currentUser,
  onUpdate,
  onMarkGagal,
  onRestore,
  onEditTerkirim,
  onDeleteBiaya,
  onKirimKeAccounting,
  formatCurrency,
  getStatusColor,
  getStatusIcon,
  isSelected = false,
  isSelectable = false,
  onToggleSelect,
  isBatalSelectable = false,
  isBatalSelected = false,
  onToggleBatalSelect,
}) => {
  const [expanded, setExpanded] = useState(false);

  const effectiveRole = (currentUser?.role === 'owner' ? 'reader' : currentUser?.role) || 'reader';


  const isLocked = ['menunggu_review', 'terkunci'].includes(suratJalan.status);

  const canMarkTerkirim = () => {
    if (isLocked) return false;
    if (effectiveRole === 'superadmin') return true;
    if (effectiveRole === 'admin_sj' && suratJalan.status === 'pending') return true;
    return false;
  };

  const canMarkGagal = () => {
    if (isLocked) return false;
    if (effectiveRole === 'superadmin') return true;
    if (effectiveRole === 'admin_sj' && (suratJalan.status === 'pending')) return true;
    return false;
  };

  const canEdit = () => {
    if (isLocked) return false;
    return effectiveRole === 'superadmin' && suratJalan.status === 'terkirim';
  };

  return (
    <div className={`bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition ${isSelected ? 'ring-2 ring-blue-500' : isBatalSelected ? 'ring-2 ring-red-400 bg-red-50' : ''}`}>
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center space-x-3 mb-2">
              {isSelectable && (
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={onToggleSelect}
                  className="w-4 h-4 accent-blue-600 flex-shrink-0 cursor-pointer"
                  onClick={e => e.stopPropagation()}
                />
              )}
              {isBatalSelectable && (
                <input
                  type="checkbox"
                  checked={isBatalSelected}
                  onChange={onToggleBatalSelect}
                  className="w-4 h-4 accent-red-600 flex-shrink-0 cursor-pointer"
                  onClick={e => e.stopPropagation()}
                />
              )}
              <h3 className="text-xl font-bold text-gray-800">{suratJalan.nomorSJ}</h3>
              <span className={`px-3 py-1 rounded-full text-sm font-semibold flex items-center space-x-1 ${getStatusColor(suratJalan.status)}`}>
                {getStatusIcon(suratJalan.status)}
                <span className="capitalize">{suratJalan.status}</span>
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-600">Tgl SJ:</p>
                <p className="font-semibold text-gray-800">{suratJalan.tanggalSJ ? new Date(suratJalan.tanggalSJ).toLocaleDateString('id-ID') : '-'}</p>
              </div>
              <div>
                <p className="text-gray-600">Nomor Polisi:</p>
                <p className="font-semibold text-gray-800">{suratJalan.nomorPolisi || '-'}</p>
              </div>
              <div>
                <p className="text-gray-600">Supir / PT:</p>
                <p className="font-semibold text-gray-800">{suratJalan.namaSupir || '-'} / {suratJalan.pt || '-'}</p>
              </div>
              <div>
                <p className="text-gray-600">Rute:</p>
                <p className="font-semibold text-gray-800">{suratJalan.rute || '-'}</p>
              </div>
              <div>
                <p className="text-gray-600">Material / Qty Isi:</p>
                <p className="font-semibold text-gray-800">{suratJalan.material || '-'} ({suratJalan.qtyIsi || 0} {suratJalan.satuan || ''})</p>
              </div>
              <div>
                <p className="text-gray-600">Uang Jalan:</p>
                <p className="font-bold text-green-600">{formatCurrency(suratJalan.uangJalan || 0)}</p>
              </div>
              {suratJalan.status === 'terkirim' && (
                <>
                  <div>
                    <p className="text-gray-600">Tgl Terkirim:</p>
                    <p className="font-semibold text-green-700">{suratJalan.tglTerkirim ? new Date(suratJalan.tglTerkirim).toLocaleDateString('id-ID') : '-'}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Qty Bongkar:</p>
                    <p className="font-semibold text-green-700">{suratJalan.qtyBongkar || 0} {suratJalan.satuan || ''}</p>
                  </div>
                </>
              )}
            </div>
          </div>
          
          <div className="flex flex-col space-y-2 ml-4">
            {canMarkTerkirim() && suratJalan.status === 'pending' && (
              <button
                onClick={() => onUpdate(suratJalan)}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1 whitespace-nowrap"
              >
                <CheckCircle className="w-4 h-4" />
                <span>Tandai Terkirim</span>
              </button>
            )}
            {canEdit() && (
              <button
                onClick={() => onEditTerkirim(suratJalan)}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1 whitespace-nowrap"
              >
                <Edit className="w-4 h-4" />
                <span>Edit</span>
              </button>
            )}
            {canMarkGagal() && suratJalan.status !== 'gagal' && (
              <button
                onClick={() => onMarkGagal(suratJalan.id)}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1 whitespace-nowrap"
              >
                <XCircle className="w-4 h-4" />
                <span>Tandai Gagal</span>
              </button>
            )}
            {effectiveRole === 'superadmin' && suratJalan.status === 'terkirim' && (
              <button
                onClick={() => onMarkGagal(suratJalan.id)}
                className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1 whitespace-nowrap"
              >
                <XCircle className="w-4 h-4" />
                <span>Batalkan (Gagal)</span>
              </button>
            )}
            {effectiveRole === 'superadmin' && suratJalan.status === 'gagal' && (
              <button
                onClick={() => onRestore(suratJalan.id)}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1 whitespace-nowrap"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Restore</span>
              </button>
            )}
            {effectiveRole === 'superadmin' &&
             suratJalan.status === 'terkirim' &&
             Number(suratJalan.uangJalan || 0) > 0 && (
              <button
                onClick={() => onKirimKeAccounting(suratJalan)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1 whitespace-nowrap"
              >
                <Send className="w-4 h-4" />
                <span>Kirim ke Accounting</span>
              </button>
            )}
            {suratJalan.status === 'menunggu_review' && (
              <div className="bg-blue-50 border border-blue-200 text-blue-700 px-3 py-2 rounded-lg text-xs text-center">
                <Send className="w-3 h-3 inline mr-1" />
                Menunggu review akuntan
              </div>
            )}
            {suratJalan.status === 'terkunci' && (
              <div className="bg-gray-100 border border-gray-300 text-gray-600 px-3 py-2 rounded-lg text-xs text-center">
                <Lock className="w-3 h-3 inline mr-1" />
                Sudah masuk Accounting
              </div>
            )}
            <button
              onClick={() => setExpanded(!expanded)}
              className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1 whitespace-nowrap"
            >
              <Eye className="w-4 h-4" />
              <span>{expanded ? 'Tutup' : 'Detail'}</span>
            </button>
          </div>
        </div>

        {expanded && (
          <div className="mt-6 pt-6 border-t border-gray-200">
            <div className="mb-4">
              <h4 className="font-semibold text-gray-800 mb-2">Detail Lengkap:</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-gray-600">Dibuat oleh:</p>
                  <p className="font-semibold text-gray-800">{suratJalan.createdBy}</p>
                </div>
                <div>
                  <p className="text-gray-600">Tanggal Dibuat:</p>
                  <p className="font-semibold text-gray-800">{new Date(suratJalan.createdAt).toLocaleString('id-ID')}</p>
                </div>
                {suratJalan.updatedAt && (
                  <>
                    <div>
                      <p className="text-gray-600">Diupdate oleh:</p>
                      <p className="font-semibold text-gray-800">{suratJalan.updatedBy}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Tanggal Update:</p>
                      <p className="font-semibold text-gray-800">{new Date(suratJalan.updatedAt).toLocaleString('id-ID')}</p>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const Modal = ({ type, selectedItem, currentUser, setAlertMessage, truckList = [], supirList = [], ruteList = [], materialList = [], suratJalanList = [], pelangganList = [], onClose, onSubmit }) => {
  const [searchInvoiceSJ, setSearchInvoiceSJ] = useState('');
  const initializedRef = React.useRef(false);
  const [biayaTambahanItems, setBiayaTambahanItems] = useState([]);
  const [biayaInput, setBiayaInput] = useState({ jenisBiaya: '', nominal: '', keteranganBiaya: '' });
  const [formData, setFormData] = useState({
    nomorSJ: '',
    tanggalSJ: new Date().toISOString().split('T')[0],
    truckId: '',
    supirId: '',
    ruteId: '',
    materialId: '',
    qtyIsi: '',
    tglTerkirim: selectedItem?.tglTerkirim || new Date().toISOString().split('T')[0],
    qtyBongkar: selectedItem?.qtyBongkar || '',
    noInvoice: '',
    tglInvoice: new Date().toISOString().split('T')[0],
    selectedSJIds: [],
    jenisBiaya: '',
    nominal: '',
    keteranganBiaya: '',
    username: selectedItem?.username || '',
    password: '',
    name: selectedItem?.name || '',
    role: selectedItem?.role || '',
    tipe: '',
    tanggal: new Date().toISOString().split('T')[0],
    keteranganTransaksi: '',
    nomorPolisi: selectedItem?.nomorPolisi || '',
    isActive: selectedItem?.isActive !== undefined ? selectedItem.isActive : true,
    namaSupir: selectedItem?.namaSupir || '',
    pt: selectedItem?.pt || '',
    rute: selectedItem?.rute || '',
    uangJalan: selectedItem?.uangJalan || '',
    material: selectedItem?.material || '',
    satuan: selectedItem?.satuan || '',
    hargaSatuan: '',
    hargaPerGroup: {},
    pelangganId: ''
  });

  // Initialize selectedSJIds untuk editInvoice
  useEffect(() => {
    if (type === 'editInvoice' && selectedItem && !initializedRef.current) {
      const hargaPerGroupObj = {};
      (selectedItem.hargaPerGroup || []).forEach(g => {
        hargaPerGroupObj[`${g.material}|${g.rute}`] = String(g.hargaSatuan);
      });
      setFormData(prev => ({
        ...prev,
        noInvoice: selectedItem.noInvoice || '',
        tglInvoice: selectedItem.tglInvoice || new Date().toISOString().split('T')[0],
        selectedSJIds: selectedItem.suratJalanIds || [],
        hargaSatuan: selectedItem.hargaSatuan != null ? String(selectedItem.hargaSatuan) : '',
        hargaPerGroup: hargaPerGroupObj,
        pelangganId: selectedItem.pelangganId || ''
      }));
      initializedRef.current = true;
    }
    
    // Reset ref saat modal dibuka untuk type lain
    if (type !== 'editInvoice') {
      initializedRef.current = false;
    }
  }, [type, selectedItem]);

  const handleSubmit = () => {
    if (type === 'addSJ') {
      // Validasi semua 9 field wajib diisi
      if (!formData.nomorSJ || !formData.tanggalSJ || !formData.truckId || 
          !formData.supirId || !formData.ruteId || !formData.materialId || !formData.qtyIsi) {
        setAlertMessage('Semua field wajib diisi!\n\nPastikan Anda sudah mengisi:\n1. Nomor SJ\n2. Tanggal SJ\n3. Nomor Polisi (Truck)\n4. Nama Supir\n5. Rute\n6. Material\n7. Qty Isi');
        return;
      }
      
      if (parseFloat(formData.qtyIsi) <= 0) {
        setAlertMessage('Qty Isi harus lebih besar dari 0!');
        return;
      }
      
      onSubmit(formData);
    } else if (type === 'markTerkirim' || type === 'editTerkirim') {
      // Validasi field wajib
      if (!formData.tglTerkirim || !formData.qtyBongkar) {
        setAlertMessage('Tgl Terkirim dan Qty Bongkar wajib diisi!');
        return;
      }
      
      // Validasi Tgl Terkirim tidak boleh lebih awal dari Tgl SJ
      const tglSJ = new Date(selectedItem.tanggalSJ);
      const tglTerkirim = new Date(formData.tglTerkirim);
      if (tglTerkirim < tglSJ) {
        setAlertMessage('Tgl Terkirim tidak boleh lebih awal dari Tgl SJ!\n\nTgl SJ: ' + new Date(selectedItem.tanggalSJ).toLocaleDateString('id-ID'));
        return;
      }
      
      // Validasi Qty Bongkar tidak boleh lebih besar dari Qty Isi
      const qtyBongkar = parseFloat(formData.qtyBongkar);
      const qtyIsi = parseFloat(selectedItem.qtyIsi);
      if (qtyBongkar > qtyIsi) {
        setAlertMessage('Qty Bongkar tidak boleh lebih besar dari Qty Isi!\n\nQty Isi: ' + qtyIsi + ' ' + selectedItem.satuan);
        return;
      }
      
      if (qtyBongkar <= 0) {
        setAlertMessage('Qty Bongkar harus lebih besar dari 0!');
        return;
      }

      onSubmit({ ...formData, biayaTambahan: biayaTambahanItems });
    } else if (type === 'addInvoice' || type === 'editInvoice') {
      if (!formData.noInvoice || !formData.tglInvoice) {
        setAlertMessage('No Invoice dan Tgl Invoice wajib diisi!');
        return;
      }
      if (!formData.pelangganId) {
        setAlertMessage('Pelanggan wajib dipilih!');
        return;
      }
      if (formData.selectedSJIds.length === 0) {
        setAlertMessage('Pilih minimal 1 Surat Jalan untuk invoice!');
        return;
      }
      const selectedSJs = suratJalanList.filter(sj => formData.selectedSJIds.includes(sj.id));
      const groups = [...new Set(selectedSJs.map(sj => `${sj.material}|${sj.rute}`))];
      if (groups.length > 1) {
        const missingGroup = groups.find(g => {
          const h = parseFloat(formData.hargaPerGroup?.[g]);
          return !h || h <= 0;
        });
        if (missingGroup) {
          const [mat, rut] = missingGroup.split('|');
          setAlertMessage(`Harga Jual untuk material "${mat}" rute "${rut}" wajib diisi dan harus lebih besar dari 0!`);
          return;
        }
        const hargaPerGroupArr = groups.map(g => {
          const [material, rute] = g.split('|');
          return { material, rute, hargaSatuan: parseFloat(formData.hargaPerGroup[g]) };
        });
        onSubmit({ ...formData, hargaSatuan: null, hargaPerGroup: hargaPerGroupArr });
      } else {
        const harga = parseFloat(formData.hargaSatuan);
        if (!formData.hargaSatuan || isNaN(harga) || harga <= 0) {
          setAlertMessage('Harga Jual per Satuan wajib diisi dan harus lebih besar dari 0!');
          return;
        }
        onSubmit({ ...formData, hargaSatuan: harga, hargaPerGroup: null });
      }
    } else if (type === 'addTransaksi') {
      if (!formData.tipe || !formData.pt || !formData.nominal || !formData.keteranganTransaksi) {
        setAlertMessage('Tipe, PT, Nominal, dan Keterangan harus diisi!');
        return;
      }
      onSubmit({
        tipe: formData.tipe,
        pt: formData.pt,
        nominal: parseFloat(formData.nominal),
        keterangan: formData.keteranganTransaksi,
        tanggal: formData.tanggal
      });
    } else if (type === 'addUser' || type === 'editUser') {
      if (!formData.username || !formData.name || !formData.role) {
        setAlertMessage('Username, Nama Lengkap, dan Role harus diisi!');
        return;
      }
      if (type === 'addUser' && !formData.password) {
        setAlertMessage('Password harus diisi!');
        return;
      }
      
      const userData = {
        username: formData.username,
        name: formData.name,
        role: formData.role
      };
      
      if (formData.password) {
        userData.password = formData.password;
      }
      
      onSubmit(userData);
    } else if (type === 'addTruck' || type === 'editTruck') {
      if (!formData.nomorPolisi) {
        setAlertMessage('Nomor Polisi harus diisi!');
        return;
      }
      onSubmit({
        nomorPolisi: formData.nomorPolisi,
        isActive: formData.isActive
      });
    } else if (type === 'addSupir' || type === 'editSupir') {
      if (!formData.namaSupir || !formData.pt) {
        setAlertMessage('Nama Supir dan PT harus diisi!');
        return;
      }
      onSubmit({
        namaSupir: formData.namaSupir,
        pt: formData.pt,
        isActive: formData.isActive
      });
    } else if (type === 'addRute' || type === 'editRute') {
      if (!formData.rute || !formData.uangJalan) {
        setAlertMessage('Rute dan Uang Jalan harus diisi!');
        return;
      }
      onSubmit({
        rute: formData.rute,
        uangJalan: parseFloat(formData.uangJalan)
      });
    } else if (type === 'addMaterial' || type === 'editMaterial') {
      if (!formData.material || !formData.satuan) {
        setAlertMessage('Material dan Satuan harus diisi!');
        return;
      }
      onSubmit({
        material: formData.material,
        satuan: formData.satuan
      });
    } else if (type === 'addPelanggan' || type === 'editPelanggan') {
      if (!formData.name?.trim()) {
        setAlertMessage('Nama pelanggan wajib diisi!');
        return;
      }
      onSubmit({
        name: formData.name.trim(),
        address: formData.address || '',
        npwp: formData.npwp || '',
      });
    }
  };

  const getModalTitle = () => {
    if (type === 'addSJ') return 'Tambah Surat Jalan Baru';
    if (type === 'markTerkirim') return 'Tandai Surat Jalan Terkirim';
    if (type === 'editTerkirim') return 'Edit Data Pengiriman';
    if (type === 'addInvoice') return 'Buat Invoice Baru';
    if (type === 'editInvoice') return 'Edit Invoice';
    if (type === 'addTransaksi') return 'Tambah Transaksi Kas';
    if (type === 'addUser') return 'Tambah User Baru';
    if (type === 'editUser') return 'Edit User';
    if (type === 'addTruck') return 'Tambah Truck Baru';
    if (type === 'editTruck') return 'Edit Truck';
    if (type === 'addSupir') return 'Tambah Supir Baru';
    if (type === 'editSupir') return 'Edit Supir';
    if (type === 'addRute') return 'Tambah Rute Baru';
    if (type === 'editRute') return 'Edit Rute';
    if (type === 'addMaterial') return 'Tambah Material Baru';
    if (type === 'editMaterial') return 'Edit Material';
    if (type === 'addPelanggan') return 'Tambah Pelanggan Baru';
    if (type === 'editPelanggan') return 'Edit Pelanggan';
    return 'Form';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className={`bg-white rounded-lg shadow-xl ${(type === 'addSJ' || type === 'markTerkirim' || type === 'editTerkirim' || type === 'addInvoice') ? 'max-w-2xl' : 'max-w-md'} w-full p-6 max-h-[90vh] overflow-y-auto`}>
        <h2 className="text-2xl font-bold text-gray-800 mb-4">
          {getModalTitle()}
        </h2>
        
        <div className="space-y-4">
          {type === 'addSJ' ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">1. Nomor SJ *</label>
                  <input
                    type="text"
                    value={formData.nomorSJ}
                    onChange={(e) => setFormData({ ...formData, nomorSJ: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                    placeholder="Contoh: SJ/2024/001"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">2. Tanggal SJ *</label>
                  <input
                    type="date"
                    value={formData.tanggalSJ}
                    onChange={(e) => setFormData({ ...formData, tanggalSJ: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>
              
              <SearchableSelect
                options={truckList.filter(t => t.isActive)}
                value={formData.truckId}
                onChange={(value) => setFormData({ ...formData, truckId: value })}
                placeholder="Pilih Nomor Polisi"
                label="3. Nomor Polisi"
                displayKey="nomorPolisi"
                valueKey="id"
              />
              
              <SearchableSelect
                options={supirList.filter(s => s.isActive)}
                value={formData.supirId}
                onChange={(value) => setFormData({ ...formData, supirId: value })}
                placeholder="Pilih Nama Supir"
                label="4. Nama Supir"
                displayKey="namaSupir"
                valueKey="id"
              />
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">5. PT (Auto-fill)</label>
                <input
                  type="text"
                  value={supirList.find(s => s.id === formData.supirId)?.pt || '-'}
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700"
                />
              </div>
              
              <SearchableSelect
                options={ruteList.map(r => ({
                  ...r,
                  displayName: `${r.rute} - Rp ${new Intl.NumberFormat('id-ID').format(r.uangJalan)}`
                }))}
                value={formData.ruteId}
                onChange={(value) => setFormData({ ...formData, ruteId: value })}
                placeholder="Pilih Rute"
                label="6. Rute"
                displayKey="displayName"
                valueKey="id"
              />
              
              <SearchableSelect
                options={materialList}
                value={formData.materialId}
                onChange={(value) => setFormData({ ...formData, materialId: value })}
                placeholder="Pilih Material"
                label="7. Material"
                displayKey="material"
                valueKey="id"
              />
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">8. Satuan (Auto-fill)</label>
                  <input
                    type="text"
                    value={materialList.find(m => m.id === formData.materialId)?.satuan || '-'}
                    disabled
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">9. Qty Isi *</label>
                  <input
                    type="number"
                    value={formData.qtyIsi}
                    onChange={(e) => setFormData({ ...formData, qtyIsi: e.target.value })}
                    onWheel={(e) => e.currentTarget.blur()}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                    placeholder="Contoh: 100"
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>
              
              <div className="bg-green-50 p-4 rounded-lg mt-2">
                <p className="text-sm text-green-800 font-semibold mb-2">📝 Informasi:</p>
                <ul className="text-xs text-green-700 space-y-1">
                  <li>• Semua field bertanda (*) wajib diisi</li>
                  <li>• Uang Jalan akan otomatis dicatat sebagai pengeluaran</li>
                  <li>• Status awal akan menjadi "Pending"</li>
                  <li>• Gunakan fitur search untuk mencari data lebih cepat</li>
                </ul>
              </div>
            </>
          ) : type === 'markTerkirim' || type === 'editTerkirim' ? (
            <>
              {/* Info Surat Jalan */}
              <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded-lg mb-4">
                <h3 className="font-semibold text-green-900 mb-3">📋 Informasi Surat Jalan</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-green-700 font-medium">Nomor SJ:</p>
                    <p className="text-green-900 font-bold">{selectedItem?.nomorSJ}</p>
                  </div>
                  <div>
                    <p className="text-green-700 font-medium">Tgl SJ:</p>
                    <p className="text-green-900 font-bold">{selectedItem?.tanggalSJ ? new Date(selectedItem.tanggalSJ).toLocaleDateString('id-ID') : '-'}</p>
                  </div>
                  <div>
                    <p className="text-green-700 font-medium">Nomor Polisi:</p>
                    <p className="text-green-900 font-bold">{selectedItem?.nomorPolisi}</p>
                  </div>
                  <div>
                    <p className="text-green-700 font-medium">Rute:</p>
                    <p className="text-green-900 font-bold">{selectedItem?.rute}</p>
                  </div>
                  <div>
                    <p className="text-green-700 font-medium">Material:</p>
                    <p className="text-green-900 font-bold">{selectedItem?.material}</p>
                  </div>
                  <div>
                    <p className="text-green-700 font-medium">Satuan:</p>
                    <p className="text-green-900 font-bold">{selectedItem?.satuan}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-green-700 font-medium">Qty Isi:</p>
                    <p className="text-green-900 font-bold text-lg">{selectedItem?.qtyIsi} {selectedItem?.satuan}</p>
                  </div>
                </div>
              </div>

              {/* Form Input */}
              <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded-lg">
                <h3 className="font-semibold text-green-900 mb-3">✍️ Data Pengiriman</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Tgl Terkirim *
                      <span className="text-xs text-gray-500 ml-2">(tidak boleh lebih awal dari Tgl SJ)</span>
                    </label>
                    <input
                      type="date"
                      value={formData.tglTerkirim}
                      onChange={(e) => setFormData({ ...formData, tglTerkirim: e.target.value })}
                      min={selectedItem?.tanggalSJ}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Qty Bongkar *
                      <span className="text-xs text-gray-500 ml-2">(max: {selectedItem?.qtyIsi} {selectedItem?.satuan})</span>
                    </label>
                    <input
                      type="number"
                      value={formData.qtyBongkar}
                      onChange={(e) => setFormData({ ...formData, qtyBongkar: e.target.value })}
                      onWheel={(e) => e.currentTarget.blur()}
                      max={selectedItem?.qtyIsi}
                      min="0"
                      step="0.01"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                      placeholder={`Contoh: ${selectedItem?.qtyIsi}`}
                    />
                  </div>
                </div>
              </div>

              {/* Biaya Tambahan — hanya saat markTerkirim */}
              {type === 'markTerkirim' && (
                <div className="border border-orange-200 rounded-lg p-4 bg-orange-50">
                  <h3 className="font-semibold text-orange-900 mb-3 text-sm">Biaya Tambahan <span className="font-normal text-orange-600">(opsional)</span></h3>
                  {biayaTambahanItems.length > 0 && (
                    <div className="mb-3 space-y-2">
                      {biayaTambahanItems.map(b => (
                        <div key={b.tempId} className="flex items-center justify-between bg-white rounded p-2 border border-orange-200 text-sm">
                          <div>
                            <span className="font-semibold">{b.jenisBiaya}</span>
                            {b.keteranganBiaya && <span className="text-gray-500 ml-1">— {b.keteranganBiaya}</span>}
                            <span className="ml-2 text-orange-700 font-bold">Rp {Number(b.nominal).toLocaleString('id-ID')}</span>
                          </div>
                          <button
                            onClick={() => setBiayaTambahanItems(prev => prev.filter(x => x.tempId !== b.tempId))}
                            className="text-red-500 hover:text-red-700 ml-2 text-xs"
                          >✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="space-y-2">
                    <input
                      type="text"
                      placeholder="Jenis Biaya (mis: Solar, Tol, Bonus Ritasi)"
                      value={biayaInput.jenisBiaya}
                      onChange={(e) => setBiayaInput({ ...biayaInput, jenisBiaya: e.target.value })}
                      className="w-full px-3 py-2 border border-orange-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-400"
                    />
                    <div className="flex gap-2">
                      <input
                        type="number"
                        placeholder="Nominal (Rp)"
                        value={biayaInput.nominal}
                        onChange={(e) => setBiayaInput({ ...biayaInput, nominal: e.target.value })}
                        onWheel={(e) => e.currentTarget.blur()}
                        className="flex-1 px-3 py-2 border border-orange-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-400"
                      />
                      <input
                        type="text"
                        placeholder="Keterangan (opsional)"
                        value={biayaInput.keteranganBiaya}
                        onChange={(e) => setBiayaInput({ ...biayaInput, keteranganBiaya: e.target.value })}
                        className="flex-1 px-3 py-2 border border-orange-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-400"
                      />
                    </div>
                    <button
                      onClick={() => {
                        if (!biayaInput.jenisBiaya || !biayaInput.nominal || parseFloat(biayaInput.nominal) <= 0) return;
                        setBiayaTambahanItems(prev => [...prev, {
                          ...biayaInput,
                          tempId: Date.now(),
                          nominal: parseFloat(biayaInput.nominal)
                        }]);
                        setBiayaInput({ jenisBiaya: '', nominal: '', keteranganBiaya: '' });
                      }}
                      className="w-full py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm transition"
                    >
                      + Tambah Biaya
                    </button>
                  </div>
                </div>
              )}

              {/* Warning Info */}
              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 rounded-lg">
                <p className="text-sm text-yellow-800">
                  ⚠️ <strong>Perhatian:</strong> Pastikan data yang diisi sudah benar. Setelah disimpan, Admin SJ tidak bisa mengubah data ini lagi (hanya Super Admin yang bisa edit).
                </p>
              </div>
            </>
          ) : (type === 'addInvoice' || type === 'editInvoice') ? (
            <>
              {/* Form Invoice */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">No Invoice *</label>
                  <input
                    type="text"
                    value={formData.noInvoice}
                    onChange={(e) => setFormData({ ...formData, noInvoice: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                    placeholder="Contoh: INV/2024/001"
                    disabled={type === 'editInvoice'}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tgl Invoice *</label>
                  <input
                    type="date"
                    value={formData.tglInvoice}
                    onChange={(e) => setFormData({ ...formData, tglInvoice: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                    disabled={type === 'editInvoice'}
                  />
                </div>
              </div>

              {/* Pelanggan */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Pelanggan *</label>
                <select
                  value={formData.pelangganId}
                  onChange={(e) => setFormData({ ...formData, pelangganId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                >
                  <option value="">-- Pilih Pelanggan --</option>
                  {pelangganList.filter(p => p.isActive !== false && !p.deletedAt).map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                {pelangganList.filter(p => p.isActive !== false && !p.deletedAt).length === 0 && (
                  <p className="text-xs text-orange-600 mt-1">Belum ada data pelanggan. Tambahkan di menu Master Data → Pelanggan.</p>
                )}
              </div>

              {/* Pilih Surat Jalan */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Pilih Surat Jalan * <span className="text-xs text-gray-500">
                    {type === 'editInvoice' ? '(tambah atau hapus SJ dari invoice)' : '(yang sudah terkirim)'}
                  </span>
                </label>
                
                {/* Search Bar */}
                <div className="mb-3">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Cari Nomor SJ, Rute, Material, atau Nomor Polisi..."
                      value={searchInvoiceSJ}
                      onChange={(e) => setSearchInvoiceSJ(e.target.value)}
                      className="w-full px-3 py-2 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                    />
                    <Search className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" />
                    {searchInvoiceSJ && (
                      <button
                        onClick={() => setSearchInvoiceSJ('')}
                        className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                      >
                        <XCircle className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </div>
                
                <div className="border border-gray-300 rounded-lg p-4 max-h-80 overflow-y-auto bg-gray-50">
                  {suratJalanList
                    .filter(sj => {
                      const isBelumInvoice = (sj.statusInvoice == null || sj.statusInvoice === '' || sj.statusInvoice === 'belum');
                      const baseEligible = ((sj.status === 'terkirim' || sj.status === 'terkunci') && sj.isActive !== false);

                      // Untuk edit: tampilkan SJ yang sudah di invoice INI atau yang available
                      if (type === 'editInvoice') {
                        return baseEligible && (isBelumInvoice || sj.invoiceId === selectedItem?.id);
                      }
                      // Untuk add: hanya tampilkan yang available
                      return baseEligible && isBelumInvoice;
                    })
                    .filter(sj => {
                      if (!searchInvoiceSJ) return true;
                      const search = searchInvoiceSJ.toLowerCase();
                      return (
                        sj.nomorSJ.toLowerCase().includes(search) ||
                        sj.rute.toLowerCase().includes(search) ||
                        sj.material.toLowerCase().includes(search) ||
                        sj.nomorPolisi.toLowerCase().includes(search)
                      );
                    }).length === 0 ? (
                    <div className="text-center py-8">
                      <Package className="w-12 h-12 mx-auto text-gray-300 mb-2" />
                      <p className="text-gray-500 font-medium">
                        {searchInvoiceSJ ? 'Tidak ada SJ yang cocok dengan pencarian' : 'Tidak ada Surat Jalan yang bisa di-invoice'}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {searchInvoiceSJ ? 'Coba kata kunci lain' : 'Semua SJ terkirim sudah terinvoice'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {suratJalanList
                        .filter(sj => {
                          const isBelumInvoice = (sj.statusInvoice == null || sj.statusInvoice === '' || sj.statusInvoice === 'belum');
                          const baseEligible = ((sj.status === 'terkirim' || sj.status === 'terkunci') && sj.isActive !== false);

                          if (type === 'editInvoice') {
                            return baseEligible && (isBelumInvoice || sj.invoiceId === selectedItem?.id);
                          }
                          return baseEligible && isBelumInvoice;
                        })
                        .filter(sj => {
                          if (!searchInvoiceSJ) return true;
                          const search = searchInvoiceSJ.toLowerCase();
                          return (
                            sj.nomorSJ.toLowerCase().includes(search) ||
                            sj.rute.toLowerCase().includes(search) ||
                            sj.material.toLowerCase().includes(search) ||
                            sj.nomorPolisi.toLowerCase().includes(search)
                          );
                        })
                        .map(sj => (
                          <label 
                            key={sj.id} 
                            className={`flex items-start space-x-3 p-3 rounded-lg cursor-pointer border-2 transition ${
                              formData.selectedSJIds.includes(sj.id)
                                ? 'bg-green-50 border-green-500'
                                : 'bg-white border-gray-200 hover:border-green-300 hover:bg-green-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={formData.selectedSJIds.includes(sj.id)}
                              onChange={(e) => {
                                console.log('Checkbox changed:', sj.nomorSJ, 'checked:', e.target.checked);
                                console.log('Current selectedSJIds:', formData.selectedSJIds);
                                if (e.target.checked) {
                                  const newIds = [...formData.selectedSJIds, sj.id];
                                  console.log('Adding SJ, new IDs:', newIds);
                                  setFormData({ ...formData, selectedSJIds: newIds });
                                } else {
                                  const newIds = formData.selectedSJIds.filter(id => id !== sj.id);
                                  console.log('Removing SJ, new IDs:', newIds);
                                  setFormData({ ...formData, selectedSJIds: newIds });
                                }
                              }}
                              className="mt-1 w-4 h-4 text-green-600 focus:ring-green-500"
                            />
                            <div className="flex-1">
                              <div className="flex items-center justify-between mb-1">
                                <p className="font-bold text-gray-800">{sj.nomorSJ}</p>
                                <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-semibold">
                                  Terkirim
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-sm">
                                <div>
                                  <p className="text-gray-600">Rute:</p>
                                  <p className="font-semibold text-gray-800">{sj.rute}</p>
                                </div>
                                <div>
                                  <p className="text-gray-600">Material:</p>
                                  <p className="font-semibold text-gray-800">{sj.material}</p>
                                </div>
                                <div>
                                  <p className="text-gray-600">Qty Bongkar:</p>
                                  <p className="font-semibold text-green-600">{sj.qtyBongkar} {sj.satuan}</p>
                                </div>
                                <div>
                                  <p className="text-gray-600">Tgl Terkirim:</p>
                                  <p className="font-semibold text-gray-800">
                                    {sj.tglTerkirim ? new Date(sj.tglTerkirim).toLocaleDateString('id-ID') : '-'}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </label>
                        ))}
                    </div>
                  )}
                </div>
                {formData.selectedSJIds.length > 0 && (
                  <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm text-green-800 font-semibold flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" />
                      {formData.selectedSJIds.length} Surat Jalan dipilih untuk invoice
                    </p>
                  </div>
                )}
              </div>

              {/* Harga Jual per Satuan — ditampilkan setelah SJ dipilih */}
              {(() => {
                const selectedSJs = suratJalanList.filter(sj => formData.selectedSJIds.includes(sj.id));
                const groups = [...new Set(selectedSJs.map(sj => `${sj.material}|${sj.rute}`))];
                const isMultiGroup = groups.length > 1;

                if (!isMultiGroup) {
                  const satuan = selectedSJs[0]?.satuan || 'satuan';
                  const totalQty = selectedSJs.reduce((s, sj) => s + (Number(sj.qtyBongkar) || 0), 0);
                  const harga = parseFloat(formData.hargaSatuan) || 0;
                  const totalNilai = totalQty * harga;
                  return (
                    <div className="mb-4 p-4 border border-blue-200 rounded-lg bg-blue-50">
                      <label className="block text-sm font-semibold text-blue-800 mb-2">
                        Harga Jual per Satuan (Rp/{satuan}) *
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={formData.hargaSatuan}
                        onChange={(e) => setFormData({ ...formData, hargaSatuan: e.target.value })}
                        onWheel={(e) => e.currentTarget.blur()}
                        className="w-full px-3 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="Contoh: 150000"
                      />
                      {formData.selectedSJIds.length > 0 && harga > 0 && (
                        <div className="mt-2 flex justify-between text-sm text-blue-700">
                          <span>Total Qty: <strong>{totalQty.toFixed(2)} {satuan}</strong></span>
                          <span>Nilai Invoice: <strong>Rp {totalNilai.toLocaleString('id-ID')}</strong></span>
                        </div>
                      )}
                    </div>
                  );
                }

                // Multi-group: per-group harga inputs
                let totalNilaiAll = 0;
                const groupRows = groups.map(groupKey => {
                  const [mat, rut] = groupKey.split('|');
                  const groupSJs = selectedSJs.filter(sj => sj.material === mat && sj.rute === rut);
                  const satuan = groupSJs[0]?.satuan || 'satuan';
                  const totalQty = groupSJs.reduce((s, sj) => s + (Number(sj.qtyBongkar) || 0), 0);
                  const harga = parseFloat(formData.hargaPerGroup?.[groupKey]) || 0;
                  const nilai = totalQty * harga;
                  totalNilaiAll += nilai;
                  return { groupKey, mat, rut, satuan, totalQty, harga, nilai };
                });
                return (
                  <div className="mb-4 p-4 border border-blue-200 rounded-lg bg-blue-50 space-y-3">
                    <p className="text-sm font-semibold text-blue-800">
                      Harga Jual per Satuan *
                      <span className="ml-2 text-xs font-normal text-blue-600">(Material/rute berbeda — isi per grup)</span>
                    </p>
                    {groupRows.map(({ groupKey, mat, rut, satuan, totalQty, harga, nilai }) => (
                      <div key={groupKey} className="bg-white rounded-lg p-3 border border-blue-200">
                        <p className="text-xs font-semibold text-gray-700 mb-1">
                          {mat} — {rut}
                          <span className="ml-2 text-gray-500 font-normal">({totalQty.toFixed(2)} {satuan})</span>
                        </p>
                        <input
                          type="number"
                          min="1"
                          value={formData.hargaPerGroup?.[groupKey] || ''}
                          onChange={(e) => setFormData({
                            ...formData,
                            hargaPerGroup: { ...formData.hargaPerGroup, [groupKey]: e.target.value }
                          })}
                          onWheel={(e) => e.currentTarget.blur()}
                          className="w-full px-3 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          placeholder={`Rp/satuan untuk ${mat}`}
                        />
                        {harga > 0 && (
                          <p className="text-xs text-blue-700 mt-1">
                            Nilai: <strong>Rp {nilai.toLocaleString('id-ID')}</strong>
                          </p>
                        )}
                      </div>
                    ))}
                    {totalNilaiAll > 0 && (
                      <div className="flex justify-end text-sm text-blue-700 font-semibold border-t border-blue-200 pt-2">
                        Total Nilai Invoice: Rp {totalNilaiAll.toLocaleString('id-ID')}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Info */}
              <div className="bg-green-50 border-l-4 border-green-500 p-3 rounded-lg">
                <p className="text-sm text-green-800">
                  💡 <strong>Info:</strong> Pilih satu atau lebih Surat Jalan yang sudah terkirim untuk dibuatkan invoice. Setelah invoice dibuat, Surat Jalan akan berstatus "Terinvoice".
                </p>
              </div>
            </>
          ) : type === 'addTransaksi' ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipe Transaksi *</label>
                <select
                  value={formData.tipe}
                  onChange={(e) => setFormData({ ...formData, tipe: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                >
                  <option value="">Pilih Tipe</option>
                  <option value="pemasukan">Pemasukan</option>
                  <option value="pengeluaran">Pengeluaran</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PT *</label>
                <select
                  value={formData.pt}
                  onChange={(e) => setFormData({ ...formData, pt: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                >
                  <option value="">Pilih PT</option>
                  {[...new Set(supirList.map(s => s.pt).filter(Boolean))].sort().map(pt => (
                    <option key={pt} value={pt}>{pt}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal *</label>
                <input
                  type="date"
                  value={formData.tanggal}
                  onChange={(e) => setFormData({ ...formData, tanggal: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nominal (Rp) *</label>
                <input
                  type="number"
                  value={formData.nominal}
                  onChange={(e) => setFormData({ ...formData, nominal: e.target.value })}
                  onWheel={(e) => e.currentTarget.blur()}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="Contoh: 500000"
                  min="0"
                  step="1000"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Keterangan *</label>
                <textarea
                  value={formData.keteranganTransaksi}
                  onChange={(e) => setFormData({ ...formData, keteranganTransaksi: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  rows="2"
                  placeholder="Deskripsi transaksi"
                />
              </div>
            </>
          ) : (type === 'addUser' || type === 'editUser') ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Username *</label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="Username untuk login"
                  disabled={type === 'editUser'}
                />
                {type === 'editUser' && (
                  <p className="text-xs text-gray-500 mt-1">Username tidak dapat diubah</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password {type === 'editUser' ? '(Kosongkan jika tidak ingin mengubah)' : '*'}
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder={type === 'editUser' ? 'Masukkan password baru' : 'Masukkan password'}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Lengkap *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="Nama lengkap user"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role *</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                >
                  <option value="">Pilih Role</option>
                  <option value="admin_sj">Admin Surat Jalan</option>
                  <option value="admin_keuangan">Admin Keuangan</option>
                  <option value="admin_invoice">Admin Invoice</option>
                  <option value="reader">Reader</option>
                </select>
              </div>
            </>
          ) : null}

          {/* Truck Form */}
          {(type === 'addTruck' || type === 'editTruck') && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nomor Polisi *</label>
                <input
                  type="text"
                  value={formData.nomorPolisi}
                  onChange={(e) => setFormData({ ...formData, nomorPolisi: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="Contoh: B 1234 XYZ"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status *</label>
                <select
                  value={formData.isActive ? 'true' : 'false'}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.value === 'true' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                >
                  <option value="true">Aktif</option>
                  <option value="false">Nonaktif</option>
                </select>
              </div>
            </>
          )}

          {/* Supir Form */}
          {(type === 'addSupir' || type === 'editSupir') && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Supir *</label>
                <input
                  type="text"
                  value={formData.namaSupir}
                  onChange={(e) => setFormData({ ...formData, namaSupir: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="Nama lengkap supir"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PT *</label>
                <input
                  type="text"
                  value={formData.pt}
                  onChange={(e) => setFormData({ ...formData, pt: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="Nama perusahaan"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status *</label>
                <select
                  value={formData.isActive ? 'true' : 'false'}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.value === 'true' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                >
                  <option value="true">Aktif</option>
                  <option value="false">Nonaktif</option>
                </select>
              </div>
            </>
          )}

          {/* Pelanggan Form */}
          {(type === 'addPelanggan' || type === 'editPelanggan') && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Pelanggan / PT *</label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="PT. Nama Perusahaan"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Alamat</label>
                <textarea
                  value={formData.address || ''}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  rows={2}
                  placeholder="Alamat lengkap..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">NPWP</label>
                <input
                  type="text"
                  value={formData.npwp || ''}
                  onChange={(e) => setFormData({ ...formData, npwp: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono focus:ring-2 focus:ring-green-500"
                  placeholder="00.000.000.0-000.000"
                />
              </div>
            </>
          )}

          {/* Rute Form */}
          {(type === 'addRute' || type === 'editRute') && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rute *</label>
                <input
                  type="text"
                  value={formData.rute}
                  onChange={(e) => setFormData({ ...formData, rute: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="Contoh: Jakarta - Surabaya"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Uang Jalan (Rp) *</label>
                <input
                  type="number"
                  value={formData.uangJalan}
                  onChange={(e) => setFormData({ ...formData, uangJalan: e.target.value })}
                  onWheel={(e) => e.currentTarget.blur()}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="Contoh: 500000"
                  min="0"
                  step="10000"
                />
              </div>
            </>
          )}

          {/* Material Form */}
          {(type === 'addMaterial' || type === 'editMaterial') && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Material *</label>
                <input
                  type="text"
                  value={formData.material}
                  onChange={(e) => setFormData({ ...formData, material: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="Contoh: Semen"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Satuan *</label>
                <input
                  type="text"
                  value={formData.satuan}
                  onChange={(e) => setFormData({ ...formData, satuan: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="Contoh: Ton, Kg, m³"
                />
              </div>
            </>
          )}

          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 py-2 rounded-lg transition font-medium"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg transition font-medium"
            >
              Simpan
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SuratJalanMonitor;