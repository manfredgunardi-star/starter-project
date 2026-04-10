import { Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ToastProvider } from './components/ui/ToastContext'
import LoginPage from './pages/LoginPage'
import AppLayout from './components/layout/AppLayout'
import ProtectedRoute from './components/layout/ProtectedRoute'

// Master Data
import UnitsPage from './pages/master/UnitsPage'
import ProductsPage from './pages/master/ProductsPage'
import CustomersPage from './pages/master/CustomersPage'
import SuppliersPage from './pages/master/SuppliersPage'
import COAPage from './pages/master/COAPage'

// Inventory
import StockPage from './pages/inventory/StockPage'
import StockCardPage from './pages/inventory/StockCardPage'

// Sales
import SalesOrdersPage from './pages/sales/SalesOrdersPage'
import SalesOrderFormPage from './pages/sales/SalesOrderFormPage'
import GoodsDeliveriesPage from './pages/sales/GoodsDeliveriesPage'
import GoodsDeliveryFormPage from './pages/sales/GoodsDeliveryFormPage'
import SalesInvoicesPage from './pages/sales/SalesInvoicesPage'
import SalesInvoiceFormPage from './pages/sales/SalesInvoiceFormPage'

// Cash & Bank
import CashBankAccountsPage from './pages/cash/AccountsPage'
import PaymentsPage from './pages/cash/PaymentsPage'
import PaymentFormPage from './pages/cash/PaymentFormPage'

// Placeholder for pages not yet implemented
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
          {/* Master Data */}
          <Route path="master/units" element={<UnitsPage />} />
          <Route path="master/products" element={<ProductsPage />} />
          <Route path="master/customers" element={<CustomersPage />} />
          <Route path="master/suppliers" element={<SuppliersPage />} />
          <Route path="master/coa" element={<COAPage />} />

          {/* Inventory */}
          <Route path="inventory/stock" element={<StockPage />} />
          <Route path="inventory/stock-card" element={<StockCardPage />} />

          {/* Sales */}
          <Route path="sales/orders" element={<SalesOrdersPage />} />
          <Route path="sales/orders/new" element={<SalesOrderFormPage />} />
          <Route path="sales/orders/:id" element={<SalesOrderFormPage />} />
          <Route path="sales/deliveries" element={<GoodsDeliveriesPage />} />
          <Route path="sales/deliveries/new" element={<GoodsDeliveryFormPage />} />
          <Route path="sales/deliveries/:id" element={<GoodsDeliveryFormPage />} />
          <Route path="sales/invoices" element={<SalesInvoicesPage />} />
          <Route path="sales/invoices/new" element={<SalesInvoiceFormPage />} />
          <Route path="sales/invoices/:id" element={<SalesInvoiceFormPage />} />

          {/* Purchase (coming soon) */}
          <Route path="purchase/orders" element={<Page title="Purchase Order" />} />
          <Route path="purchase/receipts" element={<Page title="Penerimaan Barang" />} />
          <Route path="purchase/invoices" element={<Page title="Invoice Pembelian" />} />

          {/* Cash & Bank */}
          <Route path="cash/accounts" element={<CashBankAccountsPage />} />
          <Route path="cash/payments" element={<PaymentsPage />} />
          <Route path="cash/payments/new" element={<PaymentFormPage />} />
          <Route path="cash/transfers" element={<Page title="Transfer" />} />
          <Route path="cash/reconciliation" element={<Page title="Rekonsiliasi Bank" />} />

          {/* Accounting (coming soon) */}
          <Route path="accounting/journals" element={<Page title="Jurnal" />} />
          <Route path="accounting/ledger" element={<Page title="Buku Besar" />} />

          {/* Reports (coming soon) */}
          <Route path="reports/balance-sheet" element={<Page title="Neraca" />} />
          <Route path="reports/income-statement" element={<Page title="Laba Rugi" />} />
          <Route path="reports/cash-flow" element={<Page title="Arus Kas" />} />

          {/* Settings (coming soon) */}
          <Route path="settings/users" element={<Page title="Manajemen Users" />} />

          {/* Default */}
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
