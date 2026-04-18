import { Building2 } from 'lucide-react';
import { DataTable } from '../../components/tables/DataTable.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { useCompany } from '../../hooks/useCompany.js';

const columns = [
  { key: 'name', label: 'Company' },
  { key: 'role', label: 'Role' },
  { key: 'status', label: 'Status', render: () => <Badge tone="green">Aktif</Badge> },
];

export function CompanyPage() {
  const { memberships } = useCompany();

  return (
    <div>
      <PageHeader
        eyebrow="Access"
        title="Company"
        description="Membership memakai role per company agar siap berkembang ke multi-company."
      />

      <div className="mb-4 flex items-center gap-3 rounded-2xl border border-ios-separator bg-white p-4 shadow-ios-subtle">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-ios-blue/10 text-ios-blue">
          <Building2 size={21} aria-hidden="true" />
        </div>
        <div>
          <p className="font-semibold text-ios-label">Single company MVP</p>
          <p className="text-sm text-ios-secondary">Data bisnis tetap disimpan di path companies/companyId.</p>
        </div>
      </div>

      <DataTable columns={columns} rows={memberships.map((item) => ({ ...item, status: 'Aktif' }))} />
    </div>
  );
}
