import { Routes, Route, Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import { useAuth } from './auth/AuthProvider.jsx';
import LoginPage from './auth/LoginPage.jsx';
import BelumAktifPage from './auth/BelumAktifPage.jsx';
import AppLayout from './layout/AppLayout.jsx';
import MasterPage from './halaman/master/MasterPage.jsx';
import PenggunaPage from './halaman/PenggunaPage.jsx';

export const ROUTE = [
  { path: '/', element: <div>Beranda</div> },
  { path: '/master/:entitas', element: <MasterPage /> },
  { path: '/pengguna', element: <PenggunaPage /> },
];

export default function AppRoot() {
  const { session, peran, loading } = useAuth();
  if (loading) return <Spin fullscreen />;
  if (!session) return <LoginPage />;
  if (!peran) return <BelumAktifPage />;
  return <Routes><Route element={<AppLayout />}>{ROUTE.map((r) => <Route key={r.path} path={r.path} element={r.element} />)}<Route path="*" element={<Navigate to="/" replace />} /></Route></Routes>;
}
