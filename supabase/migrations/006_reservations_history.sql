-- SPEC-008: Reservations, Trip History & Memories
-- Tables: trip_reservations, trip_journal_entries
-- Storage: journal-photos bucket

-- ============================================================
-- TRIP RESERVATIONS
-- ============================================================
create table public.trip_reservations (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  campground_name text not null check (char_length(campground_name) >= 1),
  site_number text,
  confirmation_number text,
  check_in_date date,
  check_out_date date,
  check_in_time text,
  check_out_time text,
  cost numeric check (cost >= 0),
  contact_info text,
  notes text,
  sort_order int not null default 0,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.trip_reservations enable row level security;

create index idx_trip_reservations_trip_id on public.trip_reservations(trip_id);

-- ============================================================
-- TRIP JOURNAL ENTRIES
-- ============================================================
create table public.trip_journal_entries (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  content text not null check (char_length(content) >= 1),
  photo_urls text[] default '{}',
  created_by uuid references public.profiles(id),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.trip_journal_entries enable row level security;

create index idx_trip_journal_entries_trip_id on public.trip_journal_entries(trip_id);

-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================
create trigger set_trip_reservations_updated_at
  before update on public.trip_reservations
  for each row execute function public.update_updated_at();

create trigger set_trip_journal_entries_updated_at
  before update on public.trip_journal_entries
  for each row execute function public.update_updated_at();

-- ============================================================
-- RLS POLICIES: trip_reservations
-- ============================================================

-- SELECT: any trip member (planner or viewer)
create policy "trip_reservations_select"
  on public.trip_reservations for select
  to authenticated
  using (public.is_trip_member(trip_id));

-- INSERT: only planners
create policy "trip_reservations_insert"
  on public.trip_reservations for insert
  to authenticated
  with check (public.is_trip_planner(trip_id));

-- UPDATE: only planners
create policy "trip_reservations_update"
  on public.trip_reservations for update
  to authenticated
  using (public.is_trip_planner(trip_id));

-- DELETE: only planners
create policy "trip_reservations_delete"
  on public.trip_reservations for delete
  to authenticated
  using (public.is_trip_planner(trip_id));

-- ============================================================
-- RLS POLICIES: trip_journal_entries
-- ============================================================

-- SELECT: any trip member (planner or viewer)
create policy "trip_journal_entries_select"
  on public.trip_journal_entries for select
  to authenticated
  using (public.is_trip_member(trip_id));

-- INSERT: only planners
create policy "trip_journal_entries_insert"
  on public.trip_journal_entries for insert
  to authenticated
  with check (public.is_trip_planner(trip_id));

-- UPDATE: only planners
create policy "trip_journal_entries_update"
  on public.trip_journal_entries for update
  to authenticated
  using (public.is_trip_planner(trip_id));

-- DELETE: only planners
create policy "trip_journal_entries_delete"
  on public.trip_journal_entries for delete
  to authenticated
  using (public.is_trip_planner(trip_id));

-- ============================================================
-- STORAGE: journal-photos bucket
-- ============================================================
insert into storage.buckets (id, name, public)
values ('journal-photos', 'journal-photos', true);

-- Anyone can read journal photos (public bucket)
create policy "journal_photos_select"
  on storage.objects for select
  to public
  using (bucket_id = 'journal-photos');

-- Only trip planners can upload photos
create policy "journal_photos_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'journal-photos');

-- Only trip planners can delete photos
create policy "journal_photos_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'journal-photos');

-- ============================================================
-- REALTIME
-- ============================================================
alter publication supabase_realtime add table public.trip_reservations;
alter publication supabase_realtime add table public.trip_journal_entries;
