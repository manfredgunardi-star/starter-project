import { getDb, getFirestoreModule, isFirebaseConfigured } from '../firebase.js';
import { createId } from '../utils/ids.js';
import { nowIso } from '../utils/date.js';
import { sanitizeForFirestore } from '../utils/sanitize.js';
import { restoreItemInFirestore, softDeleteItemInFirestore, upsertItemToFirestore } from './firestoreService.js';

const demoSeed = {
  pelanggan: [
    {
      id: 'pel-demo-001',
      kode: 'CUST-001',
      nama: 'PT Nusantara Jaya',
      telepon: '021-555-0101',
      email: 'finance@nusantarajaya.local',
      alamat: 'Jakarta Selatan',
      npwp: '01.234.567.8-901.000',
      catatan: 'Pelanggan demo untuk validasi alur master data.',
      isActive: true,
      createdAt: '2026-04-17T00:00:00.000Z',
      createdBy: 'demo-user',
      updatedAt: '2026-04-17T00:00:00.000Z',
      updatedBy: 'demo-user',
    },
    {
      id: 'pel-demo-002',
      kode: 'CUST-002',
      nama: 'CV Sinar Abadi',
      telepon: '031-555-0199',
      email: 'admin@sinarabadi.local',
      alamat: 'Surabaya',
      npwp: '',
      catatan: '',
      isActive: true,
      createdAt: '2026-04-17T00:00:00.000Z',
      createdBy: 'demo-user',
      updatedAt: '2026-04-17T00:00:00.000Z',
      updatedBy: 'demo-user',
    },
  ],
  supplier: [
    {
      id: 'sup-demo-001',
      kode: 'SUP-001',
      nama: 'PT Sumber Makmur',
      telepon: '021-555-0201',
      email: 'billing@sumbermakmur.local',
      alamat: 'Tangerang',
      npwp: '02.345.678.9-012.000',
      catatan: 'Supplier demo untuk validasi alur master data.',
      isActive: true,
      createdAt: '2026-04-17T00:00:00.000Z',
      createdBy: 'demo-user',
      updatedAt: '2026-04-17T00:00:00.000Z',
      updatedBy: 'demo-user',
    },
    {
      id: 'sup-demo-002',
      kode: 'SUP-002',
      nama: 'CV Logistik Prima',
      telepon: '022-555-0233',
      email: 'admin@logistikprima.local',
      alamat: 'Bandung',
      npwp: '',
      catatan: '',
      isActive: true,
      createdAt: '2026-04-17T00:00:00.000Z',
      createdBy: 'demo-user',
      updatedAt: '2026-04-17T00:00:00.000Z',
      updatedBy: 'demo-user',
    },
  ],
  produk: [
    {
      id: 'prd-demo-001',
      kode: 'PRD-001',
      nama: 'Jasa Konsultasi',
      tipe: 'Jasa',
      satuan: 'Jam',
      hargaJual: 750000,
      akunPendapatan: '4-1000',
      catatan: 'Produk demo untuk validasi master produk/jasa.',
      isActive: true,
      createdAt: '2026-04-17T00:00:00.000Z',
      createdBy: 'demo-user',
      updatedAt: '2026-04-17T00:00:00.000Z',
      updatedBy: 'demo-user',
    },
    {
      id: 'prd-demo-002',
      kode: 'PRD-002',
      nama: 'Paket Implementasi',
      tipe: 'Jasa',
      satuan: 'Paket',
      hargaJual: 12500000,
      akunPendapatan: '4-1000',
      catatan: '',
      isActive: true,
      createdAt: '2026-04-17T00:00:00.000Z',
      createdBy: 'demo-user',
      updatedAt: '2026-04-17T00:00:00.000Z',
      updatedBy: 'demo-user',
    },
  ],
  satuan: [
    {
      id: 'sat-demo-001',
      kode: 'SAT-001',
      nama: 'Pcs',
      simbol: 'pcs',
      catatan: 'Satuan unit demo.',
      isActive: true,
      createdAt: '2026-04-17T00:00:00.000Z',
      createdBy: 'demo-user',
      updatedAt: '2026-04-17T00:00:00.000Z',
      updatedBy: 'demo-user',
    },
    {
      id: 'sat-demo-002',
      kode: 'SAT-002',
      nama: 'Jam',
      simbol: 'jam',
      catatan: 'Satuan jasa demo.',
      isActive: true,
      createdAt: '2026-04-17T00:00:00.000Z',
      createdBy: 'demo-user',
      updatedAt: '2026-04-17T00:00:00.000Z',
      updatedBy: 'demo-user',
    },
  ],
  kategoriProduk: [
    {
      id: 'kat-demo-001',
      kode: 'CAT-001',
      nama: 'Jasa Profesional',
      deskripsi: 'Kategori untuk jasa konsultasi, implementasi, dan support.',
      catatan: '',
      isActive: true,
      createdAt: '2026-04-17T00:00:00.000Z',
      createdBy: 'demo-user',
      updatedAt: '2026-04-17T00:00:00.000Z',
      updatedBy: 'demo-user',
    },
    {
      id: 'kat-demo-002',
      kode: 'CAT-002',
      nama: 'Produk Digital',
      deskripsi: 'Kategori untuk produk non-fisik.',
      catatan: '',
      isActive: true,
      createdAt: '2026-04-17T00:00:00.000Z',
      createdBy: 'demo-user',
      updatedAt: '2026-04-17T00:00:00.000Z',
      updatedBy: 'demo-user',
    },
  ],
  costCenters: [
    {
      id: 'cc-demo-001',
      kode: 'CC-001',
      nama: 'Operasional',
      catatan: 'Cost center operasional utama.',
      isActive: true,
      createdAt: '2026-04-17T00:00:00.000Z',
      createdBy: 'demo-user',
      updatedAt: '2026-04-17T00:00:00.000Z',
      updatedBy: 'demo-user',
    },
    {
      id: 'cc-demo-002',
      kode: 'CC-002',
      nama: 'Administrasi',
      catatan: 'Cost center administrasi dan umum.',
      isActive: true,
      createdAt: '2026-04-17T00:00:00.000Z',
      createdBy: 'demo-user',
      updatedAt: '2026-04-17T00:00:00.000Z',
      updatedBy: 'demo-user',
    },
  ],
  coaAccounts: [
    {
      id: 'coa-1100',
      kode: '1-1000',
      nama: 'Kas',
      tipe: 'Asset',
      saldoNormal: 'Debit',
      catatan: 'Akun kas utama.',
      isActive: true,
      createdAt: '2026-04-17T00:00:00.000Z',
      createdBy: 'demo-user',
      updatedAt: '2026-04-17T00:00:00.000Z',
      updatedBy: 'demo-user',
    },
    {
      id: 'coa-1200',
      kode: '1-2000',
      nama: 'Bank',
      tipe: 'Asset',
      saldoNormal: 'Debit',
      catatan: '',
      isActive: true,
      createdAt: '2026-04-17T00:00:00.000Z',
      createdBy: 'demo-user',
      updatedAt: '2026-04-17T00:00:00.000Z',
      updatedBy: 'demo-user',
    },
    {
      id: 'coa-2100',
      kode: '2-1000',
      nama: 'Hutang Usaha',
      tipe: 'Liability',
      saldoNormal: 'Credit',
      catatan: '',
      isActive: true,
      createdAt: '2026-04-17T00:00:00.000Z',
      createdBy: 'demo-user',
      updatedAt: '2026-04-17T00:00:00.000Z',
      updatedBy: 'demo-user',
    },
    {
      id: 'coa-3100',
      kode: '3-1000',
      nama: 'Modal',
      tipe: 'Equity',
      saldoNormal: 'Credit',
      catatan: '',
      isActive: true,
      createdAt: '2026-04-17T00:00:00.000Z',
      createdBy: 'demo-user',
      updatedAt: '2026-04-17T00:00:00.000Z',
      updatedBy: 'demo-user',
    },
    {
      id: 'coa-4100',
      kode: '4-1000',
      nama: 'Pendapatan',
      tipe: 'Revenue',
      saldoNormal: 'Credit',
      catatan: '',
      isActive: true,
      createdAt: '2026-04-17T00:00:00.000Z',
      createdBy: 'demo-user',
      updatedAt: '2026-04-17T00:00:00.000Z',
      updatedBy: 'demo-user',
    },
    {
      id: 'coa-5100',
      kode: '5-1000',
      nama: 'Beban Operasional',
      tipe: 'Expense',
      saldoNormal: 'Debit',
      catatan: '',
      isActive: true,
      createdAt: '2026-04-17T00:00:00.000Z',
      createdBy: 'demo-user',
      updatedAt: '2026-04-17T00:00:00.000Z',
      updatedBy: 'demo-user',
    },
  ],
};

