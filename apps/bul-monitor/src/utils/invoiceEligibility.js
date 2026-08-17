/**
 * Satu-satunya sumber kebenaran untuk "Surat Jalan mana yang boleh masuk invoice".
 *
 * Sebelumnya predikat ini tersalin tiga kali di Modal.jsx: dua di daftar checklist
 * dan satu di daftar yang dipakai import CSV. Kalau salah satu salinan diperketat
 * dan yang lain tertinggal, jalur import bisa menawarkan Surat Jalan yang tidak
 * boleh dicentang manual — dan karena import melewati review visual per kartu,
 * tidak ada yang akan melihatnya. Karena itu semuanya dipusatkan di sini.
 *
 * @param {object} sj Dokumen Surat Jalan.
 * @param {object} [opsi]
 * @param {boolean} [opsi.isEdit=false] true saat form sedang mengedit invoice lama.
 * @param {string} [opsi.editingInvoiceId] id invoice yang sedang diedit; hanya dipakai saat isEdit.
 * @returns {boolean}
 */
export function isSJEligibleForInvoice(sj, { isEdit = false, editingInvoiceId } = {}) {
  const belumInvoice =
    sj.statusInvoice == null || sj.statusInvoice === '' || sj.statusInvoice === 'belum';
  const baseEligible =
    (sj.status === 'terkirim' || sj.status === 'terkunci') && sj.isActive !== false;

  // Saat mengedit, SJ yang sudah menempel di invoice INI tetap harus tampil
  // supaya bisa dilepas kembali.
  if (isEdit) {
    return baseEligible && (belumInvoice || sj.invoiceId === editingInvoiceId);
  }
  return baseEligible && belumInvoice;
}
