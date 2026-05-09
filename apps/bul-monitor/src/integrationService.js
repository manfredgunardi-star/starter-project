/**
 * integrationService.js
 * Handles all data bridge operations from bul-monitor → bul-accounting.
 * Writes to `integration_queue` collection in bul-accounting's Firestore
 * using the secondary Firebase app (dbAccounting + authAccounting).
 */

import { doc, setDoc, updateDoc, getDoc, getDocs, collection, onSnapshot, arrayUnion } from 'firebase/firestore';
import { db, dbAccounting, authAccounting } from './config/firebase-config.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function now() {
  return new Date().toISOString();
}

/**
 * Cek apakah jenis biaya merupakan upah/gaji/honor sopir.
 * Biaya jenis ini diakui langsung sebagai expense saat SJ selesai (bukan masuk WIP).
 */
function isUpahBiaya(jenisBiaya) {
  const str = (jenisBiaya || '').toLowerCase();
  return str.includes('upah') || str.includes('gaji') || str.includes('honor');
}

/** Pastikan bridge account sudah login sebelum write. */
function assertBridgeAuthed() {
  if (!authAccounting.currentUser) {
    throw new Error('Bridge account belum login ke bul-accounting. Pastikan VITE_ACCOUNTING_BRIDGE_PASSWORD sudah diisi dengan benar di .env.');
  }
}

/**
 * Fetch daftar truck dari bul-accounting untuk validasi master data.
 * @returns {Object[]} Array truck accounting: [{ id, name, platNomor, ... }]
 */
async function fetchAccountingTrucks() {
  try {
    const snap = await getDocs(collection(dbAccounting, 'trucks'));
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(t => t.status !== 'deleted');
  } catch (e) {
    console.warn('[bridge] Gagal fetch trucks dari accounting:', e.message);
    return [];
  }
}

/**
 * Fetch daftar karyawan dari bul-accounting untuk validasi master data.
 * @returns {Object[]} Array karyawan accounting: [{ id, name, position, ... }]
 */
async function fetchAccountingKaryawan() {
  try {
    const snap = await getDocs(collection(dbAccounting, 'karyawan'));
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(k => k.status !== 'deleted');
  } catch (e) {
    console.warn('[bridge] Gagal fetch karyawan dari accounting:', e.message);
    return [];
  }
}

/**
 * Create atau update dokumen integration_queue dengan menjaga audit trail.
 * - Dokumen baru: setDoc (create)
 * - Kirim ulang setelah rejected/cancelled: updateDoc + simpan riwayat penolakan ke rejectionHistory
 *
 * @param {DocumentReference} ref      - Firestore doc ref
 * @param {Object}            payload  - Data lengkap untuk dokumen baru (status: 'pending')
 */
async function upsertQueueDoc(ref, payload) {
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, payload);
    return;
  }

  // Dokumen sudah ada — kirim ulang setelah rejected/cancelled
  const prev = snap.data();

  // Bangun entri riwayat dari data penolakan/pembatalan sebelumnya
  const historyEntry = {
    status: prev.status,
    reviewedBy: prev.reviewedBy || null,
    rejectedAt: prev.status === 'rejected' ? prev.updatedAt : null,
    cancelledAt: prev.status === 'cancelled' ? prev.updatedAt : null,
    rejectionReason: prev.rejectionReason || null,
    cancellationReason: prev.cancellationReason || null,
  };

  // Field yang direset saat kirim ulang
  const resetFields = {
    status: 'pending',
    rejectionReason: null,
    cancellationReason: null,
    reviewedBy: null,
    cancelledBy: null,
    journalId: null,
    updatedAt: payload.updatedAt,
  };

  // Update field data (suggestedJournal, sentBy, dll) + tambahkan history
  await updateDoc(ref, {
    ...payload,
    ...resetFields,
    rejectionHistory: arrayUnion(historyEntry),
  });
}

/**
 * Fetch data pelanggan dari bul_pelanggan berdasarkan nama PT (case-insensitive).
 * @returns {{ name, address, npwp } | null}
 */
async function fetchPelangganByName(ptName) {
  if (!ptName) return null;
  try {
    const snap = await getDocs(collection(db, 'bul_pelanggan'));
    const found = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .find(p => p.isActive !== false && !p.deletedAt &&
        (p.name || '').trim().toLowerCase() === ptName.trim().toLowerCase());
    return found ? { name: found.name, address: found.address || '', npwp: found.npwp || '' } : null;
  } catch (e) {
    console.warn('[bridge] Gagal fetch pelanggan:', e.message);
    return null;
  }
}