function storageKey(companyId, collectionName) {
  return `mini-erp:${companyId}:${collectionName}`;
}

function readLocalItems(companyId, collectionName) {
  if (typeof localStorage === 'undefined') {
    return demoSeed[collectionName] || [];
  }

  const key = storageKey(companyId, collectionName);
  const raw = localStorage.getItem(key);

  if (raw) {
    return JSON.parse(raw);
  }

  const seed = demoSeed[collectionName] || [];
  localStorage.setItem(key, JSON.stringify(seed));
  return seed;
}

function writeLocalItems(companyId, collectionName, items) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(storageKey(companyId, collectionName), JSON.stringify(items));
}

function sortItems(items) {
  return [...items].sort((a, b) => {
    const aValue = a.kode || a.nama || '';
    const bValue = b.kode || b.nama || '';
    return aValue.localeCompare(bValue, 'id-ID');
  });
}

export function subscribeMasterData({ companyId, collectionName, onData, onError }) {
  if (!companyId) {
    onData([]);
    return () => {};
  }

  if (!isFirebaseConfigured) {
    onData(sortItems(readLocalItems(companyId, collectionName)));
    return () => {};
  }

  let unsubscribe = () => {};
  let cancelled = false;

  Promise.all([getDb(), getFirestoreModule()])
    .then(([db, firestore]) => {
      if (cancelled) return;
      const ref = firestore.collection(db, 'companies', companyId, collectionName);
      const q = firestore.query(ref, firestore.orderBy('kode'));

      unsubscribe = firestore.onSnapshot(
        q,
        (snapshot) => {
          onData(snapshot.docs.map((document) => ({ id: document.id, ...document.data() })));
        },
        onError
      );
    })
    .catch(onError);

  return () => {
    cancelled = true;
    unsubscribe();
  };
}

