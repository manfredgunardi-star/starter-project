// Normalisasi row Firestore — dipindah verbatim dari App.jsx (commit 5857b91).

// Returns ISO date string for the 1st of the month, 12 months ago
export const getQueryStartISO = () => {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() - 12; // 0-indexed
  if (month < 0) { month += 12; year -= 1; }
  return `${year}-${String(month + 1).padStart(2, '0')}-01`;
};

export const normalizeSJ = (row, docId) => {
  const id = row?.id || docId;
  const tanggalSJ = row?.tanggalSJ || row?.tglSJ || row?.tgl_sj || row?.tanggal || row?.date || "";
  return {
    ...(row || {}),
    id,
    tanggalSJ,
    isActive: row?.isActive !== false,
  };
};

export const normalizeInvoice = (row, docId) => {
  const id = row?.id || docId;
  const tglInvoice = row?.tglInvoice || row?.tanggalInvoice || row?.tgl_invoice || "";
  return {
    ...(row || {}),
    id,
    tglInvoice,
    isActive: row?.isActive !== false,
  };
};

export const isLiveRow = (x) => !x?.deletedAt && x?.isActive !== false;
