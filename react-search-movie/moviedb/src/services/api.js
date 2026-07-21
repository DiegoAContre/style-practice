const BASE_URL = 'https://where-can-i-watch1.p.rapidapi.com'

const API_KEY = import.meta.env.VITE_RAPIDAPI_KEY
const COUNTRY = import.meta.env.VITE_COUNTRY_CODE || 'us'

export async function searchMovies(query) {
  const res = await fetch(`${BASE_URL}/search/${COUNTRY}/${encodeURIComponent(query)}`, {
    headers: {
      'x-rapidapi-key': API_KEY,
      'x-rapidapi-host': 'where-can-i-watch1.p.rapidapi.com',
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) throw new Error('Search failed')
  return res.json()
}
