import { Outlet } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { LogOut } from 'lucide-react'
import Sidebar from './Sidebar'

export default function AppLayout() {
  const { profile, signOut } = useAuth()

  const handleSignOut = async () => {
    await signOut()
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <Sidebar />

      {/* Main content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between">
          <div className="text-gray-600 text-sm">
            Selamat datang, <span className="font-medium text-gray-900">{profile?.full_name || 'User'}</span>
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded transition"
          >
            <LogOut size={18} />
            Keluar
          </button>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
