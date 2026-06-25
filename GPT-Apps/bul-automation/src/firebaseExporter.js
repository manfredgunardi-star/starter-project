import fs from 'node:fs/promises';
import path from 'node:path';

export async function exportFirebaseSnapshots({ config, period, outputDir, dryRun = false }) {
  const enabledApps = Object.entries(config.apps || {}).filter(([, app]) => app.enabled);
  const enabledQueries = enabledApps.flatMap(([appKey, app]) =>
    (app.queries || []).filter((query) => query.enabled).map((query) => ({ appKey, app, query }))
  );

  if (!enabledQueries.length) {
    return { status: 'query_not_configured', files: [], sheets: [], dryRun };
  }

  const { default: XLSX } = await import('xlsx');
  const workbookByApp = new Map();
  const sheets = [];

  for (const item of enabledQueries) {
    const rows = await fetchQueryRows(item.appKey, item.app, item.query, period);
    if (!workbookByApp.has(item.appKey)) {
      workbookByApp.set(item.appKey, XLSX.utils.book_new());
    }
    const worksheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbookByApp.get(item.appKey), worksheet, safeSheetName(item.query.sheetName || item.query.collection));
    sheets.push({ appKey: item.appKey, sheetName: item.query.sheetName || item.query.collection, rows: rows.length });
  }

  const files = [];
  if (!dryRun) {
    await fs.mkdir(outputDir, { recursive: true });
  }
  for (const [appKey, workbook] of workbookByApp.entries()) {
    const file = path.join(outputDir, `firebase_export_${toKebab(appKey)}.xlsx`);
    if (!dryRun) XLSX.writeFile(workbook, file);
    files.push(file);
  }

  return { status: 'ok', files, sheets, dryRun };
}

async function fetchQueryRows(appKey, app, queryConfig, period) {
  const admin = await import('firebase-admin');
  const credentialPath = process.env[app.credentialPathEnv] || app.credentialPath;
  const appName = `bul-automation-${appKey}`;
  const existing = admin.getApps().find((candidate) => candidate.name === appName);
  const firebaseApp = existing || admin.initializeApp({
    credential: credentialPath
      ? admin.cert(JSON.parse(await fs.readFile(credentialPath, 'utf8')))
      : admin.applicationDefault(),
    projectId: app.projectId || undefined
  }, appName);

  let ref = admin.getFirestore(firebaseApp).collection(queryConfig.collection);
  if (queryConfig.dateField) {
    ref = ref.where(queryConfig.dateField, '>=', period.periodStart).where(queryConfig.dateField, '<=', period.periodEnd);
  }
  for (const filter of queryConfig.filters || []) {
    ref = ref.where(filter.field, filter.op, filter.value);
  }

  const snap = await ref.get();
  return snap.docs.map((doc) => flattenForSheet({ id: doc.id, ...doc.data() }));
}

function flattenForSheet(value, prefix = '', output = {}) {
  for (const [key, raw] of Object.entries(value || {})) {
    const name = prefix ? `${prefix}.${key}` : key;
    if (raw && typeof raw === 'object' && !Array.isArray(raw) && typeof raw.toDate !== 'function') {
      flattenForSheet(raw, name, output);
    } else if (Array.isArray(raw)) {
      output[name] = JSON.stringify(raw);
    } else if (raw && typeof raw.toDate === 'function') {
      output[name] = raw.toDate().toISOString();
    } else {
      output[name] = raw ?? '';
    }
  }
  return output;
}

function safeSheetName(name) {
  return String(name || 'Sheet1').replace(/[\\/?*[\]:]/g, '_').slice(0, 31);
}

function toKebab(value) {
  return String(value).replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`).replace(/^-/, '');
}
