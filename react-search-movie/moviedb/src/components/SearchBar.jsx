import { useState } from 'react'
import { useApp } from '../context/AppContext'

export default function SearchBar() {
  const [input, setInput] = useState('')
  const { doSearch } = useApp()

  const handleSubmit = (e) => {
    e.preventDefault()
    doSearch(input)
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.5rem', padding: '1rem' }}>
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Search for a movie..."
        style={{ flex: 1, padding: '0.5rem' }}
      />
      <button type="submit" style={{ padding: '0.5rem 1rem' }}>
        Search
      </button>
    </form>
  )
}
