-- SPEC-009b.2: audit logging for the public guest-share surface.
--
-- Today the only anonymous entry point is get_shared_trip (migration 010),
-- and we have no record of who hit it or how often. This migration adds:
--   1. share_audit_log table with retention-friendly index on ts.
--   2. log_share_access RPC (SECURITY DEFINER, granted to anon) so the
--      anonymous shared page can write an entry without table-level grants.
--   3. purge_old_share_audit_log RPC for the 90-day retention sweep.
--
-- We deliberately store token_hash_prefix (first 8 hex chars of the SHA-256
-- hash), not the plaintext token or the full hash. The prefix is enough to
-- correlate suspicious patterns to a specific link without leaking the
-- token itself if the log table is ever exfiltrated.

-- ============================================================
-- 1. Table
-- ============================================================
create table public.share_audit_log (
  id uuid primary key default gen_random_uuid(),
  ts timestamptz not null default now(),
  event_type text not null
    check (event_type in ('view', 'not_found', 'rate_limited')),
  token_hash_prefix text, -- nullable: rate_limited events may not have a token
  ip text,
  user_agent text,
  request_path text,
  status int -- HTTP-ish status: 200, 404, 429, ...
);

-- Index used by both the dashboard ("recent events") and the purge sweep
-- ("delete where ts < now() - 90d"). Descending so the dashboard scan is
-- a simple index scan from the head.
create index share_audit_log_ts_idx on public.share_audit_log (ts desc);

-- RLS on. No anon SELECT; only the SECURITY DEFINER functions write.
alter table public.share_audit_log enable row level security;

-- Authenticated trip planners can read entries for their own trips' tokens.
-- (Token-hash-prefix isn't trip-scoped, so for now planners read all rows;
-- this is fine because the table doesn't contain trip data — just access
-- patterns. If we ever attach trip_id, tighten the policy then.)
create policy "share_audit_log_select_planner"
  on public.share_audit_log
  for select
  using (auth.uid() is not null);

-- ============================================================
-- 2. log_share_access: the only write path, granted to anon.
-- ============================================================
-- SECURITY DEFINER so the anonymous shared page can insert without needing
-- table-level INSERT grants on share_audit_log. search_path locked per
-- project convention (see migrations 012, 019).

create or replace function public.log_share_access(
  _event_type text,
  _token_hash_prefix text,
  _ip text,
  _user_agent text,
  _request_path text,
  _status int
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Validate the event_type at the function boundary too (defense in depth;
  -- the check constraint also catches it but we want a clear error message).
  if _event_type not in ('view', 'not_found', 'rate_limited') then
    raise exception 'Invalid share-audit event_type: %', _event_type;
  end if;

  -- Cap free-form text fields at 512 chars so a hostile UA / path cannot
  -- bloat the row. Truncation is silent — we are recording for forensics,
  -- not contractually preserving every byte.
  insert into public.share_audit_log (
    event_type, token_hash_prefix, ip, user_agent, request_path, status
  ) values (
    _event_type,
    nullif(left(_token_hash_prefix, 32), ''),
    nullif(left(_ip, 128), ''),
    nullif(left(_user_agent, 512), ''),
    nullif(left(_request_path, 512), ''),
    _status
  );
end;
$$;

grant execute on function public.log_share_access(text, text, text, text, text, int) to anon;
grant execute on function public.log_share_access(text, text, text, text, text, int) to authenticated;

-- ============================================================
-- 3. purge_old_share_audit_log: 90-day retention sweep.
-- ============================================================
-- Intended to be invoked from a Supabase scheduled function / pg_cron job.
-- Returns the number of rows deleted so the caller can log it.

create or replace function public.purge_old_share_audit_log()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted int;
begin
  delete from public.share_audit_log
  where ts < now() - interval '90 days';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- Only the service role / privileged callers should invoke the purge.
-- (No grant to anon or authenticated.)
