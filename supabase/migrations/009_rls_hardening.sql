-- Phase 1: RLS hardening sweep
-- Addresses multiple findings from the 2026-04-14 retroactive deep review:
--   * SPEC-001: trip_members self-recursive policies (latent planner-side footgun)
--   * SPEC-001: trips UPDATE missing WITH CHECK (created_by escalation)
--   * SPEC-001: trips DELETE restricted to creator only (silent no-op for co-planners)
--   * SPEC-007: trip_tasks viewer UPDATE allows any column (privilege expansion)
--   * SPEC-007: trip_tasks.assigned_to has no trip-member check
--   * SPEC-006: document camper_inventory's intentional shared-household model
-- Not addressed here (already fine per product decisions):
--   * recipes / packing_templates / task_templates SELECT using(true) — shared library, writes are already owner-only
--   * camper_inventory using(true) — intentional shared household

-- ============================================================
-- 1. Member-of-trip helper that takes an explicit user id
-- ============================================================
-- The existing `public.is_trip_member(uuid)` helper (migration 002) answers
-- "is the CURRENT user a member of this trip?" We need an additional form
-- that accepts a target user_id, for triggers that validate assignees.

create or replace function public.is_trip_member_of(_trip_id uuid, _user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.trip_members
    where trip_members.trip_id = _trip_id
      and trip_members.user_id = _user_id
  );
$$;

-- ============================================================
-- 2. Fix trip_members recursive RLS
-- ============================================================
-- Replace the self-referential policies with ones that delegate membership
-- checks to the security-definer helpers. Because the helpers bypass RLS
-- internally, there is no recursion on multi-row queries.

drop policy if exists "Trip members can view fellow members" on public.trip_members;
drop policy if exists "Planners can add trip members" on public.trip_members;
drop policy if exists "Planners can update member roles" on public.trip_members;
drop policy if exists "Planners can remove members" on public.trip_members;

-- SELECT: visible to anyone who is also a member of the same trip
create policy "trip_members_select"
  on public.trip_members for select
  to authenticated
  using (public.is_trip_member(trip_id));

-- INSERT: planners can add members, OR a trip creator can bootstrap their own
-- first membership (the chicken-and-egg case — no planner exists yet at the
-- moment the first membership row is inserted)
create policy "trip_members_insert"
  on public.trip_members for insert
  to authenticated
  with check (
    public.is_trip_planner(trip_id)
    or (
      user_id = auth.uid()
      and exists (
        select 1 from public.trips
        where trips.id = trip_id
          and trips.created_by = auth.uid()
      )
    )
  );

-- UPDATE: only planners can change roles
create policy "trip_members_update"
  on public.trip_members for update
  to authenticated
  using (public.is_trip_planner(trip_id))
  with check (public.is_trip_planner(trip_id));

-- DELETE: planners can remove members, but not the trip creator
create policy "trip_members_delete"
  on public.trip_members for delete
  to authenticated
  using (
    public.is_trip_planner(trip_id)
    and user_id != (
      select created_by from public.trips where trips.id = trip_id
    )
  );

-- ============================================================
-- 3. Fix trips UPDATE / DELETE policies
-- ============================================================
-- UPDATE: still planner-only, but add a trigger that prevents mutating
-- created_by (escalation surface that the old policy missed).
-- DELETE: broaden from "creator only" to "any planner" (product decision 4).

drop policy if exists "Planners can update trips" on public.trips;
drop policy if exists "Trip creator can delete trips" on public.trips;

create policy "trips_update_planner"
  on public.trips for update
  to authenticated
  using (public.is_trip_planner(id))
  with check (public.is_trip_planner(id));

create policy "trips_delete_planner"
  on public.trips for delete
  to authenticated
  using (public.is_trip_planner(id));

-- Prevent created_by from being changed on any update. RLS WITH CHECK can't
-- see the OLD row cleanly, so we enforce immutability in a trigger.
create or replace function public.enforce_trips_created_by_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.created_by is distinct from old.created_by then
    raise exception 'trips.created_by is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists trips_created_by_immutable on public.trips;
create trigger trips_created_by_immutable
  before update on public.trips
  for each row execute function public.enforce_trips_created_by_immutable();

-- ============================================================
-- 4. trip_tasks — lock down viewer update scope
-- ============================================================
-- The existing UPDATE policy allows viewers to mutate their own assigned tasks,
-- but doesn't restrict WHICH columns they may change. A viewer could rewrite
-- title/description/assigned_to/due_date/priority on a task assigned to them.
-- Fix via a BEFORE UPDATE trigger that rejects non-completion changes unless
-- the caller is a planner.

create or replace function public.enforce_trip_tasks_viewer_column_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Planners can change anything
  if public.is_trip_planner(new.trip_id) then
    return new;
  end if;

  -- Non-planners may only touch completion-related columns on a task
  -- they're assigned to.
  if new.assigned_to is null or new.assigned_to != auth.uid() then
    raise exception 'Only the assignee may modify this task';
  end if;

  if new.title is distinct from old.title
    or new.description is distinct from old.description
    or new.assigned_to is distinct from old.assigned_to
    or new.trip_id is distinct from old.trip_id
    or new.due_date is distinct from old.due_date
    or new.priority is distinct from old.priority
    or new.sort_order is distinct from old.sort_order
  then
    raise exception 'Viewers may only toggle completion on their assigned tasks';
  end if;

  return new;
end;
$$;

drop trigger if exists trip_tasks_enforce_viewer_scope on public.trip_tasks;
create trigger trip_tasks_enforce_viewer_scope
  before update on public.trip_tasks
  for each row execute function public.enforce_trip_tasks_viewer_column_scope();

-- ============================================================
-- 5. trip_tasks — assignee must be a trip member
-- ============================================================
create or replace function public.enforce_trip_tasks_assignee_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.assigned_to is not null
    and not public.is_trip_member_of(new.trip_id, new.assigned_to)
  then
    raise exception 'Task assignee % is not a member of trip %', new.assigned_to, new.trip_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trip_tasks_enforce_assignee_membership on public.trip_tasks;
create trigger trip_tasks_enforce_assignee_membership
  before insert or update of trip_id, assigned_to on public.trip_tasks
  for each row execute function public.enforce_trip_tasks_assignee_membership();

-- ============================================================
-- 6. trips.destination — add 500-char cap (EXP-001 edge case)
-- ============================================================
alter table public.trips
  add constraint trips_destination_length_check
  check (char_length(destination) between 1 and 500);

-- ============================================================
-- 7. Document camper_inventory's shared-household model
-- ============================================================
comment on table public.camper_inventory is
  'Shared household inventory. By design, all authenticated users in this '
  'deployment see and can mutate the same inventory rows. This is NOT a bug — '
  'it is an intentional product decision (2026-04-14) matching the single-'
  'family use case. If multi-tenant isolation is ever required, tighten the '
  'RLS policies to filter by created_by.';
