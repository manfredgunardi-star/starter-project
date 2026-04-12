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

// Purchase
import PurchaseOrdersPage from './pages/purchase/PurchaseOrdersPage'
import PurchaseOrderFormPage from './pages/purchase/PurchaseOrderFormPage'
import GoodsReceiptsPage from './pages/purchase/GoodsReceiptsPage'
import GoodsReceiptFormPage from './pages/purchase/GoodsReceiptFormPage'
import PurchaseInvoicesPage from './pages/purchase/PurchaseInvoicesPage'
import PurchaseInvoiceFormPage from './pages/purchase/PurchaseInvoiceFormPage'

// Cash & Bank
import CashBankAccountsPage from './pages/cash/AccountsPage'
import PaymentsPage from './pages/cash/PaymentsPage'
import PaymentFormPage from './pages/cash/PaymentFormPage'
import TransferFormPage from './pages/cash/TransferFormPage'
import ReconciliationPage from './pages/cash/ReconciliationPage'

// Accounting
import JournalsPage from './pages/accounting/JournalsPage'
import ManualJournalFormPage from './pages/accounting/ManualJournalFormPage'
import LedgerPage from './pages/accounting/LedgerPage'

// Reports
import BalanceSheetPage from './pages/reports/BalanceSheetPage'
import IncomeStatementPage from './pages/reports/IncomeStatementPage'
import CashFlowPage from './pages/reports/CashFlowPage'

// Dashboard
import DashboardPage from './pages/DashboardPage'

// Fixed Assets
import AssetsPage from './pages/assets/AssetsPage'
import AssetCategoriesPage from './pages/assets/AssetCategoriesPage'
import AssetFormPage from './pages/assets/AssetFormPage'

// Settings
import AuditLogPage from './pages/settings/AuditLogPage'
import UsersPage from './pages/settings/UsersPage'


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

          {/* Purchase */}
          <Route path="purchase/orders" element={<PurchaseOrdersPage />} />
          <Route path="purchase/orders/new" element={<PurchaseOrderFormPage />} />
          <Route path="purchase/orders/:id" element={<PurchaseOrderFormPage />} />
          <Route path="purchase/receipts" element={<GoodsReceiptsPage />} />
          <Route path="purchase/receipts/new" element={<GoodsReceiptFormPage />} />
          <Route path="purchase/receipts/:id" element={<GoodsReceiptFormPage />} />
          <Route path="purchase/invoices" element={<PurchaseInvoicesPage />} />
          <Route path="purchase/invoices/new" element={<PurchaseInvoiceFormPage />} />
          <Route path="purchase/invoices/:id" element={<PurchaseInvoiceFormPage />} />

          {/* Cash & Bank */}
          <Route path="cash/accounts" element={<CashBankAccountsPage />} />
          <Route path="cash/payments" element={<PaymentsPage />} />
          <Route path="cash/payments/new" element={<PaymentFormPage />} />
          <Route path="cash/transfers/new" element={<TransferFormPage />} />
          <Route path="cash/reconciliation" element={<ReconciliationPage />} />

          {/* Accounting */}
          <Route path="accounting/journals" element={<JournalsPage />} />
          <Route path="accounting/journals/new" element={<ManualJournalFormPage />} />
          <Route path="accounting/journals/:id" element={<ManualJournalFormPage />} />
          <Route path="accounting/ledger" element={<LedgerPage />} />

          {/* Reports */}
          <Route path="reports/balance-sheet" element={<BalanceSheetPage />} />
          <Route path="reports/income-statement" element={<IncomeStatementPage />} />
          <Route path="reports/cash-flow" element={<CashFlowPage />} />

          {/* Fixed Assets */}
          <Route path="assets" element={<AssetsPage />} />
          <Route path="assets/categories" element={<AssetCategoriesPage />} />
          <Route path="assets/new" element={<AssetFormPage />} />
          <Route path="assets/:id/edit" element={<AssetFormPage />} />

          {/* Settings */}
          <Route path="settings/users" element={<UsersPage />} />
          <Route path="settings/audit-log" element={<AuditLogPage />} />

          {/* Default */}
          <Route index element={<DashboardPage />} />
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
