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
- Schema lives in `supabase/schema.sql` (for fresh projects) and
  `supabase/fix-policies.sql` (idempotent reconciliation for an already-populated
  DB). `schema.sql` uses bare `create policy` and will raise `42710` on re-run —
  run it once. `fix-policies.sql` prefixes every policy with `drop policy if
  exists` and is safe to re-run. Run both in the Supabase SQL editor
  (Dashboard > SQL Editor). Switch to the `supabase` CLI once the schema starts
  changing in flight.
- Auth keys go in `.env.local` as the **publishable/anon** key
  (`REACT_APP_SUPABASE_ANON_KEY`), never the service-role key.
- `profiles.username` is **UNIQUE**; a `handle_new_user` trigger auto-inserts a
  profile row on signup and copies `username` from `raw_user_meta_data`.
- **RLS is enabled on every table.** Select policies are **owner-only**
  (`auth.uid() = owner_id`) — deliberately no cross-table subquery. Earlier
  attempts had `files ↔ shared_items ↔ folders` recursion in the select
  policies, which made PostgREST return 500 on every query. When sharing lands,
  add `security definer` functions (`file_is_shared_with_me`,
  `folder_is_shared_with_me`) and reference them in the select policies to
  avoid recursion. `shared_items` has no select policy yet.
- Storage bucket `drive-files` is **private**; object paths follow
  `{owner_id}/{file_id}/{name}`. Storage policies match the owner prefix.

## Drive page (src/pages/Drive.js)
- Features: upload (multi-file, 50 MB cap), download (signed URL, 60 s),
  rename metadata-only (storage path keeps `{id}` — blob never moves), delete
  (removes blob then row). All owner-only via RLS.
- Rename/delete use the in-page `src/components/Modal.js` (backdrop click /
  Esc / Cancel dismiss). No `window.prompt` / `window.confirm`.
- Root-level query gotcha: `folder_id = null` rows don't match `.eq('folder_id', '')`.
  Branch on `folderId`: use `.is('folder_id', null)` for root, `.eq('folder_id',
  folderId)` for subfolders. Same for `folders.parent_folder_id`.
- `load()` surfaces query errors (no silent 500s); `setError` drives the inline
  `.drive-error` banner.

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