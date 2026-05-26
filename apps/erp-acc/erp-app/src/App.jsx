import { Suspense, lazy } from 'react'
import { Spin } from 'antd'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ToastProvider } from './components/ui/ToastContext'
import LoginPage from './pages/LoginPage'
import AppLayout from './components/layout/AppLayout'
import ProtectedRoute from './components/layout/ProtectedRoute'
import RoleGuard from './components/layout/RoleGuard'

// Master Data
const UnitsPage = lazy(() => import('./pages/master/UnitsPage'))
const ProductCategoriesPage = lazy(() => import('./pages/master/ProductCategoriesPage'))
const PaymentTermsPage = lazy(() => import('./pages/master/PaymentTermsPage'))
const TaxCodesPage = lazy(() => import('./pages/master/TaxCodesPage'))
const WarehousesPage = lazy(() => import('./pages/master/WarehousesPage'))
const ProductsPage = lazy(() => import('./pages/master/ProductsPage'))
const CustomersPage = lazy(() => import('./pages/master/CustomersPage'))
const SuppliersPage = lazy(() => import('./pages/master/SuppliersPage'))
const COAPage = lazy(() => import('./pages/master/COAPage'))
const ProductsBulkImportPage = lazy(() => import('./pages/master/ProductsBulkImportPage'))
const CustomersBulkImportPage = lazy(() => import('./pages/master/CustomersBulkImportPage'))
const SuppliersBulkImportPage = lazy(() => import('./pages/master/SuppliersBulkImportPage'))

// Inventory
const StockPage = lazy(() => import('./pages/inventory/StockPage'))
const StockCardPage = lazy(() => import('./pages/inventory/StockCardPage'))

// Sales
const SalesOrdersPage = lazy(() => import('./pages/sales/SalesOrdersPage'))
const SalesOrderFormPage = lazy(() => import('./pages/sales/SalesOrderFormPage'))
const GoodsDeliveriesPage = lazy(() => import('./pages/sales/GoodsDeliveriesPage'))
const GoodsDeliveryFormPage = lazy(() => import('./pages/sales/GoodsDeliveryFormPage'))
const SalesInvoicesPage = lazy(() => import('./pages/sales/SalesInvoicesPage'))
const SalesInvoiceFormPage = lazy(() => import('./pages/sales/SalesInvoiceFormPage'))

// Purchase
const PurchaseOrdersPage = lazy(() => import('./pages/purchase/PurchaseOrdersPage'))
const PurchaseOrderFormPage = lazy(() => import('./pages/purchase/PurchaseOrderFormPage'))
const GoodsReceiptsPage = lazy(() => import('./pages/purchase/GoodsReceiptsPage'))
const GoodsReceiptFormPage = lazy(() => import('./pages/purchase/GoodsReceiptFormPage'))
const PurchaseInvoicesPage = lazy(() => import('./pages/purchase/PurchaseInvoicesPage'))
const PurchaseInvoiceFormPage = lazy(() => import('./pages/purchase/PurchaseInvoiceFormPage'))

// Cash & Bank
const CashBankAccountsPage = lazy(() => import('./pages/cash/AccountsPage'))
const PaymentsPage = lazy(() => import('./pages/cash/PaymentsPage'))
const PaymentFormPage = lazy(() => import('./pages/cash/PaymentFormPage'))
const TransferFormPage = lazy(() => import('./pages/cash/TransferFormPage'))
const ReconciliationPage = lazy(() => import('./pages/cash/ReconciliationPage'))

// Accounting
const JournalsPage = lazy(() => import('./pages/accounting/JournalsPage'))
const ManualJournalFormPage = lazy(() => import('./pages/accounting/ManualJournalFormPage'))
const LedgerPage = lazy(() => import('./pages/accounting/LedgerPage'))
const RecurringPage = lazy(() => import('./pages/accounting/RecurringPage'))
const RecurringFormPage = lazy(() => import('./pages/accounting/RecurringFormPage'))

// Reports
const BalanceSheetPage = lazy(() => import('./pages/reports/BalanceSheetPage'))
const IncomeStatementPage = lazy(() => import('./pages/reports/IncomeStatementPage'))
const CashFlowPage = lazy(() => import('./pages/reports/CashFlowPage'))
const ARAPAgingPage = lazy(() => import('./pages/reports/ARAPAgingPage'))

// Dashboard
const DashboardPage = lazy(() => import('./pages/DashboardPage'))

// Fixed Assets
const AssetsPage = lazy(() => import('./pages/assets/AssetsPage'))
const AssetCategoriesPage = lazy(() => import('./pages/assets/AssetCategoriesPage'))
const AssetFormPage = lazy(() => import('./pages/assets/AssetFormPage'))
const AssetDetailPage = lazy(() => import('./pages/assets/AssetDetailPage'))
const DepreciationRunPage = lazy(() => import('./pages/assets/DepreciationRunPage'))
const AssetDisposalFormPage = lazy(() => import('./pages/assets/AssetDisposalFormPage'))
const AssetBulkImportPage = lazy(() => import('./pages/assets/AssetBulkImportPage'))

// Fixed Assets Reports
const AssetsListReportPage = lazy(() => import('./pages/reports/AssetsListReportPage'))
const DepreciationPeriodReportPage = lazy(() => import('./pages/reports/DepreciationPeriodReportPage'))
const AssetDisposalsReportPage = lazy(() => import('./pages/reports/AssetDisposalsReportPage'))
const AssetsSummaryReportPage = lazy(() => import('./pages/reports/AssetsSummaryReportPage'))

// Settings
const AuditLogPage = lazy(() => import('./pages/settings/AuditLogPage'))
const UsersPage = lazy(() => import('./pages/settings/UsersPage'))
const CompanySettingsPage = lazy(() => import('./pages/settings/CompanySettingsPage'))
const ClosingPeriodPage = lazy(() => import('./pages/settings/ClosingPeriodPage'))


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
          <Route path="master/categories" element={<ProductCategoriesPage />} />
          <Route path="master/payment-terms" element={<PaymentTermsPage />} />
          <Route path="master/tax-codes" element={<TaxCodesPage />} />
          <Route path="master/warehouses" element={<WarehousesPage />} />
          <Route path="master/products" element={<ProductsPage />} />
          <Route path="master/products/import" element={<RoleGuard require="canWrite"><ProductsBulkImportPage /></RoleGuard>} />
          <Route path="master/customers" element={<CustomersPage />} />
          <Route path="master/customers/import" element={<RoleGuard require="canWrite"><CustomersBulkImportPage /></RoleGuard>} />
          <Route path="master/suppliers" element={<SuppliersPage />} />
          <Route path="master/suppliers/import" element={<RoleGuard require="canWrite"><SuppliersBulkImportPage /></RoleGuard>} />
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
          <Route path="accounting/recurring" element={<RecurringPage />} />
          <Route path="accounting/recurring/new" element={<RoleGuard require="canWrite"><RecurringFormPage /></RoleGuard>} />
          <Route path="accounting/recurring/:id" element={<RoleGuard require="canWrite"><RecurringFormPage /></RoleGuard>} />

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
