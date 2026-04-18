import {
  BarChart3,
  Building2,
  CircleDollarSign,
  ClipboardList,
  Database,
  Landmark,
  LayoutDashboard,
  Settings,
  Users,
} from 'lucide-react';

export const navigationGroups = [
  {
    label: 'Utama',
    items: [
      { label: 'Dashboard', path: '/', icon: LayoutDashboard, permission: 'dashboard:read' },
      { label: 'Master Data', path: '/master-data', icon: Database, permission: 'masterdata:read' },
      { label: 'Accounting', path: '/accounting', icon: ClipboardList, permission: 'accounting:read' },
      { label: 'Kas & Bank', path: '/kas-bank', icon: Landmark, permission: 'accounting:read' },
      { label: 'Laporan', path: '/reports', icon: BarChart3, permission: 'reports:read' },
    ],
  },
  {
    label: 'Setup',
    items: [
      { label: 'Company', path: '/company', icon: Building2, permission: 'settings:manage' },
      { label: 'User & Role', path: '/settings/users', icon: Users, permission: 'users:manage' },
      { label: 'Pengaturan', path: '/settings', icon: Settings, permission: 'settings:manage' },
      { label: 'COA', path: '/accounting/coa', icon: CircleDollarSign, permission: 'accounting:read' },
    ],
  },
];
