import SearchBar from '../components/SearchBar'
import MovieCard from '../components/MovieCard'
import { useApp } from '../context/AppContext'

export default function HomePage() {
  const { results, loading, error } = useApp()

  return (
    <div>
      <SearchBar />
      {loading && <p style={{ padding: '1rem' }}>Loading...</p>}
      {error && <p style={{ padding: '1rem', color: 'red' }}>Error: {error}</p>}
      <div style={{ display: 'flex', flexWrap: 'wrap', padding: '1rem' }}>
        {results.map((movie, i) => (
          <MovieCard key={`${movie.title}-${movie.year}-${i}`} movie={movie} />
        ))}
      </div>
    </div>
  )
}
