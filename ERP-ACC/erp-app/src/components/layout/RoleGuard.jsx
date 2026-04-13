import { Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

/**
 * Route-level guard. Wraps routes that require a minimum permission level.
 *
 * @param {'canWrite' | 'canPost' | 'isAdmin'} require - permission key from useAuth
 * @param {React.ReactNode} children
 */
export default function RoleGuard({ require, children }) {
  const auth = useAuth()

  if (!auth[require]) {
    return <Navigate to="/" replace />
  }

  return children
}
