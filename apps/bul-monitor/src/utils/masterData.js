// src/utils/masterData.js
// Helper murni untuk Master Data (truck / supir / rute / material / pelanggan).
// Dipisah dari App.jsx supaya aturan "aktif / nonaktif" punya satu sumber kebenaran
// dan bisa diuji tanpa Firestore.

// Item dianggap AKTIF kecuali isActive di-set false secara eksplisit.
// Data lama tidak punya field isActive, jadi undefined = aktif (backward compatible).
export const isMasterActive = (item) => item?.isActive !== false && !item?.deletedAt;

// Normalisasi satu dokumen Firestore -> bentuk yang dipakai UI.
export const normalizeMasterItem = (row, docId) => {
  const data = row || {};
  return { ...data, id: data.id || docId, isActive: data.isActive !== false };
};

// Payload update Master Data.
//
// PENTING: `isActive: true` ditulis SEBELUM `...updates` supaya perannya hanya
// sebagai DEFAULT untuk dokumen lama yang belum punya field tersebut. Kalau form
// mengirim `isActive: false`, nilai dari form yang menang — inilah yang membuat
// fitur "Nonaktifkan" benar-benar tersimpan. Menaruhnya sesudah `...updates`
// akan diam-diam mengaktifkan ulang setiap item yang baru saja dinonaktifkan.
export const buildMasterUpdatePayload = (id, updates = {}, meta = {}) => {
  const payload = {
    id,
    isActive: true,
    ...updates,
    updatedAt: meta.updatedAt || new Date().toISOString(),
    updatedBy: meta.updatedBy || 'system',
  };

  // Kalau form secara eksplisit memilih "Aktif", bersihkan juga jejak soft delete.
  // Tanpa ini item yang pernah di-Nonaktifkan lewat tombol (punya deletedAt) akan tetap
  // tersembunyi walaupun statusnya sudah diubah jadi Aktif dari form Edit.
  if (updates.isActive === true) {
    payload.deletedAt = null;
    payload.deletedBy = null;
  }

  return payload;
};

// Payload untuk mengaktifkan kembali item yang nonaktif / sudah di-soft-delete.
// deletedAt/deletedBy di-null-kan supaya item lolos filter `!deletedAt` lagi.
export const buildMasterActivatePayload = (id, meta = {}) => ({
  id,
  isActive: true,
  deletedAt: null,
  deletedBy: null,
  updatedAt: meta.updatedAt || new Date().toISOString(),
  updatedBy: meta.updatedBy || 'system',
});
