import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const refreshProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setProfile(null); return }
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, avatar_url')
      .eq('id', user.id)
      .maybeSingle()
    if (error) {
      // profile row may not exist yet if trigger was added after user signup;
      // create it on demand.
      if (error.code === 'PGRST116' || /no rows/.test(error.message)) {
        const ins = await supabase.from('profiles').insert({ id: user.id }).select().single()
        if (!ins.error) setProfile(ins.data)
        return
      }
      console.error('[auth] profile load failed:', error.message)
      return
    }
    setProfile(data)
  }, [])

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!active) return
      setSession(session)
      if (session?.user) await refreshProfile()
      else setProfile(null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session)
        if (session?.user) await refreshProfile()
        else setProfile(null)
        setLoading(false)
      }
    )

    return () => { active = false; subscription.unsubscribe() }
  }, [refreshProfile])

  return (
    <AuthContext.Provider
      value={{ session, loading, user: session?.user ?? null, profile, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}