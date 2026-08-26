import { normalizeTerm } from './searchFilter.js';

/**
 * Pencarian invoice bersifat "dalam": kata kunci dicocokkan ke nomor invoice
 * DAN ke setiap Surat Jalan yang termuat di dalamnya. Ini menjawab pertanyaan
 * operasional "invoice mana yang memuat SJ 02193?".
 *
 * Snapshot SJ disimpan di invoice.suratJalanList (lihat App.jsx saat invoice
 * dibuat). Data invoice lama bisa saja tidak memilikinya, sehingga field ini
 * selalu diperlakukan opsional.
 */
export const INVOICE_SJ_SEARCH_FIELDS = ['nomorSJ', 'nomorPolisi', 'rute', 'material'];

export function matchesInvoiceSearch(invoice, term) {
  const needle = normalizeTerm(term);
  if (!needle) return true;

  if (String(invoice?.noInvoice ?? '').toLowerCase().includes(needle)) return true;

  const nested = Array.isArray(invoice?.suratJalanList) ? invoice.suratJalanList : [];
  return nested.some((sj) =>
    INVOICE_SJ_SEARCH_FIELDS.some((field) =>
      String(sj?.[field] ?? '').toLowerCase().includes(needle)
    )
  );
}

export function filterInvoicesBySearch(invoiceList, term) {
  const items = Array.isArray(invoiceList) ? invoiceList : [];
  const needle = normalizeTerm(term);
  if (!needle) return items;
  return items.filter((invoice) => matchesInvoiceSearch(invoice, needle));
}
