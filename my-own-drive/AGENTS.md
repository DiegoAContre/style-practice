# AGENTS.md — my-own-drive

Personal cloud storage app (Google Drive–like). React (CRA) frontend + Supabase
for database and auth. Scoped to this folder only; sibling folders under
`style-practice/` are unrelated projects — do not touch them.

## Commands
- `npm start` — dev server at http://localhost:3000 (hot reload)
- `npm test` — Jest watch (CRA runner). Single test:
  - `npm test -- src/App.test.js`
  - `npm test -- -t "renders"`
- `npm run build` — production build to `build/`
- No standalone lint/typecheck script; ESLint (`react-app`, `react-app/jest`)
  runs via `react-scripts` and shows in the dev console. Do not eject.

## Supabase
- Client: `src/lib/supabaseClient.js` (exports `supabase`). Throws at import if
  env vars are missing — fail loud, not silent.
- Schema lives in `supabase/schema.sql`; run once in the Supabase SQL editor
  (Dashboard > SQL Editor). Switch to the `supabase` CLI once the schema starts
  changing in flight.
- CRA only exposes env vars prefixed `REACT_APP_`. Use:
  - `REACT_APP_SUPABASE_URL`
  - `REACT_APP_SUPABASE_ANON_KEY`
- `.env*.local` files are gitignored — put keys there, never commit them.

## Docker (local dev only)
- `docker compose up` — React dev server at http://localhost:3000 with hot
  reload (bind-mounts `.`, isolates `node_modules`, `env_file: .env.local`).
- Vercel (prod): plain CRA build, auto-detected. Set both `REACT_APP_*` vars in
  the Vercel project env. No `vercel.json` needed.

## Quirks
- `.gitignore` ignores `opencode.json` (local-only OpenCode config).
- `opencode.json` enables the `ponytail` plugin; lazy/minimal code by default.

## Scope
- All work goes inside this directory only.