// ─── Kirim Uang Jalan ────────────────────────────────────────────────────────

/**
 * Kirim data Uang Jalan dari sebuah Surat Jalan ke antrian review bul-accounting.
 * Menggunakan ID deterministik (IQ-UJ-{sjId}) agar idempotent.
 *
 * Jurnal utama: Dr 1151 (Uang Muka Sopir/UJ) / Cr 2122 (Hutang UJ Sopir)
 * Biaya tambahan: Dr 5130 (Upah Sopir) / Cr 2122 per item biaya
 *
 * @param {Object}   sj          - Dokumen Surat Jalan dari bul_surat_jalan
 * @param {Object}   currentUser - User bul-monitor yang sedang login
 * @param {Object[]} allInvoices - Seluruh daftar invoice
 * @param {Object[]} biayaList   - Seluruh biaya tambahan (akan difilter per sjId)
 * @returns {{ warnings: Object[] }} Daftar warning master data mismatch
 */
export async function kirimUangJalanKeAccounting(sj, currentUser, allInvoices = [], biayaList = []) {
  assertBridgeAuthed();

  // ── Validasi master data vs bul-accounting ──────────────────────────────
  const [accountingTrucks, accountingKaryawan] = await Promise.all([
    fetchAccountingTrucks(),
    fetchAccountingKaryawan(),
  ]);

  const warnings = [];

  const truckFound = accountingTrucks.some(
    t => (t.platNomor || '').trim().toLowerCase() === (sj.nomorPolisi || '').trim().toLowerCase()
  );
  if (!truckFound && sj.nomorPolisi) {
    warnings.push({
      type: 'truck_not_found',
      message: `Truck "${sj.nomorPolisi}" tidak ditemukan di Master Data Truck bul-accounting. Pastikan plat nomor sudah didaftarkan di menu Pengaturan → Truck.`,
    });
  }

  const supirFound = accountingKaryawan.some(
    k => (k.name || '').trim().toLowerCase() === (sj.namaSupir || '').trim().toLowerCase()
  );
  if (!supirFound && sj.namaSupir) {
    warnings.push({
      type: 'supir_not_found',
      message: `Supir "${sj.namaSupir}" tidak ditemukan di Master Data Karyawan bul-accounting. Pastikan nama supir sudah didaftarkan di menu Pengaturan → Karyawan.`,
    });
  }

  // ── Build data ──────────────────────────────────────────────────────────
  const docId = `IQ-UJ-${sj.id}`;
  const ref = doc(dbAccounting, 'integration_queue', docId);
  const tanggal = sj.tglTerkirim || sj.tanggalSJ;
  const nominal = Number(sj.uangJalan) || 0;

  // Cari invoice yang memuat SJ ini
  const relatedInvoice = allInvoices.find(inv =>
    inv.isActive !== false && (inv.suratJalanIds || []).includes(sj.id)
  );
  const invoiceInfo = relatedInvoice ? {
    invoiceId:    relatedInvoice.id,
    noInvoice:    relatedInvoice.noInvoice || '',
    tglInvoice:   relatedInvoice.tglInvoice || '',
    otherSJIds:   (relatedInvoice.suratJalanIds || []).filter(id => id !== sj.id),
    otherSJNomors: (relatedInvoice.suratJalanList || [])
      .filter(s => s.id !== sj.id)
      .map(s => s.nomorSJ || s.id),
  } : null;

  // Biaya tambahan untuk SJ ini
  const sjBiaya = biayaList.filter(
    b => b.suratJalanId === sj.id && b.isActive !== false && !b.deletedAt
  );

  // Baris jurnal utama (uang jalan)
  // UJ = uang muka yang sudah diterima dari pelanggan → Cr 2141 (Uang Muka Pelanggan)
  const journalLines = [
    {
      accountCode: '1151',
      debit: nominal,
      credit: 0,
      keterangan: `Uang Jalan ${sj.nomorSJ}`,
      truckId: sj.truckId || '',
    },
    {
      accountCode: '2141',
      debit: 0,
      credit: nominal,
      keterangan: `Uang Muka Pelanggan ${sj.pt || sj.nomorSJ}`,
      truckId: sj.truckId || '',
    },
    // Biaya tambahan:
    // - Upah sopir (jenisBiaya ~ upah/gaji/honor) → Dr 5130 / Cr 2122
    //   Diakui langsung sebagai expense saat SJ selesai (whichever earlier: given or accrued)
    // - Biaya lain (solar, tol, dll) → Dr 1151 / Cr 2122
    //   Masuk WIP, di-clear ke HPP saat invoice diapprove
    ...sjBiaya.flatMap(b => {
      const upah = isUpahBiaya(b.jenisBiaya);
      const nom = Number(b.nominal) || 0;
      const ket = b.keteranganBiaya || b.jenisBiaya || 'Biaya Tambahan';
      return [
        {
          accountCode: upah ? '5130' : '1151',
          debit: nom,
          credit: 0,
          keterangan: upah ? `Upah Sopir - ${ket}` : `WIP ${ket} ${sj.nomorSJ}`,
          truckId: sj.truckId || '',
        },
        {
          accountCode: '2122',
          debit: 0,
          credit: nom,
          keterangan: `Hutang ${ket} - ${sj.namaSupir}`,
          truckId: sj.truckId || '',
        },
      ];
    }),
  ];

  await upsertQueueDoc(ref, {
    id: docId,
    type: 'uang_jalan',
    status: 'pending',
    sourceProject: 'bul-monitor',
    sourceSjId: sj.id,

    // Data SJ
    tanggal,
    nomorSJ: sj.nomorSJ || '',
    namaSupir: sj.namaSupir || '',
    nomorPolisi: sj.nomorPolisi || '',
    rute: sj.rute || '',
    pt: sj.pt || '',
    uangJalan: nominal,
    keterangan: `Uang Jalan - ${sj.nomorSJ} (${sj.rute})`,

    // Biaya tambahan per SJ
    biayaTambahan: sjBiaya.map(b => ({
      id: b.id,
      jenisBiaya: b.jenisBiaya || '',
      nominal: Number(b.nominal) || 0,
      keteranganBiaya: b.keteranganBiaya || '',
    })),

    // Info invoice terkait
    invoiceInfo,

    // Warning master data mismatch
    warnings,

    // Suggested journal (uang jalan + biaya tambahan)
    suggestedJournal: {
      description: `Uang Jalan ${sj.nomorSJ} - ${sj.namaSupir}`,
      lines: journalLines,
    },

    // Metadata
    journalId: null,
    rejectionReason: null,
    reviewedBy: null,
    sentBy: currentUser?.name || currentUser?.username || 'unknown',
    createdAt: now(),
    updatedAt: now(),
  });

  return { warnings };
}

