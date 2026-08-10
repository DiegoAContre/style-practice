-- Per-user fixed-window rate limiter for the traffic-sensitive RPCs and
-- uploads. Safe to re-run (drop-if-exists + create-or-replace).
-- Tier 2 of the traffic-abuse hardening; Tier 1 (auth rate limits, storage
-- max file size, signup restriction) lives in the Supabase dashboard.

create schema if not exists private;

-- Fixed-window counter: one row per (action, key, window_start). The primary
-- key makes bump_rate's check-and-increment atomic under on conflict.
create table if not exists private.rate_limits (
  action       text        not null,
  key          text        not null, -- auth.uid()::text for per-user limits
  window_start timestamptz not null,
  count        int         not null default 0,
  primary key (action, key, window_start)
);

-- Increment the counter for (action, key) in the current fixed window of
-- p_window_seconds. Raises SQLSTATE 'RATEL' once the window count hits p_max.
-- Runs as security definer so RPCs (also definer) and the upload trigger can
-- both use it without a per-role grant dance.
-- ponytail: 24h sweep on every call (seq scan over a tiny table); swap to
--   pg_cron when rate_limits ever holds more than a few thousand rows.
create or replace function private.bump_rate(
  p_action text,
  p_key    text,
  p_max    int,
  p_window_seconds int
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window_start timestamptz;
  v_count int;
begin
  v_window_start := to_timestamp(
    (extract(epoch from now())::bigint / p_window_seconds) * p_window_seconds
  );

  insert into private.rate_limits (action, key, window_start, count)
  values (p_action, p_key, v_window_start, 1)
  on conflict (action, key, window_start)
  do update set count = private.rate_limits.count + 1
  where private.rate_limits.count < p_max
  returning count into v_count;

  if v_count is null then
    raise exception 'rate limit exceeded for %', p_action using errcode = 'RATEL';
  end if;

  delete from private.rate_limits
    where window_start < now() - interval '24 hours';
end;
$$;
revoke execute on function private.bump_rate(text, text, int, int)
  from public, anon, service_role;
grant execute on function private.bump_rate(text, text, int, int) to authenticated;

-- Server-side upload cap. Storage policies can't cleanly call a security
-- definer (see AGENTS.md), so the guard rides on the files-row insert that
-- always follows a storage upload. When it fires, Drive's existing blob
-- rollback path cleans up the orphan object.
create or replace function private.guard_file_upload()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.bump_rate('upload', new.owner_id::text, 60, 60);
  return new;
end;
$$;

drop trigger if exists guard_file_upload on public.files;
create trigger guard_file_upload
  before insert on public.files
  for each row execute procedure private.guard_file_upload();
