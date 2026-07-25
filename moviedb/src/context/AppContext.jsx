import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { searchMovies } from '../services/api'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [selectedMovie, setSelectedMovie] = useState(null)
  const [favorites, setFavorites] = useState(() => {
    try {
      const stored = localStorage.getItem('favorites')
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  })

  useEffect(() => {
    localStorage.setItem('favorites', JSON.stringify(favorites))
  }, [favorites])

  const addFavorite = useCallback((movie) => {
    setFavorites((prev) => {
      if (prev.some((f) => f.title === movie.title && f.year === movie.year)) return prev
      return [...prev, movie]
    })
  }, [])

  const removeFavorite = useCallback((movie) => {
    setFavorites((prev) => prev.filter((f) => !(f.title === movie.title && f.year === movie.year)))
  }, [])

  const isFavorite = useCallback(
    (movie) => favorites.some((f) => f.title === movie.title && f.year === movie.year),
    [favorites],
  )

  const doSearch = useCallback(async (q) => {
    if (!q.trim()) return
    setQuery(q)
    setLoading(true)
    setError(null)
    try {
      const data = await searchMovies(q)
      setResults(data)
    } catch (err) {
      setError(err.message)
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  return (
    <AppContext.Provider
      value={{
        query,
        results,
        loading,
        error,
        selectedMovie,
        setSelectedMovie,
        favorites,
        addFavorite,
        removeFavorite,
        isFavorite,
        doSearch,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