// ─── Kirim Invoice ───────────────────────────────────────────────────────────

/**
 * Kirim data Invoice ke antrian review bul-accounting.
 * ID deterministik: IQ-INV-{invoiceId}
 *
 * Jurnal invoice (matching principle):
 *   Dr 1121 (piutang net = totalNilai − totalUJ)
 *   Dr 2141 (clearing uang muka pelanggan = totalUJ)
 *   Cr 4100 (pendapatan bruto = totalNilai)
 *   Dr 5150 / Cr 1151 (HPP + clearing WIP: totalUJ + biaya lain non-upah)
 *
 * Upah sopir sudah diakui langsung saat SJ di-approve (Dr 5130 / Cr 2122),
 * sehingga tidak masuk WIP dan tidak perlu di-clear di sini.
 *
 * @param {Object}   invoice        - Dokumen Invoice dari bul_invoices
 * @param {Object[]} allSuratJalan  - Seluruh list SJ
 * @param {Object}   currentUser    - User bul-monitor yang sedang login
 * @param {Object[]} biayaList      - Seluruh daftar biaya (untuk hitung WIP biaya lain)
 */
export async function kirimInvoiceKeAccounting(invoice, allSuratJalan, currentUser, biayaList = []) {
  assertBridgeAuthed();

  const docId = `IQ-INV-${invoice.id}`;
  const ref = doc(dbAccounting, 'integration_queue', docId);

  const includedSJ = (invoice.suratJalanIds || [])
    .map(id => allSuratJalan.find(s => s.id === id))
    .filter(Boolean);

  const pt = includedSJ[0]?.pt || invoice.pt || '';
  const totalNilai = Number(invoice.totalNilai) || 0;

  // Total UJ dari semua SJ — di-net dari piutang (metode total, bukan per-SJ)
  const totalUJ = includedSJ.reduce((sum, sj) => sum + (Number(sj.uangJalan) || 0), 0);

  // Total biaya lain (non-upah) dari semua SJ dalam invoice → ada di WIP, perlu di-clear ke HPP
  const sjIds = new Set(invoice.suratJalanIds || []);
  const totalBiayaLain = biayaList
    .filter(b => sjIds.has(b.suratJalanId) && b.isActive !== false && !b.deletedAt && !isUpahBiaya(b.jenisBiaya))
    .reduce((sum, b) => sum + (Number(b.nominal) || 0), 0);

  const piutangNet = totalNilai - totalUJ;
  const pelangganData = invoice.pelangganData || await fetchPelangganByName(pt);

  const hppLines = [
    // HPP Uang Jalan — clear WIP UJ ke HPP
    {
      accountCode: '5150',
      debit: totalUJ,
      credit: 0,
      keterangan: `HPP Uang Jalan ${invoice.noInvoice}`,
      truckId: '',
    },
    {
      accountCode: '1151',
      debit: 0,
      credit: totalUJ,
      keterangan: `Clearing WIP UJ ${invoice.noInvoice}`,
      truckId: '',
    },
    // HPP Biaya Lain — clear WIP biaya non-upah ke HPP (jika ada)
    ...(totalBiayaLain > 0 ? [
      {
        accountCode: '5150',
        debit: totalBiayaLain,
        credit: 0,
        keterangan: `HPP Biaya Tambahan ${invoice.noInvoice}`,
        truckId: '',
      },
      {
        accountCode: '1151',
        debit: 0,
        credit: totalBiayaLain,
        keterangan: `Clearing WIP Biaya Tambahan ${invoice.noInvoice}`,
        truckId: '',
      },
    ] : []),
  ];

  await upsertQueueDoc(ref, {
    id: docId,
    type: 'invoice',
    status: 'pending',
    sourceProject: 'bul-monitor',
    sourceInvoiceId: invoice.id,

    tanggal: invoice.tglInvoice || '',
    noInvoice: invoice.noInvoice || '',
    pt,
    pelangganData,
    totalQty: invoice.totalQty || 0,
    totalNilai,
    totalUJ,
    totalBiayaLain,
    piutangNet,
    suratJalanIds: invoice.suratJalanIds || [],
    suratJalanList: (() => {
      const hargaMap = {};
      if (invoice.hargaPerGroup && invoice.hargaPerGroup.length > 0) {
        invoice.hargaPerGroup.forEach(g => { hargaMap[`${g.material}|${g.rute}`] = g.hargaSatuan; });
      }
      return includedSJ.map(sj => {
        const harga = invoice.hargaPerGroup && invoice.hargaPerGroup.length > 0
          ? (hargaMap[`${sj.material}|${sj.rute}`] || 0)
          : (Number(invoice.hargaSatuan) || 0);
        return {
          nomorSJ: sj.nomorSJ || '',
          tanggal: sj.tglTerkirim || sj.tanggalSJ || '',
          rute: sj.rute || '',
          material: sj.material || '',
          qtyBongkar: sj.qtyBongkar || 0,
          satuan: sj.satuan || '',
          uangJalan: Number(sj.uangJalan) || 0,
          hargaSatuan: harga,
          nilai: (Number(sj.qtyBongkar) || 0) * harga,
        };
      });
    })(),

    suggestedJournal: {
      description: `Invoice ${invoice.noInvoice} - ${pt}`,
      lines: [
        // Piutang net (setelah dikurangi uang muka pelanggan yang sudah diterima)
        {
          accountCode: '1121',
          debit: piutangNet,
          credit: 0,
          keterangan: `Piutang ${invoice.noInvoice}`,
          truckId: '',
        },
        // Clearing uang muka pelanggan (debit untuk tutup kewajiban di 2141)
        {
          accountCode: '2141',
          debit: totalUJ,
          credit: 0,
          keterangan: `Clearing Uang Muka Pelanggan ${invoice.noInvoice}`,
          truckId: '',
        },
        // Pengakuan pendapatan bruto
        {
          accountCode: '4100',
          debit: 0,
          credit: totalNilai,
          keterangan: `Pendapatan ${invoice.noInvoice}`,
          truckId: '',
        },
        ...hppLines,
      ],
    },

    journalId: null,
    rejectionReason: null,
    reviewedBy: null,
    sentBy: currentUser?.name || currentUser?.username || 'unknown',
    createdAt: now(),
    updatedAt: now(),
  });
}

