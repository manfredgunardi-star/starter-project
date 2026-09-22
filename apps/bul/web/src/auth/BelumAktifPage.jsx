import { Result, Button } from 'antd';
import { useAuth } from './AuthProvider.jsx';

export default function BelumAktifPage() {
  const { keluar, session } = useAuth();
  return <Result status="403" title="Akun belum aktif" subTitle={`${session?.user?.email ?? ''} belum diaktifkan. Minta owner mengaktifkan akun Anda di menu Pengguna.`} extra={<Button onClick={keluar}>Keluar</Button>} />;
}
