import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import './Login.css'

export default function Login() {
  const navigate = useNavigate()
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [username, setUsername] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    setInfo('')
    setBusy(true)
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        navigate('/drive')
      } else {
        if (!username.trim()) { setError('Username is required.'); setBusy(false); return }
        if (password !== confirmPassword) { setError("Passwords don't match."); setBusy(false); return }
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username: username.trim() } },
        })
        if (error) throw error
        if (data.user && !data.session) {
          setInfo('Check your email for a confirmation link, then sign in.')
          setMode('signin')
        } else {
          navigate('/drive')
        }
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function resetPassword(e) {
    e.preventDefault()
    setError('')
    setInfo('')
    if (!email) { setError('Enter your email above first.'); return }
    const { error } = await supabase.auth.resetPasswordForEmail(email)
    if (error) setError(error.message)
    else setInfo('Password reset email sent.')
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <h1 className="login-title">my own drive</h1>
        <h2 className="login-subtitle">{mode === 'signin' ? 'Sign in' : 'Create account'}</h2>

        <label className="login-field">
          Email
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
        </label>

        {mode === 'signup' && (
          <label className="login-field">
            Username
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              minLength={3}
              autoComplete="username"
              placeholder="unique, 3+ chars"
            />
          </label>
        )}

        <label className="login-field">
          Password
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} />
        </label>

        {mode === 'signup' && (
          <label className="login-field">
            Confirm password
            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required minLength={6} autoComplete="new-password" />
          </label>
        )}

        {error && <p className="login-error">{error}</p>}
        {info && <p className="login-info">{info}</p>}

        <button type="submit" className="login-btn" disabled={busy}>
          {busy ? '…' : mode === 'signin' ? 'Sign in' : 'Sign up'}
        </button>

        <div className="login-aux">
          <button type="button" className="login-link-btn" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
            {mode === 'signin' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
          </button>
          {mode === 'signin' && (
            <button type="button" className="login-link-btn" onClick={resetPassword}>Forgot password?</button>
          )}
        </div>
      </form>
    </div>
  )
}