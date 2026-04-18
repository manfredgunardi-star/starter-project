import { Suspense } from 'react'
import { Spin } from 'antd'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ToastProvider } from './components/ui/ToastContext'
import LoginPage from './pages/LoginPage'
import AppLayout from './components/layout/AppLayout'
import ProtectedRoute from './components/layout/ProtectedRoute'
import RoleGuard from './components/layout/RoleGuard'

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
import ARAPAgingPage from './pages/reports/ARAPAgingPage'

// Dashboard
import DashboardPage from './pages/DashboardPage'

// Fixed Assets
import AssetsPage from './pages/assets/AssetsPage'
import AssetCategoriesPage from './pages/assets/AssetCategoriesPage'
import AssetFormPage from './pages/assets/AssetFormPage'
import AssetDetailPage from './pages/assets/AssetDetailPage'
import DepreciationRunPage from './pages/assets/DepreciationRunPage'
import AssetDisposalFormPage from './pages/assets/AssetDisposalFormPage'
import AssetBulkImportPage from './pages/assets/AssetBulkImportPage'

// Fixed Assets Reports
import AssetsListReportPage from './pages/reports/AssetsListReportPage'
import DepreciationPeriodReportPage from './pages/reports/DepreciationPeriodReportPage'
import AssetDisposalsReportPage from './pages/reports/AssetDisposalsReportPage'
import AssetsSummaryReportPage from './pages/reports/AssetsSummaryReportPage'

// Settings
import AuditLogPage from './pages/settings/AuditLogPage'
import UsersPage from './pages/settings/UsersPage'
import CompanySettingsPage from './pages/settings/CompanySettingsPage'
import ClosingPeriodPage from './pages/settings/ClosingPeriodPage'


function AppContent() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <Spin size="large" description="Memuat..." />
      </div>
    )
  }

  if (!user) {
    return <LoginPage />
  }

  return (
    <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}><Spin size="large" description="Memuat..." /></div>}>
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
          <Route path="sales/orders/new" element={<RoleGuard require="canWrite"><SalesOrderFormPage /></RoleGuard>} />
          <Route path="sales/orders/:id" element={<SalesOrderFormPage />} />
          <Route path="sales/deliveries" element={<GoodsDeliveriesPage />} />
          <Route path="sales/deliveries/new" element={<RoleGuard require="canWrite"><GoodsDeliveryFormPage /></RoleGuard>} />
          <Route path="sales/deliveries/:id" element={<GoodsDeliveryFormPage />} />
          <Route path="sales/invoices" element={<SalesInvoicesPage />} />
          <Route path="sales/invoices/new" element={<RoleGuard require="canWrite"><SalesInvoiceFormPage /></RoleGuard>} />
          <Route path="sales/invoices/:id" element={<SalesInvoiceFormPage />} />

          {/* Purchase */}
          <Route path="purchase/orders" element={<PurchaseOrdersPage />} />
          <Route path="purchase/orders/new" element={<RoleGuard require="canWrite"><PurchaseOrderFormPage /></RoleGuard>} />
          <Route path="purchase/orders/:id" element={<PurchaseOrderFormPage />} />
          <Route path="purchase/receipts" element={<GoodsReceiptsPage />} />
          <Route path="purchase/receipts/new" element={<RoleGuard require="canWrite"><GoodsReceiptFormPage /></RoleGuard>} />
          <Route path="purchase/receipts/:id" element={<GoodsReceiptFormPage />} />
          <Route path="purchase/invoices" element={<PurchaseInvoicesPage />} />
          <Route path="purchase/invoices/new" element={<RoleGuard require="canWrite"><PurchaseInvoiceFormPage /></RoleGuard>} />
          <Route path="purchase/invoices/:id" element={<PurchaseInvoiceFormPage />} />

          {/* Cash & Bank */}
          <Route path="cash/accounts" element={<CashBankAccountsPage />} />
          <Route path="cash/payments" element={<PaymentsPage />} />
          <Route path="cash/payments/new" element={<RoleGuard require="canWrite"><PaymentFormPage /></RoleGuard>} />
          <Route path="cash/transfers/new" element={<RoleGuard require="canWrite"><TransferFormPage /></RoleGuard>} />
          <Route path="cash/reconciliation" element={<ReconciliationPage />} />

          {/* Accounting */}
          <Route path="accounting/journals" element={<JournalsPage />} />
          <Route path="accounting/journals/new" element={<RoleGuard require="canPost"><ManualJournalFormPage /></RoleGuard>} />
          <Route path="accounting/journals/:id" element={<ManualJournalFormPage />} />
          <Route path="accounting/ledger" element={<LedgerPage />} />

          {/* Reports */}
          <Route path="reports/balance-sheet" element={<BalanceSheetPage />} />
          <Route path="reports/income-statement" element={<IncomeStatementPage />} />
          <Route path="reports/cash-flow" element={<CashFlowPage />} />
          <Route path="reports/ar-ap-aging" element={<ARAPAgingPage />} />
          <Route path="reports/assets-list" element={<AssetsListReportPage />} />
          <Route path="reports/depreciation-period" element={<DepreciationPeriodReportPage />} />
          <Route path="reports/asset-disposals" element={<AssetDisposalsReportPage />} />
          <Route path="reports/assets-summary" element={<AssetsSummaryReportPage />} />

          {/* Fixed Assets */}
          <Route path="assets" element={<AssetsPage />} />
          <Route path="assets/categories" element={<AssetCategoriesPage />} />
          <Route path="assets/new" element={<RoleGuard require="canWrite"><AssetFormPage /></RoleGuard>} />
          <Route path="assets/bulk-import" element={<RoleGuard require="canWrite"><AssetBulkImportPage /></RoleGuard>} />
          <Route path="assets/depreciation" element={<RoleGuard require="isAdmin"><DepreciationRunPage /></RoleGuard>} />
          <Route path="assets/:id" element={<AssetDetailPage />} />
          <Route path="assets/:id/edit" element={<RoleGuard require="canWrite"><AssetFormPage /></RoleGuard>} />
          <Route path="assets/:id/dispose" element={<RoleGuard require="isAdmin"><AssetDisposalFormPage /></RoleGuard>} />

          {/* Settings */}
          <Route path="settings/company" element={<RoleGuard require="canWrite"><CompanySettingsPage /></RoleGuard>} />
          <Route path="settings/users" element={<RoleGuard require="isAdmin"><UsersPage /></RoleGuard>} />
          <Route path="settings/audit-log" element={<RoleGuard require="isAdmin"><AuditLogPage /></RoleGuard>} />
          <Route path="settings/closing-period" element={<RoleGuard require="canPost"><ClosingPeriodPage /></RoleGuard>} />

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
          <div id="invoice-print-root" style={{ display: 'none' }} />
          <AppContent />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
