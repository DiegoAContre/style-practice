import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import RequireAuth from './components/RequireAuth'
import RequireGuest from './components/RequireGuest'
import Login from './pages/Login'
import Drive from './pages/Drive'
import Profile from './pages/Profile'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/drive" replace />} />
          <Route
            path="/login"
            element={<RequireGuest><Login /></RequireGuest>}
          />
          <Route
            path="/profile"
            element={<RequireAuth requireUsername={false}><Profile /></RequireAuth>}
          />
          <Route
            path="/drive"
            element={<RequireAuth><Drive /></RequireAuth>}
          />
          <Route path="*" element={<Navigate to="/drive" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}