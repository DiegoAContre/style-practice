# AGENTS.md — my-own-drive

Personal cloud storage app (Google Drive–like). React (CRA) frontend + Supabase
for database, storage, and auth. React Router (`react-router-dom` v7) for pages.
Scoped to this folder only; sibling folders under `style-practice/` are unrelated
projects — do not touch them.

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
  env vars are missing — fail loud, not silent. In jest, `setupTests.js`
  stubs the two vars so tests pass on a fresh clone without `.env.local`.
- Schema lives in `supabase/schema.sql`; idempotent (drop-policy-then-create +
  `do $$ if not exists` for the unique constraint), safe to re-run whole.
  Run in the Supabase SQL editor (Dashboard > SQL Editor). Switch to the
  `supabase` CLI once the schema starts changing in flight.
- Auth keys go in `.env.local` as the **publishable/anon** key
  (`REACT_APP_SUPABASE_ANON_KEY`), never the service-role key.
- `profiles.username` is **UNIQUE**; a `handle_new_user` trigger auto-inserts a
  profile row on signup and copies `username` from `raw_user_meta_data`.

## Docker (local dev only)
- `docker compose up` — React dev server at http://localhost:3000 with hot
  reload (bind-mounts `.`, isolates `node_modules`, `env_file: .env.local`).
- Vercel (prod): plain CRA build, auto-detected. Set both `REACT_APP_*` vars in
  the Vercel project env. No `vercel.json` needed.

## Quirks
- `.gitignore` ignores `opencode.json` (local-only OpenCode config).
- `opencode.json` enables the `ponytail` plugin; lazy/minimal code by default.
- `Dockerfile` uses `npm install` (not `ci`) — host & container npm resolve a
  transitive dep (`yaml`) to different versions; `npm ci` fails the lockfile
  sync check. Image is `node:22-alpine` (Supabase client requires Node >=22).
- `package.json` has a `jest.moduleNameMapper` for `^react-router/dom$` → CJS
  build; `setupTests.js` polyfills `TextEncoder`/`TextDecoder` (react-router v7
  needs them, CRA's jsdom env lacks them).
- After adding a dep: `docker compose down -v && docker compose up -d --build`
  to drop the stale anonymous `node_modules` volume and repopulate it.

## Scope
- All work goes inside this directory only.