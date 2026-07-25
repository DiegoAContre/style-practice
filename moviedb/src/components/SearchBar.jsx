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
    <form className="search-form" onSubmit={handleSubmit}>
      <div className="search-input-wrapper">
        <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          className="search-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search for a movie..."
        />
      </div>
      <button className="search-btn" type="submit">
        Search
      </button>
    </form>
  )
}
