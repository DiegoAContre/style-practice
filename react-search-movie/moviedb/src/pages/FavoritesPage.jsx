import MovieCard from '../components/MovieCard'
import { useApp } from '../context/AppContext'

export default function FavoritesPage() {
  const { favorites } = useApp()

  return (
    <div className="favorites-page">
      <div className="favorites-header">
        <h1>Favorites</h1>
      </div>
      {favorites.length === 0 ? (
        <div className="favorites-empty">
          <span className="favorites-empty-icon">♡</span>
          <p>No favorites yet</p>
          <p style={{ fontSize: '0.875rem' }}>Search for movies and add them to your favorites</p>
        </div>
      ) : (
        <div className="movie-grid">
          {favorites.map((movie, i) => (
            <MovieCard key={`fav-${movie.title}-${movie.year}-${i}`} movie={movie} />
          ))}
        </div>
      )}
    </div>
  )
}
