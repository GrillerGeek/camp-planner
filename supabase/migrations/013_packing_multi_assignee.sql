-- SPEC-004b.1: multi-assignee packing items.
--
-- Replaces trip_packing_items.assigned_to (uuid) with assignees (uuid[]).
-- The original single-assignee column violated EXP-007, which calls for
-- items assignable to multiple trip members ("tent setup" — both Jason
-- and Angie). Promoted out of the SPEC-004 retro's deferred list.
--
-- Migration order matters: backfill the new column, then rebuild every
-- object that references the old column, then drop the old column at
-- the end so each step compiles cleanly.

-- ============================================================
-- 1. Add the new column, default to empty array
-- ============================================================
alter table public.trip_packing_items
  add column if not exists assignees uuid[] not null default '{}';

-- ============================================================
-- 2. Backfill from the existing single-value column
-- ============================================================
update public.trip_packing_items
   set assignees = array[assigned_to]
 where assigned_to is not null
   and array_length(assignees, 1) is null;

-- ============================================================
-- 3. Replace the SPEC-002d.3 viewer policy + trigger
-- ============================================================
-- The 2026-05-17 viewer-checkoff work referenced assigned_to. With
-- assignees[] we use array containment instead.

drop policy if exists "Assignees can update their own packing items"
  on public.trip_packing_items;

create policy "Assignees can update their own packing items"
  on public.trip_packing_items for update
  to authenticated
  using (
    auth.uid() = any(assignees)
    and exists (
      select 1 from public.trip_packing_lists
      where trip_packing_lists.id = trip_packing_items.packing_list_id
        and public.is_trip_member(trip_packing_lists.trip_id)
    )
  )
  with check (
    auth.uid() = any(assignees)
    and exists (
      select 1 from public.trip_packing_lists
      where trip_packing_lists.id = trip_packing_items.packing_list_id
        and public.is_trip_member(trip_packing_lists.trip_id)
    )
  );

drop trigger if exists trip_packing_items_enforce_viewer_scope
  on public.trip_packing_items;

create or replace function public.enforce_trip_packing_items_viewer_column_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip_id uuid;
begin
  select trip_id into v_trip_id
  from public.trip_packing_lists
  where id = new.packing_list_id;

  -- Planners can change anything
  if public.is_trip_planner(v_trip_id) then
    return new;
  end if;

  -- Non-planners must be among the assignees
  if not (auth.uid() = any(new.assignees)) then
    raise exception 'Only an assignee may modify this item';
  end if;

  -- Non-planners may only toggle is_packed. Other column changes are
  -- rejected — including any mutation of the assignees array itself.
  if new.name is distinct from old.name
    or new.category is distinct from old.category
    or new.quantity is distinct from old.quantity
    or new.is_essential is distinct from old.is_essential
    or new.assignees is distinct from old.assignees
    or new.notes is distinct from old.notes
    or new.sort_order is distinct from old.sort_order
    or new.packing_list_id is distinct from old.packing_list_id
  then
    raise exception 'Viewers may only toggle is_packed on their assigned items';
  end if;

  return new;
end;
$$;

create trigger trip_packing_items_enforce_viewer_scope
  before update on public.trip_packing_items
  for each row execute function public.enforce_trip_packing_items_viewer_column_scope();

-- ============================================================
-- 4. Rebuild get_shared_trip for assignees[]
-- ============================================================
-- The old version joined profiles on pi.assigned_to. With assignees[]
-- we aggregate the names across all assignees, and the "assigned"
-- filter becomes "array is non-empty" instead of "assigned_to is not
-- null".

create or replace function public.get_shared_trip(_token_plaintext text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
  v_link public.trip_share_links;
  v_trip_id uuid;
  v_result jsonb;
begin
  if _token_plaintext is null or length(_token_plaintext) < 20 then
    return null;
  end if;

  v_hash := encode(extensions.digest(_token_plaintext::bytea, 'sha256'), 'hex');

  select * into v_link
  from public.trip_share_links
  where token_hash = v_hash
    and revoked_at is null;

  if not found then
    return null;
  end if;

  v_trip_id := v_link.trip_id;

  select jsonb_build_object(
    'trip', jsonb_build_object(
      'id', t.id,
      'name', t.name,
      'destination', t.destination,
      'start_date', t.start_date,
      'end_date', t.end_date,
      'campsite_info', t.campsite_info,
      'status', t.status
    ),
    'planner_name', coalesce(p.display_name, 'A planner'),
    'reservations', (
      select coalesce(
        jsonb_agg(jsonb_build_object(
          'id', r.id,
          'campground_name', r.campground_name,
          'site_number', r.site_number,
          'check_in_date', r.check_in_date,
          'check_out_date', r.check_out_date,
          'check_in_time', r.check_in_time,
          'check_out_time', r.check_out_time,
          'notes', r.notes
        ) order by r.check_in_date nulls last, r.sort_order),
        '[]'::jsonb
      )
      from public.trip_reservations r
      where r.trip_id = v_trip_id
    ),
    'meals', (
      select coalesce(
        jsonb_agg(jsonb_build_object(
          'id', m.id,
          'day_date', m.day_date,
          'meal_type', m.meal_type,
          'custom_meal_name', m.custom_meal_name,
          'notes', m.notes,
          'recipe_name', rec.name
        ) order by m.day_date, m.meal_type),
        '[]'::jsonb
      )
      from public.trip_meals m
      join public.trip_meal_plans mp on mp.id = m.meal_plan_id
      left join public.recipes rec on rec.id = m.recipe_id
      where mp.trip_id = v_trip_id
    ),
    'packing_items', (
      select coalesce(
        jsonb_agg(jsonb_build_object(
          'id', pi.id,
          'name', pi.name,
          'category', pi.category,
          'quantity', pi.quantity,
          'is_packed', pi.is_packed,
          'assigned_to_name', names.combined
        ) order by pi.category, pi.sort_order),
        '[]'::jsonb
      )
      from public.trip_packing_items pi
      join public.trip_packing_lists pl on pl.id = pi.packing_list_id
      left join lateral (
        select string_agg(p2.display_name, ', ' order by p2.display_name) as combined
        from unnest(pi.assignees) as aid
        left join public.profiles p2 on p2.id = aid
      ) names on true
      where pl.trip_id = v_trip_id
        and array_length(pi.assignees, 1) is not null
    ),
    'tasks', (
      select coalesce(
        jsonb_agg(jsonb_build_object(
          'id', tk.id,
          'title', tk.title,
          'description', tk.description,
          'assigned_to_name', prof.display_name,
          'due_date', tk.due_date,
          'priority', tk.priority,
          'is_completed', tk.is_completed
        ) order by tk.sort_order),
        '[]'::jsonb
      )
      from public.trip_tasks tk
      left join public.profiles prof on prof.id = tk.assigned_to
      where tk.trip_id = v_trip_id
        and tk.assigned_to is not null
    )
  ) into v_result
  from public.trips t
  left join public.profiles p on p.id = v_link.created_by
  where t.id = v_trip_id;

  return v_result;
end;
$$;

grant execute on function public.get_shared_trip(text) to anon;
grant execute on function public.get_shared_trip(text) to authenticated;

-- ============================================================
-- 5. Drop the old single-assignee column
-- ============================================================
alter table public.trip_packing_items
  drop column if exists assigned_to;

-- ============================================================
-- 6. Index for member-filter and assignee-scope checks
-- ============================================================
create index if not exists trip_packing_items_assignees_gin_idx
  on public.trip_packing_items using gin (assignees);
