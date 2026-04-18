import { UserPlus } from 'lucide-react';
import { DataTable } from '../../components/tables/DataTable.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';

const rows = [
  { id: 'demo-user', name: 'Admin Demo', email: 'admin@mini-erp.local', role: 'owner', status: 'Aktif' },
];

const columns = [
  { key: 'name', label: 'Nama' },
  { key: 'email', label: 'Email' },
  { key: 'role', label: 'Role', render: (row) => <Badge tone="blue">{row.role}</Badge> },
  { key: 'status', label: 'Status', render: (row) => <Badge tone="green">{row.status}</Badge> },
];

export function UsersPage() {
  return (
    <div>
      <PageHeader
        eyebrow="RBAC"
        title="User & Role"
        description="Role disimpan per company membership, bukan hanya di profil user global."
        actions={<Button icon={UserPlus}>Undang User</Button>}
      />

      <DataTable columns={columns} rows={rows} />
    </div>
  );
}
