import { useAuth } from '../../contexts/AuthContext'

const ROLE_LABELS = {
  canWrite: 'Admin atau Staff',
  canPost: 'Admin',
  isAdmin: 'Admin',
}

export default function RoleGuard({ require, children }) {
  const auth = useAuth()

  if (auth.loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <p style={{ color: '#4b5563' }}>Memuat...</p>
      </div>
    )
  }

  if (!auth[require]) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 12 }}>
        <p style={{ fontSize: 48, margin: 0 }}>🔒</p>
        <p style={{ fontSize: 18, fontWeight: 600, color: '#374151', margin: 0 }}>Akses Ditolak</p>
        <p style={{ color: '#6b7280', margin: 0 }}>
          Halaman ini memerlukan role <strong>{ROLE_LABELS[require] ?? require}</strong>.
          Hubungi administrator untuk mengubah akses Anda.
        </p>
      </div>
    )
  }

  return children
}
