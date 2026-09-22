import { useState } from 'react';
import { Layout, Menu, Button, Typography, Drawer, Grid } from 'antd';
import { MenuOutlined } from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { menuUntukPeran } from './menu.js';

export default function AppLayout() {
  const { peran, profil, keluar } = useAuth();
  const nav = useNavigate();
  const lokasi = useLocation();
  const layar = Grid.useBreakpoint();
  const [laci, setLaci] = useState(false);
  const menu = menuUntukPeran(peran);
  const aktif = menu.find((m) => m.path !== '/' && lokasi.pathname.startsWith(m.path.split('/').slice(0, 2).join('/')))?.key ?? 'beranda';
  const daftar = <Menu mode="inline" selectedKeys={[aktif]} items={menu.map((m) => ({ key: m.key, label: m.label }))} onClick={({ key }) => { nav(menu.find((m) => m.key === key).path); setLaci(false); }} />;
  return (
    <Layout style={{ minHeight: '100vh' }}>
      {layar.md ? <Layout.Sider theme="light" width={220}>{daftar}</Layout.Sider> : <Drawer open={laci} onClose={() => setLaci(false)} placement="left" width={240}>{daftar}</Drawer>}
      <Layout>
        <Layout.Header style={{ background: '#fff', display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px' }}>
          {!layar.md && <Button icon={<MenuOutlined />} onClick={() => setLaci(true)} aria-label="Menu" />}
          <Typography.Text strong style={{ flex: 1 }}>BUL</Typography.Text>
          <Typography.Text type="secondary">{profil?.nama || profil?.email} · {peran}</Typography.Text>
          <Button onClick={keluar}>Keluar</Button>
        </Layout.Header>
        <Layout.Content style={{ padding: 16 }}><Outlet /></Layout.Content>
      </Layout>
    </Layout>
  );
}
