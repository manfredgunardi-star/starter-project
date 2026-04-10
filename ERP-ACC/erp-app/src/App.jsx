import { Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ToastProvider } from './components/ui/ToastContext'
import LoginPage from './pages/LoginPage'
import AppLayout from './components/layout/AppLayout'
import ProtectedRoute from './components/layout/ProtectedRoute'
import UnitsPage from './pages/master/UnitsPage'
import ProductsPage from './pages/master/ProductsPage'
import CustomersPage from './pages/master/CustomersPage'
import SuppliersPage from './pages/master/SuppliersPage'
import COAPage from './pages/master/COAPage'

// Placeholder component for pages under development
function Page({ title }) {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
      <p className="text-gray-600">Halaman ini sedang dalam pengembangan...</p>
    </div>
  )
}

function AppContent() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600">Memuat...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <LoginPage />
  }

  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen"><p className="text-gray-600">Memuat...</p></div>}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          {/* Master Data routes */}
          <Route path="master/units" element={<UnitsPage />} />
          <Route path="master/products" element={<ProductsPage />} />
          <Route path="master/customers" element={<CustomersPage />} />
          <Route path="master/suppliers" element={<SuppliersPage />} />
          <Route path="master/coa" element={<COAPage />} />

          {/* Inventory routes */}
          <Route path="inventory/stock" element={<Page title="Stok" />} />
          <Route path="inventory/stock-card" element={<Page title="Kartu Stok" />} />

          {/* Sales routes */}
          <Route path="sales/orders" element={<Page title="Sales Order" />} />
          <Route path="sales/deliveries" element={<Page title="Pengiriman" />} />
          <Route path="sales/invoices" element={<Page title="Invoice Penjualan" />} />

          {/* Purchase routes */}
          <Route path="purchase/orders" element={<Page title="Purchase Order" />} />
          <Route path="purchase/receipts" element={<Page title="Penerimaan Barang" />} />
          <Route path="purchase/invoices" element={<Page title="Invoice Pembelian" />} />

          {/* Cash & Bank routes */}
          <Route path="cash/accounts" element={<Page title="Akun Kas/Bank" />} />
          <Route path="cash/payments" element={<Page title="Pembayaran" />} />
          <Route path="cash/transfers" element={<Page title="Transfer" />} />
          <Route path="cash/reconciliation" element={<Page title="Rekonsiliasi Bank" />} />

          {/* Accounting routes */}
          <Route path="accounting/journals" element={<Page title="Jurnal" />} />
          <Route path="accounting/ledger" element={<Page title="Buku Besar" />} />

          {/* Reports routes */}
          <Route path="reports/balance-sheet" element={<Page title="Neraca" />} />
          <Route path="reports/income-statement" element={<Page title="Laba Rugi" />} />
          <Route path="reports/cash-flow" element={<Page title="Arus Kas" />} />

          {/* Settings routes */}
          <Route path="settings/users" element={<Page title="Manajemen Users" />} />

          {/* Default route */}
          <Route path="/" element={<Page title="Dashboard" />} />
        </Route>
      </Routes>
    </Suspense>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppContent />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
