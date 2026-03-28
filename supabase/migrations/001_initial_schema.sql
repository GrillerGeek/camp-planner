-- Camp Planner Initial Schema
-- Tables: profiles, trips, trip_members
-- RLS policies for multi-user access control

-- ============================================================
-- PROFILES (auto-created from auth.users)
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  avatar_url text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.profiles enable row level security;

-- Any authenticated user can read profiles (for displaying member names)
create policy "Profiles are viewable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

-- Users can insert their own profile
create policy "Users can insert their own profile"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

-- Users can update their own profile
create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ============================================================
-- TRIPS
-- ============================================================
create table public.trips (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  destination text not null,
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  campsite_info text,
  notes text,
  status text not null default 'planning' check (status in ('planning', 'active', 'completed')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.trips enable row level security;

-- Users can only see trips they are a member of
create policy "Trip members can view trips"
  on public.trips for select
  to authenticated
  using (
    exists (
      select 1 from public.trip_members
      where trip_members.trip_id = trips.id
      and trip_members.user_id = auth.uid()
    )
  );

-- Any authenticated user can create a trip
create policy "Authenticated users can create trips"
  on public.trips for insert
  to authenticated
  with check (created_by = auth.uid());

-- Only planners can update trips
create policy "Planners can update trips"
  on public.trips for update
  to authenticated
  using (
    exists (
      select 1 from public.trip_members
      where trip_members.trip_id = trips.id
      and trip_members.user_id = auth.uid()
      and trip_members.role = 'planner'
    )
  );

-- Only the creator can delete trips
create policy "Trip creator can delete trips"
  on public.trips for delete
  to authenticated
  using (created_by = auth.uid());

-- ============================================================
-- TRIP MEMBERS
-- ============================================================
create table public.trip_members (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'viewer' check (role in ('planner', 'viewer')),
  joined_at timestamptz default now() not null,
  unique (trip_id, user_id)
);

alter table public.trip_members enable row level security;

-- Members can see other members of their trips
create policy "Trip members can view fellow members"
  on public.trip_members for select
  to authenticated
  using (
    exists (
      select 1 from public.trip_members as my_membership
      where my_membership.trip_id = trip_members.trip_id
      and my_membership.user_id = auth.uid()
    )
  );

-- Only planners can add members
create policy "Planners can add trip members"
  on public.trip_members for insert
  to authenticated
  with check (
    exists (
      select 1 from public.trip_members as my_membership
      where my_membership.trip_id = trip_members.trip_id
      and my_membership.user_id = auth.uid()
      and my_membership.role = 'planner'
    )
    -- OR the user is creating their own membership (trip creator)
    or (
      user_id = auth.uid()
      and exists (
        select 1 from public.trips
        where trips.id = trip_members.trip_id
        and trips.created_by = auth.uid()
      )
    )
  );

-- Only planners can change roles
create policy "Planners can update member roles"
  on public.trip_members for update
  to authenticated
  using (
    exists (
      select 1 from public.trip_members as my_membership
      where my_membership.trip_id = trip_members.trip_id
      and my_membership.user_id = auth.uid()
      and my_membership.role = 'planner'
    )
  );

-- Planners can remove members (but not the creator)
create policy "Planners can remove members"
  on public.trip_members for delete
  to authenticated
  using (
    exists (
      select 1 from public.trip_members as my_membership
      where my_membership.trip_id = trip_members.trip_id
      and my_membership.user_id = auth.uid()
      and my_membership.role = 'planner'
    )
    and user_id != (
      select created_by from public.trips where trips.id = trip_members.trip_id
    )
  );

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update set
    email = excluded.email,
    display_name = coalesce(excluded.display_name, public.profiles.display_name),
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
    updated_at = now();
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Auto-update updated_at timestamp
create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.update_updated_at();

create trigger trips_updated_at
  before update on public.trips
  for each row execute function public.update_updated_at();
