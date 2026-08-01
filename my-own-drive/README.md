# my-own-drive

Personal cloud storage app (Google Drive–like). React (Create React App) +
Supabase (database, storage, auth). Runs locally in Docker (dev) and deploys to
Vercel (prod) as a plain CRA build.

## Stack
- **Frontend**: React 19, React Router v7 (`react-router-dom`)
- **Backend**: Supabase (Postgres + Auth + Storage)
- **Dev**: Docker (`node:22-alpine`, hot reload)
- **Prod**: Vercel (static CRA build)

## Setup

### 1. Supabase project
1. Create a project at [supabase.com](https://supabase.com).
2. Dashboard > Storage > New bucket → name it `drive-files`, set **Private**.
3. Dashboard > SQL Editor → paste `supabase/schema.sql` > Run. The file is
   idempotent (drop-policy-then-create), safe to re-run.

### 2. Environment
Copy `.env.local.example` to `.env.local` and fill in your Supabase credentials:

```
REACT_APP_SUPABASE_URL=<your project URL>
REACT_APP_SUPABASE_ANON_KEY=<your publishable/anon key>
```

> Use the **publishable/anon** key, never the service-role key (it bypasses RLS).

### 3. Run
```bash
# with Docker (recommended for local dev)
docker compose up -d --build            # http://localhost:3000

# or bare npm
npm install
npm start                               # http://localhost:3000
```

After adding a dependency, drop the stale container volume and rebuild:
```bash
docker compose down -v && docker compose up -d --build
```

## Scripts
- `npm start` — dev server (hot reload)
- `npm test` — Jest watch. Single test: `npm test -- -t "renders"`
- `npm run build` — production build to `build/`
- No standalone lint/typecheck; ESLint (`react-app`, `react-app/jest`) runs via
  `react-scripts` and surfaces in the dev console. Do not eject.

## Features
- Email + password auth (Supabase Auth); username is unique and set at signup.
- Profile page: edit username, avatar URL, change password.
- Onboarding gate: signed-in users without a username are redirected to the
  profile page until they set one.
- Read-only drive view: lists your folders and files by owner, with breadcrumb
  navigation. Upload, create, rename, delete, and sharing are planned.

## Schema
- `profiles` (1:1 with `auth.users`): `username` (UNIQUE), `avatar_url`.
  A `handle_new_user` trigger inserts a profile row on signup, copying
  `username` from `raw_user_meta_data`.
- `folders`: self-referencing `parent_folder_id` for a nested tree.
- `files`: metadata rows; blobs live in the `drive-files` Storage bucket at
  `{owner_id}/{file_id}/{name}`.
- `shared_items`: one row per (item, recipient) with `view`/`edit` permission.
- Row Level Security is enabled on all tables; owners CRUD their own rows,
  shared recipients get read access via `shared_items`.

See `supabase/schema.sql` for the full, re-runnable schema + RLS + storage policies.

## Deploy (Vercel)
Plain CRA build, auto-detected. Set `REACT_APP_SUPABASE_URL` and
`REACT_APP_SUPABASE_ANON_KEY` in the Vercel project env. No `vercel.json` needed.