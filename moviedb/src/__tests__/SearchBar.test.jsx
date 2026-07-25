import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import SearchBar from '../components/SearchBar'

const mockDoSearch = vi.fn()

vi.mock('../context/AppContext', () => ({
  useApp: () => ({ doSearch: mockDoSearch }),
}))

describe('SearchBar', () => {
  beforeEach(() => {
    mockDoSearch.mockClear()
  })

  it('renders input and button', () => {
    render(<SearchBar />)
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /search/i })).toBeInTheDocument()
  })

  it('updates input value on typing', async () => {
    render(<SearchBar />)
    const input = screen.getAllByPlaceholderText(/search/i)[0]
    await userEvent.type(input, 'Inception')
    expect(input).toHaveValue('Inception')
  })
})