export async function saveMasterDataItem({ companyId, collectionName, data, actor, prefix }) {
  if (isFirebaseConfigured) {
    return upsertItemToFirestore({
      companyId,
      collectionName,
      data: {
        ...data,
        id: data.id || createId(prefix),
      },
      actor,
    });
  }

  const items = readLocalItems(companyId, collectionName);
  const timestamp = nowIso();
  const existing = items.find((item) => item.id === data.id);
  const payload = sanitizeForFirestore({
    ...existing,
    ...data,
    id: data.id || createId(prefix),
    isActive: data.isActive ?? existing?.isActive ?? true,
    createdAt: existing?.createdAt || timestamp,
    createdBy: existing?.createdBy || actor.uid,
    updatedAt: timestamp,
    updatedBy: actor.uid,
  });
  const nextItems = existing ? items.map((item) => (item.id === payload.id ? payload : item)) : [...items, payload];

  writeLocalItems(companyId, collectionName, sortItems(nextItems));
  return payload;
}

export async function softDeleteMasterDataItem({ companyId, collectionName, id, actor }) {
  if (isFirebaseConfigured) {
    return softDeleteItemInFirestore({ companyId, collectionName, id, actor });
  }

  const items = readLocalItems(companyId, collectionName);
  const timestamp = nowIso();
  const nextItems = items.map((item) =>
    item.id === id
      ? {
          ...item,
          isActive: false,
          deletedAt: timestamp,
          deletedBy: actor.uid,
          updatedAt: timestamp,
          updatedBy: actor.uid,
        }
      : item
  );

  writeLocalItems(companyId, collectionName, nextItems);
}

export async function restoreMasterDataItem({ companyId, collectionName, id, actor }) {
  if (isFirebaseConfigured) {
    return restoreItemInFirestore({ companyId, collectionName, id, actor });
  }

  const items = readLocalItems(companyId, collectionName);
  const timestamp = nowIso();
  const nextItems = items.map((item) =>
    item.id === id
      ? {
          ...item,
          isActive: true,
          deletedAt: null,
          deletedBy: null,
          updatedAt: timestamp,
          updatedBy: actor.uid,
        }
      : item
  );

  writeLocalItems(companyId, collectionName, sortItems(nextItems));
}
