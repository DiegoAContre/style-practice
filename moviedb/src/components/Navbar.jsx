import { Link, useLocation } from 'react-router-dom'

export default function Navbar() {
  const { pathname } = useLocation()

  return (
    <nav className="navbar">
      <Link to="/" className="navbar-brand">
        Movie<span>DB</span>
      </Link>
      <div className="navbar-links">
        <Link to="/" className={pathname === '/' ? 'active' : ''}>
          Search
        </Link>
        <Link to="/favorites" className={pathname === '/favorites' ? 'active' : ''}>
          Favorites
        </Link>
      </div>
    </nav>
  )
}
