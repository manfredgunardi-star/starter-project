import { Plus, SlidersHorizontal } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { SearchInput } from '../../components/forms/SearchInput.jsx';
import { DataTable } from '../../components/tables/DataTable.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';

const masterDataModules = [
  { id: 'pelanggan', kode: 'MD-001', nama: 'Pelanggan', tipe: 'Relasi', status: 'Aktif', path: '/master-data/pelanggan' },
  { id: 'supplier', kode: 'MD-002', nama: 'Supplier', tipe: 'Relasi', status: 'Aktif', path: '/master-data/supplier' },
  { id: 'produk', kode: 'MD-003', nama: 'Produk / Jasa', tipe: 'Item', status: 'Aktif', path: '/master-data/produk' },
  { id: 'satuan', kode: 'MD-004', nama: 'Satuan', tipe: 'Item', status: 'Aktif', path: '/master-data/satuan' },
  { id: 'kategori', kode: 'MD-005', nama: 'Kategori Produk', tipe: 'Item', status: 'Aktif', path: '/master-data/kategori-produk' },
  { id: 'lokasi', kode: 'MD-006', nama: 'Gudang / Lokasi', tipe: 'Operasional', status: 'Aktif' },
  { id: 'cost-center', kode: 'MD-007', nama: 'Departemen / Cost Center', tipe: 'Accounting', status: 'Aktif', path: '/master-data/cost-center' },
  { id: 'kas-bank', kode: 'MD-008', nama: 'Kas / Bank Account', tipe: 'Accounting', status: 'Aktif' },
];

const columns = [
  { key: 'kode', label: 'Kode' },
  { key: 'nama', label: 'Nama' },
  { key: 'tipe', label: 'Tipe' },
  {
    key: 'status',
    label: 'Status',
    render: (row) => <Badge tone="green">{row.status}</Badge>,
  },
];

export function MasterDataPage() {
  const navigate = useNavigate();

  return (
    <div>
      <PageHeader
        eyebrow="MVP"
        title="Master Data"
        description="Daftar modul master data untuk fondasi transaksi dan accounting."
        actions={
          <>
            <Button icon={SlidersHorizontal} variant="secondary">Filter</Button>
            <Button icon={Plus}>Tambah Data</Button>
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput placeholder="Cari master data" />
        <div className="flex gap-2 overflow-x-auto pb-1 sm:pb-0">
          {['Semua', 'Relasi', 'Item', 'Accounting', 'Operasional'].map((item) => (
            <button
              className="min-h-10 whitespace-nowrap rounded-full border border-ios-separator bg-white px-4 text-sm font-medium text-ios-secondary transition hover:text-ios-label focus:outline-none focus:ring-2 focus:ring-ios-blue/30"
              key={item}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <DataTable columns={columns} rows={masterDataModules} onRowClick={(row) => row.path && navigate(row.path)} />
    </div>
  );
}
