/**
 * MIGRATION SCRIPT: suratJalan/ → surat_jalan/
 * ================================================
 * Menyalin semua dokumen dari collection lama (suratJalan) ke collection baru (surat_jalan).
 * Aman dijalankan pada app yang sedang LIVE karena:
 *   - Menggunakan merge: true (tidak menimpa data yang lebih baru)
 *   - Tidak menghapus apapun dari collection lama
 *   - App membaca kedua collection secara paralel selama proses
 *
 * CARA MENJALANKAN:
 *   node --env-file=.env scripts/migrate-sj-collection.mjs <email> <password>
 *
 * Contoh:
 *   node --env-file=.env scripts/migrate-sj-collection.mjs admin@domain.com P@ssw0rd
 *
 * SETELAH BERHASIL:
 *   1. Verifikasi data di Firebase Console (Firestore → surat_jalan)
 *   2. Beri tahu developer untuk menghapus subscription legacy dari App.jsx
 */

import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  getAuth,
  signInWithEmailAndPassword,
} from 'firebase/auth';

// ── Validasi argumen ──────────────────────────────────────────────────────────

const [,, email, password] = process.argv;

if (!email || !password) {
  console.error('\n❌ Email dan password wajib diisi.');
  console.error('   Penggunaan: node --env-file=.env scripts/migrate-sj-collection.mjs <email> <password>\n');
  process.exit(1);
}

// ── Validasi env vars ─────────────────────────────────────────────────────────

const required = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
];

const missing = required.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error('\n❌ Environment variable berikut tidak ditemukan di .env:');
  missing.forEach((k) => console.error(`   - ${k}`));
  console.error('   Pastikan file .env ada dan berisi konfigurasi Firebase.\n');
  process.exit(1);
}

// ── Inisialisasi Firebase ─────────────────────────────────────────────────────

