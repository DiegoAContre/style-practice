import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// gate: by default requires session AND username. Pass requireUsername={false}
// for routes that set the username themselves (e.g. /profile).
export default function RequireAuth({ children, requireUsername = true }) {
  const { session, profile, loading } = useAuth()
  if (loading) return <div className="loading">Loading…</div>
  if (!session) return <Navigate to="/login" replace />
  if (requireUsername && profile && !profile.username) return <Navigate to="/profile" replace />
  return children
}