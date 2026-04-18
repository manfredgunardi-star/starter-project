import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell.jsx';
import { AccountingPage } from '../features/accounting/AccountingPage.jsx';
import { COAPage } from '../features/accounting/COAPage.jsx';
import { LoginPage } from '../features/auth/LoginPage.jsx';
import { CompanyPage } from '../features/company/CompanyPage.jsx';
import { DashboardPage } from '../features/dashboard/DashboardPage.jsx';
import { KasBankPage } from '../features/kas-bank/KasBankPage.jsx';
import { CostCenterPage } from '../features/master-data/CostCenterPage.jsx';
import { KategoriProdukPage } from '../features/master-data/KategoriProdukPage.jsx';
import { MasterDataPage } from '../features/master-data/MasterDataPage.jsx';
import { PelangganPage } from '../features/master-data/PelangganPage.jsx';
import { ProdukPage } from '../features/master-data/ProdukPage.jsx';
import { SatuanPage } from '../features/master-data/SatuanPage.jsx';
import { SupplierPage } from '../features/master-data/SupplierPage.jsx';
import { ReportsPage } from '../features/reports/ReportsPage.jsx';
import { BukuBesarPage } from '../features/reports/BukuBesarPage.jsx';
import { LabaRugiPage } from '../features/reports/LabaRugiPage.jsx';
import { NeracaPage } from '../features/reports/NeracaPage.jsx';
import { NeracaSaldoPage } from '../features/reports/NeracaSaldoPage.jsx';
import { SettingsPage } from '../features/settings/SettingsPage.jsx';
import { UsersPage } from '../features/settings/UsersPage.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { useCompany } from '../hooks/useCompany.js';

function NoCompanyAccessPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ios-background px-4 text-ios-label">
      <section className="w-full max-w-lg rounded-3xl border border-ios-separator bg-white p-6 text-center shadow-ios">
        <h1 className="text-2xl font-semibold">Belum ada akses company</h1>
        <p className="mt-2 text-sm leading-6 text-ios-secondary">
          Akun Anda sudah login, tetapi belum terdaftar sebagai member aktif di company mana pun.
        </p>
      </section>
    </main>
  );
}

export function AppRoutes() {
  const { isAuthenticated, loading } = useAuth();
  const { activeCompany, loading: companyLoading } = useCompany();

  if (loading || companyLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ios-background px-4 text-sm font-medium text-ios-secondary">
        Memuat sesi pengguna...
      </main>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  if (!activeCompany) {
    return <NoCompanyAccessPage />;
  }

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="master-data" element={<MasterDataPage />} />
        <Route path="master-data/pelanggan" element={<PelangganPage />} />
        <Route path="master-data/produk" element={<ProdukPage />} />
        <Route path="master-data/satuan" element={<SatuanPage />} />
        <Route path="master-data/kategori-produk" element={<KategoriProdukPage />} />
        <Route path="master-data/cost-center" element={<CostCenterPage />} />
        <Route path="master-data/supplier" element={<SupplierPage />} />
        <Route path="accounting" element={<AccountingPage />} />
        <Route path="accounting/coa" element={<COAPage />} />
        <Route path="kas-bank" element={<KasBankPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="reports/buku-besar" element={<BukuBesarPage />} />
        <Route path="reports/neraca-saldo" element={<NeracaSaldoPage />} />
        <Route path="reports/laba-rugi" element={<LabaRugiPage />} />
        <Route path="reports/neraca" element={<NeracaPage />} />
        <Route path="company" element={<CompanyPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="settings/users" element={<UsersPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
