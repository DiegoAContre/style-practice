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
- **RLS is enabled and forced** (`force row level security`) on every table.
  Select policies on `files`/`folders` are owner-only **OR** shared-with-me via
  `security definer` helpers in the `private` schema
  (`private.file_is_shared_with_me`, `private.folder_is_shared_with_me`). The
  helpers walk the folder ancestor chain recursively so a folder share
  transitively exposes its descendants (Google-Drive behavior) — recursion-safe
  because the helpers run as `security definer` and bypass RLS internally. Wrap
  calls in `(select private.…(id))` inside the policy so the helper runs once
  per query, not per row. **Never** inline `files ↔ shared_items ↔ folders`
  subqueries in policies — that's the recursion that blew up PostgREST with 500
  on every query in the first attempt.
- **Sharing writes go through RPCs only** — the app never inserts/updates/
  deletes on `shared_items` directly:
    - `public.share_item(item_type, item_id, recipient, permission)` —
      owner-only idempotent upsert (self-share + not-owner raise; permission
      flipped via the same call thanks to the
      `(item_type, item_id, shared_with_user_id) unique` constraint).
    - `public.unshare_item(item_type, item_id, recipient)` — owner or recipient
      may call.
    - `public.my_shares()` — owner lists outbound shares.
    - `public.resolve_user_by_username(text)` — username → uuid, for the
      recipient picker. Returns uuid only (no email/avatar leakage).
    - `public.usernames_for_users(uuid[])` — reverse batch lookup used to
      display recipient/owner usernames in the Share modal and `/shared`.
    - `public.create_share_download_url(file uuid)` — returns a 60 s signed
      Storage URL after verifying the caller is owner or share-recipient.
      Used for shared-file downloads because storage SELECT policies stay
      owner-only (storage policies can't cleanly call security definer).
  `shared_items` has a recipient-only select policy
  (`shared_with_user_id = auth.uid()`) so `/shared` can list inbound shares.
  No insert/update/delete policies on `shared_items`.
  `ponytail:` `permission` is stored but not enforced on writes yet —
  recipients see shared items read-only (writes stay owner-only via RLS
  update/insert policies). Wire edit semantics when recipients can upload into
  shared folders.
- Storage bucket `drive-files` is **private**; object paths follow
  `{owner_id}/{file_id}/{name}`. Storage policies match the owner prefix.

## Shared navbar (src/components/Header.js)
- Used by Drive + Shared; takes the page's up button + breadcrumb as children
  (rendered after the nav links). Left: wordmark + `My Drive` / `Shared with me`
  nav links (plain text buttons via `useNavigate`). Right: avatar dropdown —
  `profile.avatar_url` img (falls back to a manila circle with the username
  initial if empty or on `img onerror`) opening a menu on wrapper `:hover` and
  `:focus-within` (CSS-only, no JS): username label, Profile, Sign out
  (stamp-colored). Header pulls `useAuth()` itself; pages have no header
  actions of their own anymore.

## Drive page (src/pages/Drive.js)
- Features: upload (multi-file, 50 MB cap), download (signed URL, 60 s),
  rename metadata-only (storage path keeps `{id}` — blob never moves), delete
  (removes blob then row). All owner-only via RLS.
- Folder create / rename / delete. Folder delete is **recursive**: it walks the
  owner's folder subtree in JS, `storage.remove()`s every blob under any
  descendant folder, then deletes the row (cascade wipes subfolder + file rows).
  `ponytail:` O(my items) per delete; switch to an RPC + recursive CTE once a
  user has thousands of items.
- Rename/delete use the in-page `src/components/Modal.js` (backdrop click /
  Esc / Cancel dismiss). No `window.prompt` / `window.confirm`. One `modal` state
  holds `{ type, file|folder }`; `modalName` is the shared input value.
- `FileList` shows Rename/Delete only for the row owner (`viewerId` prop gates
  via `owner_id === viewerId`); a Share (↗) button shows on every owned row.
  Items the viewer doesn't own render a `Shared` badge instead.
- Upload places files at `folder_id: activeFolder` — works at root (`null`) or
  inside any folder by navigating into it first. Upload-a-whole-folder
  (`webkitdirectory`) is deferred.
- Root-level query gotcha: `folder_id = null` rows don't match `.eq('folder_id', '')`.
  Branch on `folderId`: use `.is('folder_id', null)` for root, `.eq('folder_id',
  folderId)` for subfolders. Same for `folders.parent_folder_id`.
- `load()` surfaces query errors (no silent 500s); `setError` drives the inline
  `.drive-error` banner.
- Drive only loads items owned by the current user (`eq('owner_id', user.id)`);
  shared-with-me items appear on `/shared` instead. Recipients never browse a
  shared folder's contents inline — they download it as a ZIP.

## Shared page (src/pages/Shared.js)
- Two views via `activeFolder` state:
    - **Inbox root** (`activeFolder = null`): lists `shared_items where
      shared_with_user_id = me` (recipient-only select policy), then resolves
      item details via `files`/`folders` `.in('id', ids)` (admitted by the
      widened select policies + the recursion-safe helpers).
    - **Inside a shared folder** (`activeFolder = id`): queries `folders` where
      `parent_folder_id = id` and `files` where `folder_id = id` with **no
      `owner_id` filter** — RLS admits descendants via
      `folder_is_shared_with_me`'s recursive ancestor walk. Lets recipients
      browse a shared subtree like Drive.
- Breadcrumb (first crumb "Shared with me" via `rootLabel` prop) + up-one-level
  button; walks `parent_folder_id` chain to rebuild `path`.
- Reuses `FileList` with `viewerId={user.id}` so owner-only actions (Share /
  Rename / Delete) hide on rows the recipient doesn't own; only ⬇ shows.
  Folder rows get a ⬇ (download-as-ZIP) button via `onDownloadFolderZip` prop.
- File download: `rpc('create_share_download_url', { p_file })` → 60 s signed
  Storage URL; clickable anchor.
- Folder download: `collectSubtree()` (global queries, no owner filter — RLS
  admits descendants), each file via `create_share_download_url` + `fetch()`,
  zipped in-browser with `JSZip`. Single folder → `folderName.zip`; mixed
  selection → `download.zip`. Reuses the same progress-bar pattern as Drive.
- Multi-select + shift-range work identically to Drive (same FileList logic).
- `ponytail:` recipients stay read-only (no upload/rename/delete/move);
  `permission='edit'` is stored but not enforced on writes yet — wire when
  recipients can upload into shared folders.

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

## Design system — "Manila Archive"
- Visual identity: filing-cabinet metaphor. Warm paper bg (`--paper`),
  manila folder tabs, IBM Plex Mono for data/metadata/stamps, Libre Franklin
  for body/display, navy (`--navy`) actions, stamp-red (`--stamp`) for the
  "Shared" badge + danger. Tokens live in `src/theme.css` (`--*` custom
  properties) — **never** hardcode hex values in page/component CSS.
- Fonts load via `<link>` in `public/index.html` (Google Fonts:
  Libre Franklin 400–700, IBM Plex Mono 400–600). No npm font packages.
- Signature elements, all pure CSS: folder glyph with manila tab
  (`.filelist-row-folder .filelist-icon::before/::after`), page glyph with
  ruled lines (file rows), rotated rubber-stamp "Shared" badge
  (`.filelist-badge`), ledger header row in mono caps.
- CSS lives next to its component: `FileList.css`, `Breadcrumb.css`,
  `Modal.css` are imported by their `.js`; pages keep page-specific rules in
  `Drive.css` / `Shared.css` / `Login.css` / `Profile.css`. `theme.css` +
  `index.css` are global.

## Scope
- All work goes inside this directory only.