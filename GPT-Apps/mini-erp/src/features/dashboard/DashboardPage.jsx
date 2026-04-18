import { Building2, CircleDollarSign, Database, FileText } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { StatCard } from '../../components/ui/StatCard.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { DataTable } from '../../components/tables/DataTable.jsx';
import { useCompany } from '../../hooks/useCompany.js';

const activityRows = [
  { id: 'act-1', waktu: 'Hari ini', modul: 'Master Data', aksi: 'Pelanggan baru disiapkan', status: 'Draft' },
  { id: 'act-2', waktu: 'Hari ini', modul: 'Accounting', aksi: 'COA dasar tersedia', status: 'Siap' },
  { id: 'act-3', waktu: 'Kemarin', modul: 'Company', aksi: 'Struktur multi-company aktif', status: 'Siap' },
];

const columns = [
  { key: 'waktu', label: 'Waktu' },
  { key: 'modul', label: 'Modul' },
  { key: 'aksi', label: 'Aktivitas' },
  {
    key: 'status',
    label: 'Status',
    render: (row) => <Badge tone={row.status === 'Siap' ? 'green' : 'orange'}>{row.status}</Badge>,
  },
];

export function DashboardPage() {
  const { activeCompany } = useCompany();

  return (
    <div>
      <PageHeader
        eyebrow={activeCompany.name}
        title="Dashboard"
        description="Ringkasan workspace ERP, kesiapan master data, dan status fondasi accounting."
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Building2} label="Company aktif" value="1" helper="Siap berkembang ke multi-company." tone="blue" />
        <StatCard icon={Database} label="Master data" value="8" helper="Pelanggan, supplier, produk, COA, dan kas/bank." tone="green" />
        <StatCard icon={CircleDollarSign} label="Accounting" value="MVP" helper="Double-entry dengan draft dan posting." tone="orange" />
        <StatCard icon={FileText} label="Laporan" value="4" helper="Ledger, neraca saldo, laba rugi, neraca." tone="blue" />
      </section>

      <section className="mt-7">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ios-label">Aktivitas terakhir</h2>
          <Badge tone="blue">Foundation</Badge>
        </div>
        <DataTable columns={columns} rows={activityRows} />
      </section>
    </div>
  );
}
