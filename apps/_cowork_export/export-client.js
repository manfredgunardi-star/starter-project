#!/usr/bin/env node
/**
 * Ekspor koleksi Firestore ke JSON memakai LOGIN biasa (email/password) —
 * TANPA service account key. Cocok bila pembuatan key diblokir kebijakan organisasi.
 *
 * Aturan keamanan Firestore Anda mengizinkan baca untuk user yang sudah login,
 * jadi akun owner/admin Anda sudah cukup. Skrip ini HANYA MEMBACA data.
 *
 * Cara pakai (lihat README.md):
 *   node export-client.js --project=monitor
 *   node export-client.js --project=accounting
 *   node export-client.js --project=monitor --since=2026-06-01
 *
 * Kredensial bisa lewat prompt, atau lewat environment variable:
 *   EXPORT_EMAIL / EXPORT_PASSWORD
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

let initializeApp, getAuth, signInWithEmailAndPassword, signOut;
let getFirestore, collection, getDocs, query, where;
try {
  ({ initializeApp } = require('firebase/app'));
  ({ getAuth, signInWithEmailAndPassword, signOut } = require('firebase/auth'));
  ({ getFirestore, collection, getDocs, query, where } = require('firebase/firestore'));
} catch (e) {
  console.error('\n[ERROR] Paket "firebase" belum terpasang. Jalankan dulu:  npm install\n');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Ambil config web bul-monitor dari file .env aplikasi (tidak menyalin rahasia ke sini)
// ---------------------------------------------------------------------------
function parseEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

function monitorConfig() {
  const env = parseEnv(path.join(__dirname, '..', 'bul-monitor', '.env'));
  const cfg = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  };
  if (!cfg.apiKey || !cfg.projectId) {
    throw new Error('Config bul-monitor tidak terbaca dari ../bul-monitor/.env');
  }
  return cfg;
}

// ---------------------------------------------------------------------------
// KONFIGURASI PROJECT
// ---------------------------------------------------------------------------
const PROJECTS = {
  monitor: {
    projectId: 'bul-monitor',
    getConfig: monitorConfig,
    collections: ['bul_suratJalan', 'bul_surat_jalan', 'bul_invoice', 'bul_invoices', 'bul_pelanggan', 'bul_transaksi'],
    dateField: 'createdAt',
  },
  accounting: {
    projectId: 'bul-accounting',
    // Config web bul-accounting (nilai publik, sama seperti di kode aplikasi).
    getConfig: () => ({
      apiKey: 'AIzaSyAAV179nxAUpMcx8LEti83kxVWdc4fXVuA',
      authDomain: 'bul-accounting.firebaseapp.com',
      projectId: 'bul-accounting',
      storageBucket: 'bul-accounting.firebasestorage.app',
      messagingSenderId: '657310894760',
      appId: '1:657310894760:web:e7225601052f04e556d09d',
    }),
    collections: ['invoices', 'journals', 'customers'],
    dateField: 'createdAt',
  },
};

const OUT_DIR = path.join(__dirname, 'exports');

// ---------------------------------------------------------------------------
// Argumen
// ---------------------------------------------------------------------------
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v === undefined ? true : v];
  })
);
const projectKey = args.project;
if (!projectKey || !PROJECTS[projectKey]) {
  console.error('\nPakai: node export-client.js --project=monitor | accounting');
  console.error('Opsional: --since=YYYY-MM-DD\n');
  process.exit(1);
}
const cfg = PROJECTS[projectKey];
const since = args.since ? new Date(args.since + 'T00:00:00') : null;

// ---------------------------------------------------------------------------
// Prompt kredensial (password disembunyikan)
// ---------------------------------------------------------------------------
function ask(questionText, hidden = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    if (hidden) {
      const onData = (char) => {
        char = char + '';
        if (['\n', '\r', ''].includes(char)) process.stdin.removeListener('data', onData);
        else process.stdout.write('\x1B[2K\x1B[200D' + questionText + '*'.repeat(rl.line.length));
      };
      process.stdin.on('data', onData);
    }
    rl.question(questionText, (ans) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(ans.trim());
    });
  });
}

// ---------------------------------------------------------------------------
// Serialisasi nilai Firestore -> JSON
// ---------------------------------------------------------------------------
function serialize(value) {
  if (value === null || value === undefined) return value;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value.latitude === 'number' && typeof value.longitude === 'number')
    return { _geopoint: [value.latitude, value.longitude] };
  if (value.path && typeof value.path === 'string' && value.type === 'document')
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
  const email = process.env.EXPORT_EMAIL || (await ask(`Email login ${cfg.projectId}: `));
  const password = process.env.EXPORT_PASSWORD || (await ask('Password: ', true));

  const app = initializeApp(cfg.getConfig(), 'exporter-' + Date.now());
  const auth = getAuth(app);
  const db = getFirestore(app);

  process.stdout.write('\nLogin ... ');
  try {
    await signInWithEmailAndPassword(auth, email, password);
    console.log('berhasil sebagai ' + email);
  } catch (err) {
    console.log('GAGAL');
    console.error(`[ERROR] Login gagal: ${err.code || err.message}`);
    process.exit(1);
  }

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const projDir = path.join(OUT_DIR, `${cfg.projectId}_${stamp}`);
  if (!fs.existsSync(projDir)) fs.mkdirSync(projDir, { recursive: true });

  console.log(`\nEkspor project: ${cfg.projectId}`);
  if (since) console.log(`Filter: sejak ${args.since} (field "${cfg.dateField}")`);
  console.log('-'.repeat(50));

  const summary = [];
  for (const col of cfg.collections) {
    process.stdout.write(`  ${col} ... `);
    try {
      const ref = collection(db, col);
      const q = since ? query(ref, where(cfg.dateField, '>=', since)) : ref;
      const snap = await getDocs(q);
      const docs = [];
      snap.forEach((d) => docs.push({ id: d.id, ...serialize(d.data()) }));
      fs.writeFileSync(path.join(projDir, `${col}.json`), JSON.stringify(docs, null, 2), 'utf8');
      console.log(`${docs.length} dokumen`);
      summary.push({ collection: col, count: docs.length });
    } catch (err) {
      console.log(`GAGAL (${err.code || err.message})`);
      summary.push({ collection: col, count: 0, error: err.code || err.message });
    }
  }

  fs.writeFileSync(
    path.join(projDir, '_summary.json'),
    JSON.stringify({ project: cfg.projectId, exportedAt: new Date().toISOString(), since: args.since || null, account: email, collections: summary }, null, 2),
    'utf8'
  );

  console.log('-'.repeat(50));
  console.log(`Selesai. File tersimpan di:\n  ${projDir}\n`);
  try { await signOut(auth); } catch (_) {}
  process.exit(0);
})().catch((e) => {
  console.error('\n[ERROR]', e);
  process.exit(1);
});
