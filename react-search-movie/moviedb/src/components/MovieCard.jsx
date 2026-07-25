import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'

export default function MovieCard({ movie }) {
  const navigate = useNavigate()
  const { setSelectedMovie, isFavorite, addFavorite, removeFavorite } = useApp()
  const fav = isFavorite(movie)

  const allOptions = [
    ...(movie.options?.stream || []),
    ...(movie.options?.rent || []),
    ...(movie.options?.buy || []),
  ]
  const firstOption = allOptions[0]

  const handleClick = () => {
    setSelectedMovie(movie)
    navigate(`/movie/${encodeURIComponent(movie.title)}`)
  }

  const handleFavorite = (e) => {
    e.stopPropagation()
    fav ? removeFavorite(movie) : addFavorite(movie)
  }

  return (
    <div className="movie-card" onClick={handleClick}>
      <button
        className={`movie-card-fav${fav ? ' active' : ''}`}
        onClick={handleFavorite}
        aria-label={fav ? 'Remove from favorites' : 'Add to favorites'}
      >
        {fav ? '♥' : '♡'}
      </button>
      <h3 className="movie-card-title">
        {movie.title} <span className="movie-card-year">({movie.year})</span>
      </h3>
      {firstOption ? (
        <p className="movie-card-info">
          {firstOption.provider} — {firstOption.pricing}
        </p>
      ) : (
        <p className="movie-card-info">
          <em>No streaming info</em>
        </p>
      )}
    </div>
  )
}
