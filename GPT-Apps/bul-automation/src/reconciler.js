export function normalizeSjNumber(value) {
  return String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function withinPeriod(dateValue, periodStart, periodEnd) {
  if (!dateValue) return true;
  const date = canonicalDate(dateValue);
  return date >= periodStart && date <= periodEnd;
}

export function reconcileDocumentSets({ suratJalan = [], ritasi = [], invoices = [], periodStart, periodEnd }) {
  const sjByNo = indexBySj(suratJalan);
  const ritasiByNo = indexBySj(ritasi);
  const invoiceSj = new Set();

  for (const invoice of invoices) {
    for (const no of invoice.suratJalanNos || invoice.nomorSJList || []) {
      const normalized = normalizeSjNumber(no);
      if (normalized) invoiceSj.add(normalized);
    }
    const single = normalizeSjNumber(invoice.nomorSJ);
    if (single) invoiceSj.add(single);
  }

  const sjNotInRitasi = [...sjByNo.entries()]
    .filter(([no]) => !ritasiByNo.has(no))
    .map(([, row]) => row);
  const ritasiNotInSj = [...ritasiByNo.entries()]
    .filter(([no]) => !sjByNo.has(no))
    .map(([, row]) => row);
  const sjWithoutInvoice = [...sjByNo.entries()]
    .filter(([no]) => !invoiceSj.has(no))
    .map(([, row]) => row);
  const outOfPeriod = [...sjByNo.values()]
    .filter((row) => !withinPeriod(row.tanggal || row.tanggalSJ || row.tglTerkirim, periodStart, periodEnd));

  return {
    counts: {
      suratJalan: sjByNo.size,
      ritasi: ritasiByNo.size,
      invoices: invoices.length
    },
    sjNotInRitasi,
    ritasiNotInSj,
    sjWithoutInvoice,
    outOfPeriod
  };
}

function indexBySj(rows) {
  const map = new Map();
  for (const row of rows) {
    const no = normalizeSjNumber(row.nomorSJ || row.noSJ || row.no_sj);
    if (no && !map.has(no)) {
      map.set(no, { ...row, nomorSJ: no });
    }
  }
  return map;
}

function canonicalDate(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value || '').trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(text);
  if (slash) {
    const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
    return `${year}-${slash[1].padStart(2, '0')}-${slash[2].padStart(2, '0')}`;
  }
  return text.slice(0, 10);
}