// ─── Kirim Transaksi Kas ─────────────────────────────────────────────────────

/**
 * Kirim data Transaksi Kas (pemasukan/pengeluaran manual) ke antrian review bul-accounting.
 * Hanya transaksi manual (source !== 'auto_sj') yang relevan untuk dikirim.
 * ID deterministik: IQ-TRX-{transaksiId}
 *
 * Suggested journal:
 *   Pemasukan : Dr 1111 (Kas Kecil) / Cr 1121 (Piutang Pelanggan)
 *   Pengeluaran: Dr '' (diisi akuntan) / Cr 1111 (Kas Kecil)
 *
 * @param {Object} transaksi   - Dokumen transaksi dari bul_transaksi
 * @param {Object} currentUser - User bul-monitor yang sedang login
 */
export async function kirimTransaksiKasKeAccounting(transaksi, currentUser) {
  assertBridgeAuthed();

  const docId = `IQ-TRX-${transaksi.id}`;
  const ref = doc(dbAccounting, 'integration_queue', docId);
  const nominal = Number(transaksi.nominal) || 0;
  const isPemasukan = transaksi.tipe === 'pemasukan';

  const journalLines = isPemasukan
    ? [
        // Kas masuk — paling umum: pelunasan piutang dari customer
        { accountCode: '1111', debit: nominal, credit: 0, keterangan: `Kas Masuk - ${transaksi.keterangan}`, truckId: '' },
        { accountCode: '1121', debit: 0, credit: nominal, keterangan: `Pelunasan Piutang - ${transaksi.pt || transaksi.keterangan}`, truckId: '' },
      ]
    : [
        // Kas keluar — akun beban dikosongkan, akuntan wajib memilih
        { accountCode: '', debit: nominal, credit: 0, keterangan: transaksi.keterangan || 'Pengeluaran', truckId: '' },
        { accountCode: '1111', debit: 0, credit: nominal, keterangan: `Kas Keluar - ${transaksi.keterangan}`, truckId: '' },
      ];

  await upsertQueueDoc(ref, {
    id: docId,
    type: 'transaksi_kas',
    tipe: transaksi.tipe,   // 'pemasukan' | 'pengeluaran'
    status: 'pending',
    sourceProject: 'bul-monitor',
    sourceTransaksiId: transaksi.id,

    // Data transaksi untuk ditampilkan saat review
    tanggal: transaksi.tanggal || '',
    keterangan: transaksi.keterangan || '',
    pt: transaksi.pt || '',
    nominal,

    suggestedJournal: {
      description: `${isPemasukan ? 'Kas Masuk' : 'Kas Keluar'} - ${transaksi.keterangan}`,
      lines: journalLines,
    },

    journalId: null,
    rejectionReason: null,
    reviewedBy: null,
    sentBy: currentUser?.name || currentUser?.username || 'unknown',
    createdAt: now(),
    updatedAt: now(),
  });
}

// ─── Status Listeners ────────────────────────────────────────────────────────

/** Listen perubahan status antrian untuk sebuah Surat Jalan. */
export function subscribeIntegrationStatusSJ(sjId, onChange) {
  const ref = doc(dbAccounting, 'integration_queue', `IQ-UJ-${sjId}`);
  return onSnapshot(ref, (snap) => {
    if (snap.exists()) onChange(snap.data());
  });
}

/** Listen perubahan status antrian untuk sebuah Invoice. */
export function subscribeIntegrationStatusInvoice(invoiceId, onChange) {
  const ref = doc(dbAccounting, 'integration_queue', `IQ-INV-${invoiceId}`);
  return onSnapshot(ref, (snap) => {
    if (snap.exists()) onChange(snap.data());
  });
}

/** Listen perubahan status antrian untuk sebuah Transaksi Kas. */
export function subscribeIntegrationStatusTransaksi(transaksiId, onChange) {
  const ref = doc(dbAccounting, 'integration_queue', `IQ-TRX-${transaksiId}`);
  return onSnapshot(ref, (snap) => {
    if (snap.exists()) onChange(snap.data());
  });
}

/** Cek apakah bridge account sudah siap. */
export function isBridgeReady() {
  return !!authAccounting.currentUser;
}
