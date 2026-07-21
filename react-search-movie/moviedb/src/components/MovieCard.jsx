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
    <div
      onClick={handleClick}
      style={{
        cursor: 'pointer',
        border: '1px solid #ccc',
        borderRadius: '8px',
        padding: '1rem',
        margin: '0.5rem',
        width: '280px',
      }}
    >
      <h3>
        {movie.title} ({movie.year})
      </h3>
      {firstOption ? (
        <p>
          {firstOption.provider} - {firstOption.pricing}
        </p>
      ) : (
        <p style={{ color: '#888' }}>No streaming info</p>
      )}
      <button onClick={handleFavorite}>{fav ? 'Remove Favorite' : 'Add Favorite'}</button>
    </div>
  )
}
