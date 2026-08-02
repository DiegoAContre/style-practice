-- Break RLS recursion: owner-only selects (sharing not built yet).
-- Recursion was: files select → subqueries shared_items → subqueries files → ∞ → 500.
-- When sharing lands, add security-definer functions file_is_shared_with_me /
-- folder_is_shared_with_me and reference them in the select policies.

-- files: owner-only select (no cross-table subquery)
drop policy if exists "files select own or shared" on public.files;
drop policy if exists "files select own" on public.files;
create policy "files select own"
  on public.files for select
  using (auth.uid() = owner_id);

-- folders: owner-only select (no cross-table subquery)
drop policy if exists "folders select own or shared" on public.folders;
drop policy if exists "folders select own" on public.folders;
create policy "folders select own"
  on public.folders for select
  using (auth.uid() = owner_id);

-- shared_items: drop the recursive select policy; keep insert/delete so the
-- table stays writable by item owners when sharing is built.
drop policy if exists "shared_items select as recipient or owner" on public.shared_items;

-- The insert/update/delete policies on files/folders have no subqueries and
-- are fine; recreate them idempotently in case any are missing.

-- files
drop policy if exists "files insert by owner" on public.files;
drop policy if exists "files update by owner" on public.files;
drop policy if exists "files delete by owner" on public.files;
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

-- folders
drop policy if exists "folders insert by owner" on public.folders;
drop policy if exists "folders update by owner" on public.folders;
drop policy if exists "folders delete by owner" on public.folders;
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

-- shared_items insert/delete (no select until sharing feature exists)
drop policy if exists "shared_items insert by item owner" on public.shared_items;
drop policy if exists "shared_items delete by item owner" on public.shared_items;
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

-- profiles (unchanged, already non-recursive)
drop policy if exists "profiles are readable by owner" on public.profiles;
drop policy if exists "profiles are updatable by owner" on public.profiles;
create policy "profiles are readable by owner"
  on public.profiles for select
  using (auth.uid() = id);
create policy "profiles are updatable by owner"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- storage.objects for bucket 'drive-files'
drop policy if exists "drive-files upload own" on storage.objects;
drop policy if exists "drive-files read own or shared" on storage.objects;
drop policy if exists "drive-files update own" on storage.objects;
drop policy if exists "drive-files delete own" on storage.objects;
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