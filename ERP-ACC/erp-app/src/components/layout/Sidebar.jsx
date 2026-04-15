import { useState } from 'react'
import { useLocation, Link, useNavigate } from 'react-router-dom'
import { Layout, Menu, Button, Space, Typography, Divider } from 'antd'
import { useAuth } from '../../contexts/AuthContext'
import {
  LayoutDashboard,
  Database,
  Package,
  ShoppingCart,
  Truck,
  DollarSign,
  BookOpen,
  BarChart3,
  Settings,
  Building2,
  LogOut,
} from 'lucide-react'

const { Sider } = Layout
const { Text } = Typography

// minRole: 'write' = staff+admin, 'admin' = admin only
// No minRole = visible to all (including viewer)
const menuGroups = [
  {
    label: 'Master Data',
    icon: Database,
    key: 'master',
    items: [
      { label: 'Satuan', path: '/master/units' },
      { label: 'Produk', path: '/master/products' },
      { label: 'Customer', path: '/master/customers' },
      { label: 'Supplier', path: '/master/suppliers' },
      { label: 'COA', path: '/master/coa' }
    ]
  },
  {
    label: 'Inventory',
    icon: Package,
    key: 'inventory',
    items: [
      { label: 'Stok', path: '/inventory/stock' },
      { label: 'Kartu Stok', path: '/inventory/stock-card' }
    ]
  },
  {
    label: 'Penjualan',
    icon: ShoppingCart,
    key: 'penjualan',
    items: [
      { label: 'Sales Order', path: '/sales/orders' },
      { label: 'Pengiriman', path: '/sales/deliveries' },
      { label: 'Invoice Penjualan', path: '/sales/invoices' }
    ]
  },
  {
    label: 'Pembelian',
    icon: Truck,
    key: 'pembelian',
    items: [
      { label: 'Purchase Order', path: '/purchase/orders' },
      { label: 'Penerimaan', path: '/purchase/receipts' },
      { label: 'Invoice Pembelian', path: '/purchase/invoices' }
    ]
  },
  {
    label: 'Kas & Bank',
    icon: DollarSign,
    key: 'kas',
    items: [
      { label: 'Akun', path: '/cash/accounts' },
      { label: 'Pembayaran', path: '/cash/payments' },
      { label: 'Transfer', path: '/cash/transfers/new', minRole: 'write' },
      { label: 'Rekonsiliasi', path: '/cash/reconciliation' }
    ]
  },
  {
    label: 'Pembukuan',
    icon: BookOpen,
    key: 'pembukuan',
    items: [
      { label: 'Jurnal', path: '/accounting/journals' },
      { label: 'Buku Besar', path: '/accounting/ledger' }
    ]
  },
  {
    label: 'Aset Tetap',
    icon: Building2,
    key: 'aset',
    items: [
      { label: 'Daftar Aset', path: '/assets' },
      { label: 'Kategori Aset', path: '/assets/categories' },
      { label: 'Post Penyusutan', path: '/assets/depreciation', minRole: 'admin' },
      { label: 'Import Aset', path: '/assets/bulk-import', minRole: 'write' }
    ]
  },
  {
    label: 'Laporan',
    icon: BarChart3,
    key: 'laporan',
    items: [
      { label: 'Neraca', path: '/reports/balance-sheet' },
      { label: 'Laba Rugi', path: '/reports/income-statement' },
      { label: 'Arus Kas', path: '/reports/cash-flow' },
      { label: 'Daftar Aset Tetap', path: '/reports/assets-list' },
      { label: 'Penyusutan per Periode', path: '/reports/depreciation-period' },
      { label: 'Disposal Aset', path: '/reports/asset-disposals' },
      { label: 'Summary Aset per Kategori', path: '/reports/assets-summary' }
    ]
  },
  {
    label: 'Settings',
    icon: Settings,
    key: 'settings',
    minRole: 'admin',
    items: [
      { label: 'Users', path: '/settings/users' },
      { label: 'Audit Log', path: '/settings/audit-log' }
    ]
  }
]

export default function Sidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { canWrite, isAdmin, profile, signOut } = useAuth()
  const [collapsed, setCollapsed] = useState(false)

  const handleSignOut = async () => {
    await signOut()
  }

  // Filter groups by role
  const visibleGroups = menuGroups.filter(group => {
    if (!group.minRole) return true
    if (group.minRole === 'write') return canWrite
    if (group.minRole === 'admin') return isAdmin
    return true
  })

  // Build AntD menu items
  const menuItems = [
    {
      key: '/',
      icon: <LayoutDashboard size={16} />,
      label: <Link to="/">Dashboard</Link>,
    },
    ...visibleGroups.map(group => {
      const Icon = group.icon
      const visibleItems = group.items.filter(item => {
        if (!item.minRole) return true
        if (item.minRole === 'write') return canWrite
        if (item.minRole === 'admin') return isAdmin
        return true
      })
      if (visibleItems.length === 0) return null

      return {
        key: group.key,
        icon: <Icon size={16} />,
        label: group.label,
        children: visibleItems.map(item => ({
          key: item.path,
          label: <Link to={item.path}>{item.label}</Link>,
        })),
      }
    }).filter(Boolean),
  ]

  // Determine selected key and open keys
  const selectedKey = location.pathname
  const openKeys = visibleGroups
    .filter(group =>
      group.items.some(item => location.pathname === item.path || location.pathname.startsWith(item.path + '/'))
    )
    .map(group => group.key)

  return (
    <Sider
      collapsible
      collapsed={collapsed}
      onCollapse={setCollapsed}
      theme="light"
      width={240}
      style={{ borderRight: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column' }}
    >
      {/* Brand */}
      <div style={{ padding: collapsed ? '16px 8px' : '16px 20px', borderBottom: '1px solid #f0f0f0' }}>
        {!collapsed && (
          <Text strong style={{ fontSize: 16, color: '#1f2937' }}>ERP Pembukuan</Text>
        )}
        {collapsed && (
          <Text strong style={{ fontSize: 14, color: '#1f2937' }}>ERP</Text>
        )}
      </div>

      {/* Navigation */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          defaultOpenKeys={openKeys}
          items={menuItems}
          style={{ border: 'none' }}
        />
      </div>

      {/* User info + logout */}
      <div style={{ borderTop: '1px solid #f0f0f0', padding: collapsed ? '12px 8px' : '12px 16px' }}>
        {!collapsed && (
          <div style={{ marginBottom: 8 }}>
            <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
              {profile?.full_name || 'User'}
            </Text>
          </div>
        )}
        <Button
          type="text"
          danger
          icon={<LogOut size={16} />}
          onClick={handleSignOut}
          style={{ width: '100%', textAlign: collapsed ? 'center' : 'left' }}
        >
          {!collapsed && 'Keluar'}
        </Button>
      </div>
    </Sider>
  )
}
