import SearchBar from '../components/SearchBar'
import MovieCard from '../components/MovieCard'
import { useApp } from '../context/AppContext'

export default function HomePage() {
  const { results, loading, error } = useApp()

  return (
    <div className="page">
      <section className="hero">
        <h1 className="hero-title">Find where to watch</h1>
        <p className="hero-subtitle">
          Search for any movie and discover where it's available to stream, rent, or buy
        </p>
        <SearchBar />
      </section>
      {loading && (
        <div className="skeleton-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div className="skeleton-card" key={i}>
              <div className="skeleton-line" />
              <div className="skeleton-line" />
              <div className="skeleton-line" />
            </div>
          ))}
        </div>
      )}
      {error && <p className="status-message error">Error: {error}</p>}
      {!loading && !error && results.length === 0 && (
        <p className="movie-grid-empty">Search for a movie to get started</p>
      )}
      {!loading && !error && results.length > 0 && (
        <div className="movie-grid">
          {results.map((movie, i) => (
            <MovieCard key={`${movie.title}-${movie.year}-${i}`} movie={movie} />
          ))}
        </div>
      )}
    </div>
  )
}
