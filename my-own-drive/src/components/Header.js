import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import './Header.css'

export default function Header({ children }) {
  const { user, profile } = useAuth()
  const navigate = useNavigate()

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const avatarUrl = profile?.avatar_url
  const initial = (profile?.username || user?.email || '?').trim()[0]?.toUpperCase() ?? '?'

  return (
    <header className="app-header">
      <div className="app-header-left">
        <span className="app-wordmark">my own drive</span>
        <nav className="app-nav">
          <button className="app-nav-link" onClick={() => navigate('/drive')}>My Drive</button>
          <button className="app-nav-link" onClick={() => navigate('/shared')}>Shared with me</button>
        </nav>
        {children}
      </div>
      <div className="app-avatar">
        <span className="app-avatar-letter">{initial}</span>
        {avatarUrl && (
          <img
            className="app-avatar-img"
            src={avatarUrl}
            alt=""
            tabIndex={0}
            onError={(e) => { e.currentTarget.style.display = 'none' }}
          />
        )}
        <div className="app-avatar-menu">
          <span className="app-avatar-name">{profile?.username || user?.email}</span>
          <button className="app-avatar-item" onClick={() => navigate('/profile')}>Profile</button>
          <button className="app-avatar-item app-avatar-item-signout" onClick={signOut}>Sign out</button>
        </div>
      </div>
    </header>
  )
}