// Pure helper cluster extracted from App.jsx (monolith-refactor unit U12a).
// Byte-identical relocation — no logic changes. Firestore-write helpers stay in
// App.jsx (unit U12b) pending human/accountant review.

// ===== Auto Transaksi Uang Jalan (derived from Surat Jalan) =====
// Deterministic ID -> idempotent (tidak dobel meskipun sync dijalankan berkali-kali)
// NOTE: gunakan function declaration agar hoisted (dipakai oleh helper sebelum definisinya).
export function buildUangJalanTransaksiId(sjId) {
  return `TX-UJ-${String(sjId)}`;
}

// Generate a per-login session id used to enforce single active session per user
export const generateSessionId = () => {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch (_) {}
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

// === Helpers (single source) ===
export const formatCurrency = (amount) => {
  const n = Number(amount || 0);
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(n);
};

// Format date value into Indonesian display (dd/mm/yyyy).
// Accepts: "YYYY-MM-DD", ISO strings, Date objects.
export const formatTanggalID = (value) => {
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

export const downloadSJRecapToExcel = async (suratJalanList = [], options = {}) => {
  try {
    const XLSX = await import('xlsx');
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
  } catch (err) {
    console.error('Excel export failed:', err);
    throw new Error(`Gagal export Excel: ${err?.message || 'Unknown error'}`);
  }
};

// Remove undefined values recursively so Firestore doesn't reject the payload
export const sanitizeForFirestore = (input) => {
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
