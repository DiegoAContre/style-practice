import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the app shell without crashing', () => {
  render(<App />);
  // Before getSession resolves, AuthProvider shows "Loading…".
  expect(screen.getByText(/loading/i)).toBeInTheDocument();
});