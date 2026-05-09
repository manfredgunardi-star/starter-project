// src/utils/sjHelpers.js

export const isSJTerinvoice = (sj) => {
  const statusInvoice = String(sj?.statusInvoice || '').toLowerCase();
  return statusInvoice === 'terinvoice' || !!sj?.invoiceId || !!sj?.invoiceNo;
};

export const isSJBelumInvoice = (sj) =>
  String(sj?.status || '').toLowerCase() === 'terkirim' && !isSJTerinvoice(sj);

export const mergeById = (a = [], b = []) => {
  const m = new Map();
  [...a, ...b].forEach((x) => {
    if (!x) return;
    const id = String(x.id ?? '');
    if (!id) return;
    const prev = m.get(id);
    if (!prev) {
      m.set(id, x);
      return;
    }
    const prevTs = String(prev.updatedAt || prev.createdAt || '');
    const nextTs = String(x.updatedAt || x.createdAt || '');
    if (nextTs > prevTs) m.set(id, x);
  });
  return Array.from(m.values());
};
