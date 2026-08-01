import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import './Profile.css'

export default function Profile() {
  const { user, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState(profile?.username ?? '')
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? '')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [profileMsg, setProfileMsg] = useState('')
  const [profileError, setProfileError] = useState('')
  const [pwMsg, setPwMsg] = useState('')
  const [pwError, setPwError] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPw, setSavingPw] = useState(false)

  const needsUsername = !profile?.username

  async function saveProfile(e) {
    e.preventDefault()
    setProfileError('')
    setProfileMsg('')
    setSavingProfile(true)
    const { error } = await supabase
      .from('profiles')
      .update({ username: username.trim(), avatar_url: avatarUrl.trim() || null })
      .eq('id', user.id)
    if (error) {
      setProfileError(error.code === '23505' ? 'That username is taken.' : error.message)
      setSavingProfile(false)
      return
    }
    await refreshProfile()
    setProfileMsg('Profile saved.')
    setSavingProfile(false)
    if (needsUsername) navigate('/drive', { replace: true })
  }

  async function changePassword(e) {
    e.preventDefault()
    setPwError('')
    setPwMsg('')
    setSavingPw(true)
    if (newPassword !== confirmNewPassword) { setPwError("Passwords don't match."); setSavingPw(false); return }
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) setPwError(error.message)
    else { setPwMsg('Password updated.'); setNewPassword(''); setConfirmNewPassword('') }
    setSavingPw(false)
  }

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="profile-page">
      <div className="profile-card">
        <h1 className="profile-title">Profile</h1>
        {needsUsername && <p className="profile-auditnotice">Set a username to start using your drive.</p>}

        <form className="profile-section" onSubmit={saveProfile}>
          <h2 className="profile-section-title">Account</h2>

          <label className="profile-field">
            Username
            <input type="text" value={username} onChange={e => setUsername(e.target.value)} required minLength={3} />
          </label>

          <label className="profile-field">
            Avatar URL
            <input type="url" value={avatarUrl} onChange={e => setAvatarUrl(e.target.value)} placeholder="https://…/avatar.png" />
          </label>

          {profileError && <p className="profile-error">{profileError}</p>}
          {profileMsg && <p className="profile-msg">{profileMsg}</p>}

          <button type="submit" className="profile-btn" disabled={savingProfile}>
            {savingProfile ? '…' : needsUsername ? 'Save & continue' : 'Save profile'}
          </button>
        </form>

        <form className="profile-section" onSubmit={changePassword}>
          <h2 className="profile-section-title">Change password</h2>

          <label className="profile-field">
            New password
            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={6} autoComplete="new-password" />
          </label>

          <label className="profile-field">
            Confirm new password
            <input type="password" value={confirmNewPassword} onChange={e => setConfirmNewPassword(e.target.value)} required minLength={6} autoComplete="new-password" />
          </label>

          {pwError && <p className="profile-error">{pwError}</p>}
          {pwMsg && <p className="profile-msg">{pwMsg}</p>}

          <button type="submit" className="profile-btn profile-btn-secondary" disabled={savingPw}>
            {savingPw ? '…' : 'Update password'}
          </button>
        </form>

        <div className="profile-footer">
          {needsUsername
            ? <span />
            : <button className="profile-link-btn" onClick={() => navigate('/drive')}>Back to drive</button>}
          <button className="profile-link-btn" onClick={signOut}>Sign out</button>
        </div>
      </div>
    </div>
  )
}