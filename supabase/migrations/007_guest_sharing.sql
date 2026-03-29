-- SPEC-009: Guest Sharing
-- Table: trip_share_links

-- ============================================================
-- TRIP SHARE LINKS
-- ============================================================
create table public.trip_share_links (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  token text unique not null default gen_random_uuid()::text,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now() not null,
  revoked_at timestamptz
);

alter table public.trip_share_links enable row level security;

-- Index on token for fast guest lookups
create index idx_trip_share_links_token on public.trip_share_links(token);
create index idx_trip_share_links_trip_id on public.trip_share_links(trip_id);

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- SELECT: planners of the trip can see all share links
create policy "trip_share_links_select_planner"
  on public.trip_share_links for select
  to authenticated
  using (public.is_trip_planner(trip_id));

-- SELECT: anonymous users can see active (non-revoked) links by token
create policy "trip_share_links_select_anon"
  on public.trip_share_links for select
  to anon
  using (revoked_at is null);

-- INSERT: only planners of the trip
create policy "trip_share_links_insert"
  on public.trip_share_links for insert
  to authenticated
  with check (public.is_trip_planner(trip_id));

-- DELETE: only planners of the trip
create policy "trip_share_links_delete"
  on public.trip_share_links for delete
  to authenticated
  using (public.is_trip_planner(trip_id));

-- UPDATE: only planners (for revoking via revoked_at)
create policy "trip_share_links_update"
  on public.trip_share_links for update
  to authenticated
  using (public.is_trip_planner(trip_id));
