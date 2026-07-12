// Normalized (loose) matching against master data lists.
// Used to reject import rows that reference master data (truck/supir/rute/material)
// that isn't registered, instead of silently auto-creating it.

export function normalizeForMatch(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// Returns the id of the first item in `list` whose `field` matches `rawValue`
// after normalization, or null if not found (including empty rawValue).
export function findMasterIdByField(list, field, rawValue) {
  const target = normalizeForMatch(rawValue);
  if (!target) return null;
  const match = (Array.isArray(list) ? list : []).find(
    (item) => normalizeForMatch(item?.[field]) === target
  );
  return match ? match.id : null;
}
