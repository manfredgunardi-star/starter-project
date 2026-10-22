// Client SDK + login akun bot (user Firebase Auth biasa) supaya firestore.rules tetap berlaku.
// Sengaja TIDAK memakai Admin SDK / service account (prinsip 2 handoff).
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  getFirestore, collection, query, where, orderBy, limit, startAfter, getDocs, doc, updateDoc,
} from 'firebase/firestore';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const AUDIT_FILE = process.env.AUDIT_LOG || join(ROOT, 'logs', 'audit.log');

// Koleksi diverifikasi dari apps/sj-monitor/src/App.jsx:1369,1729 (bukan `suratJalan`).
const SJ_COLLECTION = 'surat_jalan';
const PAGE_SIZE = 1000;
const MAX_DOCS = 20_000;

export const loadEnv = () => {
  const file = process.env.ENV_FILE || join(ROOT, '.env');
  if (existsSync(file)) process.loadEnvFile(file);
};

const requireEnv = (names) => {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) throw new Error(`Variabel .env belum diisi: ${missing.join(', ')}`);
};

let app;
let dbPromise;

const login = async () => {
  const e = process.env;
  requireEnv(['FIREBASE_API_KEY', 'FIREBASE_AUTH_DOMAIN', 'FIREBASE_PROJECT_ID', 'FIREBASE_APP_ID', 'BOT_EMAIL', 'BOT_PASSWORD']);
  app ??= initializeApp({
    apiKey: e.FIREBASE_API_KEY,
    authDomain: e.FIREBASE_AUTH_DOMAIN,
    projectId: e.FIREBASE_PROJECT_ID,
    appId: e.FIREBASE_APP_ID,
  });
  await signInWithEmailAndPassword(getAuth(app), e.BOT_EMAIL, e.BOT_PASSWORD);
  return getFirestore(app);
};

// Login sekali per proses; kalau gagal, percobaan berikutnya login ulang.
export const getBotDb = () => (dbPromise ??= login().catch((err) => { dbPromise = undefined; throw err; }));

export const closeFirebase = async () => {
  if (app) await deleteApp(app);
  app = undefined;
  dbPromise = undefined;
};

// tanggalSJ = string YYYY-MM-DD, jadi range query string langsung sesuai urutan kalender.
// Hanya index single-field otomatis yang dipakai; filter lain dikerjakan di rekap.js.
export const fetchSuratJalan = async (tglAwal, tglAkhir) => {
  const db = await getBotDb();
  const out = [];
  let cursor;
  for (;;) {
    const q = query(
      collection(db, SJ_COLLECTION),
      where('tanggalSJ', '>=', tglAwal),
      where('tanggalSJ', '<=', tglAkhir),
      orderBy('tanggalSJ'),
      ...(cursor ? [startAfter(cursor)] : []),
      limit(PAGE_SIZE),
    );
    const snap = await getDocs(q);
    for (const d of snap.docs) { const row = d.data(); out.push({ ...row, id: row.id || d.id }); }
    if (out.length > MAX_DOCS) throw new Error(`Lebih dari ${MAX_DOCS} SJ dalam rentang ini; persempit rentang tanggal`);
    if (snap.size < PAGE_SIZE) return out;
    cursor = snap.docs[snap.docs.length - 1];
  }
};

// Kriteria selesai #4: bukti rules berlaku. updateDoc ke dokumen yang TIDAK ADA:
// - ditolak rules  -> permission-denied (yang diharapkan)
// - lolos rules    -> not-found; updateDoc tidak pernah membuat dokumen, jadi data tetap utuh.
// ID tanpa pola __x__ (dicadangkan Firestore -> invalid-argument sebelum rules dievaluasi).
export const UJI_DOC_ID = 'uji-tolak-tulis-bot';

export const nilaiUjiTolak = (err) => {
  if (!err) throw new Error('Write berhasil?! Periksa role akun bot dan rules segera.');
  if (err.code === 'permission-denied') return { ditolak: true, kode: err.code };
  if (err.code === 'not-found') throw new Error('Write LOLOS rules (kode not-found). Akun bot punya role penulis, bukan reader!');
  throw new Error(`Uji tidak meyakinkan: ditolak sebelum rules dievaluasi (kode ${err.code}). ${err.message}`);
};

export const ujiTolakTulis = async () => {
  const db = await getBotDb();
  try {
    await updateDoc(doc(db, SJ_COLLECTION, UJI_DOC_ID), { ujiTolakTulis: new Date().toISOString() });
  } catch (err) {
    return nilaiUjiTolak(err);
  }
  return nilaiUjiTolak(null);
};
