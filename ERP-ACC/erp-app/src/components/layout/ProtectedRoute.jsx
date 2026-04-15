import { useAuth } from '../../contexts/AuthContext'
import { Navigate } from 'react-router-dom'

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'inline-block', animation: 'spin 1s linear infinite', borderRadius: '50%', width: '32px', height: '32px', borderBottom: '2px solid #2563eb', marginBottom: '16px' }}></div>
          <p style={{ color: '#4b5563' }}>Memuat...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return children
}
