import { Routes, Route, Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import { useAuth } from './auth/AuthProvider.jsx';
import LoginPage from './auth/LoginPage.jsx';
import BelumAktifPage from './auth/BelumAktifPage.jsx';
import AppLayout from './layout/AppLayout.jsx';
import MasterPage from './halaman/master/MasterPage.jsx';
import PenggunaPage from './halaman/PenggunaPage.jsx';
import SuratJalanPage from './halaman/sj/SuratJalanPage.jsx';
import InvoicePage from './halaman/invoice/InvoicePage.jsx';
import InvoiceBaruPage from './halaman/invoice/InvoiceBaruPage.jsx';
import InvoiceDetailPage from './halaman/invoice/InvoiceDetailPage.jsx';
import Kwitansi from './halaman/invoice/Kwitansi.jsx';
import PembayaranPage from './halaman/pembayaran/PembayaranPage.jsx';
import KasPage from './halaman/kas/KasPage.jsx';
import BonusPage from './halaman/bonus/BonusPage.jsx';
import ImporPage from './halaman/impor/ImporPage.jsx';
import AkunPage from './halaman/akuntansi/AkunPage.jsx';
import PengaturanPage from './halaman/akuntansi/PengaturanPage.jsx';
import JurnalPage from './halaman/akuntansi/JurnalPage.jsx';
import BukuBesarPage from './halaman/akuntansi/BukuBesarPage.jsx';
import SaldoAwalPage from './halaman/akuntansi/SaldoAwalPage.jsx';
import Beranda from './halaman/Beranda.jsx';
import LaporanPage from './halaman/laporan/LaporanPage.jsx';

export const ROUTE = [
  { path: '/', element: <Beranda /> },
  { path: '/master/:entitas', element: <MasterPage /> },
  { path: '/pengguna', element: <PenggunaPage /> },
  { path: '/sj', element: <SuratJalanPage /> },
  { path: '/invoice', element: <InvoicePage /> },
  { path: '/invoice/baru', element: <InvoiceBaruPage /> },
  { path: '/invoice/:id', element: <InvoiceDetailPage /> },
  { path: '/invoice/:id/cetak', element: <Kwitansi /> },
  { path: '/pembayaran', element: <PembayaranPage /> },
  { path: '/kas', element: <KasPage /> },
  { path: '/bonus', element: <BonusPage /> },
  { path: '/akun', element: <AkunPage /> },
  { path: '/pengaturan', element: <PengaturanPage /> },
  { path: '/jurnal', element: <JurnalPage /> },
  { path: '/buku-besar', element: <BukuBesarPage /> },
  { path: '/saldo-awal', element: <SaldoAwalPage /> },
  { path: '/impor', element: <ImporPage /> },
  { path: '/laporan', element: <LaporanPage /> },
  { path: '/laporan/:kunci', element: <LaporanPage /> },
];

export default function AppRoot() {
  const { session, peran, loading } = useAuth();
  if (loading) return <Spin fullscreen />;
  if (!session) return <LoginPage />;
  if (!peran) return <BelumAktifPage />;
  return <Routes><Route element={<AppLayout />}>{ROUTE.map((r) => <Route key={r.path} path={r.path} element={r.element} />)}<Route path="*" element={<Navigate to="/" replace />} /></Route></Routes>;
}
