import { useState } from 'react'
import { useLocation, Link } from 'react-router-dom'
import {
  ChevronDown,
  LayoutDashboard,
  Database,
  Package,
  ShoppingCart,
  Truck,
  DollarSign,
  BookOpen,
  BarChart3,
  Settings,
  Building2
} from 'lucide-react'

const menuGroups = [
  {
    label: 'Master Data',
    icon: Database,
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
    items: [
      { label: 'Stok', path: '/inventory/stock' },
      { label: 'Kartu Stok', path: '/inventory/stock-card' }
    ]
  },
  {
    label: 'Penjualan',
    icon: ShoppingCart,
    items: [
      { label: 'Sales Order', path: '/sales/orders' },
      { label: 'Pengiriman', path: '/sales/deliveries' },
      { label: 'Invoice Penjualan', path: '/sales/invoices' }
    ]
  },
  {
    label: 'Pembelian',
    icon: Truck,
    items: [
      { label: 'Purchase Order', path: '/purchase/orders' },
      { label: 'Penerimaan', path: '/purchase/receipts' },
      { label: 'Invoice Pembelian', path: '/purchase/invoices' }
    ]
  },
  {
    label: 'Kas & Bank',
    icon: DollarSign,
    items: [
      { label: 'Akun', path: '/cash/accounts' },
      { label: 'Pembayaran', path: '/cash/payments' },
      { label: 'Transfer', path: '/cash/transfers/new' },
      { label: 'Rekonsiliasi', path: '/cash/reconciliation' }
    ]
  },
  {
    label: 'Pembukuan',
    icon: BookOpen,
    items: [
      { label: 'Jurnal', path: '/accounting/journals' },
      { label: 'Buku Besar', path: '/accounting/ledger' }
    ]
  },
  {
    label: 'Aset Tetap',
    icon: Building2,
    items: [
      { label: 'Daftar Aset', path: '/assets' },
      { label: 'Kategori Aset', path: '/assets/categories' },
      { label: 'Post Penyusutan', path: '/assets/depreciation' },
      { label: 'Import Aset', path: '/assets/bulk-import' }
    ]
  },
  {
    label: 'Laporan',
    icon: BarChart3,
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
    items: [
      { label: 'Users', path: '/settings/users' },
      { label: 'Audit Log', path: '/settings/audit-log' }
    ]
  }
]

function DashboardLink() {
  const location = useLocation()
  const isActive = location.pathname === '/'
  return (
    <div className="mb-2">
      <Link
        to="/"
        className={`w-full flex items-center gap-2 px-4 py-2 rounded text-sm font-medium transition ${
          isActive ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'
        }`}
      >
        <LayoutDashboard size={18} />
        <span>Dashboard</span>
      </Link>
    </div>
  )
}

function MenuGroup({ group }) {
  const [isOpen, setIsOpen] = useState(true)
  const location = useLocation()
  const Icon = group.icon

  const isGroupActive = group.items.some(item => location.pathname === item.path)

  return (
    <div className="mb-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center gap-2 px-4 py-2 rounded text-sm font-medium transition ${
          isGroupActive
            ? 'bg-blue-100 text-blue-900'
            : 'text-gray-700 hover:bg-gray-100'
        }`}
      >
        <Icon size={18} />
        <span className="flex-1 text-left">{group.label}</span>
        <ChevronDown
          size={16}
          className={`transition transform ${isOpen ? '' : '-rotate-90'}`}
        />
      </button>

      {isOpen && (
        <div className="ml-4 mt-1 space-y-1">
          {group.items.map(item => {
            const isActive = location.pathname === item.path
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`block px-4 py-2 rounded text-sm transition ${
                  isActive
                    ? 'bg-blue-600 text-white font-medium'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function Sidebar() {
  return (
    <div className="w-64 bg-white border-r border-gray-200 flex flex-col h-screen">
      <div className="p-6 border-b border-gray-200">
        <h1 className="text-xl font-bold text-gray-900">ERP Pembukuan</h1>
      </div>

      <nav className="flex-1 overflow-y-auto p-4">
        <DashboardLink />
        {menuGroups.map(group => (
          <MenuGroup key={group.label} group={group} />
        ))}
      </nav>
    </div>
  )
}
