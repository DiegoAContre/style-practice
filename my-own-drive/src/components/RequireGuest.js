import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function RequireGuest({ children }) {
  const { session, profile, loading } = useAuth()
  if (loading) return <div className="loading">Loading…</div>
  if (session) {
    // redirect authed users past login; if no username yet, send to profile
    return <Navigate to={profile && !profile.username ? '/profile' : '/drive'} replace />
  }
  return children
}