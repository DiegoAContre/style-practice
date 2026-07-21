import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'

export default function MovieDetailPage() {
  const navigate = useNavigate()
  const { selectedMovie, isFavorite, addFavorite, removeFavorite } = useApp()
  const movie = selectedMovie
  const fav = movie ? isFavorite(movie) : false

  if (!movie) {
    return (
      <div style={{ padding: '2rem' }}>
        <p>No movie selected.</p>
        <button onClick={() => navigate('/')}>Go back</button>
      </div>
    )
  }

  const categories = [
    { key: 'stream', label: 'Stream' },
    { key: 'rent', label: 'Rent' },
    { key: 'buy', label: 'Buy' },
  ]

  return (
    <div style={{ padding: '2rem' }}>
      <button onClick={() => navigate('/')}>Back</button>
      <h1>
        {movie.title} ({movie.year})
      </h1>
      <button onClick={() => (fav ? removeFavorite(movie) : addFavorite(movie))}>
        {fav ? 'Remove from Favorites' : 'Add to Favorites'}
      </button>
      <hr />
      {categories.map(({ key, label }) => {
        const items = movie.options?.[key]
        if (!items || items.length === 0) return null
        return (
          <div key={key} style={{ marginBottom: '1.5rem' }}>
            <h2>{label}</h2>
            {items.map((opt, i) => (
              <div key={i} style={{ margin: '0.75rem 0', padding: '0.5rem', border: '1px solid #eee', borderRadius: '4px' }}>
                <strong>{opt.provider}</strong> - {opt.pricing}
                <br />
                <a href={opt.providerUrl} target="_blank" rel="noopener noreferrer">
                  {opt.option === 'Stream' ? 'Watch now' : opt.option === 'Rent' ? 'Rent now' : 'Buy now'}
                </a>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
