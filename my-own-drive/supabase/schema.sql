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
-- row level security
-- ---------------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.folders       enable row level security;
alter table public.files         enable row level security;
alter table public.shared_items  enable row level security;

-- profiles: a user can read/update only their own profile
create policy "profiles are readable by owner"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles are updatable by owner"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- folders: owner-only CRUD. Sharing not built yet; when it lands, add a
-- security-definer function folder_is_shared_with_me(p uuid) and reference it
-- here to avoid RLS recursion (files ↔ shared_items ↔ folders).
create policy "folders select own"
  on public.folders for select
  using (auth.uid() = owner_id);

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

-- files: owner-only CRUD. Sharing not built yet; when it lands, add a
-- security-definer function file_is_shared_with_me(p uuid) and reference it
-- here to avoid RLS recursion (files ↔ shared_items ↔ folders).
create policy "files select own"
  on public.files for select
  using (auth.uid() = owner_id);

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

-- shared_items: inserts/deletes by the item owner only. No select policy
-- until sharing is a real feature — keeps RLS non-recursive. When it lands,
-- add a security-definer function and a select policy that uses it.
create policy "shared_items insert by item owner"
  on public.shared_items for insert
  with check (
    exists (
      select 1 from public.folders f
        where f.id = shared_items.item_id and f.owner_id = auth.uid()
      union all
      select 1 from public.files fl
        where fl.id = shared_items.item_id and fl.owner_id = auth.uid()
    )
  );

create policy "shared_items delete by item owner"
  on public.shared_items for delete
  using (
    exists (
      select 1 from public.folders f
        where f.id = shared_items.item_id and f.owner_id = auth.uid()
      union all
      select 1 from public.files fl
        where fl.id = shared_items.item_id and fl.owner_id = auth.uid()
    )
  );

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