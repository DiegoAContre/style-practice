import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'

export default function MovieDetailPage() {
  const navigate = useNavigate()
  const { selectedMovie, isFavorite, addFavorite, removeFavorite } = useApp()
  const movie = selectedMovie
  const fav = movie ? isFavorite(movie) : false

  if (!movie) {
    return (
      <div className="detail-empty">
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

  const handleFavorite = () => {
    fav ? removeFavorite(movie) : addFavorite(movie)
  }

  return (
    <div className="detail-page">
      <button className="detail-back" onClick={() => navigate('/')}>
        Back
      </button>
      <div className="detail-header">
        <h1 className="detail-title">
          {movie.title} <span style={{ opacity: 0.5, fontWeight: 400 }}>({movie.year})</span>
        </h1>
        <button
          className={`detail-fav-btn${fav ? ' active' : ''}`}
          onClick={handleFavorite}
        >
          {fav ? '♥ Remove' : '♡ Add to Favorites'}
        </button>
      </div>
      {categories.map(({ key, label }) => {
        const items = movie.options?.[key]
        if (!items || items.length === 0) return null
        return (
          <div className="detail-section" key={key}>
            <h2>{label}</h2>
            {items.map((opt, i) => (
              <div className="detail-option" key={i}>
                <div className="detail-option-info">
                  <span className="detail-option-provider">{opt.provider}</span>
                  <span className="detail-option-pricing">{opt.pricing}</span>
                </div>
                <a
                  className="detail-option-link"
                  href={opt.providerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
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
