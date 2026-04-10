import { AuthProvider, useAuth } from './contexts/AuthContext'
import LoginPage from './pages/LoginPage'

function AppContent() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  if (!user) {
    return <LoginPage />
  }

  return <div className="p-8"><h1 className="text-2xl font-bold">ERP Pembukuan - Dashboard</h1></div>
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
