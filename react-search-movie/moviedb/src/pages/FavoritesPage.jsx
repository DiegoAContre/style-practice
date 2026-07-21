import MovieCard from '../components/MovieCard'
import { useApp } from '../context/AppContext'

export default function FavoritesPage() {
  const { favorites } = useApp()

  if (favorites.length === 0) {
    return <p style={{ padding: '2rem' }}>No favorites yet.</p>
  }

  return (
    <div style={{ padding: '1rem' }}>
      <h1>Favorites</h1>
      <div style={{ display: 'flex', flexWrap: 'wrap' }}>
        {favorites.map((movie, i) => (
          <MovieCard key={`fav-${movie.title}-${movie.year}-${i}`} movie={movie} />
        ))}
      </div>
    </div>
  )
}
