#!/usr/bin/env node
/**
 * Ekspor koleksi Firestore ke file JSON (Jalur A) — versi service account / gcloud.
 *
 * Cara pakai (lihat README.md):
 *   node export-firestore.js --project=monitor
 *   node export-firestore.js --project=accounting
 *   node export-firestore.js --project=monitor --since=2026-06-01
 *
 * Skrip ini HANYA MEMBACA Firestore. Tidak menulis/menghapus apa pun.
 */

const fs = require('fs');
const path = require('path');

let admin;
try {
  admin = require('firebase-admin');
} catch (e) {
  console.error('\n[ERROR] Paket "firebase-admin" belum terpasang. Jalankan dulu:  npm install\n');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// KONFIGURASI
// ---------------------------------------------------------------------------
const PROJECTS = {
  monitor: {
    projectId: 'bul-monitor',
    keyFile: path.join(__dirname, 'keys', 'bul-monitor-key.json'),
    collections: ['bul_suratJalan', 'bul_surat_jalan', 'bul_invoice', 'bul_invoices', 'bul_pelanggan', 'bul_transaksi'],
    dateField: 'createdAt',
  },
  accounting: {
    projectId: 'bul-accounting',
    keyFile: path.join(__dirname, 'keys', 'bul-accounting-key.json'),
    collections: ['invoices', 'journals', 'customers'],
    dateField: 'createdAt',
  },
};

const OUT_DIR = path.join(__dirname, 'exports');

// ---------------------------------------------------------------------------
// Argumen CLI
// ---------------------------------------------------------------------------
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v === undefined ? true : v];
  })
);

const projectKey = args.project;
if (!projectKey || !PROJECTS[projectKey]) {
  console.error('\nPakai: node export-firestore.js --project=monitor | accounting');
  console.error('Opsional: --since=YYYY-MM-DD\n');
  process.exit(1);
}
const cfg = PROJECTS[projectKey];
const since = args.since ? new Date(args.since + 'T00:00:00') : null;

// ---------------------------------------------------------------------------
// Konversi nilai Firestore -> JSON
// ---------------------------------------------------------------------------
function serialize(value) {
  if (value === null || value === undefined) return value;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value.latitude === 'number' && typeof value.longitude === 'number')
    return { _geopoint: [value.latitude, value.longitude] };
  if (value.path && typeof value.path === 'string' && value.firestore)
    return { _ref: value.path };
  if (Array.isArray(value)) return value.map(serialize);
  if (typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value)) out[k] = serialize(value[k]);
    return out;
  }
  return value;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
(async () => {
  if (fs.existsSync(cfg.keyFile)) {
    const serviceAccount = require(cfg.keyFile);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: cfg.projectId });
    console.log('Auth: service account key');
  } else {
    try {
      admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: cfg.projectId });
      console.log('Auth: Application Default Credentials (gcloud)');
    } catch (e) {
      console.error('\n[ERROR] Tidak ada kredensial.');
      console.error('  - Taruh key di: ' + cfg.keyFile);
      console.error('  - ATAU jalankan: gcloud auth application-default login\n');
      process.exit(1);
    }
  }

  const db = admin.firestore();

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const projDir = path.join(OUT_DIR, cfg.projectId + '_' + stamp);
  if (!fs.existsSync(projDir)) fs.mkdirSync(projDir, { recursive: true });

  console.log('\nEkspor project: ' + cfg.projectId);
  if (since) console.log('Filter: sejak ' + args.since + ' (field "' + cfg.dateField + '")');
  console.log('-'.repeat(50));

  const summary = [];
  for (const col of cfg.collections) {
    process.stdout.write('  ' + col + ' ... ');
    try {
      let query = db.collection(col);
      if (since) query = query.where(cfg.dateField, '>=', since);

      const docs = [];
      await new Promise((resolve, reject) => {
        query
          .stream()
          .on('data', (doc) => docs.push({ id: doc.id, ...serialize(doc.data()) }))
          .on('end', resolve)
          .on('error', reject);
      });

      fs.writeFileSync(path.join(projDir, col + '.json'), JSON.stringify(docs, null, 2), 'utf8');
      console.log(docs.length + ' dokumen');
      summary.push({ collection: col, count: docs.length });
    } catch (err) {
      console.log('GAGAL (' + err.message + ')');
      summary.push({ collection: col, count: 0, error: err.message });
    }
  }

  fs.writeFileSync(
    path.join(projDir, '_summary.json'),
    JSON.stringify({ project: cfg.projectId, exportedAt: new Date().toISOString(), since: args.since || null, collections: summary }, null, 2),
    'utf8'
  );

  console.log('-'.repeat(50));
  console.log('Selesai. File tersimpan di:\n  ' + projDir + '\n');
  process.exit(0);
})().catch((e) => {
  console.error('\n[ERROR]', e);
  process.exit(1);
});
