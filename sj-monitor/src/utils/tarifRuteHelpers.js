// src/utils/tarifRuteHelpers.js
// Pure helpers for time-versioned Uang Jalan per rute.
// No Firestore imports — safe to use in Node smoke tests.

/**
 * Build lookup index: { [ruteId]: [{ uangJalan, effectiveDate }, ...] } sorted DESC by date.
 * @param {Array} tarifRuteList - items from collection `tarif_rute` (isActive only)
 */
export function indexTarifRute(tarifRuteList) {
  const index = {};
  (tarifRuteList || []).forEach((t) => {
    if (!t || t.isActive === false) return;
    const ruteId = String(t.ruteId || '');
    if (!ruteId) return;
    if (!index[ruteId]) index[ruteId] = [];
    index[ruteId].push({
      uangJalan: Number(t.uangJalan || 0),
      effectiveDate: String(t.effectiveDate || ''),
    });
  });
  Object.keys(index).forEach((k) => {
    index[k].sort((a, b) =>
      a.effectiveDate < b.effectiveDate ? 1 : a.effectiveDate > b.effectiveDate ? -1 : 0
    );
  });
  return index;
}

/**
 * Resolve Uang Jalan for a given rute & date.
 * Picks the entry with greatest effectiveDate <= targetDate.
 * If no history entry exists <= targetDate, returns null (caller falls back to rute.uangJalan).
 * @param {string} ruteId
 * @param {string} targetDateISO - 'yyyy-mm-dd' (or full ISO)
 * @param {object} index - output of indexTarifRute
 * @returns {number|null}
 */
export function resolveUangJalanForDate(ruteId, targetDateISO, index) {
  if (!ruteId || !targetDateISO || !index) return null;
  const list = index[String(ruteId)];
  if (!Array.isArray(list) || list.length === 0) return null;
  const target = String(targetDateISO).slice(0, 10);
  for (const entry of list) {
    if (entry.effectiveDate <= target) return entry.uangJalan;
  }
  return null;
}

/**
 * Normalize a date-like input to 'yyyy-mm-dd'. Returns '' if invalid.
 */
export function toISODateOnly(input) {
  if (!input) return '';
  if (typeof input === 'string') {
    const m = input.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
  }
  try {
    const d = new Date(input);
    if (isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return `${y}-${mo}-${da}`;
  } catch {
    return '';
  }
}
