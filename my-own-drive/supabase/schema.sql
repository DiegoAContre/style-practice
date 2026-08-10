-- my-own-drive schema. Run once in the Supabase SQL editor
-- (Dashboard > SQL Editor > New query) after creating your project.
-- ponytail: single-file migration until the schema starts changing in flight;
--   switch to the supabase CLI + migration files when that happens.

-- required extensions
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles: extra user data keyed 1:1 to auth.users
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    text unique,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

-- auto-create a profile row on signup, carrying username from signup metadata
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, new.raw_user_meta_data->>'username');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------------
-- folders: nested tree via self-referencing parent_folder_id
-- ---------------------------------------------------------------------------
create table if not exists public.folders (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references auth.users (id) on delete cascade,
  name             text not null,
  parent_folder_id uuid references public.folders (id) on delete cascade,
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- files: metadata rows; blobs live in Supabase Storage bucket 'drive-files'
-- ---------------------------------------------------------------------------
create table if not exists public.files (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users (id) on delete cascade,
  folder_id    uuid references public.folders (id) on delete cascade,
  name         text not null,
  storage_path text not null,
  mime_type    text,
  size         bigint,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- shared_items: one row per (item, recipient)
-- ---------------------------------------------------------------------------
create table if not exists public.shared_items (
  id                    uuid primary key default gen_random_uuid(),
  item_type             text not null check (item_type in ('folder', 'file')),
  item_id               uuid not null,
  shared_with_user_id   uuid not null references auth.users (id) on delete cascade,
  permission            text not null default 'view' check (permission in ('view', 'edit')),
  created_at            timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- private schema: recursion-safe helpers (bypass RLS internally).
-- ---------------------------------------------------------------------------
create schema if not exists private;

create or replace function private.file_is_shared_with_me(p_file uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with recursive chain(fid) as (
    select folder_id from public.files where id = p_file
    union all
    select fo.parent_folder_id
      from public.folders fo
      join chain c on c.fid is not null and fo.id = c.fid
  )
  select exists (
    select 1 from public.shared_items s
    where s.shared_with_user_id = (select auth.uid())
      and (
        (s.item_type = 'file'   and s.item_id = p_file)
        or (s.item_type = 'folder' and s.item_id in (select fid from chain where fid is not null))
      )
  );
$$;
revoke execute on function private.file_is_shared_with_me(uuid)
  from public, anon, service_role;
grant execute on function private.file_is_shared_with_me(uuid) to authenticated;

create or replace function private.folder_is_shared_with_me(p_folder uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with recursive chain(fid) as (
    select p_folder
    union all
    select fo.parent_folder_id
      from public.folders fo
      join chain c on c.fid is not null and fo.id = c.fid
  )
  select exists (
    select 1 from public.shared_items s
    where s.shared_with_user_id = (select auth.uid())
      and s.item_type = 'folder'
      and s.item_id in (select fid from chain)
  );
$$;
revoke execute on function private.folder_is_shared_with_me(uuid)
  from public, anon, service_role;
grant execute on function private.folder_is_shared_with_me(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- sharing RPCs (write paths). See supabase/fix-policies.sql for full notes.
-- ---------------------------------------------------------------------------
create or replace function public.share_item(
  p_item_type text,
  p_item_id    uuid,
  p_recipient  uuid,
  p_permission text default 'view'
) returns public.shared_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_out   public.shared_items;
begin
  perform private.bump_rate('share_item', (select auth.uid())::text, 30, 60);
  if p_permission not in ('view', 'edit') then
    raise exception 'invalid permission' using errcode = '23514';
  end if;
  if p_item_type = 'folder' then
    select owner_id into v_owner from public.folders where id = p_item_id;
  elsif p_item_type = 'file' then
    select owner_id into v_owner from public.files where id = p_item_id;
  else
    raise exception 'invalid item_type' using errcode = '23514';
  end if;
  if v_owner is null then
    raise exception 'item not found' using errcode = 'P0002';
  end if;
  if v_owner <> (select auth.uid()) then
    raise exception 'not owner' using errcode = '42501';
  end if;
  if p_recipient = v_owner then
    raise exception 'cannot share with yourself' using errcode = 'P0003';
  end if;
  insert into public.shared_items (item_type, item_id, shared_with_user_id, permission)
    values (p_item_type, p_item_id, p_recipient, p_permission)
    on conflict (item_type, item_id, shared_with_user_id)
    do update set permission = excluded.permission
    returning * into v_out;
  return v_out;
end;
$$;
revoke execute on function public.share_item(text, uuid, uuid, text)
  from anon, service_role;

create or replace function public.unshare_item(
  p_item_type text,
  p_item_id   uuid,
  p_recipient uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_owner uuid;
begin
  perform private.bump_rate('unshare_item', (select auth.uid())::text, 30, 60);
  if p_item_type = 'folder' then
    select owner_id into v_owner from public.folders where id = p_item_id;
  elsif p_item_type = 'file' then
    select owner_id into v_owner from public.files where id = p_item_id;
  else
    return;
  end if;
  if (select auth.uid()) in (v_owner, p_recipient) then
    delete from public.shared_items
      where item_type   = p_item_type
        and item_id     = p_item_id
        and shared_with_user_id = p_recipient;
  end if;
end;
$$;
revoke execute on function public.unshare_item(text, uuid, uuid)
  from anon, service_role;

create or replace function public.my_shares()
returns table (
  item_type           text,
  item_id             uuid,
  shared_with_user_id uuid,
  permission          text,
  created_at          timestamptz
)
language sql
security definer
set search_path = public
as $$
  select s.item_type, s.item_id, s.shared_with_user_id, s.permission, s.created_at
  from public.shared_items s
  join public.folders f
    on s.item_type = 'folder' and f.id = s.item_id and f.owner_id = (select auth.uid())
  union all
  select s.item_type, s.item_id, s.shared_with_user_id, s.permission, s.created_at
  from public.shared_items s
  join public.files fl
    on s.item_type = 'file' and fl.id = s.item_id and fl.owner_id = (select auth.uid());
$$;
revoke execute on function public.my_shares() from anon, service_role;

-- Resolve a username to a user id. Recipient picker uses this; returns only
-- the uuid, nothing else (no email / avatar leakage). Returns NULL if absent.
create or replace function public.resolve_user_by_username(p_username text)
returns uuid
language sql
security definer
set search_path = public
as $$
  select private.bump_rate('resolve_user_by_username', (select auth.uid())::text, 60, 60);
  select id from public.profiles where username = p_username;
$$;
revoke execute on function public.resolve_user_by_username(text)
  from anon, service_role;

-- Reverse lookup: resolve a batch of user ids to usernames. Used by the share
-- modal to show recipient usernames next to each existing share. Returns
-- username only (no email / avatar). Idempotent.
create or replace function public.usernames_for_users(p_ids uuid[])
returns table (id uuid, username text)
language sql
security definer
set search_path = public
as $$
  select private.bump_rate('usernames_for_users', (select auth.uid())::text, 60, 60);
  select id, username from public.profiles where id = any(p_ids);
$$;
revoke execute on function public.usernames_for_users(uuid[])
  from anon, service_role;

-- Signed Storage URL for one file. Owner OR share-recipient may call.
-- ponytail: 60s hardcoded; add a length param if a longer window is needed.
create or replace function public.create_share_download_url(p_file uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_path  text;
  v_url   text;
begin
  perform private.bump_rate('create_share_download_url', (select auth.uid())::text, 120, 60);
  select owner_id, storage_path into v_owner, v_path
    from public.files where id = p_file;
  if v_owner is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if v_owner <> (select auth.uid())
     and not private.file_is_shared_with_me(p_file) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select signed_url into v_url
    from storage.create_signed_url('drive-files', v_path, 60);
  return v_url;
end;
$$;
revoke execute on function public.create_share_download_url(uuid)
  from anon, service_role;

-- ---------------------------------------------------------------------------
-- row level security
-- ---------------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.folders       enable row level security;
alter table public.files         enable row level security;
alter table public.shared_items  enable row level security;
alter table public.profiles      force row level security;
alter table public.folders       force row level security;
alter table public.files         force row level security;
alter table public.shared_items  force row level security;

-- profiles: a user can read/update only their own profile
create policy "profiles are readable by owner"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles are updatable by owner"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- folders: owner-only writes; recipients see shared rows via the helper.
create policy "folders select own or shared"
  on public.folders for select
  using (
    auth.uid() = owner_id
    or (select private.folder_is_shared_with_me(id))
  );

create policy "folders insert by owner"
  on public.folders for insert
  with check (auth.uid() = owner_id);

create policy "folders update by owner"
  on public.folders for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "folders delete by owner"
  on public.folders for delete
  using (auth.uid() = owner_id);

-- files: owner-only writes; recipients see shared rows via the helper.
create policy "files select own or shared"
  on public.files for select
  using (
    auth.uid() = owner_id
    or (select private.file_is_shared_with_me(id))
  );

create policy "files insert by owner"
  on public.files for insert
  with check (auth.uid() = owner_id);

create policy "files update by owner"
  on public.files for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "files delete by owner"
  on public.files for delete
  using (auth.uid() = owner_id);

-- shared_items: writes go through RPCs (share_item / unshare_item), so no
-- direct insert/update/delete policies. Recipients may read their own
-- inbound share rows directly (used by the /shared inbox to list which items
-- were shared with them — owner info comes from the widened files/folders
-- selects, not from this table).
create policy "shared_items select as recipient"
  on public.shared_items for select
  using (shared_with_user_id = auth.uid());

-- dedupe share rows: one (item, recipient) pair, upserted by share_item.
alter table public.shared_items
  add constraint shared_items_unique
  unique (item_type, item_id, shared_with_user_id);

-- hot-path indexes. Postgres doesn't auto-index FK columns.
create index if not exists files_owner_idx            on public.files   (owner_id);
create index if not exists files_folder_idx          on public.files   (folder_id);
create index if not exists folders_owner_parent_idx   on public.folders (owner_id, parent_folder_id);
create index if not exists shared_items_recipient_idx on public.shared_items (shared_with_user_id);
create index if not exists shared_items_item_idx      on public.shared_items (item_type, item_id);

-- ---------------------------------------------------------------------------
-- storage bucket + object policies
--   bucket 'drive-files' must be created first: Dashboard > Storage > New bucket
--   set it to PRIVATE. Object paths follow {owner_id}/{file_id}/{name}.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('drive-files', 'drive-files', false)
on conflict (id) do nothing;

-- owners can CRUD their own prefix
create policy "drive-files upload own"
  on storage.objects for insert
  with check (
    bucket_id = 'drive-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "drive-files read own"
  on storage.objects for select
  using (
    bucket_id = 'drive-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "drive-files update own"
  on storage.objects for update
  using (
    bucket_id = 'drive-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "drive-files delete own"
  on storage.objects for delete
  using (
    bucket_id = 'drive-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );