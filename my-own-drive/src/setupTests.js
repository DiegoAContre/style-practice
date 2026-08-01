import '@testing-library/jest-dom';

// Stub Supabase env vars so the fail-loud guard in supabaseClient.js doesn't
// throw at import time when no .env.local is present (e.g. CI, fresh clone).
// Real runs supply these via .env.local.
process.env.REACT_APP_SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || 'http://localhost:54321'
process.env.REACT_APP_SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY || 'test-anon-key'

// react-router v7 needs TextEncoder/TextDecoder, which jsdom in CRA jest lacks.
// ponytail: minimal polyfill in setupTests, remove if CRA's jest env gains them.
if (typeof TextEncoder === 'undefined') {
  global.TextEncoder = require('util').TextEncoder;
}
if (typeof TextDecoder === 'undefined') {
  global.TextDecoder = require('util').TextDecoder;
}