const firebaseConfig = {
  apiKey:            process.env.VITE_FIREBASE_API_KEY,
  authDomain:        process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.VITE_FIREBASE_APP_ID,
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ── Konstanta ─────────────────────────────────────────────────────────────────

const LEGACY_COLLECTION = 'suratJalan';
const NEW_COLLECTION    = 'surat_jalan';
const BATCH_SIZE        = 400; // Batas aman di bawah limit Firestore (500)

// ── Helper ────────────────────────────────────────────────────────────────────

const log = {
  info:    (msg) => console.log(`  ℹ  ${msg}`),
  ok:      (msg) => console.log(`  ✅ ${msg}`),
  warn:    (msg) => console.log(`  ⚠️  ${msg}`),
  error:   (msg) => console.error(`  ❌ ${msg}`),
  section: (msg) => console.log(`\n── ${msg} ──`),
};

/**
 * Bandingkan dua timestamp ISO. Return true jika legacyTs lebih baru dari newTs.
 * Digunakan untuk memutuskan apakah dokumen legacy perlu di-merge.
 */
const isNewerOrEqual = (legacyTs, newTs) => {
  if (!newTs) return true;         // Belum ada di collection baru → pasti perlu di-copy
  if (!legacyTs) return false;     // Legacy tidak punya timestamp → skip
  return legacyTs >= newTs;
};

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║   MIGRASI: suratJalan → surat_jalan             ║');
  console.log(`║   Project : ${firebaseConfig.projectId.padEnd(36)}║`);
  console.log('╚══════════════════════════════════════════════════╝');

  // 1. Login
  log.section('Autentikasi');
  log.info(`Login sebagai: ${email}`);
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    log.ok(`Login berhasil (uid: ${cred.user.uid})`);
  } catch (err) {
    log.error(`Login gagal: ${err.message}`);
    process.exit(1);
  }

  // 2. Baca collection legacy
  log.section('Membaca collection legacy');
  log.info(`Mengambil semua dokumen dari "${LEGACY_COLLECTION}"...`);

  let legacyDocs;
  try {
    const snap = await getDocs(collection(db, LEGACY_COLLECTION));
    legacyDocs = snap.docs;
    log.ok(`Ditemukan ${legacyDocs.length} dokumen di "${LEGACY_COLLECTION}"`);
  } catch (err) {
    log.error(`Gagal membaca collection legacy: ${err.message}`);
    log.info('Pastikan akun Anda memiliki role superadmin atau admin_sj.');
    process.exit(1);
  }

  if (legacyDocs.length === 0) {
    log.ok('Collection legacy sudah kosong — tidak ada yang perlu dimigrasikan.');
    log.info('Anda bisa langsung menghapus subscription legacy dari App.jsx.');
    process.exit(0);
  }

  // 3. Baca collection baru untuk perbandingan timestamp
  log.section('Membaca collection baru');
  log.info(`Mengambil dokumen yang sudah ada di "${NEW_COLLECTION}"...`);

  const newDocsMap = new Map();
  try {
    const snap = await getDocs(collection(db, NEW_COLLECTION));
    snap.docs.forEach((d) => {
      const data = d.data();
      newDocsMap.set(d.id, data.updatedAt || data.createdAt || null);
    });
    log.ok(`Ditemukan ${newDocsMap.size} dokumen di "${NEW_COLLECTION}"`);
  } catch (err) {
    log.error(`Gagal membaca collection baru: ${err.message}`);
    process.exit(1);
  }

  // 4. Klasifikasi dokumen
  log.section('Analisis dokumen');

  const toMigrate   = [];  // Dokumen yang perlu di-copy/merge
  const alreadyNew  = [];  // Dokumen yang versi baru sudah lebih baru atau sama
  const notInNew    = [];  // Dokumen yang belum ada sama sekali di collection baru

  for (const legacyDoc of legacyDocs) {
    const data       = legacyDoc.data();
    const legacyTs   = data.updatedAt || data.createdAt || null;
    const newTs      = newDocsMap.get(legacyDoc.id) || null;

    if (!newDocsMap.has(legacyDoc.id)) {
      notInNew.push(legacyDoc);
      toMigrate.push(legacyDoc);
    } else if (isNewerOrEqual(legacyTs, newTs)) {
      // Versi legacy lebih baru atau sama — merge untuk amankan data
      toMigrate.push(legacyDoc);
    } else {
      // Versi di collection baru sudah lebih baru — skip
      alreadyNew.push(legacyDoc);
    }
  }

  log.info(`Dokumen belum ada di "${NEW_COLLECTION}"     : ${notInNew.length}`);
  log.info(`Dokumen legacy lebih baru / perlu di-merge   : ${toMigrate.length - notInNew.length}`);
  log.info(`Dokumen sudah aman di "${NEW_COLLECTION}"    : ${alreadyNew.length}`);
  log.info(`Total yang akan di-migrate                   : ${toMigrate.length}`);

  if (toMigrate.length === 0) {
    log.ok('Semua dokumen sudah up-to-date di collection baru. Tidak ada yang perlu dimigrasikan.');
    process.exit(0);
  }

  // 5. Proses migrasi dalam batch
  log.section('Proses migrasi');

  const totalBatches = Math.ceil(toMigrate.length / BATCH_SIZE);
  let migratedCount  = 0;
  let errorCount     = 0;

  for (let i = 0; i < totalBatches; i++) {
    const chunk = toMigrate.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
    log.info(`Batch ${i + 1}/${totalBatches} — memproses ${chunk.length} dokumen...`);

    try {
      const batch = writeBatch(db);
      for (const legacyDoc of chunk) {
        const data   = legacyDoc.data();
        const newRef = doc(db, NEW_COLLECTION, legacyDoc.id);
        // merge: true → tidak menimpa field yang tidak ada di legacy
        batch.set(newRef, data, { merge: true });
      }
      await batch.commit();
      migratedCount += chunk.length;
      log.ok(`Batch ${i + 1} berhasil (${migratedCount}/${toMigrate.length} dokumen)`);
    } catch (err) {
      errorCount += chunk.length;
      log.error(`Batch ${i + 1} gagal: ${err.message}`);
      log.info('Batch ini di-skip. Coba jalankan script lagi untuk retry.');
    }
  }

  // 6. Laporan akhir
  log.section('Laporan Akhir');
  log.ok(`Berhasil dimigrasikan : ${migratedCount} dokumen`);
  if (errorCount > 0) {
    log.warn(`Gagal              : ${errorCount} dokumen (jalankan ulang untuk retry)`);
  }
  log.info(`Tidak perlu migrasi  : ${alreadyNew.length} dokumen`);

  if (migratedCount > 0 && errorCount === 0) {
    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log('║   ✅  MIGRASI SELESAI SEMPURNA                  ║');
    console.log('║                                                  ║');
    console.log('║   Langkah selanjutnya:                           ║');
    console.log('║   1. Verifikasi di Firebase Console → Firestore  ║');
    console.log(`║      Buka collection "${NEW_COLLECTION.padEnd(29)}║`);
    console.log('║   2. Konfirmasi ke developer untuk hapus         ║');
    console.log('║      subscription legacy dari App.jsx            ║');
    console.log('║   3. JANGAN hapus collection suratJalan dulu     ║');
    console.log('║      sampai verifikasi selesai                   ║');
    console.log('╚══════════════════════════════════════════════════╝\n');
  } else if (errorCount > 0) {
    console.log('\n⚠️  Migrasi selesai dengan sebagian error. Jalankan ulang script untuk retry.\n');
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ Error tidak terduga:', err.message);
  process.exit(1);
});
