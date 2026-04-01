import React, { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { subscribePendingQueue } from './utils/integrationUtils'

// Pages
import JurnalPage       from './pages/JurnalPage'
import KasBankPage      from './pages/KasBankPage'
import PenjualanPage    from './pages/PenjualanPage'
import BiayaPage        from './pages/BiayaPage'
import LaporanPage      from './pages/LaporanPage'
import ArmadaPage       from './pages/ArmadaPage'
import PelangganPage    from './pages/PelangganPage'
import SupplierPage     from './pages/SupplierPage'
import AsetPage         from './pages/AsetPage'
import COAPage          from './pages/COAPage'
import PengaturanPage   from './pages/PengaturanPage'
import IntegrationReviewPage from './pages/IntegrationReviewPage'

// Icons
import {
  LayoutDashboard, Wallet, ShoppingCart, Receipt, BarChart3,
  Truck, Users, Package, Building2, BookOpen, Settings,
  LogOut, Menu, X, Send, AlertCircle, RefreshCw,
} from 'lucide-react'

// ─── Navigation config ─────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { path: '/jurnal',     label: 'Jurnal Umum',       icon: LayoutDashboard },
  { path: '/kas-bank',   label: 'Kas & Bank',         icon: Wallet },
  { path: '/penjualan',  label: 'Penjualan',          icon: ShoppingCart },
  { path: '/biaya',      label: 'Biaya',              icon: Receipt },
  { path: '/laporan',    label: 'Laporan',            icon: BarChart3 },
  { path: '/armada',     label: 'Armada',             icon: Truck },
  { path: '/pelanggan',  label: 'Pelanggan',          icon: Users },
  { path: '/supplier',   label: 'Supplier',           icon: Package },
  { path: '/aset',       label: 'Aset Tetap',         icon: Building2 },
  { path: '/coa',        label: 'Chart of Accounts',  icon: BookOpen },
  { path: '/integrasi',  label: 'Review Integrasi',   icon: Send, badge: true },
  { path: '/pengaturan', label: 'Pengaturan',         icon: Settings },
]

// ─── Login Page ────────────────────────────────────────────────────────────────
function LoginPage() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
    } catch (err) {
      setError('Email atau password salah')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 to-orange-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-600 rounded-2xl mb-4">
            <LayoutDashboard className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">BUL Accounting</h1>
          <p className="text-gray-500 text-sm mt-1">Sistem Akuntansi Jasa Pengiriman</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="input-field"
              placeholder="email@perusahaan.com"
              required
              autoFocus
            />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="input-field"
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full flex items-center justify-center gap-2 py-2.5"
          >
            {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
            {loading ? 'Masuk...' : 'Masuk'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const { currentUser, loading, logout, userName, userRole } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [pendingCount, setPendingCount] = useState(0)

  // Subscribe ke pending integration queue untuk badge
  useEffect(() => {
    if (!currentUser) return
    const unsub = subscribePendingQueue((items) => setPendingCount(items.length))
    return unsub
  }, [currentUser])

  // Loading state (auth check)
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <RefreshCw className="w-7 h-7 animate-spin text-brand-500" />
      </div>
    )
  }

  // Not authenticated → login
  if (!currentUser) return <LoginPage />

  const handleLogout = async () => {
    await logout()
  }

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/')

  return (
    <div className="h-screen bg-gray-50 flex overflow-hidden">
      {/* ── Sidebar ── */}
      <aside
        className={`${
          sidebarOpen ? 'w-60' : 'w-16'
        } bg-white border-r border-gray-100 flex flex-col transition-all duration-200 shrink-0 h-screen`}
      >
        {/* Sidebar header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-gray-100 shrink-0">
          {sidebarOpen && (
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center shrink-0">
                <LayoutDashboard className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-gray-800 text-sm truncate">BUL Accounting</span>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 shrink-0"
          >
            {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto py-3 space-y-0.5 px-2">
          {NAV_ITEMS.map(({ path, label, icon: Icon, badge }) => {
            const active = isActive(path)
            return (
              <button
                key={path}
                onClick={() => navigate(path)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left relative ${
                  active
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-brand-600' : ''}`} />
                {sidebarOpen && <span className="truncate">{label}</span>}
                {/* Badge pending integrasi */}
                {badge && pendingCount > 0 && (
                  <span className={`${
                    sidebarOpen ? 'ml-auto' : 'absolute -top-1 -right-1'
                  } bg-red-500 text-white text-xs rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 font-semibold`}>
                    {pendingCount > 99 ? '99+' : pendingCount}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        {/* User info + logout */}
        <div className="border-t border-gray-100 p-3 shrink-0">
          {sidebarOpen ? (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-brand-100 rounded-full flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-brand-700">
                  {userName?.charAt(0)?.toUpperCase() || 'U'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-800 truncate">{userName}</p>
                <p className="text-xs text-gray-400 capitalize">{userRole}</p>
              </div>
              <button
                onClick={handleLogout}
                title="Keluar"
                className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-red-500 shrink-0"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={handleLogout}
              title="Keluar"
              className="w-full flex justify-center p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-red-500"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-6">
          <Routes>
            <Route path="/" element={<Navigate to="/jurnal" replace />} />
            <Route path="/jurnal"     element={<JurnalPage />} />
            <Route path="/kas-bank"   element={<KasBankPage />} />
            <Route path="/penjualan"  element={<PenjualanPage />} />
            <Route path="/biaya"      element={<BiayaPage />} />
            <Route path="/laporan"    element={<LaporanPage />} />
            <Route path="/armada"     element={<ArmadaPage />} />
            <Route path="/pelanggan"  element={<PelangganPage />} />
            <Route path="/supplier"   element={<SupplierPage />} />
            <Route path="/aset"       element={<AsetPage />} />
            <Route path="/coa"        element={<COAPage />} />
            <Route path="/integrasi"  element={<IntegrationReviewPage />} />
            <Route path="/pengaturan" element={<PengaturanPage />} />
            <Route path="*"           element={<Navigate to="/jurnal" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}
