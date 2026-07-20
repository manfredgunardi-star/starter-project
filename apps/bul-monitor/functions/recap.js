/**
 * Rekap Operasional Harian BUL — Scheduled Cloud Function (Opsi B).
 *
 * - Membaca bul-monitor via Admin SDK (akses bawaan project, tanpa service account key).
 * - Membaca bul-accounting via akun "bridge" (email/password) memakai Firebase Web SDK,
 *   sama seperti mekanisme integrasi yang sudah dipakai aplikasi.
 * - Menyimpan hasil ke koleksi Firestore `bul_reports/{tanggal}`.
 * - Mengirim email (opsional) bila SMTP dikonfigurasi.
 *
 * Konfigurasi via environment (functions/.env). Lihat .env.example.
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");


const TZ = process.env.RECAP_TZ || "Asia/Jakarta";
const RECIPIENTS = (process.env.RECAP_EMAIL_TO || "").split(",").map(s => s.trim()).filter(Boolean);

const ACCOUNTING_CONFIG = {
  apiKey: "AIzaSyAAV179nxAUpMcx8LEti83kxVWdc4fXVuA",
  authDomain: "bul-accounting.firebaseapp.com",
  projectId: "bul-accounting",
  storageBucket: "bul-accounting.firebasestorage.app",
  messagingSenderId: "657310894760",
  appId: "1:657310894760:web:e7225601052f04e556d09d",
};

// ---------- util ----------
const rupiah = n => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const num = n => (n || 0).toLocaleString("id-ID");
const qtyFmt = n => Math.round(n || 0).toLocaleString("id-ID");
const sum = (arr, f) => arr.reduce((s, x) => s + (Number(f(x)) || 0), 0);
const groupCount = (arr, f) => arr.reduce((m, x) => { const k = f(x) || "(kosong)"; m[k] = (m[k] || 0) + 1; return m; }, {});
const topN = (obj, n = 5) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n);

function jakartaDateStr(offsetDays = 0) {
  const now = new Date(Date.now() + 7 * 3600 * 1000 + offsetDays * 86400 * 1000);
  return now.toISOString().slice(0, 10);
}

async function readMonitor(db) {
  const names = ["bul_surat_jalan", "bul_invoices", "bul_pelanggan"];
  const out = {};
  for (const n of names) {
    const snap = await db.collection(n).get();
    out[n] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  return out;
}

async function readAccounting() {
  // Lazy-require: Web SDK hanya dimuat saat fungsi berjalan, bukan saat deploy menganalisa kode.
  const { initializeApp: initWebApp } = require("firebase/app");
  const { getAuth, signInWithEmailAndPassword } = require("firebase/auth");
  const { getFirestore, collection, getDocs } = require("firebase/firestore");
  const email = process.env.BRIDGE_EMAIL;
  const password = process.env.BRIDGE_PASSWORD;
  if (!email || !password) {
    functions.logger.warn("BRIDGE_EMAIL/BRIDGE_PASSWORD belum diisi — data piutang dilewati.");
    return { invoices: [], customers: [] };
  }
  const app = initWebApp(ACCOUNTING_CONFIG, "acc-" + Date.now());
  const auth = getAuth(app);
  await signInWithEmailAndPassword(auth, email, password);
  const db = getFirestore(app);
  const grab = async name => (await getDocs(collection(db, name))).docs.map(d => ({ id: d.id, ...d.data() }));
  return { invoices: await grab("invoices"), customers: await grab("customers") };
}

function tsToDate(v) {
  if (!v) return null;
  if (typeof v.toDate === "function") return v.toDate();
  return new Date(v);
}

function buildRecap({ monitor, accounting, refDate }) {
  const sjAll = monitor.bul_surat_jalan || [];
  const sjValid = sjAll.filter(x => !x.deletedAt);
  const sjDate = x => x.tanggalSJ || x.tglTerkirim || (tsToDate(x.createdAt) ? tsToDate(x.createdAt).toISOString().slice(0, 10) : null);

  const sjHari = sjValid.filter(x => sjDate(x) === refDate);
  const hariQty = sum(sjHari, x => x.qtyIsi);
  const hariUangJalan = sum(sjHari, x => x.uangJalan);
  const hariStatus = groupCount(sjHari, x => x.status);
  const perMaterial = groupCount(sjHari, x => x.material);
  const perRute = groupCount(sjHari, x => x.rute);
  const perSupir = groupCount(sjHari, x => x.namaSupir);

  const trenMap = groupCount(sjValid, sjDate);
  const tren = Object.entries(trenMap).filter(([d]) => d && d <= refDate).sort().slice(-14);
  const trenMax = Math.max(1, ...tren.map(([, c]) => c));

  const invMonAll = monitor.bul_invoices || [];
  const invMon = invMonAll.filter(x => !x.deletedAt);
  const invMonNilai = sum(invMon, x => x.totalNilai);

  const accInv = accounting.invoices || [];
  const today = new Date(refDate + "T00:00:00");
  const piutang = accInv
    .filter(i => !["cancelled", "paid", "deleted"].includes(i.status))
    .map(i => ({ ...i, outstanding: (i.amount || 0) - (i.totalPaid || 0), age: Math.max(0, Math.round((today - new Date(i.date)) / 86400000)) }))
    .filter(i => i.outstanding > 0);
  const totalPiutang = sum(piutang, x => x.outstanding);
  const buckets = { "0-30 hari": 0, "31-60 hari": 0, "61-90 hari": 0, "> 90 hari": 0 };
  piutang.forEach(i => {
    const b = i.age <= 30 ? "0-30 hari" : i.age <= 60 ? "31-60 hari" : i.age <= 90 ? "61-90 hari" : "> 90 hari";
    buckets[b] += i.outstanding;
  });
  const topPiutang = Object.entries(piutang.reduce((m, i) => { const k = i.customerName || "(?)"; m[k] = (m[k] || 0) + i.outstanding; return m; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // alerts
  const alerts = [];
  const pel = (monitor.bul_pelanggan || []).filter(p => !p.deletedAt);
  const dupPel = Object.entries(groupCount(pel, p => (p.name || "").trim().toLowerCase())).filter(([, c]) => c > 1);
  if (dupPel.length) alerts.push(dupPel.length + ' nama pelanggan terindikasi ganda (mis. "' + dupPel[0][0] + '").');
  const sjUndef = sjValid.filter(x => x.statusInvoice === undefined || x.statusInvoice === null).length;
  if (sjUndef) alerts.push(num(sjUndef) + " Surat Jalan tanpa statusInvoice.");
  const sjGagal = sjValid.filter(x => x.status === "gagal").length;
  if (sjGagal) alerts.push(num(sjGagal) + ' Surat Jalan berstatus "gagal".');
  const invDel = invMonAll.filter(x => x.deletedAt).length;
  if (invDel) alerts.push(num(invDel) + " invoice ter-soft-delete.");

  const summary = {
    sjCount: sjHari.length, qty: Math.round(hariQty), uangJalan: hariUangJalan,
    invoiceAktif: invMon.length, nilaiInvoice: invMonNilai, totalPiutang, piutangCount: piutang.length,
  };

  // ---- HTML ----
  const NAVY = "#16234A", TEAL = "#1FB6A6", AMBER = "#F5A623", CORAL = "#EF6F6C", PAPER = "#F4F6FB", INK = "#26324C", MUTE = "#6B7794";
  const row = cells => "<tr>" + cells.map((c, i) => '<td style="padding:9px 12px;border-bottom:1px solid #EAEEF6;' + (i ? "text-align:right;" : "font-weight:600;color:" + NAVY) + '">' + c + "</td>").join("") + "</tr>";
  const chip = (l, v, s, c) => '<div style="flex:1;min-width:190px;background:#fff;border:1px solid #E4E9F3;border-left:5px solid ' + c + ';border-radius:10px;padding:16px 18px"><div style="font-size:12px;color:' + MUTE + ';font-weight:600">' + l + '</div><div style="font-size:25px;font-weight:800;color:' + NAVY + ';margin-top:4px">' + v + '</div><div style="font-size:12px;color:' + MUTE + '">' + (s || "") + "</div></div>";
  const bar = (l, v, mx, c) => '<div style="display:flex;align-items:center;gap:10px;margin:6px 0"><div style="width:54px;font-size:12px;color:' + INK + ';text-align:right">' + l + '</div><div style="flex:1;background:#EEF1F8;border-radius:5px;height:18px;overflow:hidden"><div style="width:' + Math.max(3, (v / mx) * 100) + "%;height:100%;background:" + c + '"></div></div><div style="width:34px;font-size:12px;font-weight:700;color:' + NAVY + '">' + v + "</div></div>";
  const card = (t, rows) => '<div style="flex:1;min-width:240px;background:#fff;border:1px solid #E4E9F3;border-radius:10px;overflow:hidden"><div style="background:' + NAVY + ';color:#fff;font-weight:700;font-size:13px;padding:9px 12px">' + t + '</div><table style="width:100%;border-collapse:collapse;font-size:13px">' + (rows.length ? rows.map(([k, v]) => row([k, num(v)])).join("") : row(["(tidak ada)", ""])) + "</table></div>";
  const sec = (t, k, b) => '<section style="margin:26px 0"><div style="font-size:11px;font-weight:700;letter-spacing:2px;color:' + TEAL + '">' + k + '</div><h2 style="font-family:Georgia,serif;font-size:22px;color:' + NAVY + ';margin:2px 0 14px">' + t + "</h2>" + b + "</section>";
  const fmt = d => { try { return new Date(d + "T00:00:00").toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); } catch (e) { return d; } };

  const html =
    '<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rekap Operasional Harian - BUL</title></head>' +
    '<body style="margin:0;background:' + PAPER + ';font-family:Segoe UI,Calibri,Arial,sans-serif;color:' + INK + '"><div style="max-width:920px;margin:0 auto;padding:0 20px 60px">' +
    '<header style="background:' + NAVY + ';color:#fff;border-radius:0 0 16px 16px;padding:30px 34px"><div style="font-size:12px;letter-spacing:3px;color:' + TEAL + ';font-weight:700">REKAP OPERASIONAL HARIAN &middot; PT. BANGUN USAHA LANCAR</div><h1 style="font-family:Georgia,serif;font-size:30px;margin:8px 0 4px">' + fmt(refDate) + '</h1><div style="font-size:13px;color:#AEBBD8">Dihasilkan otomatis oleh Cloud Function</div></header>' +
    sec("Ringkasan Hari Ini", "OPERASIONAL", '<div style="display:flex;gap:12px;flex-wrap:wrap">' + chip("Surat Jalan", num(sjHari.length), "dokumen", TEAL) + chip("Volume Terkirim", qtyFmt(hariQty) + " m&sup3;", "qty isi", NAVY) + chip("Uang Jalan", rupiah(hariUangJalan), "total", AMBER) + chip("Status SJ", Object.entries(hariStatus).map(([k, v]) => k + ":" + v).join(" &middot; ") || "-", "rincian", CORAL) + "</div>") +
    sec("Tren 14 Hari (jumlah SJ)", "VOLUME", '<div style="background:#fff;border:1px solid #E4E9F3;border-radius:10px;padding:16px 18px">' + (tren.map(([d, c]) => bar(d.slice(5), c, trenMax, d === refDate ? TEAL : "#9FB0CF")).join("") || "<i>Tidak ada data.</i>") + "</div>") +
    sec("Per Material, Rute & Supir", "RINCIAN", '<div style="display:flex;gap:14px;flex-wrap:wrap">' + card("Material", topN(perMaterial)) + card("Rute teratas", topN(perRute)) + card("Supir teratas", topN(perSupir)) + "</div>") +
    sec("Invoice (bul-monitor)", "PENAGIHAN", '<div style="display:flex;gap:12px;flex-wrap:wrap">' + chip("Invoice Aktif", num(invMon.length), "dari " + num(invMonAll.length) + " total", TEAL) + chip("Nilai Invoice", rupiah(invMonNilai), "invoice aktif", NAVY) + "</div>") +
    sec("Piutang & Aging (bul-accounting)", "KEUANGAN", '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px">' + chip("Total Piutang", rupiah(totalPiutang), piutang.length + " invoice belum lunas", CORAL) + Object.entries(buckets).map(([b, v]) => chip(b, rupiah(v), "", b.indexOf("> 90") >= 0 ? CORAL : b.indexOf("61") >= 0 ? AMBER : TEAL)).slice(0, 3).join("") + '</div><div style="background:#fff;border:1px solid #E4E9F3;border-radius:10px;overflow:hidden"><div style="background:' + NAVY + ';color:#fff;font-weight:700;font-size:13px;padding:9px 12px">Piutang per Pelanggan (Top 5)</div><table style="width:100%;border-collapse:collapse;font-size:13px">' + (topPiutang.length ? topPiutang.map(([k, v]) => row([k, rupiah(v)])).join("") : row(["(tidak ada)", ""])) + "</table></div>") +
    sec("Peringatan Kualitas Data", "PERLU DITINJAU", '<div style="background:#FFF6F0;border:1px solid ' + AMBER + ';border-radius:10px;padding:8px 6px">' + (alerts.length ? '<ul style="margin:8px 16px;line-height:1.7">' + alerts.map(a => "<li>" + a + "</li>").join("") + "</ul>" : '<p style="margin:12px 16px">Tidak ada anomali mencolok.</p>') + "</div>") +
    "</div></body></html>";

  return { html, summary };
}

async function runRecap(refDateArg) {
  const db = admin.firestore();
  const refDate = refDateArg || jakartaDateStr(-1); // default: kemarin (Asia/Jakarta)
  const monitor = await readMonitor(db);
  let accounting = { invoices: [], customers: [] };
  try { accounting = await readAccounting(); } catch (e) { functions.logger.error("Gagal baca accounting:", e.message); }

  const { html, summary } = buildRecap({ monitor, accounting, refDate });

  // Simpan ke Firestore (arsip + bisa ditampilkan di aplikasi)
  await db.collection("bul_reports").doc(refDate).set({
    type: "rekap_harian", date: refDate, generatedAt: admin.firestore.FieldValue.serverTimestamp(),
    summary, html,
  });

  // Kirim email bila SMTP dikonfigurasi
  if (RECIPIENTS.length && process.env.SMTP_HOST) {
    const nodemailer = require("nodemailer");
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || "false") === "true",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await transport.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: RECIPIENTS.join(","),
      subject: "Rekap Operasional Harian BUL - " + refDate,
      html,
    });
    functions.logger.info("Email terkirim ke", RECIPIENTS.join(","));
  } else {
    functions.logger.info("SMTP tidak dikonfigurasi — rekap hanya disimpan ke Firestore bul_reports/" + refDate);
  }

  return { refDate, summary };
}

// Scheduled: tiap hari 07:00 WIB
exports.rekapHarianScheduled = functions
  .runWith({ timeoutSeconds: 300, memory: "512MB" })
  .pubsub.schedule(process.env.RECAP_CRON || "0 7 * * *")
  .timeZone(TZ)
  .onRun(async () => { await runRecap(); return null; });

// HTTP test (manual): panggil sekali untuk uji tanpa menunggu jadwal.
// Hapus / amankan setelah verifikasi.
exports.rekapHarianTest = functions.https.onRequest(async (req, res) => {
  try {
    const out = await runRecap(req.query.date);
    res.json({ ok: true, ...out });
  } catch (e) {
    functions.logger.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
});
